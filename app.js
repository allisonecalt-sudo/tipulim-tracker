const SB_URL = 'https://hpiyvnfhoqnnnotrmwaz.supabase.co';
const SB_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwaXl2bmZob3Fubm5vdHJtd2F6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0NzIwNDEsImV4cCI6MjA4ODA0ODA0MX0.AsGhYitkSnyVMwpJII05UseS_gICaXiCy7d8iHsr6Qw';
const sb = window.supabase.createClient(SB_URL, SB_KEY);

const HEBREW_MONTHS = [
  'ינואר',
  'פברואר',
  'מרץ',
  'אפריל',
  'מאי',
  'יוני',
  'יולי',
  'אוגוסט',
  'ספטמבר',
  'אוקטובר',
  'נובמבר',
  'דצמבר',
];
const HEBREW_DAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'שבת'];
const STATUS_LABELS = {
  projected: 'צפוי',
  done_not_logged: 'לא נרשם!',
  logged: 'נרשם ✓',
  cancelled: 'בוטל',
  blank: 'ריק',
};
const STATUS_CYCLE = ['projected', 'done_not_logged', 'logged', 'cancelled', 'blank'];

// State
let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth() + 1;
let monthData = null;
let entries = [];
let kids = [];
let codes = [];
let sheletEntries = [];
let todos = [];
let activeTab = 'monthly';
let debounceTimers = {};

// ── Init ──
async function init() {
  const { data } = await sb.from('ot_treatment_codes').select('*').order('code');
  codes = data || [];
  await loadMonth(currentYear, currentMonth);
  await loadKids();
  await loadTodos();
}

async function loadTodos() {
  const { data } = await sb.from('ot_todos').select('*').order('sort_order').order('created_at');
  todos = data || [];
  if (activeTab === 'todos') renderTodos();
}

async function loadKids() {
  const { data } = await sb.from('ot_kids').select('*').order('name');
  kids = data || [];
  if (activeTab === 'kids') renderKids();
}

async function loadMonth(year, month) {
  // Get or create month record
  let { data } = await sb
    .from('ot_months')
    .select('*')
    .eq('year', year)
    .eq('month_num', month)
    .single();
  if (!data) {
    const { data: created } = await sb
      .from('ot_months')
      .insert({ year, month_num: month })
      .select()
      .single();
    data = created;
  }
  monthData = data;

  // Load entries
  const { data: ents } = await sb
    .from('ot_entries')
    .select('*, ot_kids(name)')
    .eq('month_id', monthData.id)
    .order('date')
    .order('time_slot')
    .order('sort_order');
  entries = ents || [];

  // Load shelet entries
  const { data: shelets } = await sb
    .from('ot_shelet_entries')
    .select('*')
    .eq('month_id', monthData.id)
    .order('date');
  sheletEntries = shelets || [];

  updateMonthLabel();
  updateSummary();
  if (activeTab === 'monthly') renderMonthly();
  else if (activeTab === 'shelet') renderShelet();
  else if (activeTab === 'kids') renderKids();
}

function updateMonthLabel() {
  const dd = document.getElementById('monthDropdown');
  // Build options from current work year (Sept to Aug)
  dd.innerHTML = '';
  const startMonth = 9; // September
  const startYear = currentYear - (currentMonth < 9 ? 1 : 0);
  for (let i = 0; i < 12; i++) {
    let m = startMonth + i;
    let y = startYear;
    if (m > 12) {
      m -= 12;
      y++;
    }
    const opt = document.createElement('option');
    opt.value = `${y}-${m}`;
    opt.textContent = `${HEBREW_MONTHS[m - 1]} ${y}`;
    if (y === currentYear && m === currentMonth) opt.selected = true;
    dd.appendChild(opt);
  }
}

function selectMonth(val) {
  const [y, m] = val.split('-').map(Number);
  currentYear = y;
  currentMonth = m;
  loadMonth(currentYear, currentMonth);
}

