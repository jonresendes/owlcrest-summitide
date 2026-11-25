/* Course files: the Headmaster loads a course into Summitide Learning from a file, at run time, without touching the repo.
   ------------------------------------------------------------------------------------------------------------
   SECURITY MODEL (read before changing anything here)
     • A course file is DATA, never code. The app accepts only JSON and parses it with JSON.parse; nothing in a file is
       ever executed. Repo-style .js course files are converted to JSON offline with `node course2json.js <file>.js`
       (that runs the file in Node's vm, on the author's machine — never in a user's browser).
     • Every string in a loaded course is scrubbed before it is registered: the one field the app renders as raw HTML
       (slide `html`) goes through an allow-list sanitizer (no scripts, handlers, styles, frames, forms or javascript:
       URLs); every other string is kept as text (the app escapes text when it draws it) with any tags removed;
       media links must be http(s); colours must be colours; ids and codes must match their patterns; the keys
       __proto__ / constructor / prototype are dropped. The same scrub runs when a course arrives from the cloud,
       so a copy tampered with directly in Firestore is cleaned too.
     • Only the Headmaster may write courses (firestore.rules); every add / replace / remove is written to the change log.
     • Size is capped (about 6 MB of JSON) and the shape is validated before anything is saved.
   Accepted file
     .json — the envelope  { "format": "academy-course/1", "type": "course", "code": "ENG3U", "build": "2026-11-14", "course": { …course object… } }
             or a bare course object  { id, title, units… }  (the same shape every course file in this repo pushes).
   Course code
     The Ontario code (ENG3U, GLC2O, SNC1L/2L …) is read from the envelope, the id or the title ("CODE - description")
     and must be confirmed in the box before anything is saved. If a course with that code is already in Summitide Learning
     (built in or loaded earlier) the file does not add a second course: it offers to create a SECTION of the existing
     course for a chosen teacher instead.
   Storage
     courses/{CODE}            { code, id, title, build, type, size, parts, by, at }      meta, small
     courseChunks/{CODE}__{n}  { code, n, data }                                            JSON text in pieces of ≤ 256k characters
   v69 · THE APP SHIPS WITH NO COURSES. Every course arrives as a file, and a file carries everything the course needs:
     course.colouring  { "<unitId>": [ { title, svg } ] }      line-art for the Colouring Page (sanitised: shapes only)
     course.pictures   { "<file>.png": "data:image/png;base64,…" }   the course's own figures (mathtools.js draws them)
   The device keeps its copy of each loaded course in IndexedDB (database "summitide-courses"), which has room for
   many large courses; the old localStorage copy is moved across once. Without the cloud (device-only mode) that
   IndexedDB copy is the course: the Headmaster profile loads and removes files on the device.
   The loaded courses are registered in window.LearnHub.courses at start-up (from a local cache first, then the cloud),
   so they appear in Courses, Sections, Display Case, games and grades exactly like the built-in ones. */
