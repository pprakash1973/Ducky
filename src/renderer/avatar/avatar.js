const duck = document.getElementById('duck');

window.ducky.onState((state) => {
  duck.className = state; // e.g. "running left" sets two classes
});

// Text-to-speech via the OS voices (Chromium speechSynthesis).
window.ducky.onSpeak((text) => {
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.05;
  u.pitch = 1.15;
  const done = () => window.ducky.speakDone();
  u.onend = done;
  u.onerror = done;
  speechSynthesis.speak(u);
});

window.ducky.onStopSpeak(() => speechSynthesis.cancel());

// Microphone capture for Azure Speech: 16 kHz mono, stops after a pause following speech.
let rec = null;

function toWav(chunks, rate) {
  const len = chunks.reduce((n, c) => n + c.length, 0);
  const buf = new ArrayBuffer(44 + len * 2);
  const v = new DataView(buf);
  const str = (o, s) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  str(0, 'RIFF'); v.setUint32(4, 36 + len * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, len * 2, true);
  let o = 44;
  for (const c of chunks) for (let i = 0; i < c.length; i++, o += 2) {
    const s = Math.max(-1, Math.min(1, c[i]));
    v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buf;
}

// Always-listening mode: the mic stays open, speech segments are cut out by a simple volume gate
// and sent to the main process, which transcribes them and only acts when "Ducky" is said.
let cont = null;
let curState = 'idle';
let resetSegment = () => {};
const LISTENABLE = ['idle', 'done', 'napping'];
window.ducky.onState((s) => {
  curState = s;
  if (!LISTENABLE.includes(s)) resetSegment(); // don't capture our own voice or while busy
});

async function startContinuous() {
  if (cont) return;
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: false }
    });
  } catch {
    return;
  }
  const RATE = 16000;
  const ctx = new AudioContext({ sampleRate: RATE });
  const src = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(2048, 1, 1); // ~128 ms per frame
  cont = { stream, ctx, src, proc };
  let pre = [];
  let seg = null;
  let silent = 0;
  let voiced = 0;
  let floor = 0.002; // running estimate of room noise
  resetSegment = () => { seg = null; pre = []; silent = 0; voiced = 0; };

  proc.onaudioprocess = (e) => {
    const data = new Float32Array(e.inputBuffer.getChannelData(0));
    if (!LISTENABLE.includes(curState) || speechSynthesis.speaking) return resetSegment();
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
    const rms = Math.sqrt(sum / data.length);
    const loud = rms > Math.max(0.012, floor * 3);
    if (!seg) {
      if (!loud) {
        floor = floor * 0.95 + rms * 0.05;
        pre.push(data);
        if (pre.length > 4) pre.shift(); // ~0.5 s lead-in so the first word isn't clipped
        return;
      }
      seg = [...pre];
      pre = [];
      silent = 0;
      voiced = 0;
    }
    seg.push(data);
    if (loud) { voiced++; silent = 0; } else silent++;
    if (silent >= 7 || seg.length >= 120) { // ~0.9 s of quiet, or 15 s max
      const chunks = seg;
      const worthSending = voiced >= 3; // ignore clicks and coughs
      resetSegment();
      if (worthSending) window.ducky.utterance(toWav(chunks, RATE));
    }
  };
  src.connect(proc);
  proc.connect(ctx.destination);
  document.body.classList.add('mic-on');
}

function stopContinuous() {
  if (!cont) return;
  const c = cont;
  cont = null;
  resetSegment();
  c.proc.disconnect();
  c.src.disconnect();
  c.stream.getTracks().forEach((t) => t.stop());
  c.ctx.close();
  document.body.classList.remove('mic-on');
}

window.ducky.onMicOn(() => void startContinuous());
window.ducky.onMicOff(stopContinuous);

