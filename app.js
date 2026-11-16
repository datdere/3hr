'use strict';

const GOAL_MIN = 180; // 4단계에서 설정으로 바뀜
const STORE_KEY = 'my3hrs.v1';
const LEGACY_ENTRIES = 'my3hr.entries';
const LEGACY_TIMER = 'my3hr.timerStart';

// ---------- 저장 ----------
// data = { version: 1, entries: [{ id, date: 'YYYY-MM-DD', minutes, tagId }] }
function readJSON(key) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; }
}
function persist() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch { /* 저장 불가 환경 */ }
}
function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

function loadData() {
  const stored = readJSON(STORE_KEY);
  if (stored && Array.isArray(stored.entries)) return stored;
  // 초안(타이머·메모 버전) 데이터 이전: 메모는 버리고 태그 없음으로
  const legacy = readJSON(LEGACY_ENTRIES);
  const migrated = { version: 1, entries: [] };
  if (Array.isArray(legacy)) {
    for (const e of legacy) {
      if (e && typeof e.date === 'string' && e.minutes > 0) {
        migrated.entries.push({ id: newId(), date: e.date, minutes: Math.round(e.minutes), tagId: null });
      }
    }
  }
  try { localStorage.removeItem(LEGACY_TIMER); } catch {}
  return migrated;
}
let data = loadData();
persist();

