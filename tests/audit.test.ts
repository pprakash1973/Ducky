import { describe, expect, it } from 'vitest';
import { redact } from '../src/main/audit';

describe('redact', () => {
  it('replaces email bodies with a length', () => {
    const out: any = redact({ subject: 'Weekly report', body: 'secret text here', to: ['a@b.com'] });
    expect(out.body).toBe('[16 chars]');
    expect(out.subject).toBe('Weekly report');
    expect(out.to).toEqual(['a@b.com']);
  });

  it('truncates long strings and long arrays', () => {
    const long = 'z'.repeat(500);
    expect((redact({ s: long }) as any).s.length).toBeLessThan(260);
    expect((redact(Array.from({ length: 50 }, (_, i) => i)) as number[]).length).toBe(20);
  });
});
