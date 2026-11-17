const $ = (id) => document.getElementById(id);
let folders = [];

function renderFolders() {
  const ul = $('folders');
  ul.textContent = '';
  if (!folders.length) {
    const li = document.createElement('li');
    li.textContent = 'None — file activity is not included in reports.';
    ul.appendChild(li);
  }
  folders.forEach((f, i) => {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.textContent = f;
    const rm = document.createElement('button');
    rm.textContent = '✕';
    rm.title = 'Remove';
    rm.onclick = () => {
      folders.splice(i, 1);
      renderFolders();
    };
    li.append(span, rm);
    ul.appendChild(li);
  });
}

async function load() {
  const s = await window.ducky.getSettings();
  $('keyStatus').textContent = s.hasKey ? 'A key is saved (stored encrypted by Windows).' : 'No key saved yet.';
  $('speechStatus').textContent = s.hasSpeechKey ? 'A speech key is saved (stored encrypted by Windows).' : 'No speech key: using offline recognition.';
  $('speechRegion').value = s.speechRegion;
  $('speechLang').value = s.speechLang;
  $('azureClientId').value = s.azureClientId;
  $('azureTenantId').value = s.azureTenantId;
  $('alwaysListen').checked = s.alwaysListen;
  $('wakeWord').checked = s.wakeWord;
  $('speakReplies').checked = s.speakReplies;
  folders = s.scanDirs;
  renderFolders();
}

$('addFolder').onclick = async () => {
  const picked = await window.ducky.pickFolder();
  if (picked && !folders.includes(picked)) {
    folders.push(picked);
    renderFolders();
  }
};

$('openLog').onclick = () => window.ducky.openAuditLog();

$('save').onclick = async () => {
  const res = await window.ducky.saveSettings({
    apiKey: $('apiKey').value,
    speechKey: $('speechKey').value,
    speechRegion: $('speechRegion').value.trim(),
    speechLang: $('speechLang').value.trim(),
    azureClientId: $('azureClientId').value.trim(),
    azureTenantId: $('azureTenantId').value.trim(),
    alwaysListen: $('alwaysListen').checked,
    wakeWord: $('wakeWord').checked,
    speakReplies: $('speakReplies').checked,
    scanDirs: folders
  });
  $('apiKey').value = '';
  $('speechKey').value = '';
  $('status').style.color = res.ok ? '#2a7' : '#c33';
  $('status').textContent = res.ok ? 'Saved ✓' : res.error;
  if (res.ok) load();
};

load();
