// UI, roles, and the event log. See PROTOCOL.md for the log format.
import { AudioEngine, chirpDurationMs } from './audio.js';
import { respond } from './rules.js';

const PROTOCOL_VERSION = 1;

const DEFAULTS = {
  carrier_hz: 4500,
  pulse_count: 3,
  pulse_ms: 20,
  pulse_period_ms: 40,
  volume: 1.0,
  call_period_ms: 2000,
  response_delay_ms: 400,
  refractory_ms: 250,
  threshold_db: -45,
  filter_q: 6,
  rule: 'fixed_delay',
};

const PARAM_UI = [
  ['Chirp'],
  ['carrier_hz', 'Pitch (carrier)', 'Hz', 1000, 12000, 50],
  ['pulse_count', 'Pulses per chirp', '', 1, 20, 1],
  ['pulse_ms', 'Pulse length', 'ms', 3, 200, 1],
  ['pulse_period_ms', 'Pulse spacing (start to start)', 'ms', 5, 500, 1],
  ['volume', 'Volume', '0–1', 0, 1, 0.05],
  ['Timing'],
  ['call_period_ms', 'Emitter: time between chirps', 'ms', 200, 60000, 50],
  ['response_delay_ms', 'Responder: wait before answering', 'ms', 0, 10000, 10],
  ['refractory_ms', 'Deaf after chirping (refractory)', 'ms', 0, 10000, 10],
  ['Detection'],
  ['threshold_db', 'Threshold', 'dBFS', -100, 0, 1],
  ['filter_q', 'Filter sharpness (Q)', '', 1, 30, 0.5],
];

const ROLE_HELP = {
  emitter: 'Chirps on a timer and logs everything it hears.',
  responder: 'Listens. When it hears a chirp, it waits, then chirps back.',
  calibrate: 'Chirps 6 times to itself to measure this phone’s built-in delay. Keep quiet.',
};

// ---------- storage (may be unavailable, e.g. private mode) ----------
const store = {
  get(k, fallback) {
    try { const v = localStorage.getItem('cc.' + k); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(k, v) { try { localStorage.setItem('cc.' + k, JSON.stringify(v)); } catch {} },
};

// ---------- state ----------
const $ = (id) => document.getElementById(id);
const engine = new AudioEngine();
const S = {
  params: { ...DEFAULTS, ...store.get('params', {}) },
  device: store.get('device', null) || 'dev-' + Math.random().toString(36).slice(2, 6),
  role: store.get('role', 'emitter'),
  running: false,
  seq: store.get('seq', 0),
  lines: store.get('log', []),
  run: null,
  timers: new Set(),
  pending: false,
  lastEmitAudio: null,
  nDetect: 0,
  nEmit: 0,
  calibration: store.get('calibration', null),
};

// URL query overrides, e.g. ?role=responder&response_delay_ms=300
const q = new URLSearchParams(location.search);
for (const k of Object.keys(DEFAULTS)) {
  if (q.has(k)) S.params[k] = typeof DEFAULTS[k] === 'number' ? Number(q.get(k)) : q.get(k);
}
if (q.has('role') && ROLE_HELP[q.get('role')]) S.role = q.get('role');
store.set('device', S.device);

// ---------- logging ----------
function log(event, tAudio, fields = {}) {
  const tMono = engine.ctx ? engine.audioToMono(tAudio) : performance.now();
  const entry = {
    v: PROTOCOL_VERSION,
    event,
    device: S.device,
    run: S.run,
    role: S.role,
    seq: ++S.seq,
    t_audio: round(tAudio, 6),
    t_mono: round(tMono, 3),
    t_epoch: round(performance.timeOrigin + tMono, 3),
    wall: new Date().toISOString(),
    ...fields,
  };
  S.lines.push(JSON.stringify(entry));
  saveLogSoon();
  renderLog(entry);
  return entry;
}

// Log an event when audio time `tAudio` arrives (for scheduled calls etc.).
function logAt(tAudio, event, fields) {
  const id = setTimeout(() => { S.timers.delete(id); log(event, tAudio, fields); }, engine.delayUntil(tAudio));
  S.timers.add(id);
}

function later(ms, fn) {
  const id = setTimeout(() => { S.timers.delete(id); fn(); }, ms);
  S.timers.add(id);
}

const round = (x, d) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d);

let saveTimer = null;
function saveLogSoon() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = null; store.set('log', S.lines); store.set('seq', S.seq); }, 500);
}

