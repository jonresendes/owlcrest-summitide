/* Records (v66): the tools a school needs to answer for the information it holds about one student.

   1. SIGN-IN CODES — the account line on a student's panel, "New sign-in code", moving a whole class from
      birthdays to codes, and the printed slips. (The codes themselves are made in cloud.js.)
   2. A COPY OF EVERYTHING HELD about one student, as a Word file a person can read and a JSON file that is complete
      (MFIPPA s. 36 (1): access to one's own personal information).
   3. CORRECTIONS — a student may ask for something to be corrected; staff record what was corrected, what was not, and
      a statement of disagreement, which stays attached to the record (s. 36 (2)).
   4. HOLDS — the Headmaster can put one student's records on hold (an access request, an incident). While a hold
      exists nothing of theirs is deleted: not by a teacher, not by the clean-up, not by removing the student.
      The security rules refuse the deletion too, so it does not depend on this file.

   Where things live
     signin/<uid>        the current code (staff only)                      — written in cloud.js
     holds/<uid>         { student, reason, at, by, byName }                — Headmaster writes, the student's teachers read
     correctionRequests/<uid>  { student, items: [{ id, about, text, byName, at }] }   what the student asked (the student writes it)
     corrections/<uid>   { student, items: [{ id, re, kind, about, text, status, reply, by, byName, byRole, at, repliedAt, repliedBy }] }
                         what the school recorded (staff write it; it only grows; the student reads it)
                         kind: request (a student's request, with the answer) | corrected | not-corrected | disagreement
     Device-only mode keeps holds and corrections in this browser ('learnhub.holds', 'learnhub.corrections').

   Every stored value is escaped where it is drawn. Nothing here runs code from data. */
