import { describe, expect, it } from 'vitest';
import { parseWake } from '../src/main/wakeParse';

describe('parseWake', () => {
  it('finds the name at the start or end and strips it', () => {
    expect(parseWake('Hey Ducky, run across the screen.')).toEqual({ addressed: true, command: 'run across the screen' });
    expect(parseWake('What time is it Ducky?')).toEqual({ addressed: true, command: 'What time is it' });
    expect(parseWake('Daki.')).toEqual({ addressed: true, command: '' });
  });
  it('ignores speech not addressed to Ducky', () => {
    expect(parseWake("let's move on to the next slide").addressed).toBe(false);
    expect(parseWake('the quarterly numbers look good').addressed).toBe(false);
  });
});