// ── Summary ──
function updateSummary() {
  if (!monthData) return;

  // תפוקות
  const total = entries.reduce((s, e) => s + e.tafukti, 0);
  const target = monthData.tafukot_target;
  const tDiff = total - target;
  document.getElementById('statTafukotGoal').value = target;
  document.getElementById('statTafukotTotal').textContent = total;
  const tDiffEl = document.getElementById('statTafukotDiff');
  if (tDiff > 0) {
    tDiffEl.innerHTML = `<span style="color: var(--green); font-size: 13px; font-weight: 600;">+${tDiff}</span>`;
  } else if (tDiff < 0) {
    tDiffEl.innerHTML = `<span style="color: var(--red); font-size: 13px; font-weight: 600;">${tDiff}</span>`;
  } else {
    tDiffEl.innerHTML = `<span style="color: var(--green); font-size: 13px; font-weight: 600;">✓</span>`;
  }

  // שלטים
  const sheletTarget = monthData.shelet_target || 12;
  const sheletCount = sheletEntries.length;
  const sDiff = sheletCount - sheletTarget;
  document.getElementById('statSheletGoal').value = sheletTarget;
  document.getElementById('statSheletTotal').textContent = sheletCount;
  const sDiffEl = document.getElementById('statSheletDiff');
  if (sDiff > 0) {
    sDiffEl.innerHTML = `<span style="color: var(--green); font-size: 13px; font-weight: 600;">+${sDiff}</span>`;
  } else if (sDiff < 0) {
    sDiffEl.innerHTML = `<span style="color: var(--red); font-size: 13px; font-weight: 600;">${sDiff}</span>`;
  } else {
    sDiffEl.innerHTML = `<span style="color: var(--green); font-size: 13px; font-weight: 600;">✓</span>`;
  }

  // Backup options
  const sikumimGoal = monthData.sikumim_available || 0;
  const sikumimDone = entries.filter((e) => e.treatment_code === 50038 && e.tafukti === 1).length;
  document.getElementById('sikumimGoal').value = sikumimGoal;
  document.getElementById('statSikumimDone').textContent = sikumimDone;
  document.getElementById('statSikumimLeft').textContent = Math.max(0, sikumimGoal - sikumimDone);

  const hadrachotGoal = monthData.extra_hadrachot || 0;
  const hadrachotDone = entries.filter((e) => e.treatment_code === 50016 && e.tafukti === 1).length;
  document.getElementById('hadrachotGoal').value = hadrachotGoal;
  document.getElementById('statHadrachotDone').textContent = hadrachotDone;
  document.getElementById('statHadrachotLeft').textContent = Math.max(
    0,
    hadrachotGoal - hadrachotDone,
  );
}

