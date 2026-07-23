const express = require('express');
const { google } = require('googleapis');

const app = express();
const port = process.env.PORT || 3000;

const SHEET_ID = parseSheetId(process.env.GOOGLE_SHEET_ID || 'https://docs.google.com/spreadsheets/d/1rBtctlB8jrvggwzUt2dQ8Jz_Vs7VOWimPXpIIyYmnkM/edit?gid=0#gid=0');
const SHEET_NAMES = (process.env.SHEET_NAMES || process.env.SHEET_NAME || 'Checklist,WorkPlan')
  .split(',')
  .map((name) => name.trim())
  .filter(Boolean);
const DEFAULT_SHEET_NAME = SHEET_NAMES[0] || 'Checklist';
const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '';
const PRIVATE_KEY = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const KNOWN_ASSIGNEES = (process.env.ASSIGNEE_NAMES || 'Janet,Karen,Russel,Joward')
  .split(',')
  .map((name) => name.trim())
  .filter(Boolean);
const SHEET_CACHE_MS = Number(process.env.SHEET_CACHE_MS || 45000);
const sheetCache = new Map();

app.use(express.json({ limit: '1mb' }));

function parseSheetId(value) {
  const trimmed = String(value || '').trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : trimmed;
}

function hasGoogleConfig() {
  return Boolean(SHEET_ID && SERVICE_ACCOUNT_EMAIL && PRIVATE_KEY);
}

function sheetsClient() {
  if (!hasGoogleConfig()) {
    const missing = ['GOOGLE_SHEET_ID', 'GOOGLE_SERVICE_ACCOUNT_EMAIL', 'GOOGLE_PRIVATE_KEY']
      .filter((key) => !process.env[key] && key !== 'GOOGLE_SHEET_ID');
    const error = new Error(`Missing Google Sheets write config: ${missing.join(', ')}`);
    error.statusCode = 500;
    throw error;
  }

  const auth = new google.auth.JWT({
    email: SERVICE_ACCOUNT_EMAIL,
    key: PRIVATE_KEY,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });

  return google.sheets({ version: 'v4', auth });
}

function selectedSheetName(req) {
  const requested = String(req.query.sheet || req.body?.sheet || DEFAULT_SHEET_NAME).trim();
  if (SHEET_NAMES.includes(requested)) return requested;

  const error = new Error(`Sheet tab is not allowed. Use one of: ${SHEET_NAMES.join(', ')}`);
  error.statusCode = 400;
  throw error;
}

function isDone(value) {
  return ['true', 'yes', 'y', '1', 'done', 'complete', 'completed'].includes(String(value || '').trim().toLowerCase());
}

