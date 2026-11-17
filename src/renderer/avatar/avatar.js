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
