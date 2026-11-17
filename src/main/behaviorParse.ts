export type Behavior = 'run' | 'hop' | 'nap' | 'somersault' | 'wake';

/** Words that mean this is a real task for the agent, not a trick for the duck. */
const TASK_WORDS = /\b(email|mail|report|draft|outlook|calendar|meeting|file|folder|status|week|summar|schedule|invite)/;

/**
 * Recognises short "play" commands such as "run across the screen" or "take a nap".
 * Long sentences and anything that sounds like real work go to the agent instead.
 */
export function parseBehavior(text: string): Behavior | null {
  const t = text.toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t || t.split(' ').length > 8 || TASK_WORDS.test(t)) return null;
  if (/\b(somersault|backflip|cartwheel|flip|roll over)\b/.test(t)) return 'somersault';
  if (/\b(wake up|wake)\b/.test(t)) return 'wake';
  if (/\b(nap|sleep|go to bed|snooze)\b/.test(t)) return 'nap';
  if (/\b(hop|jump|bounce)\b/.test(t)) return 'hop';
  if (/\b(run|dash|sprint|race|zoom)\b/.test(t)) return 'run';
  return null;
}

export const BEHAVIOR_LINES: Record<Behavior, string> = {
  run: '🦆 Off I go!',
  hop: '🦆 Hop hop hop!',
  nap: '🦆 Zzz… click me or say "wake up" when you need me.',
  somersault: '🦆 Ta-da!',
  wake: '🦆 I am awake!'
};
