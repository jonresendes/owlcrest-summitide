#!/usr/bin/env node
/* course2json.js — turn a course written as a .js file (window.LearnHub.courses.push({ … })) into the course file
   that Summitide Learning's Headmaster loads under Courses → Load a Course.

     node course2json.js eng3u.js                 → writes eng3u.json next to it
     node course2json.js eng3u.js out.json        → writes out.json
     node course2json.js colouring.js olc4o.js    → several .js files are run together (a shared picture file first),
                                                    and one .json is written per course, next to the last file

   v69: the course file carries everything the course needs, because the app ships with no courses:
     • colouring pictures the .js files registered as  LearnHub.colouring['<courseId>/<unitId>']  → course.colouring[unitId]
     • pictures the course refers to as "<courseId>/<file>.png" (or .jpg / .webp), read from the folder <courseId>/
       beside the .js file                                                                   → course.pictures[file]

   The .js file is run here, on your own machine, inside Node's vm with nothing but a fake window — the app itself
   never runs code from a file. Run check_course.js on the .js first if you want the full authoring checks. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const args = process.argv.slice(2);
const output = args.length === 2 && /\.json$/i.test(args[1]) ? args.pop() : null;
const inputs = args.filter(a => /\.js$/i.test(a));
if (!inputs.length) { console.error('usage: node course2json.js <course.js> [more.js …] [out.json]'); process.exit(1); }
const ctx = { window: {} }; ctx.window.window = ctx.window; ctx.self = ctx.window;
inputs.forEach(f => vm.runInNewContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f, timeout: 20000 }));
const hub = ctx.window.LearnHub || {}, courses = hub.courses || [], colouring = hub.colouring || {};
if (!courses.length) { console.error('The file did not add a course (it should call window.LearnHub.courses.push({ … })).'); process.exit(1); }
const dir = path.dirname(inputs[inputs.length - 1]);
const codeOf = c => { const m = String(c.title || c.id || '').toUpperCase().match(/^([A-Z]{3}[1-4][A-Z0-9](?:\/[A-Z0-9]{1,5})?)\b/); return m ? m[1] : String(c.id || '').toUpperCase(); };
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };
courses.forEach((c, i) => {
  const course = JSON.parse(JSON.stringify(c));   // the JSON round-trip drops any functions
  const col = {}; Object.keys(colouring).forEach(k => { if (k.indexOf(course.id + '/') === 0 && colouring[k].length) col[k.slice(course.id.length + 1)] = JSON.parse(JSON.stringify(colouring[k])); });
  if (Object.keys(col).length) course.colouring = col;
  const pics = {}, missing = []; const re = new RegExp('"(?:' + course.id + '/)([A-Za-z0-9][\\w.-]*\\.(png|jpe?g|webp))"', 'g'); let m; const text = JSON.stringify(course);
  while ((m = re.exec(text))) { if (pics[m[1]]) continue; const f = path.join(dir, course.id, m[1]); if (fs.existsSync(f)) pics[m[1]] = 'data:' + MIME[m[2].toLowerCase()] + ';base64,' + fs.readFileSync(f).toString('base64'); else if (!missing.includes(m[1])) missing.push(m[1]); }
  if (Object.keys(pics).length) course.pictures = pics;
  const env = { format: 'academy-course/1', type: 'course', code: codeOf(course), build: new Date().toISOString().slice(0, 10), course };
  const base = path.basename(inputs[inputs.length - 1]).replace(/\.js$/i, '');
  const out = output && courses.length === 1 ? output : path.join(dir, (courses.length > 1 ? course.id : base) + '.json');
  fs.writeFileSync(out, JSON.stringify(env));
  const u = course.units || [];
  console.log('wrote ' + out + '  (' + env.code + ' · ' + u.length + ' units · ' + u.reduce((n, x) => n + (x.lessons || []).length, 0) + ' lessons · ' + Object.keys(col).reduce((n, k) => n + col[k].length, 0) + ' colouring pictures · ' + Object.keys(pics).length + ' pictures · ' + Math.round(fs.statSync(out).size / 1024) + ' kB)' + (missing.length ? '\n  NOT FOUND in ' + course.id + '/: ' + missing.join(', ') : ''));
});