function cleanName(value) {
  return String(value || '')
    .replace(/[.:;,-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function knownNameFrom(value) {
  const candidate = cleanName(value);
  return KNOWN_ASSIGNEES.find((name) => name.toLowerCase() === candidate.toLowerCase()) || '';
}

function extractAssignee(task) {
  const text = String(task || '').trim();
  const dashMatch = text.match(/[-–—]\s*([A-Za-z][A-Za-z .']{1,40})\s*$/);
  if (dashMatch) {
    const known = knownNameFrom(dashMatch[1]);
    if (known) return known;
  }

  const parentheticalMatches = [...text.matchAll(/\(([^()]+)\)/g)];
  for (let index = parentheticalMatches.length - 1; index >= 0; index -= 1) {
    const known = knownNameFrom(parentheticalMatches[index][1]);
    if (known) return known;
  }

  return 'Unassigned';
}

function isHeaderRow(row) {
  const normalized = row.map((cell) => String(cell || '').trim().toLowerCase());
  return normalized[0] === 'id' && normalized[1] === 'task';
}

function rowToItem(row, rowNumber) {
  const task = row[1] || '';
  return {
    rowNumber,
    id: String(row[0] || `row-${rowNumber}`).trim(),
    task,
    assignee: extractAssignee(task),
    done: isDone(row[2]),
    notes: row[3] || '',
    updatedBy: row[4] || '',
    updatedAt: row[5] || ''
  };
}

function rowsToItems(rows) {
  const offset = rows[0] && isHeaderRow(rows[0]) ? 2 : 1;
  const bodyRows = offset === 2 ? rows.slice(1) : rows;
  return bodyRows
    .map((row, index) => rowToItem(row, index + offset))
    .filter((item) => item.task.trim());
}

function parseCsv(csv) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    const next = csv[index + 1];

    if (character === '"' && quoted && next === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === ',' && !quoted) {
      row.push(value);
      value = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && next === '\n') index += 1;
      row.push(value);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      value = '';
    } else {
      value += character;
    }
  }

  row.push(value);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

async function readItems(sheetName, options = {}) {
  const cacheKey = sheetName;
  const cached = sheetCache.get(cacheKey);
  if (!options.force && cached && Date.now() - cached.time < SHEET_CACHE_MS) {
    return cached.items;
  }

  let items;
  if (!hasGoogleConfig()) {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
    const response = await fetch(url);
    if (!response.ok) {
      const error = new Error('Could not read the public Google Sheet.');
      error.statusCode = 502;
      throw error;
    }

    items = rowsToItems(parseCsv(await response.text()));
    sheetCache.set(cacheKey, { time: Date.now(), items });
    return items;
  }

  const sheets = sheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `'${sheetName}'!A:F`
  });

  items = rowsToItems(response.data.values || []);
  sheetCache.set(cacheKey, { time: Date.now(), items });
  return items;
}

async function findItemRow(sheetName, id) {
  const items = await readItems(sheetName, { force: true });
  const item = items.find((entry) => entry.id === id);
  if (!item) {
    const error = new Error('Task not found in Google Sheet.');
    error.statusCode = 404;
    throw error;
  }
  return item;
}

app.get('/api/config', (req, res) => {
  res.json({
    connected: hasGoogleConfig(),
    sheetNames: SHEET_NAMES,
    defaultSheetName: DEFAULT_SHEET_NAME,
    assigneeNames: KNOWN_ASSIGNEES,
    missing: ['GOOGLE_SERVICE_ACCOUNT_EMAIL', 'GOOGLE_PRIVATE_KEY'].filter((key) => !process.env[key])
  });
});

app.get('/api/items', async (req, res, next) => {
  try {
    const sheetName = selectedSheetName(req);
    const force = req.query.fresh === '1';
    res.json({ sheetName, items: await readItems(sheetName, { force }) });
  } catch (error) {
    next(error);
  }
});

app.post('/api/items/:id', async (req, res, next) => {
  try {
    if (!hasGoogleConfig()) {
      const error = new Error('The sheet is connected for viewing. Add the Google service account credentials to save updates from the app.');
      error.statusCode = 403;
      throw error;
    }

    const sheetName = selectedSheetName(req);
    const { done, notes, updatedBy } = req.body;
    const item = await findItemRow(sheetName, req.params.id);
    const updatedAt = new Date().toISOString();
    const sheets = sheetsClient();

    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `'${sheetName}'!C${item.rowNumber}:F${item.rowNumber}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[done ? 'TRUE' : 'FALSE', notes || '', updatedBy || '', updatedAt]]
      }
    });

    sheetCache.delete(sheetName);
    res.json({ ok: true, sheetName, item: { ...item, done: Boolean(done), notes: notes || '', updatedBy: updatedBy || '', updatedAt } });
  } catch (error) {
    next(error);
  }
});

app.get('/', (req, res) => {
  res.type('html').send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Store Opening Checklist</title>
  <style>
    :root {
      --bg: #f4f6f1;
      --surface: #ffffff;
      --text: #20251f;
      --muted: #697368;
      --line: #dfe4da;
      --accent: #14684d;
      --accent-soft: #e6f2ec;
      --gold: #c7932c;
      --ink: #24352f;
      --danger: #9d2d20;
      --amber: #996500;
      --shadow: 0 12px 32px rgba(24, 36, 28, .1);
    }

    * { box-sizing: border-box; }

    [hidden] { display: none !important; }

    body {
      margin: 0;
      font-family: Arial, Helvetica, sans-serif;
      color: var(--text);
      background: linear-gradient(180deg, rgba(20, 104, 77, .08), transparent 300px), var(--bg);
    }

    header {
      position: relative;
      z-index: 10;
      overflow: hidden;
      border-bottom: 1px solid rgba(20, 104, 77, .16);
      background: linear-gradient(135deg, rgba(20, 104, 77, .16), rgba(199, 147, 44, .12)), rgba(245, 246, 242, .96);
    }

    .wrap {
      width: min(1160px, calc(100% - 32px));
      margin: 0 auto;
    }

    .top {
      display: grid;
      grid-template-columns: 1fr minmax(230px, 330px) auto;
      gap: 24px;
      align-items: center;
      padding: 24px 0;
    }

    h1 {
      margin: 0;
      font-size: clamp(28px, 4vw, 46px);
      line-height: 1.05;
      letter-spacing: 0;
    }

    .headline {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 8px;
      color: var(--accent);
      font-size: 13px;
      font-weight: 700;
      text-transform: uppercase;
    }

    .headline::before {
      content: "";
      width: 28px;
      height: 3px;
      border-radius: 999px;
      background: var(--gold);
    }

    .visual {
      display: grid;
      gap: 10px;
      padding: 18px;
      border: 1px solid rgba(20, 104, 77, .16);
      border-radius: 8px;
      background: rgba(255, 255, 255, .72);
      box-shadow: 0 10px 28px rgba(24, 36, 28, .08);
    }

    .awning {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      height: 34px;
      overflow: hidden;
      border: 1px solid rgba(20, 104, 77, .16);
      border-radius: 8px 8px 3px 3px;
    }

    .awning span:nth-child(odd) { background: var(--accent); }
    .awning span:nth-child(even) { background: #f9fbf5; }

    .shelves {
      display: grid;
      gap: 7px;
      padding: 12px;
      border: 1px solid rgba(20, 104, 77, .14);
      border-radius: 4px;
      background: #fff;
    }

    .shelf {
      display: grid;
      grid-template-columns: 1.1fr .7fr 1.4fr .9fr;
      gap: 6px;
      height: 12px;
    }

    .shelf span { border-radius: 3px; background: #dfe8df; }
    .shelf span:nth-child(2) { background: #e7c878; }
    .shelf span:nth-child(3) { background: #88b6a3; }

    .meter {
      min-width: 230px;
      text-align: right;
    }

    .meter strong {
      display: block;
      font-size: 28px;
    }

    .bar {
      height: 10px;
      margin-top: 8px;
      overflow: hidden;
      border-radius: 999px;
      background: #dce3d8;
    }

    .bar span {
      display: block;
      width: 0;
      height: 100%;
      border-radius: inherit;
      background: var(--accent);
      transition: width .2s ease;
    }

    main { padding: 22px 0 42px; }

    .summary {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      margin-bottom: 14px;
    }

    .summary-card {
      min-height: 76px;
      padding: 14px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--surface);
      box-shadow: 0 1px 2px rgba(0, 0, 0, .03);
    }

    .summary-card span {
      display: block;
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
    }

    .summary-card strong {
      display: block;
      margin-top: 7px;
      font-size: 24px;
      color: var(--ink);
    }

    .toolbar {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 14px;
    }

    .group {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }

    button, select, input {
      min-height: 40px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--surface);
      color: var(--text);
      font: inherit;
      font-size: 14px;
    }

    button {
      padding: 0 13px;
      cursor: pointer;
    }

    select, input {
      padding: 0 11px;
    }

    button.active {
      border-color: var(--accent);
      background: var(--accent-soft);
      color: var(--accent);
      font-weight: 700;
    }

    button.primary {
      border-color: var(--accent);
      background: var(--accent);
      color: white;
    }

    .status {
      margin-bottom: 12px;
      padding: 10px 12px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: rgba(255, 255, 255, .7);
      color: var(--muted);
      font-size: 13px;
      line-height: 1.45;
    }

    .status.warn {
      border-color: #ead7a7;
      background: #fff8e6;
      color: var(--amber);
    }

    .list {
      display: grid;
      gap: 10px;
    }

    .item {
      display: grid;
      grid-template-columns: 28px 1fr minmax(180px, 240px);
      gap: 12px;
      align-items: start;
      min-height: 64px;
      padding: 16px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--surface);
      box-shadow: 0 4px 14px rgba(24, 36, 28, .05);
    }

    .item::before {
      content: "";
      grid-column: 1 / -1;
      height: 3px;
      margin: -16px -16px 0;
      border-radius: 8px 8px 0 0;
      background: linear-gradient(90deg, var(--accent), var(--gold));
      opacity: .22;
    }

    .item.hidden { display: none; }

    .item input[type="checkbox"] {
      width: 22px;
      height: 22px;
      margin: 2px 0 0;
      accent-color: var(--accent);
      cursor: pointer;
    }

    .title {
      line-height: 1.35;
      overflow-wrap: anywhere;
      cursor: pointer;
    }

    .person {
      display: inline-block;
      margin-top: 8px;
      padding: 4px 8px;
      border-radius: 999px;
      background: var(--accent-soft);
      color: var(--accent);
      font-size: 12px;
      font-weight: 700;
    }

    .item.done .title {
      color: var(--muted);
      text-decoration: line-through;
    }

    .item.done::before { opacity: .65; }

    .meta {
      display: grid;
      gap: 6px;
    }

    .meta input {
      width: 100%;
      min-height: 34px;
      font-size: 13px;
    }

    .small {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.3;
    }

    .person-summary {
      display: grid;
      gap: 12px;
    }

    .person-card {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--surface);
      box-shadow: 0 4px 14px rgba(24, 36, 28, .05);
      overflow: hidden;
    }

    .person-head {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 10px;
      align-items: center;
      padding: 14px 16px;
      border-bottom: 1px solid var(--line);
      background: #fbfcf8;
    }

    .person-head h2 {
      margin: 0;
      font-size: 18px;
      letter-spacing: 0;
    }

    .person-head span {
      color: var(--muted);
      font-size: 13px;
      white-space: nowrap;
    }

    .mini-bar {
      grid-column: 1 / -1;
      height: 8px;
      overflow: hidden;
      border-radius: 999px;
      background: #dce3d8;
    }

    .mini-bar span {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: var(--accent);
    }

    .person-tasks {
      margin: 0;
      padding: 12px 16px 14px 34px;
      line-height: 1.45;
    }

    .person-tasks li {
      margin: 6px 0;
    }

    .person-tasks li.done {
      color: var(--muted);
      text-decoration: line-through;
    }

    .toast {
      position: fixed;
      right: 18px;
      bottom: 18px;
      max-width: min(380px, calc(100vw - 36px));
      padding: 12px 14px;
      border-radius: 8px;
      background: #1e2420;
      color: #fff;
      box-shadow: var(--shadow);
      opacity: 0;
      transform: translateY(10px);
      pointer-events: none;
      transition: .2s ease;
      font-size: 14px;
    }

    .toast.show {
      opacity: 1;
      transform: translateY(0);
    }

    @media (max-width: 760px) {
      .top, .item, .summary, .person-head {
        grid-template-columns: 1fr;
      }

      .meter {
        min-width: 0;
        text-align: left;
      }

      .group, .toolbar button, .toolbar select {
        width: 100%;
      }
    }
  </style>
</head>
<body>
  <header>
    <div class="wrap top">
      <div>
        <div class="headline">Operations Board</div>
        <h1>Store Opening Checklist</h1>
      </div>
      <div class="visual" aria-hidden="true">
        <div class="awning"><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div>
        <div class="shelves">
          <div class="shelf"><span></span><span></span><span></span><span></span></div>
          <div class="shelf"><span></span><span></span><span></span><span></span></div>
          <div class="shelf"><span></span><span></span><span></span><span></span></div>
        </div>
      </div>
      <div class="meter">
        <strong id="percent">0%</strong>
        <div id="count">Loading...</div>
        <div class="bar"><span id="bar"></span></div>
      </div>
    </div>
  </header>

  <main class="wrap">
    <section class="summary" aria-label="Checklist summary">
      <div class="summary-card"><span>Active Sheet</span><strong id="activeSheet">Checklist</strong></div>
      <div class="summary-card"><span>Open Tasks</span><strong id="openTasks">0</strong></div>
      <div class="summary-card"><span>Done Tasks</span><strong id="doneTasks">0</strong></div>
    </section>
    <div id="status" class="status">Loading checklist...</div>
    <div class="toolbar">
      <div class="group">
        <span id="sheetTabs" class="group"></span>
      </div>
      <div class="group">
        <button class="active" data-view="tasks" type="button">Task Board</button>
        <button data-view="people" type="button">Person Summary</button>
      </div>
      <div class="group" id="taskFilters">
        <button class="active" data-filter="all" type="button">All</button>
        <button data-filter="open" type="button">Open</button>
        <button data-filter="done" type="button">Done</button>
        <select id="assigneeFilter" aria-label="Filter by assigned person">
          <option value="all">All assigned persons</option>
        </select>
      </div>
      <div class="group">
        <button id="refresh" class="primary" type="button">Refresh</button>
      </div>
    </div>
    <section id="list" class="list" aria-label="Checklist"></section>
    <section id="personSummary" class="person-summary" aria-label="Person Summary" hidden></section>
  </main>

  <div id="toast" class="toast" role="status" aria-live="polite"></div>

  <script>
    const list = document.getElementById('list');
    const personSummary = document.getElementById('personSummary');
    const taskFilters = document.getElementById('taskFilters');
    const statusBox = document.getElementById('status');
    const percent = document.getElementById('percent');
    const count = document.getElementById('count');
    const bar = document.getElementById('bar');
    const toast = document.getElementById('toast');
    const sheetTabs = document.getElementById('sheetTabs');
    const assigneeFilter = document.getElementById('assigneeFilter');
    const activeSheet = document.getElementById('activeSheet');
    const openTasks = document.getElementById('openTasks');
    const doneTasks = document.getElementById('doneTasks');
    let items = [];
    let filter = 'all';
    let view = 'tasks';
    let selectedAssignee = 'all';
    let sheetNames = [];
    let currentSheet = new URLSearchParams(window.location.search).get('sheet') || '';
    let appConfig = null;

    function showToast(message) {
      toast.textContent = message;
      toast.classList.add('show');
      clearTimeout(showToast.timer);
      showToast.timer = setTimeout(() => toast.classList.remove('show'), 2200);
    }

    async function api(path, options) {
      const response = await fetch(path, {
        headers: { 'Content-Type': 'application/json' },
        ...options
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Request failed');
      return data;
    }

    function sheetQuery(force = false) {
      return '?sheet=' + encodeURIComponent(currentSheet) + (force ? '&fresh=1' : '');
    }

    async function config() {
      if (!appConfig) appConfig = await api('/api/config');
      return appConfig;
    }

    function personNames() {
      return [...new Set(items.map((item) => item.assignee || 'Unassigned'))].sort((a, b) => {
        if (a === 'Unassigned') return 1;
        if (b === 'Unassigned') return -1;
        return a.localeCompare(b);
      });
    }

    function renderAssigneeFilter() {
      const names = personNames();
      if (selectedAssignee !== 'all' && !names.includes(selectedAssignee)) selectedAssignee = 'all';
      assigneeFilter.innerHTML = '<option value="all">All assigned persons</option>';
      names.forEach((name) => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        option.selected = selectedAssignee === name;
        assigneeFilter.append(option);
      });
    }

    function renderSheetTabs() {
      sheetTabs.innerHTML = '';
      sheetNames.forEach((sheetName) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = sheetName;
        button.className = sheetName === currentSheet ? 'active' : '';
        button.addEventListener('click', () => {
          currentSheet = sheetName;
          selectedAssignee = 'all';
          const url = new URL(window.location.href);
          url.searchParams.set('sheet', currentSheet);
          window.history.replaceState({}, '', url);
          renderSheetTabs();
          loadItems();
        });
        sheetTabs.append(button);
      });
    }

    function updateProgress() {
      const total = items.length;
      const done = items.filter((item) => item.done).length;
      const open = total - done;
      const value = total ? Math.round((done / total) * 100) : 0;
      percent.textContent = value + '%';
      count.textContent = done + ' of ' + total + ' completed';
      activeSheet.textContent = currentSheet || 'Checklist';
      openTasks.textContent = open;
      doneTasks.textContent = done;
      bar.style.width = value + '%';
      document.title = value + '% - Store Opening Checklist';
    }

    function filteredItems() {
      return items.filter((item) => {
        if (filter === 'open' && item.done) return false;
        if (filter === 'done' && !item.done) return false;
        if (selectedAssignee !== 'all' && item.assignee !== selectedAssignee) return false;
        return true;
      });
    }

    function renderTasks() {
      list.innerHTML = '';
      filteredItems().forEach((item) => {
        const row = document.createElement('div');
        row.className = 'item' + (item.done ? ' done' : '');

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = item.done;
        checkbox.addEventListener('change', async () => {
          const previous = item.done;
          item.done = checkbox.checked;
          render();
          try {
            await api('/api/items/' + encodeURIComponent(item.id) + sheetQuery(), {
              method: 'POST',
              body: JSON.stringify({
                done: item.done,
                notes: item.notes,
                updatedBy: 'Checklist App'
              })
            });
            item.updatedBy = 'Checklist App';
            item.updatedAt = new Date().toISOString();
            render();
            showToast('Saved to Google Sheets.');
          } catch (error) {
            item.done = previous;
            render();
            showToast(error.message);
          }
        });

        const content = document.createElement('div');
        const title = document.createElement('div');
        title.className = 'title';
        title.textContent = item.task;
        title.addEventListener('click', () => checkbox.click());

        const person = document.createElement('span');
        person.className = 'person';
        person.textContent = item.assignee || 'Unassigned';
        content.append(title, person);

        const meta = document.createElement('div');
        meta.className = 'meta';
        const notes = document.createElement('input');
        notes.placeholder = 'Notes';
        notes.value = item.notes || '';
        notes.addEventListener('change', async () => {
          item.notes = notes.value;
          try {
            const result = await api('/api/items/' + encodeURIComponent(item.id) + sheetQuery(), {
              method: 'POST',
              body: JSON.stringify({
                done: item.done,
                notes: item.notes,
                updatedBy: 'Checklist App'
              })
            });
            if (result.item) {
              item.notes = result.item.notes;
              item.updatedBy = result.item.updatedBy;
              item.updatedAt = result.item.updatedAt;
            }
            render();
            showToast('Note saved.');
          } catch (error) {
            showToast(error.message);
          }
        });

        const small = document.createElement('div');
        small.className = 'small';
        small.textContent = item.updatedAt
          ? 'Updated by ' + (item.updatedBy || 'Team') + ' - ' + new Date(item.updatedAt).toLocaleString()
          : 'Not updated yet';

        meta.append(notes, small);
        row.append(checkbox, content, meta);
        list.append(row);
      });

      if (!list.children.length) {
        const empty = document.createElement('div');
        empty.className = 'status';
        empty.textContent = 'No tasks match the current filters.';
        list.append(empty);
      }
    }

    function groupedPeople() {
      return personNames().map((name) => {
        const personItems = items.filter((item) => item.assignee === name);
        const done = personItems.filter((item) => item.done).length;
        return {
          name,
          items: personItems,
          done,
          open: personItems.length - done,
          total: personItems.length,
          percent: personItems.length ? Math.round((done / personItems.length) * 100) : 0
        };
      });
    }

    function renderPersonSummary() {
      personSummary.innerHTML = '';
      groupedPeople().forEach((person) => {
        const card = document.createElement('article');
        card.className = 'person-card';

        const head = document.createElement('div');
        head.className = 'person-head';
        const title = document.createElement('h2');
        title.textContent = person.name;
        const stats = document.createElement('span');
        stats.textContent = person.done + '/' + person.total + ' done - ' + person.open + ' open';
        const mini = document.createElement('div');
        mini.className = 'mini-bar';
        const fill = document.createElement('span');
        fill.style.width = person.percent + '%';
        mini.append(fill);
        head.append(title, stats, mini);

        const tasks = document.createElement('ul');
        tasks.className = 'person-tasks';
        person.items.forEach((item) => {
          const task = document.createElement('li');
          task.className = item.done ? 'done' : '';
          task.textContent = item.task;
          tasks.append(task);
        });

        card.append(head, tasks);
        personSummary.append(card);
      });
    }

    function setVisible(element, visible) {
      element.hidden = !visible;
      element.style.display = visible ? '' : 'none';
    }

    function render() {
      renderAssigneeFilter();
      updateProgress();
      setVisible(list, view === 'tasks');
      setVisible(personSummary, view === 'people');
      setVisible(taskFilters, view === 'tasks');
      if (view === 'tasks') renderTasks();
      if (view === 'people') renderPersonSummary();
    }

    async function loadItems(showMessage = true, force = false) {
      try {
        const cfg = await config();
        sheetNames = cfg.sheetNames || [cfg.defaultSheetName || 'Checklist'];
        if (!sheetNames.includes(currentSheet)) currentSheet = cfg.defaultSheetName || sheetNames[0];
        renderSheetTabs();

        const data = await api('/api/items' + sheetQuery(force));
        items = data.items;
        statusBox.className = 'status';
        statusBox.textContent = items.length
          ? currentSheet + ' loaded. Changes in Google Sheets appear here automatically.'
          : 'No rows found in ' + currentSheet + '. Add tasks directly in Google Sheets.';
        render();
        if (showMessage) showToast('Loaded from Google Sheets.');
      } catch (error) {
        statusBox.className = 'status warn';
        statusBox.textContent = error.message;
      }
    }

    document.addEventListener('click', (event) => {
      const viewButton = event.target.closest('[data-view]');
      if (viewButton) {
        view = viewButton.dataset.view;
        document.querySelectorAll('[data-view]').forEach((entry) => entry.classList.remove('active'));
        viewButton.classList.add('active');
        render();
        return;
      }

      const filterButton = event.target.closest('[data-filter]');
      if (filterButton) {
        filter = filterButton.dataset.filter;
        document.querySelectorAll('[data-filter]').forEach((entry) => entry.classList.remove('active'));
        filterButton.classList.add('active');
        render();
      }
    });

    document.addEventListener('change', (event) => {
      if (event.target === assigneeFilter) {
        selectedAssignee = assigneeFilter.value;
        render();
      }
    });

    document.getElementById('refresh').addEventListener('click', () => loadItems(true, true));

    loadItems(false);
    setInterval(() => loadItems(false), 60000);
  </script>
</body>
</html>`);
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(error.statusCode || 500).json({
    message: error.message || 'Server error'
  });
});

app.listen(port, () => {
  console.log(`Store opening checklist running on port ${port}`);
});
