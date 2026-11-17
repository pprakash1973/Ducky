import { describe, expect, it } from 'vitest';
import { getTool, toolDefinitions } from '../src/main/agent/tools';

describe('tool registry', () => {
  it('exposes valid object schemas for every tool', () => {
    const defs = toolDefinitions();
    expect(defs.length).toBeGreaterThanOrEqual(4);
    for (const d of defs) {
      expect(d.name).toMatch(/^[a-z_]+$/);
      expect(d.description.length).toBeGreaterThan(10);
      expect(d.input_schema.type).toBe('object');
    }
  });

  it('requires confirmation for every tool that changes things', () => {
    expect(getTool('create_outlook_draft')?.requiresConfirmation).toBe(true);
    expect(getTool('set_scan_folders')?.requiresConfirmation).toBe(true);
  });

  it('has no tool that sends email', () => {
    expect(toolDefinitions().some((d) => /send/i.test(d.name))).toBe(false);
  });
});
