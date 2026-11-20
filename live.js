/* Live Class Board + Focus Mode (v58).

   Two halves, one file:

   STUDENT SIDE — while a teacher is running a live session for one of the student's sections, the app
   writes a small "presence" record (presence/<uid>) every 30 s and on every change: which page they are
   on, which question, whether Summitide is the thing on screen (focused / in another window / hidden),
   and a log of the times they left during the session. Nothing is sent when no session is running.
   The app can only see itself: it never sees other tabs, apps or the screen.

   Focus Mode (a switch on the session) asks for fullscreen when a quiz or test starts, and every time the
   student leaves during it — tab hidden, window not focused, fullscreen closed — the leave is timed,
   shown to the student when they come back, written to presence, and kept on the attempt record
   (levels[L].last.away) so it shows on the marking screen.

   TEACHER SIDE — #/live: pick a section, start a session (what they are writing, Focus Mode on/off),
   then a tile per student on the roster. A click on a tile marks that student as writing today
   (sometimes students are away). Lists: who is writing now, and a drop-down of who is not, with the
   reason. A student who arrives late and opens the item goes live on the board on their own and is
   added to the writing list with a "joined late" mark.

   Cloud records: live/<sectionId> (written by the section's teacher, read by its students) and
   presence/<uid> (written only by that student, read by their teachers). See firestore.rules. */
