import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('ducky', {
  onState: (cb: (state: string) => void) => ipcRenderer.on('duck:set-state', (_e, s) => cb(s)),
  onReply: (cb: (text: string) => void) => ipcRenderer.on('duck:reply', (_e, t) => cb(t)),
  onHeard: (cb: (text: string) => void) => ipcRenderer.on('duck:heard', (_e, t) => cb(t)),
  onSpeak: (cb: (text: string) => void) => ipcRenderer.on('duck:speak', (_e, t) => cb(t)),
  onStopSpeak: (cb: () => void) => ipcRenderer.on('duck:stop-speak', () => cb()),
  onQuack: (cb: () => void) => ipcRenderer.on('duck:quack', () => cb()),
  onRecordStart: (cb: () => void) => ipcRenderer.on('duck:record-start', () => cb()),
  onRecordCancel: (cb: () => void) => ipcRenderer.on('duck:record-cancel', () => cb()),
  recordDone: (r: { wav?: ArrayBuffer; error?: string }) => ipcRenderer.send('duck:record-done', r),
  speakDone: () => ipcRenderer.send('duck:speak-done'),
  togglePanel: () => ipcRenderer.send('duck:toggle-panel'),
  dragMove: (dx: number, dy: number) => ipcRenderer.send('duck:drag-move', dx, dy),
  sendCommand: (text: string) => ipcRenderer.send('duck:command', text),
  listen: () => ipcRenderer.send('duck:listen'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (s: unknown) => ipcRenderer.invoke('settings:save', s),
  pickFolder: () => ipcRenderer.invoke('settings:pick-folder'),
  openAuditLog: () => ipcRenderer.send('settings:open-log')
});
