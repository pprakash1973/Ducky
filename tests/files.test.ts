import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { scanRecentFiles } from '../src/main/connectors/activity/files';

let root: string;
const week = () => new Date(Date.now() - 7 * 86_400_000);

function write(rel: string, daysAgo = 0) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, 'x');
  const t = new Date(Date.now() - daysAgo * 86_400_000);
  fs.utimesSync(full, t, t);
}

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ducky-scan-'));
  write('projA/src/a.ts');
  write('projA/node_modules/x/b.js');
  write('projA/.git/config.json');
  write('projB/notes.md', 2);
  write('projB/~$lock.docx');
  write('old.md', 30);
  write('image.png');
});

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe('scanRecentFiles', () => {
  const result = () => scanRecentFiles([root, root + '-missing'], week());

  it('keeps recent files of known types, grouped by project', () => {
    const r = result();
    expect(r.totalFound).toBe(2);
    expect(r.byProject.map((p) => p.project).sort()).toEqual(['projA', 'projB']);
  });

  it('ignores vendor/hidden dirs, Office lock files, old files and unknown extensions', () => {
    const all = result().byProject.flatMap((p) => p.examples);
    expect(all.some((f) => f.includes('node_modules') || f.includes('.git') || f.includes('~$'))).toBe(false);
    expect(all).not.toContain('old.md');
    expect(all).not.toContain('image.png');
  });

  it('reports missing roots instead of throwing', () => {
    expect(result().skippedRoots).toEqual([root + '-missing']);
  });

  it('never returns file contents', () => {
    expect(JSON.stringify(result())).not.toContain('"x"');
  });
});
