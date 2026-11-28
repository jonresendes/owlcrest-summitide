/* =========================================================
   edition.js — v79: one codebase, three editions (see edition-config.js). Runs after cloud-config.js and before cloud.js.

   SCHOOLS edition
     The app is the same for every school, so it asks once for a SCHOOL CODE and fetches that school's connection
     details from the vendor's directory:  <directory>/<code>.json  =
       { "name": "…", "firebase": { apiKey, authDomain, projectId, … }, "studentDomain": "…", "staffDomain": "…",
         "licence": { "plan": "School", "seats": 600, "expires": "2027-08-31" } }
     These are public identifiers (the data is guarded by the school's own security rules). One file per school, so the
     list of schools cannot be read off the directory. The licence is shown to the Headmaster; it is a notice, not a lock
     (a lock that the browser enforces is not a lock).
     Kept on the device as  summitide.school  (not cleared by sign-out).

   PERSONAL edition
     No cloud at all: the app's existing device-only mode. Courses come from the store (store.js), not from files.
   ========================================================= */
(function () {
  const E = window.EDITION = Object.assign({ id: 'web' }, window.EDITION || {});
  const KEY = 'summitide.school';
  const esc = s => String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const line = (v, n) => String(v === undefined || v === null ? '' : v).replace(/[<>]/g, '').trim().slice(0, n);
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } };
  /** Only the fields the app uses, each a short plain string: a directory entry is data from the network. */
  function tidy(code, d) {
    if (!d || typeof d !== 'object' || !d.firebase || typeof d.firebase !== 'object') return null;
    const fb = {}; ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'].forEach(k => { if (d.firebase[k]) fb[k] = line(d.firebase[k], 200); });
    if (!/^[\w-]{10,}$/.test(fb.apiKey || '') || !/^[a-z0-9-]{4,40}$/.test(fb.projectId || '') || !/^[a-z0-9.-]+$/.test(fb.authDomain || '')) return null;
    const dom = v => /^[a-z0-9.-]{3,80}$/.test(String(v || '')) ? String(v) : '';
    const lic = d.licence && typeof d.licence === 'object' ? { plan: line(d.licence.plan, 40), seats: Math.max(0, Math.min(1e6, +d.licence.seats || 0)), expires: /^\d{4}-\d{2}-\d{2}$/.test(String(d.licence.expires || '')) ? String(d.licence.expires) : '' } : null;
    return { code, name: line(d.name, 80) || code, firebase: fb, studentDomain: dom(d.studentDomain), staffDomain: dom(d.staffDomain), licence: lic, at: new Date().toISOString() };
  }
  const school = E.id === 'schools' ? read() : null;
  if (E.id === 'personal') window.CLOUD_CONFIG = { enabled: false };
  if (E.id === 'schools') {
    const base = window.CLOUD_CONFIG || {};
    if (school && school.firebase) window.CLOUD_CONFIG = Object.assign({}, base, { enabled: true, firebase: school.firebase }, school.studentDomain ? { studentDomain: school.studentDomain } : {}, school.staffDomain ? { staffDomain: school.staffDomain } : {});
    else { window.CLOUD_CONFIG = { enabled: false }; E.needSchool = true; }
  }
  document.documentElement.dataset.edition = E.id;

  async function lookUp(code) {
    code = String(code || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 24);
    if (code.length < 4) throw new Error('Type the school code your school was given.');
    if (!E.directory) throw new Error('This build has no school directory set.');
    let r; try { r = await fetch(String(E.directory).replace(/\/+$/, '') + '/' + code.toLowerCase() + '.json', { cache: 'no-store', credentials: 'omit' }); } catch (e) { throw new Error('Could not reach the school directory. Check the internet connection and try again.'); }
    if (r.status === 404) throw new Error('No school has that code. Check it with whoever set up Summitide Learning at your school.');
    if (!r.ok) throw new Error('The school directory answered with an error (' + r.status + ').');
    let d; try { d = await r.json(); } catch (e) { d = null; }
    const s = tidy(code, d); if (!s) throw new Error('That school\'s entry is not complete yet. Tell the person who gave you the code.');
    return s;
  }
  function schoolPage() {
    const app = document.getElementById('app'); const cur = read();
    app.innerHTML = '<div class="signin"><div class="signin-head"><div class="signin-logo"><img src="crest.png" alt="" class="signin-crest"></div><h1>Summitide Learning</h1><p class="brand-by">for schools</p></div>' +
      '<div class="card signin-add" data-keep><h3>' + (cur ? 'Change school' : 'Which school?') + '</h3><p class="muted small">Type the school code your school was given. You do this once on each device.</p>' +
      '<div class="btn-row"><input class="text-input" id="schoolCode" maxlength="24" autocomplete="off" autocapitalize="characters" placeholder="School code" style="max-width:220px;text-transform:uppercase" aria-label="School code"><button class="btn" id="schoolGo">Continue</button>' + (cur ? '<a class="btn ghost" href="#/">Cancel</a>' : '') + '</div>' +
      '<p class="small" id="schoolMsg" role="status" style="min-height:1.3em;margin:0.6rem 0 0"></p>' +
      '<p class="muted small" style="margin:0.8rem 0 0">Summitide Learning is provided to schools. There is nothing to buy in this app; your school arranges access.</p></div></div>';
    const go = async () => { const msg = app.querySelector('#schoolMsg'), btn = app.querySelector('#schoolGo'); btn.disabled = true; msg.textContent = 'Looking up the school…';
      try { const s = await lookUp(app.querySelector('#schoolCode').value); localStorage.setItem(KEY, JSON.stringify(s)); msg.textContent = s.name + '. Opening…'; location.hash = '#/'; location.reload(); }
      catch (e) { msg.textContent = e.message || String(e); btn.disabled = false; } };
    app.querySelector('#schoolGo').addEventListener('click', go); app.querySelector('#schoolCode').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  }
  /** Each launch: fetch the school's entry again so a renewed licence or a moved project is picked up. Offline keeps the saved copy. */
  async function refresh() { if (E.id !== 'schools' || !school) return; try { const s = await lookUp(school.code); const moved = JSON.stringify(s.firebase) !== JSON.stringify(school.firebase); localStorage.setItem(KEY, JSON.stringify(s)); if (moved) location.reload(); } catch (e) { /* keep what we have */ } }
  const daysLeft = l => l && l.expires ? Math.ceil((new Date(l.expires + 'T23:59:59') - Date.now()) / 864e5) : null;
  /** Headmaster's view of the licence (Administration). */
  function licenceHtml() {
    const s = read(); if (E.id !== 'schools' || !s) return '';
    const l = s.licence, d = daysLeft(l);
    return '<div class="setting-row"><div><label>School</label><div class="help">' + esc(s.name) + ' · school code <strong>' + esc(s.code) + '</strong></div></div></div>' +
      '<div class="setting-row"><div><label>Licence</label><div class="help">' + (l ? esc(l.plan || 'Licence') + (l.seats ? ' · up to ' + l.seats + ' students' : '') + (l.expires ? ' · ' + (d < 0 ? '<strong style="color:#b3261e">ended ' + esc(l.expires) + '</strong>' : 'until ' + esc(l.expires) + (d <= 30 ? ' <strong>(' + d + ' day' + (d === 1 ? '' : 's') + ' left)</strong>' : '')) : '') : 'No licence details are recorded for this school yet.') +
      '</div><div class="help">To renew or change the licence, contact Summitide Learning. Nothing is sold inside this app.</div></div></div>';
  }
  /** A line for the Headmaster's desk when the licence has ended or is about to. */
  function licenceNotice() { const s = read(); const d = s && daysLeft(s.licence); if (E.id !== 'schools' || d === null || d > 30) return ''; return '<div class="plan-banner">' + (d < 0 ? '<strong>The school\'s licence ended on ' + esc(s.licence.expires) + '.</strong> ' : '<strong>The school\'s licence ends in ' + d + ' day' + (d === 1 ? '' : 's') + '.</strong> ') + 'Details are under Administration.</div>'; }
  /** After a screen is drawn: a "change school" link on the sign-in screen. */
  function after() { if (E.id !== 'schools' || E.needSchool) return; const app = document.getElementById('app'); const head = app && app.querySelector('.signin'); if (!head || app.querySelector('#changeSchool') || (window.Cloud && Cloud.user)) return; const s = read(); if (!s) return;
    const p = document.createElement('p'); p.className = 'muted small center'; p.innerHTML = esc(s.name) + ' · <a href="#/school" id="changeSchool">Change school</a>'; head.appendChild(p); }
  if (E.id === 'schools') { window.addEventListener('load', () => { refresh(); }); }
  window.Edition = { id: E.id, is: id => E.id === id, wrapped: E.id !== 'web', school: read, schoolPage, licenceHtml, licenceNotice, after, lookUp, tidy };
})();