// ── Render Monthly ──
function renderMonthly() {
  const content = document.getElementById('content');

  if (entries.length === 0) {
    content.innerHTML = `
      <div class="empty-state">
        <h2>אין נתונים לחודש זה</h2>
        <p>לחצי על "צור חודש מתבנית" בהגדרות כדי ליצור את לוח הזמנים</p>
        <button class="btn btn-primary" onclick="generateMonth()">צור חודש מתבנית</button>
      </div>`;
    return;
  }

  // Group by date
  const grouped = {};
  entries.forEach((e) => {
    if (!grouped[e.date]) grouped[e.date] = [];
    grouped[e.date].push(e);
  });

  let html = '';

  // Rollover section
  if (monthData.rollover_in > 0) {
    html += `<div class="rollover-section">
      <h3>גלגול מחודש קודם: ${monthData.rollover_in} תפוקות</h3>
    </div>`;
  }

  Object.keys(grouped)
    .sort()
    .forEach((date) => {
      const dayEntries = grouped[date];
      const d = new Date(date + 'T00:00:00');
      const dayOfWeek = d.getDay();
      const dayTafukot = dayEntries.reduce((s, e) => s + e.tafukti, 0);
      const dayDone = dayEntries.filter(
        (e) => e.status === 'logged' || e.status === 'done_not_logged',
      ).length;
      const dayNotLogged = dayEntries.filter((e) => e.status === 'done_not_logged').length;

      const dateStr = `${d.getDate()}/${d.getMonth() + 1}`;

      const allOff = dayEntries.every((e) => e.status === 'cancelled' || e.status === 'blank');

      html += `<div class="day-group">
      <div class="day-header">
        <span class="day-title" onclick="this.parentElement.nextElementSibling.style.display = this.parentElement.nextElementSibling.style.display === 'none' ? '' : 'none'" style="cursor:pointer; flex:1;">יום ${HEBREW_DAYS[dayOfWeek]} — ${dateStr}</span>
        <span class="day-summary">
          <span>תפוקות: <span class="count">${dayTafukot}</span></span>
          ${dayNotLogged > 0 ? `<span style="color:var(--red)">לא נרשם: ${dayNotLogged}</span>` : ''}
        </span>
        <select onchange="markDayOff('${date}', this.value)" style="font-size: 11px; padding: 2px 4px; border: 1px solid var(--border); border-radius: 4px; font-family: inherit; background: ${allOff ? 'var(--pink)' : 'var(--surface)'}; cursor: pointer;">
          <option value="">—</option>
          <option value="מחלה">מחלה</option>
          <option value="חופש">חופש</option>
          <option value="השתלמות">השתלמות</option>
          <option value="אחר">אחר</option>
        </select>
      </div>
      <div class="day-entries">`;

      dayEntries.forEach((entry) => {
        const time = entry.time_slot ? entry.time_slot.substring(0, 5) : '';
        const name = entry.ot_kids?.name || entry.special_label || '';
        const codeClass = `code-${entry.treatment_code}`;

        html += `
        <div class="entry-row status-${entry.status} ${codeClass}" data-id="${entry.id}">
          <span class="entry-time">${time}</span>
          <input class="entry-name" value="${escHtml(name)}" placeholder="—"
                 onchange="updateEntryName('${entry.id}', this.value)"
                 onfocus="this.select()">
          <span class="entry-code ${codeClass}" onclick="cycleCode('${entry.id}')">${entry.treatment_code}</span>
          <select class="entry-status-select s-${entry.status}" onchange="changeStatus('${entry.id}', this.value)">
            <option value="projected" ${entry.status === 'projected' ? 'selected' : ''}>צפוי</option>
            <option value="done_not_logged" ${entry.status === 'done_not_logged' ? 'selected' : ''}>לא נרשם!</option>
            <option value="logged" ${entry.status === 'logged' ? 'selected' : ''}>נרשם ✓</option>
            <option value="cancelled" ${entry.status === 'cancelled' ? 'selected' : ''}>בוטל</option>
            <option value="blank" ${entry.status === 'blank' ? 'selected' : ''}>ריק</option>
          </select>
          <span class="entry-tafuka t-${entry.tafukti}" onclick="toggleTafuka('${entry.id}')">${entry.tafukti}</span>
        </div>`;
      });

      html += `
        <button class="add-row-btn" onclick="addEntryForDate('${date}')">+ הוסף שורה</button>
      </div>
    </div>`;
    });

  // Add new day button
  html += `<div style="padding: 16px;">
    <button class="btn btn-secondary" onclick="addNewDay()" style="width: 100%;">+ הוסף יום חדש</button>
  </div>`;

  content.innerHTML = html;
}

