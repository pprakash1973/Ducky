import * as fs from 'fs';
import * as path from 'path';

export interface EditedFile {
  /** Path relative to the scan root, forward slashes. */
  file: string;
  root: string;
  modifiedAt: string; // ISO
}

export interface FileActivity {
  scannedRoots: string[];
  skippedRoots: string[];
  totalFound: number;
  truncated: boolean;
  /** Edited-file counts grouped by first folder under the root (≈ project). */
  byProject: { project: string; root: string; fileCount: number; examples: string[] }[];
}

const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', '.next', '.cache', '__pycache__', '.venv', 'venv',
  '.idea', '.vs', 'bin', 'obj', 'target', '$recycle.bin'
]);

const EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.py', '.cs', '.java', '.go', '.rs', '.sql', '.html', '.css',
  '.yaml', '.yml', '.docx', '.xlsx', '.pptx', '.pdf', '.txt', '.csv', '.ps1', '.sh'
]);

const MAX_DEPTH = 8;
const MAX_FILES = 2000;

export function scanRecentFiles(roots: string[], since: Date): FileActivity {
  const found: EditedFile[] = [];
  const scanned: string[] = [];
  const skipped: string[] = [];
  let truncated = false;

  const walk = (root: string, dir: string, depth: number) => {
    if (truncated || depth > MAX_DEPTH) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (truncated) return;
      if (e.isSymbolicLink()) continue; // avoid loops and escaping the chosen folder
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!IGNORE_DIRS.has(e.name.toLowerCase()) && !e.name.startsWith('.')) walk(root, full, depth + 1);
      } else if (e.isFile() && EXTENSIONS.has(path.extname(e.name).toLowerCase())) {
        if (e.name.startsWith('~$')) continue; // Office lock files
        try {
          const st = fs.statSync(full);
          if (st.mtime >= since) {
            found.push({ file: path.relative(root, full).split(path.sep).join('/'), root, modifiedAt: st.mtime.toISOString() });
            if (found.length >= MAX_FILES) truncated = true;
          }
        } catch {
          /* unreadable file */
        }
      }
    }
  };

  for (const root of roots) {
    if (fs.existsSync(root) && fs.statSync(root).isDirectory()) {
      scanned.push(root);
      walk(root, root, 0);
    } else {
      skipped.push(root);
    }
  }

  const groups = new Map<string, { root: string; files: EditedFile[] }>();
  for (const f of found) {
    const first = f.file.includes('/') ? f.file.split('/')[0] : '(root)';
    const key = f.root + '\u0000' + first;
    if (!groups.has(key)) groups.set(key, { root: f.root, files: [] });
    groups.get(key)!.files.push(f);
  }

  const byProject = [...groups.entries()]
    .map(([key, g]) => ({
      project: key.split('\u0000')[1],
      root: g.root,
      fileCount: g.files.length,
      examples: g.files
        .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
        .slice(0, 5)
        .map((f) => f.file)
    }))
    .sort((a, b) => b.fileCount - a.fileCount)
    .slice(0, 15);

  return { scannedRoots: scanned, skippedRoots: skipped, totalFound: found.length, truncated, byProject };
}
