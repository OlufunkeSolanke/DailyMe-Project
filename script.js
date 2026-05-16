const COLORS = [
  { name:'amber',  dot:'#d4813a', bg:'#fdf3e7' },
  { name:'sage',   dot:'#5a8a5a', bg:'#edf4ed' },
  { name:'rose',   dot:'#c96b6b', bg:'#faeaea' },
  { name:'slate',  dot:'#5a7898', bg:'#eaf0f7' },
  { name:'violet', dot:'#7a6bb0', bg:'#f0edf9' },
  { name:'teal',   dot:'#3a8a7a', bg:'#e6f4f1' },
];
const DAY_NAMES = ['S','M','T','W','T','F','S'];


let currentUser  = null;
let habits       = [];
let authMode     = 'login';
let currentView  = 'today';
let selectedColor = COLORS[0];
let toastTimer   = null; // Declared toastTimer

/* Date Helpers */
function todayStr() { return new Date().toISOString().split('T')[0]; }

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

function weekDays() {
  return Array.from({ length: 7 }, (_, i) => ({
    date:  daysAgo(6 - i),
    label: DAY_NAMES[new Date(daysAgo(6 - i) + 'T12:00:00').getDay()],
  }));
}

function calcStreak(completions) {
  let streak = 0;
  let check  = todayStr();
  while (completions.includes(check)) {
    streak++;
    const d = new Date(check + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    check = d.toISOString().split('T')[0];
  }
  return streak;
}

/* localStorage  */
const getUsers   = ()      => JSON.parse(localStorage.getItem('dm_users')          || '{}');
const saveUsers  = u       => localStorage.setItem('dm_users', JSON.stringify(u));
const getHabits  = uid     => JSON.parse(localStorage.getItem(`dm_habits_${uid}`)  || '[]');
const saveHabits = (uid,h) => localStorage.setItem(`dm_habits_${uid}`, JSON.stringify(h));
const getSession = ()      => { try { return JSON.parse(localStorage.getItem('dm_session')); } catch { return null; } };
const setSession = u       => localStorage.setItem('dm_session', JSON.stringify(u));
const clearSession=()      => localStorage.removeItem('dm_session');

/* AUTH */
function switchTab(mode) {
  authMode = mode;
  document.getElementById('tab-login').classList.toggle('active',  mode === 'login');
  document.getElementById('tab-signup').classList.toggle('active', mode === 'signup');
  document.getElementById('field-name').style.display = mode === 'signup' ? 'flex' : 'none';
  document.getElementById('auth-submit-btn').textContent = mode === 'login' ? 'Enter' : 'Create Account';
  document.getElementById('auth-tagline').textContent =
    mode === 'login' ? 'Welcome back. Keep the streak alive.' : 'Begin your ritual. One habit at a time.';
  document.getElementById('auth-error').textContent = '';
}

function enterSubmit(e) { if (e.key === 'Enter') handleAuth(); }

function triggerShake() {
  const c = document.getElementById('auth-card');
  c.classList.remove('shake');
  void c.offsetWidth; // reflow
  c.classList.add('shake');
  setTimeout(() => c.classList.remove('shake'), 600);
}

function setError(msg) {
  document.getElementById('auth-error').textContent = msg;
}

function handleAuth() {
  setError('');
  const name     = document.getElementById('inp-name').value.trim();
  const email    = document.getElementById('inp-email').value.trim().toLowerCase();
  const password = document.getElementById('inp-password').value;
  const users    = getUsers();

  if (authMode === 'signup') {
    if (!name || !email || !password)       { setError('All fields are required.'); return triggerShake(); }
    if (password.length < 6)                { setError('Password must be at least 6 characters.'); return triggerShake(); }
    if (users[email])                       { setError('An account with this email already exists.'); return triggerShake(); }
    const uid = `${Date.now()}`;
    users[email] = { uid, name, email, password };
    saveUsers(users);
    loginUser({ uid, name, email });
  } else {
    const user = users[email];
    if (!user || user.password !== password) { setError('Invalid email or password.'); return triggerShake(); }
    loginUser(user);
  }
}

function loginUser(user) {
  currentUser = user;
  setSession(user);
  habits = getHabits(user.uid);
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app-screen').style.display  = 'block';
  document.getElementById('user-greeting').textContent  = `Hello, ${user.name.split(' ')[0]}`;
  setupNotifications();
  renderAll();
}

function handleLogout() {
  clearSession();
  currentUser = null;
  habits      = [];
  document.getElementById('app-screen').style.display  = 'none';
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('inp-email').value    = '';
  document.getElementById('inp-password').value = '';
  document.getElementById('inp-name').value     = '';
  setError('');
  switchTab('login');
}

/* HABIT LOGIC */
function persist() { saveHabits(currentUser.uid, habits); }

function toggleHabit(id) {
  const h = habits.find(x => x.id === id);
  if (!h) return;
  const t = todayStr();
  if (h.completions.includes(t)) {
    h.completions = h.completions.filter(d => d !== t);
  } else {
    h.completions.push(t);
  }
  persist();
  renderAll();
}

function resetStreak(id) {
  if (!confirm('Reset this streak? Completion history will be cleared.')) return;
  const h = habits.find(x => x.id === id);
  if (h) { h.completions = []; persist(); renderAll(); }
}

function deleteHabit(id) {
  if (!confirm('Delete this habit?')) return;
  habits = habits.filter(x => x.id !== id);
  persist();
  renderAll();
}

function addHabit() {
  const name = document.getElementById('habit-name-inp').value.trim();
  if (!name) return;
  habits.push({
    id: `${Date.now()}`,
    name,
    color: selectedColor,
    completions: [],
    createdAt: todayStr(),
  });
  persist();
  renderAll();
  closeModal();
}

/* VIEW / RENDER */
function switchView(v) {
  currentView = v;
  document.getElementById('vtab-today').classList.toggle('active', v === 'today');
  document.getElementById('vtab-all').classList.toggle('active',   v === 'all');
  renderHabits();
}

function renderAll() {
  renderStats();
  renderHabits();
}

function renderStats() {
  const today        = todayStr();
  const doneToday    = habits.filter(h => h.completions.includes(today));
  const totalStreak  = habits.reduce((s, h) => s + calcStreak(h.completions), 0);
  const rate         = habits.length ? Math.round((doneToday.length / habits.length) * 100) : 0;

  document.getElementById('stat-total').textContent  = habits.length;
  document.getElementById('stat-done').textContent   = doneToday.length;
  document.getElementById('stat-streak').textContent = totalStreak;
  document.getElementById('stat-rate').textContent   = rate + '%';
  document.getElementById('overall-fill').style.width = rate + '%';
}

function renderHabits() {
  const list    = document.getElementById('habit-list');
  const today   = todayStr();
  const filtered = currentView === 'today'
    ? habits.filter(h => !h.completions.includes(today))
    : habits;

  if (habits.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">◈</span>
        <p class="empty-title">No habits yet</p>
        <p class="empty-desc">Start building your ritual. Add your first habit above.</p>
      </div>`;
    return;
  }

  if (filtered.length === 0 && currentView === 'today') {
    list.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">🎉</span>
        <p class="empty-title">All done for today!</p>
        <p class="empty-desc">You've completed every habit. Come back tomorrow.</p>
      </div>`;
    return;
  }

  list.innerHTML = filtered.map((h, i) => buildCard(h, i)).join('');
}

function buildCard(h, index) {
  const today      = todayStr();
  const doneToday  = h.completions.includes(today);
  const streak     = calcStreak(h.completions);
  const progress   = Math.min((streak / 21) * 100, 100);
  const week       = weekDays();
  const cardBg     = doneToday ? h.color.bg : '#ffffff';
  const delay      = index * 60;

  const weekHtml = week.map(({ date, label }) => {
    const done = h.completions.includes(date);
    return `
      <div class="day-cell">
        <div class="day-dot" style="background:${done ? h.color.dot : 'var(--border)'}"></div>
        <span class="day-label">${label}</span>
      </div>`;
  }).join('');

  return `
    <div class="habit-card"
         style="border-left-color:${h.color.dot}; background:${cardBg}; animation-delay:${delay}ms">

      <div class="card-top">
        <div class="card-left">
          <div class="habit-dot" style="background:${h.color.dot}"></div>
          <div>
            <p class="habit-name">${escHtml(h.name)}</p>
            <p class="habit-meta">
              ${streak > 0 ? `🔥 ${streak} day streak` : 'No active streak'}
              ${doneToday ? '<span class="done-badge">Done today</span>' : ''}
            </p>
          </div>
        </div>
        <button class="check-btn"
                style="border-color:${h.color.dot};
                       background:${doneToday ? h.color.dot : 'transparent'};
                       color:${doneToday ? '#fff' : h.color.dot}"
                onclick="toggleHabit('${h.id}')"
                title="${doneToday ? 'Mark incomplete' : 'Mark complete'}">
          ${doneToday ? '✓' : '○'}
        </button>
      </div>

      <div class="week-row">${weekHtml}</div>

      <div class="progress-wrap">
        <div class="progress-bar" style="width:${progress}%; background:${h.color.dot}"></div>
      </div>
      <p class="progress-lbl">${streak}/21 days to milestone</p>

      <div class="card-footer">
        <button class="text-btn"        onclick="resetStreak('${h.id}')">Reset streak</button>
        <button class="text-btn danger" onclick="deleteHabit('${h.id}')">Delete</button>
      </div>
    </div>`;
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* MODAL */
function openModal() {
  document.getElementById('habit-name-inp').value = '';
  selectedColor = COLORS[0];
  renderColorPicker();
  document.getElementById('modal-overlay').classList.add('open');
  setTimeout(() => document.getElementById('habit-name-inp').focus(), 200);
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
}

function overlayClick(e) {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
}

function renderColorPicker() {
  const row = document.getElementById('color-row');
  row.innerHTML = COLORS.map(c => `
    <button class="color-dot-btn ${c.name === selectedColor.name ? 'selected' : ''}"
            style="background:${c.dot}; color:${c.dot}"
            onclick="pickColor('${c.name}')"
            title="${c.name}">
    </button>`).join('');
}

function pickColor(name) {
  selectedColor = COLORS.find(c => c.name === name);
  renderColorPicker();
}

/* NOTIFICATIONS */
let notifEnabled  = false;
let reminderTimer = null;

function getSavedTime() {
  return localStorage.getItem('dm_notif_time') || '20:00';
}

function setupNotifications() {
  notifEnabled = localStorage.getItem('dm_notif') === '1';
  var btn = document.getElementById('bell-btn');
  if (notifEnabled && 'Notification' in window && Notification.permission === 'granted') {
    btn.classList.add('active');
    scheduleReminder();
  } else {
    btn.classList.remove('active');
    notifEnabled = false;
  }
}

function toggleNotifications() {
  if (!('Notification' in window)) { showToast('&#9888;','Notifications not supported in this browser'); return; }
  if (!notifEnabled) {
    document.getElementById('notif-time-inp').value = getSavedTime();
    document.getElementById('notif-modal-overlay').classList.add('open');
  } else {
    notifEnabled=false;
    localStorage.removeItem('dm_notif');
    if(reminderTimer) clearTimeout(reminderTimer);
    var btn=document.getElementById('bell-btn');
    btn.classList.remove('active');
    btn.title='Click to set daily reminder';
    showToast('&#128277;','Daily reminder turned off');
  }
}

function confirmNotifTime() {
  var time = document.getElementById('notif-time-inp').value || '20:00';
  localStorage.setItem('dm_notif_time', time);
  closeNotifModal();
  if (!('Notification' in window)) { showToast('&#9888;','Notifications not supported'); return; }
  Notification.requestPermission().then(perm => {
    if (perm === 'granted') {
      notifEnabled = true;
      localStorage.setItem('dm_notif', '1');
      var btn = document.getElementById('bell-btn');
      btn.classList.add('active');
      btn.title = `Reminder set for ${formatTime(time)} — click to disable`;
      scheduleReminder();
      showToast('🔔', `Reminder set for ${formatTime(time)} daily`);
    } else {
      showToast('⚠️', 'Enable notifications in your browser settings');
    }
  });
}

function closeNotifModal() { document.getElementById('notif-modal-overlay').classList.remove('open'); }
function notifOverlayClick(e) {
  if (e.target === document.getElementById('notif-modal-overlay')) closeNotifModal();
}

function formatTime(time24) {
  const [h, m] = time24.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12  = h % 12 || 12;
  return `${h12}:${String(m).padStart(2,'0')} ${ampm}`;
} // Fixed missing closing bracket here

function scheduleReminder() {
  if(reminderTimer) clearTimeout(reminderTimer);
  var p=getSavedTime().split(':'), h=parseInt(p[0],10), m=parseInt(p[1],10);
  var now=new Date(), target=new Date();
  target.setHours(h,m,0,0);
  if(now>=target) target.setDate(target.getDate()+1);
  reminderTimer=setTimeout(function(){fireReminder();scheduleReminder();}, target-now);
}

function fireReminder() {
  if(!notifEnabled||Notification.permission!=='granted') return;
  var t=todayStr(), pending=habits.filter(function(h){return h.completions.indexOf(t)===-1;});
  if(!pending.length) return;
  var body=pending.length===1?'Don\'t forget: "'+pending[0].name+'"':'You have '+pending.length+' habits left for today';
  new Notification('DailyMe — Daily Check-in', {body:body});
}

/* TOAST */
function showToast(icon, msg) {
  document.getElementById('toast-icon').innerHTML=icon;
  document.getElementById('toast-msg').textContent=msg;
  var t=document.getElementById('toast');
  t.classList.add('show');
  if(toastTimer) clearTimeout(toastTimer);
  toastTimer=setTimeout(function(){t.classList.remove('show');},3500);
}

/* INIT */
(function init() {
  const session = getSession();
  if (session) {
    loginUser(session);
  }
  renderColorPicker();
})();