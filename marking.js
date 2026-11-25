/* =========================================================
   marking.js — the marking screen (v56)
   A teacher picks ONE item (a lesson quiz, an assignment or the unit test)
   and goes through the whole class on a single screen: each student's
   submission, a score and a comment, and a Save button on every card.

     #/mark/<course>/<unit>/quiz/<lesson>
     #/mark/<course>/<unit>/work/<lesson>/<assignment>
     #/mark/<course>/<unit>/test

   Everything saved here goes to the teacher's own grades record
   (Progress.setGrade → grades/<student>__<course> in the cloud), which a
   student can read but never write. The student sees the mark and the
   comment under Grades.
     assignment  →  [lesson][n]      { score, max, note, by, at }
     lesson quiz →  [lesson]['q']    { score, level, note, by, at }
     unit test   →  ['test']['t']    { score, level, note, by, at }
   Quizzes and tests are marked by the app. The teacher reads the answers,
   may leave a comment, and may set the score by hand: { score (0–100 %),
   level } then replaces the app's mark for that student wherever a grade
   is shown. Clearing the box returns to the app's mark.
   ========================================================= */
(function () {
  const { esc, L, assignmentsFor, lessonQuestions, LEVEL_NAMES, reviewList, lessonsFor, testHidden } = window.LH;
  const awayFmt = s => { s = Math.round(s || 0); return s < 60 ? s + ' s' : Math.floor(s / 60) + ' min' + (s % 60 ? ' ' + (s % 60) + ' s' : ''); };
  const app = document.getElementById('app');
  const MAX = 10;
  const by = () => (Staff.current || {}).name || 'teacher';
  const when = iso => { try { return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; } };
  const BANDS = { k2: 'K–2', g35: 'Grades 3–5', g68: 'Grades 6–8' };
  const STATE = { none: 'Nothing yet', draft: 'Draft', todo: 'To mark', done: 'Marked' };

  /** The class being marked: the working section, or every student this teacher has. */
  function roster(staff) {
    const cur = Sections.currentFor(staff.id);
    if (cur) return { cur, students: Students.list.filter(s => (cur.students || []).includes(s.id)) };
    const ids = new Set();
    if (Staff.isMaster) Students.list.forEach(s => ids.add(s.id)); else Sections.visible(staff.id, true).forEach(sec => (sec.students || []).forEach(id => ids.add(id)));
    return { cur: null, students: Students.list.filter(s => ids.has(s.id)) };
  }
  /** Every markable item of a unit, in teaching order. */
  function unitItems(unit) {
    const out = [];
    // v68: through the class in force, so anything the teacher has hidden for the class is not offered for marking
    (unit.__courseId ? lessonsFor(unit) : unit.lessons.map((l, i) => Object.assign({ _idx: i }, l))).forEach((les, p) => { const i = les._idx;
      if (lessonQuestions(unit, i).length) out.push({ kind: 'quiz', l: i, label: 'Lesson ' + (p + 1) + ' quiz', title: L(les.title) });
      assignmentsFor(les).forEach((a, k) => out.push({ kind: 'work', l: i, n: a._idx, label: 'Lesson ' + (p + 1) + ' · assignment ' + (k + 1), title: L(a.title), a }));
    });
    if (!testHidden(unit)) out.push({ kind: 'test', label: 'Unit test', title: L(unit.title) });
    return out;
  }
  const href = (c, u, it) => '#/mark/' + encodeURIComponent(c.id) + '/' + encodeURIComponent(u.id) + '/' + it.kind + (it.kind === 'test' ? '' : '/' + it.l + (it.kind === 'work' ? '/' + it.n : ''));
  const same = (a, b) => a.kind === b.kind && String(a.l) === String(b.l) && String(a.n) === String(b.n);

  function levelTag(course, s) {
    const t = Students.trackFor(course.id, s);
    if (t) return '<span class="tag">Modified · ' + esc(BANDS[t.band] || t.band) + '</span>';
    const lv = Students.levelFor(course.id, s);
    return '<span class="tag lv lv' + lv + '">Level ' + lv + ' · ' + esc(LEVEL_NAMES[lv]) + '</span>';
  }
  function gradePreview(score, max, lv) {
    if (score === '' || score === null || score === undefined || isNaN(+score)) return '<span class="muted">Level ' + lv + ' · ' + esc(LEVEL_NAMES[lv]) + '</span>';
    const raw = Math.round(+score / max * 100);
    return '→ grade <strong>' + Grading.levelled(raw, lv) + '</strong> <span class="muted">(' + raw + '% at Level ' + lv + ' · ' + esc(LEVEL_NAMES[lv]) + ')</span>';
  }

  /** One student's card for the item. Returns { state, html }. */
  function card(course, unit, it, s) {
    const u = (Progress.graded(s.id)[course.id] || {})[unit.id] || {};
    const fallback = Students.levelFor(course.id, s) || 2;
    let state, sub, body, tools;
    const nmBox = g => '<label class="mark-nm"><input type="checkbox" data-nm' + (g && g.nm ? ' checked' : '') + '> <span><strong>No Mark</strong> <span class="muted">· leave this out of ' + esc(s.name) + '\'s grade</span></span></label>';
    const noteBox = (note, label) => '<label class="mark-field mark-note"><span>' + label + '</span><textarea class="text-input" rows="2" data-note placeholder="The student sees this under Grades">' + esc(note || '') + '</textarea></label>';
    if (it.kind === 'work') {
      const w = ((u.work || {})[it.l] || {})[it.n]; const g = (w && w.grade) || {};
      const has = !!(w && w.text); const marked = (g.score !== undefined && g.score !== null) || !!g.note || !!g.nm;
      const lv = (w && (w.level || g.level)) || fallback; const max = +g.max || MAX;
      sub = !has ? 'none' : w.done ? 'todo' : 'draft'; state = marked ? 'done' : sub;
      body = has
        ? '<div class="mark-meta">' + (w.done ? '✓ Handed in' + (w.at ? ' · ' + esc(when(w.at)) : '') : '✎ Draft — not handed in yet') + ' · written at Level ' + lv + ' · ' + esc(LEVEL_NAMES[lv]) + '</div><div class="mark-text">' + esc(w.text) + '</div>'
        : '<p class="muted mark-empty">Nothing written yet.</p>';
      tools = '<label class="mark-field mark-score"><span>Score</span><span class="grade-box"><input class="text-input" type="number" min="0" max="' + max + '" step="0.5" data-score data-max="' + max + '" data-lv="' + lv + '" value="' + (g.score !== undefined && g.score !== null ? esc(g.score) : '') + '" placeholder="–"><span class="grade-max">/' + max + '</span></span><span class="mark-grade" data-preview>' + gradePreview(g.score, max, lv) + '</span></label>' +
        noteBox(g.note, 'Comment') + nmBox(g);
    } else {
      const rec = it.kind === 'test' ? Dashboard.testRec(u) : (u.quiz || {})[it.l];
      const mark = (u.marks || {})[it.kind === 'test' ? 'test:t' : it.l + ':q'] || {};
      const g = Dashboard.gradeOf(rec, fallback);                                    // the app's own mark
      const set = mark.score !== undefined && mark.score !== null && !isNaN(+mark.score);
      const lv = (set && +mark.level) || (g && g.level) || fallback;                   // a hand-set score is graded at the level the work was done
      sub = !g ? 'none' : 'todo'; state = mark.note || set || mark.nm ? 'done' : sub;
      if (!g) body = '<p class="muted mark-empty">Not attempted in the app yet.' + (set ? '' : ' If it was written on paper, type the score below.') + '</p>';
      else {
        const levels = Object.keys(rec.levels || {}).sort();
        body = '<div class="mark-meta">The app\'s mark: <strong>' + g.grade + '</strong> · ' + g.raw + '% at Level ' + g.level + ' · ' + esc(LEVEL_NAMES[g.level] || '') + '</div>' +
          (levels.length ? levels.map(l => { const r = rec.levels[l];
            return '<div class="mark-attempt"><div class="mark-meta">Level ' + l + ' · ' + esc(LEVEL_NAMES[l] || '') + ': best ' + (r.best || 0) + '% → grade ' + Grading.levelled(r.best || 0, +l) + ' · ' + (r.attempts || 0) + ' attempt' + (r.attempts === 1 ? '' : 's') + '</div>' +
              (r.last ? reviewList(r.last.items, true, 'Latest attempt' + (r.last.at ? ' · ' + when(r.last.at) : '') + ' · ' + r.last.pct + '%' + (r.last.away ? (r.last.away.count ? ' · Focus Mode: left the app ' + r.last.away.count + '× (' + awayFmt(r.last.away.secs) + ')' : ' · Focus Mode: stayed in the app') : '')) : '<p class="muted small">Answers were not recorded for attempts made before version 56.</p>') + '</div>'; }).join('')
            : '<p class="muted small">Answers were not recorded for attempts made before version 56.</p>');
      }
      if (set) body = '<div class="mark-meta mark-over">✎ Score set by ' + esc(mark.by || 'the teacher') + ': <strong>' + esc(mark.score) + '%</strong> → grade <strong>' + Grading.levelled(+mark.score, lv) + '</strong>. This replaces the app\'s mark.</div>' + body;
      tools = '<label class="mark-field mark-score"><span>Set the score by hand <span class="muted">(optional)</span></span><span class="grade-box"><input class="text-input" type="number" min="0" max="100" step="1" data-score data-max="100" data-lv="' + lv + '" value="' + (set ? esc(mark.score) : '') + '" placeholder="' + (g ? g.raw : '–') + '" title="Leave empty to keep the app\'s mark"><span class="grade-max">%</span></span><span class="mark-grade" data-preview>' + (set ? gradePreview(mark.score, 100, lv) : '<span class="muted">empty = the app\'s mark</span>') + '</span></label>' +
        noteBox(mark.note, 'Comment on this ' + (it.kind === 'test' ? 'test' : 'quiz')) + nmBox(mark);
    }
    return { state, html: '<article class="mark-card" id="mark-' + esc(s.id) + '" data-sid="' + esc(s.id) + '" data-sub="' + sub + '" data-state="' + state + '">' +
      '<header class="mark-head"><span class="mark-who">' + esc(s.name) + (s.number ? ' <span class="muted small">#' + esc(s.number) + '</span>' : '') + '</span>' + levelTag(course, s) + '<span class="tag mark-state" data-state-tag>' + STATE[state] + '</span></header>' +
      '<div class="mark-body">' + body + '</div>' +
      '<div class="mark-tools">' + tools + '<div class="mark-save"><button class="btn" type="button" data-save>Save</button><span class="mark-status small muted" data-status aria-live="polite"></span></div></div></article>' };
  }

  function page(parts) {
    if (Settings.locked || !Staff.master) { location.hash = '#/settings'; return; }
    const course = (window.LearnHub.courses || []).find(c => c.id === parts[0]); if (course) window.LH.unitsFor(course); const unit = course && course.units.find(u => u.id === parts[1]);
    const kind = parts[2];
    if (!unit || !/^(quiz|work|test)$/.test(kind || '')) { location.hash = '#/dashboard'; return; }
    document.documentElement.style.setProperty('--course', 'var(--primary)');
    Settings.activeCourse = course.id;
    const items = unitItems(unit);
    const want = { kind, l: kind === 'test' ? undefined : +parts[3] || 0, n: kind === 'work' ? +parts[4] || 0 : undefined };
    const at = items.findIndex(x => same(x, want)); const it = items[at];
    if (!it) { location.hash = '#/dashboard'; return; }
    const staff = Staff.current; const { cur, students } = roster(staff);
    const cards = students.map(s => Object.assign({ s }, card(course, unit, it, s)));
    const count = st => cards.filter(c => c.state === st).length;
    const filter = sessionStorage.getItem('learnhub.markFilter') || 'all';
    const prev = items[at - 1], next = items[at + 1];
    const ui = course.units.indexOf(unit);

    app.innerHTML =
      '<div class="page-head"><div><span class="tag">' + esc(course.title) + ' · ' + (/^unit\s*\d/i.test(unit.title) ? '' : 'Unit ' + (ui + 1) + ' · ') + esc(L(unit.title)) + '</span>' +
      '<h1 style="margin-top:0.4rem">' + esc(it.label) + '</h1><p class="muted">' + (it.kind === 'test' ? 'Every lesson in the unit' : esc(it.title)) + ' · ' + (cur ? esc(cur.name) : (Staff.isMaster ? 'All students' : 'All my students')) + ' · ' + students.length + ' student' + (students.length === 1 ? '' : 's') + '</p></div>' +
      '<div class="btn-row">' + (cur ? '<a class="btn ghost" href="#/class/' + esc(cur.id) + '">← ' + esc(cur.name) + '</a>' : '') + '<a class="btn ghost" href="#/dashboard">Grades grid</a></div></div>' +
      '<div class="mark-bar card"><div class="btn-row between">' +
        '<div class="btn-row">' + (prev ? '<a class="btn secondary sm" href="' + href(course, unit, prev) + '" title="' + esc(prev.label) + '">← ' + esc(prev.label) + '</a>' : '') +
          '<select class="text-input" id="markItem" style="max-width:300px" aria-label="Item to mark">' + items.map((x, i) => '<option value="' + i + '"' + (i === at ? ' selected' : '') + '>' + esc(x.label) + (x.kind === 'work' ? ' — ' + esc(x.title) : '') + '</option>').join('') + '</select>' +
          (next ? '<a class="btn secondary sm" href="' + href(course, unit, next) + '" title="' + esc(next.label) + '">' + esc(next.label) + ' →</a>' : '') + '</div>' +
        '<label class="small">Show <select class="text-input" id="markFilter" style="width:auto"><option value="all">everyone (' + cards.length + ')</option><option value="todo">to mark (' + count('todo') + ')</option><option value="done">marked (' + count('done') + ')</option><option value="open">not handed in (' + (count('none') + count('draft')) + ')</option></select></label></div>' +
        (it.kind === 'work' && it.a ? '<details class="mark-task"><summary>The task</summary><div class="small">' + esc(L(it.a.prompt) || '') + (it.a.success ? '<p><strong>A complete answer contains:</strong> ' + esc(L(it.a.success)) + '</p>' : '') + (it.a.expectations ? '<p class="muted">Expectations: ' + esc(it.a.expectations) + '</p>' : '') + '</div></details>' : '') +
        (it.kind !== 'work' ? '<p class="small muted" style="margin:0.6rem 0 0">Quizzes and tests are marked by the app. You see each answer and whether it was right; the student sees only which questions were wrong. To change a mark, type the score (%) by hand: it is graded at the level the work was done and replaces the app\'s mark. <strong>No Mark</strong> leaves the item out of that student\'s grade. Each card saves on its own.</p>' : '<p class="small muted" style="margin:0.6rem 0 0">Type a score out of ' + MAX + '. The grade is worked out at the level the work was written at. <strong>No Mark</strong> leaves the item out of that student\'s grade, so it does not count against them. Each card saves on its own.</p>') +
        '<nav class="mark-jump" aria-label="Students">' + cards.map(c => '<button type="button" class="mark-chip" data-jump="' + esc(c.s.id) + '" data-state="' + c.state + '" title="' + esc(c.s.name) + ' — ' + STATE[c.state] + '">' + esc(c.s.avatar && Students.avatarAllowed(c.s.avatar, false) ? c.s.avatar : '') + ' ' + esc(c.s.name) + '</button>').join('') + '</nav></div>' +
      (cards.length ? '<div class="mark-list" data-filter="' + esc(filter) + '">' + cards.map(c => c.html).join('') + '</div><p class="muted small center mark-none" hidden>No students match this filter.</p>' : '<div class="empty">No students in this class yet.</div>');
    Settings.activeCourse = null;

    const list = app.querySelector('.mark-list');
    const applyFilter = v => { if (!list) return; list.dataset.filter = v; let shown = 0;
      list.querySelectorAll('.mark-card').forEach(c => { const st = c.dataset.state; const ok = v === 'all' || (v === 'open' ? (st === 'none' || st === 'draft') : st === v); c.hidden = !ok; if (ok) shown++; });
      const none = app.querySelector('.mark-none'); if (none) none.hidden = shown > 0; };
    const fSel = app.querySelector('#markFilter'); fSel.value = /^(all|todo|done|open)$/.test(filter) ? filter : 'all'; applyFilter(fSel.value);
    fSel.addEventListener('change', () => { sessionStorage.setItem('learnhub.markFilter', fSel.value); applyFilter(fSel.value); });
    app.querySelector('#markItem').addEventListener('change', e => { location.hash = href(course, unit, items[+e.target.value]); });
    app.querySelectorAll('[data-jump]').forEach(b => b.addEventListener('click', () => { const c = document.getElementById('mark-' + b.dataset.jump); if (!c) return; if (c.hidden) { fSel.value = 'all'; applyFilter('all'); } c.scrollIntoView({ behavior: 'smooth', block: 'start' }); const f = c.querySelector('[data-score], [data-note]'); if (f) f.focus({ preventScroll: true }); }));

    app.querySelectorAll('.mark-card').forEach(cardEl => {
      const sid = cardEl.dataset.sid, status = cardEl.querySelector('[data-status]');
      const score = cardEl.querySelector('[data-score]'), note = cardEl.querySelector('[data-note]'), preview = cardEl.querySelector('[data-preview]');
      const dirty = () => { status.textContent = 'Not saved yet'; status.classList.add('unsaved'); if (score && preview) preview.innerHTML = score.value.trim() === '' && it.kind !== 'work' ? '<span class="muted">empty = the app\'s mark</span>' : gradePreview(score.value.trim(), +score.dataset.max, +score.dataset.lv); };
      const nmEl = cardEl.querySelector('[data-nm]'); const nm = () => !!(nmEl && nmEl.checked);
      [score, note].forEach(el => el && el.addEventListener('input', dirty)); if (nmEl) nmEl.addEventListener('change', dirty);
      cardEl.querySelector('[data-save]').addEventListener('click', () => {
        const text = note.value.trim(); let state;
        if (it.kind === 'work') {
          const raw = score.value.trim(), max = +score.dataset.max;
          if (raw !== '' && (isNaN(+raw) || +raw < 0 || +raw > max)) { status.textContent = 'Type a score from 0 to ' + max + '.'; status.classList.add('unsaved'); score.focus(); return; }
          if (raw === '' && !text && !nm()) Progress.setGrade(sid, course.id, unit.id, it.l, it.n, null);
          else Progress.setGrade(sid, course.id, unit.id, it.l, it.n, { score: raw === '' ? null : +raw, max, level: +score.dataset.lv, note: text, nm: nm(), by: by() });
          state = raw !== '' || text || nm() ? 'done' : cardEl.dataset.sub;
        } else {
          const key = it.kind === 'test' ? ['test', 't'] : [it.l, 'q'];
          const raw = score.value.trim();
          if (raw !== '' && (isNaN(+raw) || +raw < 0 || +raw > 100)) { status.textContent = 'Type a score from 0 to 100, or leave it empty.'; status.classList.add('unsaved'); score.focus(); return; }
          Progress.setGrade(sid, course.id, unit.id, key[0], key[1], null);            // replace the whole mark, so a cleared score really goes
          if (raw !== '' || text || nm()) Progress.setGrade(sid, course.id, unit.id, key[0], key[1], Object.assign({ note: text, by: by() }, nm() ? { nm: true } : {}, raw !== '' ? { score: +raw, level: +score.dataset.lv } : {}));
          state = raw !== '' || text || nm() ? 'done' : cardEl.dataset.sub;
        }
        cardEl.dataset.state = state; cardEl.querySelector('[data-state-tag]').textContent = STATE[state];
        const chip = app.querySelector('[data-jump="' + (window.CSS && CSS.escape ? CSS.escape(sid) : sid) + '"]'); if (chip) chip.dataset.state = state;
        status.classList.remove('unsaved'); status.textContent = '✓ Saved ' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      });
    });
  }

  window.Marking = { page, unitItems };
})();
