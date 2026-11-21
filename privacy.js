/* Privacy, retention and deletion (v59).

   One file, four jobs:

   1. THE PRIVACY NOTICE — #/privacy, open to anyone (signed in or not; linked from the sign-in screen and from
      Settings). It says in plain words what the app collects, why, who can see it, which outside services are
      involved, how long things are kept and who to ask. The retention periods and the dictation line are read
      from the school's policy record, so the notice always matches what the app actually does.

   2. THE SCHOOL'S POLICY — settings/policy (anyone may read it, only the Headmaster may write it):
        allowDictation  dictation (voice to text) offered at all; off = no 🎤 button for anyone. v66: OFF until switched on
        shotDays        a problem report's screenshot is removed after this many days   } only when autoSweep is on
        reportDays      a resolved problem report is deleted after this many days       } (v66: nothing is deleted
        liveDays        Live Class presence records and ended sessions, likewise        }  automatically by default)
        contact         who to ask about privacy (a line of plain text shown on the notice)
        boardReviewed   the school board has reviewed the notice (until then the notice says it has not)
      v66 (pv: 2) adds what Ontario's MFIPPA asks of a notice of collection (s. 29 (2)) and of retention (s. 30):
        authority       the legal authority for the collection, in the board's words
        officerTitle, officerAddress, officerPhone   the board officer who answers questions about the collection
        autoSweep       the daily clean-up runs by itself (off until the board has given its retention schedule)
        holdAll         a hold on every record in the school: nothing is deleted by anyone until it is lifted
        allowDrive      exports may be saved to Google Drive
        allowEmbeds     YouTube videos and Google Slides / Docs / Forms are shown inside lessons
        allowOutsideMedia   pictures, sound and video kept on other websites are loaded inside lessons
      A record saved before v66 (no pv) is read with the v66 defaults for every switch above: all off.
      A copy is kept on the device under 'summitide.policy' (not personal, so sign-out leaves it).

   3. DICTATION — the browser's speech service sends the audio to the browser's maker (Google or Apple).
      media.js asks here whether dictation is allowed and whether this person has seen the notice;
      askDictation() shows it once per person per device.

   4. RETENTION AND DELETION (Headmaster)
        sweep()         once a day at sign-in: expired screenshots, old resolved reports, old Live Class records
        term clean-up   Settings → Privacy and retention: erase the work and grades of archived sections
        receipt         after a student is removed: what was deleted and what this app cannot delete

   Nothing here runs code from data: every stored value is escaped where it is drawn. */