// ── Render Kids ──
function renderKids() {
  const content = document.getElementById('content');

  if (kids.length === 0) {
    content.innerHTML = `<div class="empty-state"><h2>אין ילדים</h2><p>ילדים נוספים אוטומטית כשאת ממלאת שמות</p></div>`;
    return;
  }

  let html = '<div class="kids-list">';
  kids.forEach((kid) => {
    // Count sessions for this kid across all entries
    const kidEntries = entries.filter(
      (e) => e.kid_id === kid.id && (e.status === 'done_not_logged' || e.status === 'logged'),
    );
    const sessionCount = kidEntries.length;
    const sessionsUntilTalk = 8 - (sessionCount % 8);
    const needsTalk = sessionCount > 0 && sessionCount % 8 === 0;

    html += `
      <div class="kid-card">
        <div>
          <div class="kid-name">${escHtml(kid.name)}</div>
          <div class="kid-meta">${kid.is_active ? 'פעיל/ה' : 'הסתיים'} · ${kid.default_code || ''}</div>
        </div>
        <div class="kid-sessions">
          ${needsTalk ? '<span class="parent-talk-badge">שיחה עם הורים!</span>' : ''}
          <div style="text-align: center;">
            <div class="kid-session-count">${sessionCount}</div>
            <div class="kid-session-label">מפגשים</div>
            <div class="kid-session-label">${sessionsUntilTalk} עד שיחה</div>
          </div>
        </div>
      </div>`;
  });
  html += '</div>';
  content.innerHTML = html;
}

// ── Render Shelet ──
function renderShelet() {
  const content = document.getElementById('content');
  const target = monthData.shelet_target || 12;
  const count = sheletEntries.length;
  const totalHours = sheletEntries.reduce((s, e) => s + parseFloat(e.hours || 0), 0);

  let html = `
    <div style="padding: 16px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <h2 style="font-size: 18px;">שלטים — ${count} / ${target}</h2>
        <span style="color: var(--muted); font-size: 14px;">${totalHours} שעות</span>
      </div>
      <div class="progress-bar" style="height: 8px; margin-bottom: 16px;">
        <div class="progress-fill" style="width: ${Math.min(100, (count / target) * 100)}%"></div>
      </div>`;

  // Add new shelet form
  html += `
    <div style="background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px; margin-bottom: 16px;">
      <div style="display: grid; grid-template-columns: 1fr 2fr 80px auto; gap: 8px; align-items: end;">
        <div>
          <label style="font-size: 12px; color: var(--muted); display: block;">תאריך</label>
          <input type="date" id="sheletDate" style="width: 100%; padding: 6px; border: 1px solid var(--border); border-radius: 6px; font-family: inherit;">
        </div>
        <div>
          <label style="font-size: 12px; color: var(--muted); display: block;">פעילות</label>
          <input type="text" id="sheletDesc" placeholder="תיאור הפעילות" style="width: 100%; padding: 6px; border: 1px solid var(--border); border-radius: 6px; font-family: inherit; direction: rtl;">
        </div>
        <div>
          <label style="font-size: 12px; color: var(--muted); display: block;">שעות</label>
          <input type="number" id="sheletHours" value="1" min="0.5" step="0.5" style="width: 100%; padding: 6px; border: 1px solid var(--border); border-radius: 6px; font-family: inherit;">
        </div>
        <button class="btn btn-primary" onclick="addShelet()" style="height: 36px;">+</button>
      </div>
    </div>`;

  // List existing entries
  if (sheletEntries.length === 0) {
    html += `<div style="text-align: center; padding: 40px; color: var(--muted);">אין שלטים עדיין</div>`;
  } else {
    html += `<div style="display: flex; flex-direction: column; gap: 4px;">`;
    sheletEntries.forEach((entry) => {
      const d = new Date(entry.date + 'T00:00:00');
      const dateStr = `${d.getDate()}/${d.getMonth() + 1}`;
      html += `
        <div style="background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 10px 14px; display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <span style="font-size: 13px; color: var(--muted); min-width: 40px;">${dateStr}</span>
            <span style="font-size: 14px; font-weight: 500;">${escHtml(entry.description)}</span>
          </div>
          <div style="display: flex; align-items: center; gap: 12px;">
            <span style="font-size: 13px; color: var(--accent); font-weight: 600;">${entry.hours} שע׳</span>
            <button onclick="deleteShelet('${entry.id}')" style="background: none; border: none; color: var(--red); cursor: pointer; font-size: 16px;">✕</button>
          </div>
        </div>`;
    });
    html += `</div>`;
  }

  html += `</div>`;
  content.innerHTML = html;

  // Set default date to today
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  document.getElementById('sheletDate').value = todayStr;
}

