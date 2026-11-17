// Speech recognition spells the name many ways ("Ducky", "Daki", "Duckie"), so accept the common ones.
const NAME = /\b(?:(?:hey|hi|hello|ok|okay)[\s,]+)?(?:ducky|duckie|duckey|dukey|dukie|ducki|dakey|daki|duck)\b/gi;

export interface WakeResult {
  /** The name was spoken somewhere in the sentence. */
  addressed: boolean;
  /** What is left after removing the name, e.g. "run across the screen". */
  command: string;
}

/** Splits a transcript into "was Ducky addressed" and the actual request. */
export function parseWake(text: string): WakeResult {
  NAME.lastIndex = 0;
  const addressed = NAME.test(text);
  NAME.lastIndex = 0;
  const command = text
    .replace(NAME, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,.!?;:-]+|[\s,.!?;:-]+$/g, '')
    .trim();
  return { addressed, command };
}