function logConfig() {
  log('config', engine.now, {
    params: { ...S.params },
    device_info: engine.deviceInfo(),
    calibration: S.calibration,
  });
}

// ---------- calling ----------
// Schedule a chirp at audio time `when`, with its refractory period.
function call(when, cause, extra = {}) {
  const t = engine.chirpAt(when);
  const refr = S.params.refractory_ms / 1000;
  if (refr > 0) engine.mute(t, t + refr);
  S.nEmit++;
  logAt(t, 'emit', { cause, in_response_to: null, decided_t_audio: round(engine.now, 6), ...extra });
  later(engine.delayUntil(t), () => { S.lastEmitAudio = t; flash('light-chirp'); });
  if (refr > 0) {
    logAt(t, 'refractory_start', { duration_ms: S.params.refractory_ms });
    logAt(t + refr, 'refractory_end', { duration_ms: S.params.refractory_ms });
  }
  return t;
}

function onDetect(m) {
  if (!S.running) return;
  S.nDetect++;
  flash('light-heard');
  const det = log('detect', m.tAudio, {
    level_db: round(m.level, 1),
    threshold_db: m.threshold,
    muted: false,
    pending: S.pending,
  });
  if (S.role === 'calibrate' && S.cal) S.cal.dets.push(m);
  if (S.role === 'responder') {
    const delay = respond({ seq: det.seq, t_audio: m.tAudio, level_db: m.level },
      { pending: S.pending, lastEmitAudio: S.lastEmitAudio }, S.params);
    if (delay != null) {
      S.pending = true;
      const t = call(m.tAudio + delay / 1000, 'response', { in_response_to: det.seq, delay_ms: delay });
      later(engine.delayUntil(t), () => { S.pending = false; });
    }
  }
  updateStatus();
}

// Emitter: a look-ahead scheduler keeps calls exactly on the audio clock.
function startEmitter() {
  let next = engine.now + 0.5;
  const tick = () => {
    while (next < engine.now + 0.25) {
      call(next, 'timer');
      next += S.params.call_period_ms / 1000;
    }
    later(50, tick);
  };
  tick();
}

// Calibration: chirp to ourselves (no refractory) and time how long each
// chirp takes to come back through the phone's own microphone. This is the
// loopback latency, output + input (see DESIGN.md, Timing and latency).
const CAL_N = 6, CAL_SPACING = 0.7, CAL_WINDOW = 0.4;

function startCalibration() {
  S.cal = { emits: [], dets: [] };
  const first = engine.now + 0.5;
  for (let i = 0; i < CAL_N; i++) {
    const t = engine.chirpAt(first + i * CAL_SPACING);
    S.cal.emits.push(t);
    S.nEmit++;
    logAt(t, 'emit', { cause: 'calibration', in_response_to: null, decided_t_audio: round(engine.now, 6) });
    later(engine.delayUntil(t), () => flash('light-chirp'));
  }
  later(engine.delayUntil(S.cal.emits[CAL_N - 1] + CAL_WINDOW + 0.2), finishCalibration);
}