async function addShelet() {
  const date = document.getElementById('sheletDate').value;
  const desc = document.getElementById('sheletDesc').value.trim();
  const hours = parseFloat(document.getElementById('sheletHours').value) || 1;

  if (!date || !desc) {
    alert('מלאי תאריך ותיאור');
    return;
  }

  const { data, error } = await sb
    .from('ot_shelet_entries')
    .insert({
      month_id: monthData.id,
      date,
      description: desc,
      hours,
    })
    .select()
    .single();

  if (error) {
    alert('שגיאה: ' + error.message);
    return;
  }

  sheletEntries.push(data);
  updateSummary();
  renderShelet();
}

async function deleteShelet(id) {
  await sb.from('ot_shelet_entries').delete().eq('id', id);
  sheletEntries = sheletEntries.filter((e) => e.id !== id);
  updateSummary();
  renderShelet();
}

// ── Mark Day Off ──
async function markDayOff(date, reason) {
  if (!reason) return;
  const dayEntries = entries.filter((e) => e.date === date);
  for (const entry of dayEntries) {
    await sb
      .from('ot_entries')
      .update({ status: 'cancelled', tafukti: 0, notes: reason })
      .eq('id', entry.id);
    entry.status = 'cancelled';
    entry.tafukti = 0;
    entry.notes = reason;
  }
  updateSummary();
  renderMonthly();
}

// ── Render Todos ──
function renderTodos() {
  const content = document.getElementById('content');
  const doneCount = todos.filter((t) => t.is_done).length;

  let html = `<div style="padding: 16px;">
    <div style="display: flex; gap: 8px; margin-bottom: 16px;">
      <input type="text" id="todoInput" placeholder="הוסיפי משימה..."
             style="flex: 1; padding: 10px 12px; border: 1px solid var(--border); border-radius: 6px; font-family: inherit; font-size: 14px; direction: rtl;"
             onkeydown="if(event.key==='Enter') addTodo()">
      <button class="btn btn-primary" onclick="addTodo()">+</button>
    </div>`;

  if (todos.length === 0) {
    html += `<div style="text-align: center; padding: 40px; color: var(--muted);">אין משימות</div>`;
  } else {
    // Active todos first, then done
    const active = todos.filter((t) => !t.is_done);
    const done = todos.filter((t) => t.is_done);

    active.forEach((todo) => {
      html += renderTodoItem(todo);
    });

    if (done.length > 0) {
      html += `<div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--border);">
        <span style="font-size: 12px; color: var(--muted);">הושלמו (${done.length})</span>
      </div>`;
      done.forEach((todo) => {
        html += renderTodoItem(todo);
      });
    }
  }

  html += `</div>`;
  content.innerHTML = html;
}

function renderTodoItem(todo) {
  return `
    <div style="display: flex; align-items: center; gap: 10px; padding: 8px 4px; border-bottom: 1px solid var(--border); ${todo.is_done ? 'opacity: .5;' : ''}">
      <input type="checkbox" ${todo.is_done ? 'checked' : ''} onchange="toggleTodo('${todo.id}')"
             style="width: 20px; height: 20px; cursor: pointer; accent-color: var(--accent);">
      <input type="text" value="${escHtml(todo.text)}"
             onchange="updateTodoText('${todo.id}', this.value)"
             style="flex: 1; border: none; background: transparent; font-family: inherit; font-size: 14px; direction: rtl; padding: 4px 0; ${todo.is_done ? 'text-decoration: line-through;' : ''}">
      <button onclick="deleteTodo('${todo.id}')"
              style="background: none; border: none; color: var(--red); cursor: pointer; font-size: 16px; padding: 4px;">✕</button>
    </div>`;
}