(function () {
  const esc = s => String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const now = () => new Date().toISOString();
  const app = () => document.getElementById('app');
  const DAY = 86400000;
  const KEY_POLICY = 'summitide.policy', KEY_SEEN = 'summitide.dictationSeen', KEY_SWEEP = 'summitide.sweep';
  const DEFAULTS = { pv: 2, allowDictation: false, shotDays: 30, reportDays: 180, liveDays: 7, contact: '', boardReviewed: false, authority: '', officerTitle: '', officerAddress: '', officerPhone: '', autoSweep: false, holdAll: false, allowDrive: false, allowEmbeds: false, allowOutsideMedia: false };
  const LIMITS = { shotDays: [1, 3650], reportDays: [7, 3650], liveDays: [1, 3650] };   // v66: up to ten years, so a board's own schedule fits
  const TEXTS = { contact: 200, authority: 400, officerTitle: 120, officerAddress: 240, officerPhone: 40 };
  const SWITCHES_V2 = ['allowDictation', 'autoSweep', 'allowDrive', 'allowEmbeds', 'allowOutsideMedia'];   // off unless saved as on by a v66 app
  const MAX_SESSION_HOURS = 12;   // a Live Class session left running is ended after this long

  const lsGet = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const cloudOn = () => !!(window.Cloud && Cloud.enabled && Cloud.db);
  const me = () => window.Students && Students.current;
  /** The Headmaster: the cloud's word when the cloud is on (the session may be in Student View), the device's otherwise. */
  const isHead = () => { if (window.Cloud && Cloud.enabled) return !!(Cloud.user && Cloud.role === 'master'); const m = me(); return !!(m && m.isStaff && m.role === 'master'); };
  const ageDays = iso => { const t = new Date(iso).getTime(); return isNaN(t) ? 0 : (Date.now() - t) / DAY; };
  const when = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString([], { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }); };
  const plural = (n, word) => n + ' ' + word + (n === 1 ? '' : 's');

  /** Make any stored policy safe and complete: known keys only, numbers inside their limits, plain text. */
  function normalise(p) {
    p = p && typeof p === 'object' ? p : {};
    const v2 = (+p.pv || 0) >= 2;
    const out = { pv: 2, boardReviewed: p.boardReviewed === true, holdAll: p.holdAll === true };
    SWITCHES_V2.forEach(k => { out[k] = v2 && p[k] === true; });
    Object.keys(TEXTS).forEach(k => { out[k] = String(p[k] === undefined || p[k] === null ? '' : p[k]).replace(/[<>]/g, '').trim().slice(0, TEXTS[k]); });
    Object.keys(LIMITS).forEach(k => { const n = Math.round(+p[k]); const lim = LIMITS[k]; out[k] = isNaN(n) || !p[k] ? DEFAULTS[k] : Math.max(lim[0], Math.min(lim[1], n)); });
    return out;
  }
  const Privacy = { policy: normalise(lsGet(KEY_POLICY) || DEFAULTS), DEFAULTS, LIMITS, quiet: false, version: 1 };
  window.Privacy = Privacy;

  /* ====================== the policy record ====================== */
  function redrawIfShown() {
    const p = location.hash.replace(/^#\/?/, '').split('?')[0].split('/')[0];
    const a = document.activeElement; if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
    if (p === 'privacy') Privacy.page();
  }
  async function fetchPolicy() {
    if (!cloudOn()) return Privacy.policy;
    try {
      const d = await Cloud.db.collection('settings').doc('policy').get();
      const next = normalise(d.exists ? d.data() : DEFAULTS);
      Privacy.needsReview = d.exists && (+d.data().pv || 0) < 2;   // saved before v66: the Headmaster is asked to look at the new settings once
      const changed = JSON.stringify(next) !== JSON.stringify(Privacy.policy);
      Privacy.policy = next; lsSet(KEY_POLICY, next);
      if (changed) redrawIfShown();
    } catch (e) { console.warn('privacy policy', e && e.code); }
    return Privacy.policy;
  }
  async function savePolicy(patch) {
    if (!isHead()) throw new Error('Only the Headmaster can change these settings.');
    const next = normalise(Object.assign({}, Privacy.policy, patch));
    if (cloudOn()) {
      try { await Cloud.db.collection('settings').doc('policy').set(Object.assign({}, next, { updatedAt: now(), updatedBy: (Cloud.user && Cloud.user.uid) || '' })); }
      catch (e) { throw new Error(/permission|insufficient/i.test((e && e.code || '') + ' ' + (e && e.message)) ? 'The cloud refused the change. Publish the version 66 firestore.rules (Firebase console → Firestore Database → Rules → Publish), then try again.' : (e && e.message) || 'Could not save.'); }
      if (Cloud.log) Cloud.log('policy.save', 'policy', { fields: Object.keys(patch) });
    }
    Privacy.policy = next; lsSet(KEY_POLICY, next); Privacy.needsReview = false;
    return next;
  }
  Privacy.fetchPolicy = fetchPolicy; Privacy.savePolicy = savePolicy; Privacy.normalise = normalise;

  /* ====================== dictation ====================== */
  Privacy.dictationAllowed = () => Privacy.policy.allowDictation === true;   // v66: speech recognition is an automated (AI) service run by the browser's maker; off until the school switches it on
  const seenKey = () => { const m = me(); return (m && m.id) || 'anon'; };
  Privacy.dictationSeen = () => { const s = lsGet(KEY_SEEN) || {}; return !!s[seenKey()]; };
  /** The one-time notice before dictation is first used. Resolves true when the person chooses to go on. */
  Privacy.askDictation = function () {
    return new Promise(resolve => {
      const d = document.createElement('div'); d.className = 'learn-overlay'; d.id = 'dictationNotice'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-label', 'Before you use dictation');
      d.innerHTML = '<div class="learn-card privacy-dialog"><h2>🎤 Before you use dictation</h2>' +
        '<p>Dictation turns what you say into text. Your browser does that by sending the sound of your voice to the company that makes the browser — <strong>Google</strong> (Chrome), <strong>Microsoft</strong> (Edge) or <strong>Apple</strong> (Safari). Summitide Learning does not keep the sound: it only receives the words.</p>' +
        '<p>If you would rather not, type your answer or use <strong>🎙️ Record</strong> instead. A recording stays on this device and is not sent anywhere.</p>' +
        '<p class="muted small">You can turn dictation off at any time in Settings → Accessibility. <a href="#/privacy" data-dn-more>Read the privacy notice</a></p>' +
        '<div class="btn-row"><button class="btn" type="button" data-dn-ok>OK, use dictation</button><button class="btn ghost" type="button" data-dn-no>Not now</button></div></div>';
      document.body.appendChild(d);
      const done = ok => { d.remove(); if (ok) { const s = lsGet(KEY_SEEN) || {}; s[seenKey()] = now(); lsSet(KEY_SEEN, s); } resolve(ok); };
      d.querySelector('[data-dn-ok]').addEventListener('click', () => done(true));
      d.querySelector('[data-dn-no]').addEventListener('click', () => done(false));
      d.querySelector('[data-dn-more]').addEventListener('click', () => done(false));
      d.addEventListener('keydown', e => { if (e.key === 'Escape') done(false); });
      const ok = d.querySelector('[data-dn-no]'); if (ok) ok.focus();
    });
  };

  /* ====================== the privacy notice (#/privacy) ====================== */
  Privacy.link = () => '<a href="#/privacy">🔏 Privacy notice</a>';
  function noticeHtml() {
    const p = Privacy.policy, signedIn = !!me();
    const sec = (title, body) => '<section class="card privacy-sec"><h2>' + title + '</h2>' + body + '</section>';
    const ul = items => '<ul>' + items.map(i => '<li>' + i + '</li>').join('') + '</ul>';
    return '<div class="privacy-page">' +
      '<div class="page-head"><div><h1>🔏 Privacy notice</h1><p class="muted">What Summitide Learning knows about you, who can see it, and how long it is kept.</p></div>' +
        '<div class="btn-row">' + (signedIn ? '<a class="btn ghost sm" href="#/settings">← Settings</a>' : '<a class="btn ghost sm" href="#/signin" data-privacy-back>← Back to sign in</a>') + '<button class="btn secondary sm" type="button" data-privacy-print>🖨️ Print</button></div></div>' +
      (p.boardReviewed ? '' : '<p class="privacy-flag" role="note">This notice describes how the app works today. It has not yet been reviewed by the school board.</p>') +
      (p.authority && p.officerTitle && p.officerAddress && p.officerPhone ? '' : '<p class="privacy-flag" role="note">Still to be filled in by the school: ' + [!p.authority && 'the legal authority for collecting this information', !(p.officerTitle && p.officerAddress && p.officerPhone) && 'the title, business address and telephone number of the school board officer who answers questions about it'].filter(Boolean).join('; and ') + '.</p>') +
      (p.holdAll ? '<p class="privacy-flag" role="note">Every record is on hold at the moment: nothing is being deleted.</p>' : '') +
      sec('Who runs this app', '<p>Summitide Learning is made by OwlCrest Academy and used by your teachers for your classes. Your school decides who has an account.</p>' +
        '<p><strong>Legal authority for collecting this information:</strong> ' + (p.authority ? esc(p.authority) : '<em>not yet stated by the school.</em>') + '</p>' +
        '<p><strong>Who answers questions about the collection:</strong> ' + (p.officerTitle || p.officerAddress || p.officerPhone ? esc([p.officerTitle, p.officerAddress, p.officerPhone].filter(Boolean).join(' · ')) : '<em>the school board officer has not yet been named here.</em>') + '</p>' +
        '<p><strong>Day-to-day questions:</strong> ' + (p.contact ? esc(p.contact) : 'ask your teacher or the school office.') + '</p>') +
      sec('What the app keeps about a student', ul([
        '<strong>Who you are:</strong> your first name, your student number, and the picture and colours you choose. The app does not ask for your birthday. (If your record has one from before, it is removed when your teacher gives you a sign-in code.)',
        '<strong>How you sign in:</strong> a sign-in code your teacher gives you. A copy of the code is kept where only your teachers and the Headmaster can reach it, so that a teacher can replace it if you lose it.',
        '<strong>How you learn:</strong> your level in each course, and any accommodations, modified program or Focus Plan your teacher has set.',
        '<strong>Your work:</strong> the slides you have read, your quiz and test results (including your answers to the latest attempt), your assignments, your awards, and the history of your level changes.',
        '<strong>What your teacher adds:</strong> grades and comments.',
        '<strong>Your own notes:</strong> the sticky notes on your desk.',
        (window.Coins && Coins.on() ? '<strong>Coins:</strong> how many you have earned in each course, what you have asked a shop for, and what your teachers have handed over or given you.' : null),
        '<strong>During a Live Class session only:</strong> which page of the app you are on, which question, whether the app is the window in front, and the times you left it. Your teacher may also write notes about the session; only that teacher can read them.',
        '<strong>If you report a problem:</strong> your message, the kind of browser and the size of the screen, and, if you leave it ticked, a picture of the screen.',
        '<strong>If you ask for a correction:</strong> what you asked, the answer, and any statement of disagreement. These stay with your record.'
      ].filter(Boolean)) + '<p>For teachers the app keeps a name, a teacher ID, an optional school e-mail address, sections, and private notes.</p>') +
      sec('Why', '<p>To show you lessons at the right level, to save your work so it follows you to any device, and to let your teachers mark it and help you. Nothing is used for advertising, nothing is sold, and the app has no tracking or analytics.</p>') +
      sec('Who can see it', ul([
        '<strong>You</strong> can see your own profile, work, grades and notes.',
        '<strong>Your teachers</strong> — only the teachers whose class you are in — can see your profile, your work in their course, ' + (window.Coins && Coins.on() ? 'your coin bag ' : '') + 'and your sticky notes.',
        '<strong>The Headmaster</strong> (the school\'s administrator account) can see every record, and is the only one who sees problem reports.',
        '<strong>Other students</strong> cannot see anything of yours.'
      ])) +
      sec('Live Class and Focus Mode', '<p>When a teacher starts a Live Class session, the app tells that teacher where you are <em>inside Summitide</em>. It cannot see your screen, your other tabs or apps, or anything you type. In Focus Mode it also counts how many times, and for how long, you left the app during a quiz or test; your teacher sees that count beside the attempt. Nothing is sent when no session is running.</p>') +
      sec('Where it is kept', ul([
        '<strong>Accounts and records:</strong> Google Firebase (sign-in and database), protected by rules that decide what each account may read and change.',
        '<strong>The app itself:</strong> a website hosted on GitHub Pages. It holds no student records.',
        '<strong>On the device you use:</strong> a working copy, so the app is fast and works offline. It is erased when you sign out or are signed out for being idle.',
        '<strong>Voice recordings and files a teacher uploads</strong> stay in the browser of the device they were made on. They are never sent to the cloud.',
        '<strong>On paper and in files:</strong> a teacher or the Headmaster can print or download grades, a Live Class session report, sign-in slips and a copy of a student\'s record. Each download or print of these is written in the change log. What happens to the paper or file afterwards is up to the school.'
      ])) +
      sec('Other services the app can use', ul([
        '<strong>Dictation (🎤):</strong> ' + (p.allowDictation ? 'your browser sends the sound of your voice to its maker (Google, Microsoft or Apple), whose automated speech-recognition system (a kind of artificial intelligence) turns it into text. You are told before the first time, a person always reads what you hand in, and you can turn it off in Settings → Accessibility.' : 'switched off for this school.'),
        '<strong>Read aloud (🔊):</strong> uses the voices built into your device or browser.',
        '<strong>Videos and Google files in a lesson:</strong> ' + (p.allowEmbeds ? 'when a teacher adds a YouTube video or a Google Slides, Docs or Forms file, it is shown inside the lesson and that service can see that your device opened it.' : 'not shown inside lessons at this school. A teacher can add a link; the other site sees your device only if you choose to open the link.'),
        '<strong>Pictures and sound kept on other websites:</strong> ' + (p.allowOutsideMedia ? 'loaded inside the lesson, so the site that keeps them can see that your device asked for them.' : 'not loaded at this school. A link is shown instead. Pictures kept with the app itself, such as the graphs in mathematics, do not go through another site.'),
        '<strong>Links in a lesson:</strong> open in a new tab. The app tells the other site nothing; the site sees what any website sees when you visit it.',
        '<strong>Google Drive:</strong> ' + (p.allowDrive ? 'only if the Headmaster chooses to save an export file there.' : 'switched off for this school.'),
        '<strong>Fonts:</strong> served by the app itself. Nothing is loaded from a font service.'
      ])) +
      sec('How long it is kept', ul([
        '<strong>Work, grades and your profile:</strong> while you are in the class, and afterwards for as long as the school board\'s retention rules require. The Headmaster erases the work and grades of finished classes, and deletes a student who has left, by hand, when those rules allow it.',
        (p.autoSweep ? '<strong>Live Class records:</strong> deleted after ' + plural(p.liveDays, 'day') + '. A session left running is ended after ' + MAX_SESSION_HOURS + ' hours.' : '<strong>Nothing is deleted automatically.</strong> Live Class records, problem reports and screenshots are kept until the Headmaster clears them. A Live Class session left running is ended after ' + MAX_SESSION_HOURS + ' hours.'),
        (p.autoSweep ? '<strong>Problem-report screenshots:</strong> removed after ' + plural(p.shotDays, 'day') + '.' : null),
        (p.autoSweep ? '<strong>Problem reports that have been dealt with:</strong> deleted after ' + plural(p.reportDays, 'day') + '.' : null),
        '<strong>Holds:</strong> when someone has asked to see a record, or something is being looked into, the Headmaster can put a hold on it. Nothing under a hold is deleted.',
        '<strong>The change log</strong> (who added or removed an account, gave out a sign-in code, placed a hold, or downloaded records, and when) is kept and cannot be edited.'
      ].filter(Boolean))) +
      sec('Your choices', ul([
        'Ask your teacher for a copy of everything that is recorded about you. The school can make one file with all of it.',
        'If something is wrong, ask for it to be corrected: Settings → Privacy → <em>Ask for a correction</em>. If the school does not change it, you can have a statement of disagreement attached to your record.',
        'Turn off dictation, voice recording or read-aloud in Settings → Accessibility.',
        'Untick the screenshot when you report a problem.',
        'Ask the school to delete your account when you leave. Your school board\'s privacy office can explain your rights under Ontario\'s privacy law for schools (MFIPPA).'
      ])) +
      '<p class="muted small center">Summitide Learning · version ' + esc((window.PWA && PWA.APP_VERSION) || '66') + ' · this notice changes when the app does.</p></div>';
  }
  Privacy.noticeHtml = noticeHtml;
  Privacy.page = function () {
    const host = app(); if (!host) return;
    document.body.dataset.page = 'privacy';
    const bb = document.getElementById('backBtn'); if (bb && !me()) bb.hidden = true;
    host.innerHTML = noticeHtml();
    const pr = host.querySelector('[data-privacy-print]'); if (pr) pr.addEventListener('click', () => window.print());
    fetchPolicy();
  };

  /* ====================== Settings: everyone ====================== */
  /** The short version shown in Settings to students and teachers. */
  Privacy.summaryHtml = function () {
    const p = Privacy.policy;
    return '<p class="muted small">Your teachers see your work in their own course; other students see nothing of yours. The copy on this device is erased when you sign out.</p>' +
      '<div class="setting-row"><div><label>Privacy notice</label><div class="help">What is kept, who can see it, the outside services the app can use and how long things are kept.</div></div><a class="btn secondary sm" href="#/privacy">Read the notice</a></div>' +
      (window.Records ? Records.askRowHtml() : '') +
      '<div class="setting-row"><div><label>Dictation</label><div class="help">' + (p.allowDictation ? 'Dictation sends the sound of your voice to the maker of your browser (Google, Microsoft or Apple), whose automated speech recognition turns it into text. Voice recording does not: a recording stays on this device.' : 'Dictation is switched off for the whole school. Voice recording still works and stays on this device.') + '</div></div><span class="tag">' + (p.allowDictation ? 'On for this school' : 'Off for this school') + '</span></div>';
  };

  /* ====================== Settings: the Headmaster ====================== */
  const ui = { msg: '', termPick: {}, termAlso: false, preview: null, busy: false, result: null };
  const num = (key, label, help) => { const lim = LIMITS[key]; return '<div class="setting-row"><div><label for="pv_' + key + '">' + label + '</label><div class="help">' + help + ' (' + lim[0] + '–' + lim[1] + ' days)</div></div><span class="btn-row"><input class="text-input privacy-num" id="pv_' + key + '" type="number" inputmode="numeric" min="' + lim[0] + '" max="' + lim[1] + '" value="' + esc(Privacy.policy[key]) + '"> <span class="muted small">days</span></span></div>'; };
  const sw = (attr, label, help, val) => '<div class="setting-row"><div><label>' + label + '</label><div class="help">' + help + '</div></div><button class="switch ' + (val ? 'on' : '') + '" ' + attr + ' role="switch" aria-checked="' + !!val + '"></button></div>';
  const courseTitle = id => { const c = ((window.LearnHub && LearnHub.courses) || []).find(x => x.id === id); return c ? c.title : id; };
  const sections = () => (window.Sections && Sections.list) || [];

  /** What an end-of-term clean-up of these sections would do. Nothing is changed. */
  function termPlan(sectionIds, alsoStudents) {
    const all = sections(), picked = all.filter(s => sectionIds.includes(s.id) && s.archived);
    const erase = [], seen = new Set(), leaving = new Map(), skipped = [];
    picked.forEach(sec => (sec.students || []).forEach(sid => {
      if (/^demo__/.test(sid)) return;
      const st = window.Students && Students.byId(sid); const name = st ? st.name : sid;
      // still taking the same course in a section that is not archived: their work is in use, leave it
      if (all.some(o => o.id !== sec.id && !o.archived && o.courseId === sec.courseId && (o.students || []).includes(sid))) { skipped.push({ sid, name, section: sec.name }); return; }
      const k = sid + '__' + sec.courseId; if (!seen.has(k)) { seen.add(k); erase.push({ sid, name, courseId: sec.courseId, section: sec.name }); }
      if (alsoStudents && st && !all.some(o => !o.archived && (o.students || []).includes(sid))) leaving.set(sid, { sid, name, number: st.number || '' });
    }));
    return { sections: picked.map(s => ({ id: s.id, name: s.name, term: s.term || '', courseId: s.courseId })), erase, skipped, remove: [...leaving.values()] };
  }
  Privacy.termPlan = termPlan;

  function eraseLocal(sid, courseId) {   // device-only mode (and this device's own copy)
    let did = false;
    ['learnhub.progress.', 'learnhub.grades.'].forEach(pre => { const cur = lsGet(pre + sid); if (cur && cur[courseId] !== undefined && Object.keys(cur[courseId] || {}).length) { cur[courseId] = {}; lsSet(pre + sid, cur); did = true; } });
    if (window.Progress && Progress.load) { try { Progress.load(); } catch (e) {} }
    return did;
  }
  /** Carry out a plan made by termPlan. Returns counts. */
  async function termRun(plan, onStep) {
    if (!isHead()) throw new Error('Only the Headmaster can run the end-of-term clean-up.');
    if (Privacy.policy.holdAll) throw new Error('Every record in the school is on hold. Lift the hold (above) before any clean-up.');
    const out = { work: 0, grades: 0, students: 0, failed: [] };
    const heldWhy = async sid => (window.Records ? await Records.heldReason(sid) : '');
    const removing = new Set(plan.remove.map(r => r.sid));
    let n = 0; const total = plan.erase.filter(e => !removing.has(e.sid)).length + plan.remove.length;
    for (const e of plan.erase) {
      if (removing.has(e.sid)) continue;                                    // the whole student goes below, work included
      if (onStep) onStep(++n, total, e.name);
      try {
        { const why = await heldWhy(e.sid); if (why) { out.failed.push(e.name + ': on hold, left alone'); continue; } }
        if (cloudOn() && Cloud.eraseCourseWork) { const r = await Cloud.eraseCourseWork(e.sid, e.courseId); if (r.work) out.work++; if (r.grades) out.grades++; }
        else if (eraseLocal(e.sid, e.courseId)) out.work++;
      } catch (err) { out.failed.push(e.name + ': ' + (err && err.message || err)); }
    }
    Privacy.quiet = true;                                                   // one summary at the end, not a receipt per student
    try {
      for (const r of plan.remove) {
        if (onStep) onStep(++n, total, r.name);
        try {
          { const why = await heldWhy(r.sid); if (why) { out.failed.push(r.name + ': on hold, left alone'); continue; } }
          if (cloudOn() && Cloud.removeStudent) {
            // the roster entries and this device's copy first (as the Students page does), then the cloud records, one student at a time
            const S = window.Students; S.data.list = S.data.list.filter(s => s.id !== r.sid);
            ['learnhub.progress.', 'learnhub.focus.', 'learnhub.grades.'].forEach(k => { try { localStorage.removeItem(k + r.sid); } catch (e) {} });
            S.directory = (S.directory || []).filter(s => s.id !== r.sid);
            let touched = false; sections().forEach(sec => { if ((sec.students || []).includes(r.sid)) { sec.students = sec.students.filter(x => x !== r.sid); touched = true; } }); if (touched) Sections.save();
            S.save();
            await Cloud.removeStudent(r.sid); await forgetOnDevice(r.sid);
          } else { window.Students.removeStudent(r.sid); await forgetOnDevice(r.sid); }
          out.students++;
        } catch (err) { out.failed.push(r.name + ': ' + (err && err.message || err)); }
      }
    } finally { Privacy.quiet = false; }
    const stamp = now();
    plan.sections.forEach(s => { try { Sections.update(s.id, { purgedAt: stamp }); } catch (e) {} });
    if (cloudOn() && Cloud.log) Cloud.log('term.cleanup', plan.sections.map(s => s.id).join(',').slice(0, 200), { sections: plan.sections.map(s => s.name).slice(0, 20), work: out.work, grades: out.grades, students: out.students, failed: out.failed.length });
    return out;
  }
  Privacy.termRun = termRun;

  /** Voice recordings this device holds for a student (they never reach the cloud, so each device clears its own). */
  async function forgetOnDevice(sid) {
    let n = 0;
    try { if (window.Media && Media.keys) { const ks = await Media.keys(sid + '/'); for (const k of ks) { await Media.del(k); n++; } } } catch (e) {}
    try { const s = lsGet(KEY_SEEN) || {}; if (s[sid]) { delete s[sid]; lsSet(KEY_SEEN, s); } } catch (e) {}
    return n;
  }
  Privacy.forgetOnDevice = forgetOnDevice;

  /* ---------- the daily retention sweep ---------- */
  /** Remove what has passed its keep-by date. Headmaster only (the rules allow nobody else). */
  async function sweep(force) {
    if (!isHead()) return null;
    const last = lsGet(KEY_SWEEP);
    const p = Privacy.policy;
    // v66: nothing is deleted by itself unless the Headmaster has switched the automatic clean-up on, and never under a school-wide hold
    if (p.holdAll) return Object.assign({}, last || {}, { held: true });
    if (!force && !p.autoSweep) { if (cloudOn()) { try { await endForgottenSessions(); } catch (e) {} } return last; }
    if (!force && last && last.at && ageDays(last.at) < 20 / 24) return last;
    const out = { at: now(), shots: 0, reports: 0, presence: 0, sessions: 0, ended: 0, errors: 0, skipped: 0 };
    if (cloudOn()) {
      const db = Cloud.db;
      let held = new Set(); try { const h = await db.collection('holds').get(); held = new Set(h.docs.map(d => d.id)); } catch (e) {}   // students whose records are on hold are passed over
      try {
        const q = await db.collection('issues').get();
        for (const d of q.docs) { const i = d.data() || {}, age = ageDays(i.at);
          if (held.has(i.by)) { out.skipped++; continue; }
          try {
            if (i.status === 'resolved' && age > p.reportDays) { await d.ref.delete(); out.reports++; }
            else if (i.shot && age > p.shotDays) { await d.ref.update({ shot: '' }); out.shots++; }
          } catch (e) { out.errors++; } }
      } catch (e) { out.errors++; console.warn('retention: reports', e && e.code); }
      try {
        const q = await db.collection('presence').get();
        for (const d of q.docs) { const pr = d.data() || {}; if (held.has(d.id)) { out.skipped++; continue; } if (ageDays(pr.at || pr.since) > p.liveDays) { try { await d.ref.delete(); out.presence++; } catch (e) { out.errors++; } } }
      } catch (e) { out.errors++; console.warn('retention: presence', e && e.code); }
      try {
        const q = await db.collection('live').get();
        for (const d of q.docs) { const s = d.data() || {};
          try {
            if (s.endedAt && ageDays(s.endedAt) > p.liveDays) { await d.ref.delete(); out.sessions++; }
            else if (!s.endedAt && ageDays(s.startedAt) > MAX_SESSION_HOURS / 24) { await d.ref.update({ endedAt: now(), updatedAt: now(), endedBy: 'retention' }); out.ended++; }
          } catch (e) { out.errors++; } }
      } catch (e) { out.errors++; console.warn('retention: live', e && e.code); }
      if ((out.shots || out.reports || out.presence || out.sessions || out.ended) && Cloud.log) Cloud.log('retention.sweep', '', { shots: out.shots, reports: out.reports, presence: out.presence, sessions: out.sessions, ended: out.ended });
    } else {
      // device-only mode: problem reports live in this browser
      const all = lsGet('learnhub.issues'); if (Array.isArray(all)) {
        const kept = all.filter(i => { if (i.status === 'resolved' && ageDays(i.at) > p.reportDays) { out.reports++; return false; } return true; });
        kept.forEach(i => { if (i.shot && ageDays(i.at) > p.shotDays) { i.shot = ''; out.shots++; } });
        if (out.reports || out.shots) lsSet('learnhub.issues', kept);
      }
    }
    lsSet(KEY_SWEEP, out);
    return out;
  }
  Privacy.sweep = sweep;
  /** A Live Class session someone forgot to end is closed after 12 hours even when nothing is being deleted (it stops students sending presence). */
  async function endForgottenSessions() {
    const q = await Cloud.db.collection('live').get();
    for (const d of q.docs) { const x = d.data() || {}; if (!x.endedAt && ageDays(x.startedAt) > MAX_SESSION_HOURS / 24) { try { await d.ref.update({ endedAt: now(), updatedAt: now(), endedBy: 'retention' }); } catch (e) {} } }
  }
  const sweepLine = s => !s || !s.at ? 'Not run on this device yet.' : 'Last run ' + esc(when(s.at)) + ': ' + (s.shots + s.reports + s.presence + s.sessions + (s.ended || 0) ? [s.shots && plural(s.shots, 'screenshot') + ' removed', s.reports && plural(s.reports, 'resolved report') + ' deleted', s.presence && plural(s.presence, 'Live Class record') + ' deleted', s.sessions && plural(s.sessions, 'old session') + ' deleted', s.ended && plural(s.ended, 'forgotten session') + ' ended'].filter(Boolean).join(', ') : 'nothing was past its date') + (s.skipped ? ' · ' + plural(s.skipped, 'record') + ' on hold left alone' : '') + (s.errors ? ' · ⚠️ ' + plural(s.errors, 'step') + ' could not finish (check that the version 66 rules are published)' : '') + '.';

  Privacy.settingsHtml = function () {
    const p = Privacy.policy, arch = sections().filter(s => s.archived);
    const plan = ui.preview;
    const only = plan ? plan.erase.filter(e => !plan.remove.some(r => r.sid === e.sid)) : [];   // students deleted whole are listed once, under the second point
    const termBody = !arch.length
      ? '<p class="muted small">No archived sections. Archive a section on the Sections page at the end of its term; it then appears here.</p>'
      : '<div class="privacy-term">' + arch.map(s => '<label class="chk"><input type="checkbox" data-pv-term="' + esc(s.id) + '"' + (ui.termPick[s.id] ? ' checked' : '') + (ui.busy ? ' disabled' : '') + '> <span><strong>' + esc(s.name) + '</strong>' + (s.term ? ' · ' + esc(s.term) : '') + ' · ' + esc(courseTitle(s.courseId)) + ' · ' + plural((s.students || []).length, 'student') + (s.purgedAt ? ' <span class="tag">cleaned ' + esc(when(s.purgedAt)) + '</span>' : '') + '</span></label>').join('') + '</div>' +
        '<label class="chk" style="margin-top:0.5rem"><input type="checkbox" data-pv-also' + (ui.termAlso ? ' checked' : '') + (ui.busy ? ' disabled' : '') + '> Also delete students who are left in no active section <span class="muted small">(their whole record, not only this course)</span></label>' +
        '<div class="btn-row" style="margin-top:0.6rem"><button class="btn secondary sm" type="button" data-pv-preview' + (ui.busy ? ' disabled' : '') + '>Preview</button></div>' +
        (plan ? '<div class="privacy-preview" role="status">' +
            (plan.erase.length || plan.remove.length
              ? '<p><strong>This will erase:</strong></p><ul>' +
                  (only.length ? '<li>the work and teacher grades of <strong>' + plural(only.length, 'student') + '</strong> in ' + esc([...new Set(only.map(e => courseTitle(e.courseId)))].join(', ')) + ': ' + esc(only.slice(0, 12).map(e => e.name).join(', ')) + (only.length > 12 ? ' and ' + (only.length - 12) + ' more' : '') + '</li>' : '') +
                  (plan.remove.length ? '<li>the <strong>whole record</strong> of ' + plural(plan.remove.length, 'student') + ' who would be left in no active section: ' + esc(plan.remove.slice(0, 12).map(r => r.name + (r.number ? ' (' + r.number + ')' : '')).join(', ')) + (plan.remove.length > 12 ? ' and ' + (plan.remove.length - 12) + ' more' : '') + '</li>' : '') + '</ul>' +
                  (plan.skipped.length ? '<p class="muted small">Left alone: ' + plural(plan.skipped.length, 'student') + ' still taking the same course in an active section.</p>' : '') +
                  '<p class="small">The sections themselves, their rosters and their customisations stay. <strong>This cannot be undone.</strong> Download an export first (Settings → Google Drive &amp; exports) if the marks may still be needed.</p>' +
                  '<div class="btn-row"><input class="text-input privacy-word" id="pvWord" placeholder="Type ERASE to confirm" autocomplete="off"' + (ui.busy ? ' disabled' : '') + '><button class="btn danger sm" type="button" data-pv-run' + (ui.busy ? ' disabled' : '') + '>' + (ui.busy ? 'Working…' : 'Erase now') + '</button></div><p class="small muted" id="pvStep"></p>'
              : '<p class="muted small">Nothing to erase: ' + (plan.sections.length ? 'every student in the chosen sections is still taking the course in an active section, or the sections are empty.' : 'tick at least one archived section.') + '</p>') + '</div>' : '') +
        (ui.result ? '<p class="small" role="status"><strong>Done.</strong> Work erased for ' + plural(ui.result.work, 'course record') + ', grades for ' + plural(ui.result.grades, 'course record') + ', ' + plural(ui.result.students, 'student') + ' deleted.' + (ui.result.failed.length ? ' ⚠️ Could not finish: ' + esc(ui.result.failed.slice(0, 5).join('; ')) : '') + '</p>' : '');
    const txt = (key, label, help, ph) => '<div class="setting-row"><div><label for="pv_' + key + '">' + label + '</label><div class="help">' + help + '</div></div><input class="text-input" id="pv_' + key + '" data-pv-text="' + key + '" maxlength="' + TEXTS[key] + '" value="' + esc(p[key]) + '" placeholder="' + esc(ph || '') + '" style="max-width:340px"></div>';
    return '<p class="muted small">What the school tells people, what it keeps and for how long. The privacy notice reads these settings, so it always says what the app actually does.</p>' +
      (ui.msg ? '<p class="small" role="status"><strong>' + esc(ui.msg) + '</strong></p>' : '') +
      (Privacy.needsReview ? '<p class="privacy-flag" role="note"><strong>Version 66 changed the starting position.</strong> Until you choose otherwise: dictation is off, nothing is deleted automatically, saving to Google Drive is off, and videos, Google files and pictures from other sites are shown as links. Switch on only what your school board allows. This note goes when you save any setting here.</p>' : '') +
      '<h3>Notice of collection</h3><p class="muted small">Ontario\'s privacy law for school boards (MFIPPA, s. 29 (2)) asks that people be told the legal authority for the collection, what the information is for, and the title, business address and telephone number of an officer who can answer questions. Your board\'s privacy office supplies these words.</p>' +
      txt('authority', 'Legal authority for the collection', 'In the board\'s own words, for example the section of the Education Act it relies on.', 'ask your board\'s privacy office') +
      txt('officerTitle', 'Board officer: title', 'The position, not a person\'s name, for example "Freedom of Information and Privacy Coordinator".', '') +
      txt('officerAddress', 'Board officer: business address', '', '') +
      txt('officerPhone', 'Board officer: business telephone', '', '') +
      '<div class="btn-row"><button class="btn secondary sm" type="button" data-pv-texts>Save the notice details</button></div>' +
      '<h3 style="margin-top:1rem">Privacy notice</h3>' +
      '<div class="setting-row"><div><label>The notice</label><div class="help">Shown to everyone from the sign-in screen and from Settings.</div></div><a class="btn secondary sm" href="#/privacy">Open the notice</a></div>' +
      '<div class="setting-row"><div><label for="pvContact">Who to ask about privacy</label><div class="help">One line shown on the notice, for example a name and a school e-mail address or phone number. Leave it empty for "ask your teacher or the school office".</div></div><span class="btn-row"><input class="text-input" id="pvContact" maxlength="200" value="' + esc(p.contact) + '" style="max-width:320px"><button class="btn secondary sm" type="button" data-pv-contact>Save</button></span></div>' +
      sw('data-pv-switch="boardReviewed"', 'The school board has reviewed this notice', 'Off: the notice says it has not yet been reviewed by the school board.', p.boardReviewed) +
      '<h3 style="margin-top:1rem">Dictation</h3>' +
      sw('data-pv-switch="allowDictation"', 'Allow dictation (voice to text)', 'Dictation uses the browser\'s speech service, which sends the audio to Google, Microsoft or Apple, where an automated speech-recognition system (artificial intelligence) turns it into text. Leave it off until your board allows it. On: each person is told before the first use. Off: the 🎤 button disappears for everyone; voice recording, which stays on the device, still works.', p.allowDictation) +
      '<h3 style="margin-top:1rem">Other sites and services</h3><p class="muted small">Each of these lets another organisation see that a device at your school opened something. All are off until you switch them on.</p>' +
      sw('data-pv-switch="allowEmbeds"', 'Show YouTube videos and Google files inside lessons', 'Off: a link that opens in a new tab is shown instead, so nothing is loaded from YouTube or Google unless a person chooses to open it.', p.allowEmbeds) +
      sw('data-pv-switch="allowOutsideMedia"', 'Load pictures, sound and video kept on other websites', 'Off: a link is shown instead. Files a teacher uploads and pictures kept with the app (a folder beside the course file) are not affected and always show.', p.allowOutsideMedia) +
      sw('data-pv-switch="allowDrive"', 'Allow exports to be saved to Google Drive', 'Off: the Push and Pull buttons under Google Drive &amp; exports do nothing. Downloading an export to this computer still works and is written in the change log.', p.allowDrive) +
      '<h3 style="margin-top:1rem">Hold</h3>' +
      sw('data-pv-switch="holdAll"', 'Hold every record in the school', 'On: nothing is deleted by anyone: not by the clean-up, not at the end of term, not by removing a student. Use it during an incident or a legal request, until the board says otherwise. One student\'s records can be held from the Students page (open the student → record tools).', p.holdAll) +
      '<h3 style="margin-top:1rem">How long things are kept</h3><p class="muted small">MFIPPA (s. 30 (1)) requires personal information that has been used to be kept for the period the regulations prescribe, so that the person can ask to see it. The app therefore deletes nothing by itself unless you switch that on. Ask your board for its retention schedule before you do, and set the periods to match it.</p>' +
      sw('data-pv-switch="autoSweep"', 'Delete automatically after the periods below', 'Off (the starting position): nothing is deleted automatically; a forgotten Live Class session is still ended after ' + MAX_SESSION_HOURS + ' hours. On: the clean-up runs once a day when the Headmaster signs in.', p.autoSweep) +
      num('shotDays', 'Problem-report screenshots', 'A screenshot can show a gradebook or a student\'s work. It is removed from the report after this long; the message stays.') +
      num('reportDays', 'Resolved problem reports', 'A report marked resolved is deleted after this long.') +
      num('liveDays', 'Live Class records', 'Where each student was during a session, and ended sessions, are deleted after this long. A session left running is ended after ' + MAX_SESSION_HOURS + ' hours.') +
      '<div class="btn-row"><button class="btn secondary sm" type="button" data-pv-save>Save these periods</button><button class="btn ghost sm" type="button" data-pv-sweep>Run the clean-up now</button></div>' +
      '<p class="muted small" id="pvSweep">' + (p.holdAll ? 'Every record is on hold: the clean-up does nothing. ' : p.autoSweep ? 'The clean-up runs by itself once a day when the Headmaster signs in. ' : 'The clean-up does not run by itself. "Run the clean-up now" applies the periods above once. ') + sweepLine(lsGet(KEY_SWEEP)) + '</p>' +
      '<h3 style="margin-top:1rem">End-of-term clean-up</h3><p class="muted small">Erases the work (slides read, quiz and test results, assignments) and the teacher grades of students in archived sections, for that section\'s course. A student who is still taking the same course in an active section is left alone.</p>' + termBody +
      '<h3 style="margin-top:1rem">Deleting one student</h3><p class="muted small">Students page → open the student → <strong>Remove</strong>. Their profile, work, grades, Focus Plan, Live Class record, problem reports, sign-in code record and, where the app can, the sign-in itself are deleted and you are shown a receipt, including the things this app cannot delete for you (recordings on other devices, export files, paper). A student whose records are on hold cannot be removed.</p>' +
      (Privacy.lastReceipt ? '<div class="btn-row"><button class="btn ghost sm" type="button" data-pv-receipt>Show the last receipt</button></div>' : '');
  };
  /** Wire the Headmaster group. `redraw` redraws the Settings page. */
  Privacy.bind = function (root, redraw) {
    if (!root || !root.querySelector('[data-pv-save]')) return;
    const keepOpen = () => { try { sessionStorage.setItem('learnhub.sg.privacy', '1'); } catch (e) {} };
    sweep(false).catch(() => {});   // device-only mode has no sign-in event
    const again = () => { keepOpen(); if (redraw) redraw(); };
    const say = m => { ui.msg = m; again(); };
    root.querySelectorAll('[data-pv-switch]').forEach(b => b.addEventListener('click', async () => { const k = b.dataset.pvSwitch; try { await savePolicy({ [k]: !Privacy.policy[k] }); ui.msg = ''; } catch (e) { ui.msg = '⚠️ ' + e.message; } again(); }));
    const tx = root.querySelector('[data-pv-texts]'); if (tx) tx.addEventListener('click', async () => { const patch = {}; root.querySelectorAll('[data-pv-text]').forEach(i => { patch[i.dataset.pvText] = i.value; }); try { await savePolicy(patch); say('Saved. The privacy notice now shows these details.'); } catch (e) { say('⚠️ ' + e.message); } });
    const c = root.querySelector('[data-pv-contact]'); if (c) c.addEventListener('click', async () => { try { await savePolicy({ contact: root.querySelector('#pvContact').value }); say('Saved.'); } catch (e) { say('⚠️ ' + e.message); } });
    const s = root.querySelector('[data-pv-save]'); if (s) s.addEventListener('click', async () => {
      const patch = {}; let bad = '';
      Object.keys(LIMITS).forEach(k => { const v = Math.round(+root.querySelector('#pv_' + k).value), lim = LIMITS[k]; if (isNaN(v) || v < lim[0] || v > lim[1]) bad = 'Each period must be a whole number of days inside the range shown.'; patch[k] = v; });
      if (bad) return say('⚠️ ' + bad);
      try { await savePolicy(patch); say('Saved. The privacy notice now shows these periods.'); } catch (e) { say('⚠️ ' + e.message); } });
    const w = root.querySelector('[data-pv-sweep]'); if (w) w.addEventListener('click', async () => { if (Privacy.policy.holdAll) return say('Every record is on hold: nothing was deleted.'); if (!confirm('Delete everything that is past the periods shown (screenshots, resolved reports, Live Class records)? Records of students on hold are left alone. This cannot be undone.')) return; w.disabled = true; w.textContent = 'Working…'; try { await sweep(true); ui.msg = ''; } catch (e) { ui.msg = '⚠️ ' + (e && e.message); } again(); });
    root.querySelectorAll('[data-pv-term]').forEach(b => b.addEventListener('change', () => { ui.termPick[b.dataset.pvTerm] = b.checked; ui.preview = null; ui.result = null; }));
    const al = root.querySelector('[data-pv-also]'); if (al) al.addEventListener('change', () => { ui.termAlso = al.checked; ui.preview = null; ui.result = null; });
    const pv = root.querySelector('[data-pv-preview]'); if (pv) pv.addEventListener('click', () => { ui.preview = termPlan(Object.keys(ui.termPick).filter(k => ui.termPick[k]), ui.termAlso); ui.result = null; ui.msg = ''; again(); });
    const run = root.querySelector('[data-pv-run]'); if (run) run.addEventListener('click', async () => {
      const word = (root.querySelector('#pvWord').value || '').trim();
      if (word !== 'ERASE') { const st = root.querySelector('#pvStep'); if (st) st.textContent = 'Type ERASE (in capitals) in the box to confirm.'; return; }
      const plan = termPlan(Object.keys(ui.termPick).filter(k => ui.termPick[k]), ui.termAlso);   // made again at the last moment, from the rosters as they are now
      ui.busy = true; run.disabled = true; run.textContent = 'Working…';
      const st = root.querySelector('#pvStep');
      try { ui.result = await termRun(plan, (n, total, name) => { if (st) st.textContent = n + ' of ' + total + ' · ' + name; }); ui.msg = ''; }
      catch (e) { ui.msg = '⚠️ ' + (e && e.message); }
      ui.busy = false; ui.preview = null; ui.termPick = {}; again(); });
    const rc = root.querySelector('[data-pv-receipt]'); if (rc) rc.addEventListener('click', () => showReceipt(Privacy.lastReceipt));
  };

  /* ====================== the deletion receipt ====================== */
  function receiptText(r) {
    return 'Summitide Learning — record of deletion\n' + 'Student: ' + (r.name || '(no name)') + (r.number ? ' · number ' + r.number : '') + '\nDeleted: ' + when(r.at) + '\n\nDeleted from the cloud:\n' + r.deleted.map(x => '  - ' + x).join('\n') +
      '\n\nNot deleted by this app (do these by hand):\n' + r.kept.map(x => '  - ' + x).join('\n') + '\n';
  }
  Privacy.receiptText = receiptText;
  function showReceipt(r) {
    if (!r) return;
    const old = document.getElementById('deleteReceipt'); if (old) old.remove();
    const d = document.createElement('div'); d.className = 'learn-overlay'; d.id = 'deleteReceipt'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-label', 'Record of deletion');
    d.innerHTML = '<div class="learn-card privacy-dialog"><h2>🗑️ ' + esc(r.name || 'Student') + ' was deleted</h2><p class="muted small">' + esc(when(r.at)) + (r.number ? ' · student number ' + esc(r.number) : '') + (r.recordings ? ' · ' + plural(r.recordings, 'recording') + ' removed from this device' : '') + '</p>' +
      '<h3>Deleted</h3><ul>' + r.deleted.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' +
      '<h3>Still to do by hand</h3><ul>' + r.kept.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' +
      '<div class="btn-row"><button class="btn secondary" type="button" data-rc-copy>Copy this record</button><button class="btn" type="button" data-rc-close>Close</button></div><p class="small muted" data-rc-msg role="status"></p></div>';
    document.body.appendChild(d);
    const close = () => d.remove();
    d.querySelector('[data-rc-close]').addEventListener('click', close);
    d.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    d.querySelector('[data-rc-copy]').addEventListener('click', async () => { const m = d.querySelector('[data-rc-msg]');
      try { await navigator.clipboard.writeText(receiptText(r)); m.textContent = 'Copied. Paste it into your records.'; } catch (e) { m.textContent = 'Could not copy on this device; select the text above instead.'; } });
    d.querySelector('[data-rc-close]').focus();
  }
  Privacy.showReceipt = showReceipt;
  window.addEventListener('cloud:removed', async e => {
    const r = e.detail; if (!r || !r.id) return;
    try { r.recordings = await forgetOnDevice(r.id); } catch (x) {}
    Privacy.lastReceipt = r;
    if (!Privacy.quiet && !/^demo__/.test(r.id)) showReceipt(r);
  });

  /* ====================== start-up ====================== */
  function onAuth() {
    fetchPolicy().then(() => { if (isHead()) setTimeout(() => { sweep(false).catch(e => console.warn('retention sweep', e)); }, 4000); });
  }
  window.addEventListener('cloud:auth', onAuth);
  if (window.Cloud && Cloud.whenReady) Cloud.whenReady().then(onAuth); else onAuth();
})();
