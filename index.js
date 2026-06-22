const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'carl@17';

app.use(express.json({ limit: '5mb' }));

const SEED_DATA = {
  lists: [
    {
      id: 'congressional',
      name: 'Congressional - June 22 Pre-Opening Checklist',
      items: [
        { id: 'i1',  text: 'Recorida starting today (vehicle with speaker)', pic: '', completed: false, remarks: '' },
        { id: 'i2',  text: 'Audio jack for Customer Service PC to connect to Paging system amplifier', pic: '', completed: false, remarks: '' },
        { id: 'i3',  text: 'Music for Customer Service PC must be installed/saved today', pic: 'Chari', completed: false, remarks: '' },
        { id: 'i4',  text: 'USB extension for POS scanner — scanner must be placed inside the scanner enclosure', pic: '', completed: false, remarks: '' },
        { id: 'i5',  text: 'High value cage for Wines / Liquor and Canned meat', pic: 'Sheil / Earl', completed: false, remarks: '' },
        { id: 'i6',  text: 'Entrance door mat', pic: 'Chari', completed: false, remarks: '' },
        { id: 'i7',  text: 'Ice for meat show case — must be ready today', pic: 'Sheila', completed: false, remarks: '' },
        { id: 'i8',  text: 'Refill water tank by 4e', pic: 'Sheila to monitor', completed: false, remarks: '' },
        { id: 'i9',  text: 'Prepare complete list of manpower (including back up from other stores) and work plan for tomorrow with schedule', pic: 'Sheila', completed: false, remarks: '' },
        { id: 'i10', text: 'VIP invitees confirmation', pic: 'Chari / Ron', completed: false, remarks: '' },
        { id: 'i11', text: 'Priest confirmation — what time will arrive? Mass start at 7am', pic: 'Chari / Ron', completed: false, remarks: '' },
        { id: 'i12', text: 'Final cleaning of Parking Area tonight with pressure washer', pic: 'Chari', completed: false, remarks: '' },
        { id: 'i13', text: 'Parking area must be clean and organized — remove scrap/materials from contractor until 1pm', pic: 'Chari', completed: false, remarks: '' },
        { id: 'i14', text: 'Final cleaning of checkout counter — stainless part must be shiny and no stain', pic: 'Ecilda', completed: false, remarks: '' },
        { id: 'i15', text: 'Trade test schedule of POS today', pic: 'Ecilda', completed: false, remarks: '' },
        { id: 'i16', text: 'Set up deadline at 5pm for all department (except fresh) for thorough cleaning of the store', pic: 'Sheila to monitor', completed: false, remarks: '' },
        { id: 'i17', text: 'Prepare tables and chairs this evening for mass tomorrow morning', pic: 'Chari', completed: false, remarks: '' },
        { id: 'i18', text: 'Check red light in checkout counter if functioning including the counter number', pic: 'Ecilda', completed: false, remarks: '' },
        { id: 'i19', text: 'Prepare checkout supplies (POS journal/thermal, packaging tape tan, plastic twin, plastic bags, eco bag, etc.) — borrow from other store today if lacking', pic: 'Sheila', completed: false, remarks: '' },
        { id: 'i20', text: 'Motorcade personnel to finalize today based on budget, start of motorcade 7am', pic: '', completed: false, remarks: '' },
        { id: 'i21', text: 'Prepare candles with handle or cover for tomorrow blessings — assess quantity', pic: 'Ron', completed: false, remarks: '' },
        { id: 'i22', text: 'Prepare food for VIP tomorrow based on budget, assign supervisor to distribute (VIP/Visitors only)', pic: '', completed: false, remarks: '' },
        { id: 'i23', text: 'Make sure Display and Shelftag already at 100% fillrate', pic: 'Joem', completed: false, remarks: '' },
        { id: 'i24', text: 'Finalize preparation of Promo items today — mechanics/signages must be printed and posted. Ensure proper dissemination especially at checkout', pic: 'Joem', completed: false, remarks: '' },
        { id: 'i25', text: 'Prepare Ribbon cutting materials today, 10pcs scissors required', pic: 'Ron', completed: false, remarks: '' },
        { id: 'i26', text: 'Flowers to ensure delivery early in the morning (6am if possible or earlier) before the mass', pic: 'Ron', completed: false, remarks: '' },
        { id: 'i27', text: 'Sound system to deliver and set up tonight or early morning tomorrow before the mass', pic: 'Ron', completed: false, remarks: '' },
        { id: 'i28', text: 'Check tarpaulin/topload for tricycle if already installed', pic: 'Sheila', completed: false, remarks: '' },
        { id: 'i29', text: 'Air dancer (2 units) must be picked up/delivered today from Valenzuela and installed tomorrow morning, both sides in front', pic: 'Joem', completed: false, remarks: '' }
      ]
    }
  ]
};

