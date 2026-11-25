/* =========================================================
   marks.js — v68: how a class's final mark is worked out.
   Each class (section) carries its own mark scheme:
     sec.marks = { v: 1, showFinal: bool,
       cats:  [ { id, name, weight, from: ['quiz' | 'work' | 'test'…], kind: '' | 'cct' | 'exam' } ],
       map:   { [itemKey]: categoryId },          // one quiz, assignment or test moved to another category
       tasks: [ { id, kind: 'cct' | 'exam' | 'mark', title, cat, max, collect, prompt, open, createdAt } ] }
   The scheme lives on the class record, which only its teacher (and the Headmaster) can write and which the
   students of the class can read, so a student's own app can show the same final mark once the teacher reveals it.
   Marks a teacher types (CCT, exam, any other column) and "No Mark" sit in the teacher's grade record
   (grades/<student>__<course>), which a student can read and never write:
     grades[course]._marks[taskId].m = { score, max, note, nm, by, at }
     grades[course][unit][lesson][n | 'q'] / [unit].test.t  may carry  nm: true
   What a student writes for a CCT or exam that is collected in the app sits with the rest of their work:
     progress[course]._tasks.work[taskId][0] = { text, done, at }
   ========================================================= */
(function () {
  const { unitsFor, lessonsFor, assignmentsFor, lessonQuestions, quizHidden, testHidden, L } = window.LH;
  const TASKS = '_tasks', MARKS = '_marks';
  const newId = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const clampW = v => Math.max(0, Math.min(100, Math.round((+v || 0) * 10) / 10));
  const line = (v, n) => String(v === undefined || v === null ? '' : v).replace(/[<>]/g, '').trim().slice(0, n);
  const KIND_NAME = { quiz: 'Quizzes', work: 'Assignments', test: 'Unit tests' };
  const TASK_NAME = { cct: 'CCT', exam: 'Exam', mark: 'Mark' };

  function fresh() {
    return { v: 1, showFinal: false, map: {}, tasks: [], cats: [
      { id: 'work', name: 'Course work', weight: 70, from: ['quiz', 'work', 'test'], kind: '' },
      { id: 'cct', name: 'CCT', weight: 15, from: [], kind: 'cct' },
      { id: 'exam', name: 'Exam', weight: 15, from: [], kind: 'exam' }] };
  }
  /** The class's scheme, tidied. A class that has never been set up gets the starting scheme (70 / 15 / 15); nothing is saved until the teacher changes something. */
  const fresh1 = sec => (sec && sec.id && window.Sections && Sections.byId(sec.id)) || sec;   // the class as it is now: a page may hold a copy from before the cloud refreshed the list
  function scheme(sec) {
    sec = fresh1(sec);
    const m = sec && sec.marks && typeof sec.marks === 'object' && Array.isArray(sec.marks.cats) ? JSON.parse(JSON.stringify(sec.marks)) : fresh();
    m.cats = m.cats.filter(c => c && c.id).slice(0, 12).map(c => ({ id: String(c.id), name: line(c.name, 40) || 'Category', weight: clampW(c.weight), from: (Array.isArray(c.from) ? c.from : []).filter(k => KIND_NAME[k]), kind: c.kind === 'cct' || c.kind === 'exam' ? c.kind : '' }));
    m.map = m.map && typeof m.map === 'object' ? m.map : {};
    m.tasks = (Array.isArray(m.tasks) ? m.tasks : []).filter(t => t && t.id).slice(0, 40).map(t => ({ id: String(t.id), kind: TASK_NAME[t.kind] ? t.kind : 'mark', title: line(t.title, 80) || 'Untitled', cat: String(t.cat || ''), max: Math.max(1, Math.min(1000, +t.max || 100)), collect: !!t.collect, prompt: String(t.prompt || '').slice(0, 4000), open: t.open !== false, createdAt: t.createdAt || '' }));
    m.showFinal = !!m.showFinal; m.v = 1;
    return m;
  }
  function save(sec, m) { Sections.update(sec.id, { marks: m }); }
  const total = m => Math.round(m.cats.reduce((n, c) => n + c.weight, 0) * 10) / 10;
  /** Which kinds of work no category collects (so the teacher can be told they are not counting). */
  const unclaimed = m => Object.keys(KIND_NAME).filter(k => !m.cats.some(c => c.from.includes(k)));

  /* ---------- the built-in work of a course, as the class sees it ---------- */
  const key = it => it.kind === 'test' ? it.unit.id + ':t' : it.kind === 'quiz' ? it.unit.id + '/' + it.l + ':q' : it.unit.id + '/' + it.l + '/' + it.n;
  /** Every quiz, assignment and unit test of the course, in teaching order. `withHidden` adds the ones this class has hidden (marked hidden: true).
      For a teacher this reads the course through the class they are working in; for a student, through their own class. */
  function items(course, withHidden) {
    const out = [];
    unitsFor(course).forEach(unit => { const ui = course.units.indexOf(unit);
      lessonsFor(unit).forEach((les, li) => {
        const hasQ = lessonQuestions(unit, les._idx, undefined, undefined, true).length > 0, qh = hasQ && quizHidden(unit, les._idx);
        if (hasQ && (withHidden || !qh)) out.push({ kind: 'quiz', unit, ui, l: les._idx, li, title: L(les.title), label: 'Lesson ' + (li + 1) + ' quiz', hidden: qh });
        assignmentsFor(les).forEach((a, k) => out.push({ kind: 'work', unit, ui, l: les._idx, li, n: a._idx, title: L(a.title), label: 'Lesson ' + (li + 1) + ' · assignment ' + (k + 1), added: !!a._added }));
        if (withHidden) (les.assignments || []).forEach((a, i) => { const o = les._ov && les._ov.assignments && les._ov.assignments[i]; if (o && o.hidden) out.push({ kind: 'work', unit, ui, l: les._idx, li, n: i, title: L(o.title || a.title), label: 'Lesson ' + (li + 1) + ' · assignment', hidden: true }); });
      });
      const th = testHidden(unit); if (withHidden || !th) out.push({ kind: 'test', unit, ui, title: L(unit.title), label: 'Unit ' + (ui + 1) + ' test', hidden: th });
    });
    out.forEach(it => { it.key = key(it); });
    return out;
  }
  /** The category an item counts in: its own choice if the teacher made one, otherwise the category that collects its kind. '' = not counted. */
  function catOf(m, it) {
    const own = m.map[it.key]; if (own === '-') return '';
    if (own && m.cats.some(c => c.id === own)) return own;
    const c = m.cats.find(c => c.from.includes(it.kind)); return c ? c.id : '';
  }
  /** Hide or show one item for the whole class (kept with the class's other customisations). */
  function setHidden(sec, course, it, on) {
    sec = fresh1(sec);
    sec.overlay = sec.overlay || {}; const c = sec.overlay[course.id] = sec.overlay[course.id] || {};
    const u = c[it.unit.id] = c[it.unit.id] || { lessonOrder: null, lessons: {}, customLessons: [], questions: { hidden: [], edited: {}, added: [] }, terms: { hidden: [], added: [] } };
    u.lessons = u.lessons || {};
    if (it.kind === 'test') { if (on) u.noTest = true; else delete u.noTest; }
    else { const lo = u.lessons[it.l] = u.lessons[it.l] || {};
      if (it.kind === 'quiz') { if (on) lo.noQuiz = true; else delete lo.noQuiz; }
      else { lo.assignments = lo.assignments || {}; const a = lo.assignments[it.n] = lo.assignments[it.n] || {}; if (on) a.hidden = true; else { delete a.hidden; if (!Object.keys(a).length) delete lo.assignments[it.n]; } } }
    Sections.save();
  }

  /* ---------- one student's marks ---------- */
  const isNM = g => !!(g && g.nm);
  /** { grade: 0–100 | null, nm } for a built-in item, from the student's work with the teacher's record laid over it. */
  function itemGrade(it, u, fallback) {
    const D = window.Dashboard; u = u || {}; const marks = u.marks || {};
    if (it.kind === 'work') { const w = ((u.work || {})[it.l] || {})[it.n]; if (w && isNM(w.grade)) return { grade: null, nm: true };
      const lg = w ? Grading.assignment(Object.assign({}, w, { level: w.level || (w.grade && w.grade.level) || fallback })) : null; return { grade: lg ? lg.grade : null, nm: false }; }
    const mark = marks[it.kind === 'test' ? 'test:t' : it.l + ':q']; if (isNM(mark)) return { grade: null, nm: true };
    const g = D.gradeOf(D.over(it.kind === 'test' ? D.testRec(u) : (u.quiz || {})[it.l], mark), fallback);
    return { grade: g ? g.grade : null, nm: false };
  }
  /** A typed mark (CCT, exam, other column): the percentage is the mark, with no levelling. */
  function taskMark(prog, task) { return (((prog || {})[MARKS] || {}).marks || {})[task.id + ':m'] || null; }
  function taskGrade(prog, task) {
    const g = taskMark(prog, task); if (isNM(g)) return { grade: null, nm: true };
    if (!g || g.score === undefined || g.score === null || isNaN(+g.score)) return { grade: null, nm: false };
    return { grade: Math.max(0, Math.min(100, Math.round(+g.score / (+g.max || task.max || 100) * 100))), nm: false };
  }
  function taskWork(prog, task) { return ((((prog || {})[TASKS] || {}).work || {})[task.id] || {})[0] || null; }
  const mean = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  /** The whole picture for one student in one class:
      { cats: [ { id, name, weight, avg, n, nm } ], final, exact, counted, total }
      A category with no marks yet is left out and the others are scaled up, so the final mark always reads out of 100. */
  function summary(sec, course, student, m, its) {
    m = m || scheme(sec); its = its || items(course);
    const prog = Progress.graded(student.id)[course.id] || {}; const fb = Students.levelFor(course.id, student) || 2;
    const per = {}; m.cats.forEach(c => { per[c.id] = { g: [], nm: 0 }; });
    const put = (cid, r) => { const p = per[cid]; if (!p) return; if (r.nm) p.nm++; else if (r.grade !== null) p.g.push(r.grade); };
    its.forEach(it => put(catOf(m, it), itemGrade(it, prog[it.unit.id], fb)));
    m.tasks.forEach(t => put(t.cat, taskGrade(prog, t)));
    const cats = m.cats.map(c => { const a = mean(per[c.id].g); return { id: c.id, name: c.name, weight: c.weight, avg: a === null ? null : Math.round(a * 10) / 10, n: per[c.id].g.length, nm: per[c.id].nm }; });
    const live = cats.filter(c => c.avg !== null && c.weight > 0); const w = live.reduce((n, c) => n + c.weight, 0);
    const exact = w ? live.reduce((n, c) => n + c.avg * c.weight, 0) / w : null;
    return { cats, exact, final: exact === null ? null : Math.round(exact), counted: Math.round(w * 10) / 10, total: total(m) };
  }
  /** A student's own class for a course (the one whose scheme applies to them). */
  function classFor(courseId, studentId) { const all = Sections.forStudent(studentId, true).filter(x => x.courseId === courseId); return all.find(x => !x.archived) || all[0] || null; }

  window.Marks = { TASKS, MARKS, KIND_NAME, TASK_NAME, newId, fresh, scheme, save, total, unclaimed, items, key, catOf, setHidden, itemGrade, taskMark, taskGrade, taskWork, summary, classFor, isNM, line };
})();