async function addTodo() {
  const input = document.getElementById('todoInput');
  const text = input.value.trim();
  if (!text) return;

  const maxOrder = todos.length > 0 ? Math.max(...todos.map((t) => t.sort_order)) : 0;
  const { data, error } = await sb
    .from('ot_todos')
    .insert({ text, sort_order: maxOrder + 1 })
    .select()
    .single();
  if (error) {
    alert('שגיאה: ' + error.message);
    return;
  }

  todos.push(data);
  input.value = '';
  renderTodos();
}

async function toggleTodo(id) {
  const todo = todos.find((t) => t.id === id);
  if (!todo) return;
  const newDone = !todo.is_done;
  await sb.from('ot_todos').update({ is_done: newDone }).eq('id', id);
  todo.is_done = newDone;
  renderTodos();
}

async function updateTodoText(id, text) {
  await sb.from('ot_todos').update({ text: text.trim() }).eq('id', id);
  const todo = todos.find((t) => t.id === id);
  if (todo) todo.text = text.trim();
}

async function deleteTodo(id) {
  await sb.from('ot_todos').delete().eq('id', id);
  todos = todos.filter((t) => t.id !== id);
  renderTodos();
}

// ── Tab Switching ──
function switchTab(tab) {
  activeTab = tab;
  document
    .querySelectorAll('.tab')
    .forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
  if (tab === 'monthly') renderMonthly();
  else if (tab === 'shelet') renderShelet();
  else if (tab === 'todos') renderTodos();
  else if (tab === 'kids') renderKids();
}

// ── Entry Actions ──
async function changeStatus(id, newStatus) {
  const entry = entries.find((e) => e.id === id);
  if (!entry) return;

  let newTafukti = 1;
  if (newStatus === 'cancelled' || newStatus === 'blank') newTafukti = 0;

  await sb.from('ot_entries').update({ status: newStatus, tafukti: newTafukti }).eq('id', id);
  entry.status = newStatus;
  entry.tafukti = newTafukti;

  updateSummary();
  renderMonthly();
}

async function cycleCode(id) {
  const entry = entries.find((e) => e.id === id);
  if (!entry) return;

  const codeValues = codes.map((c) => c.code);
  const currentIdx = codeValues.indexOf(entry.treatment_code);
  const newCode = codeValues[(currentIdx + 1) % codeValues.length];

  await sb.from('ot_entries').update({ treatment_code: newCode }).eq('id', id);
  entry.treatment_code = newCode;
  renderMonthly();
}

async function toggleTafuka(id) {
  const entry = entries.find((e) => e.id === id);
  if (!entry) return;

  const newVal = entry.tafukti === 1 ? 0 : 1;
  await sb.from('ot_entries').update({ tafukti: newVal }).eq('id', id);
  entry.tafukti = newVal;

  updateSummary();
  renderMonthly();
}

async function updateEntryName(id, value) {
  const entry = entries.find((e) => e.id === id);
  if (!entry) return;

  const trimmed = value.trim();

  // Check if it matches an existing kid
  const matchedKid = kids.find((k) => k.name === trimmed);

  if (matchedKid) {
    await sb.from('ot_entries').update({ kid_id: matchedKid.id, special_label: null }).eq('id', id);
    entry.kid_id = matchedKid.id;
    entry.special_label = null;
    entry.ot_kids = { name: matchedKid.name };
  } else if (trimmed === '') {
    await sb.from('ot_entries').update({ kid_id: null, special_label: null }).eq('id', id);
    entry.kid_id = null;
    entry.special_label = null;
    entry.ot_kids = null;
  } else if (trimmed.toUpperCase() === 'NEW' || trimmed === 'חדש') {
    await sb.from('ot_entries').update({ kid_id: null, special_label: 'NEW' }).eq('id', id);
    entry.kid_id = null;
    entry.special_label = 'NEW';
    entry.ot_kids = null;
  } else {
    // New kid name — create kid record and link
    const { data: newKid } = await sb.from('ot_kids').insert({ name: trimmed }).select().single();
    if (newKid) {
      kids.push(newKid);
      await sb.from('ot_entries').update({ kid_id: newKid.id, special_label: null }).eq('id', id);
      entry.kid_id = newKid.id;
      entry.special_label = null;
      entry.ot_kids = { name: newKid.name };
    } else {
      // Fallback: save as special_label
      await sb.from('ot_entries').update({ kid_id: null, special_label: trimmed }).eq('id', id);
      entry.special_label = trimmed;
      entry.ot_kids = null;
    }
  }
}

