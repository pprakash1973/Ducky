const fs = require('fs');
const path = require('path');

function copy(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) copy(s, d);
    else if (!e.name.endsWith('.ts')) fs.copyFileSync(s, d);
  }
}
copy(path.join(__dirname, '..', 'src', 'renderer'), path.join(__dirname, '..', 'dist', 'renderer'));