(function () {
  const CODE_RE = /^([A-Z]{3}[1-4][A-Z0-9](?:\/[A-Z0-9]{1,5})?)\b/;
  const CHUNK = 250 * 1024;   // characters per cloud piece: even at 4 bytes a character this stays under Firestore's 1 MB document limit
  const CACHE_KEY = 'learnhub.cloudCourses';
  const CF = window.CourseFiles = { loaded: {} };   // code → course (cloud-loaded only)

  /* ---------- reading a file (JSON only — a course file is data, never code) ---------- */
  CF.parse = async function (file) {
    const name = (file.name || '').toLowerCase();
    if (/\.js$/.test(name)) throw new Error('This is a JavaScript course file. The app never runs code from a file: convert it first with  node course2json.js ' + (file.name || 'course.js') + '  (in the repo folder) and upload the .json it writes.');
    if (file.size > 30 * CHUNK) throw new Error('This file is too large (' + Math.round(file.size / 1024) + ' kB). Split the course into two files.');
    const text = await file.text();
    let obj; try { obj = JSON.parse(text); } catch (e) { throw new Error('Not a valid JSON file: ' + e.message); }
    const out = { envelope: null, courses: [], source: name };
    if (obj && typeof obj === 'object' && !Array.isArray(obj) && obj.format && /^academy-course\//.test(String(obj.format))) {
      out.envelope = { format: String(obj.format).slice(0, 40), type: String(obj.type || 'course').slice(0, 20), code: String(obj.code || '').slice(0, 12), build: String(obj.build || '').slice(0, 40) };
      const c = obj.course || obj.courses; out.courses = Array.isArray(c) ? c : (c ? [c] : []);
    } else if (Array.isArray(obj)) out.courses = obj;
    else if (obj && obj.units) out.courses = [obj];
    out.courses = out.courses.filter(c => c && typeof c === 'object').map(c => CF.scrub(c));
    if (!out.courses.length) throw new Error('No course found in this file. A course file holds an object with "id", "title" and "units".');
    return out;
  };

  /* ---------- scrubbing: everything in a course is text, except slide html which is sanitised ---------- */
  const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
  const ALLOWED_TAGS = { p: [], br: [], strong: [], b: [], em: [], i: [], u: [], s: [], ul: [], ol: ['start'], li: [], table: [], thead: [], tbody: [], tr: [], td: ['colspan', 'rowspan'], th: ['colspan', 'rowspan', 'scope'], blockquote: [], h1: [], h2: [], h3: [], h4: [], h5: [], span: [], div: [], code: [], pre: [], sup: [], sub: [], hr: [], small: [], mark: [], figure: [], figcaption: [], caption: [], img: ['src', 'alt', 'width', 'height'], a: ['href', 'title'], dl: [], dt: [], dd: [], cite: [], abbr: ['title'], kbd: [], q: [] };
  const GLOBAL_ATTRS = ['class', 'title', 'lang', 'dir', 'role', 'aria-label'];
  const URL_ATTRS = { href: /^(https?:\/\/|#|mailto:)/i, src: /^(https?:\/\/|data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,)/i };
  /** Allow-list HTML sanitiser for the one raw-HTML field. Uses the browser's own parser; nothing is executed. */
  CF.sanitizeHtml = function (html) {
    if (typeof DOMParser === 'undefined') return String(html || '').replace(/<[^>]*>/g, '');
    const doc = new DOMParser().parseFromString('<body>' + String(html || '') + '</body>', 'text/html');
    const walk = node => {
      Array.from(node.childNodes).forEach(ch => {
        if (ch.nodeType === 3) return;                                          // text
        if (ch.nodeType !== 1) { ch.remove(); return; }                         // comments etc.
        const tag = ch.tagName.toLowerCase();
        if (!ALLOWED_TAGS[tag]) { const frag = doc.createDocumentFragment(); while (ch.firstChild) frag.appendChild(ch.firstChild); ch.replaceWith(frag); walk(node); return; }   // keep the text, drop the tag
        Array.from(ch.attributes).forEach(a => {
          const n = a.name.toLowerCase(); const ok = ALLOWED_TAGS[tag].includes(n) || GLOBAL_ATTRS.includes(n);
          // v69: a style is kept only when it does nothing but size a box (the bars of a chart): width / height / flex-basis as a number
          if (n === 'style' && /^(\s*(width|height|min-width|max-width|flex-basis)\s*:\s*\d{1,4}(\.\d{1,3})?(%|px|rem|em)?\s*;?)+\s*$/i.test(a.value)) return;
          if (!ok || /^on/.test(n) || n === 'style') { ch.removeAttribute(a.name); return; }
          if (URL_ATTRS[n] && !URL_ATTRS[n].test(a.value.trim())) ch.removeAttribute(a.name);
          if (n === 'class' && /[^\w\s-]/.test(a.value)) ch.removeAttribute(a.name);
        });
        if (tag === 'a') { ch.setAttribute('rel', 'noopener'); ch.setAttribute('target', '_blank'); }
        walk(ch);
      });
    };
    walk(doc.body);
    return doc.body.innerHTML;
  };
  /* v69 · Colouring pictures are SVG. Only drawing shapes and their geometry and paint attributes are kept: no script, style, links,
     images, foreign content or event handlers. The picture is rebuilt from what was allowed, never passed through as it came. */
  const SVG_TAGS = new Set(['svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon', 'text', 'tspan', 'title']);
  const SVG_ATTRS = new Set(['viewBox', 'xmlns', 'class', 'fill', 'stroke', 'stroke-width', 'stroke-linejoin', 'stroke-linecap', 'stroke-dasharray', 'stroke-miterlimit', 'fill-rule', 'fill-opacity', 'stroke-opacity', 'opacity', 'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'width', 'height', 'points', 'transform', 'font-size', 'font-family', 'font-weight', 'text-anchor', 'dominant-baseline']);
  const xmlEsc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  CF.sanitizeSvg = function (svg) {
    if (typeof DOMParser === 'undefined') return '';
    let doc; try { doc = new DOMParser().parseFromString(String(svg || '').slice(0, 200000), 'image/svg+xml'); } catch (e) { return ''; }
    const root = doc && doc.documentElement; if (!root || root.nodeName !== 'svg' || doc.getElementsByTagName('parsererror').length) return '';
    const build = el => { const tag = el.nodeName; if (!SVG_TAGS.has(tag)) return '';
      let out = '<' + tag;
      Array.from(el.attributes).forEach(a => { const v = a.value; if (!SVG_ATTRS.has(a.name) || v.length > 60000 || /url\s*\(|javascript:|expression|[<>&]/i.test(v)) return; if (a.name === 'xmlns' && v !== 'http://www.w3.org/2000/svg') return; if (a.name === 'class' && /[^\w\s-]/.test(v)) return; out += ' ' + a.name + '="' + xmlEsc(v) + '"'; });
      let inner = ''; Array.from(el.childNodes).forEach(ch => { if (ch.nodeType === 1) inner += build(ch); else if (ch.nodeType === 3 && (tag === 'text' || tag === 'tspan' || tag === 'title')) inner += xmlEsc(ch.nodeValue); });
      return out + (inner ? '>' + inner + '</' + tag + '>' : '/>'); };
    return build(root);
  };
  /** course.pictures: file name → a PNG, JPEG or WebP as a data: address, each at most about 300 kB, at most 200 of them. */
  CF.cleanPictures = function (map) {
    const out = {}; if (!map || typeof map !== 'object' || Array.isArray(map)) return out;
    Object.keys(map).slice(0, 200).forEach(name => { const v = map[name];
      if (!/^[A-Za-z0-9][\w.-]{0,80}\.(png|jpe?g|webp)$/.test(name) || name.indexOf('..') >= 0 || typeof v !== 'string' || v.length > 420000) return;
      if (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(v)) out[name] = v; });
    return out;
  };
  // Text is text: the app escapes it when it draws it. Only things shaped like real tags are taken out, so "3 < x and x > 1" in a math course stays as written.
  const stripTags = t => String(t).replace(/<\/?[a-zA-Z][a-zA-Z0-9-]*(\s+[a-zA-Z_:][-\w:.]*(\s*=\s*("[^"]*"|'[^']*'|[^\s"'<>=`]+))?)*\s*\/?>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  const PIC_NAME = /^(?:[a-z0-9][a-z0-9-]{0,39}\/)?[A-Za-z0-9][\w.-]{0,80}\.(png|jpe?g|webp)$/;
  const URL_KEYS = new Set(['url', 'src', 'link', 'href', 'embed']);
  /** Deep copy of a course with every value made safe. Strings: html → sanitised; URL fields → http(s) or empty; others → tags removed. */
  CF.scrub = function (v, key, depth) {
    depth = depth || 0; if (depth > 40) return null;
    if (Array.isArray(v)) return v.map(x => CF.scrub(x, key, depth + 1));
    if (v && typeof v === 'object') { const o = {}; Object.keys(v).forEach(k => { if (BAD_KEYS.has(k) || /[<>"'&`]/.test(k) || k.length > 60) return; o[k] = k === 'pictures' && depth === 0 ? CF.cleanPictures(v[k]) : CF.scrub(v[k], k, depth + 1); }); return o; }
    if (typeof v === 'string') {
      if (v.length > 200000) v = v.slice(0, 200000);
      if (key === 'html') return CF.sanitizeHtml(v);
      if (key === 'svg') return CF.sanitizeSvg(v);
      if (URL_KEYS.has(key)) return /^https?:\/\//i.test(v.trim()) || PIC_NAME.test(v.trim()) ? v.trim() : '';   // v69: or the name of one of the course's own pictures
      if (key === 'color' || key === 'colour') return /^#[0-9a-fA-F]{3,8}$/.test(v.trim()) ? v.trim() : '';
      if (key === 'id') return String(v).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);
      return stripTags(v);
    }
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    if (typeof v === 'boolean' || v === null) return v;
    return null;   // functions, undefined, symbols: never
  };

  /* ---------- the course code ---------- */
  CF.codeOf = function (course, envelope) {
    const tries = [envelope && envelope.code, course && course.code, course && course.title, course && course.id && String(course.id).toUpperCase()];
    for (const t of tries) { const m = t && String(t).toUpperCase().trim().match(CODE_RE); if (m) return m[1]; }
    return '';
  };
  CF.isCode = s => CODE_RE.test(String(s || '').toUpperCase().trim()) && String(s).trim().length <= 12;
  CF.idFor = code => String(code).toLowerCase().replace(/[^a-z0-9]+/g, '');
  /** The course already in Summitide Learning with this code (built in or loaded), if any. */
  CF.existing = function (code) {
    const id = CF.idFor(code), up = String(code).toUpperCase();
    return (window.LearnHub.courses || []).find(c => c.id === id || (CF.codeOf(c) && CF.codeOf(c) === up)) || null;
  };

  /* ---------- validation (the shape the app relies on) ---------- */
  CF.validate = function (course) {
    const errors = [], warns = []; const E = m => errors.push(m), W = m => warns.push(m);
    if (!course || typeof course !== 'object') { E('not a course object'); return { errors, warns, stats: {} }; }
    if (!course.id || !/^[a-z0-9-]+$/.test(course.id)) E('"id" must be lowercase letters, digits or dashes (e.g. "eng3u")');
    if (!course.title) E('"title" is missing'); else if (!/^[A-Z0-9/]+ - /.test(course.title)) W('title should read "CODE - description" (e.g. "ENG3U - English, Grade 11")');
    if (!Array.isArray(course.units) || !course.units.length) E('"units" must be a non-empty list');
    const stats = { units: 0, lessons: 0, slides: 0, questions: 0, terms: 0, assignments: 0 };
    (course.units || []).forEach((u, ui) => {
      const w = 'unit ' + (ui + 1) + (u && u.id ? ' (' + u.id + ')' : '');
      if (!u || typeof u !== 'object') { E(w + ' is not an object'); return; }
      stats.units++;
      if (!u.id) E(w + ' has no id'); if (!u.title) E(w + ' has no title');
      if (!Array.isArray(u.lessons) || !u.lessons.length) E(w + ' has no lessons');
      (u.lessons || []).forEach((l, li) => { stats.lessons++; if (!l.title) E(w + ' lesson ' + (li + 1) + ' has no title'); if (!Array.isArray(l.slides) || !l.slides.length) E(w + ' lesson ' + (li + 1) + ' has no slides'); stats.slides += (l.slides || []).length; stats.assignments += (l.assignments || []).length; });
      stats.questions += (u.questions || []).length; stats.terms += (u.terms || []).length;
      if (!(u.questions || []).length) W(w + ' has no questions (no quizzes, tests or question games)');
      if (!(u.terms || []).length) W(w + ' has no terms (no word games)');
    });
    ['icon', 'color', 'subtitle', 'description'].forEach(k => { if (!course[k]) W('"' + k + '" is missing (a default is used)'); });
    if (course.awards && typeof course.awards !== 'object') E('"awards" must be an object');
    let size = 0; try { size = JSON.stringify(course).length; } catch (e) { E('the course cannot be serialised (circular data?)'); }
    if (size > 24 * CHUNK) E('the course is very large (' + Math.round(size / 1024) + ' kB); split it into two course files');
    stats.size = size;
    return { errors, warns, stats };
  };

  /* ---------- registering in the running app ---------- */
  CF.register = function (course, meta) {
    course = CF.scrub(course);                                                           // a copy from the cloud or the cache is scrubbed like a file
    if (!course || !course.id || !Array.isArray(course.units)) return;
    const list = window.LearnHub.courses = window.LearnHub.courses || [];
    course.source = 'cloud'; course.code = (meta && meta.code) || CF.codeOf(course); course.build = (meta && meta.build) || course.build || '';
    if (window.LH && LH.plainDeep) LH.plainDeep(course);   // v67: no emoji, in loaded courses too
    if (!course.icon) course.icon = ''; if (!course.color) course.color = '#4c6ef5';
    const i = list.findIndex(c => c.id === course.id);
    if (i >= 0) list[i] = course; else list.push(course);
    CF.loaded[course.code || course.id] = course;
    // v69: what the course brought with it — colouring pictures per unit and its own figures
    const col = window.LearnHub.colouring = window.LearnHub.colouring || {}; Object.keys(col).forEach(k => { if (k.indexOf(course.id + '/') === 0) delete col[k]; });
    if (course.colouring && typeof course.colouring === 'object') Object.keys(course.colouring).forEach(u => { const pics = (Array.isArray(course.colouring[u]) ? course.colouring[u] : []).filter(p => p && p.svg); if (pics.length) col[course.id + '/' + u] = pics; });
    const pics = window.LearnHub.pictures = window.LearnHub.pictures || {}; if (course.pictures && Object.keys(course.pictures).length) pics[course.id] = course.pictures; else delete pics[course.id];
    try { window.dispatchEvent(new CustomEvent('courses:change', { detail: { id: course.id } })); } catch (e) {}
  };
  CF.unregister = function (code) {
    const c = CF.loaded[code]; if (!c) return;
    const list = window.LearnHub.courses || []; const i = list.findIndex(x => x.id === c.id); if (i >= 0) list.splice(i, 1);
    delete CF.loaded[code];
    const col = window.LearnHub.colouring || {}; Object.keys(col).forEach(k => { if (k.indexOf(c.id + '/') === 0) delete col[k]; }); if (window.LearnHub.pictures) delete window.LearnHub.pictures[c.id];
    try { window.dispatchEvent(new CustomEvent('courses:change', { detail: { id: c.id, removed: true } })); } catch (e) {}
  };

  /* ---------- the device's copy (so a loaded course is there at once, and offline) ----------
     v69: kept in IndexedDB, one record per course code: { meta, course }. `mem` mirrors it while the app runs.
     If IndexedDB is not available (some private windows) the copy lives only until the page is closed. */
  const mem = {}; let idb = null;
  const openDb = () => new Promise(res => { try { const r = indexedDB.open('summitide-courses', 1); r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('courses')) r.result.createObjectStore('courses'); }; r.onsuccess = () => res(r.result); r.onerror = () => res(null); r.onblocked = () => res(null); } catch (e) { res(null); } });
  const tx = (mode, fn) => new Promise(res => { if (!idb) return res(null); try { const t = idb.transaction('courses', mode); const out = fn(t.objectStore('courses')); t.oncomplete = () => res(out && out.result !== undefined ? out.result : true); t.onerror = t.onabort = () => res(null); } catch (e) { res(null); } });
  function readCache() { return mem; }
  CF.cacheCourse = function (code, course, meta) { mem[code] = { meta: meta || {}, course }; return tx('readwrite', st => st.put(mem[code], code)); };
  CF.uncache = function (code) { delete mem[code]; return tx('readwrite', st => st.delete(code)); };
  CF.loadCache = function () { Object.keys(mem).forEach(code => { try { CF.register(mem[code].course, Object.assign({ code }, mem[code].meta)); } catch (e) { console.warn('cached course', code, e); } }); return Object.keys(mem); };
  /** Resolves when the courses kept on this device are registered. The app waits for it (briefly) before its first screen. */
  CF.ready = (async () => {
    idb = await openDb();
    if (idb) { const keys = await tx('readonly', st => st.getAllKeys()) || [], vals = await tx('readonly', st => st.getAll()) || []; keys.forEach((k, n) => { if (vals[n] && vals[n].course) mem[k] = vals[n]; }); }
    try { const old = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); if (old && typeof old === 'object') { for (const code of Object.keys(old)) { if (!mem[code] && old[code] && old[code].course) await CF.cacheCourse(code, old[code].course, old[code].meta); } } localStorage.removeItem(CACHE_KEY); } catch (e) {}   // the copy kept by versions before 69
    return CF.loadCache();
  })();
  const localOnly = () => !(window.Cloud && Cloud.enabled);
  const isHead = () => !!(window.Staff && Staff.isMaster);

  /* ---------- cloud storage ---------- */
  const db = () => window.Cloud && Cloud.db;
  CF.save = async function (code, course, extra) {
    if (localOnly()) {   // v69: no cloud: the course is kept on this device
      if (!isHead()) throw new Error('Only the Headmaster can load courses.');
      course = CF.scrub(course); const v0 = CF.validate(course); if (v0.errors.length) throw new Error('The course did not pass the checks: ' + v0.errors[0]);
      if (!CF.isCode(code)) throw new Error('Not a course code.');
      const m0 = { code, id: course.id, title: course.title, type: 'course', build: (extra && extra.build) || new Date().toISOString().slice(0, 10), size: JSON.stringify(course).length, parts: 0, by: (extra && extra.by) || '', at: new Date().toISOString(), local: true };
      await CF.cacheCourse(code, course, m0); CF.register(course, m0); return m0;
    }
    if (!db()) throw new Error('The cloud is not connected.');
    if (Cloud.role !== 'master') throw new Error('Only the Headmaster can load courses.');
    course = CF.scrub(course); const v = CF.validate(course); if (v.errors.length) throw new Error('The course did not pass the checks: ' + v.errors[0]);
    if (!CF.isCode(code)) throw new Error('Not a course code.');
    const json = JSON.stringify(course); const parts = Math.ceil(json.length / CHUNK) || 1;
    const meta = Object.assign({ code, id: course.id, title: course.title, type: 'course', build: (extra && extra.build) || new Date().toISOString().slice(0, 10), size: json.length, parts, by: (extra && extra.by) || '', at: new Date().toISOString() }, extra && extra.format ? { format: extra.format } : {});
    // the pieces go up a few at a time (one request has a size limit); the small record that names the course goes last, so a half-sent course is never offered
    const prev = await db().collection('courses').doc(code.replace('/', '_')).get().catch(() => null); const oldParts = prev && prev.exists ? (+prev.data().parts || 0) : 0;
    for (let n = 0; n < parts; n += 6) { const batch = db().batch(); for (let k = n; k < Math.min(parts, n + 6); k++) batch.set(db().collection('courseChunks').doc(code.replace('/', '_') + '__' + k), { code, n: k, data: json.slice(k * CHUNK, (k + 1) * CHUNK) }); await batch.commit(); if (extra && extra.progress) extra.progress(Math.min(parts, n + 6), parts); }
    const last = db().batch(); for (let k = parts; k < oldParts; k++) last.delete(db().collection('courseChunks').doc(code.replace('/', '_') + '__' + k));   // pieces left from a longer earlier build
    last.set(db().collection('courses').doc(code.replace('/', '_')), meta); await last.commit();
    if (Cloud.log) Cloud.log('course.save', code, course.title + ' · ' + Math.round(json.length / 1024) + ' kB · build ' + meta.build);
    await CF.cacheCourse(code, course, meta); CF.register(course, meta);
    return meta;
  };
  CF.remove = async function (code) {
    if (localOnly()) { if (!isHead()) throw new Error('Only the Headmaster can remove courses.'); await CF.uncache(code); CF.unregister(code); return; }
    if (!db()) throw new Error('The cloud is not connected.');
    if (Cloud.role !== 'master') throw new Error('Only the Headmaster can remove courses.');
    const id = code.replace('/', '_');
    const metaSnap = await db().collection('courses').doc(id).get(); const parts = metaSnap.exists ? (+metaSnap.data().parts || 1) : 1; const was = metaSnap.exists ? String(metaSnap.data().title || '') : '';
    const batch = db().batch();
    for (let n = 0; n < parts; n++) batch.delete(db().collection('courseChunks').doc(id + '__' + n));
    batch.delete(db().collection('courses').doc(id));
    await batch.commit();
    if (Cloud.log) Cloud.log('course.remove', code, was);
    await CF.uncache(code); CF.unregister(code);
  };
  /** Pull every loaded course from the cloud and register it (replacing cached copies). */
  CF.loadAll = async function () {
    if (!db()) return [];
    await CF.ready;
    const metas = await db().collection('courses').get();
    const cached = readCache(); const seen = new Set();
    for (const d of metas.docs) {
      const m = d.data(); const code = m.code || d.id; seen.add(code);
      const c = cached[code];
      if (c && c.meta && c.meta.at === m.at && c.course) { CF.register(c.course, m); continue; }   // unchanged since we cached it
      try {
        const parts = +m.parts || 1; const chunks = [];
        for (let n = 0; n < parts; n++) { const s = await db().collection('courseChunks').doc(d.id + '__' + n).get(); chunks.push(s.exists ? s.data().data : ''); }
        const course = JSON.parse(chunks.join(''));
        await CF.cacheCourse(code, course, m); CF.register(course, m);
      } catch (e) { console.warn('course load failed', code, e); }
    }
    Object.keys(cached).forEach(code => { if (!seen.has(code)) { CF.unregister(code); CF.uncache(code); } });   // removed by the Headmaster elsewhere
    return Array.from(seen);
  };
  CF.list = () => Object.keys(CF.loaded).map(code => ({ code, course: CF.loaded[code] }));

  if (!window.LearnHub) window.LearnHub = { courses: [] };
  window.LearnHub.courses = window.LearnHub.courses || [];
})();