(function () {
  const esc = s => String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const now = () => new Date().toISOString();
  const when = iso => { const d = new Date(iso); return !iso || isNaN(d) ? '' : d.toLocaleString([], { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }); };
  const lsGet = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const cloudOn = () => !!(window.Cloud && Cloud.enabled && Cloud.db && Cloud.user);
  const me = () => window.Students && Students.current;
  const isStaff = () => { const m = me(); return !!(m && m.isStaff); };
  const isHead = () => { if (window.Cloud && Cloud.enabled) return !!(Cloud.user && Cloud.role === 'master'); const m = me(); return !!(m && m.isStaff && m.role === 'master'); };
  const plain = (s, n) => String(s === undefined || s === null ? '' : s).replace(/[<>]/g, '').trim().slice(0, n);
  const rulesMsg = e => /permission|insufficient/i.test((e && (e.code || '')) + ' ' + (e && e.message)) ? 'The cloud refused this. Publish the version 66 firestore.rules (Firebase console → Firestore Database → Rules → Publish), then try again.' : ((e && e.message) || 'That did not work.');
  const log = (action, target, detail) => { try { if (window.Cloud && Cloud.log) Cloud.log(action, target, detail || {}); } catch (e) {} };
  const Records = {};
  window.Records = Records;

  /* ====================== holds ====================== */
  Records.hold = async function (id) {
    if (cloudOn()) { try { const d = await Cloud.db.collection('holds').doc(id).get(); return d.exists ? d.data() : null; } catch (e) { return null; } }
    const all = lsGet('learnhub.holds') || {}; return all[id] || null;
  };
  /** Why nothing of this student's may be deleted right now ('' when it may). */
  Records.heldReason = async function (id) {
    if (window.Privacy && Privacy.policy && Privacy.policy.holdAll) return 'Every record in the school is on hold (Settings → Privacy and retention). Nothing can be deleted until the Headmaster lifts it.';
    if (!id || /^demo__/.test(id)) return '';
    const h = await Records.hold(id);
    return h ? 'This student\'s records are on hold' + (h.reason ? ' (' + plain(h.reason, 120) + ')' : '') + '. Nothing of theirs can be deleted until the Headmaster lifts the hold.' : '';
  };
  Records.setHold = async function (id, on, reason) {
    if (!isHead()) throw new Error('Only the Headmaster can place or lift a hold.');
    const m = me(); const rec = { student: id, reason: plain(reason, 200), at: now(), by: (cloudOn() && Cloud.user.uid) || 'master', byName: plain(m && m.name, 40) };
    if (cloudOn()) { try { if (on) await Cloud.db.collection('holds').doc(id).set(rec); else await Cloud.db.collection('holds').doc(id).delete(); } catch (e) { throw new Error(rulesMsg(e)); } }
    else { const all = lsGet('learnhub.holds') || {}; if (on) all[id] = rec; else delete all[id]; lsSet('learnhub.holds', all); }
    log(on ? 'hold.place' : 'hold.lift', id, { reason: rec.reason });
    return on ? rec : null;
  };

  /* ====================== corrections ====================== */
  const KINDS = { request: 'Correction asked for by the student', corrected: 'Corrected', 'not-corrected': 'Correction asked for and not made', disagreement: 'Statement of disagreement' };
  const STATUS = { open: 'Waiting for an answer', corrected: 'Corrected', refused: 'Not corrected', noted: 'On the record' };
  Records.KINDS = KINDS;
  /** Everything on the corrections record of one student, oldest first: what the school recorded, and requests still waiting. */
  Records.corrections = async function (id) {
    let list;
    if (cloudOn()) {
      try {
        const db = Cloud.db, [done, asked] = await Promise.all([db.collection('corrections').doc(id).get(), db.collection('correctionRequests').doc(id).get()]);
        const recorded = done.exists && Array.isArray(done.data().items) ? done.data().items : [];
        const answered = new Set(recorded.filter(c => c && c.re).map(c => c.re));
        const waiting = (asked.exists && Array.isArray(asked.data().items) ? asked.data().items : []).filter(c => c && c.id && !answered.has(c.id)).map(c => ({ id: plain(c.id, 40), student: id, kind: 'request', about: plain(c.about, 160), text: plain(c.text, 1500), status: 'open', reply: '', by: id, byName: plain(c.byName, 40), byRole: 'student', at: plain(c.at, 40) }));
        list = recorded.filter(c => c && typeof c === 'object').concat(waiting);
      } catch (e) { throw new Error(rulesMsg(e)); }
    } else list = (lsGet('learnhub.corrections') || []).filter(c => c.student === id);
    return list.sort((a, b) => String(a.at).localeCompare(String(b.at)));
  };
  const newId = () => 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const FVu = v => window.firebase.firestore.FieldValue.arrayUnion(v);
  Records.addCorrection = async function (id, kind, about, text) {
    const m = me(); if (!m) throw new Error('Sign in first.');
    const mine = !m.isStaff;
    if (mine) { if (m.id !== id) throw new Error('You can only ask about your own record.'); kind = 'request'; } else if (!KINDS[kind] || kind === 'request') kind = 'corrected';
    text = plain(text, 1500); about = plain(about, 160);
    if (text.length < 3) throw new Error('Write what should be corrected.');
    const rec = { id: newId(), student: id, kind, about, text, status: kind === 'request' ? 'open' : kind === 'corrected' ? 'corrected' : kind === 'not-corrected' ? 'refused' : 'noted', reply: '', by: cloudOn() ? Cloud.user.uid : m.id, byName: plain(m.name, 40), byRole: mine ? 'student' : (m.role || 'teacher'), at: now() };
    if (cloudOn()) {
      try {
        if (mine) {   // the student's own list of requests (their record to write; at most 30)
          const ref = Cloud.db.collection('correctionRequests').doc(id), d = await ref.get();
          const items = (d.exists && Array.isArray(d.data().items) ? d.data().items : []).slice(-29); items.push({ id: rec.id, about, text, byName: rec.byName, at: rec.at });
          await ref.set({ student: id, items, updatedAt: now() });
        } else await Cloud.db.collection('corrections').doc(id).set({ student: id, items: FVu(rec), updatedAt: now() }, { merge: true });
      } catch (e) { throw new Error(rulesMsg(e)); }
    } else { const all = lsGet('learnhub.corrections') || []; all.push(rec); lsSet('learnhub.corrections', all); }
    if (!mine) log('correction.' + kind, id, { about });
    return rec;
  };
  /** Staff answer a student's request: corrected, or not corrected (the reply then stands as the reason). The request is
      copied into the school's record with the answer, where the student can read it and nobody can change it. */
  Records.answerCorrection = async function (rec, status, reply) {
    if (!isStaff()) throw new Error('Only a teacher can answer a request.');
    if (status !== 'corrected' && status !== 'refused') throw new Error('Choose an answer.');
    const done = Object.assign({}, rec, { re: rec.id, id: newId(), status, reply: plain(reply, 1000), repliedAt: now(), repliedBy: plain(me().name, 40) });
    if (cloudOn()) { try { await Cloud.db.collection('corrections').doc(rec.student).set({ student: rec.student, items: FVu(done), updatedAt: now() }, { merge: true }); } catch (e) { throw new Error(rulesMsg(e)); } }
    else { const all = lsGet('learnhub.corrections') || []; const r = all.find(c => c.id === rec.id); if (r) Object.assign(r, { status, reply: done.reply, repliedAt: done.repliedAt, repliedBy: done.repliedBy }); lsSet('learnhub.corrections', all); }
    log('correction.answer', rec.student, { status });
    return done;
  };
  const corrHtml = (c, staff) => '<div class="rec-corr rec-' + esc(c.status) + '"><div class="rec-corr-head"><strong>' + esc(KINDS[c.kind] || c.kind) + '</strong> <span class="tag">' + esc(STATUS[c.status] || c.status) + '</span> <span class="muted small">' + esc(when(c.at)) + ' · ' + esc(c.byName || '') + (c.byRole === 'student' ? ' (student)' : '') + '</span></div>' +
    (c.about ? '<div class="small"><strong>About:</strong> ' + esc(c.about) + '</div>' : '') + '<div class="rec-corr-text">' + esc(c.text) + '</div>' +
    (c.reply || c.repliedAt ? '<div class="rec-corr-reply small"><strong>Answer' + (c.repliedBy ? ' from ' + esc(c.repliedBy) : '') + (c.repliedAt ? ', ' + esc(when(c.repliedAt)) : '') + ':</strong> ' + esc(c.reply || '(no note)') + '</div>' : '') +
    (staff && c.kind === 'request' && c.status === 'open' ? '<div class="rec-answer"><textarea class="text-input" rows="2" maxlength="1000" placeholder="What was changed, or why it was not" data-rec-reply="' + esc(c.id) + '"></textarea><div class="btn-row"><button class="btn sm success" type="button" data-rec-answer="corrected" data-id="' + esc(c.id) + '">Corrected</button><button class="btn sm ghost" type="button" data-rec-answer="refused" data-id="' + esc(c.id) + '">Not corrected</button></div></div>' : '') + '</div>';

  /* ====================== everything held about one student ====================== */
  const courseTitle = id => { const c = ((window.LearnHub && LearnHub.courses) || []).find(x => x.id === id); return c ? c.title : id; };
  const taskTitle = id => { let t = ''; ((window.Sections && Sections.list) || []).forEach(sec => (((sec.marks || {}).tasks) || []).forEach(k => { if (k.id === id) t = k.title + ' (' + sec.name + ')'; })); return t || 'Item ' + id; };
  const unitTitle = (cid, uid) => { const c = ((window.LearnHub && LearnHub.courses) || []).find(x => x.id === cid); const u = c && (c.units || []).find(x => x.id === uid); return u ? u.title : uid; };
  const short = (v, n) => { const s = typeof v === 'string' ? v : JSON.stringify(v === undefined ? null : v); return s.length > n ? s.slice(0, n) + ' …' : s; };
  /** Read every record the app holds about this student. Parts the caller may not read are listed in `missing`. */
  Records.gather = async function (id) {
    const s = window.Students.byId(id); if (!s) throw new Error('Student not found.');
    const out = { madeAt: now(), madeBy: plain(me() && me().name, 40), app: 'Summitide Learning · OwlCrest Academy', version: (window.PWA && PWA.APP_VERSION) || '', student: id, missing: [],
      profile: JSON.parse(JSON.stringify(s)), sections: [], work: lsGet('learnhub.progress.' + id) || {}, grades: lsGet('learnhub.grades.' + id) || {}, focusPlan: lsGet('learnhub.focus.' + id) || null,
      coinsLedger: null, liveClassPresence: null, liveClassSessions: [], problemReports: [], corrections: [], hold: null, signIn: null, changeLog: [] };
    out.sections = ((window.Sections && Sections.list) || []).filter(x => (x.students || []).includes(id)).map(x => ({ id: x.id, name: x.name, course: x.courseId, term: x.term || '', archived: !!x.archived, teacher: (() => { const t = window.Staff && (Staff.teachers.find(k => k.id === x.teacherId) || (Staff.master && (Staff.master.uid === x.teacherId || !x.teacherId) ? Staff.master : null)); return t ? t.name : ''; })() }));
    try { out.corrections = await Records.corrections(id); } catch (e) { out.missing.push('Correction notes: ' + e.message); }
    out.hold = await Records.hold(id);
    if (cloudOn()) {
      const db = Cloud.db; const get = async (col, doc) => { const d = await db.collection(col).doc(doc).get(); return d.exists ? d.data() : null; };
      // the cloud copies, so nothing depends on what this device happens to hold
      try { const q = await db.collection('progress').where('student', '==', id).get(); q.docs.forEach(d => { const p = d.data(); if (p.course) out.work[p.course] = p.data || {}; }); } catch (e) { out.missing.push('Work: read from this device\'s copy (' + (e.code || e.message) + ')'); }
      try { const q = await db.collection('grades').where('student', '==', id).get(); q.docs.forEach(d => { const p = d.data(); if (p.course) out.grades[p.course] = p.data || {}; }); } catch (e) { out.missing.push('Grades: read from this device\'s copy (' + (e.code || e.message) + ')'); }
      try { const p = await get('students', id); if (p) out.profile = p; } catch (e) {}
      try { const f = await get('focus', id); if (f) out.focusPlan = f.data || f; } catch (e) {}
      try { out.coinsLedger = await get('coins', id); } catch (e) { out.missing.push('Coin ledger'); }
      try { out.liveClassPresence = await get('presence', id); } catch (e) { out.missing.push('Live Class presence'); }
      for (const sec of out.sections) { try { const l = await get('live', sec.id); if (l) out.liveClassSessions.push({ section: sec.name, item: (l.target && l.target.label) || '', startedAt: l.startedAt || '', endedAt: l.endedAt || '', focusMode: !!l.focus, markedAsWriting: (l.writing || []).includes(id), joinedLate: (l.late || {})[id] || '' }); } catch (e) {} }
      try { const d = await get('signin', id); out.signIn = d ? { kind: 'sign-in code', issuedAt: d.issuedAt || '', issuedBy: d.issuedBy || '', note: 'The code itself is not printed here. A copy is held so that a teacher can replace it.' } : (out.profile.dob ? { kind: 'birthday (to be replaced by a code)' } : null); } catch (e) { out.missing.push('Sign-in record'); }
      if (isHead()) {
        try { const q = await db.collection('issues').where('by', '==', id).get(); out.problemReports = q.docs.map(d => { const i = d.data(); return { at: i.at, page: i.page || '', title: i.title || '', text: i.text || '', status: i.status || '', hasScreenshot: !!i.shot, screen: i.screen || '', browser: i.agent || '' }; }); } catch (e) { out.missing.push('Problem reports'); }
        try { const q = await db.collection('audit').where('target', '==', id).get(); out.changeLog = q.docs.map(d => d.data()).sort((a, b) => String(a.at).localeCompare(String(b.at))); } catch (e) { out.missing.push('Change-log lines'); }
      } else out.missing.push('Problem reports this student sent and change-log lines about them: only the Headmaster can read those. Ask the Headmaster to make this copy if they are needed.');
    } else {
      out.coinsLedger = lsGet('learnhub.coins.' + id);
      out.problemReports = (lsGet('learnhub.issues') || []).filter(i => i.by === id).map(i => ({ at: i.at, page: i.page || '', title: i.title || '', text: i.text || '', status: i.status || '', hasScreenshot: !!i.shot }));
    }
    out.notHeldHere = ['Voice recordings and uploaded files: they stay in the browser of the device they were made on and were never sent to the cloud.', 'Files already exported, printed or saved to Google Drive.', 'The password behind the sign-in is held by Firebase Authentication, not readable by anyone.'];
    return out;
  };
  /** The same information as tables a person can read. */
  Records.readable = function (g) {
    const T = window.Tables, p = g.profile || {}, secs = [];
    const add = (heading, head, rows) => { if (rows.length) secs.push({ heading, model: T.modelOf(head, rows) }); };
    const known = ['id', 'name', 'number', 'dob', 'level', 'courses', 'courseLevels', 'accommodations', 'track', 'createdAt', 'updatedAt', 'updatedBy', 'rev', 'avatar', 'colour', 'levelLog', 'teachers', 'prefs', 'notes', 'coins', 'coinReq', 'suggestions', 'lessonLevels', 'archived', 'coursesLocked', 'demo'];
    const prof = [['First name', p.name], ['Student number', p.number], p.dob ? ['Birthday (held only until a sign-in code is issued)', p.dob] : null, ['Default level', p.level], ['Courses', Array.isArray(p.courses) ? p.courses.map(courseTitle).join(', ') : 'all'], ['Level in each course', short(p.courseLevels || {}, 300)],
      ['Accommodations', Object.keys(p.accommodations || {}).filter(k => p.accommodations[k]).join(', ') || 'none'], ['Modified program / track', short(p.track || {}, 300)], ['Picture and colour', (p.avatar || '') + ' ' + (p.colour || '')], ['Display and accessibility choices', short(p.prefs || {}, 400)],
      ['Lesson levels', short(p.lessonLevels || {}, 300)], ['Suggested level changes', short(p.suggestions || {}, 300)], ['Archived courses', short(p.archived || [], 200)], ['Coins counted from their work', short(p.coins || {}, 300)], ['Shop requests', short(p.coinReq || [], 400)],
      ['Created', when(p.createdAt)], ['Last changed', when(p.updatedAt) + (p.updatedBy ? ' by ' + p.updatedBy : '')], ['Teachers with access (account ids)', (p.teachers || []).join(', ')]].filter(Boolean)
      .concat(Object.keys(p).filter(k => !known.includes(k)).map(k => [k, short(p[k], 300)]));
    add('Profile', ['Item', 'What is recorded'], prof.map(r => [r[0], r[1] === undefined || r[1] === null ? '' : String(r[1])]));
    const notes = p.notes && Array.isArray(p.notes.items) ? p.notes.items.filter(n => n && n.text) : [];
    add('The student\'s own sticky notes', ['Note'], notes.map(n => [String(n.text)]));
    add('Sections', ['Section', 'Course', 'Term', 'Teacher', 'Archived'], g.sections.map(x => [x.name, courseTitle(x.course), x.term, x.teacher, x.archived ? 'yes' : 'no']));
    const lv = []; Object.keys(p.levelLog || {}).forEach(c => (p.levelLog[c] || []).forEach(e => lv.push([courseTitle(c), when(e.at), 'Level ' + e.from + ' → Level ' + e.to, e.by || '', e.reason || ''])));
    add('History of level changes', ['Course', 'When', 'Change', 'By', 'Reason'], lv);
    const q = [], w = [], ans = [], aw = [];
    Object.keys(g.work || {}).forEach(c => { const course = g.work[c] || {};
      Object.keys(course).forEach(u => { const unit = course[u]; if (!unit || typeof unit !== 'object') return;
        if (u === 'awards' || Array.isArray(unit)) { (Array.isArray(unit) ? unit : Object.keys(unit)).forEach(a => aw.push([courseTitle(c), typeof a === 'string' ? a : short(a, 120)])); return; }
        const quizRec = (label, rec) => { if (!rec || typeof rec !== 'object') return; const lvls = rec.levels || {};
          const ks = Object.keys(lvls); if (!ks.length) { q.push([courseTitle(c), unitTitle(c, u), label, '', rec.best === undefined ? '' : rec.best + '%', rec.attempts || '', '', '']); return; }
          ks.forEach(L => { const r = lvls[L] || {}; q.push([courseTitle(c), unitTitle(c, u), label, 'Level ' + L, r.best === undefined ? '' : r.best + '%', r.attempts || '', when(r.at), r.last && r.last.away ? (r.last.away.n || r.last.away.count || '') + ' times away' : '']);
            ((r.last && r.last.items) || []).forEach((it, i) => ans.push([courseTitle(c), unitTitle(c, u), label + ' · Level ' + L, String(i + 1), short(it.q || '', 160), short(it.a === undefined ? '' : it.a, 160), it.ok ? 'right' : 'wrong'])); }); };
        Object.keys(unit.quiz || {}).forEach(l => quizRec('Lesson ' + (+l + 1) + ' quiz', unit.quiz[l]));
        if (unit.test) { if (unit.test.levels || unit.test.best !== undefined) quizRec('Unit test', unit.test); else Object.keys(unit.test).forEach(k => quizRec('Unit test', unit.test[k])); }
        if (u === '_tasks') {   // v68: what the student wrote for a CCT or an exam collected in the app
          Object.keys(unit.work || {}).forEach(tid => { const x = (unit.work[tid] || {})[0] || {}; const gr = (((g.grades[c] || {})._marks || {})[tid] || {}).m || {};
            w.push([courseTitle(c), 'CCT / exam', taskTitle(tid), x.done ? 'handed in' : x.text ? 'draft' : 'not started', when(x.at), '', gr.nm ? 'No Mark' : gr.score === undefined || gr.score === null ? '' : gr.score + '/' + (gr.max || 100), gr.note || '', short(x.text || '', 600)]); });
          return; }
        Object.keys(unit.work || {}).forEach(l => Object.keys(unit.work[l] || {}).forEach(n => { const x = unit.work[l][n] || {}; const gr = (((g.grades[c] || {})[u] || {})[l] || {})[n] || {};
          w.push([courseTitle(c), unitTitle(c, u), 'Lesson ' + (+l + 1) + ' · assignment ' + (+n + 1), x.done ? 'handed in' : x.text ? 'draft' : 'not started', when(x.at), x.level ? 'Level ' + x.level : '', gr.nm ? 'No Mark' : gr.score === undefined || gr.score === null ? '' : gr.score + '/' + (gr.max || 10), gr.note || '', short(x.text || '', 600)]); }));
        const read = Object.keys(unit.slides || {}).length; if (read) q.push([courseTitle(c), unitTitle(c, u), 'Lessons with slides read', '', '', read, '', '']);
      }); });
    add('Quizzes and tests', ['Course', 'Unit', 'Item', 'Level', 'Best', 'Attempts', 'Last attempt', 'Focus Mode'], q);
    add('Assignments', ['Course', 'Unit', 'Item', 'Status', 'When', 'Level', 'Teacher score', 'Teacher comment', 'What the student wrote'], w);
    add('Answers on the latest attempts', ['Course', 'Unit', 'Item', 'No.', 'Question', 'Answer given', 'Result'], ans);
    add('Awards', ['Course', 'Award'], aw);
    const hand = [], typed = []; Object.keys(g.grades || {}).forEach(c => Object.keys(g.grades[c] || {}).forEach(u => Object.keys(g.grades[c][u] || {}).forEach(l => Object.keys(g.grades[c][u][l] || {}).forEach(n => { const x = g.grades[c][u][l][n];
      if (x && u === '_marks') { typed.push([courseTitle(c), taskTitle(l), x.nm ? 'No Mark' : x.score === undefined || x.score === null ? '' : x.score + '/' + (x.max || 100), x.note || '', x.by || '', when(x.at)]); return; }
      if (x && (n === 'q' || n === 't')) hand.push([courseTitle(c), unitTitle(c, u), n === 't' ? 'Unit test' : 'Lesson ' + (+l + 1) + ' quiz', x.nm ? 'No Mark' + (x.score === undefined || x.score === null ? '' : ' (' + x.score + '%)') : x.score === undefined || x.score === null ? '' : x.score + '%', x.level ? 'Level ' + x.level : '', x.note || '', x.by || '', when(x.at)]); }))));
    add('Quiz and test scores set by a teacher', ['Course', 'Unit', 'Item', 'Score', 'Level', 'Note', 'By', 'When'], hand);
    add('CCT, exam and other marks typed by a teacher', ['Course', 'Item', 'Mark', 'Comment', 'By', 'When'], typed);
    const fin = []; (g.sections || []).forEach(x => { try { const sec = window.Sections.byId(x.id), course = ((window.LearnHub && LearnHub.courses) || []).find(k => k.id === x.course), st = window.Students.byId(g.student); if (!sec || !course || !st || !window.Marks) return; window.LH.unitsFor(course);
      const r = Marks.summary(sec, course, st); fin.push([x.name, r.final === null ? 'no marks yet' : r.final + '%', r.cats.map(k => k.name + ' ' + k.weight + '%: ' + (k.avg === null ? 'no marks' : Math.round(k.avg) + '%')).join(' · '), Marks.scheme(sec).showFinal ? 'yes' : 'no']); } catch (e) {} });
    add('Final mark in each class (worked out now from the marks above)', ['Class', 'Final mark', 'Categories', 'Shown to the student'], fin);
    if (g.focusPlan) add('Focus Plan', ['Item', 'What is recorded'], Object.keys(g.focusPlan).map(k => [k, short(g.focusPlan[k], 500)]));
    add('Coin ledger', ['When', 'Kind', 'Coins', 'Course or shop', 'Item or note', 'By'], ((g.coinsLedger && g.coinsLedger.entries) || []).map(e => [when(e.at), e.t || e.kind || '', e.n === undefined ? (e.amount === undefined ? '' : e.amount) : e.n, e.course || e.shop || '', e.item || e.name || e.note || '', e.byName || e.by || '']));
    if (g.liveClassPresence) { const pr = g.liveClassPresence; add('Live Class: latest presence record', ['Item', 'What is recorded'], [['Session started', when(pr.since)], ['Last update', when(pr.at)], ['Last page', pr.label || ''], ['Question', pr.n ? pr.q + ' of ' + pr.n : ''], ['Handed in', pr.done ? 'yes' : 'no'], ['Times left the app', pr.leaveCount || 0], ['Seconds away', pr.awaySecs || 0]].concat((pr.leaves || []).map((l, i) => ['Leave ' + (i + 1), when(l.at) + ' · ' + (l.secs || 0) + ' s · ' + (l.page || '')]))); }
    add('Live Class: latest session of each class', ['Section', 'Item', 'Started', 'Ended', 'Focus Mode', 'Marked as writing', 'Joined late'], g.liveClassSessions.map(x => [x.section, x.item, when(x.startedAt), when(x.endedAt), x.focusMode ? 'on' : 'off', x.markedAsWriting ? 'yes' : 'no', x.joinedLate ? when(x.joinedLate) : '']));
    add('Problem reports the student sent', ['When', 'Page', 'Title', 'Message', 'Status', 'Screenshot kept', 'Screen', 'Browser'], g.problemReports.map(i => [when(i.at), i.page, i.title, short(i.text, 500), i.status, i.hasScreenshot ? 'yes' : 'no', i.screen || '', i.browser || '']));
    add('Corrections and statements of disagreement', ['When', 'Kind', 'About', 'Text', 'Status', 'Answer', 'By'], g.corrections.map(c => [when(c.at), KINDS[c.kind] || c.kind, c.about || '', c.text || '', STATUS[c.status] || c.status, c.reply || '', (c.byName || '') + (c.byRole === 'student' ? ' (student)' : '')]));
    add('Change-log lines about this student', ['When', 'Action', 'By', 'Detail'], g.changeLog.map(a => [when(a.at), a.action || '', (a.byName || '') + (a.byRole ? ' (' + a.byRole + ')' : ''), short(a.detail || {}, 300)]));
    const facts = [['Student', (p.name || '') + (p.number ? ' · number ' + p.number : '')], ['Copy made', when(g.madeAt) + (g.madeBy ? ' by ' + g.madeBy : '')], ['Sign-in', g.signIn ? g.signIn.kind + (g.signIn.issuedAt ? ', issued ' + when(g.signIn.issuedAt) : '') : 'no record'],
      ['On hold', g.hold ? 'yes, since ' + when(g.hold.at) + (g.hold.reason ? ' (' + g.hold.reason + ')' : '') : 'no']];
    const left = ['Not held by the app, so not in this copy:'].concat(g.notHeldHere.map(x => '• ' + x)).concat(g.missing.length ? ['', 'Could not be included:'].concat(g.missing.map(x => '• ' + x)) : []).join('\n');
    return { sections: secs, opt: { title: 'Everything Summitide Learning holds about ' + (p.name || 'this student'), sub: 'A copy made for an access request. Handle it as a confidential student record.', facts, notes: left, notesHeading: 'What this copy does not contain', footer: 'Made by Summitide Learning version ' + (g.version || '') + '. The complete, unshortened record is in the JSON file made at the same time.', file: 'record-' + (p.number || p.name || 'student') } };
  };
  Records.exportStudent = async function (id, format) {
    if (!isStaff()) throw new Error('Only staff can make this copy.');
    const g = await Records.gather(id);
    if (format === 'json') {
      const name = 'summitide-record-' + String(g.profile.number || g.profile.name || 'student').replace(/[^\w-]+/g, '-').slice(0, 40) + '-' + g.madeAt.slice(0, 10) + '.json';
      const a = document.createElement('a'), url = URL.createObjectURL(new Blob([JSON.stringify(g, null, 2)], { type: 'application/json' })); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
    } else { const r = Records.readable(g); if (format === 'print') window.Tables.printSheet(r.sections, r.opt); else window.Tables.downloadDocx(r.sections, r.opt); }
    log('export.student', id, { format, parts: Object.keys(g).length, missing: g.missing.length });
    return g;
  };

  /* ====================== sign-in codes: the account line, slips ====================== */
  const site = () => location.origin + location.pathname.replace(/index\.html$/, '');
  /** The Account part of a student's panel (staff). No birthday and no code is shown, except a code made a moment ago. */
  Records.accountHtml = function (s) {
    if (!(window.Cloud && Cloud.enabled) || s.demo) return '';
    const fresh = Cloud.issuedCode ? Cloud.issuedCode(s.id) : '';
    return '<div class="plan-section"><div class="plan-label">Account</div><div class="course-line"><span>Student number <strong>' + esc(s.number || '—') + '</strong> · ' +
      (fresh ? 'new sign-in code <code class="rec-code">' + esc(fresh) + '</code> <span class="muted small">(shown until you leave this page; it is not shown again)</span>'
             : s.dob ? '<span class="tag warn">still signs in with a birthday</span> <span class="muted small">Give them a sign-in code: the birthday is then removed from their record.</span>'
             : 'signs in with a sign-in code <span class="muted small">(not shown; give a new one if it is lost)</span>') + '</span>' +
      '<span class="btn-row">' + (fresh ? '<button class="btn secondary sm" type="button" data-rec-slip="' + esc(s.id) + '">Print the slip</button>' : '') + '<button class="btn ghost sm" type="button" data-rec-newcode="' + esc(s.id) + '">' + (s.dob ? 'Give a sign-in code' : 'New sign-in code') + '</button></span></div></div>';
  };
  /** The record tools button on a student's panel (staff). */
  Records.toolsHtml = s => s.demo ? '' : '<div class="plan-section"><div class="plan-label">This student\'s record</div><div class="course-line"><span class="muted small">A copy of everything held about this student, corrections and statements of disagreement, and holds.</span><span class="btn-row"><button class="btn ghost sm" type="button" data-rec-open="' + esc(s.id) + '">Open the record tools</button></span></div></div>';
  /** Above the list of students: how many still sign in with a birthday, and one button to move them all. */
  Records.legacyBannerHtml = function (students) {
    if (!(window.Cloud && Cloud.enabled) || !isStaff()) return '';
    const old = students.filter(s => s.dob && !s.demo && s.number), fresh = students.filter(s => Cloud.issuedCode && Cloud.issuedCode(s.id));
    // the sign-in screen offers "type your birthday, as before" only while some student still needs it
    if (isHead() && Cloud.setLegacyBirthday && window.Settings) { const any = window.Students.list.some(s => s.dob && !s.demo && s.number), flag = Settings.get('legacyBirthday') !== false; if (any !== flag) setTimeout(() => Cloud.setLegacyBirthday(any), 0); }
    return (old.length ? '<div class="rec-banner" role="note"><div><strong>' + old.length + ' student' + (old.length === 1 ? '' : 's') + ' still sign' + (old.length === 1 ? 's' : '') + ' in with a birthday.</strong> <span class="small">A birthday is personal information and easy to guess. Give each one a sign-in code; the birthday is then removed from their record. Have the slips ready to hand out: the birthday stops working at once.</span></div><button class="btn sm" type="button" data-rec-issue-all>Give codes to ' + (old.length === 1 ? 'this student' : 'these ' + old.length) + ' and print the slips</button></div>' : '') +
      (fresh.length > 1 ? '<div class="rec-banner ok" role="status"><div><strong>' + fresh.length + ' new sign-in codes</strong> <span class="small">are waiting to be printed. They are forgotten when you leave this page or sign out.</span></div><button class="btn secondary sm" type="button" data-rec-slips-all>Print all ' + fresh.length + ' slips</button></div>' : '');
  };
  Records.printSlips = function (list) {
    list = (list || []).filter(x => x && x.code); if (!list.length) return alert('There are no new codes to print. A code is only known just after it is made.');
    const node = document.createElement('div');
    node.innerHTML = '<div class="slips">' + list.map(x => '<div class="slip"><div class="slip-brand">Summitide Learning · OwlCrest Academy</div><div class="slip-name">' + esc(x.name) + '</div>' +
      '<div class="slip-row"><span>Student number</span><strong>' + esc(x.number) + '</strong></div><div class="slip-row"><span>Sign-in code</span><strong class="slip-code">' + esc(x.code) + '</strong></div>' +
      '<div class="slip-foot">Go to ' + esc(site()) + ' · choose Student · type your number and your code. Capital letters, spaces and hyphens do not matter. Keep this slip private. If you lose it, ask your teacher for a new code.</div></div>').join('') + '</div>';
    window.Tables.printNode(node, false);
    log('signin.slips', '', { count: list.length });
  };
  const slipOf = s => ({ name: s.name, number: s.number, code: Cloud.issuedCode(s.id) });

  /* ====================== the record tools dialog ====================== */
  const ui = { id: null, msg: '', busy: false };
  function closeDialog() { const d = document.getElementById('recDialog'); if (d) d.remove(); ui.id = null; }
  async function drawDialog() {
    const s = window.Students.byId(ui.id); if (!s) return closeDialog();
    let d = document.getElementById('recDialog');
    if (!d) { d = document.createElement('div'); d.id = 'recDialog'; d.className = 'learn-overlay'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-label', 'Record tools'); document.body.appendChild(d); d.addEventListener('keydown', e => { if (e.key === 'Escape') closeDialog(); }); }
    const head = '<div class="btn-row between"><h2>Record of ' + esc(s.name) + '</h2><button class="btn ghost sm" type="button" data-rec-close>✕ Close</button></div>';
    if (!d.firstChild) d.innerHTML = '<div class="learn-card privacy-dialog rec-dialog">' + head + '<p class="muted">Loading…</p></div>';
    let hold = null, corr = [], err = '';
    try { hold = await Records.hold(s.id); corr = await Records.corrections(s.id); } catch (e) { err = e.message; }
    if (ui.id !== s.id || !document.getElementById('recDialog')) return;
    const schoolHold = !!(window.Privacy && Privacy.policy && Privacy.policy.holdAll);
    d.innerHTML = '<div class="learn-card privacy-dialog rec-dialog">' + head +
      (ui.msg ? '<p class="small" role="status"><strong>' + esc(ui.msg) + '</strong></p>' : '') + (err ? '<p class="small" role="alert">' + esc(err) + '</p>' : '') +
      '<h3>A copy of everything held</h3><p class="muted small">For when a student or a parent asks to see what the school holds (an access request). The Word file is for reading; the JSON file is complete. Each copy is written in the change log. Treat the files as confidential student records.' + (isHead() ? '' : ' Problem reports and change-log lines can only be included when the Headmaster makes the copy.') + '</p>' +
      '<div class="btn-row"><button class="btn secondary sm" type="button" data-rec-export="docx">Word (to read)</button><button class="btn secondary sm" type="button" data-rec-export="json">JSON (complete)</button><button class="btn ghost sm" type="button" data-rec-export="print">Print</button></div>' +
      '<h3 style="margin-top:1rem">Corrections and statements of disagreement</h3><p class="muted small">Record here what was corrected at a student\'s or parent\'s request, what was asked for and not corrected, and any statement of disagreement they want attached. These notes stay with the record and are part of every copy.</p>' +
      (corr.length ? corr.map(c => corrHtml(c, true)).join('') : '<p class="muted small">Nothing recorded.</p>') +
      '<div class="rec-add"><div class="hm-grid"><label class="small">Kind<select class="text-input" id="recKind"><option value="corrected">Corrected</option><option value="not-corrected">Correction asked for and not made</option><option value="disagreement">Statement of disagreement</option></select></label><label class="small">About (which record)<input class="text-input" id="recAbout" maxlength="160" placeholder="for example: Unit 2 test, level in ENG3U"></label></div>' +
      '<textarea class="text-input" id="recText" rows="3" maxlength="1500" placeholder="What was asked, what was changed (or why not), in the person\'s own words where it is a statement of disagreement"></textarea><div class="btn-row"><button class="btn sm" type="button" data-rec-add>Add to the record</button></div></div>' +
      '<h3 style="margin-top:1rem">Hold</h3>' + (schoolHold ? '<p class="small"><span class="tag warn">On hold</span> Every record in the school is on hold (Settings → Privacy and retention).</p>' : '') +
      (hold ? '<p class="small"><span class="tag warn">On hold</span> since ' + esc(when(hold.at)) + (hold.byName ? ' · placed by ' + esc(hold.byName) : '') + (hold.reason ? ' · ' + esc(hold.reason) : '') + '. Nothing of this student\'s can be deleted: not their work, not their grades, not the student.</p>' : (schoolHold ? '' : '<p class="muted small">No hold. Place one when there is an access request, a complaint or an incident about this student, so that nothing is deleted while it is open.</p>')) +
      (isHead() ? (hold ? '<div class="btn-row"><button class="btn ghost sm" type="button" data-rec-hold="off">Lift the hold</button></div>' : '<div class="btn-row"><input class="text-input" id="recHoldWhy" maxlength="200" placeholder="Reason (for example: access request, 21 Nov)" style="max-width:340px"><button class="btn secondary sm" type="button" data-rec-hold="on">Place a hold</button></div>') : '<p class="muted small">Only the Headmaster can place or lift a hold.</p>') + '</div>';
    ui.msg = '';
  }
  Records.open = id => { ui.id = id; ui.msg = ''; drawDialog(); };

  /* ====================== the student's own side: ask for a correction ====================== */
  /** A row for Settings → Privacy (everyone who is a student). */
  Records.askRowHtml = function () {
    const m = me(); if (!m || m.isStaff || m.demo) return '';
    return '<div class="setting-row"><div><label>Something recorded about you is wrong?</label><div class="help">Ask for it to be corrected. Your teachers see the request and answer it; the request and the answer stay on your record.</div></div><button class="btn secondary sm" type="button" data-rec-ask>Ask for a correction</button></div>';
  };
  async function drawAsk() {
    const m = me(); if (!m) return;
    let d = document.getElementById('recDialog');
    if (!d) { d = document.createElement('div'); d.id = 'recDialog'; d.className = 'learn-overlay'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-label', 'Ask for a correction'); document.body.appendChild(d); d.addEventListener('keydown', e => { if (e.key === 'Escape') closeDialog(); }); }
    let corr = [], err = ''; try { corr = await Records.corrections(m.id); } catch (e) { err = e.message; }
    d.innerHTML = '<div class="learn-card privacy-dialog rec-dialog"><div class="btn-row between"><h2>Ask for a correction</h2><button class="btn ghost sm" type="button" data-rec-close>✕ Close</button></div>' +
      (ui.msg ? '<p class="small" role="status"><strong>' + esc(ui.msg) + '</strong></p>' : '') + (err ? '<p class="small" role="alert">' + esc(err) + '</p>' : '') +
      '<p class="muted small">If something the app shows about you is wrong (your name, your level, a mark, a comment), say what and why. Your teachers will answer here. To see everything that is recorded about you, ask your teacher for a copy.</p>' +
      '<label class="small">What is it about?<input class="text-input" id="recAbout" maxlength="160" placeholder="for example: my mark on the Unit 2 test"></label>' +
      '<textarea class="text-input" id="recText" rows="4" maxlength="1500" placeholder="What is wrong, and what should it say?"></textarea><div class="btn-row"><button class="btn" type="button" data-rec-send>Send to my teachers</button></div>' +
      '<h3 style="margin-top:1rem">Your requests</h3>' + (corr.length ? corr.map(c => corrHtml(c, false)).join('') : '<p class="muted small">None yet.</p>') + '</div>';
    ui.msg = '';
  }

  /* ====================== clicks ====================== */
  const redrawPage = () => window.dispatchEvent(new HashChangeEvent('hashchange'));
  document.addEventListener('click', async e => {
    const t = e.target.closest && e.target.closest('[data-rec-newcode],[data-rec-slip],[data-rec-issue-all],[data-rec-slips-all],[data-rec-open],[data-rec-close],[data-rec-export],[data-rec-add],[data-rec-answer],[data-rec-hold],[data-rec-ask],[data-rec-send]');
    if (!t || ui.busy) return;
    const S = window.Students, ds = t.dataset;
    const busy = async (label, fn) => { const old = t.textContent; ui.busy = true; t.disabled = true; t.textContent = label; try { await fn(); } catch (err) { alert(err.message || err); } finally { ui.busy = false; t.disabled = false; t.textContent = old; } };
    if (ds.recClose !== undefined) return closeDialog();
    if (ds.recOpen) return Records.open(ds.recOpen);
    if (ds.recAsk !== undefined) { ui.id = null; ui.msg = ''; return drawAsk(); }
    if (ds.recSlip) { const s = S.byId(ds.recSlip); return Records.printSlips([slipOf(s)]); }
    if (ds.recSlipsAll !== undefined) return Records.printSlips(S.list.filter(s => Cloud.issuedCode(s.id)).map(slipOf));
    if (ds.recNewcode) { const s = S.byId(ds.recNewcode); if (!s) return;
      if (!confirm((s.dob ? 'Give ' + s.name + ' a sign-in code? Their birthday stops working as a password at once and is removed from their record.' : 'Give ' + s.name + ' a new sign-in code? The old code stops working at once.') + '\n\nThe new code is shown once, so have a way to pass it on (the slip can be printed).')) return;
      return busy('Working…', async () => { await Cloud.resetStudentCode(s); try { sessionStorage.setItem('learnhub.studentOpen', s.id); } catch (x) {} redrawPage(); }); }
    if (ds.recIssueAll !== undefined) { const old = S.list.filter(s => s.dob && !s.demo && s.number);
      if (!old.length || !confirm('Give ' + old.length + ' student' + (old.length === 1 ? '' : 's') + ' a sign-in code?\n\nTheir birthdays stop working as passwords at once and are removed from their records. The slips open for printing when it is done: hand them out before the students next sign in.')) return;
      return busy('Working…', async () => { const done = [], failed = [];
        for (const s of old) { try { await Cloud.resetStudentCode(s); done.push(slipOf(s)); } catch (err) { failed.push(s.name + ': ' + err.message); if (/version 66 firestore\.rules/.test(err.message)) break; } }
        if (!S.list.some(s => s.dob && !s.demo && s.number) && Cloud.setLegacyBirthday) Cloud.setLegacyBirthday(false);
        redrawPage(); if (failed.length) alert('Could not finish for:\n' + failed.slice(0, 8).join('\n')); if (done.length) setTimeout(() => Records.printSlips(done), 300); }); }
    if (ds.recExport) return busy('Working…', async () => { await Records.exportStudent(ui.id, ds.recExport); });
    if (ds.recAdd !== undefined) { const d = document.getElementById('recDialog'); return busy('Saving…', async () => { await Records.addCorrection(ui.id, d.querySelector('#recKind').value, d.querySelector('#recAbout').value, d.querySelector('#recText').value); ui.msg = 'Added to the record.'; await drawDialog(); }); }
    if (ds.recAnswer) { const d = document.getElementById('recDialog'); const list = await Records.corrections(ui.id); const rec = list.find(c => c.id === ds.id); if (!rec) return;
      const reply = (d.querySelector('[data-rec-reply="' + ds.id + '"]') || {}).value || '';
      if (ds.recAnswer === 'refused' && reply.trim().length < 3) return alert('Say why it was not corrected. The student sees this answer, and it stays on the record.');
      return busy('Saving…', async () => { await Records.answerCorrection(rec, ds.recAnswer, reply); ui.msg = 'Answer saved.'; await drawDialog(); }); }
    if (ds.recHold) { const d = document.getElementById('recDialog'); const why = ds.recHold === 'on' ? ((d.querySelector('#recHoldWhy') || {}).value || '') : '';
      return busy('Saving…', async () => { await Records.setHold(ui.id, ds.recHold === 'on', why); ui.msg = ds.recHold === 'on' ? 'Hold placed. Nothing of this student\'s can be deleted.' : 'Hold lifted.'; await drawDialog(); }); }
    if (ds.recSend !== undefined) { const d = document.getElementById('recDialog'); return busy('Sending…', async () => { await Records.addCorrection(me().id, 'request', d.querySelector('#recAbout').value, d.querySelector('#recText').value); ui.msg = 'Sent. Your teachers will answer here.'; await drawAsk(); }); }
  });
  window.addEventListener('cloud:auth', closeDialog);
})();
