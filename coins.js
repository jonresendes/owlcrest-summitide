/* Coins, teacher shops and the Locker (v60).

   THE IDEA — a student earns coins for the work they do in a course, and spends them on rewards in their
   teacher's shop. A reward is only handed over by the teacher: the student asks ("Redeem"), the teacher
   approves it ("Redeem coins"), and the item lands in the student's Locker.

   WHO WRITES WHAT (this is what keeps the bag honest):
     students/<id>.coins     { by: { [courseId]: n }, at }   coins EARNED, written by the student's own app from
                             their progress (like quiz scores, which the student's app also writes). Per course it
                             only ever goes up, so pausing coins or an end-of-term clean-up never empties a bag.
     students/<id>.coinReq   [ { id, shop, item, name, icon, cost, at } ]   what the student has asked for
     coins/<id>              { student, entries: [ … ] }      the LEDGER — coins spent, given, refunded. Written
                             only by the student's teachers; the student can read it and never write it.
     shops/<teacher>         a teacher's shop: name, look, items, prices, discounts
     settings/coins          { enabled }                      the Headmaster's switch for the whole school
     sections/<id>.coins     true | false                     the teacher's switch for one section
   Bag = earned (all courses) + given + refunded − spent.

   SWITCHES — coins exist for a student only where the Headmaster's switch is on AND a section they are in
   has coins on. With the Headmaster's switch off, every tile, chip, button, page and setting about coins is
   hidden for everyone (Coins.on() is false and every hook below returns nothing).

   THE COIN ITSELF — Coins.icon(n) is the one place that decides what a pile of n coins looks like (emoji for
   now). To use your own picture later, set Coins.art = 'coin.png' (and list the file in sw.js). */
