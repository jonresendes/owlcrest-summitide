/* =========================================================
   dashboard.js — the Grades grid
   Teacher (#/dashboard): for the selected section, one row per student and,
   per unit, a column for every lesson quiz, every assignment (handed in? +
   a grade box the teacher fills in) and the unit test. Grades save to the
   student's progress (and to the cloud), so the student sees them too.
   Student (#/grades[/course]): the same row for themselves, read-only.
   ========================================================= */
(function () {
  const { esc, lessonsFor, assignmentsFor, lessonQuestions, unitsFor, LEVELS, reviewList } = window.LH;

  /** The most recent recorded attempt on a quiz-style record: { level, pct, at, items } or null. */
  function lastReview(rec) {
    let out = null;
    Object.keys((rec && rec.levels) || {}).forEach(l => { const r = rec.levels[l]; if (r && r.last && Array.isArray(r.last.items) && (!out || String(r.last.at) > String(out.at))) out = { level: +l, pct: r.last.pct, at: r.last.at, items: r.last.items }; });
    return out;
  }
  const app = document.getElementById('app');
  const DEFAULT_MAX = 10;

  /** Levelled grade for a quiz-style record; legacy records (no per-level attempts) use the fallback level. */
  function gradeOf(q, fallbackLevel) {
    if (q && q.override) { const lvl = q.override.level || fallbackLevel || 2; return { grade: Grading.levelled(q.override.raw, lvl), level: lvl, raw: q.override.raw, teacher: true }; }   // set by the teacher on the marking screen
    if (!q || !(q.attempts > 0 || q.best > 0)) return null;
    if (q.levels && Object.keys(q.levels).length) { const b = Grading.bestOf(q.levels); if (b) return b; }   // always from the attempts, so a change of grade scale applies everywhere
    if (q.grade !== undefined && q.gradeLevel) return { grade: q.grade, level: q.gradeLevel, raw: q.gradeRaw !== undefined ? q.gradeRaw : q.best };
    const lvl = fallbackLevel || 2; return { grade: Grading.levelled(q.best || 0, lvl), level: lvl, raw: q.best || 0, legacy: true };
  }
  /** A quiz-style record with the teacher's score laid over it (marks['<lesson>:q'] / marks['test:t'] = { score, level, note }). */
  function over(rec, mark) {
    if (!mark || mark.score === undefined || mark.score === null || isNaN(+mark.score)) return rec;
    return Object.assign({}, rec || {}, { override: { raw: Math.max(0, Math.min(100, +mark.score)), level: +mark.level || null } });
  }
  function cls(g) { return g >= LEVEL_BANDS[4][0] ? 'top' : g >= LEVEL_BANDS[3][0] ? 'pass' : 'low'; }
  function qCell(q, fallbackLevel) {
    const g = gradeOf(q, fallbackLevel);
    if (!g) return '<td class="d-cell none" title="not tried" data-export="">–</td>';
    const tries = q.attempts || Object.values(q.levels || {}).reduce((n, r) => n + (r.attempts || 0), 0);
    const perLevel = Object.keys(q.levels || {}).map(l => 'L' + l + ': ' + q.levels[l].best + '% raw → ' + Grading.levelled(q.levels[l].best, +l)).join(' · ');
    return '<td class="d-cell ' + cls(g.grade) + '" title="' + tries + ' attempt' + (tries === 1 ? '' : 's') + (perLevel ? ' · ' + perLevel : ' · ' + g.raw + '% raw at Level ' + g.level) + (g.teacher ? ' · score set by the teacher' : '') + '" data-export="' + g.grade + ' (Level ' + g.level + ', ' + g.raw + '% raw' + (g.teacher ? ', set by the teacher' : '') + ')"><span class="g-num">' + g.grade + '</span><span class="g-lvl">' + (g.teacher ? '✎ ' : '') + 'L' + g.level + ' · ' + g.raw + '%</span></td>';
  }
  /** The unit test as a quiz-style record (per-level attempts when present, legacy best otherwise). */
  function testRec(u) { return u.test && u.test.levels && Object.keys(u.test.levels).length ? Object.assign({ best: u.testBest || 0, attempts: u.testAttempts || 1 }, u.test) : (u.testBest ? { best: u.testBest, attempts: u.testAttempts || 0 } : null); }
  function tCell(u, fallbackLevel) { return qCell(over(testRec(u), (u.marks || {})['test:t']), fallbackLevel); }
  /** Assignment cell: state + grade (editable for teachers). The teacher's score out of 10 becomes a levelled grade at the level the work was done. */
  function aCell(w, editable, ref, fallbackLevel) {
    const g = w && w.grade;
    const state = !w || !w.text ? '<span class="a-state none">–</span>' : w.done ? '<span class="a-state done" title="handed in ' + (w.at ? new Date(w.at).toLocaleDateString() : '') + '">✓</span>' : '<span class="a-state draft" title="draft">✎</span>';
    const lv = (w && (w.level || (g && g.level))) || fallbackLevel || 2;
    const lg = w ? Grading.assignment(Object.assign({}, w, { level: lv })) : null;
    const grade = editable
      ? '<span class="grade-box"><input class="grade-in" type="number" min="0" step="0.5" value="' + (g && g.score !== undefined && g.score !== null ? g.score : '') + '" placeholder="–" ' + ref + ' title="Score out of ' + (g && g.max || DEFAULT_MAX) + ' · work done at Level ' + lv + '"><span class="grade-max">/' + (g && g.max || DEFAULT_MAX) + '</span></span>' + (lg ? '<span class="g-lvl" title="' + lg.raw + '% at Level ' + lg.level + '">→ ' + lg.grade + ' · L' + lg.level + '</span>' : '<span class="g-lvl">L' + lv + '</span>')
      : (lg ? '<span class="grade-show' + (lg.grade >= LEVEL_BANDS[3][0] ? ' ok' : '') + '" title="' + g.score + '/' + (g.max || DEFAULT_MAX) + ' at Level ' + lg.level + '">' + lg.grade + '</span><span class="g-lvl">' + g.score + '/' + (g.max || DEFAULT_MAX) + ' · L' + lg.level + '</span>' : (w && w.text ? '<span class="g-lvl">L' + lv + '</span>' : ''));
    const note = editable ? '<button class="grade-note-btn' + (g && g.note ? ' has' : '') + '" ' + ref.replace('data-grade=', 'data-note=') + ' title="' + (g && g.note ? esc(g.note) : 'Add a comment') + '">' + (g && g.note ? 'note' : '+ note') + '</button>' : (g && g.note ? '<span class="grade-note" title="' + esc(g.note) + '">note</span>' : '');
    const said = (!w || !w.text ? 'not started' : w.done ? 'handed in' : 'draft') + (g && g.score !== undefined && g.score !== null ? ' · ' + g.score + '/' + (g.max || DEFAULT_MAX) + (lg ? ' → ' + lg.grade + ' (Level ' + lg.level + ')' : '') : '') + (g && g.note ? ' · comment: ' + g.note : '');
    return '<td class="d-cell a-cell' + (w && w.done ? ' handed' : '') + '" data-export="' + esc(said) + '">' + state + grade + note + '</td>';
  }
  /** Every levelled grade in a unit for one student (quizzes, assignments, test) → average. */
  function unitAverage(course, unit, lessons, u, fallbackLevel) {
    const gs = []; const quiz = u.quiz || {}, work = u.work || {};
    lessons.forEach(l => { if (lessonQuestions(unit, l._idx).length) { const g = gradeOf(over(quiz[l._idx], (u.marks || {})[l._idx + ':q']), fallbackLevel); if (g) gs.push(g.grade); }
      assignmentsFor(l).forEach(a => { const w = (work[l._idx] || {})[a._idx]; if (!w) return; const lg = Grading.assignment(Object.assign({}, w, { level: w.level || (w.grade && w.grade.level) || fallbackLevel })); if (lg) gs.push(lg.grade); }); });
    const t = gradeOf(over(testRec(u), (u.marks || {})['test:t']), fallbackLevel); if (t) gs.push(t.grade);
    return { avg: Grading.average(gs), n: gs.length };
  }
  /** Column headers for a unit (lessons with their assignments). */
  function headers(unit, lessons, forStudent, course) {
    // teacher grid (v56): every column heading opens that item for the whole class on the marking screen
    const mk = (path, text, title) => forStudent || !course ? text : '<a class="d-mark" href="#/mark/' + esc(course.id) + '/' + esc(unit.id) + '/' + path + '" title="' + esc(title) + ' — mark this for the whole class">' + text + '</a>';
    const top = ['<th class="d-name" rowspan="2">' + (forStudent ? 'Class' : 'Student') + '</th>' + (forStudent ? '' : '<th rowspan="2">Level</th>')];
    const bottom = [];
    lessons.forEach((l, i) => { const as = assignmentsFor(l); const hasQ = lessonQuestions(unit, l._idx).length > 0; const n = (hasQ ? 1 : 0) + as.length; if (!n) return;
      top.push('<th class="d-les" colspan="' + n + '" title="' + esc(l.title) + '">L' + (i + 1) + '</th>');
      if (hasQ) bottom.push('<th class="d-sub" title="Lesson quiz">' + mk('quiz/' + l._idx, 'quiz', 'Lesson ' + (i + 1) + ' quiz') + '</th>');
      as.forEach((a, k) => bottom.push('<th class="d-sub" title="' + esc(a.title) + '">' + mk('work/' + l._idx + '/' + a._idx, 'A' + (k + 1), a.title) + '</th>')); });
    top.push('<th rowspan="2">' + mk('test', 'Unit test', 'Unit test') + '</th><th rowspan="2" title="Average of every levelled grade in the unit: quizzes, graded assignments and the unit test">Unit avg</th><th rowspan="2">Awards</th>');
    return '<tr>' + top.join('') + '</tr><tr>' + bottom.join('') + '</tr>';
  }
  function rowCells(course, unit, lessons, u, editable, sid, fallbackLevel) {
    const quiz = u.quiz || {}, work = u.work || {};
    let cells = '';
    lessons.forEach(l => { const as = assignmentsFor(l); const hasQ = lessonQuestions(unit, l._idx).length > 0;
      if (hasQ) cells += qCell(over(quiz[l._idx], (u.marks || {})[l._idx + ':q']), fallbackLevel);
      as.forEach(a => cells += aCell((work[l._idx] || {})[a._idx], editable, 'data-grade="' + esc(sid) + '" data-c="' + esc(course.id) + '" data-u="' + esc(unit.id) + '" data-l="' + esc(l._idx) + '" data-n="' + esc(a._idx) + '"', fallbackLevel)); });
    const av = unitAverage(course, unit, lessons, u, fallbackLevel);
    return cells + tCell(u, fallbackLevel) + '<td class="d-cell avg ' + (av.avg === null ? 'none' : cls(av.avg)) + '" title="' + av.n + ' graded item' + (av.n === 1 ? '' : 's') + '">' + (av.avg === null ? '–' : '<strong>' + av.avg + '</strong>') + '</td><td class="d-cell none">' + Object.keys(u.earned || {}).length + '</td>';
  }
  function bindGrades(courseId) {
    app.querySelectorAll('.grade-in').forEach(inp => {
      const save = () => { const d = inp.dataset; const v = inp.value.trim(); const cur = ((Progress.graded(d.grade)[d.c] || {})[d.u] || {}); const w = ((cur.work || {})[d.l] || {})[d.n] || {}; const max = (w.grade && w.grade.max) || DEFAULT_MAX;
        if (v === '') Progress.setGrade(d.grade, d.c, d.u, +d.l, +d.n, null); else Progress.setGrade(d.grade, d.c, d.u, +d.l, +d.n, { score: +v, max, by: (Staff.current || {}).name || 'teacher' });
        inp.classList.add('saved'); setTimeout(() => inp.classList.remove('saved'), 800); };
      inp.addEventListener('change', save);
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') { inp.blur(); } });
    });
    app.querySelectorAll('.grade-note-btn').forEach(b => b.addEventListener('click', () => { const d = b.dataset; const cur = ((Progress.graded(d.note)[d.c] || {})[d.u] || {}); const w = ((cur.work || {})[d.l] || {})[d.n] || {}; const g = w.grade || {};
      const v = prompt('Comment for the student (leave empty to remove):', g.note || ''); if (v === null) return;
      Progress.setGrade(d.note, d.c, d.u, +d.l, +d.n, { score: g.score === undefined ? null : g.score, max: g.max || DEFAULT_MAX, note: v.trim(), by: (Staff.current || {}).name || 'teacher' });
      b.classList.toggle('has', !!v.trim()); b.title = v.trim() || 'Add a comment'; }));
  }

  /* ---------- teacher grid ---------- */
  function page() {
    if (Settings.locked || !Staff.master) { location.hash = '#/settings'; return; }
    const staff = Staff.current; const sid = staff.id;
    document.documentElement.style.setProperty('--course', 'var(--primary)');
    const sections = Sections.visible(sid, true);
    const cur = Sections.currentFor(sid);
    let students, course;
    if (cur) { students = Students.list.filter(s => (cur.students || []).includes(s.id)); course = window.LearnHub.courses.find(c => c.id === cur.courseId); }
    else {
      const ids = new Set(); if (Staff.isMaster) Students.list.forEach(s => ids.add(s.id)); else Sections.visible(sid, true).forEach(sec => (sec.students || []).forEach(id => ids.add(id)));
      students = Students.list.filter(s => ids.has(s.id));
      const cid = sessionStorage.getItem('learnhub.dashCourse'); course = window.LearnHub.courses.find(c => c.id === cid) || window.LearnHub.courses[0];
    }
    const head = '<div class="page-head"><div><h1>Grades</h1><p class="muted">' + (cur ? esc(cur.name) + (cur.term ? ' · ' + esc(cur.term) : '') + (cur.archived ? ' · archived' : '') : (Staff.isMaster ? 'All students' : 'All my students')) + ' · ' + students.length + ' student' + (students.length === 1 ? '' : 's') + '</p></div>' +
      '<div class="btn-row"><select class="text-input" id="dashSection" style="max-width:260px"><option value="">' + (Staff.isMaster ? 'All students' : 'All my students') + '</option>' + sections.map(sec => '<option value="' + sec.id + '"' + (cur && cur.id === sec.id ? ' selected' : '') + '>' + (sec.archived ? '' : '') + esc(sec.name) + '</option>').join('') + '</select>' +
      (!cur ? '<select class="text-input" id="dashCourse" style="max-width:220px">' + window.LearnHub.courses.map(c => '<option value="' + c.id + '"' + (course && c.id === course.id ? ' selected' : '') + '>' + c.icon + ' ' + esc(c.title) + '</option>').join('') + '</select>' : '') +
      '<button class="btn secondary" id="dashPrint" title="Every unit, every column: wide units are printed in parts so nothing is cut off">Print</button><button class="btn secondary" id="dashCsv" title="Every unit in one file for Excel, Google Sheets or Numbers">CSV</button><button class="btn secondary" id="dashDocx" title="Every unit in one document for Word, Google Docs or Pages">Word</button><a class="btn ghost" href="#/settings">Settings</a></div></div>';
    if (!course) { app.innerHTML = head + '<div class="empty">No course.</div>'; return; }
    Settings.activeCourse = course.id;
    const tables = course.units.map((un, ui) => {
      const lessons = un.lessons.map((l, i) => Object.assign({ _idx: i }, l));
      const rows = students.map(s => {
        const prog = Progress.graded(s.id); const u = (prog[course.id] || {})[un.id] || {};
        const t = Students.trackFor(course.id, s);
        const lvl = t ? '<span class="tag">Mod · ' + ({ k2: 'K–2', g35: '3–5', g68: '6–8' }[t.band]) + '</span>' : '<span class="tag">L' + Students.levelFor(course.id, s) + '</span>';
        return '<tr><td class="d-name"><a href="#/students" data-open-student="' + esc(s.id) + '">' + esc(s.name) + '</a>' + (s.number ? '<div class="muted small">#' + esc(s.number) + '</div>' : '') + '</td><td>' + lvl + '</td>' + rowCells(course, un, lessons, u, true, s.id, Students.levelFor(course.id, s)) + '</tr>';
      }).join('');
      return '<details class="card unit-grid"' + (ui === 0 ? ' open' : '') + '><summary class="unit-summary"><h2 style="margin:0">' + (/^unit\s*\d/i.test(un.title) ? '' : 'Unit ' + (ui + 1) + ' · ') + esc(un.title) + '</h2><span class="fold-hint">' + lessons.length + ' lessons · tap to open</span></summary><div class="d-wrap"><table class="dash">' + headers(un, lessons, false, course) + rows + '</table></div></details>';
    }).join('');
    app.innerHTML = head + '<p class="small muted">Every cell is a <strong>levelled grade</strong>: the score earned at the level the work was done, placed inside that level\'s band (' + [1, 2, 3, 4].map(l => 'Level ' + l + ' · ' + LEVELS[l].name + ' ' + LEVELS[l].band.replace('%', '')).join(' · ') + '): 50% is a pass and a grade of 50 at every level, a perfect score is the top of the band, and the grade climbs in a straight line between, so Level 4 is the only level where the grade equals the score. Below 50% the grade is the raw score. The small line shows the level and the raw score; a rewrite one level up counts when it scores higher. <strong>Tap a column heading to mark that item for the whole class.</strong> <span class="d-key top">' + LEVEL_BANDS[4][0] + '+</span> <span class="d-key pass">' + LEVEL_BANDS[3][0] + '–' + LEVEL_BANDS[3][1] + '</span> <span class="d-key low">below ' + LEVEL_BANDS[3][0] + '</span> · assignments: <strong>✓</strong> handed in, <strong>✎</strong> draft, <strong>–</strong> not started · type a score out of ' + DEFAULT_MAX + ' and the grade is worked out at the level the work was done · click a name to open the student in Settings.</p>' + tables +
      (students.length ? '' : '<div class="empty">No students in this section yet.</div>');
    app.querySelector('#dashSection').addEventListener('change', e => { Sections.setCurrent(sid, e.target.value || null); page(); });
    const dc = app.querySelector('#dashCourse'); if (dc) dc.addEventListener('change', e => { sessionStorage.setItem('learnhub.dashCourse', e.target.value); page(); });
    // v63: print and files are made from the data in the tables, not from the scrolling boxes on screen
    const gridOut = kind => {
      const Tb = window.Tables; if (!Tb) { app.querySelectorAll('details.unit-grid').forEach(d => d.open = true); window.print(); return; }
      const secs = Array.from(app.querySelectorAll('details.unit-grid')).map(d => ({ heading: (d.querySelector('summary h2') || {}).textContent || '', table: d.querySelector('table.dash') })).filter(x => x.table);
      if (!secs.length) { alert('There is nothing to ' + (kind === 'print' ? 'print' : 'download') + ' yet.'); return; }
      const who = cur ? cur.name + (cur.term ? ' · ' + cur.term : '') : (Staff.isMaster ? 'All students' : 'All my students');
      const opt = { title: 'Grades · ' + course.title, sub: who + ' · ' + students.length + ' student' + (students.length === 1 ? '' : 's'), file: 'grades-' + (cur ? cur.name : course.title),
        footer: 'Levelled grades: the score earned at the level the work was done, placed inside that level\'s band. Level 1 ' + LEVEL_BANDS[1].join('–') + ' · Level 2 ' + LEVEL_BANDS[2].join('–') + ' · Level 3 ' + LEVEL_BANDS[3].join('–') + ' · Level 4 ' + LEVEL_BANDS[4].join('–') };
      try { if (kind === 'print') Tb.printSheet(secs, opt); else if (kind === 'csv') Tb.downloadCsv(secs, opt); else Tb.downloadDocx(secs, opt); } catch (e) { console.error(e); alert('That did not work: ' + (e && e.message || e)); }
    };
    app.querySelector('#dashPrint').addEventListener('click', () => gridOut('print'));
    app.querySelector('#dashCsv').addEventListener('click', () => gridOut('csv'));
    app.querySelector('#dashDocx').addEventListener('click', () => gridOut('docx'));
    app.querySelectorAll('[data-open-student]').forEach(a => a.addEventListener('click', () => sessionStorage.setItem('learnhub.studentOpen', a.dataset.openStudent)));
    bindGrades(course.id);
  }

  /* ---------- student view ---------- */
  function studentPage(courseId) {
    const me = Students.current; if (!me || me.isStaff) { location.hash = '#/'; return; }
    const all = window.LearnHub.courses.filter(c => Students.enrolled(c.id) && !Students.isArchived(c.id));
    const list = courseId ? all.filter(c => c.id === courseId) : all;
    document.documentElement.style.setProperty('--course', 'var(--primary)');
    const graded = Progress.graded(me.id);   // my own work with my teacher's grades laid over it
    app.innerHTML = '<div class="page-head"><div><h1>Grades</h1><p class="muted">Your quiz and test scores, what you have handed in, and the grades your teacher has given.</p></div>' +
      (courseId ? '<a class="btn secondary" href="#/grades">All classes</a>' : '') + '</div>' +
      '<p class="small muted">Each cell is your <strong>grade</strong> for that piece of work — your score placed inside the band of the level you did it at (' + [1, 2, 3, 4].map(l => 'Level ' + l + ' · ' + LEVELS[l].name + ' ' + LEVELS[l].band.replace('%', '')).join(' · ') + '): 50% passes at every level and earns a 50; a perfect score is the top of your band. The small line is the level and your raw score. If your teacher allows rewrites one level up, the higher grade counts. <span class="d-key top">' + LEVEL_BANDS[4][0] + '+</span> <span class="d-key pass">' + LEVEL_BANDS[3][0] + '–' + LEVEL_BANDS[3][1] + '</span> <span class="d-key low">below ' + LEVEL_BANDS[3][0] + '</span> · assignments: <strong>✓</strong> handed in, <strong>✎</strong> draft, <strong>–</strong> not started.</p>' +
      (list.length ? list.map(c => {
        Settings.activeCourse = c.id;
        const units = unitsFor(c).map((un, ui) => { const lessons = lessonsFor(un); const u = (graded[c.id] || {})[un.id] || {};
          const notes = []; lessons.forEach(l => assignmentsFor(l).forEach(a => { const w = ((u.work || {})[l._idx] || {})[a._idx]; if (w && w.grade && w.grade.note) notes.push('<li><strong>' + esc(a.title) + ':</strong> ' + esc(w.grade.note) + '</li>'); }));
          const marks = u.marks || {}, reviews = [];
          lessons.forEach((l, li) => { const m = marks[l._idx + ':q']; if (m && m.score !== undefined && m.score !== null) notes.push('<li><strong>Quiz, lesson ' + (li + 1) + ':</strong> your teacher set the score to ' + esc(m.score) + '%.</li>'); if (m && m.note) notes.push('<li><strong>Quiz, lesson ' + (li + 1) + ':</strong> ' + esc(m.note) + '</li>');
            const r = lastReview((u.quiz || {})[l._idx]); if (r) reviews.push('<details class="rv-fold"><summary>Quiz, lesson ' + (li + 1) + ' · ' + esc(l.title) + ' — ' + r.pct + '% at Level ' + r.level + '</summary>' + reviewList(r.items, false) + '</details>'); });
          if (marks['test:t'] && marks['test:t'].score !== undefined && marks['test:t'].score !== null) notes.push('<li><strong>Unit test:</strong> your teacher set the score to ' + esc(marks['test:t'].score) + '%.</li>');
          if (marks['test:t'] && marks['test:t'].note) notes.push('<li><strong>Unit test:</strong> ' + esc(marks['test:t'].note) + '</li>');
          const tr = lastReview(u.test); if (tr) reviews.push('<details class="rv-fold"><summary>Unit test — ' + tr.pct + '% at Level ' + tr.level + '</summary>' + reviewList(tr.items, false) + '</details>');
          return '<details class="card unit-grid"><summary class="unit-summary"><h3 style="margin:0">' + (/^unit\s*\d/i.test(un.title) ? '' : 'Unit ' + (c.units.indexOf(un) + 1) + ' · ') + esc(un.title) + '</h3><span class="fold-hint">' + (() => { const t = gradeOf(over(testRec(u), (u.marks || {})['test:t']), Students.levelFor(c.id, me)); return t ? 'test grade ' + t.grade + ' · ' : ''; })() + 'tap to open</span></summary><div class="d-wrap"><table class="dash">' + headers(un, lessons, true) + '<tr><td class="d-name">' + c.icon + ' ' + esc(c.title) + '</td>' + rowCells(c, un, lessons, u, false, me.id, Students.levelFor(c.id, me)) + '</tr></table></div>' + (notes.length ? '<div class="small" style="margin-top:0.5rem"><strong>From your teacher</strong><ul>' + notes.join('') + '</ul></div>' : '') + (reviews.length ? '<div class="small" style="margin-top:0.6rem"><strong>Your latest attempts</strong> <span class="muted">— which questions to look at again</span>' + reviews.join('') + '</div>' : '') + '</details>'; }).join('');
        return '<section class="class-grades" style="--course:' + esc(c.color || '') + '"><h2>' + c.icon + ' ' + esc(c.title) + '</h2>' + units + '</section>';
      }).join('') : '<div class="empty">You are not in any class yet.</div>');
    Settings.activeCourse = null;
  }

  window.Dashboard = { page, gradeOf, testRec, lastReview, over };
  window.Grades = { page: studentPage };
})();