function finishCalibration() {
  const { emits, dets } = S.cal;
  const lat = [], levels = [];
  for (const e of emits) {
    const d = dets.find(d => d.tAudio >= e && d.tAudio < e + CAL_WINDOW);
    lat.push(d ? round((d.tAudio - e) * 1000, 2) : null);
    if (d) levels.push(d.level);
  }
  const ok = lat.filter(x => x != null).sort((a, b) => a - b);
  const median = (a) => a.length ? (a.length % 2 ? a[a.length >> 1] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2) : null;
  const result = {
    latencies_ms: lat,
    median_ms: round(median(ok), 2),
    min_ms: ok.length ? ok[0] : null,
    max_ms: ok.length ? ok[ok.length - 1] : null,
    n_ok: ok.length,
    n_total: CAL_N,
    level_db: round(median(levels.sort((a, b) => a - b)), 1),
  };
  log('calibration', engine.now, result);
  if (ok.length >= 3) {
    S.calibration = { ...result, device: S.device, wall: new Date().toISOString() };
    store.set('calibration', S.calibration);
  } else {
    showBanner(`Calibration heard only ${ok.length} of ${CAL_N} chirps. Check that the volume is up and silent mode is off, tap Auto-set threshold in a quiet room, and try again.`);
  }
  S.cal = null;
  renderCalibration();
  stop();
}

function renderCalibration() {
  const c = S.calibration;
  $('cal-info').textContent = c
    ? `Loopback latency: ${c.median_ms} ms (${c.n_ok}/${c.n_total}, spread ${round(c.max_ms - c.min_ms, 1)} ms) · calibrated ${c.wall.slice(0, 10)}`
    : 'Not calibrated yet: run Calibrate once on this phone.';
}

// ---------- run control ----------
async function start() {
  const btn = $('start');
  btn.disabled = true;
  hideBanner();
  try {
    await engine.start(S.params);
  } catch (e) {
    btn.disabled = false;
    showBanner(micErrorText(e));
    return;
  }
  btn.disabled = false;
  S.running = true;
  S.run = Math.random().toString(36).slice(2, 8);
  S.nDetect = S.nEmit = 0;
  S.pending = false;
  logConfig();
  keepAwake();
  if (S.role === 'emitter') startEmitter();
  else if (S.role === 'calibrate') startCalibration();
  renderRunning();
}

function stop() {
  if (!S.running) return;
  for (const id of S.timers) clearTimeout(id);
  S.timers.clear();
  engine.stopAll();
  log('run_end', engine.now, { n_detect: S.nDetect, n_emit: S.nEmit });
  S.running = false;
  S.pending = false;
  S.cal = null;
  store.set('log', S.lines); store.set('seq', S.seq);
  releaseWake();
  renderRunning();
}

function micErrorText(e) {
  if (e && e.name === 'NotAllowedError') {
    return 'Microphone blocked. In Safari, tap "aA" in the address bar → Website Settings → Microphone → Allow, then reload.';
  }
  if (!window.isSecureContext) return 'This page must be opened over https:// for the microphone to work.';
  return 'Could not start audio: ' + (e && e.message ? e.message : e);
}

// ---------- wake lock ----------
let wakeLock = null;
async function keepAwake() {
  if (!('wakeLock' in navigator)) {
    $('wake-info').textContent = 'Screen wake lock not supported: set Auto-Lock to Never during tests.';
    return;
  }
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    $('wake-info').textContent = 'Screen will stay on while running.';
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch (e) {
    $('wake-info').textContent = 'Could not keep the screen on (' + e.name + '). Set Auto-Lock to Never during tests.';
  }
}
function releaseWake() {
  if (wakeLock) wakeLock.release().catch(() => {});
  wakeLock = null;
  $('wake-info').textContent = '';
}
document.addEventListener('visibilitychange', () => {
  if (!S.running) return;
  if (document.visibilityState === 'visible') {
    keepAwake();
    showBanner('The page was in the background, so the phone may have stopped listening. Check the log; if in doubt, Stop and Start again.');
  }
});

// ---------- UI ----------
function renderRoles() {
  for (const b of document.querySelectorAll('.roles button')) {
    b.setAttribute('aria-checked', String(b.dataset.role === S.role));
    b.disabled = S.running;
  }
  $('role-help').textContent = ROLE_HELP[S.role];
}