(function () {
  const esc = s => String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const now = () => new Date().toISOString();
  const app = () => document.getElementById('app');
  const uidOf = () => 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const lsGet = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const cloudOn = () => !!(window.Cloud && Cloud.enabled && Cloud.db && Cloud.user);
  const me = () => window.Students && Students.current;
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
  const int = (v, lo, hi) => { const n = Math.round(+v); return isNaN(n) ? lo : Math.max(lo, Math.min(hi, n)); };
  const txt = (v, max) => String(v === undefined || v === null ? '' : v).replace(/[<>]/g, '').slice(0, max);
  const hex = (v, d) => /^#[0-9a-fA-F]{6}$/.test(String(v || '')) ? v : d;
  const IMG = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
  const img = (v, max) => (typeof v === 'string' && v.length <= max && IMG.test(v)) ? v : '';
  const when = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }); };
  const courses = () => (window.LearnHub && LearnHub.courses) || [];
  const courseById = id => courses().find(c => c.id === id) || null;
  const sections = () => (window.Sections && Sections.list) || [];

  /* ====================== the rules of the economy ====================== */
  /* A unit of 6 lessons with 2 assignments each is worth about 60–90 coins to a student who does all of it,
     so a "high" item (80–120) takes about a whole unit, a "medium" one about half, a "low" one a lesson or two. */
  const RATES = {
    lessonRead: 2,        // every slide of a lesson read
    quizPassed: 3,        // a lesson quiz passed (50%+), once per lesson
    quizStrong: 1,        // …plus this when the best score on it is 85%+
    assignment: 2,        // each assignment handed in
    unitRead: 5,          // every lesson in the unit read
    test: [[100, 12], [85, 10], [70, 7], [50, 4]],   // unit test, by best score: the first row reached counts
    gameFinished: 1,      // each different game finished in the unit
    gamePoints: 1000,     // …and one coin for every this-many game points (Jeopardy + Wheel best scores)
    gamesCap: 10          // games can never be worth more than this in one unit
  };
  const TIERS = [['low', 'Small rewards', '8–15'], ['medium', 'Bigger rewards', '30–50'], ['high', 'Big rewards', '80–120']];
  const SUGGESTED = [
    ['low', '⏱️', '5-minute break', 'Step away from your work for five minutes.', 10],
    ['low', '🪑', 'Pick your seat for a day', 'Sit anywhere you like for one class.', 10],
    ['low', '🎧', 'Music while you work', 'Headphones on for one work period.', 12],
    ['low', '✏️', 'Something from the prize box', 'A pencil, an eraser or a sticker.', 15],
    ['medium', '👫', 'Sit with a friend for a week', 'You and one friend choose your seats for five classes.', 35],
    ['medium', '📅', 'One extra day on an assignment', 'Hand one assignment in a day later, no questions asked.', 35],
    ['medium', '🎟️', 'Homework pass', 'Skip one piece of homework.', 40],
    ['medium', '👑', "Teacher's chair for a period", 'The comfy chair is yours for one class.', 45],
    ['high', '🍕', 'Lunch with the teacher', 'Bring your lunch and one friend.', 80],
    ['high', '🎲', 'Class game period', 'The whole class plays games for one period.', 90],
    ['high', '🎬', 'Movie day', 'The whole class watches a film. You help choose it.', 100],
    ['high', '🧁', 'Class snack day', 'The whole class brings a snack to share.', 110]
  ];
  const SHOP_COLOURS = ['#1b2f5e', '#1f6b45', '#7a1f3d', '#b45309', '#6b3fa0', '#0f766e', '#be185d', '#374151'];
  const LOCKER_COLOURS = [['navy', '#1b2f5e'], ['forest', '#1f6b45'], ['burgundy', '#7a1f3d'], ['teal', '#0f766e'], ['plum', '#6b3fa0'], ['rust', '#b45309'], ['rose', '#be185d'], ['slate', '#475569']];
  const PATTERNS = [['plain', 'Plain'], ['stripes', 'Stripes'], ['dots', 'Dots'], ['checks', 'Checks']];

  const Coins = { RATES, TIERS, SUGGESTED, art: null, enabled: (lsGet('summitide.coins') || {}).enabled !== false, ledgers: {}, shops: lsGet('learnhub.shops') || {}, version: 1 };
  window.Coins = Coins;

  /** What a pile of n coins looks like. The only place the coin picture is chosen. */
  Coins.icon = function (n) {
    if (Coins.art) return '<img class="coin-art" src="' + esc(Coins.art) + '" alt="">';
    n = +n || 0; return n >= 100 ? '👑' : n >= 50 ? '💎' : n >= 10 ? '💰' : '🪙';
  };
  const chip = (n, extra) => '<span class="coin-chip' + (extra ? ' ' + extra : '') + '" title="' + plural(n, 'coin') + '"><span class="coin-ico" aria-hidden="true">' + Coins.icon(n) + '</span><span class="coin-n">' + n + '</span><span class="sr-only"> coins</span></span>';
  Coins.chip = chip;

  /* ====================== switches ====================== */
  /** The Headmaster's switch. Off: nothing about coins is shown anywhere. */
  Coins.on = () => Coins.enabled !== false;
  const isHead = () => { if (window.Cloud && Cloud.enabled) return !!(Cloud.user && Cloud.role === 'master'); const m = me(); return !!(m && m.isStaff && m.role === 'master'); };
  const isStaff = () => { const m = me(); return !!(m && m.isStaff); };
  const masterKey = () => (window.Cloud && Cloud.enabled && Cloud.masterInfo && Cloud.masterInfo.uid) || 'master';
  /** The shop a section belongs to: its teacher's, or the Headmaster's when no teacher is assigned. */
  const shopKeyOf = sec => String((sec && sec.teacherId) || masterKey());
  const myShopKey = () => { const m = me(); if (!m || !m.isStaff) return ''; return m.role === 'master' ? masterKey() : String((cloudOn() && Cloud.user.uid) || m.staffId); };
  const teacherName = key => { const St = window.Staff; if (!St) return 'your teacher'; if (key === masterKey()) return (St.master && St.master.name) || 'the Headmaster'; const t = (St.teachers || []).find(x => x.id === key); return (t && t.name) || 'your teacher'; };
  /** Sections where this student earns coins right now. */
  function coinSections(sid) { if (!Coins.on()) return []; return sections().filter(s => s.coins === true && !s.archived && s.courseId && (s.students || []).includes(sid)); }
  /** Does this student see coins at all? In a coin section now, or still holding coins or items from before. */
  function active(st) { if (!Coins.on() || !st || st.isStaff) return false; return coinSections(st.id).length > 0 || earnedOf(st) > 0 || (ledger(st.id).entries || []).length > 0; }
  Coins.active = () => active(me());

  /* ====================== earning ====================== */
  /** Coins the signed-in student's progress in one course is worth right now. Returns { total, units: [...] }. */
  function worth(course) {
    const out = { total: 0, units: [] };
    if (!course || !window.Badges || !window.LH) return out;
    (LH.unitsFor ? LH.unitsFor(course) : course.units || []).forEach(unit => {
      let f; try { f = Badges.unitFacts(course, unit); } catch (e) { return; }
      const u = f.u || {}, quiz = u.quiz || {}, lessons = (LH.lessonsFor ? LH.lessonsFor(unit) : unit.lessons || []);
      const line = { unit: unit.title, read: 0, quiz: 0, work: 0, bonus: 0, test: 0, games: 0 };
      f.lessons.forEach((l, i) => {
        if (l.read) line.read += RATES.lessonRead;
        if (l.quizPassed) { line.quiz += RATES.quizPassed; const les = lessons[i], q = les && quiz[les._idx]; if (q && (+q.best || 0) >= 85) line.quiz += RATES.quizStrong; }
        line.work += Math.min(l.handed, l.assignments) * RATES.assignment;
      });
      if (f.allRead) line.bonus = RATES.unitRead;
      const best = +u.testBest || 0; const row = RATES.test.find(r => best >= r[0]); if (row) line.test = row[1];
      line.games = Math.min(RATES.gamesCap, (f.finishedGames || 0) * RATES.gameFinished + Math.floor((f.points || 0) / RATES.gamePoints));
      line.total = line.read + line.quiz + line.work + line.bonus + line.test + line.games;
      out.total += line.total; out.units.push(line);
    });
    return out;
  }
  Coins.worth = worth;
  const cleanBy = by => { const o = {}; Object.keys(by && typeof by === 'object' ? by : {}).forEach(k => { if (/^[\w-]{1,80}$/.test(k)) o[k] = int(by[k], 0, 100000); }); return o; };
  const earnedOf = st => Object.values(cleanBy(st && st.coins && st.coins.by)).reduce((a, b) => a + b, 0);
  /** Bring the signed-in student's earned coins up to date with their progress. Never lowers a course's count. */
  function recalc(quiet) {
    const st = me(); if (!st || st.isStaff || !Coins.on()) return 0;
    const secs = coinSections(st.id); if (!secs.length) return 0;
    const by = cleanBy(st.coins && st.coins.by); let gained = 0;
    [...new Set(secs.map(s => s.courseId))].forEach(cid => { const c = courseById(cid); if (!c) return; const w = worth(c).total; if (w > (by[cid] || 0)) { gained += w - (by[cid] || 0); by[cid] = w; } });
    // requests the teacher has dealt with come off the student's list
    const led = ledger(st.id), done = new Set((led.entries || []).map(e => e.req).filter(Boolean));
    const req = requestsOf(st), keep = req.filter(r => !done.has(r.id));
    if (gained || keep.length !== req.length) { Students.update(st.id, gained ? { coins: { by, at: now() }, coinReq: keep } : { coinReq: keep }); }
    if (gained && !quiet) toast('+' + gained, plural(gained, 'coin') + ' earned', 'Your bag now holds ' + bagOf(st).bag + '.');
    return gained;
  }
  Coins.recalc = recalc;
  function toast(big, title, line) {
    const host = document.getElementById('toasts'); if (!host) return;
    const el = document.createElement('div'); el.className = 'toast coin-toast';
    el.innerHTML = '<div class="t-icon">' + Coins.icon(1) + '</div><div><div class="t-title">' + esc(title) + '</div><div class="t-name">' + esc(big) + ' · ' + esc(line) + '</div></div>';
    host.appendChild(el); setTimeout(() => el.remove(), 4500);
  }

  /* ====================== the ledger (teacher-written) ====================== */
  const cleanEntry = e => ({ id: txt(e.id, 40), t: ['spend', 'bonus', 'refund', 'decline', 'use'].includes(e.t) ? e.t : 'bonus', n: int(e.n, 0, 100000), item: txt(e.item, 80), icon: txt(e.icon, 16), shop: txt(e.shop, 80), by: txt(e.by, 80), byName: txt(e.byName, 40), at: txt(e.at, 40), req: txt(e.req, 40), ref: txt(e.ref, 40), note: txt(e.note, 160) });
  function ledger(sid) { if (!Coins.ledgers[sid]) { const c = lsGet('learnhub.coins.' + sid); Coins.ledgers[sid] = { entries: ((c && c.entries) || []).map(cleanEntry) }; } return Coins.ledgers[sid]; }
  function setLedger(sid, entries) { Coins.ledgers[sid] = { entries: (Array.isArray(entries) ? entries : []).slice(-400).map(cleanEntry) }; lsSet('learnhub.coins.' + sid, Coins.ledgers[sid]); }
  async function loadLedger(sid) {
    if (!cloudOn()) return ledger(sid);
    try { const d = await Cloud.db.collection('coins').doc(sid).get(); setLedger(sid, d.exists ? (d.data().entries || []) : []); } catch (e) { console.warn('coins ledger', sid, e && e.code); }
    return ledger(sid);
  }
  async function addEntry(sid, entry) {
    const m = me(); if (!m || !m.isStaff) throw new Error('Only a teacher can do this.');
    const e = cleanEntry(Object.assign({ id: uidOf(), at: now(), by: myShopKey(), byName: m.name || '' }, entry));
    if (cloudOn()) {
      const FV = window.firebase && firebase.firestore && firebase.firestore.FieldValue;
      try { await Cloud.db.collection('coins').doc(sid).set({ student: sid, entries: FV.arrayUnion(e), updatedAt: now() }, { merge: true }); }
      catch (err) { throw new Error(/permission|insufficient/i.test((err && err.code || '') + ' ' + (err && err.message)) ? 'The cloud refused the change. Check that the version 60 firestore.rules are published.' : (err && err.message) || 'Could not save.'); }
      if (Cloud.log && e.t !== 'use') Cloud.log('coins.' + e.t, sid, { n: e.n, item: e.item });
      await loadLedger(sid);
    } else setLedger(sid, (ledger(sid).entries || []).concat([e]));
    return e;
  }
  const requestsOf = st => (Array.isArray(st && st.coinReq) ? st.coinReq : []).slice(0, 10).map(r => ({ id: txt(r.id, 40), shop: txt(r.shop, 80), item: txt(r.item, 40), name: txt(r.name, 80), icon: txt(r.icon, 16), cost: int(r.cost, 0, 100000), at: txt(r.at, 40) })).filter(r => r.id);
  /** A student's bag: { earned, given, spent, bag, held (asked for, not yet handed over), free } */
  function bagOf(st) {
    const led = ledger(st.id).entries || [], done = new Set(led.map(e => e.req).filter(Boolean));
    const sum = t => led.filter(e => e.t === t).reduce((a, e) => a + e.n, 0);
    const earned = earnedOf(st), given = sum('bonus') + sum('refund'), spent = sum('spend');
    const held = requestsOf(st).filter(r => !done.has(r.id)).reduce((a, r) => a + r.cost, 0);
    const bag = Math.max(0, earned + given - spent);
    return { earned, given, spent, bag, held, free: Math.max(0, bag - held) };
  }
  Coins.bagOf = bagOf; Coins.ledger = ledger; Coins.loadLedger = loadLedger;
  /** Items in a student's Locker: spends, each marked used or not. */
  function lockerItems(sid) { const led = ledger(sid).entries || [], used = new Set(led.filter(e => e.t === 'use').map(e => e.ref)), back = new Set(led.filter(e => e.t === 'refund').map(e => e.ref)); return led.filter(e => e.t === 'spend' && !back.has(e.id)).map(e => Object.assign({}, e, { used: used.has(e.id) })).reverse(); }

  /* ====================== shops ====================== */
  function cleanShop(s, key) {
    s = s && typeof s === 'object' ? s : {};
    return { owner: key, name: txt(s.name, 40) || (teacherName(key) + "'s shop"), tagline: txt(s.tagline, 120), colour: hex(s.colour, '#1b2f5e'), accent: hex(s.accent, '#e3a614'),
      pattern: PATTERNS.some(p => p[0] === s.pattern) ? s.pattern : 'plain', banner: txt(s.banner, 24) || '🛍️', bannerImg: img(s.bannerImg, 160000),
      sale: int(s.sale, 0, 90), saleLabel: txt(s.saleLabel, 40), open: s.open !== false, made: s.made === true,
      items: (Array.isArray(s.items) ? s.items : []).slice(0, 40).map(i => ({ id: txt(i.id, 40) || uidOf(), name: txt(i.name, 60), desc: txt(i.desc, 160), icon: txt(i.icon, 16) || '🎁', img: img(i.img, 60000),
        cost: int(i.cost, 1, 9999), tier: TIERS.some(t => t[0] === i.tier) ? i.tier : 'low', off: int(i.off, 0, 90), on: i.on !== false })).filter(i => i.name) };
  }
  function shop(key) { return cleanShop(Coins.shops[key], key); }
  function putShopLocal(key, data) { if (data) Coins.shops[key] = cleanShop(data, key); else delete Coins.shops[key]; lsSet('learnhub.shops', Coins.shops); }
  async function saveShop(key, data) {
    if (!isStaff() || (key !== myShopKey() && !isHead())) throw new Error('You can only change your own shop.');
    const s = cleanShop(Object.assign({}, data, { made: true }), key);
    if (JSON.stringify(s).length > 700000) throw new Error('The shop is too big to save. Remove a picture or two.');
    if (cloudOn()) {
      try { await Cloud.db.collection('shops').doc(key).set(Object.assign({}, s, { updatedAt: now() })); }
      catch (err) { throw new Error(/permission|insufficient/i.test((err && err.code || '') + ' ' + (err && err.message)) ? 'The cloud refused the change. Check that the version 60 firestore.rules are published.' : (err && err.message) || 'Could not save.'); }
    }
    putShopLocal(key, s); return s;
  }
  /** The price of an item today: the bigger of its own discount and the shop-wide sale. */
  function priceOf(s, it) { const off = Math.max(it.off || 0, s.sale || 0); return { price: Math.max(1, Math.round(it.cost * (100 - off) / 100)), off, was: it.cost }; }
  Coins.shop = shop; Coins.priceOf = priceOf; Coins.saveShop = saveShop;
  const starterItems = () => SUGGESTED.map(x => ({ id: uidOf(), tier: x[0], icon: x[1], name: x[2], desc: x[3], cost: x[4], off: 0, on: true }));

  /* ====================== cloud sync ====================== */
  const subs = {};
  function stopSync() { Object.keys(subs).forEach(k => { try { subs[k](); } catch (e) {} delete subs[k]; }); }
  function redraw() { const a = document.activeElement; if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return; const p = location.hash.replace(/^#\/?/, '').split('?')[0].split('/')[0]; if (['shop', 'locker', 'coins'].includes(p)) { try { Coins.page(location.hash.replace(/^#\/?/, '').split('?')[0].split('/').map(decodeURIComponent)); } catch (e) {} } }
  function sync() {
    if (!cloudOn()) return;
    const db = Cloud.db, want = {};
    want['settings'] = () => db.collection('settings').doc('coins').onSnapshot(d => { const en = !(d.exists && d.data().enabled === false); if (en !== Coins.enabled) { Coins.enabled = en; lsSet('summitide.coins', { enabled: en }); window.dispatchEvent(new HashChangeEvent('hashchange')); } }, () => {});
    if (Coins.on()) {
      const m = me();
      if (Cloud.role === 'student') {
        const sid = Cloud.user.uid;
        want['led:' + sid] = () => db.collection('coins').doc(sid).onSnapshot(d => { setLedger(sid, d.exists ? (d.data().entries || []) : []); try { recalc(true); } catch (e) {} redraw(); }, () => {});
        [...new Set(sections().filter(s => (s.students || []).includes(sid)).map(shopKeyOf))].forEach(k => { want['shop:' + k] = () => db.collection('shops').doc(k).onSnapshot(d => { putShopLocal(k, d.exists ? d.data() : null); redraw(); }, () => {}); });
      } else if (m && m.isStaff) {
        const k = myShopKey(); if (k) want['shop:' + k] = () => db.collection('shops').doc(k).onSnapshot(d => { putShopLocal(k, d.exists ? d.data() : null); redraw(); }, () => {});
      }
    }
    Object.keys(subs).forEach(k => { if (!want[k]) { try { subs[k](); } catch (e) {} delete subs[k]; } });
    Object.keys(want).forEach(k => { if (!subs[k]) subs[k] = want[k](); });
  }
  Coins.setEnabled = async function (on) {
    if (!isHead()) throw new Error('Only the Headmaster can change this.');
    if (cloudOn()) { await Cloud.db.collection('settings').doc('coins').set({ enabled: !!on, updatedAt: now() }); if (Cloud.log) Cloud.log('coins.switch', 'school', { enabled: !!on }); }
    Coins.enabled = !!on; lsSet('summitide.coins', { enabled: !!on });
  };

  /* ====================== hooks used by app.js (each returns '' when coins are off) ====================== */
  /** Student desk: the Shop and Locker tiles. */
  Coins.deskTiles = function (tile) {
    const st = me(); if (!active(st)) return '';
    const b = bagOf(st), items = lockerItems(st.id).filter(i => !i.used).length;
    return tile('#/shop', Coins.icon(b.bag), 'Shop', plural(b.bag, 'coin') + ' in your bag') + tile('#/locker', '🚪', 'Locker', items ? plural(items, 'item') + ' · your awards' : 'your items and awards');
  };
  /** Staff desk: the shop tile (chalkboard style, like the others). */
  Coins.staffTile = function (tile) {
    if (!Coins.on() || !isStaff()) return '';
    const key = myShopKey(), mine = sections().filter(s => !s.archived && shopKeyOf(s) === key), onN = mine.filter(s => s.coins === true).length;
    const waiting = mine.filter(s => s.coins === true).reduce((a, s) => a + (s.students || []).reduce((x, id) => { const st = Students.byId(id); return x + (st ? pendingFor(st, key).length : 0); }, 0), 0);
    const ico = '<svg class="chalk-ico" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 18h32l-3 22H11z"/><path d="M16 18a8 8 0 0 1 16 0"/><circle cx="24" cy="29" r="5"/><path d="M24 27v4"/></svg>';
    return tile('#/shop', ico, 'My shop', waiting ? plural(waiting, 'request') + ' waiting' : onN ? 'coins on in ' + plural(onN, 'section') : 'coins are off in your sections', ' data-chalk');
  };
  /** Course page: the student's bag, in the page head's button row. */
  Coins.courseChip = function (course) {
    const st = me(); if (!st || st.isStaff || !Coins.on() || !course) return '';
    if (!coinSections(st.id).some(s => s.courseId === course.id)) return '';
    return '<a class="coin-link" href="#/shop" title="Your coin bag. Open the shop">' + chip(bagOf(st).bag) + '</a>';
  };
  /** Settings → My profile: the student's bag. */
  Coins.profileRow = function () {
    const st = me(); if (!active(st)) return '';
    const b = bagOf(st);
    return '<div class="setting-row"><div><label>My coin bag</label><div class="help">Earned ' + b.earned + (b.given ? ' · given ' + b.given : '') + ' · spent ' + b.spent + (b.held ? ' · ' + b.held + ' held for items you have asked for' : '') + '. Your teachers can see your bag.</div></div><span class="btn-row">' + chip(b.bag) + '<a class="btn secondary sm" href="#/locker">Open my locker</a></span></div>';
  };
  /** Sections page: the section's coin switch and the way in to its roster of bags. */
  Coins.sectionButtons = function (sec) {
    if (!Coins.on() || !isStaff() || !sec || sec.archived) return '';
    if (shopKeyOf(sec) !== myShopKey() && !isHead()) return '';
    const on = sec.coins === true, key = shopKeyOf(sec);
    const waiting = on ? (sec.students || []).reduce((a, id) => { const st = Students.byId(id); return a + (st ? pendingFor(st, key).length : 0); }, 0) : 0;
    return '<button type="button" class="btn ghost sm coin-switch' + (on ? ' on' : '') + '" data-coin-toggle="' + esc(sec.id) + '" aria-pressed="' + on + '" title="Turn coin earning on or off for this section">' + Coins.icon(1) + ' Coins: ' + (on ? 'on' : 'off') + '</button>' +
      (on ? '<a class="btn secondary sm" href="#/coins/' + esc(sec.id) + '">' + Coins.icon(10) + ' Redeem coins' + (waiting ? ' <span class="tag accent">' + waiting + '</span>' : '') + '</a>' : '');
  };
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-coin-toggle]'); if (!b || !Coins.on() || !isStaff()) return;
    const sec = Sections.byId(b.dataset.coinToggle); if (!sec) return;
    if (shopKeyOf(sec) !== myShopKey() && !isHead()) return;
    const on = !(sec.coins === true);
    if (!on && !confirm('Turn coins off for ' + sec.name + '? Students keep the coins and items they have; they stop earning here and the shop is hidden for this section.')) return;
    Sections.update(sec.id, { coins: on });
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
  /** Settings → Headmaster. */
  Coins.settingsHtml = function () {
    const on = Coins.on(), secsOn = sections().filter(s => s.coins === true && !s.archived).length;
    return '<p class="muted small">Students earn coins for their work and spend them in their teacher\'s shop. Each teacher switches coins on for a section on the Sections page.</p>' +
      '<div class="setting-row"><div><label>Coins and shops for the school</label><div class="help">Off: every coin, shop and locker screen, button and mention is hidden for everyone, and nothing is earned. Bags and items are kept and come back if you switch it on again.</div></div><button class="switch ' + (on ? 'on' : '') + '" data-coins-school role="switch" aria-checked="' + on + '"></button></div>' +
      (on ? '<p class="muted small">Coins are on in ' + plural(secsOn, 'section') + '. <a href="#/shop">Open my shop</a></p>' +
        '<details class="coin-rates"><summary>How coins are earned</summary>' + ratesHtml() + '</details>' : '');
  };
  Coins.bindSettings = function (root, again) {
    const b = root && root.querySelector('[data-coins-school]'); if (!b) return;
    b.addEventListener('click', async () => { try { await Coins.setEnabled(!Coins.on()); } catch (e) { alert(e.message); } try { sessionStorage.setItem('learnhub.sg.coins', '1'); } catch (e) {} if (again) again(); });
  };
  function ratesHtml() {
    return '<table class="dash coin-table"><tr><th>For</th><th>Coins</th></tr>' +
      [['Reading every slide of a lesson', RATES.lessonRead], ['Passing a lesson quiz', RATES.quizPassed], ['…and scoring 85% or more on it', '+' + RATES.quizStrong], ['Handing in an assignment', RATES.assignment + ' each'], ['Reading every lesson in a unit', '+' + RATES.unitRead],
        ['Unit test, by best score', RATES.test.slice().reverse().map(r => r[0] + '%+ → ' + r[1]).join(' · ')], ['Games in a unit', RATES.gameFinished + ' per game finished, 1 per ' + RATES.gamePoints.toLocaleString() + ' points, at most ' + RATES.gamesCap]].map(r => '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td></tr>').join('') +
      '</table><p class="muted small">Each of these counts once, however many times the work is repeated. A unit of six lessons is worth about 60 to 90 coins.</p>';
  }

  /* ====================== requests ====================== */
  /** Requests a student has made in this shop that the teacher has not dealt with yet. */
  function pendingFor(st, key) { const done = new Set((ledger(st.id).entries || []).map(e => e.req).filter(Boolean)); return requestsOf(st).filter(r => r.shop === key && !done.has(r.id)); }
  /** The student asks for an item. Checks the bag first. */
  function ask(key, itemId) {
    const st = me(); if (!st || st.isStaff) return { ok: false, why: 'Only a student can redeem.' };
    const s = shop(key), it = s.items.find(i => i.id === itemId && i.on); if (!it || !s.open) return { ok: false, why: 'That item is not in the shop right now.' };
    const p = priceOf(s, it), b = bagOf(st);
    if (b.free < p.price) return { ok: false, why: 'You need ' + plural(p.price - b.free, 'more coin') + '.', price: p.price, bag: b };
    const req = requestsOf(st); if (req.length >= 5) return { ok: false, why: 'You already have five requests waiting. Ask your teacher to hand those over first.' };
    req.push({ id: uidOf(), shop: key, item: it.id, name: it.name, icon: it.icon, cost: p.price, at: now() });
    Students.update(st.id, { coinReq: req });
    return { ok: true, price: p.price };
  }
  Coins.ask = ask;
  /** The teacher hands an item over (or turns the request down). */
  async function settle(st, req, approve, note) {
    await loadLedger(st.id);
    if (pendingFor(st, req.shop).every(r => r.id !== req.id)) return 'done';            // another screen dealt with it
    if (approve) { if (bagOf(st).bag < req.cost) throw new Error(st.name + ' has only ' + plural(bagOf(st).bag, 'coin') + '. This costs ' + req.cost + '.'); await addEntry(st.id, { t: 'spend', n: req.cost, item: req.name, icon: req.icon, shop: req.shop, req: req.id, note }); }
    else await addEntry(st.id, { t: 'decline', n: 0, item: req.name, icon: req.icon, shop: req.shop, req: req.id, note });
    return approve ? 'spent' : 'declined';
  }
  Coins.settle = settle;

  /* ====================== pages ====================== */
  const ui = { draft: null, draftKey: '', msg: '', preview: false, open: {} };
  const crumb = (label, href) => '<nav class="crumbs" aria-label="You are here"><a href="#/">Desk</a> › ' + (href ? '<a href="' + href + '">' + esc(label) + '</a>' : '<span>' + esc(label) + '</span>') + '</nav>';
  const gone = () => { location.hash = '#/'; };

  Coins.page = function (parts) {
    const m = me(); if (!m || !Coins.on()) return gone();
    document.body.dataset.page = 'coins';
    if (ui.lastPage !== parts[0] + '/' + (parts[1] || '')) { ui.msg = ''; ui.lastPage = parts[0] + '/' + (parts[1] || ''); }   // a message belongs to the page it was written on
    if (parts[0] === 'locker') return m.isStaff ? gone() : pageLocker(m);
    if (parts[0] === 'coins') return m.isStaff ? pageRoster(parts[1]) : gone();
    if (m.isStaff) return pageEditor();
    return parts[1] ? pageShop(parts[1], m) : pageShops(m);
  };

  /* ---------- student: which shops ---------- */
  function pageShops(st) {
    if (!active(st)) return gone();
    recalc(true);
    const keys = [...new Set(coinSections(st.id).map(shopKeyOf))], b = bagOf(st);
    if (keys.length === 1) return pageShop(keys[0], st);
    app().innerHTML = crumb('Shops') + '<div class="page-head"><div><h1>🛍️ Shops</h1><p class="muted">Spend your coins in a teacher\'s shop. Your teacher hands the item over.</p></div><div class="btn-row">' + chip(b.bag, 'big') + '<a class="btn secondary sm" href="#/locker">🚪 My locker</a></div></div>' +
      (keys.length ? '<div class="shop-doors">' + keys.map(k => { const s = shop(k); return '<a class="card shop-door" href="#/shop/' + encodeURIComponent(k) + '" style="--shop:' + esc(s.colour) + ';--shop-accent:' + esc(s.accent) + '"><span class="shop-door-banner">' + esc(s.banner) + '</span><h2>' + esc(s.name) + '</h2><span class="muted small">' + esc(teacherName(k)) + ' · ' + plural(s.items.filter(i => i.on).length, 'item') + '</span></a>'; }).join('') + '</div>'
        : '<div class="empty">Coins are paused in your classes right now. Your bag and your locker are safe.</div>');
  }
  function bannerHtml(s, k) {
    return '<div class="shop-banner pattern-' + esc(s.pattern) + '" style="--shop:' + esc(s.colour) + ';--shop-accent:' + esc(s.accent) + '">' + (s.bannerImg ? '<img class="shop-banner-img" src="' + s.bannerImg + '" alt="">' : '') +
      '<div class="shop-banner-text"><span class="shop-banner-ico" aria-hidden="true">' + esc(s.banner) + '</span><div><h1>' + esc(s.name) + '</h1><p>' + esc(s.tagline || 'Run by ' + teacherName(k)) + '</p></div></div>' +
      (s.sale ? '<span class="shop-sale">' + esc(s.saleLabel || 'Sale') + ' · ' + s.sale + '% off everything</span>' : '') + '</div>';
  }
  function itemCard(s, it, bag, mode) {
    const p = priceOf(s, it), short = bag === null ? 0 : Math.max(0, p.price - bag);
    return '<div class="card shop-item' + (it.on ? '' : ' off') + '" style="--shop:' + esc(s.colour) + ';--shop-accent:' + esc(s.accent) + '">' + (p.off ? '<span class="shop-off">' + p.off + '% off</span>' : '') +
      '<div class="shop-item-pic">' + (it.img ? '<img src="' + it.img + '" alt="">' : '<span aria-hidden="true">' + esc(it.icon) + '</span>') + '</div><h3>' + esc(it.name) + '</h3>' + (it.desc ? '<p class="muted small">' + esc(it.desc) + '</p>' : '') +
      '<div class="shop-price">' + (p.off ? '<s class="muted small">' + p.was + '</s> ' : '') + chip(p.price) + '</div>' +
      (mode === 'student' ? '<button type="button" class="btn sm" data-shop-ask="' + esc(it.id) + '"' + (short ? ' disabled' : '') + '>' + (short ? 'Need ' + short + ' more' : 'Redeem') + '</button>' : mode === 'preview' ? '<button type="button" class="btn sm" disabled>Redeem</button>' : '') + '</div>';
  }
  /* ---------- student: one shop ---------- */
  function pageShop(key, st) {
    if (!coinSections(st.id).some(s => shopKeyOf(s) === key)) { location.hash = '#/shop'; return; }
    recalc(true);
    const s = shop(key), b = bagOf(st), pend = pendingFor(st, key), items = s.items.filter(i => i.on);
    app().innerHTML = crumb('Shop') + bannerHtml(s, key) +
      '<div class="shop-bar"><div class="shop-bag"><span class="muted small">Your coin bag</span>' + chip(b.bag, 'big') + (b.held ? '<span class="muted small">' + b.held + ' held for items you have asked for · ' + b.free + ' free to spend</span>' : '') + '</div><div class="btn-row"><a class="btn secondary sm" href="#/locker">🚪 My locker</a></div></div>' +
      (pend.length ? '<div class="card shop-pending" role="status"><strong>Waiting for ' + esc(teacherName(key)) + ':</strong> ' + pend.map(r => '<span class="tag">' + esc(r.icon) + ' ' + esc(r.name) + ' · ' + r.cost + ' <button type="button" class="link-btn" data-shop-cancel="' + esc(r.id) + '" aria-label="Cancel my request for ' + esc(r.name) + '">cancel</button></span>').join(' ') + '</div>' : '') +
      (!s.open ? '<div class="empty">This shop is closed for now.</div>' : !items.length ? '<div class="empty">This shop has nothing on its shelves yet.</div>' :
        TIERS.map(t => { const list = items.filter(i => i.tier === t[0]); return list.length ? '<h2 class="shop-tier">' + t[1] + '</h2><div class="shop-grid">' + list.map(i => itemCard(s, i, b.free, 'student')).join('') + '</div>' : ''; }).join(''));
    app().querySelectorAll('[data-shop-ask]').forEach(btn => btn.addEventListener('click', () => confirmAsk(key, btn.dataset.shopAsk)));
    app().querySelectorAll('[data-shop-cancel]').forEach(btn => btn.addEventListener('click', () => { Students.update(st.id, { coinReq: requestsOf(st).filter(r => r.id !== btn.dataset.shopCancel) }); pageShop(key, me()); }));
  }
  /** The check before a redemption: what it costs, what is in the bag, what will be left. */
  function confirmAsk(key, itemId) {
    const st = me(), s = shop(key), it = s.items.find(i => i.id === itemId); if (!st || !it) return;
    const p = priceOf(s, it), b = bagOf(st), enough = b.free >= p.price;
    const d = document.createElement('div'); d.className = 'learn-overlay'; d.id = 'coinCheck'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-label', 'Redeem ' + it.name);
    d.innerHTML = '<div class="learn-card coin-dialog"><h2>' + esc(it.icon) + ' ' + esc(it.name) + '</h2>' +
      '<table class="coin-sum"><tr><td>In your bag' + (b.held ? ' (free to spend)' : '') + '</td><td>' + chip(b.free) + '</td></tr><tr><td>This costs</td><td>' + chip(p.price) + '</td></tr><tr class="total"><td>' + (enough ? 'Left afterwards' : 'You still need') + '</td><td>' + chip(enough ? b.free - p.price : p.price - b.free) + '</td></tr></table>' +
      (enough ? '<p class="muted small">Your teacher, ' + esc(teacherName(key)) + ', hands the item over. The coins leave your bag when they do.</p>' : '<p><strong>Not enough coins yet.</strong> Keep going: lessons, quizzes, assignments and games all add to your bag.</p>') +
      '<div class="btn-row">' + (enough ? '<button type="button" class="btn" data-cc-ok>Ask for it</button>' : '') + '<button type="button" class="btn ghost" data-cc-no>' + (enough ? 'Not now' : 'Close') + '</button></div><p class="small" data-cc-msg role="alert"></p></div>';
    document.body.appendChild(d);
    const close = () => d.remove();
    d.querySelector('[data-cc-no]').addEventListener('click', close); d.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    const ok = d.querySelector('[data-cc-ok]'); if (ok) ok.addEventListener('click', () => { const r = ask(key, itemId); if (!r.ok) { d.querySelector('[data-cc-msg]').textContent = r.why; return; } close(); toast('Asked', it.name, 'Waiting for your teacher.'); pageShop(key, me()); });
    (ok || d.querySelector('[data-cc-no]')).focus();
  }

  /* ---------- student: the Locker ---------- */
  function pageLocker(st) {
    if (!active(st)) return gone();
    recalc(true);
    const b = bagOf(st), items = lockerItems(st.id), led = ledger(st.id).entries || [];
    const pend = requestsOf(st).filter(r => !led.some(e => e.req === r.id));
    const declined = led.filter(e => e.t === 'decline' && (Date.now() - new Date(e.at).getTime()) < 14 * 86400000).reverse();
    const col = (LOCKER_COLOURS.find(c => c[0] === (st.prefs && st.prefs.locker)) || LOCKER_COLOURS[0]);
    // awards on display: everything earned, newest first, across the student's courses
    const mine = courses().filter(c => !Students.enrolled || Students.enrolled(c.id));
    let earned = [], total = 0;
    mine.forEach(c => { try { const list = Badges.listForCourse(c); total += list.length; list.filter(a => a.earnedAt).forEach(a => earned.push(Object.assign({ course: c }, a))); } catch (e) {} });
    earned.sort((x, y) => String(y.earnedAt).localeCompare(String(x.earnedAt)));
    const tier = t => earned.filter(a => a.tier === t);
    const shelfAwards = (list, empty) => list.length ? '<div class="locker-awards">' + list.slice(0, 24).map(a => '<span class="locker-award tier-' + esc(a.tier) + '" title="' + esc(a.name + ' · ' + a.course.title + ' · ' + when(a.earnedAt)) + '"><span class="la-ico" aria-hidden="true">' + esc(a.icon) + '</span><span class="la-name">' + esc(a.name) + '</span></span>').join('') + (list.length > 24 ? '<a class="locker-more" href="#/case">+' + (list.length - 24) + ' more</a>' : '') + '</div>' : '<p class="locker-empty">' + empty + '</p>';
    const next = (() => { for (const c of mine) { try { const a = Badges.listForCourse(c).find(x => !x.earnedAt); if (a) return a; } catch (e) {} } return null; })();
    app().innerHTML = crumb('Locker') + '<div class="page-head"><div><h1>🚪 ' + esc(st.name) + '\'s locker</h1><p class="muted">Your coin bag, the items you have redeemed, and every award you have earned.</p></div><div class="btn-row"><a class="btn secondary sm" href="#/shop">🛍️ Shop</a><a class="btn ghost sm" href="#/case">🏆 Display Case</a></div></div>' +
      '<div class="locker" style="--locker:' + esc(col[1]) + '">' +
        '<div class="locker-door" aria-hidden="true"><span class="locker-vents"><i></i><i></i><i></i><i></i></span><span class="locker-plate">' + esc(st.avatar || '🎒') + '</span><span class="locker-handle"></span><span class="locker-num">' + esc(String(st.number || '').slice(-3) || '101') + '</span></div>' +
        '<div class="locker-inside">' +
          '<section class="locker-shelf"><h2>Coin bag</h2><div class="locker-bag">' + chip(b.bag, 'huge') + '<div class="small">Earned <strong>' + b.earned + '</strong>' + (b.given ? ' · given <strong>' + b.given + '</strong>' : '') + ' · spent <strong>' + b.spent + '</strong>' + (b.held ? ' · <strong>' + b.held + '</strong> held' : '') + '</div></div>' +
            (pend.length ? '<p class="small">⏳ Waiting for your teacher: ' + pend.map(r => esc(r.icon) + ' ' + esc(r.name)).join(', ') + '</p>' : '') +
            (declined.length ? '<p class="small muted">Not this time: ' + declined.map(e => esc(e.icon) + ' ' + esc(e.item) + (e.note ? ' (' + esc(e.note) + ')' : '')).join(', ') + '</p>' : '') + '</section>' +
          '<section class="locker-shelf"><h2>My items <span class="tag">' + items.filter(i => !i.used).length + ' to use</span></h2>' + (items.length ? '<div class="locker-items">' + items.map(i => '<div class="locker-item' + (i.used ? ' used' : '') + '"><span class="li-ico" aria-hidden="true">' + esc(i.icon || '🎁') + '</span><span class="li-name">' + esc(i.item) + '</span><span class="li-meta">' + (i.used ? 'used' : 'from ' + esc(i.byName || teacherName(i.shop))) + ' · ' + esc(when(i.at)) + '</span></div>').join('') + '</div>' : '<p class="locker-empty">Nothing here yet. Items you redeem in a shop are kept on this shelf.</p>') + '</section>' +
          '<section class="locker-shelf trophy"><h2>Trophies <span class="tag">' + tier('trophy').length + '</span></h2>' + shelfAwards(tier('trophy'), 'Course trophies stand here. Earn every unit medal in a course for your first.') + '</section>' +
          '<section class="locker-shelf"><h2>Medals <span class="tag">' + tier('medal').length + '</span></h2>' + shelfAwards(tier('medal'), 'Medals hang here. Finish a unit to earn one.') + '</section>' +
          '<section class="locker-shelf"><h2>Badges <span class="tag">' + tier('badge').length + '</span></h2>' + shelfAwards(tier('badge'), 'Badges are pinned here. Read a lesson or pass a quiz to earn one.') + '</section>' +
          '<div class="locker-foot"><span class="small"><strong>' + earned.length + ' of ' + total + '</strong> awards collected</span><span class="progress"><span style="width:' + (total ? Math.round(earned.length / total * 100) : 0) + '%"></span></span>' + (next ? '<span class="small muted">Next: ' + esc(next.icon) + ' ' + esc(next.name) + ' — ' + esc(next.desc) + '</span>' : '') + '</div>' +
        '</div></div>' +
      '<div class="card locker-colours"><span class="small"><strong>Locker colour</strong></span><span class="btn-row">' + LOCKER_COLOURS.map(c => '<button type="button" class="swatch' + (c[0] === col[0] ? ' on' : '') + '" style="background:' + c[1] + '" data-locker-colour="' + c[0] + '" title="' + c[0] + '" aria-label="' + c[0] + '" aria-pressed="' + (c[0] === col[0]) + '"></button>').join('') + '</span></div>';
    app().querySelectorAll('[data-locker-colour]').forEach(btn => btn.addEventListener('click', () => { const cur = me(); Students.update(cur.id, { prefs: Object.assign({}, cur.prefs || {}, { locker: btn.dataset.lockerColour }) }); pageLocker(me()); }));
  }

  /* ---------- teacher: the roster of bags ("Redeem coins") ---------- */
  async function pageRoster(sectionId) {
    const sec = Sections.byId(sectionId), key = sec && shopKeyOf(sec);
    if (!sec || (key !== myShopKey() && !isHead())) return gone();
    const roster = (sec.students || []).map(id => Students.byId(id)).filter(Boolean).sort((a, b) => String(a.name).localeCompare(String(b.name)));
    const draw = () => {
      const s = shop(key);
      app().innerHTML = crumb('Sections', '#/sections') + '<div class="page-head"><div><h1>' + Coins.icon(10) + ' Redeem coins</h1><p class="muted">' + esc(sec.name) + ' · every student\'s bag, what they have asked for, and what they hold. ' + (sec.coins === true ? '' : '<strong>Coins are off for this section.</strong>') + '</p></div><div class="btn-row"><a class="btn secondary sm" href="#/shop">🛍️ My shop</a></div></div>' +
        (ui.msg ? '<p class="small" role="status"><strong>' + esc(ui.msg) + '</strong></p>' : '') +
        (roster.length ? '<div class="coin-roster">' + roster.map(st => { const b = bagOf(st), pend = pendingFor(st, key), items = lockerItems(st.id).filter(i => !i.used && i.shop === key);
          return '<div class="card coin-row"><div class="coin-who"><span class="who-avatar" style="background:' + esc(hex(st.colour, '#1f5f8b')) + '">' + esc(st.avatar) + '</span><span><strong>' + esc(st.name) + '</strong>' + (st.number ? ' <span class="muted small">#' + esc(st.number) + '</span>' : '') + '<br><span class="muted small">earned ' + b.earned + (b.given ? ' · given ' + b.given : '') + ' · spent ' + b.spent + '</span></span></div>' +
            '<div class="coin-bag">' + chip(b.bag, 'big') + '</div>' +
            '<div class="coin-acts"><button type="button" class="btn sm" data-redeem="' + esc(st.id) + '">Redeem coins</button><button type="button" class="btn ghost sm" data-give="' + esc(st.id) + '">Give coins</button></div>' +
            (pend.length ? '<div class="coin-pend">' + pend.map(r => '<div class="coin-req"><span>' + esc(r.icon) + ' <strong>' + esc(r.name) + '</strong> · ' + r.cost + ' coins' + (b.bag < r.cost ? ' <span class="tag">not enough</span>' : '') + '</span><span class="btn-row"><button type="button" class="btn sm" data-approve="' + esc(st.id) + '|' + esc(r.id) + '"' + (b.bag < r.cost ? ' disabled' : '') + '>Hand it over</button><button type="button" class="btn ghost sm" data-decline="' + esc(st.id) + '|' + esc(r.id) + '">Not this time</button></span></div>').join('') + '</div>' : '') +
            (items.length ? '<div class="coin-held"><span class="muted small">Holding:</span> ' + items.map(i => '<span class="tag">' + esc(i.icon) + ' ' + esc(i.item) + ' <button type="button" class="link-btn" data-used="' + esc(st.id) + '|' + esc(i.id) + '">mark used</button> · <button type="button" class="link-btn" data-refund="' + esc(st.id) + '|' + esc(i.id) + '">refund</button></span>').join(' ') + '</div>' : '') + '</div>'; }).join('') + '</div>'
          : '<div class="empty">No students in this section yet.</div>');
      const q = sel => [...app().querySelectorAll(sel)], find = v => { const [sid, id] = v.split('|'); return { st: Students.byId(sid), id }; };
      const run = async fn => { try { ui.msg = (await fn()) || ''; } catch (e) { ui.msg = '⚠️ ' + (e && e.message); } draw(); };
      q('[data-approve]').forEach(b => b.addEventListener('click', () => { const f = find(b.dataset.approve), r = f.st && pendingFor(f.st, key).find(x => x.id === f.id); if (r) run(async () => { await settle(f.st, r, true); return f.st.name + ' redeemed ' + r.name + ' for ' + plural(r.cost, 'coin') + '.'; }); }));
      q('[data-decline]').forEach(b => b.addEventListener('click', () => { const f = find(b.dataset.decline), r = f.st && pendingFor(f.st, key).find(x => x.id === f.id); if (!r) return; const note = prompt('A short reason for ' + f.st.name + ' (optional):', ''); if (note === null) return; run(async () => { await settle(f.st, r, false, note); return 'Request turned down. No coins were taken.'; }); }));
      q('[data-used]').forEach(b => b.addEventListener('click', () => { const f = find(b.dataset.used); if (f.st) run(async () => { await addEntry(f.st.id, { t: 'use', n: 0, ref: f.id, shop: key }); return 'Marked as used.'; }); }));
      q('[data-refund]').forEach(b => b.addEventListener('click', () => { const f = find(b.dataset.refund), it = f.st && lockerItems(f.st.id).find(i => i.id === f.id); if (!it || !confirm('Take ' + it.item + ' back and return ' + plural(it.n, 'coin') + ' to ' + f.st.name + '?')) return; run(async () => { await addEntry(f.st.id, { t: 'refund', n: it.n, item: it.item, icon: it.icon, ref: it.id, shop: key }); return plural(it.n, 'coin') + ' returned to ' + f.st.name + '.'; }); }));
      q('[data-give]').forEach(b => b.addEventListener('click', () => { const st = Students.byId(b.dataset.give); if (!st) return; const n = prompt('How many coins to give ' + st.name + '? (1 to 50)', '5'); if (n === null) return; const v = Math.round(+n); if (!(v >= 1 && v <= 50)) return alert('Type a whole number from 1 to 50.'); const note = prompt('What for? (shown in the change log)', '') || ''; run(async () => { await addEntry(st.id, { t: 'bonus', n: v, item: 'Gift from ' + (me().name || 'your teacher'), icon: '🎁', shop: key, note }); return plural(v, 'coin') + ' given to ' + st.name + '.'; }); }));
      q('[data-redeem]').forEach(b => b.addEventListener('click', () => { const st = Students.byId(b.dataset.redeem); if (st) redeemDialog(st, key, s, draw); }));
    };
    draw();
    await Promise.all(roster.map(st => loadLedger(st.id)));
    if (location.hash.indexOf('#/coins/') === 0) draw();
  }
  /** "Redeem coins": the teacher picks an item for a student, sees the bag, and hands it over. */
  function redeemDialog(st, key, s, after) {
    const b = bagOf(st), items = s.items.filter(i => i.on);
    const d = document.createElement('div'); d.className = 'learn-overlay'; d.id = 'redeemBox'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-label', 'Redeem coins for ' + st.name);
    d.innerHTML = '<div class="learn-card coin-dialog"><h2>Redeem coins for ' + esc(st.name) + '</h2><p>In the bag: ' + chip(b.bag, 'big') + '</p>' +
      (items.length ? '<div class="redeem-list">' + items.map(i => { const p = priceOf(s, i), ok = b.bag >= p.price; return '<button type="button" class="redeem-item" data-rd="' + esc(i.id) + '"' + (ok ? '' : ' disabled') + '><span>' + esc(i.icon) + ' ' + esc(i.name) + '</span><span>' + chip(p.price) + (ok ? '' : ' <span class="muted small">needs ' + (p.price - b.bag) + ' more</span>') + '</span></button>'; }).join('') + '</div>' : '<p class="muted">Your shop has no items yet. <a href="#/shop">Open my shop</a> to add some.</p>') +
      '<div class="btn-row"><button type="button" class="btn ghost" data-rd-no>Close</button></div><p class="small" data-rd-msg role="alert"></p></div>';
    document.body.appendChild(d);
    const close = () => d.remove();
    d.querySelector('[data-rd-no]').addEventListener('click', close); d.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    d.querySelectorAll('[data-rd]').forEach(btn => btn.addEventListener('click', async () => { const it = items.find(i => i.id === btn.dataset.rd), p = priceOf(s, it);
      if (!confirm('Hand ' + it.name + ' to ' + st.name + ' for ' + plural(p.price, 'coin') + '?')) return;
      try { await loadLedger(st.id); if (bagOf(st).bag < p.price) throw new Error('Not enough coins.'); await addEntry(st.id, { t: 'spend', n: p.price, item: it.name, icon: it.icon, shop: key }); ui.msg = st.name + ' redeemed ' + it.name + ' for ' + plural(p.price, 'coin') + '.'; close(); after(); }
      catch (e) { d.querySelector('[data-rd-msg]').textContent = '⚠️ ' + (e && e.message); } }));
    d.querySelector('[data-rd-no]').focus();
  }

  /* ---------- teacher: the shop editor ---------- */
  function shrink(file, maxW, maxH, quality) {
    return new Promise((res, rej) => { if (!file || !/^image\//.test(file.type)) return rej(new Error('Choose a picture file.'));
      const r = new FileReader(); r.onerror = () => rej(new Error('Could not read that file.'));
      r.onload = () => { const im = new Image(); im.onerror = () => rej(new Error('That file is not a picture the browser can open.'));
        im.onload = () => { const k = Math.min(1, maxW / im.width, maxH / im.height), c = document.createElement('canvas'); c.width = Math.max(1, Math.round(im.width * k)); c.height = Math.max(1, Math.round(im.height * k)); const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', quality || 0.8)); };
        im.src = r.result; };
      r.readAsDataURL(file); });
  }
  function pageEditor() {
    const key = myShopKey(); if (!key) return gone();
    if (!ui.draft || ui.draftKey !== key) { const s = shop(key); ui.draft = JSON.parse(JSON.stringify(s)); ui.draftKey = key; if (!s.made && !s.items.length) ui.draft.items = starterItems(); ui.dirty = !s.made; }
    const d = ui.draft, mine = sections().filter(s => !s.archived && shopKeyOf(s) === key);
    const sw = (colours, cur, attr) => colours.map(c => '<button type="button" class="swatch' + (c.toLowerCase() === String(cur).toLowerCase() ? ' on' : '') + '" style="background:' + c + '" ' + attr + '="' + c + '" aria-label="' + c + '" aria-pressed="' + (c.toLowerCase() === String(cur).toLowerCase()) + '"></button>').join('');
    const preview = cleanShop(d, key);
    app().innerHTML = crumb('My shop') + '<div class="page-head"><div><h1>🛍️ My shop</h1><p class="muted">What your students can spend their coins on. Change anything, then save. Students see it at once.</p></div><div class="btn-row">' + (ui.dirty ? '<span class="tag accent">Not saved</span>' : '') + '<button type="button" class="btn" data-se-save>Save my shop</button></div></div>' +
      (ui.msg ? '<p class="small" role="status"><strong>' + esc(ui.msg) + '</strong></p>' : '') +
      '<div class="card coin-secs"><strong>Coins in my sections</strong> ' + (mine.length ? mine.map(s => '<span class="coin-sec">' + esc(s.name) + ' ' + Coins.sectionButtons(s) + '</span>').join('') : '<span class="muted small">You have no sections yet.</span>') + '</div>' +
      '<details class="card sgroup" open><summary><span class="sg-title">Look and feel</span><span class="sg-help muted small">name · colours · banner · sale</span></summary><div class="sg-body">' +
        '<div class="shop-edit-grid"><label>Shop name <input class="text-input" data-se="name" maxlength="40" value="' + esc(d.name) + '"></label><label>A line under the name <input class="text-input" data-se="tagline" maxlength="120" value="' + esc(d.tagline) + '" placeholder="e.g. Work hard, spend wisely"></label>' +
        '<label>Banner picture (emoji) <input class="text-input" data-se="banner" maxlength="24" value="' + esc(d.banner) + '"></label><label>Banner photo <span class="btn-row"><input type="file" accept="image/*" data-se-banner class="file-input">' + (d.bannerImg ? '<button type="button" class="btn ghost sm" data-se-nobanner>Remove</button>' : '') + '</span></label></div>' +
        '<div class="setting-row"><div><label>Shop colour</label><div class="help">The banner and the edges of your shelves.</div></div><span class="btn-row">' + sw(SHOP_COLOURS, d.colour, 'data-se-colour') + '</span></div>' +
        '<div class="setting-row"><div><label>Highlight colour</label><div class="help">Sale tags and prices.</div></div><span class="btn-row">' + sw(['#e3a614', '#f97316', '#22c55e', '#38bdf8', '#f472b6', '#ffffff'], d.accent, 'data-se-accent') + '</span></div>' +
        '<div class="setting-row"><div><label>Banner pattern</label></div><div class="seg">' + PATTERNS.map(p => '<button type="button" data-se-pattern="' + p[0] + '" class="' + (d.pattern === p[0] ? 'on' : '') + '">' + p[1] + '</button>').join('') + '</div></div>' +
        '<div class="setting-row"><div><label>Sale on everything</label><div class="help">A percentage off every item, for as long as you leave it on. 0 = no sale. An item\'s own discount is used when it is bigger.</div></div><span class="btn-row"><input class="text-input coin-num" type="number" min="0" max="90" data-se="sale" value="' + d.sale + '"> <span class="muted small">% off</span> <input class="text-input" data-se="saleLabel" maxlength="40" value="' + esc(d.saleLabel) + '" placeholder="Sale name, e.g. Friday special" style="max-width:220px"></span></div>' +
        '<div class="setting-row"><div><label>Shop is open</label><div class="help">Closed: students see the shop but cannot ask for anything.</div></div><button type="button" class="switch ' + (d.open ? 'on' : '') + '" data-se-open role="switch" aria-checked="' + d.open + '"></button></div></div></details>' +
      '<details class="card sgroup" open><summary><span class="sg-title">Items</span><span class="sg-help muted small">' + plural(d.items.length, 'item') + ' · suggested prices: small 8–15 · bigger 30–50 · big 80–120</span></summary><div class="sg-body">' +
        '<p class="muted small">A student who does everything in a six-lesson unit earns about 60 to 90 coins. Price a big reward at 80 or more and it takes about a whole unit.</p>' +
        d.items.map((it, i) => '<div class="shop-edit-item' + (it.on ? '' : ' off') + '"><div class="sei-pic">' + (it.img ? '<img src="' + it.img + '" alt="">' : '<span>' + esc(it.icon) + '</span>') + '</div>' +
          '<label>Name <input class="text-input" data-si="' + i + '" data-f="name" maxlength="60" value="' + esc(it.name) + '"></label><label class="sei-small">Emoji <input class="text-input" data-si="' + i + '" data-f="icon" maxlength="16" value="' + esc(it.icon) + '"></label>' +
          '<label class="sei-small">Cost <input class="text-input" type="number" min="1" max="9999" data-si="' + i + '" data-f="cost" value="' + it.cost + '"></label><label class="sei-small">% off <input class="text-input" type="number" min="0" max="90" data-si="' + i + '" data-f="off" value="' + it.off + '"></label>' +
          '<label class="sei-small">Shelf <select class="text-input" data-si="' + i + '" data-f="tier">' + TIERS.map(t => '<option value="' + t[0] + '"' + (it.tier === t[0] ? ' selected' : '') + '>' + t[1] + '</option>').join('') + '</select></label>' +
          '<label class="sei-wide">What the student gets <input class="text-input" data-si="' + i + '" data-f="desc" maxlength="160" value="' + esc(it.desc) + '"></label>' +
          '<div class="btn-row sei-acts"><label class="btn ghost sm file-btn">🖼️ Picture<input type="file" accept="image/*" data-si-img="' + i + '" class="sr-only"></label>' + (it.img ? '<button type="button" class="btn ghost sm" data-si-noimg="' + i + '">Remove picture</button>' : '') + '<button type="button" class="btn ghost sm" data-si-on="' + i + '">' + (it.on ? 'Hide from students' : 'Show to students') + '</button><button type="button" class="btn ghost sm" data-si-del="' + i + '">Delete</button></div></div>').join('') +
        '<div class="btn-row" style="margin-top:0.75rem"><button type="button" class="btn secondary sm" data-se-add>＋ Add an item</button><button type="button" class="btn ghost sm" data-se-starter>Add the suggested items</button></div></div></details>' +
      '<details class="card sgroup"' + (ui.preview ? ' open' : '') + ' data-se-preview><summary><span class="sg-title">How students see it</span><span class="sg-help muted small">a preview of what you have typed</span></summary><div class="sg-body">' + bannerHtml(preview, key) +
        TIERS.map(t => { const list = preview.items.filter(i => i.on && i.tier === t[0]); return list.length ? '<h2 class="shop-tier">' + t[1] + '</h2><div class="shop-grid">' + list.map(i => itemCard(preview, i, null, 'preview')).join('') + '</div>' : ''; }).join('') + '</div></details>';
    const root = app(), again = () => pageEditor(), touch = () => { ui.dirty = true; ui.msg = ''; };
    const pv = root.querySelector('[data-se-preview]'); if (pv) pv.addEventListener('toggle', () => { ui.preview = pv.open; });
    root.querySelectorAll('[data-se]').forEach(inp => inp.addEventListener('change', () => { const k = inp.dataset.se; d[k] = k === 'sale' ? int(inp.value, 0, 90) : txt(inp.value, 120); touch(); again(); }));
    root.querySelectorAll('[data-si]').forEach(inp => inp.addEventListener('change', () => { const it = d.items[+inp.dataset.si], f = inp.dataset.f; if (!it) return; it[f] = f === 'cost' ? int(inp.value, 1, 9999) : f === 'off' ? int(inp.value, 0, 90) : txt(inp.value, 160); touch(); again(); }));
    const on = (sel, fn) => root.querySelectorAll(sel).forEach(el => el.addEventListener('click', () => { fn(el); touch(); again(); }));
    on('[data-se-colour]', el => { d.colour = el.dataset.seColour; }); on('[data-se-accent]', el => { d.accent = el.dataset.seAccent; }); on('[data-se-pattern]', el => { d.pattern = el.dataset.sePattern; });
    on('[data-se-open]', () => { d.open = !d.open; }); on('[data-se-nobanner]', () => { d.bannerImg = ''; });
    on('[data-se-add]', () => { d.items.push({ id: uidOf(), name: 'New item', desc: '', icon: '🎁', img: '', cost: 10, tier: 'low', off: 0, on: true }); });
    on('[data-se-starter]', () => { const have = new Set(d.items.map(i => i.name)); starterItems().forEach(i => { if (!have.has(i.name)) d.items.push(i); }); });
    on('[data-si-on]', el => { const it = d.items[+el.dataset.siOn]; if (it) it.on = !it.on; }); on('[data-si-noimg]', el => { const it = d.items[+el.dataset.siNoimg]; if (it) it.img = ''; });
    root.querySelectorAll('[data-si-del]').forEach(el => el.addEventListener('click', () => { const it = d.items[+el.dataset.siDel]; if (it && confirm('Delete ' + it.name + ' from your shop? Items students already hold stay in their lockers.')) { d.items.splice(+el.dataset.siDel, 1); touch(); again(); } }));
    root.querySelectorAll('[data-si-img]').forEach(el => el.addEventListener('change', async () => { const it = d.items[+el.dataset.siImg]; if (!it || !el.files[0]) return; try { it.img = await shrink(el.files[0], 240, 240, 0.8); touch(); } catch (e) { ui.msg = '⚠️ ' + e.message; } again(); }));
    const bf = root.querySelector('[data-se-banner]'); if (bf) bf.addEventListener('change', async () => { if (!bf.files[0]) return; try { d.bannerImg = await shrink(bf.files[0], 1000, 300, 0.75); touch(); } catch (e) { ui.msg = '⚠️ ' + e.message; } again(); });
    const sv = root.querySelector('[data-se-save]'); if (sv) sv.addEventListener('click', async () => { sv.disabled = true; try { const s = await saveShop(key, d); ui.draft = JSON.parse(JSON.stringify(s)); ui.dirty = false; ui.msg = 'Saved. Your students see the shop as it is now.'; } catch (e) { ui.msg = '⚠️ ' + (e && e.message); } again(); });
  }

  /* ====================== start-up ====================== */
  let t = null;
  function tick() { clearTimeout(t); t = setTimeout(() => { try { sync(); recalc(false); } catch (e) { console.warn('coins', e); } }, 400); }
  window.addEventListener('hashchange', tick);
  window.addEventListener('cloud:change', tick);
  window.addEventListener('cloud:auth', () => { stopSync(); Coins.ledgers = {}; ui.draft = null; ui.msg = ''; if (!(window.Cloud && Cloud.user)) { Coins.shops = {}; } tick(); });
  window.addEventListener('cloud:removed', e => { const r = e.detail; if (r && r.id) { delete Coins.ledgers[r.id]; try { localStorage.removeItem('learnhub.coins.' + r.id); } catch (x) {} } });
  if (window.Cloud && Cloud.whenReady) Cloud.whenReady().then(tick); else tick();
})();
