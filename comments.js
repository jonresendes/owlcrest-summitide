/* =========================================================
   comments.js — v80: report card comments for a class.
   #/class/<id>/comments     the class's teacher (and the Headmaster): one card per student. The teacher picks a level
                             for test and assignment results, homework completion and engagement with the material;
                             the comment is written from those choices and can be reworded, edited by hand and copied.
   SUGGESTIONS  For each student the page works out a suggested level for each area from what Summitide already holds:
     results     the class mark so far (Marks.summary: the mark scheme's final mark), on the grade bands
     homework    assignments handed in, out of the assignments that have been set. "Set" means at least one student of
                 the class has handed it in or been given a mark for it, so a course that is half taught is judged on that half.
     engagement  slides read, out of the slides of the lessons the class has opened (at least one student has read one).
                 This is a weak hint: the app cannot see a classroom. The page says so beside it, and the two buttons
                 that fill levels in ("Use the suggested…", "Draft the unwritten ones") never fill this one in.
   A suggestion is a dot on a choice. Nothing is chosen and nothing is written until the teacher does it.
   WHERE THE COMMENTS ARE KEPT  With the teacher's own notes (Staff.notes → staffNotes/<uid> in the cloud), which only
   that teacher and the Headmaster can read and which students can never read:
     notes.comments[sectionId] = { course, limit, s: { [studentId]: { lv: { r, h, e }, pro, next, w, text, edited, at } } }
   No new collection and no change to firestore.rules. Storage.js keeps notes.comments when the sticky notes are saved.
   NOT DONE YET (see README, version 80): comments are not in the "copy of everything held about one student", and
   removing a student clears their comments from the notes of the person who removes them, not from other teachers' notes.
   ========================================================= */