// ---------- 날짜 (월요일 시작) ----------
const pad = n => String(n).padStart(2, '0');
function ymd(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function parseYmd(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function weekStart(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return addDays(x, -((x.getDay() + 6) % 7));
}
function fmtShort(d) { return `${d.getMonth() + 1}/${d.getDate()}`; }
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
function fmtMin(min) {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  if (!h) return `${m}분`;
  return m ? `${h}시간 ${m}분` : `${h}시간`;
}
function thisWeek() {
  const start = weekStart(new Date());
  return { start, from: ymd(start), to: ymd(addDays(start, 6)) };
}
function inRange(e, from, to) { return e.date >= from && e.date <= to; }
function weekMinutes(start) {
  const from = ymd(start), to = ymd(addDays(start, 6));
  return data.entries.filter(e => inRange(e, from, to)).reduce((s, e) => s + e.minutes, 0);
}
// 이번 주(오늘까지)만 추가·수정 가능, 지난 주는 잠금
function isEditableDate(date) {
  const { from } = thisWeek();
  return date >= from && date <= ymd(new Date());
}

// ---------- 기록 조작 ----------
function addEntry(date, minutes) {
  const e = { id: newId(), date, minutes, tagId: null };
  data.entries.push(e);
  persist(); render();
  return e;
}
function updateEntry(id, date, minutes) {
  const e = data.entries.find(x => x.id === id);
  if (!e || !isEditableDate(e.date)) return;
  e.date = date; e.minutes = minutes;
  persist(); render();
}
function removeEntry(id) {
  const i = data.entries.findIndex(x => x.id === id);
  if (i < 0) return null;
  const [e] = data.entries.splice(i, 1);
  persist(); render();
  return e;
}

// ---------- 토스트 (되돌리기) ----------
const $ = id => document.getElementById(id);
let toastTimer = null, undoFn = null;
function toast(text, undo) {
  $('toast-text').textContent = text;
  undoFn = undo;
  $('toast-undo').hidden = !undo;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, 5000);
}
function hideToast() { $('toast').hidden = true; undoFn = null; }
$('toast-undo').onclick = () => { const f = undoFn; hideToast(); if (f) f(); };

// ---------- 렌더 ----------
function render() {
  const now = new Date();
  const { start, from, to } = thisWeek();
  $('week-label').textContent = `이번 주 ${fmtShort(start)}(월) – ${fmtShort(addDays(start, 6))}(일)`;

  const done = weekMinutes(start);
  const pct = Math.min(100, Math.round((done / GOAL_MIN) * 100));
  $('bar-fill').style.width = pct + '%';
  $('bar').setAttribute('aria-valuenow', pct);
  $('progress-text').textContent = `${fmtMin(done)} / ${fmtMin(GOAL_MIN)}`;

  if (done >= GOAL_MIN) {
    $('pace').textContent = '🎉 이번 주 목표 달성! 잘했어요.';
  } else {
    const remaining = GOAL_MIN - done;
    const daysLeft = 7 - ((now.getDay() + 6) % 7); // 오늘 포함
    const perDay = Math.ceil(remaining / daysLeft / 5) * 5;
    $('pace').textContent = daysLeft === 1
      ? `${fmtMin(remaining)} 남음 · 오늘이 이번 주 마지막 날이에요`
      : `${fmtMin(remaining)} 남음 · 남은 ${daysLeft}일 동안 하루 ${fmtMin(perDay)}`;
  }

  // 이번 주 기록
  const week = data.entries.filter(e => inRange(e, from, to))
    .sort((a, b) => b.date.localeCompare(a.date));
  const list = $('entries');
  list.innerHTML = '';
  for (const e of week) {
    const d = parseYmd(e.date);
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'entry';
    const label = document.createElement('span');
    label.textContent = `${fmtShort(d)}(${DOW[d.getDay()]}) · ${fmtMin(e.minutes)}`;
    const hint = document.createElement('span');
    hint.className = 'edit';
    hint.textContent = '수정';
    btn.append(label, hint);
    btn.onclick = () => openEditor(e);
    li.append(btn);
    list.append(li);
  }
  $('entries-empty').hidden = week.length > 0;

  // 지난 8주 (잠금, 보기 전용)
  const hist = $('history');
  hist.innerHTML = '';
  let streak = 0, counting = true;
  for (let i = 1; i <= 8; i++) {
    const ws = addDays(start, -7 * i);
    const m = weekMinutes(ws);
    const ok = m >= GOAL_MIN;
    if (counting) { if (ok) streak++; else counting = false; }
    const li = document.createElement('li');
    const a = document.createElement('span');
    a.className = 'grow';
    a.textContent = `${fmtShort(ws)} – ${fmtShort(addDays(ws, 6))}`;
    const b = document.createElement('span');
    b.textContent = ok ? `✓ ${fmtMin(m)}` : fmtMin(m);
    if (ok) b.className = 'ok';
    li.append(a, b);
    hist.append(li);
  }
  $('streak').textContent = streak ? `연속 ${streak}주 달성 중` : '지난주까지 연속 달성 기록이 없어요.';
}

// ---------- 빠른 입력 ----------
document.querySelectorAll('.quick-btn').forEach(btn => {
  btn.onclick = () => {
    const minutes = Number(btn.dataset.min);
    const e = addEntry(ymd(new Date()), minutes);
    toast(`${fmtMin(minutes)} 기록했어요`, () => removeEntry(e.id));
  };
});

// ---------- 직접 입력 / 수정 다이얼로그 ----------
let editingId = null;
function openEditor(entry) {
  const { from } = thisWeek();
  const today = ymd(new Date());
  editingId = entry ? entry.id : null;
  const locked = entry && !isEditableDate(entry.date);
  $('editor-title').textContent = entry ? '기록 수정' : '직접 입력';
  $('ed-date').min = from;
  $('ed-date').max = today;
  $('ed-date').value = entry ? entry.date : today;
  const min = entry ? entry.minutes : 0;
  $('ed-h').value = Math.floor(min / 60);
  $('ed-m').value = min % 60;
  $('ed-delete').hidden = !entry;
  $('ed-error').hidden = true;
  for (const el of ['ed-date', 'ed-h', 'ed-m']) $(el).disabled = !!locked;
  $('editor').showModal();
  if (!entry) $('ed-h').focus();
}
function showError(msg) { $('ed-error').textContent = msg; $('ed-error').hidden = false; }

$('custom-btn').onclick = () => openEditor(null);
$('ed-cancel').onclick = () => $('editor').close();
$('editor-form').onsubmit = ev => {
  ev.preventDefault();
  const date = $('ed-date').value;
  const minutes = (Number($('ed-h').value) || 0) * 60 + (Number($('ed-m').value) || 0);
  if (!isEditableDate(date)) return showError('이번 주의 오늘까지 날짜만 고를 수 있어요.');
  if (minutes < 1) return showError('시간을 입력해 주세요.');
  if (minutes > 24 * 60) return showError('하루 24시간을 넘을 수 없어요.');
  if (editingId) {
    updateEntry(editingId, date, minutes);
    toast('기록을 수정했어요');
  } else {
    const e = addEntry(date, minutes);
    toast(`${fmtMin(minutes)} 기록했어요`, () => removeEntry(e.id));
  }
  $('editor').close();
};
$('ed-delete').onclick = () => {
  const e = removeEntry(editingId);
  $('editor').close();
  if (e) toast('기록을 삭제했어요', () => { data.entries.push(e); persist(); render(); });
};

render();
// 자정·주가 바뀌는 것을 반영
setInterval(render, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
