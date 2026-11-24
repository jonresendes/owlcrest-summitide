/* Summitide Learning · mathtools.js — the tools every mathematics course shares.
     Calculator   a panel on every page of a math course; pops out into its own window; teachers switch it
                     on or off for lesson quizzes and unit tests, per section (sections/<id>.calcQuiz / .calcTest)
     Practice     #/practice/<course>/<unit>/<lesson>  the lesson's worksheet questions, marked as you go, and
                     endless skill practice with hints, worked steps and stars    ·   #/practice/<course>/mix  mixed review
     Math Lab     #/mathlab/<course>/<tool>  formula sheet and solver, grapher, number line, balance, data, fractions, money
   Nothing here edits app.js: the tools watch the page and add themselves. Nothing is ever run as code: every
   expression goes through MathCore's own reader, and every value drawn on the page is escaped.
   A course turns the tools on with  mathTools: true  (courses in the Mathematics area get them automatically);
   a lesson lists  practice: { skills: [...], items: [...], tool: 'grapher' }. */
(function () {
  'use strict';
  var W = window, D = document, M = W.MathCore;
  if (!M) { console.warn('mathtools: mathcore.js is missing'); return; }
  var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); };
  var $ = function (sel, el) { return (el || D).querySelector(sel); };
  var $$ = function (sel, el) { return Array.prototype.slice.call((el || D).querySelectorAll(sel)); };
  var POPOUT = !!(D.body && D.body.hasAttribute('data-calc-only'));
  var STATE_KEY = 'learnhub.calc.state';

  /** text with stacked fractions; code stays as code */
  function pretty(text) {
    var t = String(text == null ? '' : text);
    if (/print\(/.test(t)) { var i = t.indexOf('\n\n'); return (i > 0 ? '<span>' + esc(t.slice(0, i)) + '</span><pre class="mt-code">' + esc(t.slice(i + 2)) + '</pre>' : '<pre class="mt-code">' + esc(t) + '</pre>'); }
    return esc(t).replace(/(^|[^\w/.])(\d{1,5}|[a-z])\/(\d{1,5})(?![\w/])/g, function (m, pre, a, b) { return pre + '<span class="mt-frac" role="img" aria-label="' + a + ' over ' + b + '"><span>' + a + '</span><span>' + b + '</span></span>'; }).replace(/\n/g, '<br>');
  }

  /* =====================================================================
     CALCULATOR
     ===================================================================== */
  var Calc = { open: false, sci: false, mode: 0, last: null, tape: [], pos: null };
  var KEYS = [
    ['a/b', '/', 'Fraction bar', 'fn'], ['x²', '²', 'Squared', 'fn'], ['xʸ', '^', 'To the power of', 'fn'], ['√', '√(', 'Square root', 'fn'], ['π', 'π', 'Pi', 'fn'],
    ['(', '(', 'Open bracket', 'fn'], [')', ')', 'Close bracket', 'fn'], ['%', '%', 'Percent', 'fn'], ['⌫', 'back', 'Delete', 'del'], ['AC', 'clear', 'Clear', 'del'],
    ['7', '7'], ['8', '8'], ['9', '9'], ['÷', '÷', 'Divide', 'op'], ['Ans', 'ans', 'Last answer', 'fn'],
    ['4', '4'], ['5', '5'], ['6', '6'], ['×', '×', 'Multiply', 'op'], ['F⇄D', 'fd', 'Fraction or decimal', 'fn'],
    ['1', '1'], ['2', '2'], ['3', '3'], ['−', '−', 'Subtract', 'op'], ['(−)', '−', 'Negative', 'fn'],
    ['0', '0'], ['.', '.', 'Decimal point'], ['×10ⁿ', '×10^', 'Times ten to the power of', 'fn'], ['+', '+', 'Add', 'op'], ['=', 'eq', 'Equals', 'eq']
  ];
  var SCI_KEYS = [['x³', '³', 'Cubed'], ['∛', '∛(', 'Cube root'], ['1/x', '^(−1)', 'Reciprocal'], ['|x|', 'abs(', 'Absolute value'], ['sin', 'sin(', 'Sine, in degrees'], ['cos', 'cos(', 'Cosine, in degrees'], ['tan', 'tan(', 'Tangent, in degrees'], ['sin⁻¹', 'asin(', 'Inverse sine'], ['cos⁻¹', 'acos(', 'Inverse cosine'], ['tan⁻¹', 'atan(', 'Inverse tangent'], ['log', 'log(', 'Logarithm base ten'], ['mixed', ' ', 'Space for a mixed number such as 2 1/3']];
  function calcHTML() {
    return '<div class="mt-calc-head" id="mtCalcHead"><strong>Calculator</strong><span class="mt-calc-head-btns">' +
      '<button type="button" class="mt-mini" id="mtCalcSci" aria-pressed="' + Calc.sci + '" title="Scientific keys">' + (Calc.sci ? 'Basic' : 'Scientific') + '</button>' +
      (POPOUT ? '' : '<button type="button" class="mt-mini" id="mtCalcPop" title="Open the calculator in its own window">⧉ Pop out</button><button type="button" class="mt-mini" id="mtCalcClose" aria-label="Close the calculator">✕</button>') + '</span></div>' +
      '<div class="mt-calc-screen"><input id="mtCalcIn" class="mt-calc-in" type="text" inputmode="none" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Calculation" placeholder="Type or tap">' +
      '<div class="mt-calc-out" id="mtCalcOut" aria-live="polite">&nbsp;</div><div class="mt-calc-alt" id="mtCalcAlt">&nbsp;</div></div>' +
      (Calc.sci ? '<div class="mt-keys sci">' + SCI_KEYS.map(function (k) { return '<button type="button" class="mt-key fn" data-k="' + esc(k[1]) + '" aria-label="' + esc(k[2]) + '">' + esc(k[0]) + '</button>'; }).join('') + '</div>' : '') +
      '<div class="mt-keys">' + KEYS.map(function (k) { return '<button type="button" class="mt-key ' + (k[3] || '') + '" data-k="' + esc(k[1]) + '"' + (k[2] ? ' aria-label="' + esc(k[2]) + '"' : '') + '>' + esc(k[0]) + '</button>'; }).join('') + '</div>' +
      '<div class="mt-tape" id="mtTape" aria-label="Earlier answers"></div>' +
      '<div class="mt-calc-lock" id="mtCalcLock" hidden></div>';
  }
  function calcBind(box) {
    var input = $('#mtCalcIn', box);
    function insert(s) { var a = input.selectionStart == null ? input.value.length : input.selectionStart, b = input.selectionEnd == null ? a : input.selectionEnd; input.value = input.value.slice(0, a) + s + input.value.slice(b); var p = a + s.length; try { input.setSelectionRange(p, p); } catch (e) {} }
    function showResult() {
      var out = $('#mtCalcOut', box), alt = $('#mtCalcAlt', box), r = Calc.last; if (!r) { out.innerHTML = '&nbsp;'; alt.innerHTML = '&nbsp;'; return; }
      var forms = [r.frac, r.mixed, r.dec].filter(Boolean); if (!r.frac) forms = [r.dec];
      var main = forms[Calc.mode % forms.length];
      out.innerHTML = '= ' + pretty(main); out.classList.remove('err');
      alt.innerHTML = forms.length > 1 ? esc(forms.filter(function (f) { return f !== main; }).map(function (f) { return '= ' + f; }).join('   ')) : (Math.abs(r.value) >= 1e5 || (r.value !== 0 && Math.abs(r.value) < 1e-3) ? esc('= ' + M.sci(r.value)) : '&nbsp;');
    }
    function equals() {
      var src = input.value.trim(); if (!src) return;
      try {
        var res = M.show(M.evaluate(M.parse(src)));
        Calc.last = res; Calc.mode = 0;
        Calc.tape.unshift({ q: src, a: res.frac || res.dec }); Calc.tape = Calc.tape.slice(0, 12); showResult(); tape();
      } catch (e) { var out = $('#mtCalcOut', box); out.textContent = e.message; out.classList.add('err'); $('#mtCalcAlt', box).innerHTML = '&nbsp;'; }
    }
    function tape() { $('#mtTape', box).innerHTML = Calc.tape.map(function (t, i) { return '<button type="button" class="mt-tape-row" data-i="' + i + '" title="Use this answer"><span>' + esc(t.q) + '</span><b>= ' + esc(t.a) + '</b></button>'; }).join(''); }
    function press(k) {
      if (k === 'eq') return equals();
      if (k === 'clear') { input.value = ''; Calc.last = null; showResult(); return; }
      if (k === 'back') { var a = input.selectionStart == null ? input.value.length : input.selectionStart, b = input.selectionEnd; if (a !== b) insert(''); else if (a > 0) { input.value = input.value.slice(0, a - 1) + input.value.slice(a); try { input.setSelectionRange(a - 1, a - 1); } catch (e) {} } return; }
      if (k === 'fd') { Calc.mode++; showResult(); return; }
      if (k === 'ans') { if (Calc.tape[0]) insert(/^[\d.]+$/.test(Calc.tape[0].a) ? Calc.tape[0].a : '(' + Calc.tape[0].a + ')'); return; }
      insert(k);
    }
    box.addEventListener('click', function (e) {
      var key = e.target.closest('.mt-key'); if (key) { press(key.dataset.k); if (!('ontouchstart' in W)) input.focus(); return; }
      var row = e.target.closest('.mt-tape-row'); if (row) { var t = Calc.tape[+row.dataset.i]; insert(/^[\d.]+$/.test(t.a) ? t.a : '(' + t.a + ')'); return; }
      if (e.target.id === 'mtCalcSci') { Calc.sci = !Calc.sci; var keep = input.value; calcDraw(); $('#mtCalcIn').value = keep; return; }
      if (e.target.id === 'mtCalcClose') return calcToggle(false);
      if (e.target.id === 'mtCalcPop') return calcPop();
    });
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === '=') { e.preventDefault(); equals(); } else if (e.key === 'Escape' && !POPOUT) calcToggle(false); else if (e.key === '*') { e.preventDefault(); insert('×'); } else if (e.key === '-') { e.preventDefault(); insert('−'); } });
    tape(); showResult();
  }
  function calcDraw() {
    var box = $('#mtCalc'); if (!box) { box = D.createElement('section'); box.id = 'mtCalc'; box.className = 'mt-calc' + (POPOUT ? ' popout' : ''); box.setAttribute('aria-label', 'Calculator'); D.body.appendChild(box); if (!POPOUT) drag(box); }
    var fresh = box.cloneNode(false); box.parentNode.replaceChild(fresh, box); box = fresh; if (!POPOUT) drag(box);
    box.innerHTML = calcHTML(); calcBind(box); box.hidden = !POPOUT && !Calc.open;
    if (Calc.pos && !POPOUT) { box.style.left = Calc.pos.x + 'px'; box.style.top = Calc.pos.y + 'px'; box.style.right = 'auto'; box.style.bottom = 'auto'; }
    calcLock();
  }
  function drag(box) {
    var start = null;
    box.addEventListener('pointerdown', function (e) { if (!e.target.closest('#mtCalcHead') || e.target.closest('button')) return; var r = box.getBoundingClientRect(); start = { dx: e.clientX - r.left, dy: e.clientY - r.top }; box.setPointerCapture(e.pointerId); });
    box.addEventListener('pointermove', function (e) { if (!start) return; var x = Math.max(0, Math.min(W.innerWidth - 80, e.clientX - start.dx)), y = Math.max(0, Math.min(W.innerHeight - 60, e.clientY - start.dy)); Calc.pos = { x: x, y: y }; box.style.left = x + 'px'; box.style.top = y + 'px'; box.style.right = 'auto'; box.style.bottom = 'auto'; });
    box.addEventListener('pointerup', function () { start = null; });
  }
  function calcToggle(on) { Calc.open = on === undefined ? !Calc.open : on; if (!$('#mtCalc')) calcDraw(); $('#mtCalc').hidden = !Calc.open; var fab = $('#mtFab'); if (fab) fab.setAttribute('aria-expanded', String(Calc.open)); if (Calc.open) { calcLock(); var i = $('#mtCalcIn'); if (i && !('ontouchstart' in W)) i.focus(); } }
  function calcPop() {
    var w = W.open('calculator.html', 'summitideCalculator', 'popup=yes,width=380,height=640,resizable=yes');
    if (!w) return toast('Your browser blocked the new window. Allow pop-ups for this site, then try again.');
    calcToggle(false);
  }
  /** Where are we, and may the calculator be used here? */
  function context() {
    var parts = location.hash.replace(/^#\/?/, '').split('?')[0].split('/').map(decodeURIComponent), page = parts[0];
    var courseId = ['course', 'lesson', 'study', 'quiz', 'assign', 'work', 'test', 'games', 'game', 'practice', 'mathlab'].indexOf(page) >= 0 ? parts[1] : (page === 'print' ? parts[1] : null);
    var course = courseId && W.LH && LH.findCourse ? LH.findCourse(courseId) : null;
    var math = !!course && isMath(course), assessing = page === 'quiz' || page === 'test';
    var allowed = true, sec = null;
    if (math && assessing) { sec = sectionFor(course.id); if (sec) allowed = (page === 'quiz' ? sec.calcQuiz : sec.calcTest) !== false; }
    return { parts: parts, page: page, course: course, math: math, assessing: assessing, allowed: allowed, section: sec };
  }
  function isMath(course) { if (!course) return false; if (course.mathTools === true) return true; if (course.mathTools === false) return false; try { return LH.courseArea(course) === 'math'; } catch (e) { return false; } }
  function signedIn() { return !!(W.Students && Students.current && sessionStorage.getItem('learnhub.entered')); }
  function sectionFor(courseId) {
    var me = W.Students && Students.current; if (!me || !W.Sections) return null;
    if (me.isStaff) { var cur = Sections.currentFor(me.staffId); return cur && cur.courseId === courseId ? cur : null; }
    return Sections.list.find(function (s) { return s.courseId === courseId && !s.archived && (s.students || []).indexOf(me.id) >= 0; }) || null;
  }
  function publish(ctx) {      // the pop-out window reads this
    var st = !signedIn() ? 'free' : ctx.assessing ? 'paused' : 'free';
    try { var prev = localStorage.getItem(STATE_KEY), next = JSON.stringify({ s: st }); if (prev !== next) localStorage.setItem(STATE_KEY, next); } catch (e) {}
  }
  function calcLock() {
    var lock = $('#mtCalcLock'); if (!lock) return;
    if (POPOUT) { var st = {}; try { st = JSON.parse(localStorage.getItem(STATE_KEY) || '{}'); } catch (e) {}
      lock.hidden = st.s !== 'paused'; lock.innerHTML = '<div><div class="mt-lock-icon">⏸︎</div><strong>Paused during a quiz or test</strong><p>If your teacher allows a calculator, use the Calculator button inside Summitide.</p></div>'; return; }
    var ctx = context(); lock.hidden = ctx.allowed;
    lock.innerHTML = '<div><div class="mt-lock-icon"></div><strong>Calculator off</strong><p>Your teacher has turned the calculator off for this ' + (ctx.page === 'test' ? 'unit test' : 'quiz') + '.</p></div>';
  }
  function fab(ctx) {
    var b = $('#mtFab'), show = signedIn() && ctx.math;
    if (!show) { if (b) b.hidden = true; if (Calc.open) calcToggle(false); return; }
    if (!b) { b = D.createElement('button'); b.id = 'mtFab'; b.type = 'button'; b.className = 'mt-fab'; b.setAttribute('aria-controls', 'mtCalc'); b.addEventListener('click', function () { calcToggle(); }); D.body.appendChild(b); }
    b.hidden = false; b.classList.toggle('off', !ctx.allowed); b.innerHTML = ctx.allowed ? '<span>Calculator</span>' : '<span>Off for this ' + (ctx.page === 'test' ? 'test' : 'quiz') + '</span>';
    b.setAttribute('aria-label', ctx.allowed ? 'Calculator' : 'Calculator: turned off by your teacher for this ' + ctx.page);
    if (!ctx.allowed && Calc.open) calcLock();
    if (Calc.open) calcLock();
  }
  function toast(msg) { var t = $('#toasts'); if (!t) return alert(msg); var d = D.createElement('div'); d.className = 'toast'; d.textContent = msg; t.appendChild(d); setTimeout(function () { d.remove(); }, 5000); }

  if (POPOUT) {
    D.addEventListener('DOMContentLoaded', function () { calcDraw(); });
    if (D.readyState !== 'loading') calcDraw();
    W.addEventListener('storage', function (e) { if (e.key === STATE_KEY || e.key === null) calcLock(); });
    setInterval(calcLock, 2000);
    return;
  }

  /* =====================================================================
     PAGE HELPERS
     ===================================================================== */
  var app = function () { return $('#app'); };
  function crumbs(list) { return '<nav class="crumbs" aria-label="You are here">' + list.map(function (c, i) { return (i ? ' <span aria-hidden="true">›</span> ' : '') + (c.href ? '<a href="' + esc(c.href) + '">' + esc(c.label) + '</a>' : '<span>' + esc(c.label) + '</span>'); }).join('') + '</nav>'; }
  function levelFor(course) { try { return Math.max(1, Math.min(4, +Students.levelFor(course.id) || 2)); } catch (e) { return 2; } }
  function units(course) { try { return LH.unitsFor(course); } catch (e) { return course.units || []; } }
  function lessonsOf(unit) { try { return LH.lessonsFor(unit); } catch (e) { return (unit.lessons || []).map(function (l, i) { return Object.assign({ _idx: i }, l); }); } }
  function rec(course, unit, idx) { var u = Progress.unit(course.id, unit.id); u.practice = u.practice || {}; var r = u.practice[idx] = u.practice[idx] || {}; r.sk = r.sk || {}; r.ws = r.ws || {}; return r; }
  function stars(s) { var b = (s && s.best) || 0; return b >= 8 ? 3 : b >= 5 ? 2 : b >= 3 ? 1 : 0; }
  var starStr = function (k) { return '★'.repeat(k) + '☆'.repeat(3 - k); };
  function summary(course, unit, les) {
    var p = les.practice || {}, r = ((Progress.unit(course.id, unit.id).practice || {})[les._idx]) || {}, sk = r.sk || {}, ws = r.ws || {};
    var skills = (p.skills || []).filter(function (id) { return M.SKILLS[id]; }), items = p.items || [];
    return { skills: skills.length, starred: skills.filter(function (id) { return stars(sk[id]) > 0; }).length, mastered: skills.filter(function (id) { return stars(sk[id]) === 3; }).length, items: items.length, done: items.filter(function (_, i) { return ws[i] === 1; }).length, tried: Object.keys(sk).length + Object.keys(ws).length };
  }

  /* =====================================================================
     FIGURES (v62) — tables, value charts, graphs, number lines, box plots and diagrams.
     A figure is plain data (course.figs[id], or fig on a practice question); everything is escaped as it is drawn.
     In course text the marker  [Figure id]  is replaced by the figure wherever the app shows that text:
     slides, quizzes, unit tests, assignments, games and print pages.
     ===================================================================== */
  var num = function (v) { return typeof v === 'number' && isFinite(v); };
  function figHTML(spec, id) {
    if (!spec || typeof spec !== 'object') return '';
    var draw = { table: figTable, plot: figPlot, nline: figLine, box: figBox, bars: figBars, shape: figShape, img: figImg }[spec.t], inner = '';
    try { inner = draw ? draw(spec) : ''; } catch (e) { inner = ''; }
    if (!inner) return '';
    return '<figure class="mt-fig mt-fig-' + esc(spec.t) + '"' + (id ? ' data-fig="' + esc(id) + '"' : '') + '>' + inner + (spec.cap ? '<figcaption>' + pretty(spec.cap) + '</figcaption>' : '') + '</figure>';
  }
  // v64: a course's own pictures live in a folder named after the course ("mth1w/mth1w-fig-3-1-a.png"). A bare file name
  // (the top folder, as in v62) still works, and a picture not found in its folder is looked for in the top folder once.
  function figImg(s) { var src = String(s.src), m = /^(?:([a-z0-9][a-z0-9-]*)\/)?([A-Za-z0-9][\w.-]*\.(?:png|jpe?g|webp))$/.exec(src); if (!m || m[2].indexOf('..') >= 0) return ''; return '<img src="' + esc(src) + '"' + (m[1] ? ' data-fig-file="' + esc(m[2]) + '"' : '') + ' alt="' + esc(s.alt || 'Figure') + '" loading="lazy"' + (num(s.w) && num(s.h) ? ' width="' + s.w + '" height="' + s.h + '"' : '') + '>'; }
  document.addEventListener('error', function (e) { var t = e.target; if (t && t.tagName === 'IMG' && t.dataset && t.dataset.figFile) { var f = t.dataset.figFile; delete t.dataset.figFile; t.src = f; } }, true);
  function figTable(s) {
    var cell = function (c, tag, extra) { return '<' + tag + (extra || '') + '>' + pretty(c) + '</' + tag + '>'; };
    return '<div class="mt-figscroll"><table class="md-table mt-figtable"><thead><tr>' + (s.head || []).map(function (h, i) { return cell(h, 'th', s.side && i === 0 ? ' scope="row"' : ' scope="col"'); }).join('') + '</tr></thead><tbody>' +
      (s.rows || []).map(function (r) { return '<tr>' + r.map(function (c, i) { return s.side && i === 0 ? cell(c, 'th', ' scope="row"') : cell(c, 'td'); }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
  }
  function figPlot(s) {
    var xr = s.xr || [-8, 8], yr = s.yr || [-8, 8], xs = s.xs || 1, ys = s.ys || 1, W0 = 400, H0 = 330, L = 44, Rm = 14, T = 14, B = 38;
    if (!(xr[1] > xr[0]) || !(yr[1] > yr[0])) return '';
    var X = function (v) { return L + (v - xr[0]) * (W0 - L - Rm) / (xr[1] - xr[0]); }, Y = function (v) { return H0 - B - (v - yr[0]) * (H0 - T - B) / (yr[1] - yr[0]); }, o = '', f = function (v) { return M.n(M.round(v, 4)); };
    var ax = xr[0] <= 0 && xr[1] >= 0 ? 0 : xr[0], ay = yr[0] <= 0 && yr[1] >= 0 ? 0 : yr[0], nx = Math.round((xr[1] - xr[0]) / xs), ny = Math.round((yr[1] - yr[0]) / ys), kx = Math.ceil(nx / 10), ky = Math.ceil(ny / 10), i, v;
    if (nx > 60 || ny > 60) return '';
    for (i = 0; i <= nx; i++) { v = xr[0] + i * xs; o += '<line x1="' + X(v) + '" y1="' + Y(yr[0]) + '" x2="' + X(v) + '" y2="' + Y(yr[1]) + '" class="mt-gridline"/>'; if (i % kx === 0 && !(v === 0 && ay === 0 && ax === 0 && yr[0] < 0)) o += '<text x="' + X(v) + '" y="' + (Y(ay) + 14) + '" text-anchor="middle" class="mt-lbl sm">' + f(v) + '</text>'; }
    for (i = 0; i <= ny; i++) { v = yr[0] + i * ys; o += '<line x1="' + X(xr[0]) + '" y1="' + Y(v) + '" x2="' + X(xr[1]) + '" y2="' + Y(v) + '" class="mt-gridline"/>'; if (i % ky === 0 && !(v === 0 && ax === 0 && xr[0] < 0)) o += '<text x="' + (X(ax) - 6) + '" y="' + (Y(v) + 4) + '" text-anchor="end" class="mt-lbl sm">' + f(v) + '</text>'; }
    o += '<line x1="' + X(xr[0]) + '" y1="' + Y(ay) + '" x2="' + X(xr[1]) + '" y2="' + Y(ay) + '" class="mt-axis"/><line x1="' + X(ax) + '" y1="' + Y(yr[0]) + '" x2="' + X(ax) + '" y2="' + Y(yr[1]) + '" class="mt-axis"/>';
    o += '<text x="' + (W0 - Rm) + '" y="' + (s.xl ? H0 - 6 : Y(ay) - 6) + '" text-anchor="end" class="mt-lbl sm">' + esc(s.xl || 'x') + '</text><text x="' + (s.yl ? 4 : X(ax) + 6) + '" y="' + (T - 2) + '" class="mt-lbl sm">' + esc(s.yl || 'y') + '</text>';
    var alt = [];
    (s.lines || []).forEach(function (ln, k) { if (!num(ln.m) || !num(ln.b)) return; var p = [];
      [xr[0], xr[1]].forEach(function (x) { var y = ln.m * x + ln.b; if (y >= yr[0] - 1e-9 && y <= yr[1] + 1e-9) p.push([x, y]); });
      if (ln.m !== 0) [yr[0], yr[1]].forEach(function (y) { var x = (y - ln.b) / ln.m; if (x > xr[0] && x < xr[1]) p.push([x, y]); });
      if (p.length < 2) return; p.sort(function (a, b) { return a[0] - b[0]; }); var a = p[0], z = p[p.length - 1];
      o += '<line x1="' + X(a[0]) + '" y1="' + Y(a[1]) + '" x2="' + X(z[0]) + '" y2="' + Y(z[1]) + '" class="mt-plotline' + (k % 2 ? ' two' : '') + '"/>';
      if (ln.l) { var lx = a[0] + (z[0] - a[0]) * 0.8, ly = ln.m * lx + ln.b; o += '<text x="' + (X(lx) + 6) + '" y="' + (Y(ly) + (ln.m >= 0 ? 16 : -8)) + '" class="mt-lbl">' + esc(ln.l) + '</text>'; }
      var gx0 = Math.ceil(xr[0]), g = []; for (var x = gx0; x <= xr[1] && g.length < 2; x++) { var yy = ln.m * x + ln.b; if (Math.abs(yy - Math.round(yy)) < 1e-9 && yy >= yr[0] && yy <= yr[1]) g.push('(' + f(x) + ', ' + f(yy) + ')'); }
      alt.push((ln.l ? 'line ' + ln.l : 'a straight line') + (g.length === 2 ? ' through ' + g.join(' and ') : '')); });
    (s.dots || []).forEach(function (p) { o += '<circle cx="' + X(p[0]) + '" cy="' + Y(p[1]) + '" r="4" class="mt-dot2"/>'; });
    if (s.dots && s.dots.length) alt.push(s.dots.length + ' points: ' + s.dots.map(function (p) { return '(' + f(p[0]) + ', ' + f(p[1]) + ')'; }).join(', '));
    (s.pts || []).forEach(function (p) { o += '<circle cx="' + X(p[0]) + '" cy="' + Y(p[1]) + '" r="5" class="mt-point"/>' + (p[2] ? '<text x="' + (X(p[0]) + 8) + '" y="' + (Y(p[1]) - 8) + '" class="mt-lbl sm strong">' + esc(p[2]) + '</text>' : ''); alt.push('a marked point at (' + f(p[0]) + ', ' + f(p[1]) + ')'); });
    return '<svg class="mt-plot2" viewBox="0 0 ' + W0 + ' ' + H0 + '" role="img" aria-label="' + esc('Graph with x from ' + f(xr[0]) + ' to ' + f(xr[1]) + ' and y from ' + f(yr[0]) + ' to ' + f(yr[1]) + (alt.length ? ': ' + alt.join('; ') : '') + '.') + '">' + o + '</svg>';
  }
  function figLine(s) {
    var lo = s.lo, hi = s.hi, den = s.den || 1, lab = s.lab || 1, w = 640, pad = 26; if (!num(lo) || !num(hi) || hi <= lo || (hi - lo) * den > 140) return '';
    var X = function (v) { return pad + (v - lo) * (w - 2 * pad) / (hi - lo); }, o = '<line x1="' + (pad - 14) + '" y1="46" x2="' + (w - pad + 14) + '" y2="46" class="mt-axis"/><path d="M' + (pad - 14) + ' 46l8 -5v10z M' + (w - pad + 14) + ' 46l-8 -5v10z" class="mt-arrowfill"/>', alt = [];
    for (var k = lo * den; k <= hi * den; k++) { var v = k / den, whole = k % den === 0; o += '<line x1="' + X(v) + '" y1="' + (whole ? 36 : 41) + '" x2="' + X(v) + '" y2="' + (whole ? 56 : 51) + '" class="mt-axis' + (whole ? '' : ' thin') + '"/>'; if (whole && (v % lab === 0)) o += '<text x="' + X(v) + '" y="76" text-anchor="middle" class="mt-lbl">' + M.n(v) + '</text>'; }
    (s.marks || []).forEach(function (m) { if (!num(m.v)) return; o += '<circle cx="' + X(m.v) + '" cy="46" r="7" class="mt-point"/>' + (m.l ? '<text x="' + X(m.v) + '" y="26" text-anchor="middle" class="mt-lbl strong">' + esc(m.l) + '</text>' : ''); var steps = Math.round(m.v * den); alt.push('point ' + (m.l || '') + ' is ' + Math.abs(steps) + ' tick' + (Math.abs(steps) === 1 ? '' : 's') + (steps < 0 ? ' left' : ' right') + ' of zero'); });
    return '<svg class="mt-line" viewBox="0 0 ' + w + ' 86" role="img" aria-label="' + esc('Number line from ' + M.n(lo) + ' to ' + M.n(hi) + (den > 1 ? ', with each whole split into ' + den + ' equal parts' : '') + (alt.length ? '; ' + alt.join('; ') : '') + '.') + '">' + o + '</svg>';
  }
  function figBox(s) {
    var sets = (s.sets || []).filter(function (b) { return b.five && b.five.length === 5 && b.five.every(num); }); if (!sets.length) return '';
    var lo = num(s.lo) ? s.lo : Math.min.apply(null, sets.map(function (b) { return b.five[0]; })), hi = num(s.hi) ? s.hi : Math.max.apply(null, sets.map(function (b) { return b.five[4]; })), step = s.step || M.niceStep(hi - lo), w = 640, padL = sets.some(function (b) { return b.l; }) ? 90 : 30, H = 46 * sets.length + 50;
    var X = function (v) { return padL + (v - lo) * (w - padL - 30) / (hi - lo); }, o = '', alt = [];
    for (var v = lo; v <= hi + 1e-9; v += step) o += '<line x1="' + X(v) + '" y1="8" x2="' + X(v) + '" y2="' + (H - 34) + '" class="mt-gridline"/><text x="' + X(v) + '" y="' + (H - 10) + '" text-anchor="middle" class="mt-lbl sm">' + M.n(v) + '</text>';
    o += '<line x1="' + X(lo) + '" y1="' + (H - 30) + '" x2="' + X(hi) + '" y2="' + (H - 30) + '" class="mt-axis"/>';
    sets.forEach(function (b, i) { var y = 30 + i * 46, f = b.five; o += (b.l ? '<text x="6" y="' + (y + 5) + '" class="mt-lbl">' + esc(b.l) + '</text>' : '') + '<line x1="' + X(f[0]) + '" y1="' + y + '" x2="' + X(f[1]) + '" y2="' + y + '" class="mt-axis"/><line x1="' + X(f[3]) + '" y1="' + y + '" x2="' + X(f[4]) + '" y2="' + y + '" class="mt-axis"/><line x1="' + X(f[0]) + '" y1="' + (y - 9) + '" x2="' + X(f[0]) + '" y2="' + (y + 9) + '" class="mt-axis"/><line x1="' + X(f[4]) + '" y1="' + (y - 9) + '" x2="' + X(f[4]) + '" y2="' + (y + 9) + '" class="mt-axis"/><rect x="' + X(f[1]) + '" y="' + (y - 15) + '" width="' + Math.max(1, X(f[3]) - X(f[1])) + '" height="30" class="mt-boxrect' + (i % 2 ? ' two' : '') + '"/><line x1="' + X(f[2]) + '" y1="' + (y - 15) + '" x2="' + X(f[2]) + '" y2="' + (y + 15) + '" class="mt-median"/>';
      alt.push((b.l ? b.l + ': ' : '') + 'whiskers from ' + f[0] + ' to ' + f[4] + ', box from ' + f[1] + ' to ' + f[3] + ', line inside the box at ' + f[2]); });
    return '<svg class="mt-box" viewBox="0 0 ' + w + ' ' + H + '" role="img" aria-label="' + esc('Box plot on a scale from ' + lo + ' to ' + hi + '. ' + alt.join('. ') + '.') + '">' + o + '</svg>';
  }
  function figBars(s) { return (s.fr || []).filter(function (f) { return f[1] > 0 && f[1] <= 24 && f[0] >= 0 && f[0] <= f[1]; }).map(function (f, k) { var b = '<div class="mt-bar" role="img" aria-label="A bar cut into ' + f[1] + ' equal pieces with ' + f[0] + ' shaded">'; for (var i = 0; i < f[1]; i++) b += '<span class="' + (i < f[0] ? (k % 2 ? 'b' : 'a') : '') + '"></span>'; return '<div class="mt-barrow"><span class="mt-barlbl">' + pretty(f[0] + '/' + f[1]) + '</span>' + b + '</div></div>'; }).join(''); }
  function figShape(s) {
    var t = function (x, y, txt, cls, anchor) { return txt ? '<text x="' + x + '" y="' + y + '" text-anchor="' + (anchor || 'middle') + '" class="mt-lbl ' + (cls || '') + '">' + esc(txt) + '</text>' : ''; }, o = '', alt = '';
    if (s.k === 'rtri') { o = '<path d="M50 30V160H230z" class="mt-shape"/><path d="M50 144h16v16" class="mt-thin"/>' + t(40, 100, s.a, '', 'end') + t(140, 182, s.b) + t(152, 86, s.c, '', 'start'); alt = 'Right triangle. Vertical leg ' + (s.a || '') + ', horizontal leg ' + (s.b || '') + ', hypotenuse ' + (s.c || '') + '.'; }
    else if (s.k === 'tri') { var ax = s.iso ? 140 : 170; o = '<path d="M30 160H250L' + ax + ' 30z" class="mt-shape"/>' + (s.ext ? '<line x1="250" y1="160" x2="330" y2="160" class="mt-thin dash"/>' + t(268, 150, s.ext, 'strong', 'start') : '') + t(62, 152, s.A) + (s.ext ? '' : t(222, 152, s.B)) + t(ax, 62, s.C);
      alt = 'Triangle with angles ' + [s.A, s.ext ? '' : s.B, s.C].filter(Boolean).join(', ') + (s.iso ? '; the two sides meeting at the top are equal' : '') + (s.ext ? '; the exterior angle beside the unlabelled base angle is ' + s.ext : '') + '.'; }
    else if (s.k === 'circle') { o = '<circle cx="140" cy="100" r="78" class="mt-shape"/><circle cx="140" cy="100" r="3" class="mt-point"/>' + (s.d ? '<line x1="62" y1="100" x2="218" y2="100" class="mt-median"/>' + t(140, 92, s.d, 'strong') : '<line x1="140" y1="100" x2="218" y2="100" class="mt-median"/>' + t(180, 92, s.r, 'strong')); alt = 'Circle with ' + (s.d ? 'diameter ' + s.d : 'radius ' + s.r) + '.'; }
    else if (s.k === 'prism') { o = '<path d="M40 70H190V170H40z" class="mt-shape"/><path d="M40 70l40 -34h150l-40 34z" class="mt-shape two"/><path d="M190 70l40 -34v100l-40 34z" class="mt-shape three"/>' + t(115, 190, s.l) + t(222, 166, s.w, '', 'start') + t(32, 124, s.h, '', 'end'); alt = 'Rectangular prism. Length ' + s.l + ', width ' + s.w + ', height ' + s.h + '.'; }
    else if (s.k === 'cyl') { o = '<path d="M60 50v110a80 22 0 0 0 160 0v-110" class="mt-shape"/><ellipse cx="140" cy="50" rx="80" ry="22" class="mt-shape two"/><line x1="140" y1="50" x2="' + (/^d/.test(s.r || '') ? 60 : 220) + '" y2="50" class="mt-median"/>' + (/^d/.test(s.r || '') ? '<line x1="140" y1="50" x2="220" y2="50" class="mt-median"/>' : '') + t(140, 22, s.r, 'strong') + t(230, 112, s.h, '', 'start'); alt = 'Cylinder with ' + (s.r || '').replace('r =', 'radius').replace('d =', 'diameter') + ' and height ' + s.h + '.'; }
    else if (s.k === 'cone') { o = '<path d="M60 160L140 24L220 160a80 22 0 0 1 -160 0" class="mt-shape"/><ellipse cx="140" cy="160" rx="80" ry="22" class="mt-shape two"/><line x1="140" y1="24" x2="140" y2="160" class="mt-thin dash"/><line x1="140" y1="160" x2="220" y2="160" class="mt-median"/>' + t(180, 154, s.r, 'strong') + t(132, 100, s.h, '', 'end'); alt = 'Cone with ' + (s.r || '').replace('r =', 'radius') + ' and height ' + s.h + '.'; }
    else if (s.k === 'pyr') { o = '<path d="M40 160h130l50 -34h-130z" class="mt-shape two"/><path d="M40 160L130 26L170 160z" class="mt-shape"/><path d="M170 160L130 26L220 126z" class="mt-shape three"/><line x1="130" y1="26" x2="130" y2="143" class="mt-thin dash"/>' + t(105, 180, s.s) + t(124, 100, s.h, '', 'end'); alt = 'Square-based pyramid with base side ' + s.s + ' and height ' + s.h + '.'; }
    else return '';
    return '<svg class="mt-shapefig" viewBox="0 0 ' + (s.ext ? 340 : 280) + ' 200" role="img" aria-label="' + esc(alt) + '">' + o + '</svg>';
  }
  function findFig(id, course) { if (course && course.figs && course.figs[id]) return course.figs[id]; var all = (W.LearnHub && LearnHub.courses) || []; for (var i = 0; i < all.length; i++) if (all[i].figs && Object.prototype.hasOwnProperty.call(all[i].figs, id) && isMath(all[i])) return all[i].figs[id]; return null; }
  /** swap every  [Figure id]  in the page's text for its figure */
  function placeFigures(root, course) {
    var walker = D.createTreeWalker(root, NodeFilter.SHOW_TEXT), nodes = [], node;
    while ((node = walker.nextNode())) if (node.nodeValue.indexOf('[Figure ') >= 0 && node.parentNode && !node.parentNode.closest('textarea, script, style, .mt-fig, [contenteditable]')) nodes.push(node);
    nodes.forEach(function (nd) {
      var ids = [], text = nd.nodeValue.replace(/\s*\[Figure ([A-Za-z0-9][\w.-]*)\]/g, function (m, id) { if (findFig(id, course)) { ids.push(id); return ''; } return m; });
      if (!ids.length) return; nd.nodeValue = text;
      var host = nd.parentNode; while (host !== root && host.parentNode && host.parentNode !== root && /^(SPAN|STRONG|EM|B|I|A|LABEL|MARK)$/.test(host.tagName)) host = host.parentNode;
      var inside = host.closest('button, .mt-opt, option'), after = inside || host, holder = D.createElement('div'); holder.innerHTML = ids.map(function (id) { return figHTML(findFig(id, course), id); }).join('');
      var ref = after.nextSibling; while (holder.firstChild) after.parentNode.insertBefore(holder.firstChild, ref);
      if (!inside && host !== root && !host.textContent.trim() && !host.querySelector('img, svg, table, input')) host.remove();
    });
  }

  /* =====================================================================
     PRACTICE ROOM
     ===================================================================== */
  var P = null;   // the open practice session
  function pagePractice(parts) {
    var course = LH.findCourse(parts[1]); if (!course || !isMath(course) || !Students.enrolled(course.id)) return false;
    var L = levelFor(course);
    if (parts[2] === 'mix') {
      var poolSkills = []; units(course).forEach(function (u) { var done = (Progress.unit(course.id, u.id).practice) || {}; lessonsOf(u).forEach(function (les) { var p = les.practice; if (!p || !p.skills) return; var seen = (Progress.unit(course.id, u.id).slides || {})[les._idx]; if (done[les._idx] || (seen && seen.length)) p.skills.forEach(function (id) { if (M.SKILLS[id] && poolSkills.indexOf(id) < 0) poolSkills.push(id); }); }); });
      if (!poolSkills.length) units(course).slice(0, 1).forEach(function (u) { lessonsOf(u).forEach(function (les) { ((les.practice || {}).skills || []).forEach(function (id) { if (M.SKILLS[id] && poolSkills.indexOf(id) < 0) poolSkills.push(id); }); }); });
      P = { course: course, mix: true, skills: poolSkills, level: L, tab: 'skill', skill: null, run: 0, count: 0, right: 0 };
      draw(); nextSkill(); return true;
    }
    var unit = LH.findUnit(course, parts[2]); if (!unit) return false;
    var idx = +parts[3] || 0, les = lessonsOf(unit).find(function (l) { return l._idx === idx; }); if (!les || !les.practice) return false;
    var skills = (les.practice.skills || []).filter(function (id) { return M.SKILLS[id]; }), items = les.practice.items || [];
    P = { course: course, unit: unit, les: les, idx: idx, skills: skills, items: items, level: L, tab: items.length ? 'ws' : 'skill', skill: skills[0] || null, wsAt: 0, run: 0 };
    var r = rec(course, unit, idx); var firstOpen = items.findIndex(function (_, i) { return r.ws[i] !== 1; }); P.wsAt = firstOpen < 0 ? 0 : firstOpen;
    if (items.length && firstOpen < 0 && skills.length) P.tab = 'skill';
    draw(); if (P.tab === 'ws') showItem(); else nextSkill();
    return true;
  }
  function draw() {
    var c = P.course, base = '#/course/' + c.id;
    var head = P.mix ? crumbs([{ label: 'Desk', href: '#/' }, { label: c.title, href: base }, { label: 'Mixed review' }]) +
        '<div class="page-head"><div><span class="tag">Mixed review</span><h1 style="margin-top:0.4rem">A bit of everything so far</h1><p class="muted">Questions from the lessons you have opened, in a mixed order. Mixing is harder than repeating one skill, and it is what makes it stick.</p></div></div>'
      : crumbs([{ label: 'Desk', href: '#/' }, { label: c.title, href: base }, { label: P.les.title, href: '#/lesson/' + c.id + '/' + P.unit.id + '/' + P.idx }, { label: 'Practice' }]) +
        '<div class="page-head"><div><span class="tag">Practice</span><h1 style="margin-top:0.4rem">' + esc(P.les.title) + '</h1><p class="muted">Try each one. You get feedback straight away, a hint when you want one, and the worked steps if you are stuck.</p></div>' +
        '<div class="btn-row"><a class="btn ghost" href="#/lesson/' + esc(c.id) + '/' + esc(P.unit.id) + '/' + P.idx + '">← Lesson</a>' + (toolFor(P.les) ? '<a class="btn secondary" href="#/mathlab/' + esc(c.id) + '/' + esc(toolFor(P.les)) + '">' + esc(TOOLS[toolFor(P.les)].name) + '</a>' : '') + '</div></div>';
    var tabs = P.mix ? '' : '<div class="mt-tabs" role="tablist">' + (P.items.length ? '<button type="button" role="tab" class="mt-tab" data-tab="ws" aria-selected="' + (P.tab === 'ws') + '">Worksheet questions <span class="mt-count" id="mtWsCount"></span></button>' : '') +
      (P.skills.length ? '<button type="button" role="tab" class="mt-tab" data-tab="skill" aria-selected="' + (P.tab === 'skill') + '">Skill practice <span class="mt-count" id="mtSkCount"></span></button>' : '') + '</div>';
    app().innerHTML = '<div class="mt-practice" data-mt-page="practice">' + head + tabs + '<div id="mtPicker"></div><div class="mt-stage"><div class="card mt-card" id="mtCard"></div><aside class="mt-side" id="mtSide"></aside></div>' + (Students.isStaffSession && !P.mix ? classTable() : '') + '</div>';
    $$('.mt-tab').forEach(function (b) { b.addEventListener('click', function () { P.tab = b.dataset.tab; draw(); if (P.tab === 'ws') showItem(); else nextSkill(); }); });
    counts(); picker();
  }
  function counts() {
    if (P.mix) return; var s = summary(P.course, P.unit, P.les), a = $('#mtWsCount'), b = $('#mtSkCount');
    if (a) a.textContent = s.done + ' of ' + s.items; if (b) b.textContent = s.starred + ' of ' + s.skills + ' ★';
  }
  function picker() {
    var el = $('#mtPicker'); if (!el) return;
    if (P.mix) { el.innerHTML = '<p class="muted small">' + P.skills.length + ' skills in the mix · this session: <strong id="mtMixScore">' + P.right + ' of ' + P.count + '</strong></p>'; return; }
    var r = rec(P.course, P.unit, P.idx);
    if (P.tab === 'ws') { el.innerHTML = '<div class="mt-dots" aria-label="Worksheet questions">' + P.items.map(function (it, i) { var st = r.ws[i]; return '<button type="button" class="mt-dot' + (st === 1 ? ' ok' : st === 0 ? ' tried' : '') + (i === P.wsAt ? ' on' : '') + '" data-i="' + i + '" aria-label="Question ' + (i + 1) + (st === 1 ? ', done' : '') + '">' + esc(it.n || String(i + 1)) + '</button>'; }).join('') + '</div>';
      $$('.mt-dot', el).forEach(function (b) { b.addEventListener('click', function () { P.wsAt = +b.dataset.i; picker(); showItem(); }); }); return; }
    el.innerHTML = '<div class="mt-chips">' + P.skills.map(function (id) { var st = stars(r.sk[id]); return '<button type="button" class="mt-chip' + (id === P.skill ? ' on' : '') + '" data-id="' + esc(id) + '"><span>' + esc(M.SKILLS[id].name) + '</span><span class="mt-stars" aria-label="' + st + ' of 3 stars">' + starStr(st) + '</span></button>'; }).join('') + '</div>';
    $$('.mt-chip', el).forEach(function (b) { b.addEventListener('click', function () { P.skill = b.dataset.id; P.run = 0; picker(); nextSkill(); }); });
  }
  function side(extra) {
    var el = $('#mtSide'); if (!el) return; var q = P.q || {};
    el.innerHTML = '<div class="card mt-side-card"><div class="mt-run"><span class="mt-run-n" id="mtRun">' + P.run + '</span><span class="muted small">in a row</span></div>' +
      (P.tab === 'skill' && !P.mix && P.skill ? '<p class="small muted">3 in a row earns ★, 5 earns ★★, 8 earns ★★★. Questions get harder as you go, and ease off if you miss two.</p>' : '') +
      '<div class="btn-row" style="justify-content:center"><button type="button" class="btn secondary sm" id="mtOpenCalc">Calculator</button><a class="btn secondary sm" href="#/mathlab/' + esc(P.course.id) + '/formulas">Formulas</a></div>' +
      (q.line || q.balance || q.kind === 'graph' ? '<p class="small muted" style="margin-top:0.6rem">Tip: the Math Lab has a ' + (q.kind === 'graph' ? 'grapher' : q.balance ? 'balance' : 'number line') + ' you can play with.</p>' : '') + (extra || '') + '</div>';
    var oc = $('#mtOpenCalc'); if (oc) oc.addEventListener('click', function () { calcToggle(true); });
  }
  // ----- one question on the card -----
  function showItem() {
    var it = P.items[P.wsAt]; if (!it) return; var r = rec(P.course, P.unit, P.idx);
    P.q = { q: (it.g ? it.g + '\n' : '') + it.q, a: it.a, kind: it.k || 'self', steps: it.s || [], ws: true, tol: it.tol, part: it.part, form: it.f, fig: it.fig }; P.tries = 0; P.hinted = 0;
    card(); side(r.ws[P.wsAt] === 1 ? '<p class="tag ok" style="margin-top:0.6rem">✓ You have done this one</p>' : '');
  }
  function nextSkill(similar) {
    if (!P.skills.length) { $('#mtCard').innerHTML = '<p class="muted">Open a lesson first, then come back for mixed review.</p>'; return; }
    var id = P.mix ? P.skills[Math.floor(Math.random() * P.skills.length)] : P.skill, lv = P.level;
    if (!P.mix) { var s = rec(P.course, P.unit, P.idx).sk[id] || {}; lv = s.lv || P.level; }
    if (similar && P.q && P.q.skill) id = P.q.skill;
    var q = null, guard = 0; do { q = M.make(id, lv); } while (P.q && q.q === P.q.q && ++guard < 6);
    P.q = q; P.q.level = lv; P.tries = 0; P.hinted = 0; card(); side();
  }
  var PADS = { num: ['−', '/', '.', '(', ')', '^', '√', 'π', '%', '×10^', '␣'], expr: ['x', 'y', 'n', '−', '+', '/', '^', '(', ')', '='], pow: ['^', '−', '(', ')', 'x', 'a', 'm', 'y'], pt: ['(', ',', ')', '−', '/', '.'], list: [',', '−', '/', '.'], between: ['−', '/', '.'] };
  function card() {
    var q = P.q, el = $('#mtCard'), body = '';
    var label = q.ws ? 'Worksheet question ' + (P.items[P.wsAt].n || P.wsAt + 1) + (q.part ? ' · Part ' + q.part : '') : M.SKILLS[q.skill].name + (Students.isStaffSession ? ' · Level ' + q.level : '');
    if (q.kind === 'mc') { var opts = shuffle([q.a].concat(q.wrong.slice(0, 3))); body = '<div class="mt-options" role="group" aria-label="Choose one">' + opts.map(function (o) { return '<button type="button" class="btn secondary mt-opt" data-v="' + esc(o) + '">' + pretty(o) + '</button>'; }).join('') + '</div>'; }
    else if (q.kind === 'ops') body = '<div class="mt-options ops" role="group" aria-label="Choose the operation">' + ['+', '−', '×', '÷'].map(function (o) { return '<button type="button" class="btn secondary mt-opt" data-v="' + o + '">' + o + '</button>'; }).join('') + '</div>';
    else if (q.kind === 'order') body = '<p class="small muted">Tap the numbers from least to greatest.</p><div class="mt-order-src" id="mtSrc">' + q.items.map(function (o, i) { return '<button type="button" class="btn secondary mt-ord" data-i="' + i + '">' + pretty(o) + '</button>'; }).join('') + '</div><div class="mt-order-dst" id="mtDst" aria-live="polite"><span class="muted small">Your order appears here</span></div><div class="btn-row"><button type="button" class="btn ghost sm" id="mtOrdReset">Start again</button><button type="button" class="btn" id="mtCheck" disabled>Check</button></div>';
    else if (q.kind === 'line') body = numberLine(q.lo, q.hi, { from: q.from, pick: true }) + '<div class="btn-row"><button type="button" class="btn" id="mtCheck" disabled>Check</button></div>';
    else if (q.kind === 'graph') body = grid({ pick: true }) + '<div class="btn-row"><button type="button" class="btn ghost sm" id="mtGraphReset">Clear points</button><button type="button" class="btn" id="mtCheck" disabled>Check</button></div>';
    else if (q.kind === 'self') body = '<p class="small muted">Work this one out on paper or in your notebook, then compare with the solution.</p><div class="btn-row"><button type="button" class="btn" id="mtReveal">Show the solution</button></div>';
    else body = '<div class="mt-answer"><label for="mtIn" class="mt-pre">' + esc(q.pre || 'Answer') + '</label><input id="mtIn" class="text-input mt-in" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="done"><button type="button" class="btn" id="mtCheck">Check</button></div>' +
      '<div class="mt-pad" aria-label="Math keys">' + (PADS[q.kind] || PADS.num).map(function (k) { return '<button type="button" class="mt-padkey" data-k="' + esc(k === '␣' ? ' ' : k) + '" aria-label="' + esc({ '−': 'negative or minus', '/': 'fraction bar', '^': 'exponent', '␣': 'space, for a mixed number', '×10^': 'times ten to the power of' }[k] || k) + '">' + esc(k === '/' ? 'a/b' : k === '^' ? 'xʸ' : k === '␣' ? 'space' : k) + '</button>'; }).join('') + '</div>' +
      (q.kind === 'num' ? '<p class="small muted mt-how">Fractions: type 3/4. Mixed numbers: 1 1/2. Negative: −5 or -5.</p>' : q.kind === 'expr' || q.kind === 'pow' ? '<p class="small muted mt-how">Exponents: type x^2 for x². Write 3x for 3 times x.</p>' : q.kind === 'pt' ? '<p class="small muted mt-how">Type the point as (x, y).</p>' : '');
    el.innerHTML = '<div class="mt-qhead"><span class="tag">' + esc(label) + '</span>' + (W.LH && LH.speak ? '<button type="button" class="btn ghost sm" id="mtSpeak" aria-label="Read the question aloud">Listen</button>' : '') + '</div>' +
      '<div class="mt-q" id="mtQ">' + pretty(q.q) + '</div>' + (q.fig ? figHTML(typeof q.fig === 'string' ? findFig(q.fig, P.course) : q.fig) : '') + body + '<div class="mt-fb" id="mtFb" aria-live="polite"></div>' +
      '<div class="btn-row mt-actions"><button type="button" class="btn ghost sm" id="mtHint"' + (q.steps && q.steps.length && q.kind !== 'self' ? '' : ' hidden') + '>Hint</button><button type="button" class="btn ghost sm" id="mtSkip">' + (q.ws ? 'Next question →' : 'Skip →') + '</button></div>';
    el.classList.remove('right', 'wrong');
    bindCard();
  }
  function bindCard() {
    var q = P.q, el = $('#mtCard'), input = $('#mtIn', el), picked = [];
    var on = function (sel, fn) { var x = $(sel, el); if (x) x.addEventListener('click', fn); };
    if (input) { input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); answer(input.value); } }); if (!('ontouchstart' in W)) input.focus(); }
    $$('.mt-padkey', el).forEach(function (b) { b.addEventListener('click', function () { var a = input.selectionStart == null ? input.value.length : input.selectionStart, e = input.selectionEnd == null ? a : input.selectionEnd; input.value = input.value.slice(0, a) + b.dataset.k + input.value.slice(e); var p = a + b.dataset.k.length; input.focus(); try { input.setSelectionRange(p, p); } catch (x) {} }); });
    on('#mtCheck', function () {
      if (q.kind === 'order') return answer(picked.map(function (i) { return q.items[i]; }).join(', '));
      if (q.kind === 'line') return answer(String(P.pick));
      if (q.kind === 'graph') return answer(P.points);
      answer(input.value);
    });
    $$('.mt-opt', el).forEach(function (b) { b.addEventListener('click', function () { answer(b.dataset.v, b); }); });
    if (q.kind === 'order') {
      var src = $('#mtSrc', el), dst = $('#mtDst', el), redraw = function () { $$('.mt-ord', src).forEach(function (b) { b.disabled = picked.indexOf(+b.dataset.i) >= 0; }); dst.innerHTML = picked.length ? picked.map(function (i) { return '<span class="mt-ord-chip">' + pretty(q.items[i]) + '</span>'; }).join('<span aria-hidden="true"> &lt; </span>') : '<span class="muted small">Your order appears here</span>'; $('#mtCheck', el).disabled = picked.length !== q.items.length; };
      $$('.mt-ord', src).forEach(function (b) { b.addEventListener('click', function () { picked.push(+b.dataset.i); redraw(); }); });
      on('#mtOrdReset', function () { picked = []; redraw(); });
    }
    if (q.kind === 'line') { P.pick = null; $$('.mt-tick', el).forEach(function (t) { t.addEventListener('click', function () { P.pick = +t.dataset.v; $$('.mt-tick', el).forEach(function (x) { x.classList.toggle('on', x === t); }); $('#mtCheck', el).disabled = false; }); }); }
    if (q.kind === 'graph') { P.points = []; var svg = $('.mt-grid', el); svg.addEventListener('click', function (e) { var pt = gridPoint(svg, e); if (!pt) return; if (P.points.length >= 2) P.points = []; if (P.points.some(function (p) { return p[0] === pt[0] && p[1] === pt[1]; })) return; P.points.push(pt); gridDraw(svg, P.points); $('#mtCheck', el).disabled = P.points.length !== 2; });
      on('#mtGraphReset', function () { P.points = []; gridDraw(svg, []); $('#mtCheck', el).disabled = true; }); }
    on('#mtHint', function () { P.hinted = Math.min(q.steps.length, (P.hinted || 0) + 1); feedback('hint', '<strong>Hint</strong><ol class="mt-steps">' + q.steps.slice(0, Math.min(P.hinted, q.steps.length - 1) || 1).map(function (s) { return '<li>' + pretty(s) + '</li>'; }).join('') + '</ol>'); });
    on('#mtSkip', function () { advance(); });
    on('#mtSpeak', function () { try { LH.speak(String(q.q).replace(/−/g, ' negative ').replace(/×/g, ' times ').replace(/÷/g, ' divided by ')); } catch (e) {} });
    on('#mtReveal', function () { feedback('hint', solution(q) + '<p style="margin-top:0.6rem"><strong>How did you do?</strong></p><div class="btn-row"><button type="button" class="btn" id="mtGot">✓ I got it</button><button type="button" class="btn secondary" id="mtNotYet">Not yet</button></div>');
      $('#mtGot').addEventListener('click', function () { record(true); done(true); }); $('#mtNotYet').addEventListener('click', function () { record(false); done(false, true); }); });
  }
  function solution(q) { return '<div class="mt-solution"><strong>Solution</strong>' + (q.steps && q.steps.length ? '<ol class="mt-steps">' + q.steps.map(function (s) { return '<li>' + pretty(s) + '</li>'; }).join('') + '</ol>' : '') + (q.kind !== 'graph' && q.a !== undefined && q.a !== '' ? '<p class="mt-ans">Answer: <strong>' + pretty((q.pre ? q.pre + ' ' : '') + q.a) + '</strong></p>' : '') + '</div>'; }
  function feedback(kind, html) { var fb = $('#mtFb'); fb.className = 'mt-fb ' + kind; fb.innerHTML = html; }
  function judge(q, value) {
    if (q.kind === 'mc') return { ok: value === q.a };
    if (q.kind === 'ops') return { ok: (q.accept || [q.a]).indexOf(value) >= 0 };
    if (q.kind === 'order') return { ok: value === q.a };
    if (q.kind === 'line') return { ok: M.n(+value) === q.a };
    if (q.kind === 'graph') { var on = value.every(function (p) { return Math.abs(q.m * p[0] + q.b - p[1]) < 1e-9; }); return { ok: on && value.length === 2, msg: on ? '' : value.filter(function (p) { return Math.abs(q.m * p[0] + q.b - p[1]) < 1e-9; }).length ? 'One of your points is on the line. Check the other one.' : '' }; }
    return M.check(value, q.a, q.kind, { lo: q.lo, hi: q.hi, tol: q.tol, sci: q.sci || q.form === 'sci', form: q.form });
  }
  function answer(value, btn) {
    var q = P.q, res = judge(q, value);
    if (res.ok) { record(true); return done(true); }
    if (res.close || (res.msg && /Type an answer|could not read|looking for/.test(res.msg))) return feedback('close', '<strong>' + (res.close ? 'Almost.' : 'Hmm.') + '</strong> ' + esc(res.msg));
    P.tries++; if (btn) btn.disabled = true;
    $('#mtCard').classList.add('wrong'); setTimeout(function () { var c = $('#mtCard'); if (c) c.classList.remove('wrong'); }, 450);
    if (P.tries === 1 && q.kind !== 'mc' || (q.kind === 'mc' && P.tries === 1 && q.wrong.length > 1)) { P.hinted = 1; return feedback('no', '<strong>Not yet.</strong> ' + esc(res.msg || '') + ' Here is a hint, then try again.<ol class="mt-steps"><li>' + pretty(q.steps[0] || 'Read the question again slowly.') + '</li></ol>'); }
    record(false); done(false);
  }
  function record(ok) {
    var q = P.q; if (P.mix) { P.count++; if (ok) P.right++; P.run = ok ? P.run + 1 : 0; var ms = $('#mtMixScore'); if (ms) ms.textContent = P.right + ' of ' + P.count; return; }
    var r = rec(P.course, P.unit, P.idx); r.at = new Date().toISOString();
    if (q.ws) { if (ok) r.ws[P.wsAt] = 1; else if (r.ws[P.wsAt] !== 1) r.ws[P.wsAt] = 0; P.run = ok ? P.run + 1 : 0; }
    else { var s = r.sk[q.skill] = r.sk[q.skill] || { c: 0, t: 0, run: 0, best: 0, lv: P.level, miss: 0 };
      s.t++; if (ok && P.tries === 0 && !P.hinted) { s.c++; s.run++; s.miss = 0; s.best = Math.max(s.best, s.run); if (s.run % 3 === 0 && s.lv < 4) s.lv++; }
      else if (ok) { s.c++; s.miss = 0; }
      else { s.run = 0; s.miss = (s.miss || 0) + 1; if (s.miss >= 2 && s.lv > 1) { s.lv--; s.miss = 0; } }
      P.run = s.run; }
    try { Progress.save(); } catch (e) {}
  }
  function done(ok, quiet) {
    var q = P.q, cardEl = $('#mtCard'); $$('input, .mt-opt, .mt-ord, #mtCheck, .mt-padkey, #mtHint, #mtReveal', cardEl).forEach(function (x) { x.disabled = true; });
    var next = '<div class="btn-row" style="margin-top:0.75rem">' + (!ok && !q.ws ? '<button type="button" class="btn" id="mtSimilar">Try a similar one</button>' : '') + (!ok && q.ws && P.skills.length ? '<button type="button" class="btn secondary" id="mtToSkill">Practise this skill</button>' : '') + '<button type="button" class="btn' + (ok ? '' : ' secondary') + '" id="mtNext">' + (q.ws ? 'Next question →' : 'Next →') + '</button></div>';
    if (ok) { cardEl.classList.add('right'); var s = !q.ws && !P.mix ? rec(P.course, P.unit, P.idx).sk[q.skill] : null, earned = s && [3, 5, 8].indexOf(s.run) >= 0 && s.run === s.best;
      feedback('yes', '<strong>' + ['Correct!', 'Yes!', 'That is it.', 'Nicely done.', 'Right.'][Math.floor(Math.random() * 5)] + '</strong>' + (earned ? ' <span class="mt-earned">' + starStr(stars(s)) + ' ' + ['', 'First star!', 'Two stars!', 'Mastered!'][stars(s)] + '</span>' : P.run >= 2 ? ' ' + P.run + ' in a row.' : '') + (q.steps && q.steps.length && (P.tries || P.hinted) ? solution(q) : '') + next); }
    else feedback('no', (quiet ? '' : '<strong>Not this time.</strong> Read the steps, then try another.') + (quiet ? '<p>That is fine. Read the steps again, then move on or practise the skill.</p>' : solution(q)) + next);
    var go = function (id, fn) { var b = $(id); if (b) b.addEventListener('click', fn); };
    go('#mtNext', advance); go('#mtSimilar', function () { nextSkill(true); }); go('#mtToSkill', function () { P.tab = 'skill'; draw(); nextSkill(); });
    counts(); picker(); var rn = $('#mtRun'); if (rn) rn.textContent = P.run; var nb = $('#mtNext'); if (nb && !('ontouchstart' in W)) nb.focus();
  }
  function advance() {
    if (P.q && P.q.ws) { var r = rec(P.course, P.unit, P.idx), n = P.items.length, k = P.wsAt; for (var i = 1; i <= n; i++) { var j = (k + i) % n; if (r.ws[j] !== 1) { P.wsAt = j; picker(); return showItem(); } }
      $('#mtCard').innerHTML = '<div class="center"><div class="card-icon"></div><h2>Worksheet finished</h2><p class="muted">Every question is done.' + (P.skills.length ? ' Keep going with skill practice to earn stars.' : '') + '</p><div class="btn-row" style="justify-content:center">' + (P.skills.length ? '<button type="button" class="btn" id="mtGoSkill">Skill practice</button>' : '') + '<a class="btn secondary" href="#/lesson/' + esc(P.course.id) + '/' + esc(P.unit.id) + '/' + P.idx + '">Back to the lesson</a></div></div>';
      var g = $('#mtGoSkill'); if (g) g.addEventListener('click', function () { P.tab = 'skill'; draw(); nextSkill(); }); return; }
    nextSkill();
  }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  /** the teacher's view: who has practised this lesson */
  function classTable() {
    var me = Students.current, sec = me && me.staffId ? Sections.currentFor(me.staffId) : null;
    if (!sec || sec.courseId !== P.course.id) return '<p class="muted small" style="margin-top:1rem">Teacher view: choose a section of this course as your working section to see who has practised this lesson.</p>';
    var rows = (sec.students || []).map(function (sid) { var st = (Students.everyone || Students.list || []).find(function (x) { return x.id === sid; }); if (!st) return ''; var pr = Progress.peek(sid), r = (((pr[P.course.id] || {})[P.unit.id] || {}).practice || {})[P.idx] || {}, sk = r.sk || {}, ws = r.ws || {};
      var doneN = P.items.filter(function (_, i) { return ws[i] === 1; }).length, tries = Object.keys(sk).reduce(function (s, k) { return s + (sk[k].t || 0); }, 0), right = Object.keys(sk).reduce(function (s, k) { return s + (sk[k].c || 0); }, 0);
      return '<tr><td>' + esc(st.name) + '</td><td>' + doneN + ' of ' + P.items.length + '</td><td>' + P.skills.map(function (id) { return '<span title="' + esc(M.SKILLS[id].name) + '">' + starStr(stars(sk[id])) + '</span>'; }).join(' ') + '</td><td>' + (tries ? right + ' of ' + tries : '–') + '</td><td>' + (r.at ? new Date(r.at).toLocaleDateString() : '–') + '</td></tr>'; }).join('');
    return '<details class="card" style="margin-top:1.25rem"><summary><strong>Class practice · ' + esc(sec.name) + '</strong> <span class="muted small">only teachers see this</span></summary><table class="md-table" style="margin-top:0.75rem"><thead><tr><th>Student</th><th>Worksheet</th><th>Skills (' + P.skills.length + ')</th><th>Skill questions right</th><th>Last practised</th></tr></thead><tbody>' + (rows || '<tr><td colspan="5">No students in this section yet.</td></tr>') + '</tbody></table><p class="muted small">Practice is for learning: it is not a grade and does not change a level.</p></details>';
  }

  /* ----- drawings shared by practice and the lab ----- */
  function numberLine(lo, hi, o) {
    o = o || {}; var w = 640, pad = 24, n = hi - lo, x = function (v) { return pad + (v - lo) * (w - 2 * pad) / n; }, s = '<svg class="mt-line" viewBox="0 0 ' + w + ' 96" role="group" aria-label="Number line from ' + lo + ' to ' + hi + '"><line x1="' + pad + '" y1="52" x2="' + (w - pad) + '" y2="52" class="mt-axis"/>';
    for (var v = lo; v <= hi; v++) { var major = v % (n > 20 ? 5 : 2) === 0 || n <= 12;
      s += '<g class="mt-tick' + (o.from === v ? ' from' : '') + (o.mark === v ? ' on' : '') + '" data-v="' + v + '"' + (o.pick ? ' tabindex="0" role="button" aria-label="' + v + '"' : '') + '><rect x="' + (x(v) - (w - 2 * pad) / n / 2) + '" y="20" width="' + (w - 2 * pad) / n + '" height="64" class="mt-hit"/><line x1="' + x(v) + '" y1="' + (v === 0 ? 38 : 44) + '" x2="' + x(v) + '" y2="' + (v === 0 ? 66 : 60) + '" class="mt-axis"/><circle cx="' + x(v) + '" cy="52" r="7" class="mt-dotmark"/>' + (major ? '<text x="' + x(v) + '" y="84" text-anchor="middle" class="mt-lbl">' + M.n(v) + '</text>' : '') + '</g>'; }
    if (o.hop) { var a = x(o.hop[0]), b = x(o.hop[1]); s += '<path d="M' + a + ' 44 Q' + (a + b) / 2 + ' ' + (44 - Math.min(40, Math.abs(b - a) / 3 + 12)) + ' ' + b + ' 44" class="mt-hop" marker-end="url(#mtArrow)"/><defs><marker id="mtArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" class="mt-arrowhead"/></marker></defs>'; }
    return s + '</svg>';
  }
  var G = { n: 8, size: 360, pad: 20 };
  function gx(v) { return G.pad + (v + G.n) * (G.size - 2 * G.pad) / (2 * G.n); } function gy(v) { return G.pad + (G.n - v) * (G.size - 2 * G.pad) / (2 * G.n); }
  function grid(o) {
    var s = '<svg class="mt-grid' + (o && o.pick ? ' pick' : '') + '" viewBox="0 0 ' + G.size + ' ' + G.size + '" role="img" aria-label="Coordinate grid from −8 to 8. Tap two points.">';
    for (var i = -G.n; i <= G.n; i++) { s += '<line x1="' + gx(i) + '" y1="' + gy(-G.n) + '" x2="' + gx(i) + '" y2="' + gy(G.n) + '" class="' + (i === 0 ? 'mt-axis' : 'mt-gridline') + '"/><line x1="' + gx(-G.n) + '" y1="' + gy(i) + '" x2="' + gx(G.n) + '" y2="' + gy(i) + '" class="' + (i === 0 ? 'mt-axis' : 'mt-gridline') + '"/>';
      if (i && i % 2 === 0) s += '<text x="' + gx(i) + '" y="' + (gy(0) + 13) + '" text-anchor="middle" class="mt-lbl sm">' + M.n(i) + '</text><text x="' + (gx(0) - 5) + '" y="' + (gy(i) + 4) + '" text-anchor="end" class="mt-lbl sm">' + M.n(i) + '</text>'; }
    return s + '<text x="' + (gx(G.n) - 2) + '" y="' + (gy(0) - 6) + '" text-anchor="end" class="mt-lbl sm">x</text><text x="' + (gx(0) + 6) + '" y="' + (gy(G.n) + 10) + '" class="mt-lbl sm">y</text><g class="mt-plot"></g></svg>';
  }
  function gridPoint(svg, e) { var r = svg.getBoundingClientRect(), k = G.size / r.width, px = (e.clientX - r.left) * k, py = (e.clientY - r.top) * k, step = (G.size - 2 * G.pad) / (2 * G.n), x = Math.round((px - G.pad) / step) - G.n, y = G.n - Math.round((py - G.pad) / step); return Math.abs(x) <= G.n && Math.abs(y) <= G.n ? [x, y] : null; }
  function lineSeg(m, b, cls) { var pts = []; [-G.n, G.n].forEach(function (x) { var y = m * x + b; if (Math.abs(y) <= G.n) pts.push([x, y]); }); if (m !== 0) [-G.n, G.n].forEach(function (y) { var x = (y - b) / m; if (Math.abs(x) < G.n) pts.push([x, y]); }); if (pts.length < 2) return ''; pts.sort(function (p, q) { return p[0] - q[0]; }); var a = pts[0], z = pts[pts.length - 1]; return '<line x1="' + gx(a[0]) + '" y1="' + gy(a[1]) + '" x2="' + gx(z[0]) + '" y2="' + gy(z[1]) + '" class="mt-plotline ' + (cls || '') + '"/>'; }
  function gridDraw(svg, pts, lines) {
    var s = (lines || []).map(function (l) { return lineSeg(l.m, l.b, l.cls); }).join('');
    if (pts.length === 2 && pts[0][0] !== pts[1][0]) { var m = (pts[1][1] - pts[0][1]) / (pts[1][0] - pts[0][0]); s += lineSeg(m, pts[0][1] - m * pts[0][0]); }
    else if (pts.length === 2) s += '<line x1="' + gx(pts[0][0]) + '" y1="' + gy(-G.n) + '" x2="' + gx(pts[0][0]) + '" y2="' + gy(G.n) + '" class="mt-plotline"/>';
    s += pts.map(function (p) { return '<circle cx="' + gx(p[0]) + '" cy="' + gy(p[1]) + '" r="6" class="mt-point"/><text x="' + (gx(p[0]) + 9) + '" y="' + (gy(p[1]) - 8) + '" class="mt-lbl sm">(' + M.n(p[0]) + ', ' + M.n(p[1]) + ')</text>'; }).join('');
    $('.mt-plot', svg).innerHTML = s;
  }

  /* =====================================================================
     MATH LAB
     ===================================================================== */
  // every formula of the course, with each way of rearranging it.  f[letter] = how to find that letter from the others
  var FORMULAS = [
    ['Number', 'Rate of change', 'rate = change ÷ time', { r: ['rate of change', '(b − a) / t'], a: ['start value', 'b − r·t'], b: ['end value', 'a + r·t'], t: ['time', '(b − a) / r'] }],
    ['Number', 'Percent of an amount', 'part = percent × whole', { p: ['part', 'c/100 · w'], c: ['percent (%)', 'p / w · 100'], w: ['whole', 'p / (c/100)'] }],
    ['Number', 'Percent change', 'change % = (new − old) ÷ old × 100', { c: ['percent change (%)', '(n − o) / o · 100'], n: ['new value', 'o·(1 + c/100)'], o: ['old value', 'n / (1 + c/100)'] }],
    ['Number', 'Unit rate', 'unit rate = cost ÷ quantity', { u: ['unit rate', 'c / q'], c: ['cost', 'u·q'], q: ['quantity', 'c / u'] }],
    ['Number', 'Celsius and Fahrenheit', 'F = 9/5·C + 32', { F: ['degrees Fahrenheit', '9/5·C + 32'], C: ['degrees Celsius', '5/9·(F − 32)'] }],
    ['Linear relations', 'Slope from two points', 'm = (y₂ − y₁) ÷ (x₂ − x₁)', { m: ['slope', '(d − b) / (c − a)'], a: ['x₁', 'c − (d − b)/m'], b: ['y₁', 'd − m·(c − a)'], c: ['x₂', 'a + (d − b)/m'], d: ['y₂', 'b + m·(c − a)'] }],
    ['Linear relations', 'Equation of a line', 'y = mx + b', { y: ['y', 'm·x + b'], m: ['slope (rate of change)', '(y − b) / x'], x: ['x', '(y − b) / m'], b: ['y-intercept (initial value)', 'y − m·x'] }],
    ['Geometry', 'Angles in a triangle', 'a + b + c = 180°', { a: ['angle a', '180 − b − c'], b: ['angle b', '180 − a − c'], c: ['angle c', '180 − a − b'] }],
    ['Geometry', 'Circumference of a circle', 'C = 2πr', { C: ['circumference', '2·π·r'], r: ['radius', 'C / (2·π)'] }],
    ['Geometry', 'Area of a circle', 'A = πr²', { A: ['area', 'π·r^2'], r: ['radius', '√(A / π)'] }],
    ['Geometry', 'Area of a rectangle', 'A = l × w', { A: ['area', 'l·w'], l: ['length', 'A / w'], w: ['width', 'A / l'] }],
    ['Geometry', 'Area of a triangle', 'A = b × h ÷ 2', { A: ['area', 'b·h / 2'], b: ['base', '2·A / h'], h: ['height', '2·A / b'] }],
    ['Geometry', 'Pythagorean theorem', 'a² + b² = c²', { c: ['hypotenuse', '√(a^2 + b^2)'], a: ['leg a', '√(c^2 − b^2)'], b: ['leg b', '√(c^2 − a^2)'] }],
    ['Geometry', 'Volume of a rectangular prism', 'V = l × w × h', { V: ['volume', 'l·w·h'], l: ['length', 'V / (w·h)'], w: ['width', 'V / (l·h)'], h: ['height', 'V / (l·w)'] }],
    ['Geometry', 'Volume of any prism', 'V = (area of base) × h', { V: ['volume', 'B·h'], B: ['area of the base', 'V / h'], h: ['height', 'V / B'] }],
    ['Geometry', 'Volume of a pyramid', 'V = (area of base) × h ÷ 3', { V: ['volume', 'B·h / 3'], B: ['area of the base', '3·V / h'], h: ['height', '3·V / B'] }],
    ['Geometry', 'Volume of a cylinder', 'V = πr²h', { V: ['volume', 'π·r^2·h'], r: ['radius', '√(V / (π·h))'], h: ['height', 'V / (π·r^2)'] }],
    ['Geometry', 'Volume of a cone', 'V = πr²h ÷ 3', { V: ['volume', 'π·r^2·h / 3'], r: ['radius', '√(3·V / (π·h))'], h: ['height', '3·V / (π·r^2)'] }],
    ['Geometry', 'Scaling', 'lengths × k, areas × k², volumes × k³', { k: ['scale factor', '√(A)'], A: ['area factor', 'k^2'], V: ['volume factor', 'k^3'] }, 'one'],
    ['Data', 'Interquartile range', 'IQR = Q3 − Q1', { I: ['IQR', 'b − a'], a: ['Q1', 'b − I'], b: ['Q3', 'a + I'] }],
    ['Money', 'Simple interest', 'I = Prt', { I: ['interest', 'P·r/100·t'], P: ['principal (amount borrowed)', 'I / (r/100·t)'], r: ['rate (% per year)', 'I / (P·t) · 100'], t: ['time (years)', 'I / (P·r/100)'] }],
    ['Money', 'Compound interest', 'A = P(1 + i)ⁿ', { A: ['amount owed or saved', 'P·(1 + r/100)^n'], P: ['principal', 'A / (1 + r/100)^n'] }, { r: 'rate (% per year)', n: 'number of years' }],
    ['Money', 'Appreciation and depreciation', 'value = start × multiplierⁿ', { v: ['value after n years', 's·(1 + r/100)^n'], s: ['starting value', 'v / (1 + r/100)^n'] }, { r: 'rate (% per year; negative for depreciation)', n: 'number of years' }],
    ['Money', 'Budget balance', 'balance = income − spending − saving', { b: ['balance', 'i − e − s'], i: ['income', 'b + e + s'], e: ['spending', 'i − s − b'], s: ['saving', 'i − e − b'] }]
  ];
  var nice = function (f) { return String(f).replace(/\^2/g, '²').replace(/\^3/g, '³').replace(/\^n/g, 'ⁿ'); };
  var TOOLS = {
    formulas: { name: 'Formula sheet', icon: '', draw: toolFormulas },
    grapher: { name: 'Line grapher', icon: '', draw: toolGrapher },
    numberline: { name: 'Number line', icon: '', draw: toolLine },
    balance: { name: 'Equation balance', icon: '', draw: toolBalance },
    fractions: { name: 'Fraction bars', icon: '', draw: toolFractions },
    data: { name: 'Data and box plot', icon: '', draw: toolData },
    money: { name: 'Interest and growth', icon: '', draw: toolMoney },
    convert: { name: 'Unit converter', icon: '', draw: toolConvert }
  };
  function toolFor(les) { var t = les && les.practice && les.practice.tool; return TOOLS[t] ? t : null; }
  function pageLab(parts) {
    var course = LH.findCourse(parts[1]); if (!course || !isMath(course) || !Students.enrolled(course.id)) return false;
    var tool = TOOLS[parts[2]] ? parts[2] : 'formulas';
    app().innerHTML = '<div class="mt-lab" data-mt-page="lab">' + crumbs([{ label: 'Desk', href: '#/' }, { label: course.title, href: '#/course/' + course.id }, { label: 'Math Lab' }]) +
      '<div class="page-head"><div><span class="tag">Math Lab</span><h1 style="margin-top:0.4rem">' + esc(TOOLS[tool].name) + '</h1><p class="muted">Tools to see the math, test an idea and check your thinking. Nothing here is marked.</p></div></div>' +
      '<div class="mt-tabs" role="tablist">' + Object.keys(TOOLS).map(function (k) { return '<a role="tab" class="mt-tab" aria-selected="' + (k === tool) + '" href="#/mathlab/' + esc(course.id) + '/' + k + '">' + TOOLS[k].icon + ' ' + esc(TOOLS[k].name) + '</a>'; }).join('') + '</div><div class="card mt-tool" id="mtTool"></div></div>';
    TOOLS[tool].draw($('#mtTool')); return true;
  }
  var numIn = function (id, label, v, extra) { return '<label class="mt-field"><span>' + label + '</span><input class="text-input" id="' + id + '" type="text" inputmode="decimal" autocomplete="off" value="' + esc(v == null ? '' : v) + '"' + (extra || '') + '></label>'; };
  var read = function (id) { var el = $('#' + id); if (!el || !el.value.trim()) return null; try { return M.val(M.evaluate(M.parse(el.value))); } catch (e) { return NaN; } };
  function toolFormulas(el) {
    var groups = []; FORMULAS.forEach(function (f) { if (groups.indexOf(f[0]) < 0) groups.push(f[0]); });
    el.innerHTML = '<div class="mt-formulas"><div class="mt-flist">' + groups.map(function (g) { return '<div class="plan-label">' + esc(g) + '</div>' + FORMULAS.map(function (f, i) { return f[0] === g ? '<button type="button" class="mt-fbtn" data-i="' + i + '"><strong>' + esc(f[1]) + '</strong><span>' + esc(f[2]) + '</span></button>' : ''; }).join(''); }).join('') + '</div><div class="mt-fwork" id="mtFwork"><p class="muted">Pick a formula. Fill in what you know, leave one box empty, and the sheet finds it and shows the formula rearranged for that letter.</p></div></div>';
    $$('.mt-fbtn', el).forEach(function (b) { b.addEventListener('click', function () { $$('.mt-fbtn', el).forEach(function (x) { x.classList.toggle('on', x === b); }); open(+b.dataset.i); }); });
    function open(i) {
      var f = FORMULAS[i], vars = Object.keys(f[3]), extra = typeof f[4] === 'object' ? f[4] : {}, all = vars.concat(Object.keys(extra)), work = $('#mtFwork');
      work.innerHTML = '<h2>' + esc(f[1]) + '</h2><p class="mt-formula">' + esc(f[2]) + '</p><div class="mt-fields">' + all.map(function (v) { return numIn('mtF_' + v, '<b>' + esc(v) + '</b> · ' + esc(extra[v] || f[3][v][0])); }).join('') + '</div><div class="btn-row"><button type="button" class="btn" id="mtFsolve">Find the empty one</button><button type="button" class="btn ghost" id="mtFclear">Clear</button></div><div class="mt-fb" id="mtFout" aria-live="polite"></div>' +
        '<details style="margin-top:1rem"><summary>Every form of this formula</summary><ul class="mt-forms">' + vars.map(function (v) { return '<li><strong>' + esc(v) + ' = ' + esc(nice(f[3][v][1])) + '</strong> <span class="muted small">to find the ' + esc(f[3][v][0]) + '</span></li>'; }).join('') + '</ul></details>';
      $('#mtFclear').addEventListener('click', function () { all.forEach(function (v) { $('#mtF_' + v).value = ''; }); $('#mtFout').innerHTML = ''; });
      $('#mtFsolve').addEventListener('click', function () {
        var env = {}, empty = [], out = $('#mtFout'), bad = false; all.forEach(function (v) { var x = read('mtF_' + v); if (x === null) empty.push(v); else if (isNaN(x)) bad = true; else env[v] = x; });
        out.className = 'mt-fb close';
        if (bad) { out.textContent = 'One of the boxes is not a number I can read.'; return; }
        if (f[4] === 'one') { var known = vars.filter(function (v) { return v in env; }); if (known.length !== 1) { out.textContent = 'Fill in exactly one box.'; return; } var k = known[0] === 'k' ? env.k : known[0] === 'A' ? Math.sqrt(env.A) : Math.cbrt(env.V); out.className = 'mt-fb yes'; out.innerHTML = 'Scale factor k = <strong>' + esc(M.dec(k)) + '</strong> · lengths × ' + esc(M.dec(k)) + ' · areas × ' + esc(M.dec(k * k)) + ' · volumes × ' + esc(M.dec(k * k * k)); return; }
        if (empty.length !== 1) { out.textContent = empty.length ? 'Leave exactly one box empty. Right now ' + empty.length + ' are empty.' : 'Leave the box you want to find empty.'; return; }
        var target = empty[0]; if (!f[3][target]) { out.textContent = 'This sheet can find ' + vars.join(' or ') + ' for this formula. Leave one of those empty.'; return; }
        try { var res = M.val(M.evaluate(M.parse(f[3][target][1]), env)); if (!isFinite(res)) throw new Error('That does not work with these numbers'); out.className = 'mt-fb yes';
          out.innerHTML = '<div>Rearranged: <strong>' + esc(target + ' = ' + nice(f[3][target][1])) + '</strong></div><div>Substitute: ' + esc(nice(target + ' = ' + f[3][target][1].replace(/[a-zA-Z]/g, function (c) { return c in env ? '(' + M.dec(env[c]) + ')' : c; }).replace(/\((\d[\d.]*)\)/g, '$1'))) + '</div><div class="mt-ans">' + esc(f[3][target][0]) + ': <strong>' + esc(target + ' = ' + M.dec(M.round(res, 4))) + '</strong></div>';
          $('#mtF_' + target).value = String(M.round(res, 4)); }
        catch (e) { out.textContent = e.message + '.'; }
      });
    }
  }
  function toolGrapher(el) {
    var st = { m1: 2, b1: 1, m2: -1, b2: 4, two: false };
    el.innerHTML = '<div class="mt-two"><div>' + grid() + '</div><div><p class="mt-formula" id="mtG1"></p>' + slider('mtM1', 'slope (rate of change)', -5, 5, 0.5, st.m1) + slider('mtB1', 'y-intercept (initial value)', -8, 8, 1, st.b1) +
      '<label class="mt-check"><input type="checkbox" id="mtTwo"> Compare with a second line</label><div id="mtSecond" hidden><p class="mt-formula two" id="mtG2"></p>' + slider('mtM2', 'slope', -5, 5, 0.5, st.m2) + slider('mtB2', 'y-intercept', -8, 8, 1, st.b2) + '</div><div id="mtGinfo"></div></div></div>';
    function upd() {
      st.m1 = +$('#mtM1').value; st.b1 = +$('#mtB1').value; st.m2 = +$('#mtM2').value; st.b2 = +$('#mtB2').value; st.two = $('#mtTwo').checked; $('#mtSecond').hidden = !st.two;
      var eq = function (m, b) { return 'y = ' + M.linear(M.evaluate(String(m)), b); };
      $('#mtG1').textContent = eq(st.m1, st.b1); $('#mtG2').textContent = eq(st.m2, st.b2);
      $$('.mt-slider output', el).forEach(function (o) { o.textContent = M.n(+$('#' + o.dataset.f).value); });
      gridDraw($('.mt-grid', el), [], [{ m: st.m1, b: st.b1 }].concat(st.two ? [{ m: st.m2, b: st.b2, cls: 'two' }] : []));
      var info = '<table class="md-table"><thead><tr><th>x</th><th>' + esc(eq(st.m1, st.b1)) + '</th>' + (st.two ? '<th>' + esc(eq(st.m2, st.b2)) + '</th>' : '') + '</tr></thead><tbody>' + [-2, -1, 0, 1, 2, 3].map(function (x) { return '<tr><td>' + M.n(x) + '</td><td>' + M.n(st.m1 * x + st.b1) + '</td>' + (st.two ? '<td>' + M.n(st.m2 * x + st.b2) + '</td>' : '') + '</tr>'; }).join('') + '</tbody></table>';
      info += '<p class="small">' + (st.m1 > 0 ? 'The line rises: y goes up ' + M.n(st.m1) + ' for every 1 across.' : st.m1 < 0 ? 'The line falls: y goes down ' + M.n(-st.m1) + ' for every 1 across.' : 'A slope of 0 gives a horizontal line.') + ' It crosses the y-axis at ' + M.n(st.b1) + '.</p>';
      if (st.two) info += '<p class="small"><strong>' + (st.m1 === st.m2 ? (st.b1 === st.b2 ? 'The same line: every point is shared.' : 'Parallel lines: same slope, so they never meet.') : 'Point of intersection: (' + M.dec(M.round((st.b2 - st.b1) / (st.m1 - st.m2), 2)) + ', ' + M.dec(M.round(st.m1 * (st.b2 - st.b1) / (st.m1 - st.m2) + st.b1, 2)) + ')') + '</strong></p>';
      $('#mtGinfo').innerHTML = info;
    }
    $$('input', el).forEach(function (i) { i.addEventListener('input', upd); }); upd();
  }
  function slider(id, label, lo, hi, step, v) { return '<label class="mt-slider"><span>' + esc(label) + ' <output data-f="' + id + '"></output></span><input type="range" id="' + id + '" min="' + lo + '" max="' + hi + '" step="' + step + '" value="' + v + '"></label>'; }
  function toolLine(el) {
    el.innerHTML = '<div class="mt-fields">' + numIn('mtLa', 'Start at', '-3') + '<label class="mt-field"><span>Operation</span><select class="text-input" id="mtLop"><option value="+">add (+)</option><option value="-">subtract (−)</option></select></label>' + numIn('mtLb', 'this integer', '-5') + '</div><div id="mtLout"></div>';
    function upd() { var a = Math.round(read('mtLa')), b = Math.round(read('mtLb')), sub = $('#mtLop').value === '-', out = $('#mtLout');
      if (isNaN(a) || isNaN(b) || Math.abs(a) > 20 || Math.abs(b) > 20) { out.innerHTML = '<p class="muted">Use integers from −20 to 20.</p>'; return; }
      var res = sub ? a - b : a + b, move = sub ? -b : b, lo = Math.min(a, res, 0) - 2, hi = Math.max(a, res, 0) + 2;
      out.innerHTML = '<p class="mt-formula">' + esc(M.n(a) + (sub ? ' − ' : ' + ') + (b < 0 ? '(' + M.n(b) + ')' : M.n(b)) + ' = ' + M.n(res)) + '</p>' + numberLine(lo, hi, { from: a, mark: res, hop: [a, res] }) +
        '<p>' + (sub ? 'Subtracting is adding the opposite: ' + esc(M.n(a) + ' + ' + (move < 0 ? '(' + M.n(move) + ')' : M.n(move))) + '. ' : '') + 'Start at ' + esc(M.n(a)) + ' and move ' + Math.abs(move) + (move >= 0 ? ' to the right' : ' to the left') + '. You land on <strong>' + esc(M.n(res)) + '</strong>.</p>'; }
    $$('input, select', el).forEach(function (i) { i.addEventListener('input', upd); }); upd();
  }
  function toolBalance(el) {
    var eq, hist, first;
    function fresh() { var q = M.make(Math.random() < 0.5 ? 'eq-two-step' : 'eq-multi', 2); if (!q.balance) return fresh(); eq = Object.assign({}, q.balance); first = Object.assign({}, eq); hist = []; show(); }
    var side = function (a, b) { return a === 0 ? M.n(b) : M.linear(a, b); };
    function show(msg) {
      var solved = eq.a === 1 && eq.b === 0 && eq.c === 0 || eq.c === 1 && eq.d === 0 && eq.a === 0;
      el.innerHTML = '<p class="muted">Whatever you do to one side, do to the other. Keep going until x is alone.</p><div class="mt-balance' + (solved ? ' solved' : '') + '"><div class="mt-pan">' + esc(side(eq.a, eq.b)) + '</div><div class="mt-pivot">=</div><div class="mt-pan">' + esc(side(eq.c, eq.d)) + '</div></div>' +
        (solved ? '<p class="mt-fb yes"><strong>Solved: x = ' + esc(M.dec(eq.a === 1 ? eq.d : eq.b)) + '</strong> in ' + hist.length + ' step' + (hist.length === 1 ? '' : 's') + '.</p>' : '<div class="mt-fields"><label class="mt-field"><span>Do this to both sides</span><select class="text-input" id="mtBop"><option value="-">subtract</option><option value="+">add</option><option value="/">divide by</option><option value="*">multiply by</option></select></label>' + numIn('mtBn', 'a number', '') + '<label class="mt-field"><span>of</span><select class="text-input" id="mtBwhat"><option value="n">ones (a number)</option><option value="x">x’s</option></select></label></div><div class="btn-row"><button type="button" class="btn" id="mtBdo">Do it to both sides</button></div>') +
        (msg ? '<p class="mt-fb close">' + esc(msg) + '</p>' : '') + (hist.length ? '<ol class="mt-steps">' + hist.map(function (h) { return '<li>' + esc(h) + '</li>'; }).join('') + '</ol>' : '') + '<div class="btn-row"><button type="button" class="btn secondary" id="mtBnew">New equation</button>' + (hist.length ? '<button type="button" class="btn ghost" id="mtBundo">Start this one again</button>' : '') + '</div>';
      $('#mtBnew').addEventListener('click', fresh); var u = $('#mtBundo'); if (u) u.addEventListener('click', function () { eq = Object.assign({}, first); hist = []; show(); });
      var d = $('#mtBdo'); if (d) d.addEventListener('click', function () {
        var o = $('#mtBop').value, k = read('mtBn'), what = $('#mtBwhat').value; if (k === null || isNaN(k) || k === 0 && (o === '/' || o === '*')) return show('Type a number first' + (k === 0 ? ' (not zero).' : '.'));
        if ((o === '/' || o === '*') && what === 'x') return show('Multiply or divide by a number, not by x.');
        var r = function (v) { return M.round(v, 6); };
        if (o === '+' || o === '-') { var s = o === '+' ? k : -k; if (what === 'x') { eq.a = r(eq.a + s); eq.c = r(eq.c + s); } else { eq.b = r(eq.b + s); eq.d = r(eq.d + s); } }
        else { var f = o === '*' ? k : 1 / k; eq.a = r(eq.a * f); eq.b = r(eq.b * f); eq.c = r(eq.c * f); eq.d = r(eq.d * f); }
        hist.push(({ '+': 'Add ', '-': 'Subtract ', '*': 'Multiply by ', '/': 'Divide by ' })[o] + M.n(k) + (what === 'x' && (o === '+' || o === '-') ? 'x' : '') + ':   ' + side(eq.a, eq.b) + ' = ' + side(eq.c, eq.d)); show();
      });
    }
    fresh();
  }
  function toolFractions(el) {
    el.innerHTML = '<div class="mt-fields">' + numIn('mtFa', 'First fraction', '2/3') + numIn('mtFb', 'Second fraction', '3/4') + '</div><div id="mtFrOut"></div>';
    var bar = function (r, cls) { var s = '<div class="mt-bar" role="img" aria-label="' + r.n + ' of ' + r.d + ' equal pieces">'; for (var i = 0; i < r.d; i++) s += '<span class="' + (i < r.n ? cls : '') + '"></span>'; return s + '</div>'; };
    function upd() { var out = $('#mtFrOut'), a, b; try { a = M.evaluate(M.parse($('#mtFa').value)); b = M.evaluate(M.parse($('#mtFb').value)); } catch (e) { out.innerHTML = '<p class="muted">Type two fractions such as 2/3 and 3/4.</p>'; return; }
      if (typeof a !== 'object' || typeof b !== 'object' || a.n < 0 || b.n < 0 || a.n > a.d || b.n > b.d || a.d > 16 || b.d > 16) { out.innerHTML = '<p class="muted">Use fractions between 0 and 1 with denominators up to 16.</p>'; return; }
      var l = a.d * b.d / M.gcd(a.d, b.d), fa = { n: a.n * l / a.d, d: l }, fb = { n: b.n * l / b.d, d: l }, sum = M.evaluate(M.parse(M.fr(a.n, a.d) + '+' + M.fr(b.n, b.d))), prod = M.evaluate(M.parse('(' + M.fr(a.n, a.d) + ')(' + M.fr(b.n, b.d) + ')'));
      out.innerHTML = '<div class="mt-barrow"><span class="mt-barlbl">' + pretty(M.fr(a.n, a.d)) + '</span>' + bar(a, 'a') + '</div><div class="mt-barrow"><span class="mt-barlbl">' + pretty(M.fr(b.n, b.d)) + '</span>' + bar(b, 'b') + '</div>' +
        '<p><strong>Same-size pieces:</strong> cut both into ' + l + 'ths (the lowest common denominator).</p><div class="mt-barrow"><span class="mt-barlbl">' + pretty(fa.n + '/' + l) + '</span>' + bar(fa, 'a') + '</div><div class="mt-barrow"><span class="mt-barlbl">' + pretty(fb.n + '/' + l) + '</span>' + bar(fb, 'b') + '</div>' +
        '<table class="md-table"><tbody><tr><td>Which is greater?</td><td><strong>' + (fa.n === fb.n ? 'They are equal' : pretty(fa.n > fb.n ? M.fr(a.n, a.d) : M.fr(b.n, b.d))) + '</strong> (' + fa.n + ' pieces against ' + fb.n + ')</td></tr><tr><td>Sum</td><td>' + pretty(fa.n + '/' + l + ' + ' + fb.n + '/' + l + ' = ' + M.show(sum).frac || M.show(sum).dec) + pretty(M.show(sum).mixed ? ' = ' + M.show(sum).mixed : '') + '</td></tr><tr><td>Difference</td><td>' + pretty(Math.max(fa.n, fb.n) + '/' + l + ' − ' + Math.min(fa.n, fb.n) + '/' + l + ' = ' + M.fr(Math.abs(fa.n - fb.n), l)) + '</td></tr><tr><td>Product</td><td>' + pretty(M.fr(a.n, a.d) + ' × ' + M.fr(b.n, b.d) + ' = ' + (M.show(prod).frac || M.show(prod).dec)) + ' (a part of a part, so it is smaller than both)</td></tr></tbody></table>'; }
    $$('input', el).forEach(function (i) { i.addEventListener('input', upd); }); upd();
  }
  function toolData(el) {
    el.innerHTML = '<label class="mt-field wide"><span>Type your data, separated by commas or spaces</span><input class="text-input" id="mtData" type="text" autocomplete="off" value="52, 58, 61, 65, 68, 70, 72, 75, 80, 84, 95"></label><div id="mtDout"></div>';
    function upd() { var d = $('#mtData').value.replace(/−/g, '-').split(/[\s,;]+/).filter(Boolean).map(Number), out = $('#mtDout');
      if (d.length < 4 || d.some(isNaN)) { out.innerHTML = '<p class="muted">Enter at least four numbers.</p>'; return; }
      d.sort(function (a, b) { return a - b; }); var n = d.length, med = function (a) { var m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; }, h = n >> 1, q1 = med(d.slice(0, h)), q3 = med(d.slice(n - h)), m = med(d), mean = d.reduce(function (s, x) { return s + x; }, 0) / n, counts = {}; d.forEach(function (x) { counts[x] = (counts[x] || 0) + 1; }); var top = Math.max.apply(null, Object.keys(counts).map(function (k) { return counts[k]; })), mode = top > 1 ? Object.keys(counts).filter(function (k) { return counts[k] === top; }).join(', ') : 'none';
      var lo = d[0], hi = d[n - 1], span = hi - lo || 1, w = 620, x = function (v) { return 30 + (v - lo) * (w - 60) / span; };
      out.innerHTML = '<p class="small muted">In order: ' + esc(d.map(M.n).join(', ')) + ' (' + n + ' values)</p><svg class="mt-box" viewBox="0 0 ' + w + ' 110" role="img" aria-label="Box plot: minimum ' + lo + ', Q1 ' + q1 + ', median ' + m + ', Q3 ' + q3 + ', maximum ' + hi + '"><line x1="' + x(lo) + '" y1="45" x2="' + x(q1) + '" y2="45" class="mt-axis"/><line x1="' + x(q3) + '" y1="45" x2="' + x(hi) + '" y2="45" class="mt-axis"/><line x1="' + x(lo) + '" y1="32" x2="' + x(lo) + '" y2="58" class="mt-axis"/><line x1="' + x(hi) + '" y1="32" x2="' + x(hi) + '" y2="58" class="mt-axis"/><rect x="' + x(q1) + '" y="22" width="' + Math.max(1, x(q3) - x(q1)) + '" height="46" class="mt-boxrect"/><line x1="' + x(m) + '" y1="22" x2="' + x(m) + '" y2="68" class="mt-median"/>' +
        [[lo, 'min'], [q1, 'Q1'], [m, 'median'], [q3, 'Q3'], [hi, 'max']].map(function (p, i) { return '<text x="' + x(p[0]) + '" y="' + (i % 2 ? 100 : 86) + '" text-anchor="middle" class="mt-lbl sm">' + p[1] + ' ' + M.n(p[0]) + '</text>'; }).join('') + '</svg>' +
        '<table class="md-table"><thead><tr><th>Minimum</th><th>Q1</th><th>Median</th><th>Q3</th><th>Maximum</th><th>IQR</th><th>Range</th><th>Mean</th><th>Mode</th></tr></thead><tbody><tr>' + [lo, q1, m, q3, hi, q3 - q1, hi - lo, M.round(mean, 2)].map(function (v) { return '<td>' + M.n(v) + '</td>'; }).join('') + '<td>' + esc(mode) + '</td></tr></tbody></table><p class="small muted">Half of the data is inside the box. The median splits the data in two; Q1 and Q3 are the medians of each half.</p>'; }
    $('#mtData').addEventListener('input', upd); upd();
  }
  function toolMoney(el) {
    el.innerHTML = '<div class="mt-fields">' + numIn('mtP', 'Starting amount ($)', '2000') + numIn('mtR', 'Rate per year (%; negative to lose value)', '6') + numIn('mtY', 'Years', '5') + '</div><div id="mtMout"></div>';
    function upd() { var P0 = read('mtP'), r = read('mtR'), y = Math.round(read('mtY')), out = $('#mtMout'); if (!(P0 > 0) || isNaN(r) || !(y >= 1) || y > 40 || r <= -100 || r > 100) { out.innerHTML = '<p class="muted">Use an amount above 0, a rate between −100 and 100, and 1 to 40 years.</p>'; return; }
      var rows = [], mx = 0, mn = P0; for (var k = 0; k <= y; k++) { var s = P0 * (1 + r / 100 * k), c = P0 * Math.pow(1 + r / 100, k); rows.push([k, s, c]); mx = Math.max(mx, s, c); mn = Math.min(mn, s, c); }
      var w = 620, h = 220, X = function (k) { return 44 + k * (w - 60) / y; }, Y = function (v) { return h - 26 - (v - Math.min(mn, 0)) * (h - 44) / ((mx - Math.min(mn, 0)) || 1); }, path = function (i) { return rows.map(function (rw, k) { return (k ? 'L' : 'M') + X(rw[0]) + ' ' + Y(Math.max(0, rw[i])); }).join(' '); };
      out.innerHTML = '<svg class="mt-chart" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="Simple and compound growth over ' + y + ' years"><line x1="44" y1="' + (h - 26) + '" x2="' + (w - 16) + '" y2="' + (h - 26) + '" class="mt-axis"/><line x1="44" y1="10" x2="44" y2="' + (h - 26) + '" class="mt-axis"/><path d="' + path(1) + '" class="mt-plotline two" fill="none"/><path d="' + path(2) + '" class="mt-plotline" fill="none"/><text x="50" y="20" class="mt-lbl sm">' + esc(M.money(M.round(mx, 0))) + '</text><text x="' + (w - 18) + '" y="' + (h - 8) + '" text-anchor="end" class="mt-lbl sm">' + y + ' years</text></svg>' +
        '<p class="small"><span class="mt-key-line"></span> compound (the percent is taken on the new amount each year) &nbsp; <span class="mt-key-line two"></span> simple (the percent is always taken on the starting amount)</p>' +
        '<table class="md-table"><thead><tr><th>Year</th><th>Simple</th><th>Compound</th><th>Difference</th></tr></thead><tbody>' + rows.filter(function (rw, i) { return y <= 10 || i % Math.ceil(y / 10) === 0 || i === y; }).map(function (rw) { return '<tr><td>' + rw[0] + '</td><td>' + esc(M.money(M.round(Math.max(0, rw[1]), 2))) + '</td><td>' + esc(M.money(M.round(rw[2], 2))) + '</td><td>' + esc(M.money(M.round(rw[2] - Math.max(0, rw[1]), 2))) + '</td></tr>'; }).join('') + '</tbody></table>'; }
    $$('input', el).forEach(function (i) { i.addEventListener('input', upd); }); upd();
  }
  var CONV = { Length: { mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, ft: 0.3048, yd: 0.9144, mi: 1609.344 }, Mass: { g: 0.001, kg: 1, oz: 0.0283495, lb: 0.453592 }, Capacity: { mL: 0.001, L: 1, 'cup (US)': 0.236588, 'gal (US)': 3.78541 }, Area: { 'cm²': 0.0001, 'm²': 1, 'km²': 1e6, 'ft²': 0.092903, hectare: 10000, acre: 4046.86 }, Volume: { 'cm³': 0.000001, 'm³': 1, L: 0.001, mL: 0.000001 }, Speed: { 'm/s': 1, 'km/h': 1 / 3.6, 'mi/h': 0.44704 } };
  function toolConvert(el) {
    el.innerHTML = '<div class="mt-fields"><label class="mt-field"><span>Kind</span><select class="text-input" id="mtCk">' + Object.keys(CONV).map(function (k) { return '<option>' + k + '</option>'; }).join('') + '<option>Temperature</option></select></label>' + numIn('mtCv', 'Amount', '6.5') + '<label class="mt-field"><span>From</span><select class="text-input" id="mtCf"></select></label><label class="mt-field"><span>To</span><select class="text-input" id="mtCt"></select></label></div><div id="mtCout"></div>';
    function fill() { var k = $('#mtCk').value, u = k === 'Temperature' ? ['°C', '°F'] : Object.keys(CONV[k]); $('#mtCf').innerHTML = $('#mtCt').innerHTML = u.map(function (x) { return '<option>' + esc(x) + '</option>'; }).join(''); $('#mtCt').selectedIndex = Math.min(1, u.length - 1); if (k === 'Length') { $('#mtCf').value = 'ft'; $('#mtCt').value = 'm'; } upd(); }
    function upd() { var k = $('#mtCk').value, v = read('mtCv'), f = $('#mtCf').value, t = $('#mtCt').value, out = $('#mtCout'); if (v === null || isNaN(v)) { out.innerHTML = '<p class="muted">Type an amount.</p>'; return; }
      if (k === 'Temperature') { var res = f === t ? v : f === '°C' ? v * 9 / 5 + 32 : (v - 32) * 5 / 9; out.innerHTML = '<p class="mt-formula">' + esc(M.dec(v) + ' ' + f + ' = ' + M.dec(M.round(res, 2)) + ' ' + t) + '</p><p class="small muted">' + (f === '°C' ? 'F = 9/5 × C + 32' : 'C = 5/9 × (F − 32)') + '</p>'; return; }
      var factor = CONV[k][f] / CONV[k][t]; out.innerHTML = '<p class="mt-formula">' + esc(M.dec(v) + ' ' + f + ' = ' + M.dec(M.round(v * factor, 4)) + ' ' + t) + '</p><p class="small muted">1 ' + esc(f) + ' = ' + esc(M.dec(parseFloat(factor.toPrecision(5)))) + ' ' + esc(t) + ', so multiply by ' + esc(M.dec(parseFloat(factor.toPrecision(5)))) + '.' + (k === 'Area' || k === 'Volume' ? ' Area and volume factors are the length factor squared or cubed.' : '') + '</p>'; }
    $('#mtCk').addEventListener('change', fill); $$('input, #mtCf, #mtCt', el).forEach(function (i) { i.addEventListener('input', upd); }); fill();
  }

  /* =====================================================================
     HOOKS — add the tools to the pages the app draws
     ===================================================================== */
  function decorate() {
    var a = app(); if (!a) return; var ctx = context(); publish(ctx); fab(ctx);
    if (!signedIn()) return;
    // our own pages: the app's router does not know them and draws "Page not found"
    if ((ctx.page === 'practice' || ctx.page === 'mathlab') && !$('[data-mt-page]', a)) {
      if (/Page not found/.test(a.textContent) || !a.firstChild) { var ok = false; try { ok = ctx.page === 'practice' ? pagePractice(ctx.parts) : pageLab(ctx.parts); } catch (e) { console.error('mathtools', e); a.innerHTML = '<div class="empty"><h2>The math page could not be drawn</h2><p class="muted small">' + esc(e.message) + '</p><a class="btn" href="#/">Back</a></div>'; ok = true; }
        if (ok) { W.scrollTo(0, 0); var cc = ctx.course && ctx.course.color; if (cc && /^#[0-9a-f]{3,8}$/i.test(cc)) D.documentElement.style.setProperty('--course', cc); } }
      return;
    }
    if (ctx.math || ctx.page === 'print') placeFigures(a, ctx.math ? ctx.course : null);
    if (!ctx.math) return;
    if (ctx.page === 'lesson' && !$('#mtPracticeTile', a)) {
      var unit = LH.findUnit(ctx.course, ctx.parts[2]), les = unit && lessonsOf(unit).find(function (l) { return l._idx === (+ctx.parts[3] || 0); }), grid0 = $('.lesson-parts', a);
      if (les && les.practice && grid0) { var s = summary(ctx.course, unit, les), el = D.createElement('a'); el.id = 'mtPracticeTile'; el.className = 'card link part mt-tile'; el.href = '#/practice/' + ctx.course.id + '/' + unit.id + '/' + les._idx;
        var allDone = s.items && s.done >= s.items && s.starred >= s.skills;
        el.innerHTML = '<div class="card-icon"></div><h3>Practice</h3><p class="muted small">' + (s.items ? s.items + ' worksheet questions, marked as you go' : '') + (s.items && s.skills ? ' · ' : '') + (s.skills ? s.skills + ' skill' + (s.skills === 1 ? '' : 's') + ' with endless questions' : '') + '.</p>' +
          (allDone ? '<span class="tag ok">✓ Done · ' + s.mastered + ' mastered</span>' : s.tried ? '<span class="tag accent">' + (s.items ? s.done + ' of ' + s.items + ' · ' : '') + s.starred + ' of ' + s.skills + ' ★</span>' : '<span class="tag">Not started</span>');
        var first = grid0.children[1] || null; grid0.insertBefore(el, first); }
    }
    if (ctx.page === 'course' && !$('#mtBar', a)) {
      var bar = D.createElement('div'); bar.id = 'mtBar'; bar.className = 'card mt-bar-card';
      bar.innerHTML = '<div class="mt-bar-row"><strong>Math tools</strong><span class="btn-row"><button type="button" class="btn secondary sm" id="mtBarCalc">Calculator</button><a class="btn secondary sm" href="#/mathlab/' + esc(ctx.course.id) + '/formulas">Formula sheet and Math Lab</a><a class="btn secondary sm" href="#/practice/' + esc(ctx.course.id) + '/mix">Mixed review</a></span></div>' + (Students.isStaffSession ? switches(ctx.course) : '');
      var anchor = $('.page-head', a); if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(bar, anchor.nextSibling); else a.insertBefore(bar, a.firstChild);
      $('#mtBarCalc', bar).addEventListener('click', function () { calcToggle(true); });
      $$('input[data-sec]', bar).forEach(function (cb) { cb.addEventListener('change', function () { var patch = {}; patch[cb.dataset.f] = cb.checked; Sections.update(cb.dataset.sec, patch); toast('Calculator ' + (cb.checked ? 'on' : 'off') + ' for ' + (cb.dataset.f === 'calcTest' ? 'unit tests' : 'lesson quizzes') + ' in ' + cb.dataset.name + '.'); }); });
    }
  }
  /** the teacher's switches: one row per section of this course */
  function switches(course) {
    var me = Students.current, secs = Sections.visible(me.role === 'master' ? 'master' : me.staffId).filter(function (s) { return s.courseId === course.id; });
    if (!secs.length) return '<p class="muted small" style="margin:0.5rem 0 0">Teacher: when you create a section of this course, the calculator switches for quizzes and tests appear here.</p>';
    return '<div class="mt-switches"><div class="plan-label">Calculator during assessments · only teachers see this</div>' + secs.map(function (s) { var c = function (f, label) { return '<label class="mt-check"><input type="checkbox" data-sec="' + esc(s.id) + '" data-name="' + esc(s.name) + '" data-f="' + f + '"' + (s[f] !== false ? ' checked' : '') + '> ' + label + '</label>'; };
      return '<div class="mt-switch-row"><span><strong>' + esc(s.name) + '</strong>' + (s.term ? ' <span class="muted small">' + esc(s.term) + '</span>' : '') + '</span>' + c('calcQuiz', 'on lesson quizzes') + c('calcTest', 'on unit tests') + '</div>'; }).join('') + '<p class="muted small" style="margin:0.35rem 0 0">The calculator is always there in lessons, practice and assignments. When a switch is off, students see “Calculator off” during that quiz or test. A popped-out calculator pauses during every quiz and test.</p></div>';
  }
  var pending = false;
  function schedule() { if (pending) return; pending = true; Promise.resolve().then(function () { pending = false; try { decorate(); } catch (e) { console.error('mathtools', e); } }); }
  function start() {
    var a = app(); if (!a) return;
    new MutationObserver(schedule).observe(a, { childList: true, subtree: true });
    W.addEventListener('hashchange', function () { setTimeout(schedule, 0); });
    W.addEventListener('cloud:change', schedule);
    schedule();
  }
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', start); else start();
  W.MathTools = { figure: figHTML, placeFigures: placeFigures, calc: calcToggle, popOut: calcPop, isMath: isMath, TOOLS: TOOLS, FORMULAS: FORMULAS, pretty: pretty };
})();
