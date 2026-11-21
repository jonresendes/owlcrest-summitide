/* Summitide Learning · mathcore.js — the math engine shared by every mathematics course.
   No page code here: this file only knows numbers.
     MathCore.parse / evaluate   a safe expression reader (never eval): fractions stay exact
     MathCore.check              is a student's answer equal to the key? (numbers, fractions, expressions, points, lists)
     MathCore.SKILLS             question generators: endless practice with worked steps, by skill and level
   Loaded by index.html, by calculator.html (the pop-out calculator) and by the course build script in Node. */
(function (root) {
  'use strict';
  var M = {};
  var MINUS = '−';

  /* ---------- exact fractions ---------- */
  function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { var t = a % b; a = b; b = t; } return a || 1; }
  function R(n, d) { d = d === undefined ? 1 : d; if (d < 0) { n = -n; d = -d; } var g = gcd(n, d); return { n: n / g, d: d / g }; }
  var isR = function (x) { return x && typeof x === 'object'; };
  var val = function (x) { return isR(x) ? x.n / x.d : x; };
  var safe = function (x) { return Number.isSafeInteger(x.n) && Number.isSafeInteger(x.d) && Math.abs(x.n) < 1e14 && x.d < 1e14; };
  function fromNum(x) {            // a typed decimal such as 0.75 is exact: 3/4
    if (Number.isInteger(x)) return R(x, 1);
    var s = String(x); if (/e/i.test(s)) return x;
    var k = (s.split('.')[1] || '').length; if (k > 9) return x;
    return R(Math.round(x * Math.pow(10, k)), Math.pow(10, k));
  }
  function op(a, b, o) {
    if (isR(a) && isR(b)) {
      var r;
      if (o === '+') r = R(a.n * b.d + b.n * a.d, a.d * b.d);
      else if (o === '-') r = R(a.n * b.d - b.n * a.d, a.d * b.d);
      else if (o === '*') r = R(a.n * b.n, a.d * b.d);
      else if (o === '/') { if (b.n === 0) throw new Error('Cannot divide by zero'); r = R(a.n * b.d, a.d * b.n); }
      else if (o === '^') {
        if (b.d === 1 && Math.abs(b.n) <= 64) { var e = Math.abs(b.n), pn = Math.pow(a.n, e), pd = Math.pow(a.d, e);
          if (b.n < 0 && a.n === 0) throw new Error('Cannot divide by zero');
          r = b.n >= 0 ? { n: pn, d: pd } : R(pd, pn); if (Number.isFinite(pn) && Number.isFinite(pd) && safe(r)) return R(r.n, r.d); }
        return Math.pow(val(a), val(b));
      }
      if (r && safe(r)) return r;
    }
    var x = val(a), y = val(b);
    if (o === '+') return x + y; if (o === '-') return x - y; if (o === '*') return x * y;
    if (o === '/') { if (y === 0) throw new Error('Cannot divide by zero'); return x / y; }
    return Math.pow(x, y);
  }

  /* ---------- reading an expression ---------- */
  var SUPS = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-', '⁺': '+', 'ⁿ': 'n', 'ˣ': 'x' };
  function clean(s) {
    s = String(s == null ? '' : s).replace(/[−–—]/g, '-').replace(/[×·•∙]/g, '*').replace(/÷/g, '/').replace(/[“”"]/g, '').replace(/,(?=\d{3}(\D|$))/g, '');
    s = s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺ⁿˣ]+/g, function (m) { return '^(' + m.split('').map(function (c) { return SUPS[c]; }).join('') + ')'; });
    s = s.replace(/(\d) (?=\d{3}(\D|$))/g, '$1');                 // 149 600 000
    s = s.replace(/(\d+)\s+(\d+)\s*\/\s*(\d+)/g, '($1+$2/$3)');    // mixed number 2 1/3
    s = s.replace(/-\(\((\d+)\+/g, '-(($1+');                    // (kept: −(2+1/3) handled by the sign rule below)
    return s;
  }
  function tokenize(src) {
    var s = clean(src), out = [], i = 0, m;
    // a leading minus on a mixed number applies to the whole of it: −2 1/3 = −(2 + 1/3)
    while (i < s.length) {
      var c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      if ((m = /^(\d+\.?\d*|\.\d+)/.exec(s.slice(i)))) { out.push({ t: 'num', v: parseFloat(m[1]), raw: m[1] }); i += m[1].length; continue; }
      if ((m = /^(sqrt|cbrt|abs|asin|acos|atan|sin|cos|tan|log|ln|pi)/i.exec(s.slice(i)))) { var w = m[1].toLowerCase(); out.push(w === 'pi' ? { t: 'const', v: Math.PI } : { t: 'fn', v: w }); i += w.length; continue; }
      if (c === 'π') { out.push({ t: 'const', v: Math.PI }); i++; continue; }
      if (c === '√') { out.push({ t: 'fn', v: 'sqrt' }); i++; continue; }
      if (c === '∛') { out.push({ t: 'fn', v: 'cbrt' }); i++; continue; }
      if (/[a-zA-Z]/.test(c)) { out.push({ t: 'var', v: c }); i++; continue; }
      if ('+-*/^()%'.indexOf(c) >= 0) { out.push({ t: c }); i++; continue; }
      throw new Error('I do not understand “' + c + '”');
    }
    return out;
  }
  /** parse → a tree; evaluate(tree, vars) → exact fraction {n,d} or a decimal. */
  function parse(src) {
    var tk = tokenize(src), p = 0;
    if (!tk.length) throw new Error('Nothing to work out');
    var peek = function () { return tk[p]; }, eat = function (t) { if (tk[p] && tk[p].t === t) { p++; return true; } return false; };
    function expr() { var a = term(); while (peek() && (peek().t === '+' || peek().t === '-')) { var o = tk[p++].t; a = { o: o, a: a, b: term() }; } return a; }
    function term() {
      var a = unary();
      for (;;) { var k = peek(); if (!k) break;
        if (k.t === '*' || k.t === '/') { p++; a = { o: k.t, a: a, b: unary() }; }
        else if (k.t === 'num' || k.t === 'var' || k.t === '(' || k.t === 'fn' || k.t === 'const') a = { o: '*', a: a, b: power(), imp: true };   // 2x, 3(x + 1)
        else break; }
      return a;
    }
    function unary() { if (eat('-')) return { o: 'neg', a: unary() }; if (eat('+')) return unary(); return power(); }
    function power() { var b = post(); if (eat('^')) { var e = eat('-') ? { o: 'neg', a: power() } : power(); return { o: '^', a: b, b: e }; } return b; }
    function post() { var a = atom(); while (eat('%')) a = { o: '/', a: a, b: { num: 100, raw: '100' } }; return a; }
    function atom() {
      var k = tk[p++]; if (!k) throw new Error('Something is missing at the end');
      if (k.t === 'num') return { num: k.v, raw: k.raw };
      if (k.t === 'const') return { cst: k.v };
      if (k.t === 'var') return { v: k.v };
      if (k.t === 'fn') { var arg = peek() && peek().t === '(' ? atom() : power(); return { fn: k.v, a: arg }; }
      if (k.t === '(') { var e = expr(); if (!eat(')')) throw new Error('A bracket is not closed'); return { grp: e }; }
      throw new Error('I did not expect “' + k.t + '” there');
    }
    var tree = expr(); if (p < tk.length) throw new Error('I did not expect “' + (tk[p].t === 'num' ? tk[p].raw : tk[p].v || tk[p].t) + '” there');
    return tree;
  }
  function evaluate(t, vars) {
    if (typeof t === 'string') t = parse(t);
    if ('num' in t) return fromNum(t.num);
    if ('cst' in t) return t.cst;
    if ('v' in t) { if (!vars || !(t.v in vars)) throw new Error('What is ' + t.v + '?'); var x = vars[t.v]; return typeof x === 'number' ? fromNum(x) : x; }
    if ('grp' in t) return evaluate(t.grp, vars);
    if (t.fn) { var a = val(evaluate(t.a, vars));
      if (t.fn === 'sqrt') { if (a < 0) throw new Error('No real square root of a negative number'); var r = Math.sqrt(a); return Number.isInteger(r) ? R(r) : r; }
      if (t.fn === 'cbrt') { var c = Math.cbrt(a); return Number.isInteger(c) ? R(c) : c; }
      var D = Math.PI / 180, tidy = function (v) { var q = Math.round(v * 1e12) / 1e12; return Number.isInteger(q) ? R(q) : q; };
      if (t.fn === 'sin') return tidy(Math.sin(a * D)); if (t.fn === 'cos') return tidy(Math.cos(a * D));
      if (t.fn === 'tan') { if (Math.abs(Math.cos(a * D)) < 1e-12) throw new Error('tan is undefined there'); return tidy(Math.tan(a * D)); }
      if (t.fn === 'asin') return tidy(Math.asin(a) / D); if (t.fn === 'acos') return tidy(Math.acos(a) / D); if (t.fn === 'atan') return tidy(Math.atan(a) / D);
      if (t.fn === 'log' || t.fn === 'ln') { if (a <= 0) throw new Error('No logarithm of zero or a negative number'); return tidy(t.fn === 'log' ? Math.log10(a) : Math.log(a)); }
      return Math.abs(a); }
    if (t.o === 'neg') return op(R(0), evaluate(t.a, vars), '-');
    return op(evaluate(t.a, vars), evaluate(t.b, vars), t.o);
  }
  function varsOf(t, set) { set = set || {}; if (!t || typeof t !== 'object') return set; if ('v' in t) set[t.v] = 1; ['a', 'b', 'grp'].forEach(function (k) { if (t[k]) varsOf(t[k], set); }); return set; }
  function termCount(t) { if (!t) return 0; if ('grp' in t) return 1; if (t.o === '+' || t.o === '-') return termCount(t.a) + termCount(t.b); return 1; }
  function hasGroup(t) { if (!t || typeof t !== 'object') return false; if ('grp' in t) return !('num' in t.grp) && !(t.grp.o === 'neg' && 'num' in t.grp.a); return ['a', 'b'].some(function (k) { return hasGroup(t[k]); }); }

  /* ---------- writing numbers ---------- */
  function n(x) { x = Math.round(x * 1e10) / 1e10; return (x < 0 ? MINUS : '') + String(Math.abs(x)); }          // −5
  function np(x) { return x < 0 ? '(' + n(x) + ')' : n(x); }                                                  // (−5)
  function fr(a, b) { var r = R(a, b); return r.d === 1 ? n(r.n) : (r.n < 0 ? MINUS : '') + Math.abs(r.n) + '/' + r.d; }   // −3/4
  function mixed(a, b) { var r = R(a, b); if (r.d === 1 || Math.abs(r.n) < r.d) return fr(a, b); var w = Math.trunc(Math.abs(r.n) / r.d); return (r.n < 0 ? MINUS : '') + w + ' ' + (Math.abs(r.n) % r.d) + '/' + r.d; }
  function money(x) { return (x < 0 ? MINUS : '') + '$' + Math.abs(x).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ').replace(/\.00$/, ''); }
  function round(x, k) { var f = Math.pow(10, k || 0); return Math.round((x + Number.EPSILON) * f) / f; }
  function sup(e) { return String(e).split('').map(function (c) { return { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' }[c] || c; }).join(''); }
  function sci(x) { if (x === 0) return '0'; var e = Math.floor(Math.log10(Math.abs(x))), m = round(x / Math.pow(10, e), 6); if (Math.abs(m) >= 10) { m /= 10; e++; } return n(m) + ' × 10' + sup(e); }
  /** a result for the calculator: exact fraction when there is one, and a tidy decimal */
  function show(x) {
    if (isR(x)) return { exact: true, frac: x.d === 1 ? null : fr(x.n, x.d), mixed: x.d !== 1 && Math.abs(x.n) > x.d ? mixed(x.n, x.d) : null, dec: dec(x.n / x.d), value: x.n / x.d };
    return { exact: false, frac: null, mixed: null, dec: dec(x), value: x };
  }
  function dec(x) { if (!Number.isFinite(x)) return 'undefined'; var a = Math.abs(x); if (a !== 0 && (a >= 1e12 || a < 1e-7)) return sci(x); return n(parseFloat(x.toPrecision(12))); }
  function linear(m, b, v) {            // 3x − 2,  −x + 5,  2/3x + 1
    v = v || 'x'; var mm = typeof m === 'object' ? m : R(m), s = '';
    if (mm.n !== 0) s = (mm.n === mm.d ? '' : mm.n === -mm.d ? MINUS : fr(mm.n, mm.d)) + v;
    if (b !== 0 || !s) s += (s ? (b < 0 ? ' ' + MINUS + ' ' : ' + ') + n(Math.abs(b)) : n(b));
    return s;
  }

  /* ---------- checking an answer ----------
     key: the answer string from the course or a generator.  kind:
       num   a plain number (fraction, mixed number, decimal, percent, scientific notation); not an unfinished calculation
       expr  an algebraic expression or equation, equal for every value of its letters and no longer than the key
       pow   a single power, written as one (4⁸)
       pt    a point (3, 9)          list  values in order        set  values in any order
       text  words                    between  any number strictly between lo and hi
     Returns { ok, close, msg } — close means "right idea, one more step" (not reduced, missing sign…). */
  var UNIT = /(°[CF]?|%|\$|km\/h|m\/s|cm³|cm²|cm\^3|cm\^2|m³|m²|mm|cm|km|mL|kg|\b(?:m|g|L|h|s|min|years?|days?|hours?|units?|degrees?|litres?|metres?|dollars?|lb|in|ft|mi|scoops?|batches)\b)/g;
  var UWORD = '(?:°C|[a-zA-Z]{1,6})\\/[a-zA-Z]{1,6}|mm|cm|km|mL|kg|lb|in|ft|mi|gal|GB|MB|min|years?|days?|hours?|weeks?|months?|seconds?|minutes?|litres?|metres?|dollars?|units?|degrees?|scoops?|batches|cups?|square units|cubic units';
  var URE = new RegExp('([\\d)])\\s*(?:(?:' + UWORD + ')|\\s[mgLhs])(?:\\^?[23]|[²³])?(?:\\s*\\([^)]*\\))?\\s*$');
  function stripUnits(s) { return String(s).replace(/\b(US|CA|C)\$/g, '').replace(/\$/g, '').replace(/≈|about|approximately/gi, '').replace(/(\d)\s*°\s*[CF]?(?![\/a-zA-Z])/g, '$1').replace(/\s°C(?=\/)/, ' C').replace(URE, '$1').trim(); }
  function plainNumber(s) {
    var c = clean(s).replace(/\s+/g, '');
    return /^[+-]?(\d+\.?\d*|\.\d+)%?$/.test(c) || /^[+-]?\d+\/\d+$/.test(c) || /^[+-]?\(\d+\+\d+\/\d+\)$/.test(c) || /^[+-]?(\d+\.?\d*)\*10\^\(?[+-]?\d+\)?$/.test(c) || /^[+-]?\(?[+-]?\d+\)?\/\(?[+-]?\d+\)?$/.test(c);
  }
  function near(a, b, tol) { return Math.abs(a - b) <= (tol !== undefined ? tol : 1e-9 * Math.max(1, Math.abs(a), Math.abs(b))); }
  function numVal(s) { return val(evaluate(parse(stripUnits(s)))); }
  function eqSides(s) { var parts = String(s).split('='); return parts.map(function (x) { return x.trim(); }).filter(Boolean); }
  function sameExpr(a, b) {
    var ta = parse(a), tb = parse(b), vs = Object.keys(varsOf(tb, varsOf(ta))), pts = [0.37, 1.61, -2.23, 3.9, -0.71];
    for (var i = 0; i < pts.length; i++) { var env = {}; vs.forEach(function (v, k) { env[v] = pts[(i + k * 2) % pts.length] + k * 0.13; });
      var x, y; try { x = val(evaluate(ta, env)); y = val(evaluate(tb, env)); } catch (e) { continue; }
      if (!near(x, y, 1e-7 * Math.max(1, Math.abs(y)))) return false; }
    return true;
  }
  function ntok(x) { return tokenize(x).filter(function (k) { return k.t !== '(' && k.t !== ')'; }).length; }
  function check(input, key, kind, opt) {
    opt = opt || {}; input = String(input == null ? '' : input).trim();
    if (!input) return { ok: false, msg: 'Type an answer first.' };
    try {
      if (kind === 'text') { var norm = function (s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }; var keys = [key].concat(opt.alt || []);
        return { ok: keys.some(function (k) { return norm(k) === norm(input); }) }; }
      if (kind === 'between') { var v = numVal(input); return { ok: v > opt.lo && v < opt.hi, msg: v > opt.lo && v < opt.hi ? '' : 'That is not between the two numbers.' }; }
      if (kind === 'pt' || kind === 'list' || kind === 'set') {
        var split = function (s) { return String(s).replace(/^[\s(\[]+|[\s)\]]+$/g, '').split(/[,;]|\band\b/).map(function (x) { return x.trim(); }).filter(Boolean); };
        var A = split(input), K = split(key); if (A.length !== K.length) return { ok: false, msg: 'I am looking for ' + K.length + ' values, separated by commas.' };
        var av = A.map(numVal), kv = K.map(numVal); if (kind === 'set') { av.sort(function (x, y) { return x - y; }); kv.sort(function (x, y) { return x - y; }); }
        return { ok: av.every(function (x, i) { return near(x, kv[i], opt.tol); }) };
      }
      if (kind === 'pow') { var cn = function (s) { return clean(s).replace(/\s+/g, '').replace(/\^\((-?\w+)\)/g, '^$1').replace(/\*/g, ''); };
        if (cn(input) === cn(key)) return { ok: true };
        var same = false; try { same = sameExpr(input, key); } catch (e) {}
        return { ok: false, close: same, msg: same ? 'That has the right value. Write it as a single power.' : '' }; }
      if (kind === 'expr') {
        var ki = eqSides(key), ii = eqSides(input), kx = ki[ki.length - 1], ix = ii[ii.length - 1];
        if (ki.length === 2 && ii.length === 2 && !sameExpr(ii[0], ki[0])) { if (sameExpr(ii[0], kx) && sameExpr(ix, ki[0])) return { ok: true }; return { ok: false }; }
        if (!sameExpr(ix, kx)) return { ok: false };
        if (opt.form === 'posexp' && /\^\(?-/.test(clean(ix))) return { ok: false, close: true, msg: 'Equivalent. Now rewrite it using only positive exponents.' };
        var ti = parse(ix), tkk = parse(kx);
        if (termCount(ti) > termCount(tkk) || (hasGroup(ti) && !hasGroup(tkk)) || ntok(ix) > ntok(kx) + 2) return { ok: false, close: true, msg: 'Equivalent, but it can be simplified further.' };
        return { ok: true };
      }
      // num
      var ks = stripUnits(key), is = stripUnits(input);
      var i2 = eqSides(is); if (i2.length === 2 && /^[a-zA-Z]$/.test(i2[0])) is = i2[1];     // "x = 4"
      var k2 = eqSides(ks); if (k2.length === 2) ks = k2[1];
      var pctKey = /%\s*$/.test(ks); if (pctKey) { ks = ks.replace(/%\s*$/, ''); var hadPct = /%\s*$/.test(is); is = is.replace(/%\s*$/, ''); }
      var kvv = val(evaluate(parse(ks))), ivv; try { ivv = val(evaluate(parse(is))); } catch (e1) { is = is.replace(/\s*[a-zA-Z°²³\/]+[23]?\s*$/, ''); ivv = val(evaluate(parse(is))); }
      var tol = opt.tol; if (tol === undefined) { var dm = /\.(\d+)\s*%?$/.exec(clean(ks)); tol = dm && !/\//.test(ks) ? 0.5 * Math.pow(10, -dm[1].length) + 1e-9 : undefined; if (opt.exact) tol = undefined; }
      if (!near(ivv, kvv, tol)) { if (near(ivv, -kvv, tol) && kvv !== 0) return { ok: false, close: true, msg: 'Right size. Check the sign.' };
        if (pctKey && !hadPct && near(ivv * 100, kvv, tol)) return { ok: true };      // 0.4 for 40%
        return { ok: false }; }
      if (!plainNumber(is)) return { ok: false, close: true, msg: 'That equals the answer. Finish the calculation and enter one number.' };
      var fm = /^([+-]?)\(?([+-]?\d+)\)?\/\(?([+-]?\d+)\)?$/.exec(clean(is).replace(/\s+/g, ''));
      if (fm && opt.lowest !== false && (gcd(+fm[2], +fm[3]) > 1 || +fm[2] === 0) && Math.abs(+fm[3]) !== 1) return { ok: false, close: true, msg: /\//.test(ks) ? 'Correct value. Now write it in lowest terms.' : 'That equals the answer. Finish the calculation and enter one number.' };
      var bare = clean(is).replace(/\s+/g, ''), rawIn = String(is).replace(/[−–]/g, '-').trim();
      if (opt.form === 'mixed' && !Number.isInteger(kvv) && !/^-?\d+\s+\d+\/\d+$/.test(rawIn)) return { ok: false, close: true, msg: 'Right value. Write it as a mixed number, such as 2 1/3.' };
      if ((opt.form === 'improper' || opt.form === 'frac') && !Number.isInteger(kvv) && !/^[+-]?\d+\/\d+$/.test(bare)) return { ok: false, close: true, msg: 'Right value. Write it as a fraction, such as 7/3.' };
      if (opt.form === 'dec' && /\//.test(bare)) return { ok: false, close: true, msg: 'Right value. Write it as a decimal.' };
      if (opt.form === 'std' && /\^/.test(bare)) return { ok: false, close: true, msg: 'Right value. Write it out in standard form, with all its digits.' };
      if (opt.sci) { var sm = /^[+-]?(\d+\.?\d*)\*10\^/.exec(clean(is).replace(/\s+/g, '')); if (!sm) return { ok: false, close: true, msg: 'Right value. Write it in scientific notation: a × 10ⁿ.' }; if (+sm[1] < 1 || +sm[1] >= 10) return { ok: false, close: true, msg: 'The first number must be at least 1 and less than 10.' }; }
      return { ok: true };
    } catch (e) { return { ok: false, msg: opt.quiet ? '' : 'I could not read that: ' + e.message + '.' }; }
  }
  /** What kind of answer is this key from a worksheet? num / expr / pow / pt / list, or null when a person has to judge it. */
  function kindOf(key) {
    var k = String(key || '').trim(); if (!k || k.length > 60) return null;
    try {
      var s = stripUnits(k), sides = eqSides(s), last = sides[sides.length - 1];
      if (/^\(.+,.+\)$/.test(s)) { s.replace(/^\(|\)$/g, '').split(',').forEach(numVal); return 'pt'; }
      if (/,/.test(s.replace(/,(?=\d{3}(\D|$))/g, ''))) { s.split(',').forEach(numVal); return 'list'; }
      if (sides.length > 2) return null;
      var t = parse(last), vs = Object.keys(varsOf(t));
      if (vs.length) { if (/[a-zA-Z]{2,}/.test(last.replace(/sqrt|pi/g, '')) && !/^[a-z]{2}$/i.test('')) { if (!/^[\s\d+\-−×·*/^().⁰¹²³⁴⁵⁶⁷⁸⁹⁻a-zA-Z=]+$/.test(last) || /[a-zA-Z]{3,}/.test(last)) return null; } return 'expr'; }
      if (sides.length === 2 && !/^[a-zA-Z]$/.test(sides[0])) return null;
      evaluate(t);
      if (/^[^\s]+\^\(?-?\d+\)?$/.test(clean(last).replace(/\s+/g, '')) && !/\*10\^/.test(clean(last).replace(/\s+/g, ''))) return 'pow';
      return plainNumber(last) ? 'num' : null;
    } catch (e) { return null; }
  }

  /* ---------- random numbers that can be repeated (the build script bakes the same questions every time) ---------- */
  function rng(seed) { var a = (seed >>> 0) || 1; var f = function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    f.int = function (lo, hi) { return lo + Math.floor(f() * (hi - lo + 1)); };
    f.nz = function (lo, hi) { var x = 0; while (x === 0) x = f.int(lo, hi); return x; };
    f.pick = function (arr) { return arr[Math.floor(f() * arr.length)]; };
    f.shuffle = function (arr) { var o = arr.slice(); for (var i = o.length - 1; i > 0; i--) { var j = Math.floor(f() * (i + 1)); var t = o[i]; o[i] = o[j]; o[j] = t; } return o; };
    return f; }
  function hashStr(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  /* ---------- skills ----------
     S(id, name, fn): fn(L, r) → { q, a, kind, steps[], wrong[], ... }   L = level 1–4, r = rng
     kinds: num · expr · pow · pt · list · text · between · mc (a + wrong are the choices)
            order (items, tap least → greatest) · line (number line: lo, hi, a) · ops (pick the operation) · graph (m, b: plot two points) */
  var SK = {}, ORDER = [];
  function S(id, name, fn, extra) { SK[id] = Object.assign({ id: id, name: name, gen: fn }, extra || {}); ORDER.push(id); }
  var big = function (L) { return [5, 9, 12, 20][L - 1]; };
  var uniq = function (arr, a) { var seen = {}; seen[String(a)] = 1; return arr.map(String).filter(function (x) { if (seen[x] || x === 'NaN' || x === 'undefined') return false; seen[x] = 1; return true; }); };
  var NAMES = ['Aiyana', 'Mateo', 'Priya', 'Liam', 'Zainab', 'Noah', 'Mei', 'Kofi', 'Sofia', 'Jaya', 'Omar', 'Chloé'];

  // ----- Unit 1 · number sense -----
  S('sets-classify', 'Classify numbers into sets', function (L, r) {
    var pool = [[String(r.int(1, 30)), 'natural number (N)'], ['0', 'whole number (W)'], [n(-r.int(1, 20)), 'integer (Z)'], [fr(r.pick([1, 3, 5, 7]), r.pick([2, 4, 8])), 'rational number (Q)'], [n(-r.int(1, 9) - 0.5), 'rational number (Q)'], ['√' + r.pick([2, 3, 5, 7, 10, 11]), 'irrational number'], ['π', 'irrational number'], ['√' + r.pick([4, 9, 16, 25, 36, 49]), 'natural number (N)'], ['0.' + r.pick(['333…', '666…', '272727…']), 'rational number (Q)']];
    var p = r.pick(L < 3 ? pool.slice(0, 6) : pool), all = ['natural number (N)', 'whole number (W)', 'integer (Z)', 'rational number (Q)', 'irrational number'];
    return { q: 'What is the smallest set that ' + p[0] + ' belongs to?', a: p[1], kind: 'mc', wrong: r.shuffle(all.filter(function (x) { return x !== p[1]; })).slice(0, 3),
      steps: ['N: 1, 2, 3 …   W adds 0.   Z adds the negatives.   Q adds fractions and decimals that end or repeat.', 'Irrational numbers have decimals that never end and never repeat (√2, π).', p[0] + ' is a ' + p[1] + '.'] };
  });
  S('rational-or-not', 'Rational or irrational?', function (L, r) {
    var sq = r.pick([4, 9, 16, 25, 36, 49, 64, 81, 100]), nq = r.pick([2, 3, 5, 6, 7, 8, 10, 12, 15, 50]);
    var p = r.pick([['√' + sq, 'rational', '√' + sq + ' = ' + Math.sqrt(sq) + ', an integer.'], ['√' + nq, 'irrational', nq + ' is not a perfect square, so its root never ends or repeats.'], [fr(-r.int(1, 9), r.pick([4, 7, 11])), 'rational', 'It is already a fraction of two integers.'], ['0.' + r.pick(['4', '25', '125']), 'rational', 'A decimal that ends can be written as a fraction.'], ['0.' + r.pick(['1818…', '777…']), 'rational', 'A repeating decimal can be written as a fraction.'], ['π', 'irrational', 'π never ends and never repeats.']]);
    return { q: 'Is ' + p[0] + ' rational or irrational?', a: p[1], kind: 'mc', wrong: [p[1] === 'rational' ? 'irrational' : 'rational'], steps: ['Rational means it can be written as a fraction of two integers.', p[2]] };
  });
  S('between', 'Find a number in between', function (L, r) {
    var lo, hi, qs;
    if (L <= 2) { var a = r.int(1, 8) / 10; lo = a; hi = round(a + 0.1, 1); qs = n(lo) + ' and ' + n(hi); }
    else if (L === 3) { var d = r.pick([3, 4, 5, 6]); lo = 1 / (d + 1); hi = 1 / d; qs = '1/' + (d + 1) + ' and 1/' + d; }
    else { var b = -r.int(1, 5); lo = round(b - 0.1, 1); hi = b; qs = n(lo) + ' and ' + n(hi); }
    return { q: 'Type any number between ' + qs + '.', a: dec((lo + hi) / 2), kind: 'between', lo: lo, hi: hi, wrong: [dec(hi + (hi - lo)), dec(lo - (hi - lo)), dec(hi * 10 || 10)],
      steps: ['Rational numbers are dense: there is always another one in between.', 'One way: find the mean, (' + n(round(lo, 4)) + ' + ' + n(round(hi, 4)) + ') ÷ 2.', 'One answer is ' + dec((lo + hi) / 2) + '. There are infinitely many others.'] };
  });
  S('limit', 'Name the limit of a pattern', function (L, r) {
    var k = r.pick([2, 3, 10]), s = r.pick([1, 2, 4, 6]);
    if (L >= 3 && r() < 0.5) { var w = r.int(1, 8); return { q: 'What limit do the terms approach?  ' + [1, 2, 3].map(function (i) { return w + '.' + '9'.repeat(i); }).join(', ') + ', …', a: String(w + 1), kind: 'num', wrong: [String(w), w + '.9', String(w + 2)], steps: ['Each term adds another 9.', 'The terms get closer and closer to ' + (w + 1) + ' without passing it.'] }; }
    return { q: 'What limit do the terms approach?  ' + [0, 1, 2, 3].map(function (i) { return fr(s, Math.pow(k, i)); }).join(', ') + ', …', a: '0', kind: 'num', wrong: [fr(s, Math.pow(k, 4)), '1', n(-1)], steps: ['Each term is the one before divided by ' + k + '.', 'The terms get smaller and smaller, closer and closer to 0, but never reach it.'] };
  });
  S('int-addsub', 'Add and subtract integers', function (L, r) {
    var m = big(L) + 3, a = r.nz(-m, m), b = r.nz(-m, m), sub = r() < 0.5; if (L === 1) { a = -Math.abs(a); b = Math.abs(b); } else if (a > 0 && b > 0) { if (r() < 0.5) a = -a; else b = -b; }
    var ans = sub ? a - b : a + b, q = n(a) + (sub ? ' − ' : ' + ') + np(b);
    return { q: 'Evaluate:  ' + q, a: n(ans), kind: 'num', wrong: [n(-ans), n(sub ? a + b : a - b), n(-(sub ? a + b : a - b)), n(ans + 2)],
      steps: sub ? ['Subtracting is adding the opposite: ' + n(a) + ' + ' + np(-b) + '.', 'Now add: ' + n(ans) + '.'] : [(a < 0) === (b < 0) ? 'Same signs: add the sizes and keep the sign.' : 'Different signs: subtract the sizes and take the sign of the larger size.', q + ' = ' + n(ans)], line: { lo: -30, hi: 30 } };
  });
  S('int-muldiv', 'Multiply and divide integers', function (L, r) {
    var m = big(L), a = r.nz(-m, m), b = r.nz(-m, m), div = r() < 0.5; if (L === 1 && a < 0 && b < 0) b = -b;
    var q = div ? n(a * b) + ' ÷ ' + np(b) : np(a) + '(' + n(b) + ')', ans = div ? a : a * b;
    return { q: 'Evaluate:  ' + q, a: n(ans), kind: 'num', wrong: [n(-ans), n(div ? a + b : a + b), n(ans + (div ? 1 : a))], steps: [(div ? (a * b < 0) === (b < 0) : (a < 0) === (b < 0)) ? 'Same signs give a positive answer.' : 'Different signs give a negative answer.', q + ' = ' + n(ans)] };
  });
  S('int-bedmas', 'Order of operations with integers', function (L, r) {
    var a = r.nz(-9, 9), b = r.int(2, 5), c = r.nz(-6, 6), d = r.nz(-9, 9), q, ans, st;
    if (L <= 2) { q = n(a) + ' + ' + b + ' × ' + np(c); ans = a + b * c; st = ['Multiply first: ' + b + ' × ' + np(c) + ' = ' + n(b * c) + '.', n(a) + ' + ' + np(b * c) + ' = ' + n(ans)]; }
    else if (L === 3) { q = n(a) + ' − ' + b + '(' + n(c) + ' − ' + np(d) + ')'; ans = a - b * (c - d); st = ['Brackets first: ' + n(c) + ' − ' + np(d) + ' = ' + n(c - d) + '.', 'Multiply: ' + b + ' × ' + np(c - d) + ' = ' + n(b * (c - d)) + '.', n(a) + ' − ' + np(b * (c - d)) + ' = ' + n(ans)]; }
    else { q = np(c) + '² − ' + b + ' × ' + np(d) + ' + ' + np(a); ans = c * c - b * d + a; st = ['Exponent first: ' + np(c) + '² = ' + c * c + '.', 'Multiply: ' + b + ' × ' + np(d) + ' = ' + n(b * d) + '.', c * c + ' − ' + np(b * d) + ' + ' + np(a) + ' = ' + n(ans)]; }
    return { q: 'Evaluate:  ' + q, a: n(ans), kind: 'num', wrong: [n(-ans), n(L <= 2 ? (a + b) * c : ans + 2 * b), n(ans - b), n(ans + 1)], steps: st };
  });
  S('int-order', 'Order integers and decimals', function (L, r) {
    var set = {}; while (Object.keys(set).length < (L <= 2 ? 4 : 5)) { var x = L >= 3 && r() < 0.4 ? r.int(-30, 30) / 10 : r.int(-12, 12); set[x] = 1; }
    var items = Object.keys(set).map(Number), sorted = items.slice().sort(function (a, b) { return a - b; });
    return { q: 'Order from least to greatest.', kind: 'order', items: r.shuffle(items).map(n), a: sorted.map(n).join(', '), wrong: [sorted.slice().reverse().map(n).join(', '), items.slice().sort(function (a, b) { return Math.abs(a) - Math.abs(b); }).map(n).join(', ')], steps: ['Picture a number line. Farther left is less.', 'For negatives, the bigger size is the smaller number: −10 < −3.', sorted.map(n).join(' < ')] };
  });
  S('int-line', 'Integers on a number line', function (L, r) {
    var a = r.int(-9, 9), b = r.nz(-8, 8); while (Math.abs(a + b) > 12) b = r.nz(-6, 6);
    return { q: 'Start at ' + n(a) + '. ' + (b > 0 ? 'Add ' + b : 'Add ' + np(b)) + '. Tap where you land.', kind: 'line', lo: -12, hi: 12, a: n(a + b), from: a, wrong: [n(a - b), n(-(a + b)), n(a + b + 1)], steps: ['Adding a positive moves right. Adding a negative moves left.', 'From ' + n(a) + ', move ' + Math.abs(b) + (b > 0 ? ' right' : ' left') + ' to ' + n(a + b) + '.'] };
  });
  S('int-ops', 'Which operation makes it true?', function (L, r) {
    var a = r.nz(-9, 9), b = r.nz(-6, 6), o = r.pick(['+', '−', '×']); if (a % b === 0 && r() < 0.4) o = '÷';
    var res = o === '+' ? a + b : o === '−' ? a - b : o === '×' ? a * b : a / b, all = ['+', '−', '×', '÷'];
    var ok = all.filter(function (x) { return (x === '+' ? a + b : x === '−' ? a - b : x === '×' ? a * b : a / b) === res; });
    return { q: np(a) + '  ▢  ' + np(b) + '  =  ' + n(res), kind: 'ops', a: o, accept: ok, wrong: all.filter(function (x) { return ok.indexOf(x) < 0; }), steps: ['Try each operation with the two numbers.', np(a) + ' ' + o + ' ' + np(b) + ' = ' + n(res)] };
  });
  S('frac-mixed', 'Improper fractions and mixed numbers', function (L, r) {
    var d = r.pick(L <= 2 ? [2, 3, 4, 5] : [3, 4, 5, 6, 7, 8, 9]), w = r.int(1, L <= 2 ? 3 : 6), k = r.int(1, d - 1); while (gcd(k, d) > 1) k = r.int(1, d - 1); var top = w * d + k;
    if (r() < 0.5) return { q: 'Write ' + top + '/' + d + ' as a mixed number.', a: w + ' ' + k + '/' + d, kind: 'num', form: 'mixed', wrong: [k + ' ' + w + '/' + d, w + ' ' + d + '/' + k, (w + 1) + ' ' + k + '/' + d], steps: [top + ' ÷ ' + d + ' = ' + w + ' remainder ' + k + '.', top + '/' + d + ' = ' + w + ' ' + k + '/' + d + ' (' + w + ' wholes and ' + k + ' pieces of size 1/' + d + ').'] };
    return { q: 'Write ' + w + ' ' + k + '/' + d + ' as an improper fraction.', a: top + '/' + d, kind: 'num', form: 'improper', wrong: [(w * k + d) + '/' + d, (w + k) + '/' + d, top + '/' + k], steps: ['Each whole is ' + d + '/' + d + ', so ' + w + ' wholes are ' + w * d + '/' + d + '.', w * d + '/' + d + ' + ' + k + '/' + d + ' = ' + top + '/' + d] };
  });
  S('frac-compare', 'Compare fractions', function (L, r) {
    var d1 = r.pick([3, 4, 5, 6, 8]), d2 = r.pick([4, 5, 7, 9, 10, 12]), n1 = r.int(1, d1 - 1), n2 = r.int(1, d2 - 1); while (n1 * d2 === n2 * d1) n2 = r.int(1, d2 - 1) || 1;
    var neg = L >= 3, a = (neg ? '−' : '') + n1 + '/' + d1, b = (neg ? '−' : '') + n2 + '/' + d2, bigger = (n1 * d2 > n2 * d1) !== neg ? a : b, l = d1 * d2 / gcd(d1, d2);
    return { q: 'Which is greater:  ' + a + '  or  ' + b + ' ?', a: bigger, kind: 'mc', wrong: [bigger === a ? b : a], steps: ['Use a common denominator of ' + l + ':  ' + (neg ? '−' : '') + n1 * l / d1 + '/' + l + '  and  ' + (neg ? '−' : '') + n2 * l / d2 + '/' + l + '.', neg ? 'Both are negative, so the one closer to zero is greater.' : 'Compare the numerators.', bigger + ' is greater.'] };
  });
  S('unit-count', 'Count with unit fractions', function (L, r) {
    var d = r.pick([2, 3, 4, 8]), w = r.int(1, L <= 2 ? 3 : 5), k = L <= 1 ? 0 : r.int(0, d - 1), total = w * d + k;
    return { q: 'How many 1/' + d + 's are in ' + (k ? w + ' ' + k + '/' + d : w) + '?', a: String(total), kind: 'num', wrong: [String(w + k), String(w * d), String(total + d), String(d)].filter(function (x) { return x !== String(total); }), steps: ['One whole is ' + d + ' pieces of size 1/' + d + '.', w + ' × ' + d + (k ? ' + ' + k : '') + ' = ' + total] };
  });
  S('sign-simplify', 'Simplify the signs of a fraction', function (L, r) {
    var d = r.pick([4, 6, 8, 9, 10, 12]), k = r.int(1, d - 1), m = r.int(2, 4), s1 = r() < 0.5 ? -1 : 1, s2 = r() < 0.5 ? -1 : 1; if (s1 === 1 && s2 === 1) s2 = -1;
    var res = fr(s1 * s2 * k, d), rr = R(k, d);
    return { q: 'Write in lowest terms with the sign in front:  ' + np(s1 * k * m).replace(/^\((.*)\)$/, '($1)') + '/' + np(s2 * d * m), a: res, kind: 'num', wrong: [fr(-s1 * s2 * k, d), (s1 * s2 < 0 ? '−' : '') + k * m + '/' + d * m, fr(s1 * s2 * rr.d, rr.n)], steps: ['Count the negative signs: ' + ((s1 < 0) + (s2 < 0)) + '. ' + (s1 * s2 < 0 ? 'An odd number makes the value negative.' : 'An even number makes the value positive.'), 'Divide top and bottom by ' + gcd(k * m, d * m) + ':  ' + res] };
  });
  S('rate-change', 'Find a rate of change', function (L, r) {
    var t = r.int(2, 8), rate = r.nz(-9, 9) * (L >= 3 && r() < 0.4 ? 0.5 : 1), a = r.int(-20, 60), b = a + rate * t, c = r.pick([['temperature', '°C', 'hours', '°C/h'], ['water level', 'cm', 'days', 'cm/day'], ['height of a drone', 'm', 'seconds', 'm/s'], ['balance', '$', 'weeks', '$/week']]);
    return { q: 'The ' + c[0] + ' changes from ' + n(a) + ' ' + c[1] + ' to ' + n(b) + ' ' + c[1] + ' in ' + t + ' ' + c[2] + '. What is the rate of change, in ' + c[3] + '?', a: n(rate), kind: 'num', wrong: [n(-rate), n(b - a), n(round((a - b) / t + 1, 1)), n(round(b / t, 1))], steps: ['Rate of change = change ÷ time.', 'Change: ' + n(b) + ' − ' + np(a) + ' = ' + n(b - a) + '.', n(b - a) + ' ÷ ' + t + ' = ' + n(rate) + ' ' + c[3] + (rate < 0 ? ' (negative: it is going down).' : '.')] };
  });
  function fracPair(L, r) { var ds = L <= 1 ? [2, 4, 8] : L === 2 ? [2, 3, 4, 6] : [3, 4, 5, 6, 8, 10, 12]; var d1 = r.pick(ds), d2 = r.pick(ds), a = r.int(1, d1 - 1) || 1, b = r.int(1, d2 - 1) || 1; if (L >= 3) { if (r() < 0.5) a = -a; if (r() < 0.4) b = -b; } return [R(a, d1), R(b, d2)]; }
  var fs = function (x) { return fr(x.n, x.d); }, fp = function (x) { return x.n < 0 ? '(' + fs(x) + ')' : fs(x); };
  S('frac-addsub', 'Add and subtract fractions', function (L, r) {
    var p = fracPair(L, r), a = p[0], b = p[1], sub = r() < 0.5, res = op(a, b, sub ? '-' : '+'), l = a.d * b.d / gcd(a.d, b.d), an = a.n * l / a.d, bn = b.n * l / b.d;
    return { q: 'Evaluate:  ' + fs(a) + (sub ? ' − ' : ' + ') + fp(b), a: fs(res), kind: 'num', wrong: [fr(a.n + (sub ? -b.n : b.n), a.d + b.d), fs(op(a, b, sub ? '+' : '-')), fr(an + (sub ? -bn : bn), l * 2), fs(op(R(0), res, '-'))], steps: ['Common denominator: ' + l + '.', fr(an, l).replace(/^(−?\d+)$/, an + '/' + l) + (sub ? ' − ' : ' + ') + '(' + n(bn) + '/' + l + ')', 'Numerators: ' + n(an) + (sub ? ' − ' : ' + ') + np(bn) + ' = ' + n(sub ? an - bn : an + bn) + ', over ' + l + '.', 'In lowest terms: ' + fs(res)] };
  });
  S('frac-muldiv', 'Multiply and divide fractions', function (L, r) {
    var p = fracPair(Math.max(2, L), r), a = p[0], b = p[1], div = r() < 0.5, res = op(a, b, div ? '/' : '*');
    return { q: 'Evaluate:  ' + fp(a) + (div ? ' ÷ ' : ' × ') + fp(b), a: fs(res), kind: 'num', wrong: [fs(op(a, b, div ? '*' : '/')), fs(op(R(0), res, '-')), fr(a.n * b.d + b.n * a.d, a.d * b.d), fr(res.d, res.n || 1)], steps: div ? ['Dividing is multiplying by the reciprocal: ' + fp(a) + ' × ' + fp(R(b.d, b.n)) + '.', 'Multiply tops and bottoms: ' + n(a.n * b.d) + '/' + n(a.d * b.n) + '.', 'Sign and lowest terms: ' + fs(res)] : ['Multiply the numerators and multiply the denominators: ' + n(a.n * b.n) + '/' + a.d * b.d + '.', 'Sign and lowest terms: ' + fs(res)] };
  });
  S('unit-rate', 'Unit rates and best buys', function (L, r) {
    var q1 = r.pick([2, 4, 5, 6, 8]), u = r.int(8, 30) * 0.05 + 0.5, item = r.pick(['L of juice', 'bagels', 'kg of apples', 'granola bars', 'pens']);
    if (L >= 3) { var q2 = q1 + r.pick([2, 4, 6]), u2 = round(u + r.pick([-0.1, -0.05, 0.05, 0.1]), 2), p1 = round(q1 * u, 2), p2 = round(q2 * u2, 2), best = u < u2 ? 'A' : 'B';
      return { q: 'Which is the better buy?  A: ' + q1 + ' ' + item + ' for ' + money(p1) + '   B: ' + q2 + ' ' + item + ' for ' + money(p2), a: best, kind: 'mc', wrong: [best === 'A' ? 'B' : 'A'], steps: ['A: ' + money(p1) + ' ÷ ' + q1 + ' = ' + money(round(p1 / q1, 3)) + ' each.', 'B: ' + money(p2) + ' ÷ ' + q2 + ' = ' + money(round(p2 / q2, 3)) + ' each.', 'The lower unit rate is the better buy: ' + best + '.'] }; }
    var price = round(q1 * round(u, 2), 2);
    return { q: q1 + ' ' + item + ' cost ' + money(price) + '. What is the unit rate (cost for 1)?', a: money(round(price / q1, 2)), kind: 'num', wrong: [money(round(price * q1, 2)), money(round(q1 / price, 2)), money(round(price / q1 + 1, 2))], steps: ['Unit rate = cost ÷ quantity.', money(price) + ' ÷ ' + q1 + ' = ' + money(round(price / q1, 2))] };
  });
  S('proportion', 'Solve a proportion', function (L, r) {
    var a = r.int(2, 6), b = r.int(2, 9), k = r.int(2, L <= 2 ? 5 : 12); while (a === b) b = r.int(2, 9);
    return { q: 'Solve:  ' + a + '/' + b + ' = x/' + b * k, a: String(a * k), kind: 'num', wrong: [String(a + b * k - b), String(b * k), String(a * k + a), String(k)], steps: ['How was the denominator scaled?  ' + b + ' × ' + k + ' = ' + b * k + '.', 'Scale the numerator the same way: ' + a + ' × ' + k + ' = ' + a * k + '.'] };
  });
  S('percent-of', 'Percent of an amount', function (L, r) {
    var p = r.pick(L <= 2 ? [10, 20, 25, 50, 75] : [5, 12, 13, 15, 35, 40, 65]), w = r.pick([20, 40, 60, 80, 120, 200, 250]);
    if (L >= 3 && r() < 0.5) { var part = p * w / 100; return { q: n(part) + ' is what percent of ' + w + '?', a: p + '%', kind: 'num', wrong: [round(w / part, 1) + '%', round(part, 1) + '%', (100 - p) + '%'], steps: ['Percent = part ÷ whole × 100.', n(part) + ' ÷ ' + w + ' = ' + p / 100 + ' = ' + p + '%'] }; }
    return { q: 'Find ' + p + '% of ' + w + '.', a: n(p * w / 100), kind: 'num', wrong: [n(w - p), n(p * w / 10), n(round(w / p, 1)), n(p * w / 100 + w)], steps: [p + '% = ' + p / 100 + '.', p / 100 + ' × ' + w + ' = ' + n(p * w / 100)] };
  });
  S('percent-change', 'Percent change', function (L, r) {
    var old = r.pick([40, 50, 80, 120, 200, 250, 400]), p = r.pick([5, 10, 15, 20, 25, 40]) * (r() < 0.5 ? -1 : 1), nw = old * (1 + p / 100);
    return { q: 'A value changes from ' + old + ' to ' + n(nw) + '. What is the percent change? (Use a negative for a decrease.)', a: n(p) + '%', kind: 'num', wrong: [n(-p) + '%', n(nw - old) + '%', n(round((nw - old) / nw * 100, 1)) + '%', n(round(nw / old * 100)) + '%'], steps: ['Percent change = (new − old) ÷ old × 100.', '(' + n(nw) + ' − ' + old + ') ÷ ' + old + ' = ' + n(p / 100) + '.', n(p) + '%: ' + (p < 0 ? 'a decrease.' : 'an increase.')] };
  });
  S('discount-tax', 'Discounts and HST', function (L, r) {
    var price = r.pick([20, 40, 50, 60, 80, 120]), d = r.pick([10, 20, 25, 30, 40]), sale = price * (1 - d / 100);
    if (L <= 2) return { q: 'A ' + money(price) + ' item is ' + d + '% off. What is the sale price (before tax)?', a: money(sale), kind: 'num', wrong: [money(price * d / 100), money(price - d), money(price * (1 + d / 100))], steps: ['Paying ' + (100 - d) + '% of the price: multiply by ' + (1 - d / 100) + '.', money(price) + ' × ' + (1 - d / 100) + ' = ' + money(sale)] };
    var total = round(sale * 1.13, 2);
    return { q: 'A ' + money(price) + ' item is ' + d + '% off. Find the total cost including 13% HST.', a: money(total), kind: 'num', wrong: [money(sale), money(round(price * 1.13, 2)), money(round(sale + 0.13, 2)), money(round(price * (1 - d / 100 + 0.13), 2))].filter(function (x) { return x !== money(total); }), steps: ['Sale price: ' + money(price) + ' × ' + (1 - d / 100) + ' = ' + money(sale) + '.', 'With HST: ' + money(sale) + ' × 1.13 = ' + money(total)] };
  });

  // ----- Unit 2 · powers -----
  S('power-eval', 'Evaluate powers', function (L, r) {
    var b = r.int(2, L <= 2 ? 5 : 6), e = r.int(2, L <= 2 ? 3 : 4), mode = L <= 1 ? 0 : r.int(0, L >= 3 ? 2 : 1);
    if (b === 10) e = r.int(2, 6);
    var q = mode === 0 ? b + sup(e) : mode === 1 ? '(' + n(-b) + ')' + sup(e) : '−' + b + sup(e), ans = mode === 0 ? Math.pow(b, e) : mode === 1 ? Math.pow(-b, e) : -Math.pow(b, e);
    return { q: 'Evaluate:  ' + q, a: n(ans), kind: 'num', wrong: [n(b * e), n(-ans), n(mode ? -b * e : Math.pow(b, e - 1)), n(Math.pow(e, b))], steps: [mode === 2 ? 'No brackets: the exponent applies only to ' + b + ', then the negative is attached.' : 'Write the base ' + e + ' times and multiply.', (mode === 2 ? '−(' : '') + Array(e).fill(mode === 1 ? '(' + n(-b) + ')' : b).join(' × ') + (mode === 2 ? ')' : '') + ' = ' + n(ans)] };
  });
  S('power-sign', 'Predict the sign of a power', function (L, r) {
    var b = r.int(2, 9), e = r.int(2, 15), br = r() < 0.6, ans = br ? (e % 2 ? 'negative' : 'positive') : 'negative';
    return { q: 'Without calculating: is ' + (br ? '(' + n(-b) + ')' + sup(e) : '−' + b + sup(e)) + ' positive or negative?', a: ans, kind: 'mc', wrong: [ans === 'positive' ? 'negative' : 'positive'], steps: [br ? 'The base is ' + n(-b) + ', multiplied ' + e + ' times. An ' + (e % 2 ? 'odd' : 'even') + ' number of negatives gives a ' + ans + ' answer.' : 'There are no brackets, so the base is ' + b + '. The power is positive, then the negative sign is attached.'] };
  });
  S('power-bedmas', 'Powers in the order of operations', function (L, r) {
    var a = r.int(2, 5), b = r.int(2, 4), c = r.int(1, 9), form = r.int(0, L >= 3 ? 2 : 1), q, ans, st;
    if (form === 0) { q = c + ' + ' + b + ' × ' + a + '²'; ans = c + b * a * a; st = ['Exponent first: ' + a + '² = ' + a * a + '.', 'Multiply: ' + b + ' × ' + a * a + ' = ' + b * a * a + '.', 'Add: ' + ans]; }
    else if (form === 1) { q = '(' + a + ' + ' + b + ')² − ' + c; ans = (a + b) * (a + b) - c; st = ['Brackets first: ' + (a + b) + '.', 'Exponent: ' + (a + b) * (a + b) + '.', 'Subtract: ' + ans]; }
    else { q = '−' + a + '² + (' + n(-b) + ')³'; ans = -a * a - b * b * b; st = ['−' + a + '² = −' + a * a + ' (no brackets).', '(' + n(-b) + ')³ = ' + n(-b * b * b) + '.', 'Add: ' + n(ans)]; }
    return { q: 'Evaluate:  ' + q, a: n(ans), kind: 'num', wrong: [n(form === 0 ? (c + b) * a * a : form === 1 ? a * a + b * b - c : a * a - b * b * b), n(ans + 2 * a), n(-ans), n(ans - 1)], steps: st };
  });
  S('zero-neg-exp', 'Zero and negative exponents', function (L, r) {
    var b = r.int(2, L <= 2 ? 5 : 10), e = r.int(0, L <= 2 ? 2 : 3); if (L <= 1) e = r.int(0, 1);
    if (e === 0) { var neg = L >= 3 && r() < 0.5; return { q: 'Evaluate:  ' + (neg ? '−' + b + '⁰' : r() < 0.5 ? b + '⁰' : '(' + n(-b) + ')⁰'), a: neg ? n(-1) : '1', kind: 'num', wrong: ['0', String(b), neg ? '1' : n(-1), n(-b)], steps: ['Any non-zero base to the exponent 0 is 1.', neg ? 'Without brackets the negative is attached afterwards: −1.' : 'The answer is 1.'] }; }
    return { q: 'Evaluate as a fraction:  ' + b + sup(-e), a: '1/' + Math.pow(b, e), kind: 'num', wrong: [n(-Math.pow(b, e)), n(-b * e), '1/' + b * e, String(Math.pow(b, e))].filter(function (x) { return x !== '1/' + Math.pow(b, e); }), steps: ['A negative exponent means “one over”: ' + b + sup(-e) + ' = 1/' + b + sup(e) + '.', '1/' + Math.pow(b, e) + '. It is small, not negative.'] };
  });
  S('exp-laws', 'Product and quotient rules', function (L, r) {
    var v = L <= 1 ? String(r.int(2, 9)) : r.pick(['x', 'a', 'm', 'y', String(r.int(2, 9))]), e1 = r.int(2, 9), e2 = r.int(1, L >= 3 ? 9 : Math.max(1, e1 - 1)), div = r() < 0.5, coef = L >= 3 && isNaN(v);
    if (coef) { var c2 = r.int(2, 5), c1 = c2 * r.int(2, 5), e = div ? e1 - e2 : e1 + e2, cf = div ? c1 / c2 : c1 * c2;
      return { q: 'Simplify:  ' + c1 + v + sup(e1) + (div ? ' ÷ ' : ' · ') + c2 + v + sup(e2), a: cf + v + (e === 1 ? '' : sup(e)), kind: 'expr', wrong: [cf + v + sup(div ? e1 + e2 : e1 - e2 || 2), (div ? c1 - c2 : c1 + c2) + v + sup(e), cf + v + sup(e1 * e2)], steps: [(div ? 'Divide' : 'Multiply') + ' the coefficients: ' + cf + '.', (div ? 'Subtract' : 'Add') + ' the exponents: ' + e1 + (div ? ' − ' : ' + ') + e2 + ' = ' + e + '.', cf + v + sup(e)] }; }
    var ee = div ? e1 - e2 : e1 + e2;
    return { q: 'Write as a single power:  ' + v + sup(e1) + (div ? ' ÷ ' : ' × ') + v + sup(e2), a: v + sup(ee), kind: 'pow', wrong: [v + sup(div ? e1 + e2 : Math.abs(e1 - e2) || e1 + e2 + 1), v + sup(e1 * e2), v + sup(ee + 1)], steps: ['Same base: ' + (div ? 'dividing, so subtract the exponents.' : 'multiplying, so add the exponents.'), e1 + (div ? ' − ' : ' + ') + e2 + ' = ' + ee + ', so the answer is ' + v + sup(ee) + '.'] };
  });
  S('power-of-power', 'Power of a power', function (L, r) {
    var v = r.pick(['x', 'a', 'm', 'y']), e1 = r.int(2, 5), e2 = r.int(2, 4), c = r.int(2, L >= 4 ? 4 : 3);
    if (L >= 3) { var neg = L >= 4 && r() < 0.5, cc = Math.pow(neg ? -c : c, e2); return { q: 'Simplify:  (' + (neg ? '−' : '') + c + v + sup(e1) + ')' + sup(e2), a: n(cc) + v + sup(e1 * e2), kind: 'expr', wrong: [(neg ? '−' : '') + c + v + sup(e1 * e2), n(c * e2) + v + sup(e1 * e2), n(cc) + v + sup(e1 + e2)], steps: ['The exponent ' + e2 + ' applies to every factor in the brackets.', (neg ? '(' + n(-c) + ')' : c) + sup(e2) + ' = ' + n(cc) + '.', '(' + v + sup(e1) + ')' + sup(e2) + ' = ' + v + sup(e1 * e2) + ' (multiply the exponents).'] }; }
    var b = L <= 1 ? String(r.int(2, 5)) : v;
    return { q: 'Write as a single power:  (' + b + sup(e1) + ')' + sup(e2), a: b + sup(e1 * e2), kind: 'pow', wrong: [b + sup(e1 + e2), b + sup(Math.pow(e1, e2)), b + sup(e1 * e2 + 1)], steps: ['Power of a power: multiply the exponents.', e1 + ' × ' + e2 + ' = ' + e1 * e2 + ', so ' + b + sup(e1 * e2) + '.'] };
  });
  S('sci-write', 'Write in scientific notation', function (L, r) {
    var m = r.int(11, 98) / 10, e = L <= 2 ? r.int(3, 8) : r.pick([-6, -5, -4, -3, 4, 6, 9]), x = m * Math.pow(10, e), std = e >= 0 ? String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : x.toFixed(-e + 1);
    return { q: 'Write ' + std + ' in scientific notation.', a: n(m) + ' × 10' + sup(e), kind: 'num', sci: true, wrong: [n(m * 10) + ' × 10' + sup(e - 1), n(m) + ' × 10' + sup(-e), n(m) + ' × 10' + sup(e + 1)], steps: ['Move the decimal point until one non-zero digit is in front: ' + n(m) + '.', 'It moved ' + Math.abs(e) + ' places ' + (e > 0 ? 'left (a large number), so the exponent is ' + e : 'right (a small number), so the exponent is ' + n(e)) + '.', n(m) + ' × 10' + sup(e)] };
  });
  S('sci-read', 'Scientific notation to standard form', function (L, r) {
    var m = r.int(11, 98) / 10, e = L <= 2 ? r.int(2, 6) : r.pick([-4, -3, -2, 3, 5, 7]), x = round(m * Math.pow(10, e), 8);
    return { q: 'Write ' + n(m) + ' × 10' + sup(e) + ' in standard form.', a: e < 0 ? x.toFixed(-e + 1) : String(x), kind: 'num', form: 'std', wrong: [String(round(m * Math.pow(10, e > 0 ? e - 1 : e + 1), 9)), String(round(m * Math.pow(10, -e), 9)), String(round(m * Math.abs(e) * 10, 2))], steps: ['The exponent is ' + n(e) + ': move the decimal point ' + Math.abs(e) + ' places ' + (e > 0 ? 'right.' : 'left.'), e < 0 ? x.toFixed(-e + 1) : String(x)] };
  });
  S('sci-muldiv', 'Multiply and divide in scientific notation', function (L, r) {
    var e1 = r.int(3, 9), e2 = r.int(2, 6), div = r() < 0.5, a, b; if (div) { b = r.int(2, 4); a = b * r.int(2, 4); if (a >= 10) a = b * 2; } else { a = r.int(2, 4); b = r.int(2, L >= 3 ? 9 : Math.floor(9 / a) || 2); }
    var x = div ? a * Math.pow(10, e1) / (b * Math.pow(10, e2)) : a * Math.pow(10, e1) * b * Math.pow(10, e2), mm = div ? a / b : a * b, ee = div ? e1 - e2 : e1 + e2;
    return { q: 'Evaluate, in scientific notation:  (' + a + ' × 10' + sup(e1) + ')' + (div ? ' ÷ ' : '') + '(' + b + ' × 10' + sup(e2) + ')', a: sci(x), kind: 'num', sci: true, wrong: [n(mm) + ' × 10' + sup(div ? e1 + e2 : e1 * e2), n(div ? a - b || 1 : a + b) + ' × 10' + sup(ee), mm >= 10 ? n(mm) + ' × 10' + sup(ee) : n(mm) + ' × 10' + sup(ee + 1)], steps: [(div ? 'Divide' : 'Multiply') + ' the front numbers: ' + n(mm) + '.', (div ? 'Subtract' : 'Add') + ' the exponents: ' + ee + '.', mm >= 10 ? n(mm) + ' × 10' + sup(ee) + ' is not finished: ' + n(mm) + ' = ' + n(mm / 10) + ' × 10, so the answer is ' + sci(x) + '.' : sci(x)] };
  });

  // ----- Unit 3 · algebra -----
  S('alg-evaluate', 'Evaluate an expression', function (L, r) {
    var a = r.int(2, 6), b = r.nz(-9, 9), x = L <= 1 ? r.int(1, 6) : r.nz(-5, 6), sq = L >= 3;
    var q = sq ? a + 'x² ' + (b < 0 ? '− ' : '+ ') + Math.abs(b) + 'x' : linear(a, b), ans = sq ? a * x * x + b * x : a * x + b;
    return { q: 'Evaluate ' + q + ' when x = ' + n(x) + '.', a: n(ans), kind: 'num', wrong: [n(sq ? a * x * 2 + b * x : a + x + b), n(sq ? -a * x * x + b * x : a * x - b), n(ans + a), n(-ans)], steps: ['Substitute with brackets: ' + (sq ? a + '(' + n(x) + ')² ' + (b < 0 ? '− ' : '+ ') + Math.abs(b) + '(' + n(x) + ')' : a + '(' + n(x) + ') ' + (b < 0 ? '− ' : '+ ') + Math.abs(b)) + '.', sq ? a + ' × ' + x * x + ' ' + (b < 0 ? '− ' : '+ ') + np(Math.abs(b) * x).replace(/[()]/g, '') + ' → ' + n(ans) : n(a * x) + ' ' + (b < 0 ? '− ' : '+ ') + Math.abs(b) + ' = ' + n(ans)] };
  });
  S('alg-translate', 'Words to algebra', function (L, r) {
    var k = r.int(2, 9), c = r.int(1, 9), p = r.pick([[c + ' more than ' + k + ' times a number', k + 'n + ' + c, [k + '(n + ' + c + ')', c + 'n + ' + k, k + ' + ' + c + 'n']], [c + ' less than a number', 'n − ' + c, [c + ' − n', c + 'n', 'n ÷ ' + c]], ['the quotient of a number and ' + k, 'n/' + k, [k + '/n', k + 'n', 'n − ' + k]], ['the product of ' + k + ' and a number, decreased by ' + c, k + 'n − ' + c, [k + '(n − ' + c + ')', c + ' − ' + k + 'n', k + ' + n − ' + c]], ['a $' + c + ' fee plus $' + (k + 8) + ' for each of n tickets', (k + 8) + 'n + ' + c, [c + 'n + ' + (k + 8), (k + 8 + c) + 'n', (k + 8) + '(n + ' + c + ')']]]);
    return { q: 'Which expression means: ' + p[0] + '?', a: p[1], kind: 'mc', wrong: p[2], steps: ['“More than” and “less than” add or subtract at the end. “Times” and “product” multiply. “Quotient” divides.', p[0] + '  →  ' + p[1]] };
  });
  S('general-term', 'General term of a pattern', function (L, r) {
    var d = r.nz(L <= 2 ? 2 : -6, 7), f = r.int(1, 12), b = f - d;
    return { q: 'Write an expression for the nth term:  ' + [0, 1, 2, 3].map(function (i) { return n(f + d * i); }).join(', ') + ', …', a: linear(d, b, 'n'), kind: 'expr', wrong: [linear(d, f, 'n'), linear(f, d, 'n'), 'n ' + (d < 0 ? '− ' : '+ ') + Math.abs(d)], steps: ['The terms change by ' + n(d) + ' each time, so the expression starts with ' + n(d) + 'n.', 'For n = 1: ' + n(d) + '(1) = ' + n(d) + ', but the first term is ' + n(f) + '. Adjust by ' + n(b) + '.', linear(d, b, 'n')] };
  });
  S('equiv-test', 'Equivalent or not?', function (L, r) {
    var a = r.int(2, 6), b = r.int(1, 7), eq = r() < 0.5, forms = [[a + '(x + ' + b + ')', a + 'x + ' + a * b, a + 'x + ' + b], [a + 'x + ' + b + 'x', (a + b) + 'x', (a * b) + 'x'], ['x + x + x', '3x', 'x³'], ['(x + ' + b + ')²', 'x² + ' + 2 * b + 'x + ' + b * b, 'x² + ' + b * b], [a + 'x − ' + a * b, a + '(x − ' + b + ')', a + '(x − ' + a * b + ')']], f = r.pick(L <= 2 ? forms.slice(0, 3) : forms);
    return { q: 'Are ' + f[0] + ' and ' + (eq ? f[1] : f[2]) + ' equivalent?', a: eq ? 'Yes, always equal' : 'No', kind: 'mc', wrong: [eq ? 'No' : 'Yes, always equal'], steps: ['Test a value such as x = 2 in both expressions.', eq ? 'They match for every value, and algebra confirms it: ' + f[0] + ' = ' + f[1] + '.' : 'They give different results, so one counterexample is enough: not equivalent. (' + f[0] + ' = ' + f[1] + ')'] };
  });
  S('like-terms', 'Collect like terms', function (L, r) {
    var a = r.int(2, 9), b = r.nz(-9, 9), c = r.nz(-9, 9), d = r.nz(-9, 9); if (a + c === 0) c++;
    if (L >= 3) { var e = r.int(1, 5), f = r.nz(-4, 4); if (e + f === 0) f++; return { q: 'Simplify:  ' + e + 'x² ' + sg(a) + 'x ' + sg(f) + 'x² ' + sg(c) + 'x', a: quad(e + f, a + c, 0), kind: 'expr', wrong: [(e + f + a + c) + 'x²', quad(e + f, a + c, 0).replace('x²', 'x⁴'), quad(e - f, a - c, 0) || '0'], steps: ['x² terms: ' + e + ' ' + sg(f) + ' = ' + n(e + f) + '.', 'x terms: ' + a + ' ' + sg(c) + ' = ' + n(a + c) + '.', quad(e + f, a + c, 0)] }; }
    return { q: 'Simplify:  ' + a + 'x ' + sg(b) + ' ' + sg(c) + 'x ' + sg(d), a: linear(a + c, b + d), kind: 'expr', wrong: [linear(a + c + b + d, 0), linear(a - c, b - d), linear(a + c, b - d)], steps: ['x terms: ' + a + 'x ' + sg(c) + 'x = ' + n(a + c) + 'x.', 'Constants: ' + n(b) + ' ' + sg(d) + ' = ' + n(b + d) + '.', linear(a + c, b + d)] };
  });
  function sg(x) { return (x < 0 ? '− ' : '+ ') + Math.abs(x); }
  function quad(a, b, c) { var s = ''; if (a) s = (a === 1 ? '' : a === -1 ? '−' : n(a)) + 'x²'; if (b) s += (s ? ' ' + (b < 0 ? '− ' : '+ ') + (Math.abs(b) === 1 ? '' : Math.abs(b)) : (b === 1 ? '' : b === -1 ? '−' : n(b))) + 'x'; if (c || !s) s += s ? ' ' + sg(c) : n(c); return s; }
  S('poly-addsub', 'Add and subtract polynomials', function (L, r) {
    var a = r.int(2, 9), b = r.nz(-9, 9), c = r.int(1, 8), d = r.nz(-9, 9), sub = L >= 2 && r() < 0.6; if (sub && a === c) c++;
    var ra = sub ? a - c : a + c, rb = sub ? b - d : b + d;
    return { q: 'Simplify:  (' + linear(a, b) + ')' + (sub ? ' − ' : ' + ') + '(' + linear(c, d) + ')', a: linear(ra, rb), kind: 'expr', wrong: [linear(sub ? a - c : a + c, sub ? b + d : b - d), linear(sub ? a + c : a - c, rb), linear(ra + rb, 0)], steps: sub ? ['Subtracting a bracket changes the sign of every term inside: ' + linear(a, b) + ' ' + sg(-c) + 'x ' + sg(-d) + '.', 'Collect like terms: ' + linear(ra, rb)] : ['Remove the brackets and collect like terms.', linear(ra, rb)] };
  });
  S('distribute', 'Expand with the distributive property', function (L, r) {
    var k = r.nz(L <= 2 ? 2 : -6, 7), a = r.int(1, L <= 1 ? 1 : 5), b = r.nz(-9, 9); if (k === 1) k = 3;
    return { q: 'Expand:  ' + n(k) + '(' + linear(a, b) + ')', a: linear(k * a, k * b), kind: 'expr', wrong: [linear(k * a, b), linear(k * a, -k * b), linear(k + a, k + b)], steps: ['Multiply every term in the bracket by ' + n(k) + '.', n(k) + ' × ' + (a === 1 ? '' : a) + 'x = ' + n(k * a) + 'x   and   ' + n(k) + ' × ' + np(b) + ' = ' + n(k * b) + '.', linear(k * a, k * b)] };
  });
  S('expand-simplify', 'Expand and simplify', function (L, r) {
    var k = r.int(2, 5), a = r.nz(-6, 6), m = r.int(2, 4) * (L >= 3 ? -1 : 1), c = r.nz(-6, 6); if (k + m === 0) k++;
    return { q: 'Expand and simplify:  ' + k + '(x ' + sg(a) + ') ' + (m < 0 ? '− ' : '+ ') + Math.abs(m) + '(x ' + sg(c) + ')', a: linear(k + m, k * a + m * c), kind: 'expr', wrong: [linear(k + m, k * a - m * c), linear(k + m, a + c), linear(k - m, k * a + m * c)], steps: ['Expand each bracket: ' + linear(k, k * a) + '   and   ' + linear(m, m * c) + '.', m < 0 ? 'The negative multiplies both terms in the second bracket.' : 'Collect like terms.', linear(k + m, k * a + m * c)] };
  });
  S('monomials', 'Multiply and divide monomials', function (L, r) {
    var c2 = r.int(2, 5), c1 = c2 * r.int(2, 4), e1 = r.int(2, 5), e2 = r.int(1, e1 - 1), div = r() < 0.5, e = div ? e1 - e2 : e1 + e2, cf = div ? c1 / c2 : c1 * c2;
    return { q: 'Simplify:  ' + (div ? c1 + 'x' + sup(e1) + ' ÷ ' + c2 + 'x' + (e2 === 1 ? '' : sup(e2)) : '(' + c1 + 'x' + sup(e1) + ')(' + c2 + 'x' + (e2 === 1 ? '' : sup(e2)) + ')'), a: cf + 'x' + (e === 1 ? '' : sup(e)), kind: 'expr', wrong: [cf + 'x' + sup(div ? e1 + e2 : e1 * e2 + 1), (div ? c1 - c2 : c1 + c2) + 'x' + sup(e), cf + 'x' + sup(e + 1)], steps: [(div ? 'Divide' : 'Multiply') + ' the coefficients: ' + cf + '.', (div ? 'Subtract' : 'Add') + ' the exponents of x: ' + e + '.', cf + 'x' + (e === 1 ? '' : sup(e))] };
  });
  S('eq-two-step', 'Solve one- and two-step equations', function (L, r) {
    var a = r.nz(L <= 2 ? 2 : -7, 8), x = r.int(L <= 1 ? 1 : -9, 9), b = L <= 1 ? 0 : r.nz(-12, 12); if (a === 1) a = 3; if (L <= 1 && r() < 0.5) { b = r.nz(-9, 9); a = 1; }
    var c = a * x + b, lhs = linear(a, b);
    return { q: 'Solve:  ' + lhs + ' = ' + n(c), a: n(x), kind: 'num', pre: 'x =', wrong: [n(-x), n(a === 1 ? c + b : round((c + b) / a, 1)), n(c - b), n(x + 1)].filter(function (w) { return w !== n(x); }), steps: (b ? [(b > 0 ? 'Subtract ' + b + ' from' : 'Add ' + (-b) + ' to') + ' both sides: ' + linear(a, 0) + ' = ' + n(c - b) + '.'] : []).concat(a !== 1 ? ['Divide both sides by ' + n(a) + ': x = ' + n(x) + '.'] : []).concat(['Check: ' + (a === 1 ? '' : n(a)) + '(' + n(x) + ') ' + (b ? sg(b) : '') + ' = ' + n(c) + ' ✓']), balance: { a: a, b: b, c: 0, d: c } };
  });
  S('eq-multi', 'Solve multi-step equations', function (L, r) {
    var x = r.int(-6, 9), a = r.int(3, 8), c = r.int(1, a - 1), b = r.nz(-9, 9), d = (a - c) * x + b;
    if (L >= 3 && r() < 0.5) { var k = r.int(2, 5), m = r.nz(-5, 5), cc = r.int(1, k - 1) || 1, dd = k * (x + m) - cc * x; if (k === cc) cc = k - 1 || 1;
      return { q: 'Solve:  ' + k + '(x ' + sg(m) + ') = ' + linear(cc, dd), a: n(x), kind: 'num', pre: 'x =', wrong: [n(-x), n(x + m), n(dd - m), n(x - 1)], steps: ['Expand: ' + linear(k, k * m) + ' = ' + linear(cc, dd) + '.', 'Collect x on the left: ' + linear(k - cc, k * m) + ' = ' + n(dd) + '.', 'Undo: ' + linear(k - cc, 0) + ' = ' + n(dd - k * m) + ', so x = ' + n(x) + '.'] }; }
    return { q: 'Solve:  ' + linear(a, b) + ' = ' + linear(c, d), a: n(x), kind: 'num', pre: 'x =', wrong: [n(-x), n(round((d + b) / (a + c), 1)), n(d - b), n(x + 2)].filter(function (w) { return w !== n(x); }), steps: ['Subtract ' + c + 'x from both sides: ' + linear(a - c, b) + ' = ' + n(d) + '.', (b > 0 ? 'Subtract ' + b : 'Add ' + (-b)) + ': ' + linear(a - c, 0) + ' = ' + n(d - b) + '.', a - c === 1 ? 'x = ' + n(x) : 'Divide by ' + (a - c) + ': x = ' + n(x) + '.'], balance: { a: a, b: b, c: c, d: d } };
  });
  S('eq-fraction', 'Equations with fractions', function (L, r) {
    var d = r.pick([2, 3, 4, 5]), x = d * r.nz(-4, 6), b = r.nz(-6, 6), c = x / d + b;
    if (L >= 4) { var d2 = d + 1, xx = d * d2 * r.int(1, 3), tot = xx / d + xx / d2; return { q: 'Solve:  x/' + d + ' + x/' + d2 + ' = ' + tot, a: String(xx), kind: 'num', pre: 'x =', wrong: [String(tot * (d + d2)), String(tot), String(xx / d)], steps: ['Multiply every term by the common denominator, ' + d * d2 + ':  ' + d2 + 'x + ' + d + 'x = ' + tot * d * d2 + '.', (d + d2) + 'x = ' + tot * d * d2 + ', so x = ' + xx + '.'] }; }
    return { q: 'Solve:  x/' + d + ' ' + sg(b) + ' = ' + n(c), a: n(x), kind: 'num', pre: 'x =', wrong: [n((c + b) * d), n(round((c - b) / d, 2)), n(c * d - b), n(-x)].filter(function (w) { return w !== n(x); }), steps: [(b > 0 ? 'Subtract ' + b : 'Add ' + (-b)) + ' on both sides: x/' + d + ' = ' + n(c - b) + '.', 'Multiply both sides by ' + d + ': x = ' + n(x) + '.'] };
  });
  S('code-trace', 'Trace code with variables', function (L, r) {
    var a = r.int(2, 9), b = r.int(2, 5), c = r.int(1, 9);
    if (L >= 3) { var stop = r.int(3, 5), tot = 0; for (var i = 0; i < stop; i++) tot += b * i + c; return { q: 'What does this code print?\n\ntotal = 0\nfor x in range(0, ' + stop + '):\n    total = total + (' + b + ' * x + ' + c + ')\nprint(total)', a: String(tot), kind: 'num', wrong: [String(b * stop + c), String(b * (stop - 1) + c), String(tot + b * stop + c)], steps: ['range(0, ' + stop + ') gives x = 0 to ' + (stop - 1) + '.', 'Values added: ' + Array.apply(0, Array(stop)).map(function (_, i) { return b * i + c; }).join(', ') + '.', 'Total: ' + tot] }; }
    var ans = (a * b - c) * (L >= 2 ? 2 : 1);
    return { q: 'What does this code print?\n\nn = ' + a + '\nn = n * ' + b + '\nn = n - ' + c + (L >= 2 ? '\nn = n * 2' : '') + '\nprint(n)', a: String(ans), kind: 'num', wrong: [String(a * (b - c)), String(a), String(a * b), String(ans + c)].filter(function (w) { return w !== String(ans); }), steps: ['n starts at ' + a + '.', 'n * ' + b + ' → ' + a * b + ', then − ' + c + ' → ' + (a * b - c) + (L >= 2 ? ', then × 2 → ' + ans : '') + '.', 'In code, n = n * ' + b + ' means “replace n with ' + b + ' times its old value”.'] };
  });

  // ----- Unit 4 · linear relations -----
  S('first-diff', 'Linear or non-linear?', function (L, r) {
    var lin = r() < 0.5, m = r.nz(-6, 6), b = r.int(-5, 12), ys = [0, 1, 2, 3, 4].map(function (x) { return lin ? m * x + b : r.pick([0, 1]) ? x * x + b : b * 0 + Math.pow(2, x); });
    if (!lin) { var kind = r.int(0, 1); ys = [0, 1, 2, 3, 4].map(function (x) { return kind ? x * x + b : Math.pow(2, x) * Math.abs(m); }); }
    var diffs = ys.slice(1).map(function (y, i) { return y - ys[i]; });
    return { q: 'x: 0, 1, 2, 3, 4\ny: ' + ys.map(n).join(', ') + '\n\nIs the relation linear?', a: lin ? 'Linear' : 'Non-linear', kind: 'mc', wrong: [lin ? 'Non-linear' : 'Linear'], steps: ['Find the first differences: ' + diffs.map(n).join(', ') + '.', lin ? 'They are all the same (' + n(m) + '), so the relation is linear.' : 'They are not constant, so the relation is non-linear.'] };
  });
  S('linear-predict', 'Use a linear pattern to predict', function (L, r) {
    var m = r.nz(L <= 2 ? 2 : -7, 9), b = r.int(-6, 20), step = L >= 3 ? 2 : 1, X = r.pick([10, 12, 20, 50]);
    return { q: 'A relation is linear.\nx: ' + [0, 1, 2, 3].map(function (i) { return i * step; }).join(', ') + '\ny: ' + [0, 1, 2, 3].map(function (i) { return n(m * i * step + b); }).join(', ') + '\n\nPredict y when x = ' + X + '.', a: n(m * X + b), kind: 'num', wrong: [n(m * step * X + b), n(m * X), n(m * (X - 1) + b), n(m * X - b)].filter(function (w) { return w !== n(m * X + b); }), steps: ['Rate of change: ' + n(m * step) + ' ÷ ' + step + ' = ' + n(m) + '.', 'Initial value (x = 0): ' + n(b) + '.', 'y = ' + linear(m, b) + ', so y = ' + n(m) + '(' + X + ') ' + sg(b) + ' = ' + n(m * X + b)] };
  });
  S('rate-two-points', 'Rate of change from two points', function (L, r) {
    var x1 = r.int(L <= 2 ? 0 : -4, 4), dx = r.int(1, 5), m = r.nz(-5, 6), b = r.int(-8, 12), x2 = x1 + dx, y1 = m * x1 + b, y2 = m * x2 + b; if (L <= 1) { x1 = 0; x2 = dx; y1 = b; y2 = m * dx + b; }
    return { q: 'A line passes through (' + n(x1) + ', ' + n(y1) + ') and (' + n(x2) + ', ' + n(y2) + '). What is its rate of change (slope)?', a: n(m), kind: 'num', wrong: [n(-m), fr(x2 - x1, y2 - y1), n(y2 - y1), n(m + 1)].filter(function (w) { return w !== n(m); }), steps: ['Slope = change in y ÷ change in x.', '(' + n(y2) + ' − ' + np(y1) + ') ÷ (' + n(x2) + ' − ' + np(x1) + ') = ' + n(y2 - y1) + ' ÷ ' + n(x2 - x1) + '.', 'Slope = ' + n(m)] };
  });
  S('rate-initial', 'Rate of change and initial value', function (L, r) {
    var c = r.pick([['A hall charges $%b to book plus $%m per hour.', 1], ['A plumber charges $%b for a visit plus $%m per hour.', 1], ['A tank holds %b L and drains at %m L per minute.', -1], ['A candle is %b cm tall and burns %m cm each hour.', -1]]), m = r.int(2, 25), b = r.int(m + 5, 90) * (c[1] < 0 ? 2 : 1), ask = r.pick(['rate', 'initial', 'eq']);
    var text = c[0].replace('%b', b).replace('%m', m), mm = c[1] * m; if (L <= 1) ask = r.pick(['rate', 'initial']);
    if (ask === 'eq') return { q: text + ' Write the equation:  y = …', a: linear(mm, b), kind: 'expr', pre: 'y =', wrong: [linear(b * c[1], m), linear(-mm, b), linear(mm, -b)], steps: ['Initial value (the start): ' + b + '.', 'Rate of change: ' + n(mm) + (mm < 0 ? ' (it is going down).' : '.'), 'y = ' + linear(mm, b)] };
    return { q: text + ' What is the ' + (ask === 'rate' ? 'rate of change' : 'initial value') + '?', a: n(ask === 'rate' ? mm : b), kind: 'num', wrong: [n(ask === 'rate' ? b : mm), n(ask === 'rate' ? -mm : b + mm), n(ask === 'rate' ? mm * 2 : 0)].filter(function (w) { return w !== n(ask === 'rate' ? mm : b); }), steps: ['The initial value is the amount at the start (when x = 0): ' + b + '.', 'The rate of change is how much it changes for each 1 unit: ' + n(mm) + '.'] };
  });
  S('slope-intercept', 'Read slope and y-intercept', function (L, r) {
    var m = L >= 3 && r() < 0.5 ? R(r.nz(-5, 5), r.pick([2, 3, 4])) : R(r.nz(-6, 6)), b = r.int(-9, 9), ask = r() < 0.5 ? 'slope' : 'y-intercept';
    return { q: 'What is the ' + ask + ' of  y = ' + linear(m, b) + ' ?', a: ask === 'slope' ? fs(m) : n(b), kind: 'num', wrong: [ask === 'slope' ? n(b) : fs(m), ask === 'slope' ? fs(R(-m.n, m.d)) : n(-b), ask === 'slope' ? (m.d === 1 ? n(m.n + 1) : fr(m.d, m.n)) : n(b + 1)].filter(function (w) { return w !== (ask === 'slope' ? fs(m) : n(b)); }), steps: ['In y = ax + b, a is the slope and b is the y-intercept.', 'Slope: ' + fs(m) + (m.n === m.d || m.n === -m.d ? ' (an x with no number in front has a coefficient of 1).' : '.') + '   y-intercept: ' + n(b) + '.'] };
  });
  S('point-on-line', 'Is the point on the line?', function (L, r) {
    var m = r.nz(-5, 5), b = r.int(-8, 8), x = r.int(-4, 5), on = r() < 0.5, y = m * x + b + (on ? 0 : r.pick([-2, -1, 1, 2]));
    return { q: 'Is (' + n(x) + ', ' + n(y) + ') on the line  y = ' + linear(m, b) + ' ?', a: on ? 'Yes' : 'No', kind: 'mc', wrong: [on ? 'No' : 'Yes'], steps: ['Substitute x = ' + n(x) + ':  y = ' + n(m) + '(' + n(x) + ') ' + sg(b) + ' = ' + n(m * x + b) + '.', on ? 'That matches the point’s y-value, so it is on the line.' : 'The point has y = ' + n(y) + ', which does not match, so it is not on the line.'] };
  });
  S('graph-line', 'Graph a line', function (L, r) {
    var m = L >= 3 && r() < 0.5 ? R(r.nz(-3, 3), 2) : R(r.nz(L <= 1 ? 1 : -3, 3)), b = r.int(-4, 4);
    return { q: 'Graph  y = ' + linear(m, b) + '.  Tap two points that are on the line.', kind: 'graph', m: m.n / m.d, b: b, a: 'y = ' + linear(m, b), wrong: ['y = ' + linear(R(-m.n, m.d), b), 'y = ' + linear(m, -b || 1), 'y = ' + linear(R(b || 1), m.n)], steps: ['Start at the y-intercept: (0, ' + n(b) + ').', 'Use the slope ' + fs(m) + ': from there go right ' + m.d + ' and ' + (m.n > 0 ? 'up ' : 'down ') + Math.abs(m.n) + ' to (' + m.d + ', ' + n(b + m.n) + ').'] };
  });
  S('line-equation', 'Find the equation of a line', function (L, r) {
    var m = r.nz(-5, 6), b = r.int(-9, 12), x1 = L <= 1 ? 0 : r.int(1, 4), x2 = x1 + r.int(1, 4), form = L <= 2 ? 'slope-point' : r.pick(['two', 'table']);
    var q = form === 'slope-point' ? 'A line has slope ' + n(m) + ' and passes through (' + x1 + ', ' + n(m * x1 + b) + ').' : form === 'two' ? 'A line passes through (' + x1 + ', ' + n(m * x1 + b) + ') and (' + x2 + ', ' + n(m * x2 + b) + ').' : 'x: ' + [1, 2, 3].map(function (i) { return i * 2; }).join(', ') + '\ny: ' + [1, 2, 3].map(function (i) { return n(m * i * 2 + b); }).join(', ') + '\n';
    return { q: q + ' Find its equation:  y = …', a: linear(m, b), kind: 'expr', pre: 'y =', wrong: [linear(m, m * x1 + b), linear(-m, b), linear(b || 2, m)].filter(function (w) { return w !== linear(m, b); }), steps: [form === 'slope-point' ? 'The slope is given: ' + n(m) + '.' : form === 'two' ? 'Slope: (' + n(m * x2 + b) + ' − ' + np(m * x1 + b) + ') ÷ (' + x2 + ' − ' + x1 + ') = ' + n(m) + '.' : 'y changes by ' + n(m * 2) + ' when x changes by 2, so the slope is ' + n(m) + '.', 'Substitute a point into y = ' + n(m) + 'x + b to find b = ' + n(b) + '.', 'y = ' + linear(m, b)] };
  });
  S('transform-line', 'Transform a line', function (L, r) {
    var a = r.nz(-5, 5), k = r.int(1, 6), t = r.pick(L <= 2 ? ['up', 'down'] : ['up', 'down', 'reflect', 'rotate', 'right']); if (a === 1 && t === 'rotate') a = 2;
    var res = t === 'up' ? linear(a, k) : t === 'down' ? linear(a, -k) : t === 'reflect' ? linear(-a, 0) : t === 'right' ? linear(a, -a * k) : linear(R(-1, a), 0);
    var desc = { up: 'translated up ' + k, down: 'translated down ' + k, reflect: 'reflected in the x-axis', rotate: 'rotated 90° about the origin', right: 'translated right ' + k }[t];
    return { q: 'The line y = ' + linear(a, 0) + ' is ' + desc + '. Write the new equation:  y = …', a: res, kind: 'expr', pre: 'y =', wrong: [t === 'up' ? linear(a, -k) : linear(a, k), linear(a + k, 0), t === 'rotate' ? linear(-a, 0) : linear(R(-1, a), 0)].filter(function (w) { return w !== res; }), steps: [{ up: 'Up ' + k + ': add ' + k + '. The slope stays the same.', down: 'Down ' + k + ': subtract ' + k + '. The slope stays the same.', reflect: 'A reflection in an axis changes the sign of the slope.', rotate: 'A 90° rotation gives the negative reciprocal slope: flip it and change the sign.', right: 'Right ' + k + ': replace x with (x − ' + k + '):  y = ' + n(a) + '(x − ' + k + ').' }[t], 'y = ' + res] };
  });
  S('intercepts', 'Find intercepts of ax + by = k', function (L, r) {
    var a = r.int(1, 6), b = r.int(1, 6), k = a * b * r.int(1, 3), ask = r() < 0.5 ? 'x' : 'y';
    return { q: 'Find the ' + ask + '-intercept of  ' + (a === 1 ? '' : a) + 'x + ' + (b === 1 ? '' : b) + 'y = ' + k + '.', a: String(ask === 'x' ? k / a : k / b), kind: 'num', wrong: [String(ask === 'x' ? k / b : k / a), String(k), String(ask === 'x' ? a : b), String(k - a - b)].filter(function (w, i, arr) { return w !== String(ask === 'x' ? k / a : k / b) && arr.indexOf(w) === i; }), steps: ['At the ' + ask + '-intercept the other variable is 0.', ask === 'x' ? 'Let y = 0:  ' + a + 'x = ' + k + ', so x = ' + k / a + '.' : 'Let x = 0:  ' + b + 'y = ' + k + ', so y = ' + k / b + '.'] };
  });
  S('intersection', 'Point of intersection', function (L, r) {
    var x = r.int(L <= 2 ? 1 : -4, 8), m1 = r.nz(-4, 8), m2 = r.nz(-4, 8); while (m2 === m1) m2 = r.nz(-4, 8); var y = r.int(-6, 60), b1 = y - m1 * x, b2 = y - m2 * x;
    return { q: 'Find the point of intersection of  y = ' + linear(m1, b1) + '  and  y = ' + linear(m2, b2) + '.', a: '(' + n(x) + ', ' + n(y) + ')', kind: 'pt', wrong: ['(' + n(y) + ', ' + n(x) + ')', '(' + n(-x) + ', ' + n(y) + ')', '(' + n(x) + ', ' + n(b1 + b2) + ')'], steps: ['Set the expressions equal: ' + linear(m1, b1) + ' = ' + linear(m2, b2) + '.', 'Solve: ' + linear(m1 - m2, 0) + ' = ' + n(b2 - b1) + ', so x = ' + n(x) + '.', 'Substitute: y = ' + n(m1) + '(' + n(x) + ') ' + sg(b1) + ' = ' + n(y) + '.', 'Point: (' + n(x) + ', ' + n(y) + '). Check it in the other equation.'] };
  });

  // ----- Unit 5 · geometry and measurement -----
  S('triangle-angle', 'Angles in a triangle', function (L, r) {
    var a = r.int(25, 95), b = r.int(20, 150 - a), form = r.int(0, L >= 3 ? 2 : L >= 2 ? 1 : 0);
    if (form === 1) { var top = r.int(10, 80) * 2; return { q: 'An isosceles triangle has a top angle of ' + top + '°. Find each base angle.', a: (180 - top) / 2 + '°', kind: 'num', wrong: [(180 - top) + '°', top / 2 + '°', (90 - top) + '°'], steps: ['The three angles add to 180°: 180 − ' + top + ' = ' + (180 - top) + '.', 'The two base angles are equal: ' + (180 - top) + ' ÷ 2 = ' + (180 - top) / 2 + '°.'] }; }
    if (form === 2) return { q: 'An exterior angle of a triangle is ' + (a + b) + '°. One of the opposite interior angles is ' + a + '°. Find the other.', a: b + '°', kind: 'num', wrong: [(180 - a - b) + '°', (a + b + a) + '°', (180 - a) + '°'], steps: ['An exterior angle equals the sum of the two opposite interior angles.', (a + b) + ' − ' + a + ' = ' + b + '°'] };
    return { q: 'A triangle has angles of ' + a + '° and ' + b + '°. Find the third angle.', a: (180 - a - b) + '°', kind: 'num', wrong: [(a + b) + '°', (360 - a - b) + '°', (90 - Math.min(a, b)) + '°'], steps: ['The angles in a triangle add to 180°.', '180 − ' + a + ' − ' + b + ' = ' + (180 - a - b) + '°'] };
  });
  S('circle-measure', 'Circumference and area of a circle', function (L, r) {
    var rad = r.int(2, 12), useD = L >= 2 && r() < 0.5, area = r() < 0.5, ans = round(area ? Math.PI * rad * rad : 2 * Math.PI * rad, 1);
    return { q: 'A circle has a ' + (useD ? 'diameter of ' + rad * 2 : 'radius of ' + rad) + ' cm. Find its ' + (area ? 'area' : 'circumference') + ' to one decimal place.', a: ans.toFixed(1) + (area ? ' cm²' : ' cm'), kind: 'num', tol: 0.15, wrong: [round(area ? 2 * Math.PI * rad : Math.PI * rad * rad, 1).toFixed(1), round(area ? Math.PI * rad * rad * 4 : Math.PI * rad, 1).toFixed(1), round(area ? rad * rad : 2 * rad, 1).toFixed(1)], steps: (useD ? ['Radius = diameter ÷ 2 = ' + rad + ' cm.'] : []).concat([area ? 'A = πr² = π × ' + rad + '² = π × ' + rad * rad + '.' : 'C = 2πr = 2 × π × ' + rad + '.', '≈ ' + ans.toFixed(1) + (area ? ' cm²' : ' cm')]) };
  });
  S('convert-metric', 'Convert metric units', function (L, r) {
    var c = r.pick([['km', 'm', 1000], ['m', 'cm', 100], ['cm', 'mm', 10], ['kg', 'g', 1000], ['L', 'mL', 1000]]), down = r() < 0.5, v = r.pick([0.75, 1.2, 2.5, 3, 4.5, 12, 0.08]), from = down ? v : round(v * c[2], 3), ans = down ? round(v * c[2], 3) : v;
    return { q: 'Convert ' + n(from) + ' ' + (down ? c[0] : c[1]) + ' to ' + (down ? c[1] : c[0]) + '.', a: n(ans) + ' ' + (down ? c[1] : c[0]), kind: 'num', wrong: [n(round(down ? v / c[2] : from * c[2], 6)), n(round(ans * 10, 4)), n(round(ans / 10, 5))], steps: ['1 ' + c[0] + ' = ' + c[2] + ' ' + c[1] + '.', down ? 'To a smaller unit there are more of them: multiply. ' + n(from) + ' × ' + c[2] + ' = ' + n(ans) + '.' : 'To a larger unit there are fewer of them: divide. ' + n(from) + ' ÷ ' + c[2] + ' = ' + n(ans) + '.'] };
  });
  S('convert-imperial', 'Convert between systems', function (L, r) {
    var c = r.pick([['in', 'cm', 2.54, 'x'], ['mi', 'km', 1.609, 'x'], ['lb', 'kg', 2.205, '/'], ['ft', 'm', 0.3048, 'x'], ['gal (US)', 'L', 3.785, 'x']]), v = r.pick([5, 8, 10, 12, 15, 26, 50, 150]), ans = round(c[3] === 'x' ? v * c[2] : v / c[2], 1);
    return { q: 'Convert ' + v + ' ' + c[0] + ' to ' + c[1] + ', to one decimal place.  (' + (c[3] === 'x' ? '1 ' + c[0] + ' ≈ ' + c[2] + ' ' + c[1] : '1 ' + c[1] + ' ≈ ' + c[2] + ' ' + c[0]) + ')', a: ans.toFixed(1) + ' ' + c[1], kind: 'num', tol: 0.06, wrong: [round(c[3] === 'x' ? v / c[2] : v * c[2], 1).toFixed(1), round(v + c[2], 1).toFixed(1), round(ans * 10, 1).toFixed(1)], steps: [c[3] === 'x' ? 'Each ' + c[0] + ' is ' + c[2] + ' ' + c[1] + ': multiply.' : 'It takes ' + c[2] + ' ' + c[0] + ' to make 1 ' + c[1] + ': divide.', v + (c[3] === 'x' ? ' × ' : ' ÷ ') + c[2] + ' ≈ ' + ans.toFixed(1) + ' ' + c[1]] };
  });
  S('convert-area-rate', 'Convert area units and rates', function (L, r) {
    if (r() < 0.5) { var v = r.pick([36, 54, 72, 90, 108]); return { q: 'Convert ' + v + ' km/h to metres per second.', a: v / 3.6 + ' m/s', kind: 'num', wrong: [round(v * 3.6, 1) + '', v * 1000 + '', round(v / 60, 2) + ''], steps: [v + ' km = ' + v * 1000 + ' m, and 1 h = 3600 s.', v * 1000 + ' ÷ 3600 = ' + v / 3.6 + ' m/s'] }; }
    var a = r.pick([0.5, 1.5, 2, 2.5, 3, 4]);
    return { q: 'Convert ' + a + ' m² to square centimetres.', a: a * 10000 + ' cm²', kind: 'num', wrong: [String(a * 100), String(a * 1000), String(a / 10000)], steps: ['1 m = 100 cm, so 1 m² = 100 × 100 = 10 000 cm².', a + ' × 10 000 = ' + a * 10000 + ' cm²'] };
  });
  var TRIPLES = [[3, 4, 5], [5, 12, 13], [6, 8, 10], [8, 15, 17], [9, 12, 15], [7, 24, 25], [12, 16, 20]];
  S('pyth-hyp', 'Pythagorean theorem: hypotenuse', function (L, r) {
    var t = r.pick(TRIPLES), a = t[0], b = t[1]; if (L >= 3) { a = r.int(3, 12); b = r.int(3, 12); } var c = Math.sqrt(a * a + b * b), ans = Number.isInteger(c) ? String(c) : c.toFixed(1);
    return { q: 'A right triangle has legs of ' + a + ' cm and ' + b + ' cm. Find the hypotenuse' + (Number.isInteger(c) ? '.' : ' to one decimal place.'), a: ans + ' cm', kind: 'num', tol: Number.isInteger(c) ? undefined : 0.06, wrong: [String(a + b), String(a * a + b * b), round(Math.sqrt(Math.abs(b * b - a * a)) || 1, 1) + ''], steps: ['c² = a² + b² = ' + a + '² + ' + b + '² = ' + a * a + ' + ' + b * b + ' = ' + (a * a + b * b) + '.', 'c = √' + (a * a + b * b) + ' ' + (Number.isInteger(c) ? '= ' : '≈ ') + ans + ' cm'] };
  });
  S('pyth-leg', 'Pythagorean theorem: a leg', function (L, r) {
    var t = r.pick(TRIPLES), a = t[0], c = t[2]; if (L >= 3) { c = r.int(8, 20); a = r.int(3, c - 2); } var b = Math.sqrt(c * c - a * a), ans = Number.isInteger(b) ? String(b) : b.toFixed(1);
    return { q: 'A right triangle has a hypotenuse of ' + c + ' m and one leg of ' + a + ' m. Find the other leg' + (Number.isInteger(b) ? '.' : ' to one decimal place.'), a: ans + ' m', kind: 'num', tol: Number.isInteger(b) ? undefined : 0.06, wrong: [round(Math.sqrt(c * c + a * a), 1) + '', String(c - a), String(c * c - a * a)], steps: ['The hypotenuse is the longest side, so subtract: b² = ' + c + '² − ' + a + '² = ' + c * c + ' − ' + a * a + ' = ' + (c * c - a * a) + '.', 'b = √' + (c * c - a * a) + ' ' + (Number.isInteger(b) ? '= ' : '≈ ') + ans + ' m'] };
  });
  S('pyth-test', 'Is it a right triangle?', function (L, r) {
    var t = r.pick(TRIPLES).slice(), right = r() < 0.5; if (!right) t[r.int(0, 1)] += 1;
    return { q: 'A triangle has sides of ' + t.join(' cm, ') + ' cm. Is it a right triangle?', a: right ? 'Yes' : 'No', kind: 'mc', wrong: [right ? 'No' : 'Yes'], steps: ['Test the two shorter sides: ' + t[0] + '² + ' + t[1] + '² = ' + (t[0] * t[0] + t[1] * t[1]) + '.', 'Longest side: ' + t[2] + '² = ' + t[2] * t[2] + '.', right ? 'They are equal, so it is a right triangle.' : 'They are not equal, so it is not a right triangle.'] };
  });
  S('vol-prism', 'Volume of a prism', function (L, r) {
    var l = r.int(2, 12), w = r.int(2, 9), h = r.int(2, 10);
    if (L >= 3 && r() < 0.5) return { q: 'A triangular prism is ' + l + ' cm long. Its triangular end has a base of ' + w * 2 + ' cm and a height of ' + h + ' cm. Find the volume.', a: w * h * l + ' cm³', kind: 'num', wrong: [String(2 * w * h * l), String(w * 2 + h + l), String(w * h * l / 2)], steps: ['Area of the triangle: ' + w * 2 + ' × ' + h + ' ÷ 2 = ' + w * h + ' cm².', 'V = area of base × length = ' + w * h + ' × ' + l + ' = ' + w * h * l + ' cm³'] };
    if (L >= 4) return { q: 'A rectangular prism has a volume of ' + l * w * h + ' cm³ and a base ' + l + ' cm by ' + w + ' cm. Find its height.', a: h + ' cm', kind: 'num', wrong: [String(l * w), String(l * w * h - l * w), String(h * 2)], steps: ['V = area of base × height, so height = V ÷ area of base.', 'Base: ' + l + ' × ' + w + ' = ' + l * w + '.   ' + l * w * h + ' ÷ ' + l * w + ' = ' + h + ' cm'] };
    return { q: 'Find the volume of a rectangular prism ' + l + ' cm by ' + w + ' cm by ' + h + ' cm.', a: l * w * h + ' cm³', kind: 'num', wrong: [String(l + w + h), String(2 * (l * w + l * h + w * h)), String(l * w)], steps: ['V = length × width × height.', l + ' × ' + w + ' × ' + h + ' = ' + l * w * h + ' cm³'] };
  });
  S('vol-pyramid', 'Volume of a pyramid', function (L, r) {
    var s = r.pick([3, 6, 9, 12]), h = r.int(2, 12), V = s * s * h / 3;
    if (L <= 1) { var pv = r.int(2, 30) * 3; return { q: 'A prism holds ' + pv + ' cm³. How much does a pyramid with the same base and height hold?', a: pv / 3 + ' cm³', kind: 'num', wrong: [String(pv * 3), String(pv / 2), String(pv - 3)], steps: ['A pyramid holds one third of the matching prism.', pv + ' ÷ 3 = ' + pv / 3 + ' cm³'] }; }
    return { q: 'A pyramid has a square base with ' + s + ' m sides and a height of ' + h + ' m. Find its volume.', a: V + ' m³', kind: 'num', wrong: [String(s * s * h), String(s * h / 3), String(s * s * h / 2)], steps: ['Area of the base: ' + s + ' × ' + s + ' = ' + s * s + ' m².', 'V = ⅓ × area of base × height = ' + s * s + ' × ' + h + ' ÷ 3 = ' + V + ' m³'] };
  });
  S('vol-cylinder', 'Volume of a cylinder', function (L, r) {
    var rad = r.int(2, 8), h = r.int(3, 15), useD = L >= 2 && r() < 0.5, V = Math.PI * rad * rad * h;
    return { q: 'A cylinder has a ' + (useD ? 'diameter of ' + rad * 2 : 'radius of ' + rad) + ' cm and a height of ' + h + ' cm. Find its volume to the nearest cubic centimetre.', a: Math.round(V) + ' cm³', kind: 'num', tol: 1.5, wrong: [String(Math.round(Math.PI * rad * 2 * h)), String(Math.round(V * 4)), String(Math.round(V / 3)), String(rad * rad * h)], steps: (useD ? ['Use the radius, not the diameter: r = ' + rad + ' cm.'] : []).concat(['V = πr²h = π × ' + rad + '² × ' + h + ' = ' + rad * rad * h + 'π.', '≈ ' + Math.round(V) + ' cm³']) };
  });
  S('vol-cone', 'Volume of a cone', function (L, r) {
    var rad = r.int(2, 8), h = r.pick([3, 6, 9, 12, 5, 10]), V = Math.PI * rad * rad * h / 3;
    if (L <= 1) { var cv = r.int(3, 40) * 3; return { q: 'A cylinder holds ' + cv + ' cm³. How much does a cone with the same base and height hold?', a: cv / 3 + ' cm³', kind: 'num', wrong: [String(cv * 3), String(cv / 2), String(cv - 3)], steps: ['A cone holds one third of the matching cylinder.', cv + ' ÷ 3 = ' + cv / 3 + ' cm³'] }; }
    return { q: 'A cone has a radius of ' + rad + ' cm and a height of ' + h + ' cm. Find its volume to one decimal place.', a: V.toFixed(1) + ' cm³', kind: 'num', tol: 0.2, wrong: [(V * 3).toFixed(1), (Math.PI * rad * h / 3).toFixed(1), (V / 2 * 3).toFixed(1)], steps: ['V = ⅓πr²h = π × ' + rad + '² × ' + h + ' ÷ 3 = ' + round(rad * rad * h / 3, 2) + 'π.', '≈ ' + V.toFixed(1) + ' cm³'] };
  });
  S('scale-factor', 'Changing dimensions', function (L, r) {
    var k = r.pick([2, 3, 4, 5, 10]), what = r.pick(L <= 2 ? ['perimeter', 'area'] : ['perimeter', 'area', 'volume', 'one']), ans = { perimeter: k, area: k * k, volume: k * k * k, one: k }[what];
    var q = what === 'one' ? 'Only the height of a cylinder is multiplied by ' + k + '. By what factor does the volume change?' : 'Every dimension of a ' + (what === 'volume' ? 'box' : 'rectangle') + ' is multiplied by ' + k + '. By what factor does its ' + what + ' change?';
    return { q: q, a: String(ans), kind: 'num', wrong: [String(k), String(k * k), String(k * k * k), String(k * 2), String(k * 3)].filter(function (w) { return w !== String(ans); }).slice(0, 3), steps: ['Scale factor k = ' + k + '.  Lengths × k,  areas × k²,  volumes × k³.', what === 'one' ? 'Only one dimension changes, so the volume is multiplied by ' + k + '.' : what + ': ' + (what === 'perimeter' ? k : what === 'area' ? k + '² = ' + k * k : k + '³ = ' + k * k * k) + '.'] };
  });

  // ----- Unit 6 · data -----
  function pool(id, name, items, intro) { S(id, name, function (L, r) { var p = r.pick(items); return { q: (intro || '') + p[0], a: p[1], kind: 'mc', wrong: p[2], steps: [p[3]] }; }, { pool: items, intro: intro || '' }); }
  pool('data-type', 'Kinds of data', [
    ['number of siblings', 'quantitative, discrete', ['quantitative, continuous', 'qualitative'], 'It is counted in whole numbers.'], ['height in centimetres', 'quantitative, continuous', ['quantitative, discrete', 'qualitative'], 'It is measured and can take any value in a range.'],
    ['favourite app', 'qualitative', ['quantitative, discrete', 'quantitative, continuous'], 'It is a category, not a number.'], ['postal code', 'qualitative', ['quantitative, discrete', 'quantitative, continuous'], 'It labels a place. You would not add or average postal codes.'],
    ['time to run 100 m', 'quantitative, continuous', ['quantitative, discrete', 'qualitative'], 'Time is measured and can take any value.'], ['number of texts sent today', 'quantitative, discrete', ['quantitative, continuous', 'qualitative'], 'It is a count.'], ['eye colour', 'qualitative', ['quantitative, discrete', 'quantitative, continuous'], 'It is a category.'], ['mass of a backpack', 'quantitative, continuous', ['quantitative, discrete', 'qualitative'], 'Mass is measured.']], 'What kind of data is this?  ');
  pool('bias', 'Samples, censuses and bias', [
    ['Every student in the school is asked.', 'a census', ['a biased sample', 'a random sample'], 'A census asks the whole population.'], ['Only the basketball team is asked about gym funding.', 'a biased sample', ['a census', 'a random sample'], 'The group asked has a reason to answer one way and does not represent everyone.'],
    ['Fifty student numbers are drawn by a computer.', 'a random sample', ['a census', 'a biased sample'], 'Everyone has the same chance of being chosen.'], ['The first 30 students in the cafeteria line are asked about a longer lunch.', 'a biased sample', ['a census', 'a random sample'], 'Students who buy lunch early are not typical of the whole school.'],
    ['A website poll that anyone can answer as often as they like.', 'a biased sample', ['a census', 'a random sample'], 'People choose themselves, and can vote many times.'], ['Every tenth name on the full school list is asked.', 'a random sample', ['a census', 'a biased sample'], 'A systematic choice from the whole list gives everyone a fair chance.']]);
  S('five-number', 'Median, quartiles and range', function (L, r) {
    var len = L <= 1 ? 7 : L === 2 ? r.pick([7, 9]) : r.pick([8, 10, 11]), d = []; while (d.length < len) d.push(r.int(2, 40)); d.sort(function (a, b) { return a - b; });
    var med = function (a) { var m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; }, half = len >> 1, q1 = med(d.slice(0, half)), q3 = med(d.slice(len - half)), M = med(d), mean = round(d.reduce(function (s, x) { return s + x; }, 0) / len, 1);
    var ask = r.pick(L <= 1 ? ['median', 'range'] : L === 2 ? ['median', 'range', 'Q1', 'Q3'] : ['median', 'Q1', 'Q3', 'IQR', 'mean (one decimal place)']), ans = { median: M, range: d[len - 1] - d[0], Q1: q1, Q3: q3, IQR: q3 - q1 }[ask]; if (ans === undefined) ans = mean;
    return { q: 'Data: ' + d.join(', ') + '\n\nFind ' + (/^(Q1|Q3|IQR)$/.test(ask) ? ask : 'the ' + ask) + '.', a: n(ans), kind: 'num', tol: /mean/.test(ask) ? 0.06 : undefined, data: d, wrong: [n(M), n(q1), n(q3), n(d[len - 1] - d[0]), n(mean), n(q3 - q1), n(d[half])].filter(function (w, i, arr) { return w !== n(ans) && arr.indexOf(w) === i; }).slice(0, 3), steps: ['The data is in order. There are ' + len + ' values.', 'Median = ' + n(M) + (len % 2 ? ' (the middle value).' : ' (the mean of the two middle values).'), 'Q1 = median of the lower half = ' + n(q1) + '.   Q3 = median of the upper half = ' + n(q3) + '.', 'IQR = Q3 − Q1 = ' + n(q3 - q1) + '.   Range = ' + d[len - 1] + ' − ' + d[0] + ' = ' + (d[len - 1] - d[0]) + '.' + (/mean/.test(ask) ? '   Mean = sum ÷ ' + len + ' = ' + n(mean) + '.' : '')] };
  });
  pool('correlation', 'Describe a correlation', [
    ['height and shoe size', 'positive', ['negative', 'none'], 'Taller people tend to have bigger feet: both go up together.'], ['age of a car and its value', 'negative', ['positive', 'none'], 'As the age goes up, the value goes down.'], ['hours of sleep and the last digit of your phone number', 'none', ['positive', 'negative'], 'There is no relationship between them.'],
    ['outdoor temperature and the heating bill', 'negative', ['positive', 'none'], 'Warmer days need less heating.'], ['free-throw practice and shooting percentage', 'positive', ['negative', 'none'], 'More practice tends to go with a higher percentage.'], ['shoe size and math mark (Grade 9 students)', 'none', ['positive', 'negative'], 'Foot size has nothing to do with marks.'],
    ['hours studied and test mark', 'positive', ['negative', 'none'], 'More study tends to go with higher marks.'], ['distance driven and fuel left in the tank', 'negative', ['positive', 'none'], 'The farther you drive, the less fuel is left.']], 'What kind of correlation would you expect between ');
  S('bestfit', 'Use a line of best fit', function (L, r) {
    var m = r.pick([2, 3, 4, 5, 1.5]), b = r.int(5, 50), lo = 2, hi = 12, x = L <= 2 ? r.int(3, 11) : r.pick([5.5, 7.5, 15, 20, 9]);
    if (L >= 2 && r() < 0.35) return { q: 'A line of best fit is y = ' + m + 'x + ' + b + ' for data with x-values from ' + lo + ' to ' + hi + '. Is a prediction for x = ' + x + ' interpolation or extrapolation?', a: x <= hi ? 'interpolation' : 'extrapolation', kind: 'mc', wrong: [x <= hi ? 'extrapolation' : 'interpolation'], steps: ['Inside the range of the data is interpolation. Outside it is extrapolation, which is less reliable.', x + ' is ' + (x <= hi ? 'between ' + lo + ' and ' + hi + ': interpolation.' : 'beyond ' + hi + ': extrapolation.')] };
    return { q: 'A line of best fit is  y = ' + m + 'x + ' + b + '.  Predict y when x = ' + x + '.', a: n(m * x + b), kind: 'num', wrong: [n(m + x + b), n(m * (x + b)), n(m * x), n(m * x - b)], steps: ['Substitute x = ' + x + ' into the model.', 'y = ' + m + '(' + x + ') + ' + b + ' = ' + n(m * x) + ' + ' + b + ' = ' + n(m * x + b)] };
  });
  pool('model-parts', 'Assumption, data or limitation?', [
    ['The tap drips at the same rate all year.', 'an assumption', ['data', 'a limitation', 'the model'], 'It was not measured for a year. It is something we decided to treat as true.'], ['The counts were 28, 31, 30, 32 and 29 drips.', 'data', ['an assumption', 'a limitation', 'the model'], 'These numbers were collected by measuring.'],
    ['If someone tightens the tap, the model fails.', 'a limitation', ['an assumption', 'data', 'the model'], 'It describes a situation where the model stops working.'], ['V = 2.16d', 'the model', ['an assumption', 'data', 'a limitation'], 'The equation is the model itself.'],
    ['Twenty drips make about 1 mL.', 'an assumption', ['data', 'a limitation', 'the model'], 'Drop size was taken as a typical value, not measured for this tap.'], ['The model was built from only five minutes of counting.', 'a limitation', ['an assumption', 'data', 'the model'], 'A small sample limits how far the model can be trusted.']], 'In the dripping tap model, what is this?  ');
  S('model-use', 'Build and use a model', function (L, r) {
    var drips = r.int(24, 36), perMl = 20, ml = drips / perMl * 60 * 24, d = r.pick([7, 30, 365]);
    if (L <= 2) { var rate = r.pick([1.5, 2, 2.4, 3]); return { q: 'A model for a leaking tap is  V = ' + rate + 'd,  where V is litres wasted after d days. How much is wasted in ' + d + ' days?', a: n(round(rate * d, 1)) + ' L', kind: 'num', wrong: [n(round(d / rate, 1)), n(rate + d), n(round(rate * d * 10, 1))], steps: ['Substitute d = ' + d + '.', 'V = ' + rate + ' × ' + d + ' = ' + n(round(rate * d, 1)) + ' L'] }; }
    return { q: 'A tap drips ' + drips + ' times a minute. Assume 20 drips make 1 mL. How many litres are wasted in one day?', a: n(round(ml / 1000, 2)) + ' L', kind: 'num', tol: 0.02, wrong: [n(round(ml, 0)), n(round(drips * 60 * 24 / 1000, 2)), n(round(ml / 1000 / 24, 2))], steps: [drips + ' drips ÷ 20 = ' + drips / 20 + ' mL each minute.', '× 60 × 24 = ' + n(round(ml, 1)) + ' mL each day.', '÷ 1000 = ' + n(round(ml / 1000, 2)) + ' L'] };
  });

  // ----- Unit 7 · financial literacy -----
  S('inflation', 'Prices and inflation', function (L, r) {
    var p = r.pick([20, 50, 60, 80, 200, 2000]), rate = r.pick([2, 3, 4, 5]), yrs = L <= 2 ? 1 : r.int(2, 5), ans = round(p * Math.pow(1 + rate / 100, yrs), 2);
    return { q: 'A ' + money(p) + ' item rises in price by ' + rate + '% per year. What does it cost after ' + yrs + ' year' + (yrs > 1 ? 's' : '') + '?', a: money(ans), kind: 'num', tol: 0.011, wrong: [money(p + rate * yrs), money(round(p * (1 + rate * yrs / 100) + (yrs > 1 ? 1 : p * 0.1), 2)), money(round(p * rate / 100, 2))], steps: ['A ' + rate + '% rise means multiplying by ' + (1 + rate / 100) + '.', yrs > 1 ? 'Do it once for each year: ' + p + ' × ' + (1 + rate / 100) + sup(yrs) + '.' : p + ' × ' + (1 + rate / 100) + '.', money(ans)] };
  });
  S('exchange', 'Exchange rates', function (L, r) {
    var rate = r.pick([1.35, 1.38, 1.4, 1.42]), usd = r.pick([20, 50, 120, 250, 400]), back = L >= 3 && r() < 0.5;
    return back ? { q: 'Suppose 1 US dollar costs ' + rate.toFixed(2) + ' Canadian dollars. How many US dollars do you get for C$' + round(usd * rate, 2) + '?', a: 'US$' + usd, kind: 'num', tol: 0.011, wrong: [String(round(usd * rate * rate, 2)), String(round(usd * rate - rate, 2)), String(usd + 1)], steps: ['Going from Canadian to US dollars: divide by the rate.', round(usd * rate, 2) + ' ÷ ' + rate + ' = ' + usd] }
      : { q: 'An item is sold online for US$' + usd + '. Suppose 1 US dollar costs ' + rate.toFixed(2) + ' Canadian dollars. What is the price in Canadian dollars?', a: money(round(usd * rate, 2)), kind: 'num', tol: 0.011, wrong: [money(round(usd / rate, 2)), money(usd + rate), money(usd)], steps: ['Each US dollar costs ' + rate.toFixed(2) + ' Canadian dollars: multiply.', usd + ' × ' + rate + ' = ' + money(round(usd * rate, 2))] };
  });
  S('shrink', 'Unit price and shrinkflation', function (L, r) {
    var g1 = r.pick([400, 500, 750, 1000]), g2 = g1 - r.pick([50, 100]), price = r.pick([4, 5, 6, 8]), u1 = price / g1 * 100, u2 = price / g2 * 100;
    if (L <= 2) return { q: 'A ' + g2 + ' g box costs ' + money(price) + '. What is the price per 100 g, to the nearest cent?', a: money(round(u2, 2)), kind: 'num', tol: 0.011, wrong: [money(round(g2 / price / 100, 2)), money(round(u2 * 10, 2)), money(round(u1 - 0.3, 2))], steps: [g2 + ' g is ' + g2 / 100 + ' lots of 100 g.', money(price) + ' ÷ ' + g2 / 100 + ' = ' + money(round(u2, 2))] };
    var pc = round((u2 - u1) / u1 * 100, 1);
    return { q: 'A ' + g1 + ' g box cost ' + money(price) + '. The box is now ' + g2 + ' g for the same price. By what percent has the unit price increased, to one decimal place?', a: pc.toFixed(1) + '%', kind: 'num', tol: 0.15, wrong: [round((g1 - g2) / g1 * 100, 1).toFixed(1) + '%', (g1 - g2) / 10 + '%', round(u2 - u1, 1).toFixed(1) + '%'].filter(function (w) { return w !== pc.toFixed(1) + '%'; }), steps: ['Old: ' + money(price) + ' ÷ ' + g1 + ' g.   New: ' + money(price) + ' ÷ ' + g2 + ' g.', 'The unit price is multiplied by ' + g1 + ' ÷ ' + g2 + ' = ' + round(g1 / g2, 4) + '.', 'An increase of ' + pc.toFixed(1) + '%, although the price tag did not change.'] };
  });
  S('appreciate', 'Appreciation and depreciation', function (L, r) {
    var v = r.pick([500, 1000, 2000, 8000, 20000, 30000]), rate = r.pick([5, 10, 15, 20, 25]), up = r() < 0.4, yrs = L <= 2 ? 1 : r.int(2, 3), mult = 1 + (up ? rate : -rate) / 100, ans = round(v * Math.pow(mult, yrs), 2);
    if (L >= 2 && r() < 0.25) return { q: 'What is the multiplier for ' + rate + '% ' + (up ? 'appreciation' : 'depreciation') + ' each year?', a: String(mult), kind: 'num', wrong: [String(rate / 100), String(up ? 1 - rate / 100 : 1 + rate / 100), String(rate)], steps: ['Start with 100% = 1.', up ? 'Add the rate as a decimal: 1 + ' + rate / 100 + ' = ' + mult + '.' : 'Subtract the rate as a decimal: 1 − ' + rate / 100 + ' = ' + mult + '.'] };
    return { q: money(v) + ' ' + (up ? 'appreciates' : 'depreciates') + ' by ' + rate + '% each year. What is the value after ' + yrs + ' year' + (yrs > 1 ? 's' : '') + '?', a: money(ans), kind: 'num', tol: 0.011, wrong: [money(round(v * (1 + (up ? 1 : -1) * rate * yrs / 100) + (yrs > 1 ? 0 : v * 0.05), 2)), money(round(v * Math.pow(up ? 1 - rate / 100 : 1 + rate / 100, yrs), 2)), money(round(v * rate / 100, 2))].filter(function (w) { return w !== money(ans); }), steps: ['Multiplier: ' + mult + (up ? ' (gaining value).' : ' (keeping ' + (100 - rate) + '% each year).'), v + ' × ' + mult + (yrs > 1 ? sup(yrs) : '') + ' = ' + money(ans), yrs > 1 ? 'Each year’s percent is taken on the new value, not the original.' : 'Done.'] };
  });
  S('simple-interest', 'Simple interest', function (L, r) {
    var P = r.pick([500, 1500, 2000, 3000, 10000]), rate = r.pick([4, 5, 6, 7]), t = r.int(2, 5), I = P * rate / 100 * t, total = L >= 2 && r() < 0.5;
    return { q: 'A ' + money(P) + ' loan charges ' + rate + '% per year simple interest for ' + t + ' years. Find the ' + (total ? 'total repaid.' : 'interest.'), a: money(total ? P + I : I), kind: 'num', wrong: [money(total ? I : P + I), money(P * rate / 100), money(round(P * Math.pow(1 + rate / 100, t), 2))], steps: ['I = Prt = ' + P + ' × ' + rate / 100 + ' × ' + t + ' = ' + money(I) + '.', total ? 'Total repaid = ' + money(P) + ' + ' + money(I) + ' = ' + money(P + I) : 'The interest is ' + money(I) + '.'] };
  });
  S('compound-interest', 'Compound interest', function (L, r) {
    var P = r.pick([800, 1000, 2000, 5000]), rate = r.pick([5, 6, 10]), t = L <= 2 ? 2 : 3, A = round(P * Math.pow(1 + rate / 100, t), 2);
    return { q: money(P) + ' is borrowed at ' + rate + '% per year, compounded annually. What is owed after ' + t + ' years with no payments?', a: money(A), kind: 'num', tol: 0.011, wrong: [money(P + P * rate / 100 * t), money(round(P * (1 + rate / 100), 2)), money(round(P * rate / 100 * t, 2))], steps: ['A = P(1 + i)ⁿ = ' + P + ' × ' + (1 + rate / 100) + sup(t) + '.', 'Year by year: ' + [1, 2, 3].slice(0, t).map(function (k) { return money(round(P * Math.pow(1 + rate / 100, k), 2)); }).join(' → ') + '.', 'Compound interest charges interest on the interest, so it is more than simple interest (' + money(P + P * rate / 100 * t) + ').'] };
  });
  S('down-payment', 'Down payments and loans', function (L, r) {
    var price = r.pick([12000, 15000, 24000, 30000]), dp = r.pick([10, 20, 25]), rate = r.pick([4, 5, 6]), t = r.int(3, 5), borrow = price * (1 - dp / 100);
    if (L <= 2) return { q: 'A car costs ' + money(price) + '. You make a ' + dp + '% down payment. How much do you borrow?', a: money(borrow), kind: 'num', wrong: [money(price * dp / 100), money(price - dp), money(price)], steps: ['Down payment: ' + dp + '% of ' + money(price) + ' = ' + money(price * dp / 100) + '.', 'Borrow the rest: ' + money(borrow)] };
    return { q: 'A car costs ' + money(price) + '. You pay ' + dp + '% down and borrow the rest at ' + rate + '% per year simple interest for ' + t + ' years. How much interest do you pay?', a: money(borrow * rate / 100 * t), kind: 'num', wrong: [money(price * rate / 100 * t), money(borrow * rate / 100), money(borrow)], steps: ['Amount borrowed: ' + money(borrow) + '.', 'I = Prt = ' + borrow + ' × ' + rate / 100 + ' × ' + t + ' = ' + money(borrow * rate / 100 * t) + '.', 'A bigger down payment means less to borrow and less interest.'] };
  });
  S('budget', 'Budgets: surplus, deficit and goals', function (L, r) {
    var inc = r.pick([560, 700, 900, 1200]), spend = inc + r.pick([-90, -45, -20, 30, 40, 75]), form = r.int(0, L >= 3 ? 3 : L >= 2 ? 2 : 0);
    if (form === 1) { var item = r.pick([55, 90, 140, 210]); return { q: 'What percent of a ' + money(inc) + ' income is a ' + money(item) + ' expense? Answer to one decimal place.', a: round(item / inc * 100, 1).toFixed(1) + '%', kind: 'num', tol: 0.06, wrong: [round(inc / item, 1).toFixed(1) + '%', round(item / 100, 1).toFixed(1) + '%', round((inc - item) / inc * 100, 1).toFixed(1) + '%'], steps: ['Percent = part ÷ whole × 100.', item + ' ÷ ' + inc + ' × 100 ≈ ' + round(item / inc * 100, 1).toFixed(1) + '%'] }; }
    if (form === 2) { var goal = r.pick([600, 900, 1200, 1500]), mo = r.pick([4, 5, 6, 8, 10]); return { q: 'You want to save ' + money(goal) + ' in ' + mo + ' months. How much must you save each month?', a: money(round(goal / mo, 2)), kind: 'num', tol: 0.011, wrong: [money(goal * mo), money(goal - mo), money(round(goal / 12, 2))], steps: ['Monthly amount = goal ÷ number of months.', goal + ' ÷ ' + mo + ' = ' + money(round(goal / mo, 2))] }; }
    if (form === 3) { var p = r.pick([10, 15, 20]); return { q: 'You plan to save ' + p + '% of a ' + money(inc) + ' monthly income. How much is that each month?', a: money(inc * p / 100), kind: 'num', wrong: [money(inc - p), money(inc * p / 10), money(inc / p)], steps: [p + '% = ' + p / 100 + '.', inc + ' × ' + p / 100 + ' = ' + money(inc * p / 100)] }; }
    return { q: 'A monthly budget has an income of ' + money(inc) + ' and planned spending and saving of ' + money(spend) + '. What is the balance? (Use a negative for a deficit.)', a: money(inc - spend), kind: 'num', wrong: [money(spend - inc), money(inc + spend), money(0)], steps: ['Balance = income − spending and saving.', inc + ' − ' + spend + ' = ' + n(inc - spend) + (inc - spend < 0 ? ': a deficit. The plan spends more than it brings in.' : ': a surplus.')] };
  });
  pool('fixed-variable', 'Fixed or variable expense?', [
    ['rent', 'fixed', ['variable'], 'Rent is the same amount every month.'], ['entertainment', 'variable', ['fixed'], 'It changes from month to month, and you can choose to change it.'], ['a phone plan', 'fixed', ['variable'], 'A plan costs the same each month.'],
    ['groceries', 'variable', ['fixed'], 'The amount changes with what you buy.'], ['a monthly transit pass', 'fixed', ['variable'], 'A pass is one set price each month.'], ['clothing', 'variable', ['fixed'], 'It changes from month to month.'], ['car insurance', 'fixed', ['variable'], 'The payment is set in advance.'], ['eating out', 'variable', ['fixed'], 'It depends on your choices each month.']], 'In a budget, is this a fixed or a variable expense?  ');


  /* ---------- figures (v62) ----------
     A question may carry fig: plain data that mathtools.js draws — never markup.
       { t:'table', head:[…], rows:[[…]] }   { t:'plot', xr, yr, xs, ys, xl, yl, lines:[{m,b,l}], pts:[[x,y,label]], dots:[[x,y]] }
       { t:'nline', lo, hi, den, marks:[{v,l}] }   { t:'box', sets:[{l, five:[…]}], lo, hi, step }   { t:'bars', fr:[[n,d]…] }
       { t:'shape', k:'rtri'|'tri'|'circle'|'prism'|'cyl'|'cone'|'pyr', … labels }   { t:'img', src, alt } */
  function niceStep(span) { var raw = span / 8, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; }
  function autoPlot(lines, pts, o) {
    o = o || {}; var xs = pts.map(function (p) { return p[0]; }).concat([0]), ys = pts.map(function (p) { return p[1]; }).concat(lines.map(function (l) { return l.b; })).concat([0]);
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    if (!pts.length || o.plane) { x0 = Math.min(x0, -6); x1 = Math.max(x1, 6); y0 = Math.min(y0, -6); y1 = Math.max(y1, 6); }
    var sx = niceStep(Math.max(1, x1 - x0) * 1.2), sy = niceStep(Math.max(1, y1 - y0) * 1.2);
    if (sx < 1) sx = 1; if (sy < 1) sy = 1;
    var f = { t: 'plot', xr: [Math.floor((x0 - sx * 0.5) / sx) * sx, Math.ceil((x1 + sx * 0.5) / sx) * sx], yr: [Math.floor((y0 - sy * 0.5) / sy) * sy, Math.ceil((y1 + sy * 0.5) / sy) * sy], xs: sx, ys: sy, lines: lines, pts: pts };
    if (x0 >= 0 && !o.plane) f.xr[0] = 0; if (y0 >= 0 && !o.plane) f.yr[0] = 0;
    return f;
  }
  function lineOf(rhs) { var t = parse(rhs), b = val(evaluate(t, { x: 0 })), m = val(evaluate(t, { x: 1 })) - b; return { m: round(m, 6), b: round(b, 6) }; }
  function eqs(text) { var out = [], re = /y = ([^?.,]*?[x\d])(?=\s*(?:\.|\?|,|$|\s{2}|\sand\s|\sis\s|\sfor\s))/g, m; while ((m = re.exec(text))) { try { out.push(lineOf(m[1])); } catch (e) {} } return out; }
  function ptsIn(text) { var out = [], re = /\((−?[\d.]+), (−?[\d.]+)\)/g, m; while ((m = re.exec(text))) out.push([+m[1].replace('−', '-'), +m[2].replace('−', '-')]); return out; }
  function xyTable(q) { var m = /x: (.*)\ny: (.*)\n?/.exec(q.q); if (!m) return null; q.q = q.q.replace(m[0], '').replace(/^\s+|\s+$/g, '').replace(/^A relation is linear\.\s*/, 'The table shows a linear relation. ').replace(/^Is the relation linear\?$/, 'The table shows a relation. Is it linear?');
    return { t: 'table', head: ['x'].concat(m[1].split(', ')), rows: [['y'].concat(m[2].split(', '))], side: true }; }
  var planeLine = function (q) { var e = eqs(q.q); return e.length ? { t: 'plot', xr: [-10, 10], yr: [-10, 10], xs: 2, ys: 2, lines: e.slice(0, 1), pts: [] } : null; };
  var FIG = {
    'first-diff': xyTable, 'linear-predict': xyTable,
    'line-equation': function (q) { var t = xyTable(q); if (t) return t; var p = ptsIn(q.q); if (p.length === 2) { var m = (p[1][1] - p[0][1]) / (p[1][0] - p[0][0]); return autoPlot([{ m: m, b: p[0][1] - m * p[0][0] }], p.map(function (x) { return [x[0], x[1], '(' + n(x[0]) + ', ' + n(x[1]) + ')']; })); } return null; },
    'rate-two-points': function (q) { var p = ptsIn(q.q); if (p.length !== 2) return null; var m = (p[1][1] - p[0][1]) / (p[1][0] - p[0][0]); return autoPlot([{ m: m, b: p[0][1] - m * p[0][0] }], p.map(function (x) { return [x[0], x[1], '(' + n(x[0]) + ', ' + n(x[1]) + ')']; })); },
    'slope-intercept': planeLine, 'transform-line': planeLine,
    'point-on-line': function (q, L) { return L <= 2 ? planeLine(q) : null; },
    'intersection': function (q, L) { if (L > 2) return null; var e = eqs(q.q); if (e.length !== 2) return null; var x = (e[1].b - e[0].b) / (e[0].m - e[1].m), y = e[0].m * x + e[0].b; e[0].l = 'A'; e[1].l = 'B'; var f = autoPlot(e, [[x, y]]); f.pts = []; return f; },
    'int-addsub': function (q, L) { return { t: 'nline', lo: L <= 2 ? -20 : -30, hi: L <= 2 ? 20 : 30, lab: 5 }; },
    'int-order': function (q) { var v = q.items.map(function (s) { return +s.replace('−', '-'); }); return { t: 'nline', lo: Math.floor(Math.min.apply(null, v)) - 1, hi: Math.ceil(Math.max.apply(null, v)) + 1, lab: 2 }; },
    'frac-compare': function (q, L) { if (L > 2) return null; var re = /(\d+)\/(\d+)/g, fr = [], m; while ((m = re.exec(q.q))) fr.push([+m[1], +m[2]]); return fr.length === 2 ? { t: 'bars', fr: fr } : null; },
    'zero-neg-exp': function (q) { var m = /(\d+)([⁰⁻])/.exec(q.q); if (!m || /\(/.test(q.q)) return null; var b = +m[1]; return { t: 'table', head: ['Power'].concat([3, 2, 1, 0, -1, -2].map(function (e) { return b + sup(e); })), rows: [['Value', String(b * b * b), String(b * b), String(b), '?', '?', '?']], side: true, cap: 'Each step to the right divides by ' + b + '.' }; },
    'general-term': function (q) { var m = /:\s+(.*), …/.exec(q.q); if (!m) return null; var v = m[1].split(', '); return { t: 'table', head: ['Term number, n'].concat(v.map(function (_, i) { return String(i + 1); })).concat(['n']), rows: [['Term value'].concat(v).concat(['?'])], side: true }; },
    'five-number': function (q) { return q.data ? { t: 'table', head: ['Position'].concat(q.data.map(function (_, i) { return String(i + 1); })), rows: [['Value'].concat(q.data.map(String))], side: true, cap: 'The data in order, with each position numbered.' } : null; },
    'bestfit': function (q) { var e = eqs(q.q); if (!e.length) return null; var r = rng(hashStr(q.q)), dots = []; for (var x = 2; x <= 12; x++) dots.push([x, round(e[0].m * x + e[0].b + (r() - 0.5) * e[0].m * 2.4, 1)]); var f = autoPlot(e, dots.concat([[0, e[0].b], [14, e[0].m * 14 + e[0].b]])); f.pts = []; f.dots = dots; return f; },
    'triangle-angle': function (q) { var m; if ((m = /angles of (\d+)° and (\d+)°/.exec(q.q))) return { t: 'shape', k: 'tri', A: m[1] + '°', B: m[2] + '°', C: '?' }; if ((m = /top angle of (\d+)°/.exec(q.q))) return { t: 'shape', k: 'tri', iso: true, C: m[1] + '°', A: '?', B: '?' }; if ((m = /exterior angle of a triangle is (\d+)°\. One of the opposite interior angles is (\d+)°/.exec(q.q))) return { t: 'shape', k: 'tri', C: m[2] + '°', A: '?', ext: m[1] + '°' }; return null; },
    'circle-measure': function (q) { var m = /(diameter|radius) of (\d+) cm/.exec(q.q); return m ? { t: 'shape', k: 'circle', r: m[1] === 'radius' ? m[2] + ' cm' : '', d: m[1] === 'diameter' ? m[2] + ' cm' : '' } : null; },
    'pyth-hyp': function (q) { var m = /legs of (\d+) cm and (\d+) cm/.exec(q.q); return m ? { t: 'shape', k: 'rtri', a: m[1] + ' cm', b: m[2] + ' cm', c: '?' } : null; },
    'pyth-leg': function (q) { var m = /hypotenuse of (\d+) m and one leg of (\d+) m/.exec(q.q); return m ? { t: 'shape', k: 'rtri', a: m[2] + ' m', b: '?', c: m[1] + ' m' } : null; },
    'vol-prism': function (q) { var m = /prism (\d+) cm by (\d+) cm by (\d+) cm/.exec(q.q); if (m) return { t: 'shape', k: 'prism', l: m[1] + ' cm', w: m[2] + ' cm', h: m[3] + ' cm' }; if ((m = /base (\d+) cm by (\d+) cm/.exec(q.q))) return { t: 'shape', k: 'prism', l: m[1] + ' cm', w: m[2] + ' cm', h: '?' }; return null; },
    'vol-pyramid': function (q) { var m = /square base with (\d+) m sides and a height of (\d+) m/.exec(q.q); return m ? { t: 'shape', k: 'pyr', s: m[1] + ' m', h: m[2] + ' m' } : null; },
    'vol-cylinder': function (q) { var m = /(diameter|radius) of (\d+) cm and a height of (\d+) cm/.exec(q.q); return m ? { t: 'shape', k: 'cyl', r: m[1] === 'radius' ? 'r = ' + m[2] + ' cm' : 'd = ' + m[2] + ' cm', h: m[3] + ' cm' } : null; },
    'vol-cone': function (q) { var m = /radius of (\d+) cm and a height of (\d+) cm/.exec(q.q); return m ? { t: 'shape', k: 'cone', r: 'r = ' + m[1] + ' cm', h: m[2] + ' cm' } : null; },
    'convert-metric': function (q, L) { return L <= 2 ? { t: 'table', head: ['Larger unit', 'Smaller unit'], rows: [['1 km', '1000 m'], ['1 m', '100 cm'], ['1 cm', '10 mm'], ['1 kg', '1000 g'], ['1 L', '1000 mL']], cap: 'To a smaller unit: multiply. To a larger unit: divide.' } : null; }
  };

  // ----- skills that are read from a graph, a table or a plot -----
  S('read-graph', 'Read a line from its graph', function (L, r) {
    var m = L >= 3 && r() < 0.4 ? r.pick([-1.5, -0.5, 0.5, 1.5]) : r.nz(L <= 1 ? 1 : -3, 3), b = r.int(-4, 4), ask = L <= 1 ? r.pick(['y-intercept', 'sign']) : L === 2 ? r.pick(['y-intercept', 'slope']) : r.pick(['slope', 'equation', 'y-intercept']);
    var fig = { t: 'plot', xr: [-8, 8], yr: [-8, 8], xs: 1, ys: 1, lines: [{ m: m, b: b }], pts: [[0, b]].concat(Number.isInteger(m) ? [[1, b + m]] : [[2, b + 2 * m]]) }, mm = fromNum(m), st = ['The line crosses the y-axis at (0, ' + n(b) + '), so the y-intercept is ' + n(b) + '.', 'From one marked point to the next: run ' + (Number.isInteger(m) ? 1 : 2) + ', rise ' + n(Number.isInteger(m) ? m : 2 * m) + '. Slope = rise ÷ run = ' + fr(mm.n, mm.d) + '.'];
    if (ask === 'sign') return { q: 'Look at the line on the graph. Is its slope positive or negative?', a: m > 0 ? 'positive' : 'negative', kind: 'mc', wrong: [m > 0 ? 'negative' : 'positive'], fig: fig, steps: ['Read the graph from left to right.', m > 0 ? 'The line goes up, so the slope is positive.' : 'The line goes down, so the slope is negative.'] };
    if (ask === 'equation') return { q: 'Write the equation of the line on the graph:  y = …', a: linear(mm, b), kind: 'expr', pre: 'y =', wrong: [linear(R(-mm.n, mm.d), b), linear(mm, -b || 1), linear(R(b || 1), m)], fig: fig, steps: st.concat(['y = ' + linear(mm, b)]) };
    return { q: 'What is the ' + ask + ' of the line on the graph?', a: ask === 'slope' ? fr(mm.n, mm.d) : n(b), kind: 'num', wrong: ask === 'slope' ? [fr(-mm.n, mm.d), n(b), fr(mm.d, mm.n)] : [n(-b), fr(mm.n, mm.d), n(b + 1)], fig: fig, steps: ask === 'slope' ? st.slice(1) : st.slice(0, 1) };
  });
  S('table-rate', 'Rate and initial value from a table', function (L, r) {
    var m = r.nz(L <= 2 ? 2 : -8, 9), b = r.int(-5, 30), step = L >= 3 ? r.pick([2, 5]) : 1, x0 = L >= 4 ? step : 0, xs = [0, 1, 2, 3].map(function (i) { return x0 + i * step; }), ask = L <= 1 ? 'rate of change' : r.pick(['rate of change', 'initial value']);
    var fig = { t: 'table', head: ['x'].concat(xs.map(String)), rows: [['y'].concat(xs.map(function (x) { return n(m * x + b); }))], side: true };
    return { q: 'The table shows a linear relation. What is its ' + ask + '?', a: n(ask === 'rate of change' ? m : b), kind: 'num', fig: fig, wrong: ask === 'rate of change' ? [n(m * step === m ? -m : m * step), n(b), n(-m), n(m + 1)] : [n(m * x0 + b === b ? m : m * x0 + b), n(m), n(-b), n(b + m)],
      steps: ['y changes by ' + n(m * step) + ' each time x changes by ' + step + ', so the rate of change is ' + n(m * step) + ' ÷ ' + step + ' = ' + n(m) + '.', x0 === 0 ? 'The initial value is y when x = 0: ' + n(b) + '.' : 'There is no x = 0 column. Work back from x = ' + x0 + ': ' + n(m * x0 + b) + ' − ' + x0 + ' × ' + np(m) + ' = ' + n(b) + '.'] };
  });
  S('read-box', 'Read a box plot', function (L, r) {
    var lo = r.int(2, 12) * 5, q1 = lo + r.int(1, 3) * 5, med = q1 + r.int(1, 3) * (L >= 3 ? 2 : 5), q3 = med + r.int(1, 3) * 5, hi = q3 + r.int(1, 4) * 5, ask = r.pick(L <= 1 ? ['median', 'minimum', 'maximum'] : L === 2 ? ['median', 'range', 'Q1', 'Q3'] : ['IQR', 'range', 'median', 'half']);
    var fig = { t: 'box', sets: [{ l: '', five: [lo, q1, med, q3, hi] }], lo: Math.floor(lo / 10) * 10 - 10, hi: Math.ceil(hi / 10) * 10 + 10, step: L >= 3 ? 5 : 5 };
    var st = ['The whiskers end at the minimum (' + lo + ') and the maximum (' + hi + ').', 'The box runs from Q1 (' + q1 + ') to Q3 (' + q3 + '). The line inside it is the median (' + med + ').'];
    if (ask === 'half') return { q: 'About what percent of the data lies inside the box, between Q1 and Q3?', a: '50%', kind: 'mc', wrong: ['25%', '75%', '100%'], fig: fig, steps: ['The quartiles split the data into four equal parts of about 25% each.', 'Two of those parts are inside the box: about 50%.'] };
    var ans = { median: med, minimum: lo, maximum: hi, range: hi - lo, Q1: q1, Q3: q3, IQR: q3 - q1 }[ask];
    return { q: 'Use the box plot. Find ' + (/^(Q1|Q3|IQR)$/.test(ask) ? ask : 'the ' + ask) + '.', a: String(ans), kind: 'num', wrong: uniq([med, q1, q3, hi - lo, q3 - q1, lo, hi].map(String), String(ans)).slice(0, 3), fig: fig, steps: st.concat(ask === 'range' ? ['Range = ' + hi + ' − ' + lo + ' = ' + (hi - lo) + '.'] : ask === 'IQR' ? ['IQR = Q3 − Q1 = ' + q3 + ' − ' + q1 + ' = ' + (q3 - q1) + '.'] : []) };
  });
  S('read-scatter', 'Read a scatter plot', function (L, r) {
    var kind = r.pick(['positive', 'negative', 'none']), strong = L >= 3 ? r() < 0.5 : true, dots = [], noise = kind === 'none' ? 0 : strong ? 8 : 22;
    for (var i = 0; i < 16; i++) { var x = round(1 + r() * 9, 1), y = kind === 'none' ? 10 + r() * 80 : (kind === 'positive' ? 12 + x * 7.5 : 88 - x * 7.5) + (r() - 0.5) * noise; dots.push([x, round(Math.max(3, Math.min(97, y)))]); }
    var fig = { t: 'plot', xr: [0, 10], yr: [0, 100], xs: 1, ys: 10, lines: [], pts: [], dots: dots };
    if (L >= 3 && kind !== 'none' && r() < 0.5) return { q: 'The scatter plot shows a ' + kind + ' correlation. Is it strong or weak?', a: strong ? 'strong' : 'weak', kind: 'mc', wrong: [strong ? 'weak' : 'strong'], fig: fig, steps: ['Picture a line through the middle of the points.', strong ? 'The points sit close to that line: a strong correlation.' : 'The points are spread well away from that line: a weak correlation.'] };
    return { q: 'What kind of correlation does the scatter plot show?', a: kind, kind: 'mc', wrong: ['positive', 'negative', 'none'].filter(function (k) { return k !== kind; }), fig: fig, steps: ['Read the points from left to right.', kind === 'positive' ? 'They rise: as x increases, y tends to increase. Positive.' : kind === 'negative' ? 'They fall: as x increases, y tends to decrease. Negative.' : 'There is no upward or downward pattern. No correlation.'] };
  });
  S('read-nline', 'Read a number line', function (L, r) {
    var den = L <= 1 ? 1 : L === 2 ? 2 : r.pick([2, 4, 5]), lo = L <= 1 ? -8 : -3, hi = L <= 1 ? 8 : 3, k = r.nz(lo * den, hi * den); if (L >= 2 && k % den === 0) k += 1; if (L >= 2 && k > 0 && r() < 0.6) k = -k;
    var v = R(k, den);
    return { q: 'What number is at point A on the number line?' + (den > 1 ? ' Answer as a fraction or a decimal.' : ''), a: fr(v.n, v.d), kind: 'num', lowest: true, fig: { t: 'nline', lo: lo, hi: hi, den: den, lab: 1, marks: [{ v: k / den, l: 'A' }] }, wrong: [fr(-v.n, v.d), fr(k + (k < 0 ? -1 : 1), den), fr(k < 0 ? k + 2 * (Math.abs(k) % den || 1) : k - 1, den), n(Math.trunc(k / den) || 1)],
      steps: [den > 1 ? 'Each whole is cut into ' + den + ' equal parts, so each small step is 1/' + den + '.' : 'Each tick is 1.', 'A is ' + Math.abs(k) + ' step' + (Math.abs(k) === 1 ? '' : 's') + ' to the ' + (k < 0 ? 'left' : 'right') + ' of 0: ' + fr(v.n, v.d) + (v.d !== 1 && Math.abs(v.n) > v.d ? ' (or ' + mixed(v.n, v.d) + ')' : '') + '.'] };
  });

  /** One practice question. seed keeps it repeatable; level 1–4. */
  function make(id, level, seed) {
    var sk = SK[id]; if (!sk) return null;
    var r = rng(seed === undefined ? Math.floor(Math.random() * 1e9) : seed), q = sk.gen(Math.max(1, Math.min(4, level || 2)), r);
    q.skill = id; if (FIG[id] && !q.fig) { try { var fg = FIG[id](q, Math.max(1, Math.min(4, level || 2))); if (fg) q.fig = fg; } catch (e) {} }
    q.wrong = uniq(q.wrong || [], q.a);
    if (['num', 'expr', 'pow', 'pt'].indexOf(q.kind) >= 0) q.wrong = q.wrong.filter(function (w) { var c = check(w, q.a, q.kind, { tol: q.tol, quiet: true, form: q.form }); return !c.ok && !(c.close && q.kind !== 'pow' && /can be simplified|lowest|Finish/.test(c.msg || '') ); });
    return q;
  }
  /** Fixed questions for a course file (multiple choice / true-false), the same on every build. */
  function bake(id, level, count, salt) {
    var out = [], seen = {}, tries = 0;
    while (out.length < count && tries < count * 40) { var q = make(id, level, hashStr(id + '|' + level + '|' + (salt || '') + '|' + tries++)); if (!q || seen[q.q] || q.wrong.length < 1) continue; seen[q.q] = 1; out.push(q); }
    return out;
  }

  M.R = R; M.gcd = gcd; M.parse = parse; M.evaluate = evaluate; M.val = val; M.show = show; M.dec = dec; M.sci = sci; M.fr = fr; M.mixed = mixed; M.n = n; M.money = money; M.round = round; M.sup = sup; M.linear = linear;
  M.check = check; M.kindOf = kindOf; M.stripUnits = stripUnits; M.rng = rng; M.hashStr = hashStr; M.SKILLS = SK; M.SKILL_ORDER = ORDER; M.make = make; M.bake = bake; M.varsOf = varsOf; M.clean = clean; M.autoPlot = autoPlot; M.niceStep = niceStep;
  root.MathCore = M;
  if (typeof module !== 'undefined' && module.exports) module.exports = M;
})(typeof window !== 'undefined' ? window : globalThis);