// A synthesized "quack-quack": two nasal, downward-sweeping sawtooth honks through a band-pass filter.
function quack() {
  try {
    const c = new AudioContext();
    const t = c.currentTime;
    [0, 0.19].forEach((d, i) => {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(540 - i * 50, t + d);
      o.frequency.exponentialRampToValueAtTime(230, t + d + 0.14);
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1150;
      f.Q.value = 2.5;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t + d);
      g.gain.exponentialRampToValueAtTime(0.4, t + d + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.15);
      o.connect(f); f.connect(g); g.connect(c.destination);
      o.start(t + d);
      o.stop(t + d + 0.17);
    });
    setTimeout(() => c.close(), 700);
  } catch { /* cue only */ }
}
window.ducky.onQuack(quack);

function beep() {
  try {
    const c = new AudioContext();
    const o = c.createOscillator();
    const g = c.createGain();
    o.frequency.value = 880;
    g.gain.value = 0.08;
    o.connect(g); g.connect(c.destination);
    o.start();
    o.stop(c.currentTime + 0.12);
    o.onended = () => c.close();
  } catch { /* cue only */ }
}

async function startRecording() {
  stopRecording(true);
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: false }
    });
  } catch {
    window.ducky.recordDone({ error: 'I cannot access a microphone. Check Windows Settings > Privacy > Microphone.' });
    return;
  }
  const RATE = 16000;
  const ctx = new AudioContext({ sampleRate: RATE });
  const src = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  const chunks = [];
  let heardSpeech = false;
  let silentFor = 0;
  let elapsed = 0;
  const state = { stream, ctx, proc, cancelled: false };
  rec = state;

  const finish = (empty) => {
    if (rec === state) rec = null;
    proc.disconnect(); src.disconnect();
    stream.getTracks().forEach((t) => t.stop());
    ctx.close();
    if (state.cancelled) return;
    window.ducky.recordDone(empty ? {} : { wav: toWav(chunks, RATE) });
  };

  proc.onaudioprocess = (e) => {
    if (state.cancelled) return;
    const data = new Float32Array(e.inputBuffer.getChannelData(0));
    const dur = data.length / RATE;
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
    const loud = Math.sqrt(sum / data.length) > 0.012;
    elapsed += dur;
    if (elapsed < 0.35) return; // skip the ready beep and mic start-up noise
    if (loud) { heardSpeech = true; silentFor = 0; } else if (heardSpeech) silentFor += dur;
    chunks.push(data);
    if (!heardSpeech && chunks.length > 4) chunks.shift(); // keep only a short lead-in before speech
    if (heardSpeech && silentFor > 1.2) finish(false);
    else if (!heardSpeech && elapsed > 7) finish(true);
    else if (elapsed > 20) finish(false);
  };
  src.connect(proc);
  proc.connect(ctx.destination);
  beep(); // mic is open: speak now
}

function stopRecording(silent) {
  if (!rec) return;
  rec.cancelled = true;
  rec.proc.disconnect();
  rec.stream.getTracks().forEach((t) => t.stop());
  rec.ctx.close();
  rec = null;
}

window.ducky.onRecordStart(() => void startRecording());
window.ducky.onRecordCancel(() => stopRecording(true));

// Drag with click detection: movement > 3px = drag, otherwise click toggles chat panel.
let down = false;
let moved = false;
let lastX = 0;
let lastY = 0;
let total = 0;

duck.addEventListener('mousedown', (e) => {
  down = true;
  moved = false;
  total = 0;
  lastX = e.screenX;
  lastY = e.screenY;
});

window.addEventListener('mousemove', (e) => {
  if (!down) return;
  const dx = e.screenX - lastX;
  const dy = e.screenY - lastY;
  lastX = e.screenX;
  lastY = e.screenY;
  total += Math.abs(dx) + Math.abs(dy);
  if (total > 3) {
    moved = true;
    window.ducky.dragMove(dx, dy);
  }
});

window.addEventListener('mouseup', () => {
  if (down && !moved) window.ducky.togglePanel();
  down = false;
});
