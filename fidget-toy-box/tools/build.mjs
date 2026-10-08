// Production build: bundles + minifies the game and writes two ready-to-upload packages.
//   dist/youtube/  — loads the YouTube Playables SDK first (upload to the Playables portal)
//   dist/web/      — no SDK (itch.io, CrazyGames, GameDistribution, GitHub Pages, Netlify…)
// Each folder is also zipped next to it. Usage: npm run build
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const SDK_TAG = '<script src="https://www.youtube.com/game_api/v1"></script>';
const TARGETS = ['youtube', 'web'];
const SAFE_NAME = /^[A-Za-z0-9_.-]+$/;

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const s = path.join(src, e.name), d = path.join(dest, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const kb = (n) => `${(n / 1024).toFixed(1)} KiB`;

fs.rmSync(DIST, { recursive: true, force: true });
const bundle = await build({
  entryPoints: [path.join(ROOT, 'src/main.js')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2019', 'safari13', 'chrome80', 'firefox78', 'edge88'],
  write: false,
  legalComments: 'none',
});
const js = bundle.outputFiles[0].text;
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
if (!html.includes('<!-- PLATFORM_SDK -->')) throw new Error('index.html is missing the PLATFORM_SDK marker');

for (const target of TARGETS) {
  const out = path.join(DIST, target);
  fs.mkdirSync(out, { recursive: true });
  let page = html
    .replace('<!-- PLATFORM_SDK -->', target === 'youtube' ? SDK_TAG : '')
    .replace('<script type="module" src="src/main.js"></script>', '<script src="game.js"></script>');
  fs.writeFileSync(path.join(out, 'index.html'), page);
  fs.writeFileSync(path.join(out, 'game.js'), js);
  copyDir(path.join(ROOT, 'assets'), path.join(out, 'assets'));

  // Playables rules: only relative paths, safe file names, files < 30 MiB (ideally < 512 KiB).
  const files = walk(out);
  let total = 0;
  for (const f of files) {
    const rel = path.relative(out, f);
    for (const part of rel.split(path.sep)) if (!SAFE_NAME.test(part)) throw new Error(`Unsafe file name: ${rel}`);
    const size = fs.statSync(f).size;
    total += size;
    if (size > 512 * 1024) console.warn(`  ! ${rel} is ${kb(size)} (> 512 KiB recommendation)`);
  }
  const zip = path.join(DIST, `fidget-toy-box-${target}.zip`);
  execFileSync('zip', ['-r', '-X', '-q', zip, '.'], { cwd: out });
  console.log(`${target.padEnd(8)} ${files.length} files, ${kb(total)} → ${path.relative(ROOT, zip)} (${kb(fs.statSync(zip).size)})`);
}
console.log(`game.js ${kb(js.length)}`);