// ── Generate Month ──
async function generateMonth() {
  if (monthData.is_generated) {
    if (!confirm('חודש זה כבר נוצר. ליצור מחדש? (זה ימחק את כל השורות הקיימות!)')) return;
    await sb.from('ot_entries').delete().eq('month_id', monthData.id);
  }

  // Get schedule template
  const { data: templates } = await sb
    .from('ot_schedule_templates')
    .select('*')
    .eq('is_active', true)
    .order('day_of_week')
    .order('sort_order');

  if (!templates || templates.length === 0) {
    alert('אין תבנית לוח זמנים. הוסיפי תבנית בהגדרות.');
    return;
  }

  // Get all dates in the month
  const newEntries = [];
  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(currentYear, currentMonth - 1, day);
    const dayOfWeek = date.getDay();
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

    const dayTemplates = templates.filter((t) => t.day_of_week === dayOfWeek);

    dayTemplates.forEach((t) => {
      newEntries.push({
        month_id: monthData.id,
        date: dateStr,
        day_of_week: dayOfWeek,
        time_slot: t.time_slot,
        sort_order: t.sort_order,
        treatment_code: t.treatment_code,
        status: 'projected',
        tafukti: 1,
        notes: t.notes,
        kid_id: null,
        special_label: t.treatment_code === 50008 ? 'אבחון' : null,
      });
    });
  }

  // Batch insert
  if (newEntries.length > 0) {
    const { error } = await sb.from('ot_entries').insert(newEntries);
    if (error) {
      alert('שגיאה: ' + error.message);
      return;
    }
  }

  // Mark as generated
  await sb.from('ot_months').update({ is_generated: true }).eq('id', monthData.id);
  monthData.is_generated = true;

  await loadMonth(currentYear, currentMonth);
}

// ── Close Month (Rollover) ──
async function closeMonth() {
  if (!confirm('לסגור את החודש ולחשב גלגול לחודש הבא?')) return;

  const done = entries
    .filter((e) => e.status === 'logged' || e.status === 'done_not_logged')
    .reduce((s, e) => s + e.tafukti, 0);
  const effectiveTotal = done + (monthData.rollover_in || 0);
  const surplus = Math.max(0, effectiveTotal - monthData.tafukot_target);

  // Update current month
  await sb.from('ot_months').update({ rollover_out: surplus }).eq('id', monthData.id);

  // Get or create next month
  let nextMonth = currentMonth + 1;
  let nextYear = currentYear;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear++;
  }

  let { data: next } = await sb
    .from('ot_months')
    .select('*')
    .eq('year', nextYear)
    .eq('month_num', nextMonth)
    .single();
  if (!next) {
    const { data: created } = await sb
      .from('ot_months')
      .insert({ year: nextYear, month_num: nextMonth, rollover_in: surplus })
      .select()
      .single();
    next = created;
  } else {
    await sb.from('ot_months').update({ rollover_in: surplus }).eq('id', next.id);
  }

  alert(`חודש נסגר! עודף: ${surplus} תפוקות → ${HEBREW_MONTHS[nextMonth - 1]}`);
}

// ── Add Entry ──
function quickAdd() {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('modalDate').value = today;
  document.getElementById('modalTime').value = '08:00';
  document.getElementById('modalName').value = '';
  document.getElementById('modalCode').value = '50011';
  document.getElementById('modalSlots').value = '1';
  document.getElementById('modalStatus').value = 'projected';
  document.getElementById('modalTitle').textContent = 'הוסף שורה';
  document.getElementById('addModal').classList.add('show');
}

