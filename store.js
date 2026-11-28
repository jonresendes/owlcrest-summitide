/* =========================================================
   store.js — v79, PERSONAL edition only: courses are bought in the app.

   catalogue.json (packed into the build by tools/build-editions.js):
     { "subscription": { "entitlement": "all", "products": ["summitide_all_monthly", "summitide_all_yearly"] },
       "courses": [ { "code": "ENG3U", "title": "…", "blurb": "…", "product": "course_eng3u", "entitlement": "course_eng3u", "file": "eng3u.json" } ],
       "terms": "https://…", "privacy": "https://…" }
   A person OWNS a course when the store says the subscription entitlement is active, or that course's own entitlement is.
   The course files travel inside the app package (courses/<file>); buying one installs it on the device.

   Who answers "what has this person bought": an adapter.
     revenuecat  the RevenueCat plugin inside the wrapped app (Apple App Store and Google Play; one dashboard for sales).
     test        pretend purchases kept on the device, for trying the screens in a browser. Never used in a store build.
   Nothing here sends a name, a profile or any school work anywhere. The store account belongs to the device's owner.

   What has been bought is remembered on the device (summitide.store) so courses open offline. A person who edits that
   by hand can unlock a course; a real lock needs a server and is not part of this build.
   ========================================================= */
(function () {
  const E = window.EDITION || {}; if (E.id !== 'personal') { window.Store = null; return; }
  const cfg = E.store || {};
  const { esc } = window.LH || { esc: s => String(s) };
  const app = document.getElementById('app');
  const KEY = 'summitide.store';
  const saved = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } };
  const S = { cat: null, active: new Set(saved().active || []), prices: {}, live: false, busy: '', msg: '', err: '' };
  const line = (v, n) => String(v === undefined || v === null ? '' : v).replace(/[<>]/g, '').trim().slice(0, n);
  const idOk = v => /^[A-Za-z0-9._-]{1,80}$/.test(String(v || ''));
  const remember = () => { try { localStorage.setItem(KEY, JSON.stringify({ active: Array.from(S.active), at: new Date().toISOString() })); } catch (e) {} };

  /* ---------- adapters ---------- */
  const plugin = () => window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Purchases;
  const fromInfo = ci => Object.keys(((ci || {}).entitlements || {}).active || {});
  const RC = {
    name: 'revenuecat', objects: {},
    available: () => !!plugin(),
    async init() { const ios = window.Capacitor.getPlatform && window.Capacitor.getPlatform() === 'ios'; const apiKey = ios ? cfg.appleKey : cfg.googleKey; if (!apiKey) throw new Error('This build has no store key set.'); await plugin().configure({ apiKey }); },
    async entitlements() { return fromInfo((await plugin().getCustomerInfo()).customerInfo); },
    async products(subs, once) { const out = {};
      for (const [ids, type] of [[subs, 'SUBSCRIPTION'], [once, 'NON_SUBSCRIPTION']]) { if (!ids.length) continue; const r = await plugin().getProducts({ productIdentifiers: ids, type }); (r.products || []).forEach(p => { RC.objects[p.identifier] = p; out[p.identifier] = { price: line(p.priceString, 30), period: line(p.subscriptionPeriod, 12) }; }); }
      return out; },
    async buy(id) { const product = RC.objects[id]; if (!product) throw new Error('The store does not list this item yet.'); try { return fromInfo((await plugin().purchaseStoreProduct({ product })).customerInfo); } catch (e) { if (e && (e.userCancelled || (e.data && e.data.userCancelled))) return null; throw e; } },
    async restore() { return fromInfo((await plugin().restorePurchases()).customerInfo); }
  };
  const TKEY = 'summitide.store.test';
  const tget = () => { try { return JSON.parse(localStorage.getItem(TKEY) || '[]'); } catch (e) { return []; } };
  const TEST = {
    name: 'test', available: () => true, async init() {},
    async entitlements() { return tget(); },
    async products(subs, once) { const out = {}; subs.forEach((id, i) => { out[id] = { price: i ? '$49.99' : '$5.99', period: i ? 'P1Y' : 'P1M' }; }); once.forEach(id => { out[id] = { price: '$9.99' }; }); return out; },
    async buy(id) { const c = S.cat.courses.find(x => x.product === id); const ent = c ? c.entitlement : S.cat.subscription.entitlement; const a = tget(); if (!a.includes(ent)) a.push(ent); localStorage.setItem(TKEY, JSON.stringify(a)); return a; },
    async restore() { return tget(); }
  };
  const adapter = cfg.adapter === 'test' ? TEST : RC;

  /* ---------- catalogue ---------- */
  function tidyCat(d) {
    const sub = d && d.subscription && idOk(d.subscription.entitlement) ? { entitlement: d.subscription.entitlement, products: (Array.isArray(d.subscription.products) ? d.subscription.products : []).filter(idOk).slice(0, 4) } : null;
    const courses = (Array.isArray(d && d.courses) ? d.courses : []).filter(c => c && CourseFiles.isCode(c.code) && idOk(c.product) && idOk(c.entitlement) && /^[\w.-]{1,60}\.json$/.test(String(c.file || '')))
      .slice(0, 200).map(c => ({ code: String(c.code).toUpperCase(), title: line(c.title, 100) || String(c.code).toUpperCase(), blurb: line(c.blurb, 240), product: c.product, entitlement: c.entitlement, file: c.file }));
    const url = v => /^https:\/\/[^\s<>"']{4,200}$/.test(String(v || '')) ? String(v) : '';
    return { subscription: sub && sub.products.length ? sub : null, courses, terms: url(d && d.terms), privacy: url(d && d.privacy) };
  }
  const owns = c => !!((S.cat && S.cat.subscription && S.active.has(S.cat.subscription.entitlement)) || S.active.has(c.entitlement));
  const subscribed = () => !!(S.cat && S.cat.subscription && S.active.has(S.cat.subscription.entitlement));
  const installed = c => !!CourseFiles.loaded[c.code];

  async function install(c) {
    const r = await fetch('courses/' + c.file, { cache: 'no-store' }); if (!r.ok) throw new Error('The course file is not in this copy of the app (' + r.status + ').');
    const blob = await r.blob(); const parsed = await CourseFiles.parse(new File([blob], c.file, { type: 'application/json' }));
    const course = parsed.courses[0]; const code = CourseFiles.codeOf(course, parsed.envelope) || c.code;
    if (String(code).toUpperCase() !== c.code) throw new Error('The course file does not match its listing.');
    await CourseFiles.install(c.code, course, { build: parsed.envelope && parsed.envelope.build, by: 'store' });
  }
  /** Bring the device in line with what is owned: owned courses are installed; a course whose subscription has ended is taken off (the work done in it stays). */
  async function settle() {
    for (const c of S.cat.courses) {
      if (owns(c) && !installed(c)) { try { await install(c); } catch (e) { S.err = c.title + ': ' + (e.message || e); } }
      else if (!owns(c) && installed(c) && S.live) { try { await CourseFiles.uninstall(c.code); } catch (e) { console.warn(e); } }
    }
  }
  let starting = null;
  function start() {
    if (starting) return starting;
    starting = (async () => {
      try { const r = await fetch('catalogue.json', { cache: 'no-store' }); S.cat = tidyCat(r.ok ? await r.json() : {}); } catch (e) { S.cat = tidyCat({}); }
      await CourseFiles.ready;
      if (adapter.available()) {
        try { await adapter.init(); S.active = new Set(await adapter.entitlements()); S.live = true; remember();
          S.prices = await adapter.products(S.cat.subscription ? S.cat.subscription.products : [], S.cat.courses.map(c => c.product)).catch(() => ({})); }
        catch (e) { S.live = false; console.warn('store', e && e.message || e); }   // offline, or the store did not answer: keep what the device remembers
      }
      await settle();
    })();
    return starting;
  }
  async function act(what, fn) {
    if (S.busy) return; S.busy = what; S.msg = ''; S.err = ''; page();
    try { const got = await fn(); if (got) { S.active = new Set(got); S.live = true; remember(); await settle(); if (!S.err) S.msg = what === 'restore' ? 'Purchases restored.' : 'Thank you. It is ready to open.'; } }
    catch (e) { S.err = (e && e.message) || String(e); }
    S.busy = ''; if (/^#\/store/.test(location.hash)) page(); window.dispatchEvent(new Event('courses:change'));
  }
  const period = p => p === 'P1Y' ? ' a year' : p === 'P1M' ? ' a month' : p === 'P3M' ? ' every 3 months' : p === 'P6M' ? ' every 6 months' : '';

  function page() {
    if (window.AppUI) { AppUI.setCourseColor(null); AppUI.setNav('store'); }
    if (!S.cat) { app.innerHTML = '<div class="empty"><p class="muted">Opening the store…</p></div>'; start().then(() => { if (/^#\/store/.test(location.hash)) page(); }); return; }
    const can = adapter.available() && S.live, sub = S.cat.subscription, isSub = subscribed();
    const price = id => (S.prices[id] || {}).price || '';
    const subCard = !sub ? '' : '<section class="card store-sub"><div><h2>Everything, by subscription</h2><p class="muted">Every course in the list below, and each new one as it is added, for as long as the subscription runs.</p>' +
      (isSub ? '<p><span class="tag ok">Subscribed</span> <span class="muted small">Manage or cancel it in your App Store or Google Play account.</span></p>'
        : '<div class="btn-row">' + sub.products.map(id => '<button class="btn" data-buy="' + esc(id) + '"' + (can && price(id) && !S.busy ? '' : ' disabled') + '>' + (price(id) ? esc(price(id)) + esc(period((S.prices[id] || {}).period)) : 'Not available') + '</button>').join('') + '</div>' +
          '<p class="muted small">The subscription renews by itself at the same price until it is cancelled. Cancel at least 24 hours before the end of the period, in your App Store or Google Play account. Payment is taken by Apple or Google.</p>') + '</div></section>';
    const rows = S.cat.courses.map(c => { const mine = owns(c), here = installed(c);
      return '<article class="card store-item"><div class="store-item-text"><span class="tag">' + esc(c.code) + '</span><h3>' + esc(c.title) + '</h3>' + (c.blurb ? '<p class="muted small">' + esc(c.blurb) + '</p>' : '') + '</div><div class="store-item-act">' +
        (mine ? (here ? '<span class="tag ok">' + (S.active.has(c.entitlement) ? 'Owned' : 'Included') + '</span><a class="btn secondary sm" href="#/courses">Open</a>' : '<button class="btn sm" data-install="' + esc(c.code) + '"' + (S.busy ? ' disabled' : '') + '>Install</button>')
          : '<button class="btn sm" data-buy="' + esc(c.product) + '"' + (can && price(c.product) && !S.busy ? '' : ' disabled') + '>' + (price(c.product) ? 'Buy · ' + esc(price(c.product)) : 'Not available') + '</button>') + '</div></article>'; }).join('');
    app.innerHTML = (window.AppUI ? AppUI.crumbs([{ label: Students.current ? AppUI.deskName() : 'Welcome', href: Students.current ? '#/' : '#/welcome' }, { label: 'Store' }]) : '') +
      '<div class="page-head"><div><h1>Store</h1><p class="muted">Courses for Summitide Learning. A course you buy is kept on this device and works without the internet.</p></div><button class="btn secondary" id="storeRestore"' + (can && !S.busy ? '' : ' disabled') + '>Restore purchases</button></div>' +
      (!adapter.available() ? '<div class="plan-banner"><strong>Buying is done in the app.</strong> Install Summitide Learning from the App Store or Google Play to buy courses. This page shows what is offered.</div>' : !S.live ? '<div class="plan-banner"><strong>The store could not be reached.</strong> Courses you already have still open. Connect to the internet to buy or restore.</div>' : '') +
      (adapter.name === 'test' ? '<div class="plan-banner"><strong>Test store.</strong> Nothing is charged; purchases here are pretend.</div>' : '') +
      '<p class="small" id="storeMsg" role="status" style="min-height:1.3em">' + (S.busy ? 'Working…' : S.err ? '<span style="color:#b3261e">' + esc(S.err) + '</span>' : esc(S.msg)) + '</p>' +
      subCard + (S.cat.courses.length ? '<h2 class="sub-head">Courses</h2><div class="store-list">' + rows + '</div>' : '<div class="empty"><h2>No courses are listed yet</h2></div>') +
      '<p class="muted small store-foot">Purchases are made with your Apple or Google account, and are handled by Apple or Google. A purchase service receives an anonymous number for this device and what was bought; it does not receive names, profiles or any work done in the app.' +
      (S.cat.terms ? ' <a href="' + esc(S.cat.terms) + '" target="_blank" rel="noopener">Terms of use</a>' : '') + (S.cat.privacy ? ' · <a href="' + esc(S.cat.privacy) + '" target="_blank" rel="noopener">Privacy policy</a>' : '') + '</p>';
    app.querySelectorAll('[data-buy]').forEach(b => b.addEventListener('click', () => act('buy', () => adapter.buy(b.dataset.buy))));
    app.querySelectorAll('[data-install]').forEach(b => b.addEventListener('click', () => { const c = S.cat.courses.find(x => x.code === b.dataset.install); act('install', async () => { await install(c); return Array.from(S.active); }); }));
    const rs = app.querySelector('#storeRestore'); if (rs) rs.addEventListener('click', () => act('restore', () => adapter.restore()));
  }
  window.Store = { page, start, owns: code => { const c = S.cat && S.cat.courses.find(x => x.code === code); return !!c && owns(c); }, get ready() { return start(); } };
})();