let data;

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
      return;
    }
  } catch (e) {
    console.error('Load error:', e.message);
  }
  data = SEED_DATA;
  saveData();
}

function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Save error:', e.message);
  }
}

loadData();

// Auth middleware — admin password required
function requireAuth(req, res, next) {
  var pass = req.headers['x-admin-pass'];
  if (pass !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid password' });
  }
  next();
}

// API
app.get('/api/data', (req, res) => res.json(data));

// Verify password (used by client to validate before storing in sessionStorage)
app.post('/api/verify', (req, res) => {
  if ((req.body && req.body.password) === ADMIN_PASSWORD) return res.json({ ok: true });
  return res.status(401).json({ error: 'Invalid password' });
});

// PROTECTED: full data save (add/edit/delete items, list management)
app.post('/api/data', requireAuth, (req, res) => {
  if (!req.body || !Array.isArray(req.body.lists)) {
    return res.status(400).json({ error: 'Invalid payload' });
  }
  data = { lists: req.body.lists };
  saveData();
  res.json({ ok: true });
});

// OPEN: toggle completed (anyone on the team can mark progress)
app.post('/api/check', (req, res) => {
  var listId = req.body && req.body.listId;
  var itemId = req.body && req.body.itemId;
  var completed = !!(req.body && req.body.completed);
  var list = data.lists.find(function(l) { return l.id === listId; });
  if (!list) return res.status(404).json({ error: 'List not found' });
  var item = list.items.find(function(i) { return i.id === itemId; });
  if (!item) return res.status(404).json({ error: 'Item not found' });
  item.completed = completed;
  saveData();
  res.json({ ok: true });
});

