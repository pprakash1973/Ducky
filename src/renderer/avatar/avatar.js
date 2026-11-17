const duck = document.getElementById('duck');

window.ducky.onState((state) => {
  duck.className = state;
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

async function startRecording() {
  stopRecording(true);
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
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
    if (loud) { heardSpeech = true; silentFor = 0; } else if (heardSpeech) silentFor += dur;
    if (heardSpeech || chunks.length < 4) chunks.push(data); // keep a little lead-in
    else chunks.splice(0, 1, data);
    if (heardSpeech && silentFor > 1.2) finish(false);
    else if (!heardSpeech && elapsed > 7) finish(true);
    else if (elapsed > 20) finish(false);
  };
  src.connect(proc);
  proc.connect(ctx.destination);
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
