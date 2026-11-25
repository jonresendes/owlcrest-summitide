/* =========================================================
   curriculum.js — v68: the Curriculum shelf (#/curriculum), for staff.
   A place for the documents a course is built from: a Ministry curriculum document, a policy document
   (Growing Success and the like), a course outline. Nothing is listed until the head of the school adds it.
   Each entry is one of three things:
     • a link to the publisher's own page (always current, nothing stored here)
     • a file kept with the app (a path in this site's own folder, for a board that hosts its own copy)
     • an uploaded PDF, kept in the school's own database in pieces (no extra service is used)
   Cloud:   curriculum/{id}             { id, title, course, province, kind, year, note, link, file: { name, size, parts }, addedBy, addedAt }
            curriculumChunks/{id}__{n}  { doc, n, data }   base64 text in pieces of ≤ 700,000 characters
   Device-only mode keeps links in learnhub.curriculum on the device; uploads need the cloud.
   These are published documents, not records about a person: no personal information is collected here.
   ========================================================= */
(function () {
  const { esc } = window.LH;
  const app = document.getElementById('app');
  const KEY = 'learnhub.curriculum', CHUNK = 700000, MAX_BYTES = 8 * 1024 * 1024;
  const KINDS = ['Curriculum document', 'Policy document', 'Course outline', 'Other'];
  const PROVINCES = ['Ontario', 'Alberta', 'British Columbia', 'Manitoba', 'New Brunswick', 'Newfoundland and Labrador', 'Northwest Territories', 'Nova Scotia', 'Nunavut', 'Prince Edward Island', 'Quebec', 'Saskatchewan', 'Yukon', 'Other'];
  const cloud = () => !!(window.Cloud && Cloud.enabled && Cloud.db && Cloud.user);
  const head = () => !!(Students.current && Students.current.role === 'master');
  const line = (v, n) => String(v === undefined || v === null ? '' : v).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
  const st = { list: null, error: '', busy: '', got: {}, form: false, q: '' };
  const local = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; } };
  /** A link is a web address (https) or a file in this site's own folder (curriculum/eng3u.pdf). Anything else is refused. */
  function linkOf(v) { v = String(v || '').trim(); if (/^https:\/\/[^\s<>"']+$/i.test(v)) return v; if (/^[A-Za-z0-9][\w./-]*\.(pdf|html?)$/i.test(v) && v.indexOf('..') < 0 && v.indexOf('//') < 0) return v; return ''; }
  function tidy(d) {
    const f = d.file && typeof d.file === 'object' ? { name: line(d.file.name, 120) || 'document.pdf', size: +d.file.size || 0, parts: Math.max(0, Math.min(40, +d.file.parts || 0)) } : null;
    return { id: String(d.id || ''), title: line(d.title, 140) || 'Untitled', course: line(d.course, 20).toUpperCase(), province: PROVINCES.includes(d.province) ? d.province : 'Other', kind: KINDS.includes(d.kind) ? d.kind : 'Other', year: line(d.year, 12), note: line(d.note, 300), link: linkOf(d.link), file: f && f.parts ? f : null, addedBy: line(d.addedBy, 60), addedAt: String(d.addedAt || '') };
  }
  async function load() {
    st.error = '';
    if (!cloud()) { st.list = local().map(tidy); return; }
    try { const q = await Cloud.db.collection('curriculum').get(); st.list = q.docs.map(d => tidy(Object.assign({}, d.data(), { id: d.id }))); }
    catch (e) { st.list = []; st.error = e && e.code === 'permission-denied' ? 'The Curriculum shelf needs the version 68 security rules. Publish the new firestore.rules in the Firebase console, then reload.' : 'The Curriculum shelf could not be read: ' + (e && e.message || e); }
    try { localStorage.setItem(KEY + '.n', String(st.list.length)); } catch (e) {}
  }
  const count = () => st.list ? st.list.length : (cloud() ? +(localStorage.getItem(KEY + '.n') || 0) : local().length);
  const newId = () => 'cu' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  function b64(bytes) { let out = ''; const step = 0x8000; for (let i = 0; i < bytes.length; i += step) out += String.fromCharCode.apply(null, bytes.subarray(i, i + step)); return btoa(out); }
  function unb64(text) { const bin = atob(text); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
  const sizeText = n => n >= 1048576 ? (Math.round(n / 104857.6) / 10) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';

  async function add(entry, file, say) {
    const id = newId(); const rec = Object.assign(tidy(Object.assign({}, entry, { id })), { addedBy: line((Students.current || {}).name, 60), addedAt: new Date().toISOString() });
    if (file) {
      if (!cloud()) throw new Error('Uploading needs the cloud. Add a link instead.');
      if (file.size > MAX_BYTES) throw new Error('That file is ' + sizeText(file.size) + '. The most that can be kept here is ' + sizeText(MAX_BYTES) + '. Add a link to it instead.');
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (String.fromCharCode.apply(null, bytes.subarray(0, 5)) !== '%PDF-') throw new Error('Only PDF files can be uploaded. For anything else, add a link.');
      const text = b64(bytes), parts = Math.ceil(text.length / CHUNK);
      for (let n = 0; n < parts; n++) { say('Uploading part ' + (n + 1) + ' of ' + parts + '…'); await Cloud.db.collection('curriculumChunks').doc(id + '__' + n).set({ doc: id, n, data: text.slice(n * CHUNK, (n + 1) * CHUNK) }); }
      rec.file = { name: line(file.name, 120) || 'document.pdf', size: file.size, parts }; rec.link = '';
    }
    if (!rec.file && !rec.link) throw new Error('Add a link that starts with https://, a file path in this site (for example curriculum/eng3u.pdf), or choose a PDF to upload.');
    if (cloud()) { await Cloud.db.collection('curriculum').doc(id).set(rec); if (Cloud.log) Cloud.log('curriculum.add', '', { title: rec.title, course: rec.course, how: rec.file ? 'upload' : 'link' }); }
    else { const l = local(); l.push(rec); localStorage.setItem(KEY, JSON.stringify(l)); }
    st.list = null;
  }
  async function remove(id) {
    const rec = (st.list || []).find(x => x.id === id); if (!rec) return;
    if (cloud()) { for (let n = 0; n < ((rec.file && rec.file.parts) || 0); n++) await Cloud.db.collection('curriculumChunks').doc(id + '__' + n).delete().catch(() => {}); await Cloud.db.collection('curriculum').doc(id).delete(); if (Cloud.log) Cloud.log('curriculum.remove', '', { title: rec.title }); }
    else localStorage.setItem(KEY, JSON.stringify(local().filter(x => x.id !== id)));
    if (st.got[id]) { try { URL.revokeObjectURL(st.got[id]); } catch (e) {} delete st.got[id]; }
    st.list = null;
  }
  async function fetchFile(rec) {
    let text = ''; for (let n = 0; n < rec.file.parts; n++) { const d = await Cloud.db.collection('curriculumChunks').doc(rec.id + '__' + n).get(); if (!d.exists) throw new Error('Part ' + (n + 1) + ' of this file is missing. Upload it again.'); text += d.data().data || ''; }
    const bytes = unb64(text); if (String.fromCharCode.apply(null, bytes.subarray(0, 5)) !== '%PDF-') throw new Error('This file is not a PDF and was not opened.');
    return URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  }

  function row(r) {
    const url = st.got[r.id];
    const act = r.file ? (url ? '<a class="btn secondary sm" href="' + esc(url) + '" target="_blank" rel="noopener">Open</a><a class="btn ghost sm" href="' + esc(url) + '" download="' + esc(r.file.name) + '">Save a copy</a>' : '<button class="btn secondary sm" data-cu-get="' + esc(r.id) + '"' + (st.busy === r.id ? ' disabled' : '') + '>' + (st.busy === r.id ? 'Getting the file…' : 'Get the file · ' + sizeText(r.file.size)) + '</button>')
      : '<a class="btn secondary sm" href="' + esc(r.link) + '" target="_blank" rel="noopener noreferrer">Open' + (/^https:/i.test(r.link) ? ' the page ↗' : '') + '</a>';
    return '<div class="work-line cu-line"><div class="work-what"><strong>' + esc(r.title) + '</strong><span class="muted small">' + esc(r.kind) + (r.year ? ' · ' + esc(r.year) : '') + ' · ' + esc(r.province) + (r.file ? ' · uploaded PDF' : /^https:/i.test(r.link) ? ' · link to ' + esc((r.link.match(/^https:\/\/([^/]+)/i) || [])[1] || 'a web page') : ' · file kept with the app') + (r.note ? '<br>' + esc(r.note) : '') + '</span></div>' +
      '<div class="work-acts">' + act + (head() ? '<button class="btn ghost sm" data-cu-del="' + esc(r.id) + '">Remove</button>' : '') + '</div></div>';
  }
  function formHtml() {
    const courses = (window.LearnHub.courses || []).map(c => (LH.courseCode(c) || c.id).toUpperCase());
    return '<div class="card cu-form" data-keep><h3>Add a document</h3><div class="task-form">' +
      '<label class="task-wide">Title<input class="text-input" id="cuTitle" maxlength="140" placeholder="For example: The Ontario Curriculum, Grades 9 to 12: English"></label>' +
      '<label>Course code <span class="muted small">(optional)</span><input class="text-input" id="cuCourse" maxlength="20" list="cuCourses" placeholder="ENG3U"><datalist id="cuCourses">' + courses.map(c => '<option value="' + esc(c) + '">').join('') + '</datalist></label>' +
      '<label>Province or territory<select class="text-input" id="cuProv">' + PROVINCES.map(p => '<option>' + p + '</option>').join('') + '</select></label>' +
      '<label>Kind<select class="text-input" id="cuKind">' + KINDS.map(k => '<option>' + k + '</option>').join('') + '</select></label>' +
      '<label>Year <span class="muted small">(optional)</span><input class="text-input" id="cuYear" maxlength="12" placeholder="2007"></label>' +
      '<label class="task-wide">Link <span class="muted small">a web address that starts with https://, or the path of a file kept in this site\'s folder</span><input class="text-input" id="cuLink" maxlength="400" placeholder="https://…"></label>' +
      '<label class="task-wide">Or upload a PDF <span class="muted small">up to ' + sizeText(MAX_BYTES) + (cloud() ? '; kept in the school\'s database' : '; needs the cloud') + '</span><input class="text-input" id="cuFile" type="file" accept="application/pdf,.pdf"' + (cloud() ? '' : ' disabled') + '></label>' +
      '<label class="task-wide">Note <span class="muted small">(optional)</span><input class="text-input" id="cuNote" maxlength="300"></label>' +
      '<div class="task-wide btn-row"><button class="btn" id="cuSave">Add to the shelf</button><button class="btn ghost" id="cuCancel">Cancel</button><span class="small muted" id="cuMsg" role="status"></span></div></div>' +
      '<p class="muted small" style="margin:0.6rem 0 0">A link is the safest choice: it always shows the publisher\'s current version and nothing is copied. Before uploading or hosting a copy of someone else\'s document, check that its terms of use allow it.</p></div>';
  }
  function draw() {
    const me = Students.current; if (!me || !me.isStaff) { location.replace(location.pathname + '#/'); return; }
    window.AppUI.setCourseColor(null); window.AppUI.setNav('curriculum');
    const list = (st.list || []).slice().sort((a, b) => (a.course || '~').localeCompare(b.course || '~') || a.title.localeCompare(b.title));
    const words = st.q.toLowerCase().split(/\s+/).filter(Boolean);
    const shown = list.filter(r => !words.length || words.every(w => (r.title + ' ' + r.course + ' ' + r.province + ' ' + r.kind + ' ' + r.note).toLowerCase().includes(w)));
    const groups = {}; shown.forEach(r => { const k = r.course || ''; (groups[k] = groups[k] || []).push(r); });
    const keys = Object.keys(groups).sort((a, b) => (a || '~').localeCompare(b || '~'));
    const title = k => { if (!k) return 'For every course'; const c = (window.LearnHub.courses || []).find(x => (LH.courseCode(x) || x.id).toUpperCase() === k); return k + (c ? ' · ' + c.title.replace(/^[A-Z0-9/]+ - /, '') : ''); };
    app.innerHTML = window.AppUI.crumbs([{ label: window.AppUI.deskName(), href: '#/' }, { label: 'Curriculum' }]) +
      '<div class="page-head"><div><h1>Curriculum</h1><p class="muted">The documents the courses are built from: Ministry curriculum documents, policy documents and course outlines. For staff.</p></div>' +
      (head() && !st.form ? '<button class="btn" id="cuNew">＋ Add a document</button>' : '') + '</div>' +
      (st.error ? '<div class="plan-banner warn-banner" role="alert">' + esc(st.error) + '</div>' : '') +
      (head() && st.form ? formHtml() : '') +
      (st.list === null ? '<div class="empty"><p class="muted">Loading…</p></div>'
        : !list.length ? '<div class="empty"><h2>Nothing on the shelf yet</h2><p class="muted">' + (head() ? 'Add the curriculum document for a course when you add the course. Until then this page stays empty.' : 'The ' + esc(LH.headTitle()) + ' adds documents here.') + '</p></div>'
        : (list.length > 6 ? '<div class="student-search"><input class="text-input" id="cuQ" type="search" placeholder="Find a document by title, course or province…" value="' + esc(st.q) + '"></div>' : '') +
          (keys.length ? keys.map(k => '<section class="card work-card"><h2 class="work-unit">' + esc(title(k)) + '</h2><div class="work-list">' + groups[k].map(row).join('') + '</div></section>').join('') : '<p class="muted">No document matches.</p>'));
    const on = (sel, ev, fn) => { const el = app.querySelector(sel); if (el) el.addEventListener(ev, fn); };
    on('#cuNew', 'click', () => { st.form = true; draw(); });
    on('#cuCancel', 'click', () => { st.form = false; draw(); });
    on('#cuQ', 'change', e => { st.q = e.target.value; draw(); });
    on('#cuSave', 'click', async () => { const g = id => app.querySelector(id), msg = g('#cuMsg'); const say = t => { msg.textContent = t; };
      const title = g('#cuTitle').value.trim(), link = g('#cuLink').value.trim(), file = g('#cuFile').files && g('#cuFile').files[0];
      if (!title) { say('Give the document a title.'); return; }
      if (link && !linkOf(link)) { say('The link must start with https://, or be the path of a PDF or web page in this site\'s folder.'); return; }
      g('#cuSave').disabled = true; say('Saving…');
      try { await add({ title, course: g('#cuCourse').value, province: g('#cuProv').value, kind: g('#cuKind').value, year: g('#cuYear').value, note: g('#cuNote').value, link }, file || null, say); st.form = false; await load(); draw(); }
      catch (e) { say(e && e.code === 'permission-denied' ? 'The cloud refused this. Publish the version 68 firestore.rules, then try again.' : (e && e.message) || String(e)); g('#cuSave').disabled = false; } });
    app.querySelectorAll('[data-cu-del]').forEach(b => b.addEventListener('click', async () => { const r = (st.list || []).find(x => x.id === b.dataset.cuDel); if (!r || !confirm('Remove "' + r.title + '" from the shelf?' + (r.file ? ' The uploaded file is deleted.' : ''))) return; try { await remove(r.id); await load(); } catch (e) { alert('That did not work: ' + (e && e.message || e)); } draw(); }));
    app.querySelectorAll('[data-cu-get]').forEach(b => b.addEventListener('click', async () => { const r = (st.list || []).find(x => x.id === b.dataset.cuGet); if (!r) return; st.busy = r.id; draw(); try { st.got[r.id] = await fetchFile(r); } catch (e) { alert((e && e.message) || String(e)); } st.busy = ''; draw(); }));
  }
  function page() { draw(); if (st.list === null) load().then(() => { if (/^#\/curriculum/.test(location.hash)) draw(); }); }

  window.Curriculum = { page, count, linkOf };
})();
