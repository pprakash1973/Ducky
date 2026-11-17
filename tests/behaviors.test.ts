import { describe, expect, it } from 'vitest';
import { parseBehavior } from '../src/main/behaviorParse';

describe('parseBehavior', () => {
  it('recognises play commands', () => {
    expect(parseBehavior('Run across the screen')).toBe('run');
    expect(parseBehavior('hop around ducky')).toBe('hop');
    expect(parseBehavior('Do a somersault!')).toBe('somersault');
    expect(parseBehavior('go take a nap')).toBe('nap');
    expect(parseBehavior('wake up ducky')).toBe('wake');
  });
  it('leaves real tasks and long sentences to the agent', () => {
    expect(parseBehavior('draft my weekly status report')).toBeNull();
    expect(parseBehavior('run the report for last week')).toBeNull();
    expect(parseBehavior('what time is it')).toBeNull();
    expect(parseBehavior('please run through everything I did across all the projects this month')).toBeNull();
  });
});
