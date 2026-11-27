/* =========================================================
   classes.js — v68: a class (a section) is the centre of the app.
   #/class/<id>                 the class page: six work tiles (Content, Assignments, Quizzes, Tests, CCTs, Exams)
                                and, for its teacher, the class tools (Students, Grades, Mark scheme, Live Class)
   #/class/<id>/assignments     … /quizzes /tests /ccts /exams : what is in each, for the teacher or the student
   #/class/<id>/grades          teacher: every student's mark in each category and the final mark
   #/class/<id>/scheme          teacher: the categories, what each is worth, what feeds each
   #/class/<id>/task/<task>     a CCT, an exam or a typed mark column: the teacher's marks, or the student's page
   #/class/<id>/students        the class list (drawn by app.js)
   #/teachers, #/teacher/<id>   Headmaster: every teacher and their classes
   #/staff                      teachers: who else teaches at the school
   A student's course that is not in any class yet opens the same page as  #/class/c~<courseId>.
   The marks themselves are worked out in marks.js.
   ========================================================= */
(function () {
  const { esc, unitsFor, lessonsFor, L } = window.LH;
  const app = document.getElementById('app');
  const UI = () => window.AppUI;
  const plural = (n, w, ws) => n + ' ' + (n === 1 ? w : (ws || w + 's'));
  const by = () => (Staff.current || {}).name || 'teacher';
  const AREAS = { content: 'Content', assignments: 'Assignments', quizzes: 'Quizzes', tests: 'Tests', ccts: 'CCTs', exams: 'Exams' };
  const KIND_OF = { assignments: 'work', quizzes: 'quiz', tests: 'test' };
  const pct = v => v === null || v === undefined ? '–' : (Math.round(v * 10) / 10) + '%';
  const band = g => g === null || g === undefined ? 'none' : g >= LEVEL_BANDS[4][0] ? 'top' : g >= LEVEL_BANDS[3][0] ? 'pass' : 'low';

  /* ---------- which class is this, and may this person open it? ---------- */
  function ctx(id) {
    const me = Students.current; if (!me || !id) return null;
    let sec = null, course = null;
    if (/^c~/.test(id)) { if (me.isStaff) return null; course = UI().findCourseAll(id.slice(2)); if (!course || !Students.enrolled(course.id)) return null; }
    else {
      sec = Sections.byId(id); if (!sec) return null;
      if (me.isStaff) { if (!(Staff.isMaster || sec.teacherId === me.staffId)) return null;
        const cur = Sections.currentFor(me.staffId); if (!cur || cur.id !== sec.id) Sections.setCurrent(me.staffId, sec.id); }   // every other screen (grid, marking, Live Class, the course) follows the class being worked in
      else if (!(sec.students || []).includes(me.id)) return null;
      course = UI().findCourseAll(sec.courseId); if (!course) return null;
    }
    unitsFor(course);
    return { id, sec, course, me, staff: !!me.isStaff, ro: !!(sec && sec.archived), name: sec ? sec.name : course.title };
  }
  function trail(c, extra) {
    const p = [{ label: UI().deskName(), href: '#/' }];
    if (c.staff && Staff.isMaster && c.sec.teacherId) p.push({ label: 'Teachers', href: '#/teachers' }, { label: UI().teacherName(c.sec) || 'Teacher', href: '#/teacher/' + c.sec.teacherId });
    else if (c.staff) p.push({ label: 'My Classes', href: '#/classes' });
    p.push(extra ? { label: c.name, href: '#/class/' + c.id } : { label: c.name });
    (Array.isArray(extra) ? extra : extra ? [extra] : []).forEach((x, i, a) => p.push(typeof x === 'string' ? { label: x } : x));
    // v75: the class banner, slim, on every page of the class (the class page itself draws the tall one)
    let slim = ''; if (extra && c.sec && window.Banner) { slim = Banner.html(c.sec, { title: c.name }); const id = c.sec.id; setTimeout(() => Banner.load(id), 0); }
    return slim + UI().crumbs(p);
  }
  const roster = c => (c.sec.students || []).map(id => Students.byId(id)).filter(Boolean).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const sub = c => esc(c.course.title) + (c.sec && c.sec.term ? ' · ' + esc(c.sec.term) : '') + (c.sec && UI().teacherName(c.sec) ? ' · ' + esc(UI().teacherName(c.sec)) : '') + (c.ro ? ' · <span class="tag">archived · read only</span>' : '');
  function begin(c, nav) { UI().setCourseColor(c.course); UI().setNav(nav || 'classes'); }
  function gone() { app.innerHTML = '<div class="empty"><h2>That class is not here</h2><p class="muted">It may have been archived, or you are not in it.</p><a class="btn" href="#/">Back to the desk</a></div>'; }

  /* ---------- counts for the tiles ---------- */
  function staffCounts(c, its, m) {
    const rs = roster(c); const out = { work: { n: 0, toMark: 0 }, quiz: { n: 0 }, test: { n: 0 }, cct: 0, exam: 0, taskToMark: 0 };
    its.forEach(it => { out[it.kind].n++; });
    const work = its.filter(it => it.kind === 'work');
    rs.forEach(s => { const prog = Progress.graded(s.id)[c.course.id] || {};
      work.forEach(it => { const w = (((prog[it.unit.id] || {}).work || {})[it.l] || {})[it.n]; if (w && w.done && !(w.grade && (w.grade.nm || (w.grade.score !== undefined && w.grade.score !== null)))) out.work.toMark++; });
      m.tasks.forEach(t => { const w = Marks.taskWork(prog, t), g = Marks.taskMark(prog, t); if (t.collect && w && w.done && !(g && (g.nm || (g.score !== undefined && g.score !== null)))) out.taskToMark++; }); });
    m.tasks.forEach(t => { if (t.kind === 'cct') out.cct++; if (t.kind === 'exam') out.exam++; });
    return out;
  }
  function studentState(c, it, prog) {
    const u = prog[it.unit.id] || {};
    if (it.kind === 'work') { const w = ((u.work || {})[it.l] || {})[it.n]; return !w || !w.text ? 'todo' : w.done ? 'done' : 'draft'; }
    const rec = it.kind === 'test' ? Dashboard.testRec(u) : (u.quiz || {})[it.l];
    return !rec || !(rec.attempts > 0 || rec.best > 0) ? 'todo' : (it.kind === 'test' ? u.testPassed : rec.passed) ? 'done' : 'tried';
  }

  /* ---------- the class page ---------- */
  function hub(c) {
    begin(c); document.body.dataset.page = 'desk'; document.body.dataset.desk = c.staff ? 'staff' : 'student';
    const m = c.sec ? Marks.scheme(c.sec) : Marks.fresh(); if (!c.sec) m.tasks = [];
    const its = Marks.items(c.course); const T = UI().tile, ico = UI().chalkIcon, base = '#/class/' + encodeURIComponent(c.id);
    const allUnits = unitsFor(c.course), units = allUnits.filter(u => !LH.unitHidden(u)), nLessons = units.reduce((n, u) => n + lessonsFor(u).length, 0), held = allUnits.length - units.length;
    let tiles, tools = '', head = '';
    if (c.staff) {
      const k = staffCounts(c, its, m), n = (c.sec.students || []).length, tot = Marks.total(m);
      head = plural(n, 'student');
      tools = '<nav class="class-tools" aria-label="Class tools">' +
        '<a class="ctool" href="' + base + '/students">' + ico('students') + '<span>Students</span><span class="ctool-n">' + n + '</span></a>' +
        '<a class="ctool" href="' + base + '/grades">' + ico('grades') + '<span>Grades</span></a>' +
        '<a class="ctool' + (tot !== 100 ? ' warn' : '') + '" href="' + base + '/scheme" title="The categories and what each is worth">' + ico('scheme') + '<span>Mark scheme</span>' + (tot !== 100 ? '<span class="ctool-n">' + tot + '%</span>' : '') + '</a>' +
        (c.ro ? '' : '<a class="ctool" href="#/live">' + ico('live') + '<span>Live Class</span></a>') +
        (window.Coins && Coins.on() ? '<a class="ctool" href="#/shop">' + ico('shop') + '<span>My shop</span></a>' : '') +
        '<span class="ctool-gap"></span>' +
        (c.ro ? '<button class="btn ghost sm" data-class-archive="0">Retrieve from the archive</button>' : '<button class="btn ghost sm" data-class-rename>Rename</button><button class="btn ghost sm" data-class-archive="1">Archive</button>') +
        (Staff.isMaster ? '<button class="btn ghost sm class-delete" data-class-delete title="Only the ' + esc(LH.headTitle()) + ' can delete a class">Delete class</button>' : '') + '</nav>';
      tiles = T('#/course/' + c.course.id, ico('content'), 'Content', plural(units.length, 'unit') + ' · ' + plural(nLessons, 'lesson') + (held ? ' · ' + held + ' held back' : ''), ' data-chalk') +
        T(base + '/assignments', ico('assignments'), 'Assignments', k.work.n + (k.work.toMark ? ' · ' + k.work.toMark + ' to mark' : ''), ' data-chalk') +
        T(base + '/quizzes', ico('quizzes'), 'Quizzes', plural(k.quiz.n, 'lesson quiz', 'lesson quizzes'), ' data-chalk') +
        T(base + '/tests', ico('tests'), 'Tests', plural(k.test.n, 'unit test'), ' data-chalk') +
        T(base + '/ccts', ico('ccts'), 'CCTs', k.cct ? plural(k.cct, 'task') : 'none set up yet', ' data-chalk') +
        T(base + '/exams', ico('exams'), 'Exams', k.exam ? plural(k.exam, 'exam') : 'none set up yet', ' data-chalk');
    } else {
      const prog = Progress.graded(c.me.id)[c.course.id] || {}; const st = { work: [0, 0], quiz: [0, 0], test: [0, 0] };
      its.forEach(it => { st[it.kind][1]++; if (studentState(c, it, prog) === 'done') st[it.kind][0]++; });
      const open = kind => m.tasks.filter(t => t.kind === kind && t.open);
      const p = UI().courseProgress(c.course);
      head = 'Level ' + Students.levelFor(c.course.id);
      tools = '<nav class="class-tools" aria-label="This class">' +
        '<a class="ctool" href="#/grades/' + c.course.id + '">' + ico('grades') + '<span>My grades</span></a>' +
        '<a class="ctool" href="#/case/' + c.course.id + '">' + ico('case') + '<span>Display Case</span></a>' +
        '<a class="ctool" href="#/work/' + c.course.id + '/' + (units[0] || c.course.units[0]).id + '">' + ico('assignments') + '<span>Work folder</span></a></nav>';
      tiles = T('#/course/' + c.course.id, ico('content'), 'Content', p ? p + '% done' : 'start here', ' data-chalk') +
        T(base + '/assignments', ico('assignments'), 'Assignments', st.work[1] ? st.work[0] + ' of ' + st.work[1] + ' handed in' : 'none', ' data-chalk') +
        T(base + '/quizzes', ico('quizzes'), 'Quizzes', st.quiz[1] ? st.quiz[0] + ' of ' + st.quiz[1] + ' passed' : 'none', ' data-chalk') +
        T(base + '/tests', ico('tests'), 'Tests', st.test[1] ? st.test[0] + ' of ' + st.test[1] + ' passed' : 'none', ' data-chalk') +
        T(base + '/ccts', ico('ccts'), 'CCTs', open('cct').length ? plural(open('cct').length, 'task') : 'nothing yet', ' data-chalk') +
        T(base + '/exams', ico('exams'), 'Exams', open('exam').length ? plural(open('exam').length, 'exam') : 'nothing yet', ' data-chalk');
    }
    app.innerHTML = Banner.html(c.sec, { big: true, title: c.name, sub: sub(c) + ' · ' + head, canEdit: c.staff && !c.ro }) + trail(c) + tools +
      '<div class="desk-tiles work-tiles">' + tiles + '</div>' + (c.staff ? '' : finalHtml(c.course, c.me));
    Banner.bind(app, c.sec, route);
    if (c.staff) {
      const rn = app.querySelector('[data-class-rename]'); if (rn) rn.addEventListener('click', () => { const v = prompt('Name of this class:', c.sec.name); if (v && v.trim()) { const t = prompt('Term (for example Fall 2026):', c.sec.term || ''); Sections.update(c.sec.id, { name: v.trim().slice(0, 60), term: t === null ? c.sec.term || '' : t.trim().slice(0, 40) }); route(); } });
      // v77: delete a class, the Headmaster only. The class goes (roster, mark scheme, CCT and exam set-up, held-back units, banner);
      // the students and the work and marks in their own records stay.
      const dl = app.querySelector('[data-class-delete]'); if (dl) dl.addEventListener('click', async () => {
        if (!Staff.isMaster) return; const sec = c.sec, kids = (sec.students || []).slice(), owner = sec.teacherId;
        dl.disabled = true;
        try { for (const sid of [''].concat(kids)) { const why = window.Records && Records.heldReason ? await Records.heldReason(sid) : ''; if (why) { alert('This class cannot be deleted now. ' + why + '\n\nNothing was deleted.'); dl.disabled = false; return; } } }
        catch (e) { alert('The holds could not be checked, so nothing was deleted: ' + (e && e.message || e)); dl.disabled = false; return; }
        const typed = prompt('Delete the class "' + sec.name + '"' + (UI().teacherName(sec) ? ' (' + UI().teacherName(sec) + ')' : '') + '?\n\nThis removes the class for good: its list of ' + plural(kids.length, 'student') + ', its mark scheme, its CCT and exam set-up, its held-back units and its banner.\n\nThe students themselves are NOT deleted, and the work and marks in their own records are kept.\n\nThis cannot be undone. Type DELETE to go ahead.');
        if (typed === null || typed.trim().toUpperCase() !== 'DELETE') { dl.disabled = false; if (typed !== null) alert('Nothing was deleted (the word typed was not DELETE).'); return; }
        if (window.Cloud && Cloud.enabled && Cloud.log) Cloud.log('class.delete', sec.id, { name: sec.name, course: sec.courseId, students: kids.length, teacher: owner || '' });
        if (window.Banner) Banner.forget(sec.id);
        Sections.setCurrent(c.me.staffId, null); Sections.remove(sec.id); UI().toast('Class deleted');
        location.hash = owner ? '#/teacher/' + owner : '#/classes';
      });
      const ar = app.querySelector('[data-class-archive]'); if (ar) ar.addEventListener('click', () => { const on = ar.dataset.classArchive === '1'; if (on && !confirm('Archive ' + c.sec.name + '? Its work and marks are kept and can be read; nothing in it can be changed until you retrieve it.')) return; Sections.setArchived(c.sec.id, on); route(); });
    }
  }

  /* ---------- Assignments / Quizzes / Tests ---------- */
  function hrefOf(c, it) { const b = '/' + c.course.id + '/' + it.unit.id; return it.kind === 'test' ? '#/test' + b : it.kind === 'quiz' ? '#/quiz' + b + '/' + it.l : '#/assign' + b + '/' + it.l + '/' + it.n; }
  function markHref(c, it) { const b = '#/mark/' + encodeURIComponent(c.course.id) + '/' + encodeURIComponent(it.unit.id) + '/' + it.kind; return it.kind === 'test' ? b : b + '/' + it.l + (it.kind === 'work' ? '/' + it.n : ''); }
  function catSelect(m, it, ro) {
    const cur = Marks.catOf(m, it);
    if (ro) { const cat = m.cats.find(x => x.id === cur); return '<span class="tag">' + (cat ? esc(cat.name) : 'not counted') + '</span>'; }
    return '<select class="text-input cat-pick" data-cat-for="' + esc(it.key) + '" data-kind="' + it.kind + '" aria-label="Category this counts in">' + m.cats.map(x => '<option value="' + esc(x.id) + '"' + (x.id === cur ? ' selected' : '') + '>' + esc(x.name) + '</option>').join('') + '<option value="-"' + (!cur ? ' selected' : '') + '>Not counted</option></select>';
  }
  function list(c, area) {
    begin(c); const kind = KIND_OF[area]; const m = c.sec ? Marks.scheme(c.sec) : Marks.fresh();
    const its = Marks.items(c.course, c.staff).filter(it => it.kind === kind);
    const title = AREAS[area]; let body;
    const groups = unitsFor(c.course).map(unit => ({ unit, its: its.filter(it => it.unit === unit) })).filter(g => g.its.length);
    const unitHead = g => '<h2 class="work-unit"><span class="tag">Unit ' + (c.course.units.indexOf(g.unit) + 1) + '</span> ' + esc(L(g.unit.title)) + '</h2>';
    if (c.staff) {
      const rs = roster(c); const progs = rs.map(s => Progress.graded(s.id)[c.course.id] || {});
      const status = it => { let a = 0, b = 0, nm = 0;
        progs.forEach(p => { const u = p[it.unit.id] || {}; const r = Marks.itemGrade(it, u, 2); if (r.nm) nm++;
          if (kind === 'work') { const w = ((u.work || {})[it.l] || {})[it.n]; if (w && w.done) { a++; if (!(w.grade && (w.grade.nm || (w.grade.score !== undefined && w.grade.score !== null)))) b++; } }
          else if (r.grade !== null) a++; });
        return (kind === 'work' ? a + ' of ' + rs.length + ' handed in' + (b ? ' · <strong>' + b + ' to mark</strong>' : '') : a + ' of ' + rs.length + ' done') + (nm ? ' · ' + nm + ' No Mark' : ''); };
      body = groups.map(g => '<section class="card work-card">' + unitHead(g) + '<div class="work-list">' + g.its.map(it =>
        '<div class="work-line' + (it.hidden ? ' is-hidden' : '') + '"><div class="work-what"><strong>' + esc(kind === 'test' ? 'Unit test' : it.label) + '</strong><span class="muted small">' + esc(it.title) + '</span></div>' +
        '<div class="work-status small">' + (it.hidden ? '<span class="tag">Hidden from the class</span>' : status(it)) + '</div>' +
        '<div class="work-acts">' + (it.hidden ? '' : '<label class="small muted cat-label">Counts in ' + catSelect(m, it, c.ro) + '</label><a class="btn secondary sm" href="' + markHref(c, it) + '">Mark</a>') +
        (c.ro || it.added ? '' : '<button class="btn ghost sm" data-hide="' + esc(it.key) + '" data-on="' + (it.hidden ? '0' : '1') + '" title="' + (it.hidden ? 'Put it back for the class' : 'Students in this class will not see it or be asked to do it') + '">' + (it.hidden ? 'Show' : 'Hide') + '</button>') + '</div></div>').join('') + '</div></section>').join('') ||
        '<div class="empty">This course has no ' + title.toLowerCase() + '.</div>';
      body = '<p class="muted small work-help"><strong>Hide</strong> takes an item away for the whole class: students do not see it and are not asked to do it. To leave an item out for one student only, open <strong>Mark</strong> and tick <strong>No Mark</strong> on that student\'s card. <strong>Counts in</strong> chooses the category the item is marked under; the categories and their weights are set in the <a href="#/class/' + esc(c.id) + '/scheme">mark scheme</a>.</p>' + body;
    } else {
      const prog = Progress.graded(c.me.id)[c.course.id] || {}; const fb = Students.levelFor(c.course.id) || 2;
      const tag = it => { const st = studentState(c, it, prog), r = Marks.itemGrade(it, prog[it.unit.id], fb);
        return (r.nm ? '<span class="tag">No Mark</span>' : r.grade !== null ? '<span class="tag ' + (r.grade >= 50 ? 'ok' : '') + '">' + r.grade + '</span>' : '') + (st === 'done' ? '<span class="tag ok">' + (kind === 'work' ? '✓ Handed in' : '✓ Passed') + '</span>' : st === 'draft' ? '<span class="tag accent">Draft saved</span>' : st === 'tried' ? '<span class="tag accent">Try again</span>' : '<span class="tag">To do</span>'); };
      const verb = it => { const st = studentState(c, it, prog); return st === 'todo' ? 'Start' : st === 'done' ? 'Open' : 'Continue'; };
      body = groups.map(g => '<section class="card work-card">' + unitHead(g) + '<div class="work-list">' + g.its.map(it =>
        '<a class="work-line link" href="' + hrefOf(c, it) + '"><div class="work-what"><strong>' + esc(kind === 'test' ? 'Unit test' : it.title) + '</strong><span class="muted small">' + esc(kind === 'test' ? 'Every lesson in the unit' : kind === 'quiz' ? it.label : 'Lesson ' + (it.li + 1)) + '</span></div><div class="work-status">' + tag(it) + '</div><div class="work-acts"><span class="btn secondary sm">' + verb(it) + '</span></div></a>').join('') + '</div></section>').join('') ||
        '<div class="empty">There are no ' + title.toLowerCase() + ' in this class right now.</div>';
    }
    app.innerHTML = trail(c, title) + '<div class="page-head"><div><h1>' + title + '</h1><p class="muted">' + esc(c.name) + ' · ' + sub(c) + '</p></div></div>' + body;
    if (!c.staff || c.ro) return;
    const all = Marks.items(c.course, true);
    app.querySelectorAll('[data-hide]').forEach(b => b.addEventListener('click', () => { const it = all.find(x => x.key === b.dataset.hide && !!x.hidden === (b.dataset.on === '0')); if (!it) return; Marks.setHidden(c.sec, c.course, it, b.dataset.on === '1'); route(); }));
    app.querySelectorAll('[data-cat-for]').forEach(sel => sel.addEventListener('change', () => { const mm = Marks.scheme(c.sec); const def = (mm.cats.find(x => x.from.includes(sel.dataset.kind)) || {}).id || '-';
      if (sel.value === def) delete mm.map[sel.dataset.catFor]; else mm.map[sel.dataset.catFor] = sel.value; Marks.save(c.sec, mm); UI().toast('Saved'); }));
  }

  /* ---------- CCTs and Exams ---------- */
  function tasks(c, area) {
    begin(c); const kind = area === 'ccts' ? 'cct' : 'exam'; const word = kind === 'cct' ? 'CCT' : 'exam'; const title = AREAS[area];
    const m = c.sec ? Marks.scheme(c.sec) : Marks.fresh(); const mine = (c.sec ? m.tasks : []).filter(t => t.kind === kind);
    const base = '#/class/' + encodeURIComponent(c.id); let body;
    if (c.staff) {
      const rs = roster(c); const progs = rs.map(s => Progress.graded(s.id)[c.course.id] || {});
      const cat = m.cats.find(x => x.kind === kind);
      body = (mine.length ? '<div class="work-list card work-card">' + mine.map(t => { let done = 0, marked = 0; progs.forEach(p => { const w = Marks.taskWork(p, t), g = Marks.taskMark(p, t); if (w && w.done) done++; if (g && (g.nm || (g.score !== undefined && g.score !== null))) marked++; });
          const cc = m.cats.find(x => x.id === t.cat);
          return '<a class="work-line link" href="' + base + '/task/' + esc(t.id) + '"><div class="work-what"><strong>' + esc(t.title) + '</strong><span class="muted small">out of ' + t.max + ' · ' + (cc ? 'counts in ' + esc(cc.name) + ' (' + cc.weight + '%)' : '<strong>not counted: choose a category</strong>') + '</span></div>' +
            '<div class="work-status small">' + (t.collect ? done + ' of ' + rs.length + ' handed in · ' : 'marks typed in · ') + marked + ' marked' + (t.open ? '' : ' · <span class="tag">closed to students</span>') + '</div><div class="work-acts"><span class="btn secondary sm">Open</span></div></a>'; }).join('') + '</div>'
        : '<div class="empty"><h2>No ' + word + ' yet</h2><p class="muted">' + (kind === 'cct' ? 'A course culminating task: students can write and hand it in here, or you can simply type each student\'s mark.' : 'An exam can be written here, or you can simply type each student\'s mark after a paper exam.') + '</p></div>') +
        (c.ro ? '' : '<div class="card task-new" data-keep><h3>New ' + word + '</h3><div class="task-form">' +
          '<label>Title<input class="text-input" id="tkTitle" maxlength="80" placeholder="' + (kind === 'cct' ? 'For example: Culminating task' : 'For example: Final exam') + '"></label>' +
          '<label>Out of<input class="text-input" id="tkMax" type="number" min="1" max="1000" value="100"></label>' +
          '<label>Counts in<select class="text-input" id="tkCat">' + m.cats.map(x => '<option value="' + esc(x.id) + '"' + (cat && cat.id === x.id ? ' selected' : '') + '>' + esc(x.name) + ' · ' + x.weight + '%</option>').join('') + '<option value="">Not counted</option></select></label>' +
          '<label class="task-collect"><input type="checkbox" id="tkCollect"> Students write and hand it in here <span class="muted small">(leave unticked to only type marks)</span></label>' +
          '<label class="task-wide">Instructions for students <span class="muted small">(optional)</span><textarea class="text-input" id="tkPrompt" rows="4" maxlength="4000"></textarea></label>' +
          '<div class="task-wide"><button class="btn" id="tkAdd">Create</button></div></div>' +
          '<p class="muted small" style="margin:0.6rem 0 0">What each ' + word + ' is worth comes from its category in the <a href="' + base + '/scheme">mark scheme</a>' + (cat ? ': <strong>' + esc(cat.name) + '</strong> is ' + cat.weight + '% of the final mark right now.' : '.') + '</p></div>');
    } else {
      const prog = Progress.graded(c.me.id)[c.course.id] || {}; const open = mine.filter(t => t.open);
      body = open.length ? '<div class="work-list card work-card">' + open.map(t => { const w = Marks.taskWork(prog, t), g = Marks.taskGrade(prog, t);
          return '<a class="work-line link" href="' + base + '/task/' + esc(t.id) + '"><div class="work-what"><strong>' + esc(t.title) + '</strong><span class="muted small">' + (t.collect ? 'Write it here' : 'Done in class') + '</span></div><div class="work-status">' +
            (g.nm ? '<span class="tag">No Mark</span>' : g.grade !== null ? '<span class="tag ' + (g.grade >= 50 ? 'ok' : '') + '">' + g.grade + '%</span>' : '') + (t.collect ? (w && w.done ? '<span class="tag ok">✓ Handed in</span>' : w && w.text ? '<span class="tag accent">Draft saved</span>' : '<span class="tag">To do</span>') : '') + '</div><div class="work-acts"><span class="btn secondary sm">Open</span></div></a>'; }).join('') + '</div>'
        : '<div class="empty"><h2>Nothing here yet</h2><p class="muted">When your teacher sets ' + (kind === 'cct' ? 'a culminating task' : 'an exam') + ' for this class, it shows here.</p></div>';
    }
    app.innerHTML = trail(c, title) + '<div class="page-head"><div><h1>' + title + '</h1><p class="muted">' + esc(c.name) + ' · ' + sub(c) + '</p></div></div>' + body;
    const add = app.querySelector('#tkAdd'); if (add) add.addEventListener('click', () => { const t = app.querySelector('#tkTitle').value.trim(); if (!t) { alert('Give it a title.'); return; }
      const mm = Marks.scheme(c.sec); const task = { id: Marks.newId('k'), kind, title: t, cat: app.querySelector('#tkCat').value, max: +app.querySelector('#tkMax').value || 100, collect: app.querySelector('#tkCollect').checked, prompt: app.querySelector('#tkPrompt').value, open: true, createdAt: new Date().toISOString() };
      mm.tasks.push(task); Marks.save(c.sec, mm); location.hash = base + '/task/' + task.id; });
  }

  function task(c, tid) {
    begin(c); if (!c.sec) return gone();
    const m = Marks.scheme(c.sec); const t = m.tasks.find(x => x.id === tid); if (!t || (!c.staff && !t.open)) return gone();
    const area = t.kind === 'cct' ? 'ccts' : t.kind === 'exam' ? 'exams' : 'grades'; const base = '#/class/' + encodeURIComponent(c.id);
    const crumb = [{ label: t.kind === 'mark' ? 'Grades' : AREAS[area], href: base + '/' + area }, t.title];
    if (!c.staff) {
      const u = Progress.unit(c.course.id, Marks.TASKS); u.work = u.work || {}; const wl = u.work[t.id] = u.work[t.id] || {}; const w = wl[0] = wl[0] || { text: '', done: false };
      const prog = Progress.graded(c.me.id)[c.course.id] || {}; const mark = Marks.taskMark(prog, t), g = Marks.taskGrade(prog, t);
      const locked = w.done || c.ro; const words = s => String(s || '').trim().split(/\s+/).filter(Boolean).length;
      app.innerHTML = trail(c, crumb) + '<div class="page-head"><div><span class="tag">' + Marks.TASK_NAME[t.kind] + '</span><h1 style="margin-top:0.4rem">' + esc(t.title) + '</h1><p class="muted">' + esc(c.name) + ' · out of ' + t.max + '</p></div></div>' +
        (mark && (g.nm || g.grade !== null || mark.note) ? '<div class="card mark-result"><h3>From your teacher</h3>' + (g.nm ? '<p><span class="tag">No Mark</span> This does not count in your grade.</p>' : g.grade !== null ? '<p class="mark-big"><strong>' + esc(mark.score) + '</strong> / ' + esc(mark.max || t.max) + ' <span class="muted">· ' + g.grade + '%</span></p>' : '') + (mark.note ? '<p>' + esc(mark.note) + '</p>' : '') + '</div>' : '') +
        (t.prompt.trim() ? '<div class="card"><h3>What to do</h3><div class="task-prompt">' + esc(t.prompt) + '</div></div>' : '') +
        (t.collect ? '<div class="card"><h3>Your work</h3>' + (locked ? '<div class="task-prompt">' + esc(w.text) + '</div><p class="muted small">' + (w.done ? '✓ Handed in' + (w.at ? ' on ' + new Date(w.at).toLocaleDateString() : '') + '.' : '') + '</p>' + (w.done && !c.ro && !(mark && (mark.nm || mark.score !== undefined && mark.score !== null)) ? '<button class="btn ghost sm" id="tkBack">Take it back to keep working</button>' : '')
            : '<textarea class="text-input task-write" id="tkText" rows="14" placeholder="Write here. Your work saves as you type.">' + esc(w.text) + '</textarea><div class="btn-row between" style="margin-top:0.6rem"><span class="muted small" id="tkSaved">' + words(w.text) + ' words</span><button class="btn success" id="tkHand">Hand in</button></div>') + '</div>'
          : '<div class="card"><p class="muted" style="margin:0">This one is done in class. Your teacher adds your mark here.</p></div>');
      const ta = app.querySelector('#tkText'); let timer = null;
      const keep = () => { w.text = ta.value.slice(0, 60000); w.at = new Date().toISOString(); Progress.save(); const s = app.querySelector('#tkSaved'); if (s) s.textContent = words(w.text) + ' words · saved'; };
      if (ta) ta.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(keep, 600); });
      const hand = app.querySelector('#tkHand'); if (hand) hand.addEventListener('click', () => { clearTimeout(timer); keep(); if (!w.text.trim()) { alert('Write something first.'); return; } if (!confirm('Hand this in to your teacher?')) return; w.done = true; w.at = new Date().toISOString(); Progress.save(); route(); });
      const back = app.querySelector('#tkBack'); if (back) back.addEventListener('click', () => { w.done = false; Progress.save(); route(); });
      return;
    }
    const rs = roster(c); const dis = c.ro ? ' disabled' : '';
    const rows = rs.map(s => { const prog = Progress.graded(s.id)[c.course.id] || {}; const g = Marks.taskMark(prog, t) || {}, w = Marks.taskWork(prog, t);
      const has = g.score !== undefined && g.score !== null;
      return '<tr data-sid="' + esc(s.id) + '"><td class="d-name">' + esc(s.name) + (s.number ? '<div class="muted small">#' + esc(s.number) + '</div>' : '') + '</td>' +
        (t.collect ? '<td class="tk-work" data-export="' + (w && w.done ? 'handed in' : w && w.text ? 'draft' : 'nothing yet') + '">' + (w && w.text ? '<details><summary>' + (w.done ? '✓ Handed in' : 'Draft') + (w.at ? ' · ' + new Date(w.at).toLocaleDateString() : '') + '</summary><div class="task-prompt">' + esc(w.text) + '</div></details>' : '<span class="muted">Nothing yet</span>') + '</td>' : '') +
        '<td data-export="' + (g.nm ? 'No Mark' : has ? esc(g.score) + '/' + t.max : '') + '"><span class="grade-box"><input class="text-input tk-score" type="number" min="0" max="' + t.max + '" step="0.5" value="' + (has ? esc(g.score) : '') + '" placeholder="–" aria-label="Mark for ' + esc(s.name) + '"' + dis + '><span class="grade-max">/' + t.max + '</span></span></td>' +
        '<td data-export="' + (g.nm ? 'yes' : '') + '"><label class="tk-nm"><input type="checkbox" class="tk-nmbox"' + (g.nm ? ' checked' : '') + dis + ' aria-label="No Mark for ' + esc(s.name) + '"> No Mark</label></td>' +
        '<td data-export="' + esc(g.note || '') + '"><input class="text-input tk-note" maxlength="300" value="' + esc(g.note || '') + '" placeholder="Comment the student sees"' + dis + '></td><td class="tk-saved small muted" data-export=""></td></tr>'; }).join('');
    app.innerHTML = trail(c, crumb) + '<div class="page-head"><div><span class="tag">' + (t.kind === 'mark' ? 'Mark column' : Marks.TASK_NAME[t.kind]) + '</span><h1 style="margin-top:0.4rem">' + esc(t.title) + '</h1><p class="muted">' + esc(c.name) + ' · ' + plural(rs.length, 'student') + '</p></div></div>' +
      '<details class="card task-edit" data-keep' + (rs.length ? '' : ' open') + '><summary><strong>Set-up</strong> <span class="muted small">out of ' + t.max + ' · ' + (m.cats.find(x => x.id === t.cat) ? 'counts in ' + esc(m.cats.find(x => x.id === t.cat).name) : 'not counted') + (t.kind === 'mark' ? '' : t.collect ? ' · collected here' : ' · marks typed in') + (t.open ? '' : ' · closed to students') + '</span></summary><div class="task-form">' +
        '<label>Title<input class="text-input" id="teTitle" maxlength="80" value="' + esc(t.title) + '"' + dis + '></label>' +
        '<label>Out of<input class="text-input" id="teMax" type="number" min="1" max="1000" value="' + t.max + '"' + dis + '></label>' +
        '<label>Counts in<select class="text-input" id="teCat"' + dis + '>' + m.cats.map(x => '<option value="' + esc(x.id) + '"' + (t.cat === x.id ? ' selected' : '') + '>' + esc(x.name) + ' · ' + x.weight + '%</option>').join('') + '<option value=""' + (m.cats.some(x => x.id === t.cat) ? '' : ' selected') + '>Not counted</option></select></label>' +
        (t.kind === 'mark' ? '' : '<label class="task-collect"><input type="checkbox" id="teCollect"' + (t.collect ? ' checked' : '') + dis + '> Students write and hand it in here</label><label class="task-collect"><input type="checkbox" id="teOpen"' + (t.open ? ' checked' : '') + dis + '> Students can see it</label>' +
          '<label class="task-wide">Instructions for students<textarea class="text-input" id="tePrompt" rows="4" maxlength="4000"' + dis + '>' + esc(t.prompt) + '</textarea></label>') +
        (c.ro ? '' : '<div class="task-wide btn-row between"><button class="btn" id="teSave">Save set-up</button><button class="btn ghost sm" id="teDel">Delete this ' + (t.kind === 'mark' ? 'column' : Marks.TASK_NAME[t.kind]) + '</button></div>') + '</div></details>' +
      (rs.length ? '<p class="muted small">Type each mark out of ' + t.max + '. The percentage is the mark that counts: it is not adjusted by level. <strong>No Mark</strong> leaves it out of that student\'s grade. Each row saves as you leave it.</p><div class="d-wrap"><table class="dash task-marks"><tr><th class="d-name">Student</th>' + (t.collect ? '<th>Work</th>' : '') + '<th>Mark</th><th>No Mark</th><th>Comment</th><th></th></tr>' + rows + '</table></div>' : '<div class="empty">No students in this class yet.</div>');
    if (c.ro) return;
    app.querySelectorAll('tr[data-sid]').forEach(tr => { const sid = tr.dataset.sid, sc = tr.querySelector('.tk-score'), nm = tr.querySelector('.tk-nmbox'), note = tr.querySelector('.tk-note'), said = tr.querySelector('.tk-saved');
      const keep = () => { const raw = sc.value.trim(); if (raw !== '' && (isNaN(+raw) || +raw < 0 || +raw > t.max)) { said.textContent = 'Type 0 to ' + t.max; said.classList.add('unsaved'); return; }
        Progress.setGrade(sid, c.course.id, Marks.MARKS, t.id, 'm', null);
        if (raw !== '' || nm.checked || note.value.trim()) Progress.setGrade(sid, c.course.id, Marks.MARKS, t.id, 'm', Object.assign({ max: t.max, note: note.value.trim().slice(0, 300), by: by() }, raw !== '' ? { score: +raw } : {}, nm.checked ? { nm: true } : {}));
        said.classList.remove('unsaved'); said.textContent = '✓ Saved'; };
      [sc, nm, note].forEach(el => el.addEventListener('change', keep)); });
    const sv = app.querySelector('#teSave'); if (sv) sv.addEventListener('click', () => { const mm = Marks.scheme(c.sec); const x = mm.tasks.find(k => k.id === t.id); if (!x) return; const v = app.querySelector('#teTitle').value.trim(); if (!v) { alert('Give it a title.'); return; }
      x.title = v; x.max = +app.querySelector('#teMax').value || 100; x.cat = app.querySelector('#teCat').value; const co = app.querySelector('#teCollect'); if (co) { x.collect = co.checked; x.open = app.querySelector('#teOpen').checked; x.prompt = app.querySelector('#tePrompt').value; }
      Marks.save(c.sec, mm); UI().toast('Saved'); route(); });
    const del = app.querySelector('#teDel'); if (del) del.addEventListener('click', () => { if (!confirm('Delete "' + t.title + '"? Marks already typed for it stop counting. Work students wrote for it stays in their records.')) return; const mm = Marks.scheme(c.sec); mm.tasks = mm.tasks.filter(k => k.id !== t.id); Marks.save(c.sec, mm); location.hash = base + '/' + area; });
  }

  /* ---------- Grades for the class ---------- */
  function schemeStrip(c, m) {
    const tot = Marks.total(m), un = Marks.unclaimed(m);
    return '<div class="scheme-strip">' + m.cats.map(x => '<span class="scheme-chip"><strong>' + esc(x.name) + '</strong> ' + x.weight + '%</span>').join('') + '</div>' +
      (tot !== 100 ? '<div class="plan-banner warn-banner"><strong>The categories add up to ' + tot + '%, not 100%.</strong> Marks are scaled so the final mark still reads out of 100. <a href="#/class/' + esc(c.id) + '/scheme">Fix the mark scheme</a></div>' : '') +
      (un.length ? '<div class="plan-banner warn-banner"><strong>' + un.map(k => Marks.KIND_NAME[k]).join(' and ') + (un.length === 1 ? ' are' : ' are') + ' not counted</strong> in any category. <a href="#/class/' + esc(c.id) + '/scheme">Choose a category for them</a></div>' : '');
  }
  function grades(c) {
    begin(c); if (!c.staff) { location.replace(location.pathname + '#/grades/' + c.course.id); return; }
    const m = Marks.scheme(c.sec), its = Marks.items(c.course), rs = roster(c), base = '#/class/' + encodeURIComponent(c.id);
    const sums = rs.map(s => ({ s, r: Marks.summary(c.sec, c.course, s, m, its) }));
    const finals = sums.map(x => x.r.exact).filter(v => v !== null); const classAvg = finals.length ? finals.reduce((a, b) => a + b, 0) / finals.length : null;
    const cols = m.tasks.filter(t => t.kind === 'mark');
    const cell = (v, n, nm) => '<td class="d-cell ' + band(v) + '" data-export="' + (v === null ? '' : v) + '" title="' + plural(n, 'mark') + ' counted' + (nm ? ' · ' + nm + ' No Mark' : '') + '">' + (v === null ? '–' : '<span class="g-num">' + Math.round(v) + '</span>') + '<span class="g-lvl">' + n + (nm ? ' · ' + nm + ' NM' : '') + '</span></td>';
    const table = '<div class="d-wrap"><table class="dash final-table"><tr><th class="d-name">Student</th><th>Level</th>' + m.cats.map(x => '<th title="' + esc(x.name) + '">' + esc(x.name) + '<div class="th-w">' + x.weight + '%</div></th>').join('') + '<th>Final mark</th></tr>' +
      sums.map(x => { const t = Students.trackFor(c.course.id, x.s);
        return '<tr><td class="d-name"><a href="' + base + '/students" data-open-student="' + esc(x.s.id) + '">' + esc(x.s.name) + '</a>' + (x.s.number ? '<div class="muted small">#' + esc(x.s.number) + '</div>' : '') + '</td><td data-export="' + (t ? 'Modified' : 'Level ' + Students.levelFor(c.course.id, x.s)) + '"><span class="tag">' + (t ? 'Mod' : 'L' + Students.levelFor(c.course.id, x.s)) + '</span></td>' +
          x.r.cats.map(k => cell(k.avg, k.n, k.nm)).join('') + '<td class="d-cell final ' + band(x.r.final) + '" data-export="' + (x.r.final === null ? '' : x.r.final) + '" title="' + (x.r.final === null ? 'No marks yet' : pct(x.r.exact) + ' from categories worth ' + x.r.counted + '% so far') + '">' + (x.r.final === null ? '–' : '<strong>' + x.r.final + '%</strong>') + '</td></tr>'; }).join('') +
      '</table></div>';
    app.innerHTML = trail(c, 'Grades') + '<div class="page-head"><div><h1>Grades</h1><p class="muted">' + esc(c.name) + ' · ' + plural(rs.length, 'student') + (classAvg === null ? '' : ' · class average ' + Math.round(classAvg) + '%') + '</p></div>' +
      '<div class="btn-row"><a class="btn secondary" href="#/dashboard">Every mark, item by item</a><a class="btn ghost" href="' + base + '/scheme">Mark scheme</a></div></div>' +
      schemeStrip(c, m) +
      '<div class="card reveal-card"><div><strong>Students ' + (m.showFinal ? 'can see' : 'cannot see') + ' their final mark</strong><div class="muted small">' + (m.showFinal ? 'Each student sees their own final mark and their average in each category on their class page and under My grades.' : 'Students still see the mark on each piece of work. The final mark and the category averages stay hidden until you reveal them.') + '</div></div>' +
        (c.ro ? '' : '<button class="btn ' + (m.showFinal ? 'ghost' : 'success') + '" id="revealBtn">' + (m.showFinal ? 'Hide the final mark' : 'Reveal the final mark') + '</button>') + '</div>' +
      (rs.length ? table + '<p class="muted small">Each category shows the average of the marks counted in it, with the number of marks underneath. The final mark weighs the categories as set in the mark scheme. A category with no marks yet is left out and the others are scaled up, so a mark early in the term still reads out of 100. Work with no mark is not counted; type 0 to count it as zero, or tick No Mark to leave it out for good.</p>' : '<div class="empty">No students in this class yet. <a href="' + base + '/students">Add students</a></div>') +
      '<div class="card"><div class="btn-row between"><h3 style="margin:0">Marks you type in</h3>' + (c.ro ? '' : '<button class="btn secondary sm" id="colAdd">＋ Add a mark column</button>') + '</div><p class="muted small">For anything marked outside the app: a homework check, participation, a presentation, a paper test. CCTs and exams have their own tiles on the class page.</p>' +
        (m.tasks.length ? '<div class="work-list">' + m.tasks.map(t => { const cc = m.cats.find(x => x.id === t.cat); return '<a class="work-line link" href="' + base + '/task/' + esc(t.id) + '"><div class="work-what"><strong>' + esc(t.title) + '</strong><span class="muted small">' + (t.kind === 'mark' ? 'Mark column' : Marks.TASK_NAME[t.kind]) + ' · out of ' + t.max + '</span></div><div class="work-status small">' + (cc ? esc(cc.name) : '<strong>not counted</strong>') + '</div><div class="work-acts"><span class="btn secondary sm">Enter marks</span></div></a>'; }).join('') + '</div>' : '<p class="muted small" style="margin:0">None yet.</p>') + '</div>';
    app.querySelectorAll('[data-open-student]').forEach(a => a.addEventListener('click', () => sessionStorage.setItem('learnhub.studentOpen', a.dataset.openStudent)));
    const rv = app.querySelector('#revealBtn'); if (rv) rv.addEventListener('click', () => { const mm = Marks.scheme(c.sec); if (!mm.showFinal && !confirm('Let every student in ' + c.sec.name + ' see their own final mark and category averages?')) return; mm.showFinal = !mm.showFinal; Marks.save(c.sec, mm); route(); });
    const ca = app.querySelector('#colAdd'); if (ca) ca.addEventListener('click', () => { const v = prompt('Name of the mark column (for example: Homework check 1):'); if (!v || !v.trim()) return; const mx = prompt('Out of how many?', '10'); if (mx === null) return;
      const mm = Marks.scheme(c.sec); const t = { id: Marks.newId('k'), kind: 'mark', title: v.trim(), cat: (mm.cats[0] || {}).id || '', max: +mx || 10, collect: false, prompt: '', open: true, createdAt: new Date().toISOString() }; mm.tasks.push(t); Marks.save(c.sec, mm); location.hash = base + '/task/' + t.id; });
  }
  /** What a student sees of their final mark: the mark and the categories once the teacher has revealed them. */
  function finalHtml(course, student) {
    const sec = Marks.classFor(course.id, student.id); if (!sec) return '';
    const m = Marks.scheme(sec);
    if (!m.showFinal) return '<div class="card final-card hidden-final"><h3>Final mark</h3><p class="muted" style="margin:0">Your teacher has not shared the final mark for this class yet. You can still see the mark on each piece of work.</p></div>';
    const r = Marks.summary(sec, course, student, m);
    return '<div class="card final-card"><div class="final-top"><div><h3 style="margin:0">Final mark so far</h3><p class="muted small" style="margin:0.2rem 0 0">' + esc(sec.name) + ' · each category counts for the share shown</p></div><div class="final-num ' + band(r.final) + '">' + (r.final === null ? '–' : r.final + '%') + '</div></div>' +
      '<div class="final-cats">' + r.cats.map(k => '<div class="final-cat"><div class="final-cat-top"><span>' + esc(k.name) + ' <span class="muted small">· worth ' + k.weight + '%</span></span><strong>' + (k.avg === null ? 'no marks yet' : Math.round(k.avg) + '%') + '</strong></div><div class="progress mini"><span style="width:' + (k.avg === null ? 0 : Math.max(0, Math.min(100, k.avg))) + '%"></span></div></div>').join('') + '</div>' +
      (r.final !== null && r.counted < r.total ? '<p class="muted small" style="margin:0.6rem 0 0">This is from the categories that have marks so far. It will change as more work is marked.</p>' : '') + '</div>';
  }

  /* ---------- Mark scheme ---------- */
  const PRESETS = {
    simple: { name: 'Course work 70 · CCT 15 · Exam 15', cats: [['Course work', 70, ['quiz', 'work', 'test'], ''], ['CCT', 15, [], 'cct'], ['Exam', 15, [], 'exam']] },
    chart: { name: 'Achievement chart: K/U · T/I · C · A + CCT + Exam', cats: [['Knowledge and Understanding', 17.5, ['quiz', 'test'], ''], ['Thinking and Inquiry', 17.5, [], ''], ['Communication', 17.5, [], ''], ['Application', 17.5, ['work'], ''], ['CCT', 15, [], 'cct'], ['Exam', 15, [], 'exam']] },
    types: { name: 'Homework · Assignments · Quizzes · Tests · CCT · Exam', cats: [['Homework', 10, [], ''], ['Assignments', 25, ['work'], ''], ['Quizzes', 10, ['quiz'], ''], ['Tests', 25, ['test'], ''], ['CCT', 15, [], 'cct'], ['Exam', 15, [], 'exam']] }
  };
  function schemePage(c) {
    begin(c); if (!c.staff) return gone();
    const m = Marks.scheme(c.sec), tot = Marks.total(m), base = '#/class/' + encodeURIComponent(c.id), dis = c.ro ? ' disabled' : '';
    const its = Marks.items(c.course), rs = roster(c);
    const fin = rs.map(s => Marks.summary(c.sec, c.course, s, m, its).exact).filter(v => v !== null);
    const others = Sections.visible(c.me.staffId, true).filter(x => x.id !== c.sec.id && x.marks && Array.isArray(x.marks.cats));
    const countIn = id => its.filter(it => Marks.catOf(m, it) === id).length + m.tasks.filter(t => t.cat === id).length;
    app.innerHTML = trail(c, [{ label: 'Grades', href: base + '/grades' }, 'Mark scheme']) +
      '<div class="page-head"><div><h1>Mark scheme</h1><p class="muted">' + esc(c.name) + ' · the categories this class is marked in and what each is worth. Every change is saved and every student\'s final mark follows straight away.</p></div><a class="btn secondary" href="' + base + '/grades">See the grades</a></div>' +
      '<div class="card scheme-card"><div class="scheme-rows">' +
      '<div class="scheme-row scheme-head"><span>Category</span><span>Worth</span><span>Collects from the course</span><span>Used for</span><span></span></div>' +
      m.cats.map(x => '<div class="scheme-row" data-cat="' + esc(x.id) + '"><input class="text-input sc-name" maxlength="40" value="' + esc(x.name) + '" aria-label="Category name"' + dis + '>' +
        '<span class="sc-w"><input class="text-input sc-weight" type="number" min="0" max="100" step="0.5" value="' + x.weight + '" aria-label="Per cent of the final mark"' + dis + '><span>%</span></span>' +
        '<span class="sc-from">' + Object.keys(Marks.KIND_NAME).map(k => '<label><input type="checkbox" class="sc-kind" value="' + k + '"' + (x.from.includes(k) ? ' checked' : '') + dis + '> ' + Marks.KIND_NAME[k] + '</label>').join('') + '</span>' +
        '<span class="sc-role"><select class="text-input sc-kindsel" aria-label="Used for"' + dis + '><option value="">typed marks</option><option value="cct"' + (x.kind === 'cct' ? ' selected' : '') + '>CCT</option><option value="exam"' + (x.kind === 'exam' ? ' selected' : '') + '>Exam</option></select><span class="muted small">' + plural(countIn(x.id), 'item') + '</span></span>' +
        (c.ro ? '<span></span>' : '<button class="btn ghost sm sc-del" title="Remove this category">Remove</button>') + '</div>').join('') + '</div>' +
      '<div class="scheme-total ' + (tot === 100 ? 'ok' : 'bad') + '" role="status"><strong>Total ' + tot + '%</strong> ' + (tot === 100 ? '✓ adds up to 100%' : tot < 100 ? '· ' + (Math.round((100 - tot) * 10) / 10) + '% still to give out' : '· ' + (Math.round((tot - 100) * 10) / 10) + '% too much') + (fin.length ? '<span class="muted"> · class average with this scheme: ' + Math.round(fin.reduce((a, b) => a + b, 0) / fin.length) + '%</span>' : '') + '</div>' +
      (c.ro ? '' : '<div class="btn-row" style="margin-top:0.8rem"><button class="btn secondary" id="scAdd">＋ Add a category</button>' +
        '<select class="text-input" id="scPreset" style="max-width:340px"><option value="">Start from a ready-made scheme…</option>' + Object.keys(PRESETS).map(k => '<option value="' + k + '">' + esc(PRESETS[k].name) + '</option>').join('') + (others.length ? '<optgroup label="Copy from another class">' + others.map(x => '<option value="sec:' + esc(x.id) + '">' + esc(x.name) + (x.term ? ' · ' + esc(x.term) : '') + '</option>').join('') + '</optgroup>' : '') + '</select></div>') + '</div>' +
      schemeStrip(c, m).replace(/<div class="scheme-strip">.*?<\/div>/, '') +
      '<div class="card"><h3>How the final mark is worked out</h3><ul class="plain-list small"><li><strong>Collects from the course</strong> sends every quiz, assignment or unit test of the course into that category. One piece of work can be moved to a different category from the Assignments, Quizzes or Tests list of the class.</li>' +
      '<li><strong>Used for</strong> marks the category that new CCTs or exams count in. Marks you type in (a homework check, participation, a paper test) can go in any category.</li>' +
      '<li>Inside a category every mark counts the same. The final mark is each category\'s average multiplied by what the category is worth.</li>' +
      '<li>A category with no marks yet is left out until it has one, and the rest are scaled up to 100.</li>' +
      '<li>Students see the final mark only after you reveal it on the Grades page.</li></ul></div>';
    if (c.ro) return;
    const edit = fn => { const mm = Marks.scheme(c.sec); fn(mm); Marks.save(c.sec, mm); route(); };
    app.querySelectorAll('.scheme-row[data-cat]').forEach(row => { const id = row.dataset.cat;
      row.querySelector('.sc-name').addEventListener('change', e => edit(mm => { const x = mm.cats.find(k => k.id === id); if (x) x.name = e.target.value.trim() || x.name; }));
      row.querySelector('.sc-weight').addEventListener('change', e => edit(mm => { const x = mm.cats.find(k => k.id === id); if (x) x.weight = +e.target.value || 0; }));
      row.querySelectorAll('.sc-kind').forEach(cb => cb.addEventListener('change', () => edit(mm => { mm.cats.forEach(k => { k.from = k.from.filter(v => v !== cb.value); }); if (cb.checked) mm.cats.find(k => k.id === id).from.push(cb.value); })));
      row.querySelector('.sc-kindsel').addEventListener('change', e => edit(mm => { if (e.target.value) mm.cats.forEach(k => { if (k.kind === e.target.value) k.kind = ''; }); mm.cats.find(k => k.id === id).kind = e.target.value; }));
      const del = row.querySelector('.sc-del'); if (del) del.addEventListener('click', () => { const n = countIn(id); if (m.cats.length <= 1) { alert('A class needs at least one category.'); return; } if (!confirm('Remove this category?' + (n ? ' The ' + plural(n, 'item') + ' in it will not count until you choose another category for them.' : ''))) return; edit(mm => { mm.cats = mm.cats.filter(k => k.id !== id); Object.keys(mm.map).forEach(k => { if (mm.map[k] === id) delete mm.map[k]; }); }); }); });
    app.querySelector('#scAdd').addEventListener('click', () => { if (m.cats.length >= 12) { alert('Twelve categories is the most a class can have.'); return; } edit(mm => { mm.cats.push({ id: Marks.newId('c'), name: 'New category', weight: Math.max(0, Math.round((100 - Marks.total(mm)) * 10) / 10), from: [], kind: '' }); }); });
    app.querySelector('#scPreset').addEventListener('change', e => { const v = e.target.value; if (!v) return; if (!confirm('Replace the categories of ' + c.sec.name + ' with this scheme? Marks are kept; CCTs and exams move to the matching category, and any other typed marks will need a category chosen again.')) { e.target.value = ''; return; }
      edit(mm => { let cats;
        if (/^sec:/.test(v)) { const src = Sections.byId(v.slice(4)); cats = Marks.scheme(src).cats; }
        else cats = PRESETS[v].cats.map((p, i) => ({ id: Marks.newId('c') + i, name: p[0], weight: p[1], from: p[2].slice(), kind: p[3] }));
        const old = mm.cats; mm.cats = cats.map((x, i) => Object.assign({}, x, { id: Marks.newId('c') + i })); mm.map = {};
        mm.tasks.forEach(t => { const was = old.find(o => o.id === t.cat); const to = mm.cats.find(x => (t.kind !== 'mark' && x.kind === t.kind)) || (was && mm.cats.find(x => x.name.toLowerCase() === was.name.toLowerCase())); t.cat = to ? to.id : ''; }); }); });
  }

  /* ---------- My Classes (teacher: every class; student: theirs) ---------- */
  function classCard(sec, extra) {
    const c = UI().findCourseAll(sec.courseId); const n = (sec.students || []).length;
    return '<a class="card class-card" href="#/class/' + esc(sec.id) + '" style="--course:' + esc(c ? c.color || '' : '') + '"><span class="class-card-bar"></span><span class="class-card-text"><strong>' + esc(sec.name) + '</strong><span class="muted small">' + (c ? esc(c.title) : esc(sec.courseId)) + (sec.term ? ' · ' + esc(sec.term) : '') + '</span></span><span class="class-card-tags">' + (extra || '') + '<span class="tag">' + plural(n, 'student') + '</span>' + (sec.archived ? '<span class="tag">archived</span>' : '') + (c ? '' : '<span class="tag accent">course not loaded</span>') + '</span></a>';
  }
  function myClasses() {
    const me = Students.current; UI().setCourseColor(null); UI().setNav('classes');
    if (!me.isStaff) { location.replace(location.pathname + '#/'); return; }
    const secs = Sections.visible(me.staffId, false), arch = Sections.visible(me.staffId, true).filter(x => x.archived);
    const mine = Staff.isMaster ? secs.filter(x => !x.teacherId) : secs, others = Staff.isMaster ? secs.filter(x => x.teacherId) : [];
    const nc = (location.hash.split('?')[1] || '').match(/new=([^&]+)/); if (nc) { sessionStorage.setItem('learnhub.newSectionCourse', decodeURIComponent(nc[1])); history.replaceState(history.state, '', location.pathname + '#/classes'); }
    app.innerHTML = UI().crumbs([{ label: UI().deskName(), href: '#/' }, { label: 'My Classes' }]) +
      '<div class="page-head"><div><h1>My Classes</h1><p class="muted">Open a class to reach its content, work, students, grades and Live Class.</p></div></div>' +
      (mine.length ? '<div class="class-cards">' + mine.map(s => classCard(s)).join('') + '</div>' : '<div class="empty">' + (Staff.isMaster ? 'You are not teaching a class yourself.' : 'No classes yet.') + ' Create one below.</div>') +
      (others.length ? '<h2 class="sub-head">Classes taught by teachers</h2><div class="class-cards">' + others.map(s => classCard(s, '<span class="tag accent">' + esc(UI().teacherName(s)) + '</span>')).join('') + '</div>' : '') +
      '<div class="card" style="padding:1rem 1.25rem;margin-top:1.25rem">' + UI().sectionsHtml() + '</div>' +
      (arch.length ? '<details class="other-courses"><summary>Archived classes (' + arch.length + ')</summary><div class="class-cards" style="margin-top:1rem">' + arch.map(s => classCard(s)).join('') + '</div></details>' : '');
    UI().bindSections(myClasses);
  }

  /* ---------- Teachers (Headmaster) and the staff list (teachers) ---------- */
  function teachersPage() {
    const me = Students.current; if (!me || me.role !== 'master') { location.replace(location.pathname + '#/staff'); return; }
    UI().setCourseColor(null); UI().setNav('teachers');
    const HT = LH.headTitle(); const ts = Staff.teachers.slice().sort((a, b) => String(a.name).localeCompare(String(b.name)));
    const card = (id, t, mineTag) => { const act = Sections.list.filter(s => (id === 'master' ? !s.teacherId : s.teacherId === id) && !s.archived), arc = Sections.list.filter(s => (id === 'master' ? !s.teacherId : s.teacherId === id) && s.archived);
      const kids = new Set(); act.forEach(s => (s.students || []).forEach(x => kids.add(x)));
      return '<a class="card teacher-card" href="#/teacher/' + esc(id) + '">' + UI().avatarHtml(t, 'who-avatar big') + '<span class="teacher-card-text"><strong>' + esc(t.name) + '</strong><span class="muted small">' + (mineTag ? esc(HT) + ' · you' : 'Teacher' + (t.login ? ' · ID ' + esc(t.login) : '')) + '</span></span><span class="class-card-tags"><span class="tag">' + plural(act.length, 'class', 'classes') + '</span><span class="tag">' + plural(kids.size, 'student') + '</span>' + (arc.length ? '<span class="tag">' + arc.length + ' archived</span>' : '') + '</span></a>'; };
    app.innerHTML = UI().crumbs([{ label: UI().deskName(), href: '#/' }, { label: 'Teachers' }]) +
      '<div class="page-head"><div><h1>Teachers</h1><p class="muted">Open a teacher to see their classes, current and archived. Only the ' + esc(HT) + ' sees this page.</p>' + UI().cloudStatusHtml() + '</div></div>' +
      (UI().teacherMsg().msg ? '<div class="plan-banner' + (UI().teacherMsg().ok ? '' : ' warn-banner') + '" role="status">' + esc(UI().teacherMsg().msg) + '</div>' : '') +
      '<div class="teacher-cards">' + card('master', Staff.master || me, true) + ts.map(t => card(t.id, t)).join('') + '</div>' +
      '<details class="card hm-card accounts-fold"' + (ts.length ? '' : ' open') + '><summary><strong>Teacher accounts</strong> <span class="muted small">add a teacher · reset a password · move classes. To delete a teacher, open their card above.</span></summary><div style="margin-top:0.75rem">' + UI().teachersHtml() + '</div></details>';
    UI().bindTeachers();
  }
  function teacherPage(id) {
    const me = Students.current; if (!me || me.role !== 'master') { location.replace(location.pathname + '#/'); return; }
    const t = id === 'master' ? (Staff.master || me) : Staff.teachers.find(x => x.id === id); if (!t) return gone();
    UI().setCourseColor(null); UI().setNav('teachers');
    const own = s => id === 'master' ? !s.teacherId : s.teacherId === id;
    const act = Sections.list.filter(s => own(s) && !s.archived), arc = Sections.list.filter(s => own(s) && s.archived);
    app.innerHTML = UI().crumbs([{ label: UI().deskName(), href: '#/' }, { label: 'Teachers', href: '#/teachers' }, { label: t.name }]) +
      '<div class="page-head"><div class="teacher-head">' + UI().avatarHtml(t, 'who-avatar big') + '<div><h1>' + esc(t.name) + '</h1><p class="muted">' + (id === 'master' ? esc(LH.headTitle()) : 'Teacher' + (t.login ? ' · ID ' + esc(t.login) : '')) + ' · ' + plural(act.length, 'current class', 'current classes') + (arc.length ? ' · ' + arc.length + ' archived' : '') + '</p></div></div>' +
      '<div class="btn-row"><a class="btn secondary" href="#/classes">Create or move a class</a></div></div>' +
      '<h2 class="sub-head">Current classes</h2>' + (act.length ? '<div class="class-cards">' + act.map(s => classCard(s)).join('') + '</div>' : '<div class="empty">No current classes.</div>') +
      (arc.length ? '<h2 class="sub-head">Archived classes</h2><div class="class-cards">' + arc.map(s => classCard(s)).join('') + '</div>' : '') +
      // v74: deleting a teacher is on the teacher's own page, where the Headmaster looks for it
      (id === 'master' ? '' : (UI().teacherMsg().msg ? '<div class="plan-banner' + (UI().teacherMsg().ok ? '' : ' warn-banner') + '" role="status" style="margin-top:1rem">' + esc(UI().teacherMsg().msg) + '</div>' : '') +
        '<div class="card danger-card"><div><h3 style="margin:0 0 0.25rem">Delete this teacher</h3><p class="muted small" style="margin:0">' + esc(t.name) + ' will no longer be able to sign in. ' + (act.length + arc.length ? 'Their ' + plural(act.length + arc.length, 'class', 'classes') + ', the students in them and all work and marks are kept; the classes pass to you until you give them to another teacher.' : 'They have no classes, so nothing else changes.') + ' Their private notes are deleted.</p></div><button class="btn danger" data-t-remove="' + esc(id) + '">Delete ' + esc(t.name) + '</button></div>');
    UI().bindTeachers();
  }
  function staffPage() {
    const me = Students.current; if (!me || !me.isStaff) { location.replace(location.pathname + '#/'); return; }
    UI().setCourseColor(null); UI().setNav('staff');
    const HT = LH.headTitle(); const cls = (window.Cloud && Cloud.enabled && Cloud.staffClasses) || null;
    if (window.Cloud && Cloud.enabled && Cloud.loadStaffClasses && !(Date.now() - (staffPage.at || 0) < 20000)) { staffPage.at = Date.now(); Cloud.loadStaffClasses().then(() => { if (/^#\/staff/.test(location.hash)) staffPage(); }).catch(e => console.warn('staff list', e && e.code || e)); }
    const of = (id, uid) => cls && cls[uid] ? cls[uid] : Sections.list.filter(s => (id === 'master' ? !s.teacherId : s.teacherId === id) && !s.archived).map(s => ({ name: s.name, course: s.courseId, term: s.term || '' }));
    const people = [].concat(Staff.master ? [{ p: Staff.master, id: 'master', uid: Staff.master.uid || 'master', role: HT }] : [], Staff.teachers.slice().sort((a, b) => String(a.name).localeCompare(String(b.name))).map(t => ({ p: t, id: t.id, uid: t.id, role: 'Teacher' })));
    app.innerHTML = UI().crumbs([{ label: UI().deskName(), href: '#/' }, { label: 'Staff' }]) +
      '<div class="page-head"><div><h1>Staff</h1><p class="muted">Who teaches at this school and the classes they have now. Names and classes only: nobody\'s students, marks or notes are shown here.</p></div></div>' +
      '<div class="teacher-cards">' + people.map(x => { const list = of(x.id, x.uid);
        return '<div class="card teacher-card static">' + UI().avatarHtml(x.p, 'who-avatar big') + '<span class="teacher-card-text"><strong>' + esc(x.p.name) + '</strong><span class="muted small">' + esc(x.role) + '</span>' +
          (list.length ? '<span class="staff-classes">' + list.slice(0, 12).map(s => '<span class="tag">' + esc(s.name) + (s.term ? ' · ' + esc(s.term) : '') + '</span>').join('') + '</span>' : '<span class="muted small">No classes listed</span>') + '</span></div>'; }).join('') + '</div>';
  }

  /* ---------- the student's "Next for you" ---------- */
  function nextFor(me) {
    const out = [];
    const secs = Sections.forStudent(me.id, false);
    const mine = (window.LearnHub.courses || []).filter(c => Students.enrolled(c.id) && !Students.isArchived(c.id));
    mine.forEach(course => { const sec = secs.find(s => s.courseId === course.id); const cid = sec ? sec.id : 'c~' + course.id;
      const prev = Settings.activeCourse; Settings.activeCourse = course.id;
      try {
        const prog = Progress.graded(me.id)[course.id] || {};
        if (sec) Marks.scheme(sec).tasks.filter(t => t.open && t.collect).forEach(t => { const w = Marks.taskWork(prog, t); if (!(w && w.done)) out.push({ rank: 1, label: Marks.TASK_NAME[t.kind] + ': ' + t.title, sub: sec.name, href: '#/class/' + sec.id + '/task/' + t.id, verb: w && w.text ? 'Continue' : 'Start' }); });
        const its = Marks.items(course);
        its.filter(it => it.kind === 'work' && studentState(null, it, prog) === 'draft').slice(0, 2).forEach(it => out.push({ rank: 2, label: 'Finish: ' + it.title, sub: course.title, href: hrefOf({ course }, it), verb: 'Continue' }));
        let found = false;
        unitsFor(course).some(unit => lessonsFor(unit).some((les, i) => { if (UI().lessonStatus(course, unit, les).complete) return false; out.push({ rank: 3, label: 'Lesson ' + (i + 1) + ': ' + L(les.title), sub: (sec ? sec.name : course.title) + ' · ' + L(unit.title), href: '#/lesson/' + course.id + '/' + unit.id + '/' + les._idx, verb: UI().courseProgress(course) ? 'Continue' : 'Start' }); found = true; return true; }));
      } catch (e) { console.warn('next for you', e); }
      Settings.activeCourse = prev; });
    out.sort((a, b) => a.rank - b.rank);
    const pick = out.slice(0, 3); if (!pick.length) return '';
    return '<section class="next-strip" aria-label="Next for you"><h2>Next for you</h2><div class="next-items">' + pick.map(x => '<a class="next-item" href="' + esc(x.href) + '"><span class="next-text"><strong>' + esc(x.label) + '</strong><span class="muted small">' + esc(x.sub) + '</span></span><span class="btn sm">' + x.verb + ' →</span></a>').join('') + '</div></section>';
  }

  /* ---------- router ---------- */
  function route() { window.dispatchEvent(new HashChangeEvent('hashchange')); }
  function page(parts) {
    // v69: courses are loaded from files and can be removed; a class whose course is not loaded says so (its work and marks are kept)
    const sec0 = Sections.byId(parts[1]), me0 = Students.current;
    if (sec0 && me0 && !UI().findCourseAll(sec0.courseId) && (me0.isStaff ? (Staff.isMaster || sec0.teacherId === me0.staffId) : (sec0.students || []).includes(me0.id))) {
      UI().setCourseColor(null); UI().setNav('classes');
      app.innerHTML = UI().crumbs([{ label: UI().deskName(), href: '#/' }, { label: sec0.name }]) + '<div class="empty"><h2>The course for this class is not loaded</h2><p class="muted">' + esc(sec0.name) + ' uses the course <strong>' + esc(String(sec0.courseId || '').toUpperCase()) + '</strong>, which is not in Summitide Learning right now. Nothing is lost: the class list, the work and the marks are kept and come back as soon as the course file is loaded again.</p>' +
        (me0.role === 'master' ? '<a class="btn" href="#/courses">Load the course file</a>' : '<p class="muted small">' + (me0.isStaff ? 'Ask the ' + esc(LH.headTitle()) + ' to load it under Courses.' : 'Tell your teacher.') + '</p><a class="btn secondary" href="#/">Back to the desk</a>') + '</div>';
      return;
    }
    const c = ctx(parts[1]); if (!c) return gone();
    const area = parts[2] || '';
    try {
      if (!area) return hub(c);
      if (area === 'content') { location.replace(location.pathname + '#/course/' + c.course.id); return; }
      if (KIND_OF[area]) return list(c, area);
      if (area === 'ccts' || area === 'exams') return tasks(c, area);
      if (area === 'task') return task(c, parts[3]);
      if (area === 'grades') return grades(c);
      if (area === 'scheme') return schemePage(c);
      if (area === 'students' && c.staff) return UI().studentsPage();
      return hub(c);
    } catch (e) { console.error(e); app.innerHTML = '<div class="empty">This page could not be drawn: ' + esc(e && e.message || e) + '</div>'; }
  }

  /** v75 · the slim banner for a course page that is being read through a class. */
  function bannerFor(course) { const me = Students.current; if (!me || !window.Banner) return ''; const sec = LH.overlaySection(course.id); if (!sec) return ''; setTimeout(() => Banner.load(sec.id), 0); return Banner.html(sec, { title: sec.name }); }
  window.Classes = { bannerFor, page, ctx, trail, myClasses, teachersPage, teacherPage, staffPage, classCard, finalHtml, nextFor, AREAS };
})();