function renderRunning() {
  const btn = $('start');
  btn.textContent = S.running ? 'Stop' : 'Start';
  btn.classList.toggle('running', S.running);
  $('device').disabled = S.running;
  renderRoles();
  updateStatus();
}

function updateStatus() {
  let s = 'Stopped';
  if (S.running) {
    if (S.role === 'emitter') s = `Calling · ${S.nEmit} chirps · heard ${S.nDetect}`;
    else if (S.role === 'responder') s = `Listening · heard ${S.nDetect} · answered ${S.nEmit}`;
    else s = 'Calibrating…';
  }
  $('status').textContent = s;
}

function renderParams() {
  const box = $('params');
  box.innerHTML = '';
  for (const row of PARAM_UI) {
    if (row.length === 1) {
      const h = document.createElement('h3'); h.textContent = row[0]; box.append(h); continue;
    }
    const [key, label, unit, min, max, step] = row;
    const wrap = document.createElement('label'); wrap.className = 'param';
    wrap.innerHTML = `<span>${label}<small>${unit} · default ${DEFAULTS[key]}</small></span>`;
    const inp = document.createElement('input');
    Object.assign(inp, { type: 'number', inputMode: 'decimal', min, max, step, value: S.params[key] });
    inp.addEventListener('change', () => {
      const v = Number(inp.value);
      if (!Number.isFinite(v)) { inp.value = S.params[key]; return; }
      setParam(key, Math.min(max, Math.max(min, v)));
      inp.value = S.params[key];
    });
    wrap.append(inp);
    box.append(wrap);
  }
}

function setParam(key, value) {
  S.params[key] = value;
  store.set('params', S.params);
  if (engine.ctx) engine.setParams(S.params);
  if (S.running) logConfig();
  renderMeterThreshold();
  checkTiming();
}

function checkTiming() {
  const chirp = chirpDurationMs(S.params);
  const msgs = [];
  if (S.params.refractory_ms < chirp + 60) msgs.push(`Refractory (${S.params.refractory_ms} ms) is shorter than the chirp plus phone delay (~${chirp + 60} ms): the phone may hear itself.`);
  if (S.params.response_delay_ms <= S.params.refractory_ms) msgs.push('The emitter will not hear the reply: make the response delay longer than the refractory period.');
  if (msgs.length) showBanner(msgs.join(' ')); else hideBanner();
}

// meter: -90..0 dBFS
const pct = (db) => Math.max(0, Math.min(100, (db + 90) / 90 * 100));
let meterPeaks = [];
engine.onMeter = (m) => {
  $('meter-bar').style.width = pct(m.peak) + '%';
  $('meter-value').textContent = m.peak.toFixed(0) + ' dB';
  meterPeaks.push(m.peak);
  if (meterPeaks.length > 200) meterPeaks.shift();
};
function renderMeterThreshold() {
  $('meter-thr').style.left = pct(S.params.threshold_db) + '%';
}

async function autoThreshold() {
  const btn = $('autothr');
  btn.disabled = true;
  const label = btn.textContent;
  btn.textContent = 'Listening for 2 seconds…';
  try { await engine.start(S.params); } catch (e) { showBanner(micErrorText(e)); btn.disabled = false; btn.textContent = label; return; }
  meterPeaks = [];
  await new Promise(r => setTimeout(r, 2000));
  const sorted = [...meterPeaks].sort((a, b) => a - b);
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? -80;
  const thr = Math.round(Math.min(-10, Math.max(-80, p95 + 15)));
  setParam('threshold_db', thr);
  renderParams();
  btn.textContent = `Threshold set to ${thr} dB (quiet room was ${p95.toFixed(0)} dB)`;
  setTimeout(() => { btn.textContent = label; btn.disabled = false; }, 3000);
}

