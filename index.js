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

const headers = ['id', 'task', 'done', 'notes', 'updated_by', 'updated_at'];
const starterTasks = [
  ['pick-up-pushcart', 'Pick up pushcart, Trolly and basket', 'FALSE', '', '', ''],
  ['others-pick-up', 'Others for pick up (supplies and fixed assets)', 'FALSE', '', '', ''],
  ['water-connection', 'Water connection', 'FALSE', '', '', ''],
  ['high-value-showcase', 'High value show case for wines and liquor and canned goods', 'FALSE', '', '', ''],
  ['promo-gondola', 'Promo items gondola lacking 1', 'FALSE', '', '', ''],
  ['weighing-scale', 'Weighing scale', 'FALSE', '', '', ''],
  ['small-island-freezer', 'Patungan island freezer the small one', 'FALSE', '', '', ''],
  ['tnap-booth', 'TNAP booth', 'FALSE', '', '', ''],
  ['manager-workstation', 'Work station set up for Managers and Supervisors', 'FALSE', '', '', ''],
  ['fillrate', '100% Fillrate for Display and shelftag (we are behind 2 days already)', 'FALSE', '', '', ''],
  ['rfp-business-permit', 'Ron follow up RFP for business permit (already coordinated to Maam Emy yesterday)', 'FALSE', '', '', ''],
  ['borrow-opening-support', 'Borrow pushcart, Trolly and Basket to other stores for opening support (Chari, Sheila assess how many)', 'FALSE', '', '', ''],
  ['opening-budget', 'Follow up opening budget to Baby Grace Valido', 'FALSE', '', '', ''],
  ['checkout-refurbish', 'Checkout counter to finish refurbish tomorrow (No extension), POS to set up after. (Sheila monitor this)', 'FALSE', '', '', ''],
  ['scan-items', 'Once POS already set up, start scanning of items (all items must be scanned)', 'FALSE', '', '', ''],
  ['island-freezers-operational', 'Island freezers must be operational starting today - pick up lacking island freezers in Valenzuela', 'FALSE', '', '', ''],
  ['vip-priest', 'Ron to provide final list of VIP to invite in store opening. Find Priest also for Mass', 'FALSE', '', '', ''],
  ['store-cleaning', 'Continuous cleaning of store interior / exterior', 'FALSE', '', '', ''],
  ['parking-pressure-washer', 'Parking Area - clean with pressure washer', 'FALSE', '', '', ''],
  ['lamp-post-banners', 'After payment of business permit, creative team to start installation of lamp post banners with wood frame. Make sure LGU approval was already done. Creative team c/o Emil must prepare today the number of lamp post banners to install.', 'FALSE', '', '', ''],
  ['checkout-chain', 'Make sure Checkout counter must have chain', 'FALSE', '', '', ''],
  ['wine-liquor-showcase-deadline', 'Deadline for Wines and Liquor, Canned Meat high value glass showcase will be on Friday. Coordinate to Marifel for RS alignment', 'FALSE', '', '', ''],
  ['fresh-items-delivery', 'Delivery of Fresh items must be ongoing by now', 'FALSE', '', '', ''],
  ['backup-manpower', 'Prepare list of back up manpower', 'FALSE', '', '', ''],
  ['backup-cashiers-baggers', 'Cashiers and baggers', 'FALSE', '', '', ''],
  ['backup-sales-assistant', 'Sales Assistant', 'FALSE', '', '', ''],
  ['backup-supervisors', 'Supervisors', 'FALSE', '', '', ''],
  ['hbc-acrylic-fence', 'Acrylic fence at HBC', 'FALSE', '', '', '']
];

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
      .filter((key) => !process.env[key]);
    const error = new Error(`Missing Google Sheets config: ${missing.join(', ')}`);
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

function rowToItem(row, index) {
  return {
    rowNumber: index + 2,
    id: row[0] || `row-${index + 2}`,
    task: row[1] || '',
    done: isDone(row[2]),
    notes: row[3] || '',
    updatedBy: row[4] || '',
    updatedAt: row[5] || ''
  };
}

async function readItems(sheetName) {
  const sheets = sheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `'${sheetName}'!A2:F`
  });

  return (response.data.values || [])
    .map(rowToItem)
    .filter((item) => item.task.trim());
}

