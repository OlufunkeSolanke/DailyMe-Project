const COLORS = [
  { name:'amber',  dot:'#d4813a', bg:'#fdf3e7' },
  { name:'sage',   dot:'#5a8a5a', bg:'#edf4ed' },
  { name:'rose',   dot:'#c96b6b', bg:'#faeaea' },
  { name:'slate',  dot:'#5a7898', bg:'#eaf0f7' },
  { name:'violet', dot:'#7a6bb0', bg:'#f0edf9' },
  { name:'teal',   dot:'#3a8a7a', bg:'#e6f4f1' },
];
const DAY_NAMES = ['S','M','T','W','T','F','S'];

let currentUser   = null;
let habits        = [];
let authMode      = 'login';
let currentView   = 'today';
let selectedColor = COLORS[0];
let toastTimer    = null;
let notifEnabled  = false;
let reminderTimer = null;

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

function calcStreak(habit) {
  let streak = 0;
  let check  = todayStr();
  const completions = habit.completions || [];
  const skips       = habit.skips       || [];

  if (!completions.includes(check) && !skips.includes(check)) {
    const d = new Date(check + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    check = d.toISOString().split('T')[0];
  }

  while (completions.includes(check) || skips.includes(check)) {
    if (completions.includes(check)) streak++;
    const d = new Date(check + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    check = d.toISOString().split('T')[0];
  }
  return streak;
}

/* FIRESTORE */
async function loadHabitsFromDB(uid) {
  try {
    const doc = await db.collection('habits').doc(uid).get();
    return doc.exists ? (doc.data().list || []) : [];
  } catch (e) {
    console.error('Load habits error:', e);
    return [];
  }
}

function persist() {
  if (!currentUser) return;
  db.collection('habits').doc(currentUser.uid).set({ list: habits })
    .catch(err => {
      console.error('Save error:', err);
      showToast('⚠️', 'Failed to save. Check your connection.');
    });
}

/* AUTHENTICATION */
function switchTab(mode) {
  authMode = mode;
  document.getElementById('tab-login').classList.toggle('active',  mode === 'login');
  document.getElementById('tab-signup').classList.toggle('active', mode === 'signup');
  document.getElementById('field-name').style.display         = mode === 'signup' ? 'flex' : 'none';
  document.getElementById('auth-submit-btn').textContent      = mode === 'login' ? 'Enter' : 'Create Account';
  document.getElementById('auth-tagline').textContent         =
    mode === 'login' ? 'Welcome back. Keep the streak alive.' : 'Begin your ritual. One habit at a time.';
  document.getElementById('auth-error').textContent = '';
  
  document.getElementById('inp-email').value = '';
  document.getElementById('inp-password').value = '';
  if (document.getElementById('inp-name')) document.getElementById('inp-name').value = '';
}

function enterSubmit(e) { if (e.key === 'Enter') handleAuth(); }

function triggerShake() {
  const c = document.getElementById('auth-card');
  c.classList.remove('shake');
  void c.offsetWidth;
  c.classList.add('shake');
  setTimeout(() => c.classList.remove('shake'), 600);
}

function setError(msg) {
  document.getElementById('auth-error').textContent = msg;
}

async function handleAuth() {
  setError('');
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const name     = document.getElementById('inp-name').value.trim();
  const email    = document.getElementById('inp-email').value.trim().toLowerCase();
  const password = document.getElementById('inp-password').value;
  const btn      = document.getElementById('auth-submit-btn');

  if (authMode === 'signup') {
    if (!name || !email || !password)  { setError('All fields are required.');                    return triggerShake(); }
    if (!emailRegex.test(email))       { setError('Enter a valid email e.g. you@example.com');   return triggerShake(); }
    if (password.length < 6)           { setError('Password must be at least 6 characters.');    return triggerShake(); }

    btn.textContent = 'Creating account...';
    btn.disabled    = true;
    try {
      const cred = await auth.createUserWithEmailAndPassword(email, password);
      await cred.user.updateProfile({ displayName: name });
      await loginUser({ uid: cred.user.uid, name, email });
    } catch (e) {
      setError(e.code === 'auth/email-already-in-use'
        ? 'An account with this email already exists.'
        : e.message);
      triggerShake();
    } finally {
      btn.textContent = 'Create Account';
      btn.disabled    = false;
    }

  } else {
    if (!emailRegex.test(email))       { setError('Enter a valid email e.g. you@example.com');   return triggerShake(); }

    btn.textContent = 'Signing in...';
    btn.disabled    = true;
    try {
      const cred = await auth.signInWithEmailAndPassword(email, password);
      const displayName = cred.user.displayName || name || email.split('@')[0];
      await loginUser({ uid: cred.user.uid, name: displayName, email });
    } catch (e) {
      setError('Invalid email or password.');
      triggerShake();
    } finally {
      btn.textContent = 'Enter';
      btn.disabled    = false;
    }
  }
}

async function loginUser(user) {
  currentUser = user;
  habits = await loadHabitsFromDB(user.uid);
  document.getElementById('loading-screen').style.display = 'none';
  document.getElementById('auth-screen').style.display    = 'none';
  document.getElementById('app-screen').style.display     = 'block';
  document.getElementById('user-greeting').textContent    = `Hello, ${user.name.split(' ')[0]}`;
  setupNotifications();
  renderAll();
}

async function handleLogout() {
  try {
    await auth.signOut();
  } catch (e) {
    console.error('Logout error:', e);
  }
  currentUser  = null;
  habits       = [];
  notifEnabled = false;
  if (reminderTimer) clearTimeout(reminderTimer);
  document.getElementById('app-screen').style.display  = 'none';
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('inp-email').value    = '';
  document.getElementById('inp-password').value = '';
  document.getElementById('inp-name').value     = '';
  setError('');
  switchTab('login');
}

/* HABITS LOGIC */
function toggleHabit(id) {
  const h = habits.find(x => x.id === id);
  if (!h) return;
  const t = todayStr();
  if (h.completions.includes(t)) {
    h.completions = h.completions.filter(d => d !== t);
  } else {
    h.completions.push(t);
    if (h.skips) h.skips = h.skips.filter(d => d !== t);
  }
  persist(); renderAll();
}

function toggleSkip(id) {
  const h = habits.find(x => x.id === id);
  if (!h) return;
  const t = todayStr();
  if (!h.skips) h.skips = [];
  if (h.skips.includes(t)) {
    h.skips = h.skips.filter(d => d !== t);
  } else {
    h.completions = h.completions.filter(d => d !== t);
    h.skips.push(t);
  }
  persist(); renderAll();
}

function archiveHabit(id) {
  const h = habits.find(x => x.id === id);
  if (h && confirm(`Archive "${h.name}"? It will be hidden from view.`)) {
    h.isArchived = true;
    persist(); renderAll();
  }
}

function unarchiveHabit(id) {
  const h = habits.find(x => x.id === id);
  if (h) {
    h.isArchived = false;
    persist(); renderAll();
    showToast('📦', `"${h.name}" restored to active tracking!`);
  }
}

function resetStreak(id) {
  if (!confirm('Reset this streak? Completion history will be cleared.')) return;
  const h = habits.find(x => x.id === id);
  if (h) { h.completions = []; h.skips = []; persist(); renderAll(); }
}

function deleteHabit(id) {
  if (!confirm('Delete this habit?')) return;
  habits = habits.filter(x => x.id !== id);
  persist(); renderAll();
}

function addHabit() {
  const name = document.getElementById('habit-name-inp').value.trim();
  const category = document.getElementById('habit-cat-inp').value.trim() || 'General';
  if (!name) return;
  habits.push({
    id: `${Date.now()}`,
    name,
    color:       selectedColor,
    completions: [],
    skips:       [],
    isArchived:  false,
    category,
    createdAt:   todayStr(),
  });
  persist(); renderAll(); closeModal();
}

/* RENDER */
function switchView(v) {
  currentView = v;
  document.getElementById('vtab-today').classList.toggle('active',    v === 'today');
  document.getElementById('vtab-all').classList.toggle('active',      v === 'all');
  document.getElementById('vtab-archived').classList.toggle('active', v === 'archived');
  renderHabits();
}

function renderAll() { renderStats(); renderHabits(); }

function renderStats() {
  const today       = todayStr();
  const doneToday   = habits.filter(h => h.completions.includes(today));
  const totalStreak = habits.reduce((s, h) => s + calcStreak(h), 0);
  const rate        = habits.length ? Math.round((doneToday.length / habits.length) * 100) : 0;
  document.getElementById('stat-total').textContent   = habits.length;
  document.getElementById('stat-done').textContent    = doneToday.length;
  document.getElementById('stat-streak').textContent  = totalStreak;
  document.getElementById('stat-rate').textContent    = rate + '%';
  document.getElementById('overall-fill').style.width = rate + '%';
}

function renderHabits() {
  const list           = document.getElementById('habit-list');
  const today          = todayStr();
  const activeHabits   = habits.filter(h => !h.isArchived);
  const archivedHabits = habits.filter(h => h.isArchived);

  let filtered = [];
  if (currentView === 'today')    filtered = activeHabits.filter(h => !h.completions.includes(today));
  else if (currentView === 'all') filtered = activeHabits;
  else if (currentView === 'archived') filtered = archivedHabits;

  if (activeHabits.length === 0 && currentView !== 'archived') {
    list.innerHTML = `<div class="empty-state"><span class="empty-icon">🥺</span><p class="empty-title">No habits yet</p><p class="empty-desc">Start building your ritual. Add your first habit above.</p></div>`;
    return;
  }
  if (currentView === 'today' && filtered.length === 0) {
    list.innerHTML = `<div class="empty-state"><span class="empty-icon">🎉</span><p class="empty-title">All done for today!</p><p class="empty-desc">You've completed every habit. Come back tomorrow.</p></div>`;
    return;
  }
  if (currentView === 'archived' && filtered.length === 0) {
    list.innerHTML = `<div class="empty-state"><span class="empty-icon">📦</span><p class="empty-title">Vault is empty</p><p class="empty-desc">Habits you archive will show up here safely.</p></div>`;
    return;
  }
  list.innerHTML = filtered.map((h, i) => buildCard(h, i)).join('');
}

function buildCard(h, index) {
  const today     = todayStr();
  const doneToday = h.completions.includes(today);
  const streak    = calcStreak(h);
  const progress  = Math.min((streak / 21) * 100, 100);
  const week      = weekDays();
  const cardBg    = doneToday ? h.color.bg : 'var(--white)';
  const delay     = index * 60;

  const weekHtml = week.map(({ date, label }) => {
    const done    = (h.completions || []).includes(date);
    const skipped = (h.skips || []).includes(date);
    let dotBg = 'var(--border)';
    if (done)    dotBg = h.color.dot;
    if (skipped) dotBg = 'repeating-linear-gradient(45deg,#706040,#706040 2px,var(--border) 2px,var(--border) 4px)';
    return `<div class="day-cell"><div class="day-dot" style="background:${dotBg}"></div><span class="day-label">${label}</span></div>`;
  }).join('');

  return `
    <div class="habit-card" style="border-left-color:${h.color.dot};background:${cardBg};animation-delay:${delay}ms">
      <div class="card-top">
        <div class="card-left">
          <div class="habit-dot" style="background:${h.color.dot}"></div>
          <div>
            <p class="habit-name">${escHtml(h.name)}</p>
            <p class="habit-meta">
              <span class="cat-tag" style="background:${h.color.bg};color:${h.color.dot};padding:2px 6px;border-radius:4px;font-weight:600;font-size:10.5px;text-transform:uppercase;">
                ${escHtml(h.category || 'General')}
              </span>
              ${streak > 0 ? `🔥 ${streak} day streak` : 'No active streak'}
              ${doneToday ? '<span class="done-badge">Done today</span>' : ''}
            </p>
          </div>
        </div>
        <button class="check-btn"
                style="border-color:${h.color.dot};background:${doneToday ? h.color.dot : 'transparent'};color:${doneToday ? '#fff' : h.color.dot}"
                onclick="toggleHabit('${h.id}')"
                title="${doneToday ? 'Mark incomplete' : 'Mark complete'}">
          ${doneToday ? '✓' : '○'}
        </button>
      </div>
      <div class="week-row">${weekHtml}</div>
      <div class="progress-wrap">
        <div class="progress-bar" style="width:${progress}%;background:${h.color.dot}"></div>
      </div>
      <p class="progress-lbl">${streak}/21 days to milestone</p>
      <div class="card-footer">
        ${h.isArchived ? `
          <button class="text-btn" onclick="unarchiveHabit('${h.id}')">↩️ Bring Back</button>
        ` : `
          <button class="text-btn" onclick="toggleSkip('${h.id}')">
            ${h.skips && h.skips.includes(todayStr()) ? '🚫 Unskip Day' : '⏳ Skip Day'}
          </button>
          <button class="text-btn" onclick="archiveHabit('${h.id}')">📦 Archive</button>
        `}
        <button class="text-btn" onclick="resetStreak('${h.id}')">Reset</button>
        <button class="text-btn danger" onclick="deleteHabit('${h.id}')">Delete</button>
      </div>
    </div>`;
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* MODALS */
function openModal() {
  document.getElementById('habit-name-inp').value = '';
  const catInp = document.getElementById('habit-cat-inp');
  catInp.value = '';
  catInp.onfocus = () => catInp.setAttribute('placeholder', '');
  catInp.onblur  = () => catInp.setAttribute('placeholder', 'Select or type a category...');
  selectedColor  = COLORS[0];
  renderColorPicker();
  document.getElementById('modal-overlay').classList.add('open');
  setTimeout(() => document.getElementById('habit-name-inp').focus(), 200);
}

function closeModal()    { document.getElementById('modal-overlay').classList.remove('open'); }
function overlayClick(e) { if (e.target === document.getElementById('modal-overlay')) closeModal(); }

function renderColorPicker() {
  document.getElementById('color-row').innerHTML = COLORS.map(c => `
    <button class="color-dot-btn ${c.name === selectedColor.name ? 'selected' : ''}"
            style="background:${c.dot};color:${c.dot}" onclick="pickColor('${c.name}')" title="${c.name}">
    </button>`).join('');
}

function pickColor(name) {
  selectedColor = COLORS.find(c => c.name === name);
  renderColorPicker();
}

function handleCategoryColorMap() {
  const catInp = document.getElementById('habit-cat-inp');
  if (!catInp) return;
  catInp.addEventListener('input', e => {
    const val = e.target.value.trim();
    let target = 'amber';
    if (val === 'Health')   target = 'sage';
    if (val === 'Business') target = 'amber';
    if (val === 'Mindset')  target = 'violet';
    const matched = COLORS.find(c => c.name === target);
    if (matched) { selectedColor = matched; renderColorPicker(); }
  });
}

/* DARK MODE */
function toggleTheme() {
  document.body.classList.toggle('dark-theme');
  const isDark = document.body.classList.contains('dark-theme');
  localStorage.setItem('dm_theme', isDark ? 'dark' : 'light');
}

/* NOTIFICATIONS */
function getSavedTime() { return localStorage.getItem('dm_notif_time') || '20:00'; }

function setupNotifications() {
  notifEnabled = localStorage.getItem('dm_notif') === '1';
  const btn    = document.getElementById('bell-btn');
  if (notifEnabled && 'Notification' in window && Notification.permission === 'granted') {
    btn.classList.add('active');
    scheduleReminder();
  } else {
    btn.classList.remove('active');
    notifEnabled = false;
  }
}

function toggleNotifications() {
  if (!('Notification' in window)) { showToast('⚠️', 'Notifications not supported in this browser'); return; }
  if (!notifEnabled) {
    document.getElementById('notif-time-inp').value = getSavedTime();
    document.getElementById('notif-modal-overlay').classList.add('open');
  } else {
    notifEnabled = false;
    localStorage.removeItem('dm_notif');
    if (reminderTimer) clearTimeout(reminderTimer);
    const btn = document.getElementById('bell-btn');
    btn.classList.remove('active');
    btn.title = 'Click to set daily reminder';
    showToast('🔕', 'Daily reminder turned off');
  }
}

function confirmNotifTime() {
  const time = document.getElementById('notif-time-inp').value || '20:00';
  localStorage.setItem('dm_notif_time', time);
  closeNotifModal();
  if (!('Notification' in window)) { showToast('⚠️', 'Notifications not supported'); return; }
  Notification.requestPermission().then(perm => {
    if (perm === 'granted') {
      notifEnabled = true;
      localStorage.setItem('dm_notif', '1');
      const btn = document.getElementById('bell-btn');
      btn.classList.add('active');
      btn.title = `Reminder set for ${formatTime(time)} — click to disable`;
      scheduleReminder();
      showToast('🔔', `Reminder set for ${formatTime(time)} daily`);
    } else {
      showToast('⚠️', 'Enable notifications in your browser settings');
    }
  });
}

function closeNotifModal()    { document.getElementById('notif-modal-overlay').classList.remove('open'); }
function notifOverlayClick(e) { if (e.target === document.getElementById('notif-modal-overlay')) closeNotifModal(); }

function formatTime(t) {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function scheduleReminder() {
  if (reminderTimer) clearTimeout(reminderTimer);
  const [h, m] = getSavedTime().split(':').map(Number);
  const now = new Date(), target = new Date();
  target.setHours(h, m, 0, 0);
  if (now >= target) target.setDate(target.getDate() + 1);
  reminderTimer = setTimeout(() => { fireReminder(); scheduleReminder(); }, target - now);
}

function fireReminder() {
  if (!notifEnabled || Notification.permission !== 'granted') return;
  const t       = todayStr();
  const pending = habits.filter(h => !h.completions.includes(t) && !h.isArchived);
  if (!pending.length) return;
  const body = pending.length === 1
    ? `Don't forget: "${pending[0].name}"`
    : `You have ${pending.length} habits left for today`;
  new Notification('DailyMe — Daily Check-in', { body });
}

/* TOAST */
function showToast(icon, msg) {
  document.getElementById('toast-icon').innerHTML  = icon;
  document.getElementById('toast-msg').textContent = msg;
  const t = document.getElementById('toast');
  t.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
}

/* INIT */
auth.onAuthStateChanged(async (firebaseUser) => {
  if (firebaseUser) {
    const user = {
      uid:   firebaseUser.uid,
      name:  firebaseUser.displayName || firebaseUser.email.split('@')[0],
      email: firebaseUser.email,
    };
    await loginUser(user);
  } else {
    document.getElementById('loading-screen').style.display = 'none';
    document.getElementById('auth-screen').style.display    = 'flex';
  }
  renderColorPicker();
  handleCategoryColorMap();
  if (localStorage.getItem('dm_theme') === 'dark') {
    document.body.classList.add('dark-theme');
  }
});