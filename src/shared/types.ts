export type DuckState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'done' | 'error';

export const IPC = {
  setState: 'duck:set-state',
  togglePanel: 'duck:toggle-panel',
  command: 'duck:command',
  reply: 'duck:reply',
  dragMove: 'duck:drag-move',
  ignoreMouse: 'duck:ignore-mouse',
  listen: 'duck:listen',
  heard: 'duck:heard',
  speak: 'duck:speak',
  stopSpeak: 'duck:stop-speak',
  speakDone: 'duck:speak-done',
  recordStart: 'duck:record-start',
  recordCancel: 'duck:record-cancel',
  recordDone: 'duck:record-done'
} as const;