// OPEN: update remarks (anyone can add update notes)
app.post('/api/remarks', (req, res) => {
  var listId = req.body && req.body.listId;
  var itemId = req.body && req.body.itemId;
  var remarks = (req.body && req.body.remarks) || '';
  var list = data.lists.find(function(l) { return l.id === listId; });
  if (!list) return res.status(404).json({ error: 'List not found' });
  var item = list.items.find(function(i) { return i.id === itemId; });
  if (!item) return res.status(404).json({ error: 'Item not found' });
  item.remarks = String(remarks).slice(0, 2000);
  saveData();
  res.json({ ok: true });
});

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Store Opening Checklist</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f4f5f7; color: #222; padding-bottom: 40px; }
  .topbar { background: #1B5E20; color: #fff; padding: 14px 18px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
  .topbar h1 { font-size: 17px; font-weight: 600; }
  .topbar .right { display: flex; gap: 10px; align-items: center; }
  .topbar .by { font-size: 11px; opacity: 0.9; }
  .topbar .lock { background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.3); color: #fff; font-size: 11px; padding: 5px 10px; border-radius: 14px; cursor: pointer; font-weight: 600; }
  .topbar .lock.unlocked { background: #c8e6c9; color: #1B5E20; border-color: #c8e6c9; }
  .container { max-width: 900px; margin: 0 auto; padding: 14px; }
  .listSelector { background: #fff; padding: 10px 12px; border-radius: 8px; margin-bottom: 10px; display: flex; gap: 8px; align-items: center; }
  .listSelector label { font-size: 12px; color: #555; font-weight: 600; }
  .listSelector select { flex: 1; padding: 8px; border: 1px solid #ccc; border-radius: 6px; font-size: 14px; background: #fff; }
  .progress { background: #fff; padding: 12px; border-radius: 8px; margin-bottom: 10px; }
  .progress .label { font-size: 12px; color: #555; margin-bottom: 6px; display: flex; justify-content: space-between; }
  .progress .label .pct { color: #1B5E20; font-weight: bold; }
  .progress .bar { background: #e0e0e0; border-radius: 6px; height: 10px; overflow: hidden; }
  .progress .fill { background: linear-gradient(90deg, #1B5E20, #2E7D32); height: 100%; transition: width 0.3s; }
  .tabs { display: flex; background: #fff; border-radius: 8px; overflow: hidden; margin-bottom: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
  .tab { flex: 1; padding: 12px 6px; text-align: center; cursor: pointer; font-size: 12px; font-weight: 600; border-bottom: 3px solid transparent; color: #555; user-select: none; }
  .tab.active { color: #1B5E20; border-bottom-color: #1B5E20; background: #f0f9f0; }
  .tab .count { font-size: 11px; background: #ddd; color: #444; padding: 1px 6px; border-radius: 8px; margin-left: 4px; }
  .tab.active .count { background: #1B5E20; color: #fff; }
  .item { background: #fff; border-radius: 8px; padding: 12px; margin-bottom: 8px; box-shadow: 0 1px 2px rgba(0,0,0,0.06); border-left: 4px solid #1B5E20; }
  .item.done { opacity: 0.7; background: #fafafa; border-left-color: #aaa; }
  .item .row { display: flex; gap: 10px; align-items: flex-start; }
  .item .check { width: 22px; height: 22px; flex-shrink: 0; cursor: pointer; accent-color: #1B5E20; margin-top: 2px; }
  .item .body { flex: 1; min-width: 0; }
  .item .text { font-size: 14px; line-height: 1.45; word-wrap: break-word; }
  .item.done .text { text-decoration: line-through; color: #777; }
  .item .pic { display: inline-block; background: #1B5E20; color: #fff; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 10px; margin-top: 6px; }
  .item .pic.empty { background: #bbb; }
  .item .actions { display: flex; gap: 2px; flex-shrink: 0; }
  .item .actions button { background: none; border: none; cursor: pointer; padding: 4px 6px; font-size: 15px; color: #666; border-radius: 4px; }
  .item .actions button:hover { background: #f0f0f0; }
  .item .remarks { margin-top: 10px; }
  .item .remarks textarea { width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 6px; font-size: 13px; resize: vertical; min-height: 38px; font-family: inherit; }
  .item .remarks textarea:focus { border-color: #1B5E20; outline: none; }
  .addItem { background: #fff; border-radius: 8px; padding: 14px; margin-top: 14px; border: 2px dashed #1B5E20; }
  .addItem h3 { font-size: 13px; color: #1B5E20; margin-bottom: 8px; font-weight: 700; }
  .addItem .hint { font-size: 11px; color: #888; margin-bottom: 8px; line-height: 1.4; }
  .addItem input { width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 6px; font-size: 14px; margin-bottom: 8px; }
  .addItem input:focus { border-color: #1B5E20; outline: none; }
  .addItem button { background: #1B5E20; color: #fff; border: none; padding: 9px 18px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .addItem button:hover { background: #154a18; }
  .manage { background: #fff; border-radius: 8px; padding: 16px; }
  .manage h3 { font-size: 15px; color: #1B5E20; margin-bottom: 12px; }
  .manage .listRow { display: flex; gap: 8px; align-items: center; padding: 10px; border: 1px solid #eee; border-radius: 6px; margin-bottom: 6px; flex-wrap: wrap; }
  .manage .listRow .name { flex: 1; font-size: 14px; min-width: 150px; }
  .manage .listRow .name .count { color: #888; font-size: 12px; }
  .manage .listRow.active { background: #f0f9f0; border-color: #1B5E20; }
  .manage .listRow .activeTag { color: #1B5E20; font-size: 11px; font-weight: bold; background: #c8e6c9; padding: 3px 8px; border-radius: 4px; }
  .manage .listRow button { background: #fff; border: 1px solid #ddd; padding: 6px 10px; border-radius: 4px; cursor: pointer; font-size: 12px; }
  .manage .listRow button.primary { background: #1B5E20; color: #fff; border-color: #1B5E20; }
  .manage .listRow button.danger { color: #c62828; border-color: #ffcdd2; }
  .manage .addList { display: flex; gap: 8px; margin-top: 14px; padding-top: 14px; border-top: 1px solid #eee; }
  .manage .addList input { flex: 1; padding: 10px; border: 1px solid #ccc; border-radius: 6px; font-size: 14px; }
  .manage .addList button { background: #1B5E20; color: #fff; border: none; padding: 10px 16px; border-radius: 6px; cursor: pointer; font-weight: 600; }
  .empty { text-align: center; padding: 50px 20px; color: #888; font-size: 14px; background: #fff; border-radius: 8px; }
  .modal { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: none; align-items: center; justify-content: center; z-index: 100; padding: 16px; }
  .modal.show { display: flex; }
  .modal .card { background: #fff; border-radius: 10px; padding: 20px; width: 100%; max-width: 480px; }
  .modal h3 { font-size: 16px; color: #1B5E20; margin-bottom: 12px; }
  .modal label { display: block; font-size: 12px; color: #555; margin-bottom: 4px; margin-top: 10px; font-weight: 600; }
  .modal input, .modal textarea { width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 6px; font-size: 14px; font-family: inherit; }
  .modal input:focus, .modal textarea:focus { border-color: #1B5E20; outline: none; }
  .modal textarea { min-height: 60px; resize: vertical; }
  .modal .actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; }
  .modal .actions button { padding: 10px 16px; border-radius: 6px; border: none; cursor: pointer; font-size: 14px; font-weight: 600; }
  .modal .actions .cancel { background: #eee; color: #333; }
  .modal .actions .save { background: #1B5E20; color: #fff; }
  .saveStatus { position: fixed; bottom: 20px; right: 20px; background: #1B5E20; color: #fff; padding: 8px 14px; border-radius: 6px; font-size: 12px; opacity: 0; transition: opacity 0.3s; pointer-events: none; }
  .saveStatus.show { opacity: 1; }
  @media (max-width: 600px) {
    .topbar h1 { font-size: 15px; }
    .tab { font-size: 11px; padding: 10px 2px; }
    .tab .count { font-size: 10px; padding: 1px 5px; }
  }
</style>
</head>
<body>

<div class="topbar">
  <h1>📋 Store Opening Checklist</h1>
  <div class="right">
    <span class="by">By Carl_M@17</span>
    <button class="lock" id="lockBtn" onclick="toggleLock()">🔒 Locked</button>
  </div>
</div>

<div class="container">
  <div class="listSelector">
    <label>List:</label>
    <select id="listSelect"></select>
  </div>

  <div class="progress">
    <div class="label">
      <span id="progressLabel">0 / 0 completed</span>
      <span class="pct" id="progressPct">0%</span>
    </div>
    <div class="bar"><div class="fill" id="progressFill" style="width:0%"></div></div>
  </div>

  <div class="tabs">
    <div class="tab active" data-tab="all">All <span class="count" id="cAll">0</span></div>
    <div class="tab" data-tab="pending">Pending <span class="count" id="cPending">0</span></div>
    <div class="tab" data-tab="completed">Done <span class="count" id="cCompleted">0</span></div>
    <div class="tab" data-tab="manage">Manage</div>
  </div>

  <div id="content"></div>
</div>

<div class="modal" id="editModal">
  <div class="card">
    <h3>Edit Item</h3>
    <label>Task</label>
    <textarea id="editText"></textarea>
    <label>Person in Charge (PIC)</label>
    <input id="editPic" type="text" placeholder="e.g. Chari">
    <label>Remarks / Update</label>
    <textarea id="editRemarks"></textarea>
    <div class="actions">
      <button class="cancel" onclick="closeModal()">Cancel</button>
      <button class="save" onclick="saveEdit()">Save</button>
    </div>
  </div>
</div>

<div class="saveStatus" id="saveStatus">Saved ✓</div>

<script>
var data = { lists: [] };
var currentTab = 'all';
var editingItemId = null;
var saveTimer = null;
var activeListId = localStorage.getItem('activeListId') || null;

// ===== Auth =====
function getPass() { return sessionStorage.getItem('adminPass') || ''; }
function setPass(p) { sessionStorage.setItem('adminPass', p); updateLockUI(); }
function clearPass() { sessionStorage.removeItem('adminPass'); updateLockUI(); }
function isUnlocked() { return !!getPass(); }

function updateLockUI() {
  var btn = document.getElementById('lockBtn');
  if (!btn) return;
  if (isUnlocked()) {
    btn.textContent = '🔓 Unlocked';
    btn.classList.add('unlocked');
  } else {
    btn.textContent = '🔒 Locked';
    btn.classList.remove('unlocked');
  }
}

function toggleLock() {
  if (isUnlocked()) {
    if (confirm('Lock the app? You will need the password again for edit/delete/add.')) clearPass();
  } else {
    promptPassword();
  }
}

function promptPassword(cb) {
  var p = prompt('Enter admin password:');
  if (!p) { if (cb) cb(false); return; }
  fetch('/api/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: p })
  }).then(function(r) {
    if (r.ok) {
      setPass(p);
      if (cb) cb(true);
    } else {
      alert('Wrong password.');
      if (cb) cb(false);
    }
  });
}

// Ensures unlocked before running cb()
function withAuth(cb) {
  if (isUnlocked()) return cb();
  promptPassword(function(ok) { if (ok) cb(); });
}

function escapeHtml(s) {
  s = String(s == null ? '' : s);
  return s.replace(/[&<>"']/g, function(c) {
    return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
  });
}

function uid() {
  return 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function parseItem(line) {
  line = line.trim();
  // Try " - " first
  var idx = line.lastIndexOf(' - ');
  if (idx !== -1) return { text: line.substring(0, idx).trim(), pic: line.substring(idx + 3).trim() };
  // Try " -" at end with no space
  var m = line.match(/^(.+?)\\s+-([A-Za-z][A-Za-z0-9 /]*)$/);
  if (m) return { text: m[1].trim(), pic: m[2].trim() };
  return { text: line, pic: '' };
}

function activeList() {
  return data.lists.find(function(l) { return l.id === activeListId; }) || data.lists[0];
}

function showSaved() {
  var el = document.getElementById('saveStatus');
  el.classList.add('show');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(function() { el.classList.remove('show'); }, 1200);
}

function load() {
  return fetch('/api/data').then(function(r) { return r.json(); }).then(function(d) {
    data = d;
    if (!activeListId || !data.lists.find(function(l) { return l.id === activeListId; })) {
      activeListId = data.lists.length ? data.lists[0].id : null;
      if (activeListId) localStorage.setItem('activeListId', activeListId);
    }
    updateLockUI();
    render();
  });
}

// Admin save (protected) — sends full data, requires password
function saveAdmin() {
  return fetch('/api/data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Pass': getPass() },
    body: JSON.stringify({ lists: data.lists })
  }).then(function(r) {
    if (r.status === 401) {
      clearPass();
      alert('Session expired or wrong password. Please unlock again.');
      return load();
    }
    showSaved();
  });
}

function render() {
  // Populate list selector
  var sel = document.getElementById('listSelect');
  sel.innerHTML = '';
  data.lists.forEach(function(l) {
    var opt = document.createElement('option');
    opt.value = l.id;
    opt.textContent = l.name;
    if (l.id === activeListId) opt.selected = true;
    sel.appendChild(opt);
  });

  var list = activeList();
  var content = document.getElementById('content');

  if (!list) {
    document.getElementById('progressLabel').textContent = '0 / 0 completed';
    document.getElementById('progressPct').textContent = '0%';
    document.getElementById('progressFill').style.width = '0%';
    document.getElementById('cAll').textContent = '0';
    document.getElementById('cPending').textContent = '0';
    document.getElementById('cCompleted').textContent = '0';
    if (currentTab === 'manage') return renderManage();
    content.innerHTML = '<div class="empty">No lists yet. Click "Manage" to create one.</div>';
    return;
  }

  var items = list.items;
  var done = items.filter(function(i) { return i.completed; }).length;
  var total = items.length;
  var pct = total ? Math.round(done / total * 100) : 0;

  document.getElementById('progressLabel').textContent = done + ' / ' + total + ' completed';
  document.getElementById('progressPct').textContent = pct + '%';
  document.getElementById('progressFill').style.width = pct + '%';
  document.getElementById('cAll').textContent = total;
  document.getElementById('cPending').textContent = total - done;
  document.getElementById('cCompleted').textContent = done;

  if (currentTab === 'manage') return renderManage();

  var filtered;
  if (currentTab === 'pending') filtered = items.filter(function(i) { return !i.completed; });
  else if (currentTab === 'completed') filtered = items.filter(function(i) { return i.completed; });
  else filtered = items;

  var html = '';
  if (filtered.length === 0) {
    html = '<div class="empty">No items in this view.</div>';
  } else {
    html = filtered.map(function(item) {
      var picBadge = item.pic
        ? '<span class="pic">👤 ' + escapeHtml(item.pic) + '</span>'
        : '<span class="pic empty">No PIC</span>';
      return '<div class="item ' + (item.completed ? 'done' : '') + '">' +
        '<div class="row">' +
          '<input type="checkbox" class="check" ' + (item.completed ? 'checked' : '') +
            ' onchange="toggle(\\'' + item.id + '\\')">' +
          '<div class="body">' +
            '<div class="text">' + escapeHtml(item.text) + '</div>' +
            picBadge +
          '</div>' +
          '<div class="actions">' +
            '<button onclick="openEdit(\\'' + item.id + '\\')" title="Edit">✏️</button>' +
            '<button onclick="del(\\'' + item.id + '\\')" title="Delete">🗑️</button>' +
          '</div>' +
        '</div>' +
        '<div class="remarks">' +
          '<textarea placeholder="Add remarks/update..." onblur="updateRemarks(\\'' + item.id + '\\', this.value)">' +
            escapeHtml(item.remarks || '') +
          '</textarea>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  html += '<div class="addItem">' +
    '<h3>➕ Add New Item</h3>' +
    '<div class="hint">Tip: End with " - Name" to auto-set PIC. Example: <b>Buy candles - Ron</b></div>' +
    '<input id="newItemText" type="text" placeholder="Enter task description..." onkeydown="if(event.key===\\'Enter\\')addItem()">' +
    '<button onclick="addItem()">Add to List</button>' +
  '</div>';

  content.innerHTML = html;
}

function renderManage() {
  var html = '<div class="manage"><h3>📚 Manage Checklists</h3>';
  if (data.lists.length === 0) {
    html += '<div style="color:#888;font-size:13px;margin-bottom:10px;">No lists yet. Add one below.</div>';
  }
  data.lists.forEach(function(l) {
    var isActive = l.id === activeListId;
    html += '<div class="listRow ' + (isActive ? 'active' : '') + '">' +
      '<span class="name">' + escapeHtml(l.name) +
        ' <span class="count">(' + l.items.length + ' items)</span></span>';
    if (isActive) {
      html += '<span class="activeTag">ACTIVE</span>';
    } else {
      html += '<button class="primary" onclick="setActive(\\'' + l.id + '\\')">Use</button>';
    }
    html += '<button onclick="renameList(\\'' + l.id + '\\')">Rename</button>' +
      '<button class="danger" onclick="deleteList(\\'' + l.id + '\\')">Delete</button>' +
    '</div>';
  });
  html += '<div class="addList">' +
    '<input id="newListName" type="text" placeholder="New checklist name (e.g. Store XYZ - Pre-Opening)" onkeydown="if(event.key===\\'Enter\\')addList()">' +
    '<button onclick="addList()">Add List</button>' +
  '</div></div>';
  document.getElementById('content').innerHTML = html;
}

// Tab handlers
document.querySelectorAll('.tab').forEach(function(t) {
  t.addEventListener('click', function() {
    document.querySelectorAll('.tab').forEach(function(x) { x.classList.remove('active'); });
    t.classList.add('active');
    currentTab = t.dataset.tab;
    render();
  });
});

document.getElementById('listSelect').addEventListener('change', function(e) {
  activeListId = e.target.value;
  localStorage.setItem('activeListId', activeListId);
  render();
});

// OPEN — uses /api/check, no password needed
function toggle(id) {
  var list = activeList();
  if (!list) return;
  var item = list.items.find(function(i) { return i.id === id; });
  if (!item) return;
  item.completed = !item.completed;
  render();
  fetch('/api/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ listId: list.id, itemId: id, completed: item.completed })
  }).then(showSaved);
}

// OPEN — uses /api/remarks, no password needed
function updateRemarks(id, val) {
  var list = activeList();
  if (!list) return;
  var item = list.items.find(function(i) { return i.id === id; });
  if (!item) return;
  if (item.remarks === val) return;
  item.remarks = val;
  fetch('/api/remarks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ listId: list.id, itemId: id, remarks: val })
  }).then(showSaved);
}

// PROTECTED
function del(id) {
  withAuth(function() {
    if (!confirm('Delete this item?')) return;
    var list = activeList();
    list.items = list.items.filter(function(i) { return i.id !== id; });
    saveAdmin().then(render);
  });
}

function addItem() {
  withAuth(function() {
    var input = document.getElementById('newItemText');
    var val = input.value.trim();
    if (!val) return;
    var parsed = parseItem(val);
    var list = activeList();
    if (!list) { alert('Create or select a list first.'); return; }
    list.items.push({
      id: uid(),
      text: parsed.text,
      pic: parsed.pic,
      completed: false,
      remarks: ''
    });
    input.value = '';
    saveAdmin().then(render);
  });
}

function openEdit(id) {
  withAuth(function() {
    var list = activeList();
    var item = list.items.find(function(i) { return i.id === id; });
    if (!item) return;
    editingItemId = id;
    document.getElementById('editText').value = item.text;
    document.getElementById('editPic').value = item.pic;
    document.getElementById('editRemarks').value = item.remarks || '';
    document.getElementById('editModal').classList.add('show');
  });
}

function closeModal() {
  document.getElementById('editModal').classList.remove('show');
  editingItemId = null;
}

function saveEdit() {
  var list = activeList();
  var item = list.items.find(function(i) { return i.id === editingItemId; });
  if (!item) return closeModal();
  item.text = document.getElementById('editText').value.trim();
  item.pic = document.getElementById('editPic').value.trim();
  item.remarks = document.getElementById('editRemarks').value;
  closeModal();
  saveAdmin().then(render);
}

function addList() {
  withAuth(function() {
    var input = document.getElementById('newListName');
    var val = input.value.trim();
    if (!val) return;
    var id = 'list_' + Date.now().toString(36);
    data.lists.push({ id: id, name: val, items: [] });
    activeListId = id;
    localStorage.setItem('activeListId', activeListId);
    saveAdmin().then(render);
  });
}

// OPEN — just switches local view, no server change
function setActive(id) {
  activeListId = id;
  localStorage.setItem('activeListId', activeListId);
  render();
}

function renameList(id) {
  withAuth(function() {
    var list = data.lists.find(function(l) { return l.id === id; });
    if (!list) return;
    var name = prompt('New name:', list.name);
    if (name && name.trim()) {
      list.name = name.trim();
      saveAdmin().then(render);
    }
  });
}

function deleteList(id) {
  withAuth(function() {
    if (data.lists.length <= 1) { alert('Cannot delete the only list. Create another first.'); return; }
    if (!confirm('Delete this list and ALL its items? This cannot be undone.')) return;
    data.lists = data.lists.filter(function(l) { return l.id !== id; });
    if (activeListId === id) {
      activeListId = data.lists[0].id;
      localStorage.setItem('activeListId', activeListId);
    }
    saveAdmin().then(render);
  });
}

// Close modal on outside click
document.getElementById('editModal').addEventListener('click', function(e) {
  if (e.target.id === 'editModal') closeModal();
});

load();
</script>
</body>
</html>`;

app.get('/', (req, res) => {
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(HTML);
});

app.listen(PORT, () => {
  console.log('Checklist running on port ' + PORT);
});
