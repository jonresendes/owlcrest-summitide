#!/usr/bin/env node
/* =========================================================
   tools/build-editions.js — v79: make the two store builds from this folder.

     node tools/build-editions.js schools
     node tools/build-editions.js personal --courses /path/to/your/course-json-files
     node tools/build-editions.js personal --courses … --test-store     (pretend purchases, for trying it in a browser)

   Writes dist/schools and dist/personal (never committed: dist/ is in .gitignore). Settings come from tools/editions.json.
   The course files are NOT in this repository; the Personal build packs the ones in the folder you name, and writes
   catalogue.json from them (code, title and one product per course: course_<code>).
   No dependencies: plain Node.
   ========================================================= */
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2), ed = args[0];
const opt = n => { const i = args.indexOf(n); return i < 0 ? null : args[i + 1]; };
if (!['schools', 'personal'].includes(ed)) { console.error('Usage: node tools/build-editions.js schools | personal --courses <folder> [--test-store]'); process.exit(1); }
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'tools', 'editions.json'), 'utf8'))[ed];
const out = path.join(root, 'dist', ed);
const SKIP = new Set(['.git', '.github', '.gitignore', 'dist', 'tools', 'wrap', 'node_modules', 'README.md', 'firestore.rules', 'check_course.js', 'course2json.js', 'sw.js']);
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
const copy = (from, to) => { const st = fs.statSync(from); if (st.isDirectory()) { fs.mkdirSync(to, { recursive: true }); fs.readdirSync(from).forEach(f => copy(path.join(from, f), path.join(to, f))); } else fs.copyFileSync(from, to); };
fs.readdirSync(root).filter(f => !SKIP.has(f)).forEach(f => copy(path.join(root, f), path.join(out, f)));
const edit = (file, fn) => { const p = path.join(out, file); fs.writeFileSync(p, fn(fs.readFileSync(p, 'utf8'))); };
const must = (s, re, what) => { if (!re.test(s)) { console.error('build-editions: could not find ' + what + ' in index.html'); process.exit(1); } return s; };
const head = '/* written by tools/build-editions.js — do not edit */\n';

if (ed === 'schools') {
  if (!/^https:\/\//.test(cfg.directory || '')) { console.error('tools/editions.json: schools.directory must be an https address.'); process.exit(1); }
  fs.writeFileSync(path.join(out, 'edition-config.js'), head + 'window.EDITION = ' + JSON.stringify({ id: 'schools', directory: cfg.directory }) + ';\n');
  // the school's Firebase project comes from the directory, not from this file
  fs.writeFileSync(path.join(out, 'cloud-config.js'), head + 'window.CLOUD_CONFIG = { enabled: false, idleMinutes: 30, staffIdleMinutes: 720 };\n');
  const origin = new URL(cfg.directory).origin;
  edit('index.html', s => must(s, /connect-src 'self'/, 'connect-src').replace("connect-src 'self'", "connect-src 'self' " + origin));
}
if (ed === 'personal') {
  const st = cfg.store || {}, test = args.includes('--test-store');
  if (!test && !(st.appleKey || st.googleKey)) console.warn('WARNING: tools/editions.json has no store keys yet (personal.store.appleKey / googleKey). The build will show the store but nothing can be bought.');
  fs.writeFileSync(path.join(out, 'edition-config.js'), head + 'window.EDITION = ' + JSON.stringify({ id: 'personal', store: { adapter: test ? 'test' : 'revenuecat', appleKey: st.appleKey || '', googleKey: st.googleKey || '' } }) + ';\n');
  fs.writeFileSync(path.join(out, 'cloud-config.js'), head + 'window.CLOUD_CONFIG = { enabled: false };\n');
  // no cloud in this edition: Firebase and Google Drive are left out of the package altogether
  ['firebase-app-compat.js', 'firebase-auth-compat.js', 'firebase-firestore-compat.js'].forEach(f => fs.rmSync(path.join(out, f), { force: true }));
  edit('index.html', s => { s = must(s, /<script src="firebase-app-compat\.js"><\/script>/, 'the Firebase scripts').replace(/^\s*<script src="firebase-(app|auth|firestore)-compat\.js"><\/script>.*\n/gm, '');
    return must(s, /connect-src 'self'[^;]*;/, 'connect-src').replace(/script-src 'self'[^;]*;/, "script-src 'self';").replace(/connect-src 'self'[^;]*;/, "connect-src 'self';").replace(/frame-src 'self'[^;]*;/, "frame-src 'self' blob:;"); });
  const dir = opt('--courses'); const courses = [];
  fs.mkdirSync(path.join(out, 'courses'), { recursive: true });
  if (dir) fs.readdirSync(dir).filter(f => /^[\w.-]+\.json$/.test(f)).sort().forEach(f => {
    let j; try { j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) { console.warn('skipped (not JSON): ' + f); return; }
    const c = Array.isArray(j.course) ? j.course[0] : (j.course || (j.units ? j : null)); const code = String(j.code || (c && (c.code || c.id)) || '').toUpperCase();
    if (!c || !/^[A-Z]{3}[0-9][A-Z](\/[0-9][A-Z])?$/.test(code)) { console.warn('skipped (no Ontario course code found): ' + f); return; }
    const slug = code.toLowerCase().replace(/[^a-z0-9]+/g, '');
    fs.copyFileSync(path.join(dir, f), path.join(out, 'courses', f));
    courses.push({ code, title: String(c.title || code).slice(0, 100), blurb: String(c.subtitle || '').slice(0, 240), product: 'course_' + slug, entitlement: 'course_' + slug, file: f });
  });
  else console.warn('WARNING: no --courses folder given; the store will be empty.');
  fs.writeFileSync(path.join(out, 'catalogue.json'), JSON.stringify({ subscription: st.subscription || null, courses, terms: st.terms || '', privacy: st.privacy || '' }, null, 1));
  console.log('courses packed: ' + (courses.map(c => c.code).join(', ') || 'none'));
  console.log('products to create in the stores: ' + courses.map(c => c.product).concat((st.subscription || {}).products || []).join(', '));
}
// the wrapper project for this edition
const wrap = path.join(root, 'wrap', ed); fs.mkdirSync(wrap, { recursive: true });
fs.writeFileSync(path.join(wrap, 'capacitor.config.json'), JSON.stringify({ appId: cfg.appId, appName: cfg.appName, webDir: '../../dist/' + ed, server: { androidScheme: 'https' } }, null, 2) + '\n');
if (!fs.existsSync(path.join(wrap, 'package.json'))) fs.writeFileSync(path.join(wrap, 'package.json'), JSON.stringify({ name: 'summitide-' + ed, private: true, version: '1.0.0',
  dependencies: Object.assign({ '@capacitor/core': '^8.0.0', '@capacitor/android': '^8.0.0', '@capacitor/ios': '^8.0.0' }, ed === 'personal' ? { '@revenuecat/purchases-capacitor': '^15.0.0' } : {}), devDependencies: { '@capacitor/cli': '^8.0.0' } }, null, 2) + '\n');
console.log('built dist/' + ed + ' (' + cfg.appName + ', ' + cfg.appId + ')');