(function () {
  /* ---------- COMMENT ENGINE (the same text in the standalone app and in Summitide's comments.js) ----------
     A teacher rates three things for each student, each at the four levels (1 Shore … 4 Summit, 0 = leave out):
       r = test and assignment results · h = homework completion · e = engagement with the course material
     build() turns those choices into one comment and a next step.
     Tokens in the bank: {name} first name · {his} / {His} possessive · {course} the course name, or "the course".
     No sentence uses he / she / they as its subject, so every pronoun choice (and "name only") reads correctly.
     Each level has four wordings: [0] and [2] begin with the student's name, [1] and [3] do not, so build() can
     alternate them and no two sentences in a row begin the same way. */
  const Engine = (function () {
    const DIMS = [
      { id: 'r', title: 'Test and assignment results', short: 'Results', words: ['Limited', 'Some', 'Considerable', 'Thorough'] },
      { id: 'h', title: 'Homework completion', short: 'Homework', words: ['Rarely', 'Sometimes', 'Usually', 'Consistently'] },
      { id: 'e', title: 'Engagement with the course material', short: 'Engagement', words: ['Rarely', 'Sometimes', 'Usually', 'Fully'] }
    ];
    const LEVEL_NAME = { 1: 'Shore', 2: 'Trail', 3: 'Ridge', 4: 'Summit' };
    const PRONOUNS = [['name', 'name only'], ['she', 'she / her'], ['he', 'he / his'], ['they', 'they / their']];
    const POSS = { she: 'her', he: 'his', they: 'their' };
    const BANK = {
      r: {
        4: ["{name} has earned excellent results on tests and assignments, showing a thorough understanding of the course material.",
            "{His} test and assignment results show a thorough understanding of the course material.",
            "{name} applies concepts accurately and with confidence, and it shows in strong test and assignment results.",
            "Results on tests and assignments in {course} show that {name} has a thorough grasp of the concepts."],
        3: ["{name} has earned solid results on tests and assignments, showing a considerable understanding of the course material.",
            "{His} test and assignment results show a considerable understanding of the course material.",
            "{name} applies most concepts accurately, and test and assignment results reflect a good understanding of the material.",
            "Results on tests and assignments in {course} show that {name} understands most of the material well."],
        2: ["{name} has earned passing results on tests and assignments, showing some understanding of the course material.",
            "{His} test and assignment results show some understanding of the course material, with gaps in a few areas.",
            "{name} applies familiar concepts with some accuracy and is still building confidence with newer material.",
            "Results on tests and assignments in {course} show that {name} understands the main ideas and is still building accuracy with the details."],
        1: ["{name} has found tests and assignments difficult this term, and results show a limited understanding of the course material so far.",
            "{His} test and assignment results show a limited understanding of the course material so far.",
            "{name} applies concepts with limited accuracy and needs more support with the core ideas of the course.",
            "Results on tests and assignments in {course} show that {name} needs more support with the core concepts."]
      },
      h: {
        4: ["{name} completes homework consistently and on time, and arrives prepared for each lesson.",
            "Homework is completed consistently and with care, which shows in {his} preparation for class.",
            "{name} hands in homework that is complete, careful and on time.",
            "Homework is reliably handed in on time, and {name} uses it to practise what was taught."],
        3: ["{name} completes most homework on time and is usually prepared for class.",
            "Homework is usually complete, and {name} comes to most lessons prepared.",
            "{name} usually hands in homework complete and on time.",
            "Most homework is handed in on time, which helps {name} keep up with new material."],
        2: ["{name} completes some homework, and the work is sometimes late or unfinished.",
            "Homework is completed some of the time, which leaves gaps in {his} preparation for class.",
            "{name} hands in homework inconsistently, and some tasks arrive late or incomplete.",
            "Some homework is handed in, and {name} would be better prepared for class if all of it were."],
        1: ["{name} rarely completes homework, and the missing work is limiting {his} progress.",
            "Homework is seldom completed, so {name} often begins a lesson without the practice it builds on.",
            "{name} has handed in little of the assigned homework this term.",
            "Little homework has been handed in this term, and the missing practice is holding back {his} progress."]
      },
      e: {
        4: ["{name} engages fully with the material, asks thoughtful questions and contributes to class discussion.",
            "In class, {name} is focused and involved, and often helps move the discussion forward.",
            "{name} takes an active part in every lesson and shows curiosity about the material.",
            "During lessons, {name} listens closely, asks thoughtful questions and shares ideas willingly."],
        3: ["{name} engages with the material in most lessons and takes part in class activities.",
            "In class, {name} follows lessons attentively and joins most discussions.",
            "{name} is usually focused in class and contributes when asked.",
            "During lessons, {name} is usually attentive and takes part in most activities."],
        2: ["{name} engages with the material in some lessons and benefits from reminders to stay on task.",
            "In class, {name} is attentive when a topic is of interest and is less involved at other times.",
            "{name} takes part in class activities some of the time.",
            "During lessons, {name} sometimes needs a reminder to stay with the task at hand."],
        1: ["{name} rarely engages with the material in class and needs frequent prompting to begin work.",
            "In class, {name} is often off task, which limits {his} learning.",
            "{name} has taken little part in lessons and class activities this term.",
            "During lessons, {name} needs frequent prompting to begin and to continue working."]
      }
    };
    const NEXT = {
      r: { 1: "attend extra help and rework test questions that went wrong until the method is clear",
           2: "review corrected tests and assignments and practise the question types that cost marks",
           3: "explain the reasoning behind each answer in more detail to reach the next level",
           4: "take on more challenging problems that apply the material in unfamiliar situations" },
      h: { 1: "complete and hand in every homework task, starting with the ones still outstanding",
           2: "set a regular time for homework so that tasks are finished and handed in on time",
           3: "check each homework task for completeness before handing it in",
           4: "keep up these homework habits and try the extension questions" },
      e: { 1: "begin work promptly and ask for help as soon as something is unclear",
           2: "take part in every lesson, including topics of less interest, and ask questions when unsure",
           3: "share ideas more often in class discussion",
           4: "keep contributing and support classmates during group work" }
    };
    const NEXT_LEAD = ["As a next step, {name} is encouraged to ", "Going forward, {name} should ", "A good next step for {name} is to "];
    const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

    /** Which area the next step is about: the one chosen, or (auto) the lowest-rated, results first on a tie. */
    function nextDim(lv, next) {
      if (next === 'none') return null;
      if (next && next !== 'auto') return lv[next] ? next : null;
      let d = null; DIMS.forEach(x => { if (lv[x.id] && (d === null || lv[x.id] < lv[d])) d = x.id; });
      return d;
    }
    /** The comment for one student.  s = { name, pro, lv: { r, h, e }, next, w }  ·  w = which wording (any whole number). */
    function build(s, courseName) {
      const name = String(s.name || '').trim() || 'The student', poss = POSS[s.pro] || null;
      const his = poss || name + "'s", His = poss ? cap(poss) : name + "'s";
      const course = String(courseName || '').trim() || 'the course';
      const w = Math.abs(Math.round(+s.w || 0)), lv = s.lv || {};
      const fill = t => t.replace(/\{His\}/g, His).replace(/\{his\}/g, his).replace(/\{name\}/g, name).replace(/\{course\}/g, course);
      const out = []; let prev = 0, prevNamed = false, however = false;
      DIMS.forEach((d, k) => {
        const l = lv[d.id]; if (!l) return;
        const first = !out.length, pick = ((w >> 1) + (first ? 0 : w & 1) + k) % 2;
        const lead = first ? w % 2 === 0 : !prevNamed;                         // alternate: a sentence that opens with the name, then one that does not
        let t = BANK[d.id][l][lead ? [0, 2][pick] : [1, 3][pick]];
        if (first && !/^\{His\}|\{name\}/.test(t)) t = BANK[d.id][l][[0, 2][pick]];   // the first sentence always names the student
        if (first) t = t.replace(/^\{His\}/, name + "'s");
        prevNamed = /^\{name\}/.test(t) || t.indexOf(name + "'s") === 0;
        if (!first && !however && Math.abs(l - prev) >= 2) {                    // one sharp change between two areas reads better with "However"
          however = true;
          t = 'However, ' + (/^\{name\}/.test(t) ? t : /^\{His\}/.test(t) ? t.replace(/^\{His\}/, '{his}') : t.charAt(0).toLowerCase() + t.slice(1));
        }
        out.push(fill(t)); prev = l;
      });
      const nd = out.length ? nextDim(lv, s.next) : null;
      if (nd) out.push(fill(NEXT_LEAD[w % NEXT_LEAD.length]) + NEXT[nd][lv[nd]] + '.');
      return out.join(' ');
    }

    /** Suggested levels from records.  sig = { handedIn, assigned, average (0–100 or null), slidesRead (0–100 or null) } */
    function suggest(sig) {
      if (!sig) return null;
      const ratio = sig.assigned ? sig.handedIn / sig.assigned : null, a = sig.average, sl = sig.slidesRead;
      return {
        h: ratio === null ? 0 : ratio >= 0.9 ? 4 : ratio >= 0.7 ? 3 : ratio >= 0.5 ? 2 : 1,
        r: a === null || a === undefined ? 0 : a >= 80 ? 4 : a >= 70 ? 3 : a >= 60 ? 2 : 1,                 // Summitide's grade bands
        e: sl === null || sl === undefined ? 0 : sl >= 85 ? 4 : sl >= 65 ? 3 : sl >= 40 ? 2 : 1
      };
    }
    function signalText(d, sig) {
      if (!sig) return '';
      if (d === 'h') return sig.assigned ? sig.handedIn + ' of ' + sig.assigned + ' assignments handed in' : 'No assignments set yet';
      if (d === 'r') return sig.average === null || sig.average === undefined ? 'No marks yet' : 'Class mark so far: ' + sig.average + '%';
      return sig.slidesRead === null || sig.slidesRead === undefined ? 'No lessons opened yet' : sig.slidesRead + '% of lesson slides read in the app. A hint only: choose this from what you see in class.';
    }
    return { DIMS, LEVEL_NAME, PRONOUNS, BANK, NEXT, build, suggest, signalText, nextDim };
  })();
  const { esc, unitsFor, lessonsFor, slidesFor, unitHidden } = window.LH;
  const { DIMS, LEVEL_NAME, PRONOUNS } = Engine;
  const app = document.getElementById('app');
  const UI = () => window.AppUI;
  const LIMIT_MAX = 5000, NAME_MAX = 60;
  const plural = (n, w) => n + ' ' + (n === 1 ? w : w + 's');
  const firstName = s => String(s.name || '').trim().split(/\s+/)[0] || 'The student';
  let openId = null, openSec = null;

  /* ---------- the store: inside the teacher's own notes ---------- */
  const everything = () => { const n = Staff.notes; return n && n.comments && typeof n.comments === 'object' ? n.comments : {}; };
  function load(secId) {
    const r = everything()[secId]; const rec = r && typeof r === 'object' ? JSON.parse(JSON.stringify(r)) : {};
    rec.s = rec.s && typeof rec.s === 'object' ? rec.s : {}; rec.limit = Math.max(0, Math.min(LIMIT_MAX, Math.round(+rec.limit || 0))); rec.course = String(rec.course || '').slice(0, NAME_MAX);
    return rec;
  }
  function save(secId, rec) {
    const cur = Staff.notes; const n = cur && typeof cur === 'object' ? Object.assign({}, cur) : { count: 6, items: [] };
    const c = Object.assign({}, n.comments || {}); c[secId] = rec; n.comments = c; Staff.setNotes(n);
  }
  /** A student's entry, made the first time something about them is chosen. `i` spreads the wordings across a class. */
  function entry(rec, s, i) {
    const e = rec.s[s.id] || (rec.s[s.id] = { lv: { r: 0, h: 0, e: 0 }, pro: 'name', next: 'auto', w: i || 0, text: '', edited: false });
    e.lv = e.lv && typeof e.lv === 'object' ? e.lv : { r: 0, h: 0, e: 0 }; return e;
  }
  const peek = (rec, s) => rec.s[s.id] || { lv: { r: 0, h: 0, e: 0 }, pro: 'name', next: 'auto', w: 0, text: '', edited: false };
  const write = (rec, s, e) => { e.text = Engine.build({ name: firstName(s), pro: e.pro, lv: e.lv, next: e.next, w: e.w }, rec.course); e.edited = false; e.at = new Date().toISOString(); };
  /** Take one student's comments out of the signed-in teacher's notes (called when a student is removed). */
  function forgetStudent(studentId) {
    const cs = everything(); let hit = false; const out = {};
    Object.keys(cs).forEach(k => { const r = cs[k]; if (r && r.s && r.s[studentId]) { const c = JSON.parse(JSON.stringify(r)); delete c.s[studentId]; out[k] = c; hit = true; } else out[k] = r; });
    if (!hit) return; const n = Object.assign({}, Staff.notes); n.comments = out; Staff.setNotes(n);
  }

  /* ---------- what Summitide already knows about each student ---------- */
  function signalsFor(c, rs) {
    const its = Marks.items(c.course), m = Marks.scheme(c.sec), cid = c.course.id;
    const prog = {}; rs.forEach(s => { prog[s.id] = Progress.graded(s.id)[cid] || {}; });
    const wOf = (s, it) => (((prog[s.id][it.unit.id] || {}).work || {})[it.l] || {})[it.n];
    const marked = w => !!(w && w.grade && !w.grade.nm && w.grade.score !== undefined && w.grade.score !== null && w.grade.score !== '');
    const handed = w => !!(w && (w.done || marked(w)));
    const set = its.filter(it => it.kind === 'work' && rs.some(s => handed(wOf(s, it))));
    const seenOf = (s, u, les) => (((prog[s.id][u.id] || {}).slides || {})[les._idx] || []).length;
    const lessons = [];
    unitsFor(c.course).filter(u => !unitHidden(u)).forEach(u => lessonsFor(u).forEach(les => { const n = slidesFor(les, 3).length; if (n && rs.some(s => seenOf(s, u, les))) lessons.push({ u, les, n }); }));
    return s => {
      const counted = set.filter(it => { const w = wOf(s, it); return !(w && w.grade && w.grade.nm); });   // "No Mark" on an assignment takes it out of the count
      let tot = 0, seen = 0; lessons.forEach(x => { tot += x.n; seen += Math.min(x.n, seenOf(s, x.u, x.les)); });
      const sum = Marks.summary(c.sec, c.course, s, m, its);
      return { handedIn: counted.filter(it => handed(wOf(s, it))).length, assigned: counted.length, average: sum.final, slidesRead: tot ? Math.round(seen / tot * 100) : null };
    };
  }

  /* ---------- the page ---------- */
  function page(c) {
    if (!c || !c.staff || !c.sec) { location.replace(location.pathname + '#/'); return; }
    UI().setCourseColor(c.course); UI().setNav('classes');
    if (openSec !== c.sec.id) { openSec = c.sec.id; openId = null; }
    const secId = c.sec.id, ro = !!c.ro, base = '#/class/' + encodeURIComponent(c.id);
    const rs = (c.sec.students || []).map(id => Students.byId(id)).filter(Boolean).sort((a, b) => String(a.name).localeCompare(String(b.name)));
    const sigOf = signalsFor(c, rs); const sig = {}, sug = {};
    rs.forEach(s => { sig[s.id] = sigOf(s); sug[s.id] = Engine.suggest(sig[s.id]); });
    let rec = load(secId);
    const AUTO = ['r', 'h'];   // results and homework are in the records; engagement is the teacher's to judge, so it is never filled in for them
    const hasSug = s => AUTO.some(d => sug[s.id][d]);
    const dis = ro ? ' disabled' : ''; let typing = 0;

    function card(s, i) {
      const e = peek(rec, s), isOpen = openId === s.id, has = !!String(e.text || '').trim();
      let h = '<div class="card cm-student" data-cm-s="' + esc(s.id) + '" data-cm-i="' + i + '"><button class="cm-head" data-cm="toggle" aria-expanded="' + isOpen + '">' +
        '<span class="cm-avatar" style="background:' + esc(/^#[0-9a-f]{3,8}$/i.test(s.colour || '') ? s.colour : '#1f5f8b') + '">' + esc(firstName(s).charAt(0).toUpperCase()) + '</span>' +
        '<span class="cm-name">' + esc(s.name) + '</span><span class="tag' + (has ? ' ok' : '') + '">' + (has ? (e.edited ? 'Written · edited' : 'Written') : 'Not started') + '</span></button>';
      if (!isOpen) return h + '</div>';
      h += '<div class="cm-body">';
      DIMS.forEach(d => {
        h += '<div class="cm-dim"><div class="cm-title">' + d.title + '</div><div class="cm-chips" role="group" aria-label="' + d.title + '">';
        [4, 3, 2, 1].forEach(l => { const on = e.lv[d.id] === l, sg = sug[s.id][d.id] === l;
          h += '<button class="chip' + (on ? ' on' : '') + (sg ? ' cm-sug' : '') + '" data-cm="lv" data-d="' + d.id + '" data-lv="' + l + '" aria-pressed="' + on + '"' + (sg ? ' title="Suggested from this class\'s records"' : '') + dis + '>' + d.words[l - 1] + '<span class="cm-lv">' + LEVEL_NAME[l] + '</span></button>'; });
        h += '<button class="chip' + (!e.lv[d.id] ? ' on' : '') + '" data-cm="lv" data-d="' + d.id + '" data-lv="0"' + dis + '>Leave out</button></div>' +
          '<div class="cm-signal">' + esc(Engine.signalText(d.id, sig[s.id])) + '</div></div>';
      });
      h += '<div class="btn-row cm-row">' + (hasSug(s) && !ro ? '<button class="btn secondary sm" data-cm="usesug" title="Results and homework only. Engagement is yours to choose.">Use the suggested results and homework</button>' : '') +
        '<label class="cm-fld">Pronoun <select class="text-input" data-cm="pro"' + dis + '>' + PRONOUNS.map(o => '<option value="' + o[0] + '"' + (e.pro === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select></label>' +
        '<label class="cm-fld">Next step about <select class="text-input" data-cm="next"' + dis + '>' + [['auto', 'Lowest area'], ['r', 'Results'], ['h', 'Homework'], ['e', 'Engagement'], ['none', 'No next step']].map(o => '<option value="' + o[0] + '"' + (e.next === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select></label></div>';
      if (e.edited && !ro) h += '<div class="plan-banner cm-banner">You changed this comment by hand, so new choices will not overwrite it. <button class="btn sm accent" data-cm="rebuild">Rebuild from choices</button></div>';
      const len = String(e.text || '').length;
      h += '<label class="cm-fld cm-wide">Comment<textarea class="text-input cm-text" data-cm="text" placeholder="Choose a level above and the comment is written here. You can edit it."' + dis + '>' + esc(e.text || '') + '</textarea></label>' +
        '<div class="btn-row between"><span class="cm-count' + (rec.limit && len > rec.limit ? ' over' : '') + '" data-cm-count>' + len + (rec.limit ? ' of ' + rec.limit : '') + ' characters</span>' +
        '<span class="btn-row">' + (ro ? '' : '<button class="btn ghost sm" data-cm="reword">Reword</button>') + '<button class="btn sm" data-cm="copy">Copy</button></span></div>';
      return h + '</div></div>';
    }

    function draw() {
      const done = rs.filter(s => String(peek(rec, s).text || '').trim()).length;
      const root = document.getElementById('cmRoot'); if (!root) return;
      root.innerHTML =
        '<div class="page-head"><div><h1>Report comments</h1><p class="muted">' + esc(c.name) + ' · ' + plural(rs.length, 'student') + ' · ' + done + ' written</p></div>' +
        '<div class="btn-row">' + (ro || !rs.some(hasSug) ? '' : '<button class="btn secondary" data-cm="draftall" title="Writes a first comment for each student who has none, from the suggested results and homework levels. Engagement is left for you to choose.">Draft the unwritten ones</button>') +
        '<button class="btn" data-cm="copyall"' + (done ? '' : ' disabled') + '>Copy all ' + done + '</button></div></div>' +
        '<div class="card cm-info"><p class="small">Pick a level in each area and the comment is written for you. A dot marks the level this class\'s records suggest; you decide every one, and engagement is never filled in for you. ' +
        'Comments are kept with your own notes: students cannot see them, and the ' + esc(LH.headTitle ? LH.headTitle() : 'Headmaster') + ' can.</p>' +
        '<div class="btn-row cm-row"><label class="cm-fld">Course name used in comments <input class="text-input" data-cm="course" maxlength="' + NAME_MAX + '" value="' + esc(rec.course) + '" placeholder="the course"' + dis + '></label>' +
        '<label class="cm-fld">Character limit (0 = none) <input class="text-input cm-num" data-cm="limit" type="number" min="0" max="' + LIMIT_MAX + '" step="50" value="' + rec.limit + '"' + dis + '></label></div></div>' +
        (rs.length ? rs.map(card).join('') : '<div class="empty slim">No students in this class yet. <a href="' + base + '/students">Add students</a></div>');
    }
    const sOf = el => { const k = el.closest('[data-cm-s]'); return k ? { s: rs.find(x => x.id === k.dataset.cmS), i: +k.dataset.cmI || 0 } : null; };
    const commit = () => { save(secId, rec); rec = load(secId); draw(); };
    function copy(text, msg) {
      const ok = () => UI().toast(msg), manual = () => { try { const t = document.createElement('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select(); const done = document.execCommand('copy'); t.remove(); if (done) ok(); else UI().toast('Copying is blocked here. Select the text and copy it.'); } catch (e) { UI().toast('Copying is blocked here. Select the text and copy it.'); } };
      try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, manual); else manual(); } catch (e) { manual(); }
    }

    app.innerHTML = Classes.trail(c, 'Report comments') + '<div id="cmRoot"></div>';
    const root = document.getElementById('cmRoot');
    draw();

    root.addEventListener('click', ev => {
      const t = ev.target.closest('[data-cm]'); if (!t || t.disabled || t.tagName !== 'BUTTON') return;
      const act = t.dataset.cm;
      if (act === 'copyall') { const rows = rs.filter(s => String(peek(rec, s).text || '').trim()); if (!rows.length) return; return copy(rows.map(s => s.name + '\n' + peek(rec, s).text.trim()).join('\n\n'), plural(rows.length, 'comment') + ' copied'); }
      if (act === 'draftall') { if (ro) return; let n = 0; rs.forEach((s, i) => { if (!hasSug(s) || String(peek(rec, s).text || '').trim()) return; const e = entry(rec, s, i); AUTO.forEach(d => { if (!e.lv[d]) e.lv[d] = sug[s.id][d]; }); write(rec, s, e); n++; }); commit(); return UI().toast(n ? plural(n, 'comment') + ' drafted. Read each one before you use it.' : 'Every student with records already has a comment.'); }
      const hit = sOf(t); if (!hit || !hit.s) return; const s = hit.s;
      if (act === 'toggle') { openId = openId === s.id ? null : s.id; return draw(); }
      if (act === 'copy') { const txt = String(peek(rec, s).text || '').trim(); if (!txt) return UI().toast('Nothing to copy yet.'); return copy(txt, 'Copied the comment for ' + firstName(s)); }
      if (ro) return;
      const e = entry(rec, s, hit.i);
      if (act === 'lv') { e.lv[t.dataset.d] = Math.max(0, Math.min(4, +t.dataset.lv || 0)); if (!e.edited) write(rec, s, e); return commit(); }
      if (act === 'usesug') { AUTO.forEach(d => { e.lv[d] = sug[s.id][d]; }); if (!e.edited) write(rec, s, e); return commit(); }
      if (act === 'reword') { e.w = (Math.round(+e.w) || 0) + 1; write(rec, s, e); return commit(); }
      if (act === 'rebuild') { write(rec, s, e); return commit(); }
    });
    root.addEventListener('change', ev => {
      const t = ev.target, act = t.dataset && t.dataset.cm; if (!act || ro) return;
      if (act === 'course') { rec.course = String(t.value || '').replace(/[<>]/g, '').trim().slice(0, NAME_MAX); rs.forEach(s => { const e = rec.s[s.id]; if (e && !e.edited && String(e.text || '').trim()) write(rec, s, e); }); return commit(); }
      if (act === 'limit') { rec.limit = Math.max(0, Math.min(LIMIT_MAX, Math.round(+t.value || 0))); return commit(); }
      const hit = sOf(t); if (!hit || !hit.s) return; const e = entry(rec, hit.s, hit.i);
      if (act === 'pro') { e.pro = PRONOUNS.some(p => p[0] === t.value) ? t.value : 'name'; if (!e.edited && DIMS.some(d => e.lv[d.id])) write(rec, hit.s, e); return commit(); }
      if (act === 'next') { e.next = ['auto', 'r', 'h', 'e', 'none'].includes(t.value) ? t.value : 'auto'; if (!e.edited && DIMS.some(d => e.lv[d.id])) write(rec, hit.s, e); return commit(); }
      if (act === 'text') { clearTimeout(typing); save(secId, rec); rec = load(secId); }   // leaving the box: save what was typed (no redraw: a tap on a button that took the focus away must still land)
    });
    root.addEventListener('input', ev => {
      const t = ev.target; if (!t.dataset || t.dataset.cm !== 'text' || ro) return;
      const hit = sOf(t); if (!hit || !hit.s) return; const e = entry(rec, hit.s, hit.i);
      e.text = String(t.value || '').slice(0, LIMIT_MAX * 2); e.edited = true; e.at = new Date().toISOString();
      const k = t.closest('[data-cm-s]').querySelector('[data-cm-count]'), len = e.text.length;
      clearTimeout(typing); typing = setTimeout(() => { if (document.getElementById('cmRoot') === root) save(secId, rec); }, 1500);   // and while typing, shortly after each pause
      if (k) { k.textContent = len + (rec.limit ? ' of ' + rec.limit : '') + ' characters'; k.classList.toggle('over', !!rec.limit && len > rec.limit); }
    });
  }

  window.Comments = { page, forgetStudent, signalsFor, Engine };
})();