function addEntryForDate(date) {
  document.getElementById('modalDate').value = date;
  document.getElementById('modalTime').value = '08:00';
  document.getElementById('modalName').value = '';
  document.getElementById('modalCode').value = '50011';
  document.getElementById('modalSlots').value = '1';
  document.getElementById('modalStatus').value = 'projected';
  document.getElementById('modalTitle').textContent = 'הוסף שורה';
  document.getElementById('addModal').classList.add('show');
}

function addNewDay() {
  quickAdd();
}

async function saveNewEntry() {
  const date = document.getElementById('modalDate').value;
  const time = document.getElementById('modalTime').value;
  const name = document.getElementById('modalName').value.trim();
  const code = parseInt(document.getElementById('modalCode').value);
  const slots = parseInt(document.getElementById('modalSlots').value);
  const status = document.getElementById('modalStatus').value;

  if (!date) {
    alert('בחרי תאריך');
    return;
  }

  const d = new Date(date + 'T00:00:00');
  const dayOfWeek = d.getDay();

  // Find the max sort_order for this date/time
  const existing = entries.filter((e) => e.date === date && e.time_slot === time + ':00');
  const maxSort = existing.length > 0 ? Math.max(...existing.map((e) => e.sort_order)) : 0;

  const tafukti = status === 'cancelled' || status === 'blank' ? 0 : 1;

  // Match kid or create
  let kid_id = null;
  let special_label = null;
  if (name) {
    const matchedKid = kids.find((k) => k.name === name);
    if (matchedKid) {
      kid_id = matchedKid.id;
    } else if (name.toUpperCase() === 'NEW' || name === 'חדש') {
      special_label = 'NEW';
    } else if (name === 'אבחון') {
      special_label = 'אבחון';
    } else {
      const { data: newKid } = await sb.from('ot_kids').insert({ name }).select().single();
      if (newKid) {
        kids.push(newKid);
        kid_id = newKid.id;
      }
    }
  }

  const newEntries = [];
  for (let i = 0; i < slots; i++) {
    newEntries.push({
      month_id: monthData.id,
      date,
      day_of_week: dayOfWeek,
      time_slot: time,
      sort_order: maxSort + i + 1,
      treatment_code: code,
      status,
      tafukti,
      kid_id,
      special_label: special_label || (code === 50008 && !kid_id ? 'אבחון' : null),
    });
  }

  const { error } = await sb.from('ot_entries').insert(newEntries);
  if (error) {
    alert('שגיאה: ' + error.message);
    return;
  }

  closeModal('addModal');
  await loadMonth(currentYear, currentMonth);
}

// ── Inline Goal Saves ──
async function saveTafukotGoal(val) {
  const v = parseInt(val) || 0;
  await sb.from('ot_months').update({ tafukot_target: v }).eq('id', monthData.id);
  monthData.tafukot_target = v;
  updateSummary();
}

async function saveSheletGoal(val) {
  const v = parseInt(val) || 0;
  await sb.from('ot_months').update({ shelet_target: v }).eq('id', monthData.id);
  monthData.shelet_target = v;
  updateSummary();
}

async function saveSikumimGoal(val) {
  const v = parseInt(val) || 0;
  await sb.from('ot_months').update({ sikumim_available: v }).eq('id', monthData.id);
  monthData.sikumim_available = v;
  updateSummary();
}

async function saveHadrachotGoal(val) {
  const v = parseInt(val) || 0;
  await sb.from('ot_months').update({ extra_hadrachot: v }).eq('id', monthData.id);
  monthData.extra_hadrachot = v;
  updateSummary();
}

// ── Helpers ──
function closeModal(id) {
  document.getElementById(id).classList.remove('show');
}

function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

// Close modals on overlay click
document.querySelectorAll('.modal-overlay').forEach((el) => {
  el.addEventListener('click', (e) => {
    if (e.target === el) el.classList.remove('show');
  });
});

// Init
init();
