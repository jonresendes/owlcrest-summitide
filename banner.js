/* =========================================================
   banner.js — v75: a picture across the top of each class.
   The class's teacher (or the Headmaster) uploads one image; everyone in the class sees it at the top of the class
   page and, slimmer, on the class's other pages. With no image the banner is a pale wash with the school crest.

   The image is made small in the browser before it is saved: cropped to a 4 : 1 strip, 1600 × 400, JPEG.
   Cloud:  classBanners/<class id> = { id, data: "data:image/jpeg;base64,…", by, at }
           read by the class's teacher, the Headmaster and the students of the class; written by the teacher or the Headmaster.
           It is its own record (not a field of the class) so the class list every device keeps stays small.
   Device-only mode keeps it in localStorage as learnhub.banner.<class id>.
   A banner is decoration: it must not show students or anyone who has not agreed (the upload panel says so).
   ========================================================= */
(function () {
  const { esc } = window.LH;
  const W = 1600, H = 400, MAX_CHARS = 380000, OK = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;
  const mem = {};            // class id → data address ('' = none); undefined = not asked yet
  const asking = {};
  const cloud = () => !!(window.Cloud && Cloud.enabled && Cloud.db && Cloud.user);
  const key = id => 'learnhub.banner.' + id;
  const clean = v => typeof v === 'string' && v.length <= 400000 && OK.test(v) ? v : '';

  async function fetchOne(id) {
    if (cloud()) { const d = await Cloud.db.collection('classBanners').doc(id).get(); return d.exists ? clean((d.data() || {}).data) : ''; }
    try { return clean(localStorage.getItem(key(id)) || ''); } catch (e) { return ''; }
  }
  /** Paint every banner on the page for this class once its picture is known. */
  function paint(id) {
    document.querySelectorAll('.class-banner[data-banner]').forEach(el => { if (el.dataset.banner !== id) return;
      const pic = mem[id]; el.classList.toggle('has-pic', !!pic); el.classList.toggle('is-plain', !pic);
      const img = el.querySelector('.class-banner-img'); if (img) { if (pic) img.src = pic; else img.removeAttribute('src'); } });
  }
  function load(id) {
    if (mem[id] !== undefined) return paint(id);
    if (asking[id]) return; asking[id] = true;
    fetchOne(id).then(v => { mem[id] = v; }).catch(e => { console.warn('class banner', e && e.code || e); mem[id] = ''; }).then(() => { asking[id] = false; paint(id); });
  }
  /** The banner. `big` on the class page itself; slim elsewhere. `title` and `sub` are drawn over it; `sub` may hold the app's own markup. */
  function html(sec, opts) {
    opts = opts || {}; const id = sec ? sec.id : ''; const pic = id && mem[id];
    const edit = opts.canEdit ? '<button class="btn sm class-banner-edit" data-banner-edit="' + esc(id) + '">' + (pic ? 'Change banner' : 'Add a banner picture') + '</button>' : '';
    return '<div class="class-banner ' + (opts.big ? 'big' : 'slim') + (pic ? ' has-pic' : ' is-plain') + '"' + (id ? ' data-banner="' + esc(id) + '"' : '') + '>' +
      '<img class="class-banner-img" alt=""' + (pic ? ' src="' + esc(pic) + '"' : '') + '><img class="class-banner-crest" src="crest.png" alt="">' +
      '<div class="class-banner-shade"></div><div class="class-banner-text">' + (opts.title ? '<' + (opts.big ? 'h1' : 'div') + ' class="class-banner-title">' + esc(opts.title) + '</' + (opts.big ? 'h1' : 'div') + '>' : '') + (opts.sub ? '<p class="class-banner-sub">' + opts.sub + '</p>' : '') + '</div>' + edit + '</div>';
  }
  /** Call after the page is drawn: fetches the picture if needed and wires the edit button. */
  function bind(root, sec, redraw) {
    if (!sec) return; load(sec.id);
    const b = (root || document).querySelector('[data-banner-edit]'); if (b) b.addEventListener('click', () => editor(sec, redraw));
  }

  /* ---------- choose, crop, save ---------- */
  function draw(canvas, img, pos) {
    const ctx = canvas.getContext('2d'); const s = Math.max(W / img.naturalWidth, H / img.naturalHeight); const w = img.naturalWidth * s, h = img.naturalHeight * s;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H); ctx.drawImage(img, (W - w) / 2, (H - h) * pos, w, h);
  }
  function encode(canvas) { let q = 0.86, out = canvas.toDataURL('image/jpeg', q); while (out.length > MAX_CHARS && q > 0.4) { q -= 0.08; out = canvas.toDataURL('image/jpeg', q); } return out; }
  async function save(sec, data) {
    data = clean(data); if (!data) throw new Error('That picture could not be prepared. Try another one.');
    if (cloud()) { await Cloud.db.collection('classBanners').doc(sec.id).set({ id: sec.id, data, by: String((Students.current || {}).name || '').slice(0, 60), at: new Date().toISOString() }); if (Cloud.log) Cloud.log('class.banner', sec.id, { name: sec.name, what: 'set' }); }
    else localStorage.setItem(key(sec.id), data);
    mem[sec.id] = data;
  }
  async function remove(sec) {
    if (cloud()) { await Cloud.db.collection('classBanners').doc(sec.id).delete(); if (Cloud.log) Cloud.log('class.banner', sec.id, { name: sec.name, what: 'removed' }); }
    else localStorage.removeItem(key(sec.id));
    mem[sec.id] = '';
  }
  const why = e => e && e.code === 'permission-denied' ? 'The cloud refused this. The class banner needs the version 75 security rules: publish the new firestore.rules in the Firebase console, then try again.' : (e && e.message) || String(e);
  function editor(sec, redraw) {
    const old = document.getElementById('bannerDlg'); if (old) old.remove();
    const d = document.createElement('div'); d.id = 'bannerDlg'; d.className = 'modal-back';
    d.innerHTML = '<div class="modal banner-modal" role="dialog" aria-modal="true" aria-labelledby="bnTitle"><h2 id="bnTitle">Banner for ' + esc(sec.name) + '</h2>' +
      '<p class="muted small">A wide picture works best. It is cropped to a strip and made small before it is saved. Everyone in this class sees it. <strong>Use a picture you are allowed to use, and do not use photos of students or of anyone who has not agreed.</strong></p>' +
      '<canvas id="bnCanvas" width="' + W + '" height="' + H + '" class="banner-canvas" aria-label="Preview of the banner"></canvas>' +
      '<div class="btn-row" style="margin-top:0.75rem"><label class="btn secondary">Choose a picture<input type="file" id="bnFile" accept="image/png,image/jpeg,image/webp" hidden></label>' +
      '<label class="banner-pos">Show the <select class="text-input" id="bnPos"><option value="0">top</option><option value="0.5" selected>middle</option><option value="1">bottom</option></select> of the picture</label></div>' +
      '<p class="small" id="bnMsg" role="status" style="min-height:1.2em;margin:0.6rem 0 0"></p>' +
      '<div class="btn-row between" style="margin-top:0.9rem"><div class="btn-row"><button class="btn" id="bnSave" disabled>Save banner</button><button class="btn ghost" id="bnClose">Cancel</button></div>' + (mem[sec.id] ? '<button class="btn ghost sm" id="bnRemove">Remove the picture</button>' : '') + '</div></div>';
    document.body.appendChild(d);
    const $ = s => d.querySelector(s), canvas = $('#bnCanvas'), msg = $('#bnMsg'); let img = null;
    const close = () => d.remove(); const finish = () => { close(); if (redraw) redraw(); else paint(sec.id); };
    const show = () => { if (img) draw(canvas, img, +$('#bnPos').value); };
    if (mem[sec.id]) { const cur = new Image(); cur.onload = () => { if (!img) canvas.getContext('2d').drawImage(cur, 0, 0, W, H); }; cur.src = mem[sec.id]; }
    else { const g = canvas.getContext('2d'); g.fillStyle = '#eef2f8'; g.fillRect(0, 0, W, H); }
    $('#bnFile').addEventListener('change', e => { const f = e.target.files && e.target.files[0]; if (!f) return;
      if (!/^image\/(png|jpeg|webp)$/.test(f.type)) { msg.textContent = 'Choose a PNG, JPEG or WebP picture.'; return; }
      if (f.size > 15 * 1024 * 1024) { msg.textContent = 'That file is over 15 MB. Choose a smaller picture.'; return; }
      const url = URL.createObjectURL(f); const im = new Image();
      im.onload = () => { URL.revokeObjectURL(url); if (im.naturalWidth < 300 || im.naturalHeight < 80) { msg.textContent = 'That picture is too small to stretch across the page.'; return; } img = im; show(); $('#bnSave').disabled = false; msg.textContent = im.naturalWidth < 1000 ? 'This picture is small, so it may look soft when stretched.' : ''; };
      im.onerror = () => { URL.revokeObjectURL(url); msg.textContent = 'That file could not be read as a picture.'; };
      im.src = url; });
    $('#bnPos').addEventListener('change', show);
    $('#bnSave').addEventListener('click', async () => { if (!img) return; $('#bnSave').disabled = true; msg.textContent = 'Saving…';
      try { await save(sec, encode(canvas)); finish(); } catch (e) { msg.textContent = why(e); $('#bnSave').disabled = false; } });
    const rm = $('#bnRemove'); if (rm) rm.addEventListener('click', async () => { if (!confirm('Remove the banner picture from ' + sec.name + '? The class goes back to the plain school banner.')) return; try { await remove(sec); finish(); } catch (e) { msg.textContent = why(e); } });
    $('#bnClose').addEventListener('click', close); d.addEventListener('click', e => { if (e.target === d) close(); });
    d.addEventListener('keydown', e => { if (e.key === 'Escape') close(); }); $('#bnClose').focus();
  }
  /** When a class is deleted its banner goes with it (called by cloud.js). */
  function forget(id) { delete mem[id]; try { localStorage.removeItem(key(id)); } catch (e) {} }

  window.Banner = { html, bind, load, forget };
})();
