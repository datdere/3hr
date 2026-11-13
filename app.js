'use strict';

const GOAL_MIN = 180; // 1주일 목표: 3시간
const STORE_KEY = 'my3hr.entries';
const TIMER_KEY = 'my3hr.timerStart';

// ---- 저장소 ----
function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 저장 불가 환경 */ }
}
let entries = load(STORE_KEY, []); // { id, date: 'YYYY-MM-DD', minutes, memo }

// ---- 날짜 유틸 (주는 월요일 시작) ----
function ymd(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function parseYmd(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function weekStart(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function fmtMin(min) {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  if (!h) return `${m}분`;
  return m ? `${h}시간 ${m}분` : `${h}시간`;
}
function fmtShort(d) { return `${d.getMonth() + 1}/${d.getDate()}`; }
function minutesInWeek(start) {
  const from = ymd(start), to = ymd(addDays(start, 6));
  return entries.filter(e => e.date >= from && e.date <= to).reduce((s, e) => s + e.minutes, 0);
}

// ---- 기록 ----
function addEntry(date, minutes, memo) {
  if (!(minutes > 0)) return;
  entries.push({ id: Date.now() + Math.random(), date, minutes: Math.round(minutes), memo: memo || '' });
  save(STORE_KEY, entries);
  render();
}
function deleteEntry(id) {
  entries = entries.filter(e => e.id !== id);
  save(STORE_KEY, entries);
  render();
}

// ---- 렌더 ----
const $ = id => document.getElementById(id);

function render() {
  const now = new Date();
  const start = weekStart(now);
  const end = addDays(start, 6);
  $('week-label').textContent = `이번 주 ${fmtShort(start)} – ${fmtShort(end)}`;

  const done = minutesInWeek(start);
  const pct = Math.min(100, (done / GOAL_MIN) * 100);
  $('bar-fill').style.width = pct + '%';
  $('progress-text').textContent = `${fmtMin(done)} / 3시간`;
  if (done >= GOAL_MIN) {
    $('progress-sub').textContent = '🎉 이번 주 목표 달성! 잘했어요.';
  } else {
    const daysLeft = 7 - ((now.getDay() + 6) % 7);
    $('progress-sub').textContent = `${fmtMin(GOAL_MIN - done)} 남음 · 이번 주 ${daysLeft}일 남았어요`;
  }

  // 이번 주 기록
  const from = ymd(start), to = ymd(end);
  const week = entries.filter(e => e.date >= from && e.date <= to)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  const list = $('entries');
  list.innerHTML = '';
  for (const e of week) {
    const li = document.createElement('li');
    const text = document.createElement('span');
    text.className = 'grow';
    text.textContent = `${fmtShort(parseYmd(e.date))} · ${fmtMin(e.minutes)}${e.memo ? ' · ' + e.memo : ''}`;
    const del = document.createElement('button');
    del.className = 'del';
    del.textContent = '삭제';
    del.setAttribute('aria-label', '기록 삭제');
    del.onclick = () => { if (confirm('이 기록을 삭제할까요?')) deleteEntry(e.id); };
    li.append(text, del);
    list.append(li);
  }
  $('entries-empty').style.display = week.length ? 'none' : '';

  // 지난 8주
  const hist = $('history');
  hist.innerHTML = '';
  let streak = 0, counting = true;
  for (let i = 1; i <= 8; i++) {
    const ws = addDays(start, -7 * i);
    const m = minutesInWeek(ws);
    const ok = m >= GOAL_MIN;
    if (counting) { if (ok) streak++; else counting = false; }
    const li = document.createElement('li');
    li.innerHTML = `<span class="grow"></span><span></span>`;
    li.children[0].textContent = `${fmtShort(ws)} – ${fmtShort(addDays(ws, 6))}`;
    li.children[1].textContent = ok ? `✓ ${fmtMin(m)}` : fmtMin(m);
    if (ok) li.children[1].className = 'ok';
    hist.append(li);
  }
  $('streak').textContent = streak ? `연속 ${streak}주 달성 중` : '지난주까지 연속 달성 기록이 없어요.';
}

// ---- 타이머 ----
let tick = null;
function timerStart() { return load(TIMER_KEY, null); }
function updateTimer() {
  const s = timerStart();
  const btn = $('timer-btn');
  if (!s) {
    $('timer-display').textContent = '00:00:00';
    btn.textContent = '시작'; btn.classList.remove('running');
    clearInterval(tick); tick = null;
    return;
  }
  const sec = Math.floor((Date.now() - s) / 1000);
  const p = n => String(n).padStart(2, '0');
  $('timer-display').textContent = `${p(Math.floor(sec / 3600))}:${p(Math.floor(sec / 60) % 60)}:${p(sec % 60)}`;
  btn.textContent = '종료하고 기록'; btn.classList.add('running');
  if (!tick) tick = setInterval(updateTimer, 1000);
}
$('timer-btn').onclick = () => {
  const s = timerStart();
  if (!s) {
    save(TIMER_KEY, Date.now());
  } else {
    const minutes = (Date.now() - s) / 60000;
    try { localStorage.removeItem(TIMER_KEY); } catch {}
    if (minutes < 1) alert('1분 미만은 기록되지 않아요.');
    else addEntry(ymd(new Date(s)), minutes, $('timer-memo').value.trim());
    $('timer-memo').value = '';
  }
  updateTimer();
};

// ---- 직접 기록 ----
$('manual-date').value = ymd(new Date());
$('manual-form').onsubmit = ev => {
  ev.preventDefault();
  addEntry($('manual-date').value, Number($('manual-min').value), $('manual-memo').value.trim());
  $('manual-min').value = ''; $('manual-memo').value = '';
};

render();
updateTimer();
// 주가 바뀌는 경우 대비해 1분마다 다시 그림
setInterval(render, 60000);
