const log = document.getElementById('log');
const form = document.getElementById('form');
const input = document.getElementById('input');

function add(text, cls) {
  const d = document.createElement('div');
  d.className = 'msg ' + cls;
  d.textContent = text;
  log.appendChild(d);
  log.scrollTop = log.scrollHeight;
}

add('Quack! How can I help? Try: "draft my weekly status report".', 'duck');

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  add(text, 'me');
  window.ducky.sendCommand(text);
  input.value = '';
});

window.ducky.onReply((t) => add(t, 'duck'));
window.ducky.onHeard((t) => add('🎤 ' + t, 'me'));
document.getElementById('mic').addEventListener('click', () => window.ducky.listen());
