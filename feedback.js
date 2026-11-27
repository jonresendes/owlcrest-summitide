/* =========================================================
   feedback.js — v78: marking one student at a time, draft marks, publishing, notices and the class board.

   DRAFT MARKS  gradeDrafts/<student>__<course> = { student, course, data: { "<unit>|<lesson>|<n>": { score, max, level, note, nm, by, at } } }
     A mark a teacher is still working on. Only the student's teachers and the Headmaster can read or write it; the
     student cannot. "Publish" copies it into the student's grade record (grades/…, which the student can read),
     removes the draft and leaves the student a notice. Marks typed anywhere else in the app are published at once,
     as before, and also leave a notice.

   NOTICES      notices/<student> = { student, items: [ { id, at, kind, title, sub, href, by } ], seen: { [id]: at } }
     "Your teacher marked …". Written by the student's teachers; the student reads it and may change only `seen`.
     A notice is unread while seen[id] is not its `at`. The bell in the header counts unread notices.

   CLASS BOARD  classBoards/<class id> = { id, posts: [ { id, at, by, text } ] }
     Short posts from the class's teacher (or the Headmaster) to the whole class, shown on the class page.
     Read by the people of the class; written by its teacher or the Headmaster. One way: students do not reply.
     New posts appear among each student's notices without a write per student.

   Device-only mode keeps the same three things in localStorage (learnhub.fb.<kind>.<id>).
   ========================================================= */