async function findItemRow(sheetName, id) {
  const items = await readItems(sheetName);
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
    missing: ['GOOGLE_SHEET_ID', 'GOOGLE_SERVICE_ACCOUNT_EMAIL', 'GOOGLE_PRIVATE_KEY'].filter((key) => !process.env[key])
  });
});

app.get('/api/items', async (req, res, next) => {
  try {
    const sheetName = selectedSheetName(req);
    res.json({ sheetName, items: await readItems(sheetName) });
  } catch (error) {
    next(error);
  }
});

app.post('/api/items/:id', async (req, res, next) => {
  try {
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

    res.json({ ok: true, sheetName, item: { ...item, done: Boolean(done), notes: notes || '', updatedBy: updatedBy || '', updatedAt } });
  } catch (error) {
    next(error);
  }
});

app.post('/api/seed', async (req, res, next) => {
  try {
    const sheetName = selectedSheetName(req);
    const sheets = sheetsClient();
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `'${sheetName}'!A1:F${starterTasks.length + 1}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [headers, ...starterTasks]
      }
    });

    res.json({ ok: true, sheetName, insertedRows: starterTasks.length });
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
  <title>Opening Checklist</title>
  <style>
    :root {
      --bg: #f5f6f2;
      --surface: #ffffff;
      --text: #20251f;
      --muted: #697368;
      --line: #dfe4da;
      --accent: #14684d;
      --accent-soft: #e6f2ec;
      --danger: #9d2d20;
      --amber: #996500;
      --shadow: 0 12px 32px rgba(24, 36, 28, .1);
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      font-family: Arial, Helvetica, sans-serif;
      color: var(--text);
      background: var(--bg);
    }

    header {
      position: sticky;
      top: 0;
      z-index: 10;
      border-bottom: 1px solid var(--line);
      background: rgba(245, 246, 242, .94);
      backdrop-filter: blur(12px);
    }

    .wrap {
      width: min(1160px, calc(100% - 32px));
      margin: 0 auto;
    }

    .top {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 20px;
      align-items: center;
      padding: 18px 0;
    }

    h1 {
      margin: 0;
      font-size: clamp(24px, 4vw, 40px);
      line-height: 1.05;
      letter-spacing: 0;
    }

    .sub {
      margin-top: 8px;
      color: var(--muted);
      font-size: 14px;
    }

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

    button, input {
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

    button.danger {
      border-color: #efc5bf;
      color: var(--danger);
    }

    input {
      width: 190px;
      padding: 0 11px;
    }

    .status {
      margin-bottom: 12px;
      padding: 12px 14px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--surface);
      color: var(--muted);
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
      padding: 14px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--surface);
      box-shadow: 0 1px 2px rgba(0, 0, 0, .03);
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
    }

    .item.done .title {
      color: var(--muted);
      text-decoration: line-through;
    }

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
      .top, .item {
        grid-template-columns: 1fr;
      }

      .meter {
        min-width: 0;
        text-align: left;
      }

      .group, .toolbar button, .toolbar input {
        width: 100%;
      }
    }
  </style>
</head>
<body>
  <header>
    <div class="wrap top">
      <div>
        <h1>Opening Checklist</h1>
        <div class="sub">Connected to Google Sheets as the editable raw data source.</div>
      </div>
      <div class="meter">
        <strong id="percent">0%</strong>
        <div id="count">Loading...</div>
        <div class="bar"><span id="bar"></span></div>
      </div>
    </div>
  </header>

  <main class="wrap">
    <div id="status" class="status">Loading checklist...</div>
    <div class="toolbar">
      <div class="group">
        <span id="sheetTabs" class="group"></span>
      </div>
      <div class="group">
        <button class="active" data-filter="all" type="button">All</button>
        <button data-filter="open" type="button">Open</button>
        <button data-filter="done" type="button">Done</button>
      </div>
      <div class="group">
        <input id="name" placeholder="Your name">
        <button id="refresh" class="primary" type="button">Refresh</button>
        <button id="seed" type="button">Seed Sheet</button>
      </div>
    </div>
    <section id="list" class="list" aria-label="Checklist"></section>
  </main>

  <div id="toast" class="toast" role="status" aria-live="polite"></div>

  <script>
    const list = document.getElementById('list');
    const statusBox = document.getElementById('status');
    const percent = document.getElementById('percent');
    const count = document.getElementById('count');
    const bar = document.getElementById('bar');
    const toast = document.getElementById('toast');
    const nameInput = document.getElementById('name');
    const sheetTabs = document.getElementById('sheetTabs');
    let items = [];
    let filter = 'all';
    let sheetNames = [];
    let currentSheet = localStorage.getItem('checklist-current-sheet') || '';

    nameInput.value = localStorage.getItem('checklist-user-name') || '';
    nameInput.addEventListener('input', () => localStorage.setItem('checklist-user-name', nameInput.value));

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

    function sheetQuery() {
      return '?sheet=' + encodeURIComponent(currentSheet);
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
          localStorage.setItem('checklist-current-sheet', currentSheet);
          renderSheetTabs();
          loadItems();
        });
        sheetTabs.append(button);
      });
    }

    function updateProgress() {
      const total = items.length;
      const done = items.filter((item) => item.done).length;
      const value = total ? Math.round((done / total) * 100) : 0;
      percent.textContent = value + '%';
      count.textContent = done + ' of ' + total + ' completed';
      bar.style.width = value + '%';
      document.title = value + '% - Opening Checklist';
    }

    function render() {
      list.innerHTML = '';
      items.forEach((item) => {
        const row = document.createElement('label');
        row.className = 'item' + (item.done ? ' done' : '');
        if (filter === 'open' && item.done) row.classList.add('hidden');
        if (filter === 'done' && !item.done) row.classList.add('hidden');

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
                updatedBy: nameInput.value.trim()
              })
            });
            await loadItems(false);
            showToast('Saved to Google Sheets.');
          } catch (error) {
            item.done = previous;
            render();
            showToast(error.message);
          }
        });

        const title = document.createElement('div');
        title.className = 'title';
        title.textContent = item.task;

        const meta = document.createElement('div');
        meta.className = 'meta';
        const notes = document.createElement('input');
        notes.placeholder = 'Notes';
        notes.value = item.notes || '';
        notes.addEventListener('change', async () => {
          item.notes = notes.value;
          try {
            await api('/api/items/' + encodeURIComponent(item.id) + sheetQuery(), {
              method: 'POST',
              body: JSON.stringify({
                done: item.done,
                notes: item.notes,
                updatedBy: nameInput.value.trim()
              })
            });
            await loadItems(false);
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
        row.append(checkbox, title, meta);
        list.append(row);
      });
      updateProgress();
    }

    async function loadItems(showMessage = true) {
      try {
        const config = await api('/api/config');
        if (!config.connected) {
          statusBox.className = 'status warn';
          statusBox.textContent = 'Google Sheets is not connected yet. Add GOOGLE_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, and GOOGLE_PRIVATE_KEY in Railway variables. Share the Google Sheet with the service account email.';
          count.textContent = 'Not connected';
          return;
        }

        sheetNames = config.sheetNames || [config.defaultSheetName || 'Checklist'];
        if (!sheetNames.includes(currentSheet)) currentSheet = config.defaultSheetName || sheetNames[0];
        localStorage.setItem('checklist-current-sheet', currentSheet);
        renderSheetTabs();

        const data = await api('/api/items' + sheetQuery());
        items = data.items;
        statusBox.className = 'status';
        statusBox.textContent = items.length
          ? 'Live sheet loaded from ' + currentSheet + '. Edit task names, add rows, or change raw values directly in Google Sheets.'
          : 'Connected to ' + currentSheet + ', but no rows found. Click Seed Sheet to add the default checklist.';
        render();
        if (showMessage) showToast('Loaded from Google Sheets.');
      } catch (error) {
        statusBox.className = 'status warn';
        statusBox.textContent = error.message;
      }
    }

    document.querySelectorAll('[data-filter]').forEach((button) => {
      button.addEventListener('click', () => {
        filter = button.dataset.filter;
        document.querySelectorAll('[data-filter]').forEach((entry) => entry.classList.remove('active'));
        button.classList.add('active');
        render();
      });
    });

    document.getElementById('refresh').addEventListener('click', () => loadItems());
    document.getElementById('seed').addEventListener('click', async () => {
      if (!confirm('Replace A1:F with the default checklist rows?')) return;
      try {
        await api('/api/seed' + sheetQuery(), { method: 'POST' });
        await loadItems(false);
        showToast('Sheet seeded.');
      } catch (error) {
        showToast(error.message);
      }
    });

    loadItems(false);
    setInterval(() => loadItems(false), 15000);
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
  console.log(`Opening checklist running on port ${port}`);
});