(function () {
  const esc = s => String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const now = () => new Date().toISOString();
  const app = () => document.getElementById('app');
  const HEARTBEAT = 30000, STALE = 75000, BOARD_TICK = 10000;
  const Live = { sessions: {}, presence: {}, unsub: {}, version: 1 };
  window.Live = Live;

  /* ====================== shared ====================== */
  const cloudOn = () => !!(window.Cloud && Cloud.enabled && Cloud.user && Cloud.db);
  const me = () => window.Students && Students.current;
  const uid = () => (window.Cloud && Cloud.user && Cloud.user.uid) || '';
  const sections = () => (window.Sections && Sections.list) || [];
  const db = () => Cloud.db;
  const fmtTime = iso => { try { return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; } };
  const fmtSecs = s => { s = Math.round(s || 0); return s < 60 ? s + ' s' : Math.floor(s / 60) + ' min ' + (s % 60 ? (s % 60) + ' s' : ''); };
  const ago = iso => { const d = (Date.now() - new Date(iso).getTime()) / 1000; return d < 50 ? 'just now' : d < 3600 ? Math.round(d / 60) + ' min ago' : fmtTime(iso); };

  /** What a session is about: the item students write. { kind: 'test'|'quiz'|'assign'|'any', unitId, lessonIdx, n, label, href } */
  function targetsFor(course) {
    const out = [{ kind: 'any', label: 'Any work in ' + course.title, href: '#/course/' + course.id }];
    (window.LH.unitsFor(course) || []).forEach((u, ui) => {
      out.push({ kind: 'test', unitId: u.id, label: 'Unit ' + (ui + 1) + ' test · ' + u.title, href: '#/test/' + course.id + '/' + u.id });
      (window.LH.lessonsFor(u) || []).forEach((les, li) => {
        out.push({ kind: 'quiz', unitId: u.id, lessonIdx: les._idx, label: 'Unit ' + (ui + 1) + ' · Lesson ' + (li + 1) + ' quiz · ' + les.title, href: '#/quiz/' + course.id + '/' + u.id + '/' + les._idx });
        (les.assignments || []).forEach((a, ai) => out.push({ kind: 'assign', unitId: u.id, lessonIdx: les._idx, n: ai, label: 'Unit ' + (ui + 1) + ' · Lesson ' + (li + 1) + ' assignment ' + (ai + 1) + (a.title ? ' · ' + a.title : ''), href: '#/assign/' + course.id + '/' + u.id + '/' + les._idx + '/' + ai }));
      });
    });
    return out.map(t => Object.assign(t, { label: String(t.label).replace(/[<>]/g, '').slice(0, 120) }));
  }
  /** Is this hash "on" the session's item? any → anywhere inside the course. */
  function onTarget(hash, ses) {
    const p = String(hash || '').replace(/^#\/?/, '').split('?')[0].split('/');
    if (!ses || !ses.courseId) return false;
    if (p[1] !== ses.courseId) return false;
    const t = ses.target || {};
    if (t.kind === 'any') return ['course', 'lesson', 'study', 'quiz', 'test', 'assign', 'work', 'games', 'game'].includes(p[0]);
    if (t.kind === 'test') return p[0] === 'test' && p[2] === t.unitId;
    if (t.kind === 'quiz') return p[0] === 'quiz' && p[2] === t.unitId && +p[3] === +t.lessonIdx;
    if (t.kind === 'assign') return p[0] === 'assign' && p[2] === t.unitId && +p[3] === +t.lessonIdx && +p[4] === +t.n;
    return false;
  }
  const isAssessment = hash => /^#\/(quiz|test)\//.test(hash || '');
  /** A short human label for where the student is in the app (never the content of what they typed). */
  function pageLabel(hash) {
    const p = String(hash || '').replace(/^#\/?/, '').split('?')[0].split('/');
    const c = p[1] && window.LH.findCourse(p[1]); const u = c && window.LH.findUnit(c, p[2]);
    const code = c ? (window.LH.courseCode ? window.LH.courseCode(c) : c.id.toUpperCase()) : '';
    const lesson = () => { const l = u && window.LH.lessonAt(u, +p[3]); return l ? ' · ' + l.title : ''; };
    switch (p[0]) {
      case '': return 'Student Desk';
      case 'course': return code + ' · course page';
      case 'lesson': return code + lesson() + ' (lesson)';
      case 'study': return code + lesson() + ' (slides)';
      case 'quiz': return code + lesson() + ' (quiz)';
      case 'test': return code + (u ? ' · ' + u.title : '') + ' (unit test)';
      case 'assign': return code + lesson() + ' (assignment)';
      case 'work': return code + (u ? ' · ' + u.title : '') + ' (work folder)';
      case 'games': case 'game': return code + ' · Game Room';
      case 'grades': return 'Grades'; case 'case': return 'Display Case'; case 'settings': return 'Settings'; case 'notes': return 'Notes';
      default: return p[0] || 'Summitide';
    }
  }

  /* ====================== student side ====================== */
  const S = { lastSent: 0, watching: {}, active: null, state: 'on', leaveStart: null, leaves: [], leaveCount: 0, awaySecs: 0, joinedAt: null, q: 0, n: 0, done: false, timer: null, lastKey: '', attempt: null };
  const mySections = () => { const id = uid(); return sections().filter(s => !s.archived && Array.isArray(s.students) && s.students.includes(id)); };
  function isStudentSession() { const m = me(); return cloudOn() && Cloud.role === 'student' && m && !m.isStaff && !m.demo; }

  /** Keep a listener on live/<section> for each section I am in; drop the rest. */
  function syncStudentWatch() {
    if (!isStudentSession()) { Object.keys(S.watching).forEach(k => { S.watching[k](); delete S.watching[k]; }); if (S.active) setActive(null); return; }
    const want = new Set(mySections().map(s => s.id));
    Object.keys(S.watching).forEach(k => { if (!want.has(k)) { S.watching[k](); delete S.watching[k]; delete Live.sessions[k]; } });
    want.forEach(id => { if (S.watching[id]) return;
      S.watching[id] = db().collection('live').doc(id).onSnapshot(d => { if (d.exists) Live.sessions[id] = Object.assign({ id }, d.data()); else delete Live.sessions[id]; pickActive(); }, err => console.warn('live listen', id, err && err.code)); });
    pickActive();
  }
  function pickActive() {
    // v59: a session a teacher forgot to end stops counting after 12 hours, so presence is never sent day after day
    const running = Object.values(Live.sessions).filter(s => s && !s.endedAt && (Date.now() - new Date(s.startedAt).getTime()) < 12 * 3600000);
    running.sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
    const next = running[0] || null;
    if ((next && next.id) !== (S.active && S.active.id) || (next && S.active && next.startedAt !== S.active.startedAt)) setActive(next); else { S.active = next; banner(); }
  }
  function setActive(ses) {
    const was = S.active; S.active = ses;
    if (ses && (!was || was.id !== ses.id || was.startedAt !== ses.startedAt)) { S.leaves = []; S.leaveCount = 0; S.awaySecs = 0; S.joinedAt = now(); S.done = false; S.leaveStart = null; }
    if (ses) { send('join'); clearInterval(S.timer); S.timer = setInterval(() => send('beat'), HEARTBEAT); }
    else { clearInterval(S.timer); S.timer = null; if (was) sendBye(was); }
    banner(); focusUi();
    window.dispatchEvent(new CustomEvent('live:change'));
  }
  function presenceDoc(reason) {
    const ses = S.active; const hash = location.hash || '#/';
    return { v: 1, student: uid(), live: ses ? ses.id : null, since: ses ? ses.startedAt : null, page: String(hash).slice(0, 200), label: pageLabel(hash).replace(/[<>]/g, '').slice(0, 120),
      target: ses ? onTarget(hash, ses) : false, q: S.q || 0, n: S.n || 0, state: S.state, done: !!S.done, at: now(), joinedAt: S.joinedAt, leaveCount: S.leaveCount, awaySecs: Math.round(S.awaySecs),
      leaves: S.leaves.slice(-20), why: String(reason || '').slice(0, 12) };
  }
  let sendT = null;
  function send(reason) {
    if (!isStudentSession() || !S.active) return;
    const doc = presenceDoc(reason);
    const key = JSON.stringify([doc.live, doc.page, doc.q, doc.state, doc.done, doc.leaveCount]);
    if (reason === 'beat' && key === S.lastKey && Date.now() - S.lastSent < HEARTBEAT * 0.9) return;   // nothing new and sent recently: skip
    S.lastKey = key; S.lastSent = Date.now();
    clearTimeout(sendT); sendT = setTimeout(() => db().collection('presence').doc(uid()).set(doc).catch(e => console.warn('presence', e && e.code)), 80);
  }
  function sendBye(was) { if (!cloudOn() || Cloud.role !== 'student') return; const doc = presenceDoc('end'); doc.live = null; doc.since = was.startedAt; doc.target = onTarget(location.hash, was); db().collection('presence').doc(uid()).set(doc).catch(() => {}); }

  /* --- leaving and coming back --- */
  function computeState() { return document.visibilityState === 'hidden' ? 'hidden' : document.hasFocus() ? 'on' : 'blur'; }
  function onVis() {
    const st = computeState(); if (st === S.state) return;
    const wasOn = S.state === 'on'; S.state = st;
    if (!wasOn && st === 'on') cameBack(); else if (wasOn) { S.leaveStart = Date.now(); }
    send('state');
  }
  function cameBack() {
    if (!S.leaveStart) return;
    const secs = (Date.now() - S.leaveStart) / 1000; S.leaveStart = null;
    if (secs < 1.5) return;   // a click on the address bar is not a leave
    S.leaveCount++; S.awaySecs += secs; S.leaves.push({ at: now(), secs: Math.round(secs), page: pageLabel(location.hash).slice(0, 60) });
    if (S.attempt) { S.attempt.count++; S.attempt.secs += secs; }
    if (S.active && S.active.focus && isAssessment(location.hash) && S.attempt) showReturnNotice(secs);
  }
  function showReturnNotice(secs) {
    const old = document.getElementById('focusReturn'); if (old) old.remove();
    const d = document.createElement('div'); d.id = 'focusReturn'; d.className = 'focus-return'; d.setAttribute('role', 'alertdialog');
    d.innerHTML = '<div class="focus-return-card"><div class="focus-return-icon">👀</div><h2>You left Summitide for ' + esc(fmtSecs(secs)) + '</h2><p>Focus Mode is on for this ' + (/test/.test(location.hash) ? 'test' : 'quiz') + '. Your teacher can see that you left and for how long. Stay in Summitide until you hand it in.</p><button class="btn lg" id="focusResume">Back to my work</button></div>';
    document.body.appendChild(d); d.querySelector('#focusResume').addEventListener('click', () => { d.remove(); goFullscreen(); });
  }
  function goFullscreen() {
    const el = document.documentElement; if (document.fullscreenElement || !el.requestFullscreen) return;
    try { const p = el.requestFullscreen(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
  }
  function leaveFullscreen() { if (document.fullscreenElement && document.exitFullscreen) { try { document.exitFullscreen().catch(() => {}); } catch (e) {} } }

  /* --- hooks called by app.js around a quiz or test --- */
  Live.focusOn = () => !!(isStudentSession() && S.active && S.active.focus && isAssessment(location.hash));
  Live.assessmentStart = n => { S.n = n || 0; S.q = 0; S.done = false; S.attempt = { count: 0, secs: 0, focus: Live.focusOn() }; if (Live.focusOn()) goFullscreen(); send('start'); };
  Live.assessmentStep = i => { S.q = (i || 0) + 1; send('step'); };
  /** The attempt is over: returns { count, secs } of leaves during it (or null when Focus Mode was off). */
  Live.assessmentDone = () => { S.done = true; S.q = S.n; const a = S.attempt; S.attempt = null; send('done'); leaveFullscreen(); return a && a.focus ? { count: a.count, secs: Math.round(a.secs) } : null; };
  /** A notice for the start screen of a quiz or test while Focus Mode is on. */
  Live.focusNoticeHtml = () => Live.focusOn() ? '<div class="focus-notice">🎯 <strong>Focus Mode is on.</strong> ' + esc(teacherName(S.active)) + ' can see that you are in Summitide and when you leave it during this ' + (/test/.test(location.hash) ? 'test' : 'quiz') + ' — never what is outside the app. It opens full screen; stay in it until you hand in.</div>' : '';
  function teacherName(ses) { if (!ses) return 'Your teacher'; const St = window.Staff; const t = St && (St.teachers || []).find(x => x.id === ses.teacherId); if (t) return t.name; if (St && St.master && (ses.teacherId === St.master.uid || ses.teacherId === 'master')) return St.master.name || 'The Headmaster'; return ses.teacherName || 'Your teacher'; }

  /** Banner on every student page while a session runs. */
  function banner() {
    const old = document.getElementById('liveBanner'); if (old) old.remove();
    const ses = S.active; const a = app(); if (!ses || !a || !isStudentSession()) return;
    const here = onTarget(location.hash, ses);
    const d = document.createElement('div'); d.id = 'liveBanner'; d.className = 'live-banner' + (here ? ' here' : ''); d.setAttribute('role', 'status');
    d.innerHTML = '<span class="live-dot" aria-hidden="true"></span><span><strong>Live now:</strong> ' + esc(teacherName(ses)) + ' has started <strong>' + esc(ses.target && ses.target.label || 'a session') + '</strong>' + (ses.focus ? ' · <span class="tag accent">🎯 Focus Mode</span>' : '') +
      '<span class="muted small live-privacy"> While it runs, your teacher sees that you are in Summitide, which page you are on and when you leave the app — nothing outside it.</span></span>' +
      (here ? (S.done ? '<span class="tag">✅ handed in</span>' : '<span class="tag">✍ you are on it</span>') : '<a class="btn sm" href="' + esc(ses.target && ses.target.href || '#/') + '">Go to it →</a>');
    a.insertBefore(d, a.firstChild);
  }
  Live.banner = () => { try { syncStudentWatch(); } catch (e) { console.warn('live watch', e); } banner(); };
  function focusUi() { document.body.classList.toggle('focus-mode', !!(S.active && S.active.focus && isStudentSession())); }

  /* ====================== teacher side ====================== */
  const T = { section: null, ses: null, unsub: null, pres: {}, presUnsub: {}, adding: {}, tick: null, sound: sessionStorage.getItem('learnhub.liveSound') === '1', flash: {} };
  const staffId = () => { const m = me(); return m && m.staffId; };
  function mySectionsT() { const m = me(); return window.Sections.visible(m.staffId, false).filter(s => s.courseId); }
  function sessionIdFor(sec) { return sec.id; }
  function stopTeacher() { if (T.unsub) { T.unsub(); T.unsub = null; } Object.keys(T.presUnsub).forEach(k => { T.presUnsub[k](); delete T.presUnsub[k]; }); clearInterval(T.tick); T.tick = null; T.pres = {}; T.ses = null; }
  function watchSection(sec) {
    stopTeacher(); T.section = sec; if (!sec) return;
    T.unsub = db().collection('live').doc(sessionIdFor(sec)).onSnapshot(d => { T.ses = d.exists ? Object.assign({ id: d.id }, d.data()) : null; Object.keys(T.adding).forEach(k => { if (!T.ses || (T.ses.writing || []).includes(k) || T.adding[k] !== T.ses.startedAt) delete T.adding[k]; }); syncPresence(); draw(); }, err => { console.warn('live', err && err.code); T.err = err && err.message; draw(); });
    T.tick = setInterval(() => { if (T.ses && !T.ses.endedAt) draw(); }, BOARD_TICK);
  }
  function roster(sec) { return (sec.students || []).map(id => window.Students.byId(id)).filter(Boolean).sort((a, b) => String(a.name).localeCompare(String(b.name))); }
  function syncPresence() {
    const sec = T.section; const want = new Set(sec ? (sec.students || []) : []);
    Object.keys(T.presUnsub).forEach(k => { if (!want.has(k)) { T.presUnsub[k](); delete T.presUnsub[k]; delete T.pres[k]; } });
    want.forEach(id => { if (T.presUnsub[id]) return; if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) return;
      T.presUnsub[id] = db().collection('presence').doc(id).onSnapshot(d => { const before = status(id); T.pres[id] = d.exists ? d.data() : null; onPresence(id, before); draw(); }, err => console.warn('presence', id, err && err.code)); });
  }
  /** Where a student stands right now: off · away · unfocused · elsewhere · writing · done. */
  function status(id) {
    const ses = T.ses, p = T.pres[id];
    if (!ses || ses.endedAt || !p) return 'off';
    if (p.live !== ses.id || p.since !== ses.startedAt) return 'off';
    if (Date.now() - new Date(p.at).getTime() > STALE) return 'off';
    if (p.state === 'hidden') return 'away';
    if (p.state === 'blur') return 'unfocused';
    if (!p.target) return 'elsewhere';
    return p.done ? 'done' : 'writing';
  }
  const STATUS = { off: ['⚪', 'not here', 'Not in this session'], away: ['🔴', 'left the app', 'Summitide is hidden or closed'], unfocused: ['🟠', 'another window', 'Summitide is open but not the window in use'], elsewhere: ['🔵', 'in the app', 'Signed in, on another page'], writing: ['🟢', 'writing', 'On the item now'], done: ['✅', 'handed in', 'Finished the item'] };
  /** Presence changed: a late arrival goes on the writing list; a selected student leaving makes a sound (if on). */
  function onPresence(id, before) {
    const ses = T.ses; if (!ses || ses.endedAt) return;
    const st = status(id), p = T.pres[id];
    const writing = new Set(ses.writing || []);
    if ((st === 'writing' || st === 'done') && !writing.has(id) && !(ses.late || {})[id] && !(ses.removed || {})[id] && T.adding[id] !== ses.startedAt) {
      // joined on their own: on the list, marked late when the session had been running a while
      // (T.adding stops a second write while the first is still on its way back from the cloud)
      const late = Date.now() - new Date(ses.startedAt).getTime() > 90000;
      const patch = { writing: [...writing, id], updatedAt: now() }; if (late) patch['late.' + id] = p && p.joinedAt || now();
      T.flash[id] = Date.now(); T.adding[id] = ses.startedAt;
      db().collection('live').doc(ses.id).update(patch).catch(e => { delete T.adding[id]; console.warn('live update', e && e.code); });
    }
    if (writing.has(id) && before === 'writing' && (st === 'away' || st === 'unfocused' || st === 'off')) { T.flash[id] = Date.now(); if (T.sound) beep(); }
  }
  function beep() { try { const ac = beep.ac || (beep.ac = new (window.AudioContext || window.webkitAudioContext)()); const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = 660; g.gain.value = 0.08; o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + 0.18); } catch (e) {} }

  async function startSession(sec, target, focus) {
    const m = me(); const c = window.LH.findCourse(sec.courseId);
    const doc = { sectionId: sec.id, sectionName: String(sec.name).slice(0, 60), teacherId: uid(), teacherName: String(m.name || '').slice(0, 60), courseId: sec.courseId, courseTitle: c ? String(c.title).slice(0, 80) : '',
      target: { kind: target.kind, unitId: target.unitId || null, lessonIdx: target.lessonIdx === undefined ? null : target.lessonIdx, n: target.n === undefined ? null : target.n, label: target.label, href: target.href },
      focus: !!focus, writing: [], late: {}, removed: {}, startedAt: now(), endedAt: null, updatedAt: now(), v: 1 };
    await db().collection('live').doc(sessionIdFor(sec)).set(doc);
    if (window.Cloud.log) Cloud.log('live.start', sec.id, target.label + (focus ? ' · focus' : ''));
  }
  async function endSession() { if (!T.ses) return; await db().collection('live').doc(T.ses.id).update({ endedAt: now(), updatedAt: now() }); if (window.Cloud.log) Cloud.log('live.end', T.ses.id, ''); }
  async function setWriting(id, on) {
    const ses = T.ses; if (!ses) return; const w = new Set(ses.writing || []); if (on) w.add(id); else w.delete(id);
    const patch = { writing: [...w], updatedAt: now() };
    if (!on) patch['removed.' + id] = now(); else patch['removed.' + id] = fbDelete();
    await db().collection('live').doc(ses.id).update(patch);
  }
  const fbDelete = () => window.firebase.firestore.FieldValue.delete();

  /* --- drawing --- */
  function page() {
    const m = me(); if (!m || !m.isStaff) { location.hash = '#/'; return; }
    document.body.dataset.page = 'live';
    const a = app();
    if (!cloudOn()) { a.innerHTML = head() + '<div class="empty"><h2>The Live Class Board needs the cloud</h2><p class="muted">Presence travels through the cloud, so this screen works only when Summitide is signed in to it.</p></div>'; return; }
    const secs = mySectionsT();
    const wanted = (location.hash.split('?')[1] || '').match(/sec=([^&]+)/);
    let sec = (wanted && secs.find(s => s.id === decodeURIComponent(wanted[1]))) || (T.section && secs.find(s => s.id === T.section.id)) || window.Sections.currentFor(m.staffId) || secs[0] || null;
    if (sec && !secs.includes(sec)) sec = secs[0] || null;
    if (!T.section || !sec || T.section.id !== sec.id || !T.unsub) watchSection(sec); else { T.section = sec; syncPresence(); }
    draw();
  }
  Live.page = page;
  function head() { const dn = window.Students.current && window.Students.current.role === 'master' ? "The Headmaster's Desk" : "Teacher's Desk"; return '<div class="crumbs"><a href="#/">' + dn + '</a> › Live Class Board</div>'; }
  function draw() {
    const a = app(); if (!a || document.body.dataset.page !== 'live') return;
    const act = document.activeElement; if (act && a.contains(act) && /^(SELECT|INPUT)$/.test(act.tagName) && !T.ses) return;   // do not redraw under the set-up form while it is being used
    const secs = mySectionsT(), sec = T.section;
    const picker = secs.length ? '<label class="field live-pick">Section<select class="text-input" id="liveSec">' + secs.map(s => '<option value="' + esc(s.id) + '"' + (sec && s.id === sec.id ? ' selected' : '') + '>' + esc(s.name) + (s.courseId ? ' · ' + esc((window.LH.findCourse(s.courseId) || {}).title || s.courseId) : '') + '</option>').join('') + '</select></label>' : '';
    let body;
    if (!sec) body = '<div class="empty"><h2>No section yet</h2><p class="muted">Create a section with a course and a roster on the <a href="#/sections">Sections page</a>, then come back.</p></div>';
    else if (!T.ses || T.ses.endedAt) body = setupHtml(sec) + (T.ses && T.ses.endedAt ? summaryHtml(sec) : '');
    else body = boardHtml(sec);
    a.innerHTML = head() + '<div class="page-head"><div><h1>📡 Live Class Board</h1><p class="muted">See who is in Summitide and on the item right now · mark who is writing today · Focus Mode for quizzes and tests. The app sees only itself: never other tabs, apps or the screen.</p></div></div>' +
      '<div class="live-top">' + picker + (T.ses && !T.ses.endedAt ? '<span class="live-running"><span class="live-dot"></span> Running since ' + esc(fmtTime(T.ses.startedAt)) + '</span>' : '') + '</div>' + body;
    bind(sec);
  }
  function setupHtml(sec) {
    const c = window.LH.findCourse(sec.courseId); if (!c) return '<div class="empty">This section\'s course is not loaded.</div>';
    const ts = targetsFor(c); const n = (sec.students || []).length;
    return '<div class="card live-setup"><h2>▶ Start a live session for ' + esc(sec.name) + '</h2><p class="muted small">' + n + ' student' + (n === 1 ? '' : 's') + ' on the roster · ' + esc(c.title) + '</p>' +
      '<div class="grid-2"><label class="field">What are they writing?<select class="text-input" id="liveTarget">' + ts.map((t, i) => '<option value="' + i + '"' + (t.kind === 'test' && i === 1 ? '' : '') + '>' + esc(t.label) + '</option>').join('') + '</select></label>' +
      '<label class="field live-focus-opt"><span>Focus Mode</span><span class="live-check"><input type="checkbox" id="liveFocus" checked> <span>Quizzes and tests open full screen; every time a student leaves the app it is timed, shown to them, and kept on the attempt.</span></span></label></div>' +
      '<div class="btn-row" style="margin-top:0.8rem"><button class="btn lg" id="liveStart">📡 Start the session</button><span class="muted small">Students see a "Live now" banner with a link to the item. Presence is sent only while a session runs.</span></div></div>';
  }
  function summaryHtml(sec) {
    const ses = T.ses; const rs = roster(sec);
    const rows = rs.map(s => { const p = T.pres[s.id]; const was = !!(p && p.since === ses.startedAt);
      return '<tr><td>' + esc(s.avatar || '') + ' ' + esc(s.name) + '</td><td>' + ((ses.writing || []).includes(s.id) ? '✍ writing' + ((ses.late || {})[s.id] ? ' · joined late ' + esc(fmtTime(ses.late[s.id])) : '') : '<span class="muted">not writing</span>') + '</td><td>' + (was ? (p.done ? '✅ handed in' : esc(p.label || '')) : '<span class="muted">—</span>') + '</td><td>' + (was && p.leaveCount ? '🔴 ' + p.leaveCount + '× · ' + esc(fmtSecs(p.awaySecs)) : (was ? '—' : '')) + '</td></tr>'; }).join('');
    return '<div class="card live-summary"><h2>Last session · ' + esc(ses.target && ses.target.label || '') + '</h2><p class="muted small">' + esc(fmtTime(ses.startedAt)) + ' – ' + esc(fmtTime(ses.endedAt)) + (ses.focus ? ' · Focus Mode' : '') + ' · leaves are also on each attempt on the marking screen.</p>' +
      '<div class="table-wrap"><table class="live-table"><thead><tr><th>Student</th><th>Writing</th><th>Last seen on</th><th>Left the app</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
  }
  function boardHtml(sec) {
    const ses = T.ses, rs = roster(sec); const writing = new Set(ses.writing || []);
    const st = {}; rs.forEach(s => { st[s.id] = status(s.id); });
    const liveNow = rs.filter(s => writing.has(s.id) && st[s.id] === 'writing');
    const done = rs.filter(s => writing.has(s.id) && st[s.id] === 'done');
    const notWriting = rs.filter(s => !(writing.has(s.id) && (st[s.id] === 'writing' || st[s.id] === 'done')));
    const reason = s => !writing.has(s.id) ? (st[s.id] === 'off' ? 'not writing today' : 'not on the list · ' + STATUS[st[s.id]][1]) : STATUS[st[s.id]][1] + (st[s.id] === 'elsewhere' && T.pres[s.id] ? ' · ' + T.pres[s.id].label : '');
    const tiles = rs.map(s => {
      const p = T.pres[s.id], k = st[s.id], on = writing.has(s.id); const late = (ses.late || {})[s.id]; const flash = T.flash[s.id] && Date.now() - T.flash[s.id] < 15000;
      const where = k === 'off' ? (p && p.live === ses.id ? 'last seen ' + ago(p.at) : 'not signed in to this session') : k === 'writing' && p.n ? 'Question ' + (p.q || 0) + ' of ' + p.n : k === 'done' ? 'handed in ' + ago(p.at) : (p && p.label) || '';
      return '<button type="button" class="live-tile st-' + k + (on ? ' writing' : ' idle') + (flash ? ' flash' : '') + '" data-tile="' + esc(s.id) + '" aria-pressed="' + (on ? 'true' : 'false') + '" title="' + (on ? 'Click: not writing today' : 'Click: writing today') + '">' +
        '<span class="live-ava" style="--c:' + esc(s.colour || '#888') + '">' + esc(s.avatar || '🙂') + '</span><span class="live-name">' + esc(s.name) + '</span>' +
        '<span class="live-state">' + STATUS[k][0] + ' ' + esc(STATUS[k][1]) + '</span><span class="live-where muted small">' + esc(where) + '</span>' +
        (p && p.live === ses.id && p.leaveCount ? '<span class="live-leaves">left ' + p.leaveCount + '× · ' + esc(fmtSecs(p.awaySecs)) + '</span>' : '') +
        '<span class="live-mark">' + (on ? '✍ writing today' + (late ? ' · late ' + esc(fmtTime(late)) : '') : 'not writing') + '</span></button>';
    }).join('');
    return '<div class="live-bar card"><div><strong>' + esc(ses.target && ses.target.label || '') + '</strong>' + (ses.focus ? ' <span class="tag accent">🎯 Focus Mode</span>' : '') + '<div class="muted small">' + writing.size + ' of ' + rs.length + ' marked as writing · ' + liveNow.length + ' on it now · ' + done.length + ' handed in · click a tile to change who is writing today</div></div>' +
      '<div class="btn-row"><button class="btn ghost sm" id="liveAll">Everyone is writing</button><button class="btn ghost sm" id="liveHere">Only those here</button><button class="btn ghost sm" id="liveNone">Clear</button><label class="live-check small"><input type="checkbox" id="liveSound"' + (T.sound ? ' checked' : '') + '> 🔔 sound when someone leaves</label><button class="btn danger sm" id="liveEnd">⏹ End the session</button></div></div>' +
      '<div class="live-layout"><div class="live-grid">' + (tiles || '<div class="empty">No students on this roster.</div>') + '</div>' +
      '<aside class="live-side"><div class="card"><h3>✍ Writing now <span class="tag">' + liveNow.length + '</span></h3>' + (liveNow.length ? '<ul class="live-list">' + liveNow.map(s => '<li>🟢 ' + esc(s.name) + (T.pres[s.id] && T.pres[s.id].n ? ' <span class="muted small">Q' + (T.pres[s.id].q || 0) + '/' + T.pres[s.id].n + '</span>' : '') + '</li>').join('') + '</ul>' : '<p class="muted small">Nobody is on the item yet.</p>') +
      (done.length ? '<h3>✅ Handed in <span class="tag">' + done.length + '</span></h3><ul class="live-list">' + done.map(s => '<li>' + esc(s.name) + '</li>').join('') + '</ul>' : '') +
      '<details class="live-not" open><summary>Not writing <span class="tag">' + notWriting.length + '</span></summary>' + (notWriting.length ? '<ul class="live-list">' + notWriting.map(s => '<li>' + STATUS[st[s.id]][0] + ' ' + esc(s.name) + ' <span class="muted small">' + esc(reason(s)) + '</span></li>').join('') + '</ul>' : '<p class="muted small">Everyone on the list is writing.</p>') + '</details></div>' +
      '<p class="muted small live-key">🟢 on the item · ✅ handed in · 🔵 in the app, elsewhere · 🟠 another window in use · 🔴 app hidden or closed · ⚪ not here. A student who arrives late and opens the item appears here on their own.</p></aside></div>';
  }
  function bind(sec) {
    const a = app(); const q = s => a.querySelector(s);
    const sel = q('#liveSec'); if (sel) sel.addEventListener('change', () => { const s = mySectionsT().find(x => x.id === sel.value); if (s) { window.Sections.setCurrent(staffId(), s.id); watchSection(s); draw(); } });
    const start = q('#liveStart'); if (start) start.addEventListener('click', async () => { const c = window.LH.findCourse(sec.courseId); const t = targetsFor(c)[+q('#liveTarget').value] || targetsFor(c)[0]; start.disabled = true; try { await startSession(sec, t, q('#liveFocus').checked); } catch (e) { alert('Could not start: ' + (e.message || e)); start.disabled = false; } });
    const end = q('#liveEnd'); if (end) end.addEventListener('click', async () => { if (!confirm('End the live session? Students stop sending presence; this summary stays until the next session.')) return; try { await endSession(); } catch (e) { alert('Could not end: ' + (e.message || e)); } });
    a.querySelectorAll('[data-tile]').forEach(b => b.addEventListener('click', () => { const id = b.dataset.tile; setWriting(id, b.getAttribute('aria-pressed') !== 'true').catch(e => alert('Could not save: ' + (e.message || e))); }));
    const all = q('#liveAll'); if (all) all.addEventListener('click', () => patchWriting(roster(sec).map(s => s.id)));
    const here = q('#liveHere'); if (here) here.addEventListener('click', () => patchWriting(roster(sec).filter(s => status(s.id) !== 'off').map(s => s.id)));
    const none = q('#liveNone'); if (none) none.addEventListener('click', () => patchWriting([]));
    const snd = q('#liveSound'); if (snd) snd.addEventListener('change', () => { T.sound = snd.checked; sessionStorage.setItem('learnhub.liveSound', snd.checked ? '1' : '0'); if (snd.checked) beep(); });
  }
  async function patchWriting(ids) { const ses = T.ses; if (!ses) return; const patch = { writing: ids, updatedAt: now() }; Object.keys(ses.removed || {}).forEach(id => { if (ids.includes(id)) patch['removed.' + id] = fbDelete(); }); roster(T.section).forEach(s => { if (!ids.includes(s.id) && (ses.writing || []).includes(s.id)) patch['removed.' + s.id] = now(); }); await db().collection('live').doc(ses.id).update(patch); }

  /** The desk tile text for teachers. */
  Live.deskDetail = () => { const sec = T.section; const ses = T.ses; return ses && !ses.endedAt ? 'running · ' + (ses.sectionName || (sec && sec.name) || '') : 'who is writing · Focus Mode'; };

  /* ====================== wiring ====================== */
  function onRoute() {
    if (document.body.dataset.page !== 'live') stopTeacher();
    if (isStudentSession()) { send('page'); banner(); }
  }
  window.addEventListener('hashchange', () => setTimeout(onRoute, 0));
  window.addEventListener('cloud:change', () => { syncStudentWatch(); if (document.body.dataset.page === 'live') { syncPresence(); draw(); } });
  window.addEventListener('cloud:auth', () => { syncStudentWatch(); if (!cloudOn()) stopTeacher(); });
  document.addEventListener('visibilitychange', onVis); window.addEventListener('blur', onVis); window.addEventListener('focus', onVis);
  window.addEventListener('pagehide', () => { if (S.active) { try { const doc = presenceDoc('hide'); doc.state = 'hidden'; db().collection('presence').doc(uid()).set(doc); } catch (e) {} } });
  Live.student = { refresh: syncStudentWatch, get active() { return S.active; } };
  Live.status = status;   // for tests
  setTimeout(syncStudentWatch, 0);
})();