(function () {
  const { esc, L } = window.LH;
  const app = document.getElementById('app');
  const cloud = () => !!(window.Cloud && Cloud.enabled && Cloud.db && Cloud.user);
  const now = () => new Date().toISOString();
  const line = (v, n) => String(v === undefined || v === null ? '' : v).replace(/[<>]/g, '').trim().slice(0, n);
  const me = () => Students.current;
  const who = () => line((Staff.current || me() || {}).name, 60) || 'teacher';
  const newId = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const when = iso => { const d = new Date(iso); if (isNaN(d)) return ''; const today = new Date().toDateString() === d.toDateString(); return today ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString([], { day: 'numeric', month: 'short' }); };
  const why = e => e && e.code === 'permission-denied' ? 'The cloud refused this. It needs the version 78 security rules: publish the new firestore.rules in the Firebase console, then try again.' : (e && e.message) || String(e);

  /* ---------- storage: one small record per id, in the cloud or on the device ---------- */
  const COL = { draft: 'gradeDrafts', notice: 'notices', board: 'classBoards' };
  const store = {
    async get(kind, id) { if (cloud()) { const d = await Cloud.db.collection(COL[kind]).doc(id).get(); return d.exists ? d.data() : null; } try { return JSON.parse(localStorage.getItem('learnhub.fb.' + kind + '.' + id) || 'null'); } catch (e) { return null; } },
    async set(kind, id, data, merge) { if (cloud()) return Cloud.db.collection(COL[kind]).doc(id).set(data, merge ? { merge: true } : undefined); const old = merge ? (await store.get(kind, id)) || {} : {}; localStorage.setItem('learnhub.fb.' + kind + '.' + id, JSON.stringify(Object.assign(old, data))); },
    async del(kind, id) { if (cloud()) return Cloud.db.collection(COL[kind]).doc(id).delete(); localStorage.removeItem('learnhub.fb.' + kind + '.' + id); }
  };

  /* =========================== NOTICES =========================== */
  const N = { list: [], seen: {}, at: 0, loading: null, forId: '' };
  const unread = () => N.list.filter(x => N.seen[x.id] !== x.at);
  const tidyItem = x => x && x.id ? { id: line(x.id, 120), at: line(x.at, 30), kind: line(x.kind, 12), title: line(x.title, 140), sub: line(x.sub, 140), href: /^#\/[\w~%./:?=&-]*$/.test(String(x.href || '')) ? String(x.href) : '#/', by: line(x.by, 60) } : null;
  /** Load the signed-in student's notices: their own, plus the posts on the boards of their classes. */
  async function refresh(force) {
    const s = me(); if (!s || s.isStaff) { N.list = []; N.seen = {}; return; }
    if (N.forId !== s.id) { N.list = []; N.seen = {}; N.at = 0; N.forId = s.id; }
    if (!force && Date.now() - N.at < 60000) return;
    if (N.loading) return N.loading;
    N.loading = (async () => {
      let items = [], seen = {};
      try { const d = await store.get('notice', s.id); if (d) { items = (Array.isArray(d.items) ? d.items : []).map(tidyItem).filter(Boolean); seen = d.seen && typeof d.seen === 'object' ? d.seen : {}; } } catch (e) { console.warn('notices', e && e.code || e); }
      const secs = Sections.forStudent(s.id, false);
      for (const sec of secs.slice(0, 12)) { try { const b = await store.get('board', sec.id); ((b && b.posts) || []).slice(-20).forEach(p => { if (p && p.id && p.text) items.push({ id: 'p:' + sec.id + ':' + line(p.id, 40), at: line(p.at, 30), kind: 'post', title: line(p.text, 140), sub: sec.name + (p.by ? ' · ' + line(p.by, 60) : ''), href: '#/class/' + sec.id, by: line(p.by, 60) }); }); } catch (e) { /* a board that cannot be read is skipped */ } }
      items.sort((a, b) => String(b.at).localeCompare(String(a.at)));
      N.list = items.slice(0, 60); N.seen = seen; N.at = Date.now();
    })().then(() => { N.loading = null; paintBell(); }, () => { N.loading = null; });
    return N.loading;
  }
  async function markSeen(ids) {
    const s = me(); if (!s || s.isStaff) return; let changed = false;
    N.list.forEach(x => { if (ids.includes(x.id) && N.seen[x.id] !== x.at) { N.seen[x.id] = x.at; changed = true; } });
    if (!changed) return;
    const keep = {}; N.list.forEach(x => { if (N.seen[x.id]) keep[x.id] = N.seen[x.id]; }); N.seen = keep; paintBell();
    try { await store.set('notice', s.id, { student: s.id, seen: keep }, true); } catch (e) { console.warn('notices', e && e.code || e); }
  }
  /** The bell in the header (students). The one place besides the report button and profile pictures where the app draws an emoji, by request. */
  function bellHtml() { const s = me(); if (!s || s.isStaff) return ''; const n = unread().length; return '<a class="bell' + (n ? ' has-new' : '') + '" href="#/notices" id="bellBtn" aria-label="Notices' + (n ? ': ' + n + ' new' : '') + '" title="Notices"><span class="bell-ico" aria-hidden="true">🔔</span>' + (n ? '<span class="bell-n">' + (n > 9 ? '9+' : n) + '</span>' : '') + '</a>'; }
  function paintBell() { const b = document.getElementById('bellBtn'); if (b) b.outerHTML = bellHtml(); const d = document.getElementById('deskNotices'); if (d) d.outerHTML = deskHtml(); }
  const rowHtml = x => { const u = N.seen[x.id] !== x.at; return '<a class="notice-line' + (u ? ' unread' : '') + '" href="' + esc(x.href) + '" data-notice="' + esc(x.id) + '"><span class="notice-dot" aria-hidden="true"></span><span class="notice-text"><strong>' + esc(x.kind === 'post' ? 'Class board' : x.kind === 'comment' ? 'New comment' : 'Marked') + ': ' + esc(x.title) + '</strong><span class="muted small">' + esc(x.sub) + (x.at ? ' · ' + esc(when(x.at)) : '') + '</span></span>' + (u ? '<span class="tag accent">New</span>' : '') + '</a>'; };
  let deskOpen = false;   // the desk strip stays folded until the student opens it
  function deskHtml() { const all = unread(), u = all.slice(0, 3); return '<details class="notice-strip" id="deskNotices"' + (u.length ? '' : ' hidden') + (deskOpen ? ' open' : '') + '><summary><span aria-hidden="true">\uD83D\uDD14</span> <strong>Notices</strong> <span class="tag accent">' + all.length + ' new</span><span class="notice-fold muted small"></span></summary><div class="notice-list">' + u.map(rowHtml).join('') + '</div><p style="margin:0.5rem 0 0"><a class="btn ghost sm" href="#/notices">All notices</a></p></details>'; }
  document.addEventListener('toggle', e => { if (e.target && e.target.id === 'deskNotices') deskOpen = e.target.open; }, true);
  function noticesPage() {
    const s = me(); if (!s || s.isStaff) { location.replace(location.pathname + '#/'); return; }
    window.AppUI.setCourseColor(null); window.AppUI.setNav('notices');
    const draw = () => { const u = unread().length;
      app.innerHTML = window.AppUI.crumbs([{ label: window.AppUI.deskName(), href: '#/' }, { label: 'Notices' }]) +
        '<div class="page-head"><div><h1><span aria-hidden="true">🔔</span> Notices</h1><p class="muted">Work your teacher has marked, comments left for you, and posts on your class boards.</p></div>' + (u ? '<button class="btn secondary" id="noticeAll">Mark all as read</button>' : '') + '</div>' +
        (N.list.length ? '<div class="card notice-card"><div class="notice-list">' + N.list.map(rowHtml).join('') + '</div></div>' : '<div class="empty"><h2>No notices yet</h2><p class="muted">When your teacher marks your work or posts on a class board, it shows here.</p></div>');
      const all = app.querySelector('#noticeAll'); if (all) all.addEventListener('click', () => markSeen(N.list.map(x => x.id)).then(draw)); };
    draw(); refresh(true).then(() => { if (/^#\/notices/.test(location.hash)) draw(); });
  }
  // opening the thing a notice points at reads the notice
  window.addEventListener('hashchange', () => { const s = me(); if (!s || s.isStaff || !N.list.length) return; const h = location.hash.split('?')[0]; const hit = unread().filter(x => x.href === h || (x.kind !== 'post' && h.indexOf(x.href) === 0)).map(x => x.id); if (hit.length) markSeen(hit); });
  document.addEventListener('click', e => { const a = e.target.closest && e.target.closest('[data-notice]'); if (a) markSeen([a.dataset.notice]); });
  /** Leave one student a notice (a teacher's app). The same id replaces the earlier notice, so marking a piece of work twice does not stack up. */
  async function notify(sid, item) {
    if (!sid || /^demo__/.test(sid)) return; item = tidyItem(Object.assign({ at: now(), by: who() }, item)); if (!item) return;
    try { const d = (await store.get('notice', sid)) || {}; const items = (Array.isArray(d.items) ? d.items : []).filter(x => x && x.id !== item.id); items.push(item);
      await store.set('notice', sid, { student: sid, items: items.slice(-40), updatedAt: now() }, true); }
    catch (e) { console.warn('notice not left', e && e.code || e); }
  }
  /** The notice for one marked item. `it` is an item from Marking.unitItems (kind, l, n, label, title). */
  function notifyMarked(sid, course, unit, it, hasComment) {
    const key = unit.id + '|' + (it.kind === 'test' ? 'test' : it.l) + '|' + (it.kind === 'work' ? it.n : it.kind === 'test' ? 't' : 'q');
    const href = it.kind === 'work' ? '#/assign/' + course.id + '/' + unit.id + '/' + it.l + '/' + it.n : '#/grades/' + course.id;
    return notify(sid, { id: 'm:' + course.id + ':' + key, kind: hasComment ? 'comment' : 'mark', title: it.kind === 'test' ? it.label : it.label + ' · ' + it.title, sub: course.title + ' · ' + L(unit.title), href });
  }

  /* =========================== CLASS BOARD =========================== */
  const boards = {};   // class id → posts (once loaded)
  function boardHtml(sec, canPost) {
    if (!sec) return '';
    return '<section class="card class-board" data-board="' + esc(sec.id) + '" aria-label="Class board"><div class="btn-row between"><h2 class="board-title">Class board</h2><span class="muted small" data-board-note>' + (canPost ? 'Posts go to everyone in this class' : '') + '</span></div>' +
      (canPost ? '<div class="board-new" data-keep><textarea class="text-input" data-board-text rows="2" maxlength="1000" placeholder="Write a notice for the class: a reminder, a due date, what to bring…" aria-label="New post for the class"></textarea><div class="btn-row"><button class="btn sm" data-board-post>Post to the class</button><span class="small muted" data-board-msg role="status"></span></div></div>' : '') +
      '<div class="board-posts" data-board-posts><p class="muted small" style="margin:0">Loading…</p></div></section>';
  }
  function drawBoard(root, sec, canPost) {
    const host = root.querySelector('[data-board="' + sec.id + '"] [data-board-posts]'); if (!host) return;
    const posts = (boards[sec.id] || []).slice().sort((a, b) => String(b.at).localeCompare(String(a.at)));
    const open = host.dataset.all === '1', shown = open ? posts : posts.slice(0, 3);
    host.innerHTML = posts.length ? shown.map(p => '<article class="board-post"><div class="board-post-text">' + esc(p.text) + '</div><div class="board-post-foot muted small"><span>' + esc(p.by || 'Teacher') + ' · ' + esc(when(p.at)) + '</span>' + (canPost ? '<button class="btn ghost sm" data-board-del="' + esc(p.id) + '">Remove</button>' : '') + '</div></article>').join('') +
        (posts.length > 3 ? '<button class="btn ghost sm" data-board-more>' + (open ? 'Show fewer' : 'Show all ' + posts.length + ' posts') + '</button>' : '')
      : '<p class="muted small" style="margin:0">' + (canPost ? 'Nothing posted yet.' : 'Your teacher has not posted anything yet.') + '</p>';
    const more = host.querySelector('[data-board-more]'); if (more) more.addEventListener('click', () => { host.dataset.all = open ? '0' : '1'; drawBoard(root, sec, canPost); });
    host.querySelectorAll('[data-board-del]').forEach(b => b.addEventListener('click', async () => { if (!confirm('Remove this post from the class board?')) return; const next = (boards[sec.id] || []).filter(p => p.id !== b.dataset.boardDel);
      try { await store.set('board', sec.id, { id: sec.id, posts: next, updatedAt: now() }); boards[sec.id] = next; if (cloud() && Cloud.log) Cloud.log('class.board', sec.id, { name: sec.name, what: 'post removed' }); } catch (e) { alert(why(e)); } drawBoard(root, sec, canPost); }));
  }
  function bindBoard(root, sec, canPost) {
    if (!sec) return; const box = root.querySelector('[data-board="' + sec.id + '"]'); if (!box) return;
    const clean = d => ((d && Array.isArray(d.posts)) ? d.posts : []).filter(p => p && p.id && p.text).slice(-50).map(p => ({ id: line(p.id, 40), at: line(p.at, 30), by: line(p.by, 60), text: String(p.text).replace(/[<>]/g, '').slice(0, 1000) }));
    store.get('board', sec.id).then(d => { boards[sec.id] = clean(d); }).catch(e => { boards[sec.id] = boards[sec.id] || []; const n = box.querySelector('[data-board-note]'); if (n && e && e.code === 'permission-denied') n.textContent = 'The class board needs the version 78 security rules.'; })
      .then(() => { drawBoard(root, sec, canPost); const s = me(); if (s && !s.isStaff) { const ids = (boards[sec.id] || []).map(p => 'p:' + sec.id + ':' + p.id); if (ids.length) refresh().then(() => markSeen(ids)); } });
    const post = box.querySelector('[data-board-post]'); if (post) post.addEventListener('click', async () => { const ta = box.querySelector('[data-board-text]'), msg = box.querySelector('[data-board-msg]'); const text = ta.value.replace(/[<>]/g, '').trim().slice(0, 1000); if (!text) { msg.textContent = 'Write something first.'; return; }
      post.disabled = true; msg.textContent = 'Posting…';
      try { const cur = clean(await store.get('board', sec.id)); cur.push({ id: newId('b'), at: now(), by: who(), text }); const next = cur.slice(-50);
        await store.set('board', sec.id, { id: sec.id, posts: next, updatedAt: now() }); boards[sec.id] = next; ta.value = ''; ta.defaultValue = ''; msg.textContent = 'Posted.'; if (cloud() && Cloud.log) Cloud.log('class.board', sec.id, { name: sec.name, what: 'post' }); }
      catch (e) { msg.textContent = why(e); }
      post.disabled = false; drawBoard(root, sec, canPost); });
  }

  /* =========================== MARK ONE STUDENT AT A TIME =========================== */
  const MAX = 10;
  const dkey = (unit, it) => unit.id + '|' + (it.kind === 'test' ? 'test' : it.l) + '|' + (it.kind === 'work' ? it.n : it.kind === 'test' ? 't' : 'q');
  const hasMark = g => !!g && (g.nm || (g.score !== undefined && g.score !== null && g.score !== '') || !!g.note);
  function classList(course) {
    const st = Staff.current; const cur = st && Sections.currentFor(st.id);
    const list = cur && cur.courseId === course.id ? Students.list.filter(s => (cur.students || []).includes(s.id)) : Students.list.filter(s => !s.demo && (s.courses || []).includes(course.id) && (Staff.isMaster || (Sections.visible(st.id, true).some(sec => (sec.students || []).includes(s.id)))));
    return { cur: cur && cur.courseId === course.id ? cur : null, students: list.slice().sort((a, b) => String(a.name).localeCompare(String(b.name))) };
  }
  /** What is published now for this student and item: { g (the mark), w (their work), rec (quiz or test result) }. */
  function published(course, unit, it, s) {
    const u = (Progress.graded(s.id)[course.id] || {})[unit.id] || {};
    if (it.kind === 'work') { const w = ((u.work || {})[it.l] || {})[it.n] || null; return { w, g: (w && w.grade) || null }; }
    const marks = u.marks || {}; return { rec: it.kind === 'test' ? Dashboard.testRec(u) : (u.quiz || {})[it.l], g: marks[it.kind === 'test' ? 'test:t' : it.l + ':q'] || null };
  }
  function writeMark(course, unit, it, s, v) {
    const lv = Students.levelFor(course.id, s) || 2; const raw = v.score === null || v.score === undefined ? '' : String(v.score);
    if (it.kind === 'work') {
      if (raw === '' && !v.note && !v.nm) Progress.setGrade(s.id, course.id, unit.id, it.l, it.n, null);
      else Progress.setGrade(s.id, course.id, unit.id, it.l, it.n, { score: raw === '' ? null : +raw, max: MAX, level: v.level || lv, note: v.note || '', nm: !!v.nm, by: who() });
    } else { const k = it.kind === 'test' ? ['test', 't'] : [it.l, 'q'];
      Progress.setGrade(s.id, course.id, unit.id, k[0], k[1], null);
      if (raw !== '' || v.note || v.nm) Progress.setGrade(s.id, course.id, unit.id, k[0], k[1], Object.assign({ note: v.note || '', by: who() }, v.nm ? { nm: true } : {}, raw !== '' ? { score: +raw, level: v.level || lv } : {})); }
  }
  async function saveDraft(course, unit, it, s, v) { const d = (await store.get('draft', s.id + '__' + course.id)) || {}; const data = d.data && typeof d.data === 'object' ? d.data : {}; if (v) data[dkey(unit, it)] = v; else delete data[dkey(unit, it)]; await store.set('draft', s.id + '__' + course.id, { student: s.id, course: course.id, data, updatedAt: now() }); return data; }

  function gradePage(parts) {
    const st = me(); if (!st || !st.isStaff) { location.replace(location.pathname + '#/'); return; }
    const course = (window.LearnHub.courses || []).find(c => c.id === parts[0]); if (course) LH.unitsFor(course);
    const unit = course && course.units.find(u => u.id === parts[1]); const kind = parts[2];
    const items = unit ? Marking.unitItems(unit) : []; const it = items.find(x => x.kind === kind && (kind === 'test' || (String(x.l) === String(parts[3]) && (kind !== 'work' || String(x.n) === String(parts[4])))));
    if (!course || !unit || !it) { app.innerHTML = '<div class="empty"><h2>That item is not here</h2><a class="btn" href="#/dashboard">Back to the grades</a></div>'; return; }
    window.AppUI.setCourseColor(course); window.AppUI.setNav('classes');
    const { cur, students } = classList(course);
    const q = (location.hash.split('?')[1] || '').match(/s=([^&]+)/); let idx = Math.max(0, students.findIndex(s => s.id === (q && decodeURIComponent(q[1]))));
    const base = '#/grade/' + encodeURIComponent(course.id) + '/' + encodeURIComponent(unit.id) + '/' + kind + (kind === 'test' ? '' : '/' + it.l + (kind === 'work' ? '/' + it.n : ''));
    const stacked = '#/mark/' + encodeURIComponent(course.id) + '/' + encodeURIComponent(unit.id) + '/' + kind + (kind === 'test' ? '' : '/' + it.l + (kind === 'work' ? '/' + it.n : ''));
    if (!students.length) { app.innerHTML = '<div class="empty"><h2>No students to mark</h2><p class="muted">Open a class first, then mark from its Assignments, Quizzes or Tests list.</p><a class="btn" href="#/">Back to the desk</a></div>'; return; }
    const go = i => { idx = (i + students.length) % students.length; history.replaceState(history.state, '', location.pathname + base + '?s=' + encodeURIComponent(students[idx].id)); draw(); };
    const drafts = {};   // student id → the draft for this item (undefined until loaded)

    function draw() {
      const s = students[idx], pub = published(course, unit, it, s), lv = Students.levelFor(course.id, s) || 2, ro = !!(cur && cur.archived);
      const d = drafts[s.id]; const v = d || pub.g || {}; const isDraft = !!d, isPub = hasMark(pub.g);
      const left = it.kind === 'work'
        ? (pub.w && pub.w.text ? '<div class="g-sub"><div class="g-sub-head"><strong>' + (pub.w.done ? 'Handed in' : 'Draft, not handed in') + '</strong><span class="tag ' + (isPub ? 'ok' : pub.w.done ? 'accent' : '') + '">' + (isPub ? 'Marked' : pub.w.done ? 'Unmarked' : 'In progress') + '</span><span class="muted small">' + (pub.w.at ? esc(new Date(pub.w.at).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })) + ' · ' : '') + String(pub.w.text).trim().split(/\s+/).filter(Boolean).length + ' words · written at Level ' + (pub.w.level || lv) + '</span></div><div class="mark-text g-text">' + esc(pub.w.text) + '</div></div>'
            : '<div class="g-sub empty-sub"><p class="muted" style="margin:0">' + esc(s.name) + ' has not written anything for this assignment yet. You can still leave a mark or a comment.</p></div>')
        : '<div class="g-sub"><div class="g-sub-head"><strong>' + (it.kind === 'test' ? 'Unit test' : 'Lesson quiz') + '</strong></div>' + (pub.rec && (pub.rec.attempts > 0 || pub.rec.best > 0) ? '<p style="margin:0.4rem 0 0">Best score <strong>' + (pub.rec.best || 0) + '%</strong> in ' + (pub.rec.attempts || 1) + ' attempt' + ((pub.rec.attempts || 1) === 1 ? '' : 's') + '. Marked by the app; type a score on the right only to replace it.</p>' : '<p class="muted" style="margin:0.4rem 0 0">Not attempted yet.</p>') + '</div>';
      const scoreBox = it.kind === 'work'
        ? '<div class="g-score"><input class="text-input" id="gScore" type="number" min="0" max="' + MAX + '" step="0.5" value="' + (v.score === undefined || v.score === null ? '' : esc(v.score)) + '" aria-label="Score out of ' + MAX + '"' + (ro ? ' disabled' : '') + '><span class="g-max">/ ' + MAX + '</span><span class="muted small" id="gPct"></span></div>'
        : '<div class="g-score"><input class="text-input" id="gScore" type="number" min="0" max="100" step="1" value="' + (v.score === undefined || v.score === null ? '' : esc(v.score)) + '" placeholder="' + (pub.rec && pub.rec.best ? pub.rec.best : '') + '" aria-label="Score in per cent"' + (ro ? ' disabled' : '') + '><span class="g-max">%</span><span class="muted small">leave empty to keep the app\'s score</span></div>';
      app.innerHTML = '<div class="g-top"><a class="btn ghost sm" href="' + (cur ? '#/class/' + esc(cur.id) + '/' + (kind === 'work' ? 'assignments' : kind === 'quiz' ? 'quizzes' : 'tests') : '#/dashboard') + '">← Back</a>' +
          '<div class="g-top-title"><strong>' + esc(it.label) + ' · ' + esc(it.title) + '</strong><span class="muted small">' + esc(course.title) + ' · ' + esc(L(unit.title)) + (cur ? ' · ' + esc(cur.name) : '') + '</span></div>' +
          '<a class="btn ghost sm" href="' + stacked + '" title="Everyone on one page">Whole class</a>' +
          '<div class="g-nav"><button class="btn ghost sm" id="gPrev" aria-label="Previous student">‹</button><span class="small">Student ' + (idx + 1) + ' of ' + students.length + '</span><button class="btn ghost sm" id="gNext" aria-label="Next student">›</button></div></div>' +
        '<div class="g-body"><div class="g-left"><div class="g-who">' + window.AppUI.avatarHtml(s, 'who-avatar big') + '<div><strong>' + esc(s.name) + '</strong><div class="muted small">' + (s.number ? '#' + esc(s.number) + ' · ' : '') + 'Level ' + lv + '</div></div>' +
            '<select class="text-input g-jump" id="gJump" aria-label="Go to a student">' + students.map((x, i) => '<option value="' + i + '"' + (i === idx ? ' selected' : '') + '>' + esc(x.name) + '</option>').join('') + '</select></div>' + left + '</div>' +
          '<div class="g-right" data-keep><div class="g-state" id="gState">' + (d === undefined && cloud() && !(s.id in drafts) ? '<span class="muted small">Checking for a draft…</span>' : isDraft ? '<span class="tag accent">Draft</span> <span class="small">' + esc(s.name) + ' cannot see this yet.' + (isPub ? ' A published mark is still showing to them.' : '') + '</span>' : isPub ? '<span class="tag ok">Published</span> <span class="small">' + esc(s.name) + ' can see this.</span>' : '<span class="tag">Unmarked</span>') + '</div>' +
            '<h3>Overall grade</h3>' + scoreBox +
            '<label class="mark-nm"><input type="checkbox" id="gNm"' + (v.nm ? ' checked' : '') + (ro ? ' disabled' : '') + '> <span><strong>No Mark</strong> <span class="muted">· leave this out of ' + esc(s.name) + '\'s grade</span></span></label>' +
            '<h3>Overall feedback</h3><textarea class="text-input" id="gNote" rows="7" maxlength="1500" placeholder="What went well, and the next step."' + (ro ? ' disabled' : '') + '>' + esc(v.note || '') + '</textarea>' +
            '<p class="small" id="gMsg" role="status" style="min-height:1.2em;margin:0.5rem 0 0"></p></div></div>' +
        (ro ? '' : '<div class="g-foot"><span class="muted small" id="gFoot">' + (isDraft && d.at ? 'Draft saved ' + esc(when(d.at)) : '') + '</span><button class="btn secondary" id="gDraft">Save draft</button><button class="btn" id="gPublish">Publish to ' + esc(s.name.split(' ')[0]) + '</button><button class="btn secondary" id="gPubNext" title="Publish and go to the next student">Publish and next ›</button></div>');
      const $ = id => app.querySelector(id), msg = $('#gMsg');
      const pct = () => { const el = $('#gPct'); if (!el) return; const r = $('#gScore').value.trim(); if (r === '' || isNaN(+r)) { el.textContent = ''; return; } const lg = Grading.assignment({ grade: { score: +r, max: MAX }, level: (pub.w && pub.w.level) || lv }); el.textContent = lg ? '= ' + lg.grade + ' at Level ' + ((pub.w && pub.w.level) || lv) : ''; };
      pct(); if ($('#gScore')) $('#gScore').addEventListener('input', pct);
      $('#gPrev').addEventListener('click', () => go(idx - 1)); $('#gNext').addEventListener('click', () => go(idx + 1)); $('#gJump').addEventListener('change', e => go(+e.target.value));
      const read = () => { const raw = $('#gScore').value.trim(), top = it.kind === 'work' ? MAX : 100; if (raw !== '' && (isNaN(+raw) || +raw < 0 || +raw > top)) { msg.textContent = 'Type a score from 0 to ' + top + '.'; return null; } return { score: raw === '' ? null : +raw, max: it.kind === 'work' ? MAX : 100, level: (pub.w && pub.w.level) || lv, note: $('#gNote').value.trim().slice(0, 1500), nm: $('#gNm').checked, by: who(), at: now() }; };
      const settle = () => app.querySelectorAll('[data-keep] input, [data-keep] textarea').forEach(el => { el.defaultValue = el.value; });
      if (!ro) {
        $('#gDraft').addEventListener('click', async () => { const val = read(); if (!val) return; msg.textContent = 'Saving…'; try { await saveDraft(course, unit, it, s, hasMark(val) ? val : null); drafts[s.id] = hasMark(val) ? val : null; settle(); draw(); } catch (e) { msg.textContent = why(e); } });
        const publish = async next => { const val = read(); if (!val) return; msg.textContent = 'Publishing…';
          try { writeMark(course, unit, it, s, val); if (drafts[s.id]) { await saveDraft(course, unit, it, s, null); } drafts[s.id] = null;
            if (hasMark(val)) await notifyMarked(s.id, course, unit, it, !!val.note);
            if (cloud() && Cloud.log) Cloud.log('mark.publish', s.id, { item: it.label, course: course.id }); settle();
            if (next && students.length > 1) go(idx + 1); else draw(); }
          catch (e) { msg.textContent = why(e); } };
        $('#gPublish').addEventListener('click', () => publish(false)); $('#gPubNext').addEventListener('click', () => publish(true));
      }
      if (!(s.id in drafts)) store.get('draft', s.id + '__' + course.id).then(doc => { drafts[s.id] = (doc && doc.data && doc.data[dkey(unit, it)]) || null; }).catch(e => { drafts[s.id] = null; console.warn('draft', e && e.code || e); })
        .then(() => { if (students[idx] && students[idx].id === s.id && /^#\/grade\//.test(location.hash) && !Array.from(app.querySelectorAll('[data-keep] input, [data-keep] textarea')).some(el => el.type !== 'checkbox' && el.value !== el.defaultValue)) draw(); });
    }
    draw();
  }
  /** Drafts a student's record copy should list (staff). */
  async function draftsFor(sid) { const out = {}; if (cloud()) { const q = await Cloud.db.collection('gradeDrafts').where('student', '==', sid).get(); q.docs.forEach(d => { const p = d.data(); if (p.course) out[p.course] = p.data || {}; }); } else { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); const m = k && k.match(/^learnhub\.fb\.draft\.(.+)__(.+)$/); if (m && m[1] === sid) { try { out[m[2]] = (JSON.parse(localStorage.getItem(k)) || {}).data || {}; } catch (e) {} } } } return out; }
  /** Everything of one student's that this module keeps (when the student is deleted). */
  async function forgetStudent(sid, courses) { for (const c of (courses || [])) await store.del('draft', sid + '__' + c).catch(() => {}); await store.del('notice', sid).catch(() => {}); }

  window.Feedback = { gradePage, notify, notifyMarked, draftsFor, forgetStudent,
    Notices: { refresh, bellHtml, deskHtml, page: noticesPage, unread: () => unread().length },
    Board: { html: boardHtml, bind: bindBoard } };
})();
