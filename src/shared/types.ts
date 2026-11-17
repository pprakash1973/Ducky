/** The renderer uses the state string as CSS class names, so "running left" is two classes. */
export type DuckState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'done'
  | 'error'
  | 'running'
  | 'running left'
  | 'hopping'
  | 'hopping left'
  | 'flip'
  | 'napping';

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
  quack: 'duck:quack',
  recordStart: 'duck:record-start',
  recordCancel: 'duck:record-cancel',
  recordDone: 'duck:record-done'
} as const;