engine.onDetect = onDetect;
engine.onStateChange = (state) => {
  if (S.running && state !== 'running') {
    showBanner(`Audio was paused by the phone (${state}). Tap Stop, then Start.`);
  }
};

const lights = {};
function flash(id) {
  const el = $(id);
  el.classList.add('on');
  clearTimeout(lights[id]);
  lights[id] = setTimeout(() => el.classList.remove('on'), 150);
}

function fmtLine(e) {
  const time = e.wall.slice(11, 23);
  let d = '';
  if (e.event === 'detect') d = `${e.level_db} dB${e.pending ? ' (ignored, busy)' : ''}`;
  else if (e.event === 'emit') d = e.cause + (e.delay_ms != null ? ` after ${e.delay_ms} ms` : '');
  else if (e.event === 'config') d = `${e.role} · thr ${e.params.threshold_db} dB`;
  else if (e.event === 'calibration') d = `median ${e.median_ms} ms (${e.n_ok}/${e.n_total})`;
  else if (e.event === 'run_end') d = `${e.n_emit} chirps, ${e.n_detect} heard`;
  else if (e.event.startsWith('refractory')) return null;
  return `${time}  ${e.event.padEnd(11)} ${d}`;
}

const shown = [];
function renderLog(entry) {
  if (entry) {
    const l = fmtLine(entry);
    if (l) { shown.push(l); if (shown.length > 150) shown.shift(); }
  }
  $('log').textContent = shown.slice().reverse().join('\n');
  $('log-count').textContent = `${S.lines.length} events`;
}

function logText() { return S.lines.join('\n') + (S.lines.length ? '\n' : ''); }
function logFileName() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  return `cricket-${S.device.replace(/[^\w-]+/g, '_')}-${stamp}.jsonl`;
}

async function shareLog() {
  if (!S.lines.length) { showBanner('The log is empty. Run a test first.'); return; }
  const name = logFileName();
  const file = new File([logText()], name, { type: 'text/plain' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
      return;
    }
  } catch (e) {
    if (e.name === 'AbortError') return; // user closed the share sheet
  }
  // Fallback: download the file.
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

async function copyLog() {
  try {
    await navigator.clipboard.writeText(logText());
    $('copy').textContent = 'Copied ✓';
    setTimeout(() => { $('copy').textContent = 'Copy log'; }, 2000);
  } catch {
    showBanner('Copy failed. Use Share log instead.');
  }
}

function clearLog() {
  if (S.running) return;
  if (!confirm('Delete the log on this phone? Share it first if you need it.')) return;
  S.lines = []; shown.length = 0;
  store.set('log', S.lines);
  renderLog();
}

function showBanner(t) { $('banner').textContent = t; $('banner').hidden = false; }
function hideBanner() { $('banner').hidden = true; }

// ---------- wire up ----------
$('device').value = S.device;
$('device').addEventListener('change', () => {
  S.device = $('device').value.trim() || S.device;
  $('device').value = S.device;
  store.set('device', S.device);
});
for (const b of document.querySelectorAll('.roles button')) {
  b.addEventListener('click', () => { if (!S.running) { S.role = b.dataset.role; store.set('role', S.role); renderRoles(); } });
}
$('start').addEventListener('click', () => (S.running ? stop() : start()));
$('autothr').addEventListener('click', autoThreshold);
$('share').addEventListener('click', shareLog);
$('copy').addEventListener('click', copyLog);
$('clear').addEventListener('click', clearLog);
$('reset').addEventListener('click', () => {
  S.params = { ...DEFAULTS };
  store.set('params', S.params);
  if (engine.ctx) engine.setParams(S.params);
  if (S.running) logConfig();
  renderParams(); renderMeterThreshold(); checkTiming();
});

for (const l of S.lines.slice(-150)) { try { renderLog(JSON.parse(l)); } catch {} }
renderLog();
renderParams();
renderMeterThreshold();
renderCalibration();
renderRunning();
checkTiming();
