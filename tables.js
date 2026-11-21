/* Tables (v63): print, CSV and Word for any table of data.

   Why: a wide table on screen sits in a box that scrolls sideways. Printed as it stands, the paper shows the
   box — scroll bar and all — and everything to the right of it is cut off.

   What this file does:
   1. PRINTING. Before any print (the browser's own Print, Ctrl+P, or a Print button), every table on the page
      is measured at print size. A table that fits is left alone. One that is a little too wide is shrunk to
      fit. One that is much too wide is printed as several tables, each repeating the first column (the
      names), so every column is on paper. The page turns to landscape when a table needs it.
   2. PRINT ONE TABLE. Tables.printSheet(...) prints just the chosen table(s) with a title, not the whole page.
   3. FILES. Tables.downloadCsv(...) (opens in Excel, Google Sheets, Numbers) and Tables.downloadDocx(...)
      (a real .docx made here in the browser: opens in Word, Google Docs, Pages). Nothing is sent anywhere.
   4. A small "Print · CSV · Word" bar above data tables for staff (window.Tables.decorate).

   A cell may carry data-export="…" to say exactly what goes in a file; otherwise the text on screen is used
   (typed values for inputs; buttons left out). Everything written to a file is plain text. */
(function () {
  const PORTRAIT = 700, LANDSCAPE = 960;     // usable width in CSS px on Letter and A4 with 12 mm margins
  const esc = s => String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const INLINE = /^(B|STRONG|EM|I|U|A|SMALL|CODE|SUB|SUP|MARK|S)$/;

  /* ---------- reading a table ---------- */
  function cellText(cell) {
    if (!cell) return '';
    if (cell.dataset && cell.dataset.export !== undefined) return String(cell.dataset.export);
    const out = [];
    (function walk(n) {
      if (n.nodeType === 3) { out.push(n.nodeValue); return; }
      if (n.nodeType !== 1) return;
      const tag = n.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'BUTTON' || n.classList.contains('no-export')) return;
      if (tag === 'INPUT') { out.push(' ' + (n.type === 'checkbox' || n.type === 'radio' ? (n.checked ? 'yes' : 'no') : n.value) + ' '); return; }
      if (tag === 'TEXTAREA') { out.push(' ' + n.value + ' '); return; }
      if (tag === 'SELECT') { const o = n.options[n.selectedIndex]; out.push(' ' + (o ? o.textContent : '') + ' '); return; }
      const gap = !INLINE.test(tag) && n !== cell;
      if (gap) out.push(' ');
      n.childNodes.forEach(walk);
      if (gap) out.push(' ');
    })(cell);
    return out.join('').replace(/\s+/g, ' ').trim();
  }
  /** Rows of cells → a full grid, with spanning cells in every square they cover. */
  function gridOf(trs) {
    const grid = trs.map(() => []);
    trs.forEach((tr, r) => { let c = 0;
      Array.from(tr.cells).forEach(cell => { while (grid[r][c]) c++;
        const rs = Math.max(1, cell.rowSpan || 1), cs = Math.max(1, cell.colSpan || 1);
        for (let i = 0; i < rs && r + i < trs.length; i++) for (let j = 0; j < cs; j++) grid[r + i][c + j] = { cell, first: i === 0 && j === 0, top: i === 0, left: j === 0 };
        c += cs; }); });
    return grid;
  }
  /** { head: [label per column], rows: [[text]], grid, h (header rows), n (columns) } */
  function model(table) {
    const trs = Array.from(table.rows);
    let h = 0; while (h < trs.length && (trs[h].parentNode.tagName === 'THEAD' || (trs[h].cells.length && Array.from(trs[h].cells).every(c => c.tagName === 'TH')))) h++;
    if (h === trs.length && trs.length) h = Math.min(h, trs.length - 1);   // a table of headings only: keep a body
    const grid = gridOf(trs); const n = grid.reduce((m, r) => Math.max(m, r.length), 0);
    const head = [];
    for (let c = 0; c < n; c++) { const parts = []; for (let r = 0; r < h; r++) { const g = grid[r][c]; const t = g ? cellText(g.cell) : ''; if (t && parts[parts.length - 1] !== t) parts.push(t); } head.push(parts.join(' · ')); }
    const rows = [];
    for (let r = h; r < grid.length; r++) { const row = []; for (let c = 0; c < n; c++) { const g = grid[r][c]; row.push(g && g.first ? cellText(g.cell) : ''); } rows.push(row); }
    return { head, rows, grid, h, n, table };
  }
  /** A model from plain data (for reports that are not on screen). */
  function modelOf(head, rows) { return { head: head.map(String), rows: rows.map(r => r.map(v => v === undefined || v === null ? '' : String(v))), n: head.length, h: 1, grid: null, table: null }; }

  /* ---------- names and titles ---------- */
  const text = el => el ? el.textContent.replace(/\s+/g, ' ').trim().replace(/^[^\p{L}\p{N}(]+/u, '') : '';   // without the picture in front of a heading
  function titleFor(table) {
    if (table.dataset.title) return table.dataset.title;
    const page = text(document.querySelector('#app h1'));
    const det = table.closest('details'); const card = table.closest('.card');
    const near = text(det && det.querySelector('summary h2, summary h3, summary strong')) || text(card && card.querySelector('h2, h3'));
    return [page, near].filter(Boolean).join(' — ') || 'Table';
  }
  function subFor() { const p = text(document.querySelector('#app .page-head p.muted')); return p && p.length <= 140 ? p : ''; }
  function fileName(title, ext) {
    const base = String(title || 'table').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60).toLowerCase() || 'table';
    const d = new Date(); const pad = x => String(x).padStart(2, '0');
    return 'summitide-' + base + '-' + d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + '.' + ext;
  }
  function save(name, blob) {
    const a = document.createElement('a'); const url = URL.createObjectURL(blob);
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  const asList = x => Array.isArray(x) ? x : [x];
  /** Sections in: a table, a list of tables, or [{ heading, table | model }]. Out: [{ heading, model }]. */
  function sectionsOf(what) {
    return asList(what).filter(Boolean).map(s => {
      if (s.tagName === 'TABLE') return { heading: '', model: model(s) };
      return { heading: s.heading || '', model: s.model || model(s.table) };
    }).filter(s => s.model.n);
  }

  /* ---------- CSV ---------- */
  // A cell that a spreadsheet would run as a formula gets an apostrophe in front, so it stays text.
  function csvCell(v) {
    let s = String(v === undefined || v === null ? '' : v);
    if (/^[=+@\t\r]/.test(s) || (/^-/.test(s) && !/^-\d+([.,]\d+)?%?$/.test(s))) s = "'" + s;
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function csvText(what, opt) {
    opt = opt || {}; const lines = [];
    const many = sectionsOf(what);
    if (opt.title) lines.push(csvCell(opt.title));
    (opt.facts || []).forEach(f => lines.push([f[0], f[1]].map(csvCell).join(',')));
    if (lines.length) lines.push('');
    many.forEach((s, i) => {
      if (i) lines.push('');
      if (s.heading) lines.push(csvCell(s.heading));
      if (s.model.head.some(Boolean)) lines.push(s.model.head.map(csvCell).join(','));
      s.model.rows.forEach(r => lines.push(r.map(csvCell).join(',')));
    });
    if (opt.notes) { lines.push(''); lines.push(csvCell(opt.notesHeading || 'Notes')); String(opt.notes).split(/\r?\n/).forEach(l => lines.push(csvCell(l))); }
    return '﻿' + lines.join('\r\n') + '\r\n';     // the mark at the front makes Excel read accents and symbols correctly
  }
  function downloadCsv(what, opt) { opt = opt || {}; save(fileName(opt.file || opt.title, 'csv'), new Blob([csvText(what, opt)], { type: 'text/csv;charset=utf-8' })); }

  /* ---------- Word (.docx) ---------- */
  const xml = s => String(s === undefined || s === null ? '' : s).replace(/[^\x09\x0A\x0D\x20-퟿-�\u{10000}-\u{10FFFF}]/gu, '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function run(t, o) { o = o || {}; return '<w:r><w:rPr>' + (o.b ? '<w:b/>' : '') + (o.i ? '<w:i/>' : '') + (o.color ? '<w:color w:val="' + o.color + '"/>' : '') + (o.sz ? '<w:sz w:val="' + o.sz + '"/><w:szCs w:val="' + o.sz + '"/>' : '') + '</w:rPr><w:t xml:space="preserve">' + xml(t) + '</w:t></w:r>'; }
  function para(t, o) { o = o || {}; return '<w:p><w:pPr><w:spacing w:before="' + (o.before || 0) + '" w:after="' + (o.after === undefined ? 80 : o.after) + '"/>' + (o.keep ? '<w:keepNext/>' : '') + '</w:pPr>' + (t === '' ? '' : run(t, o)) + '</w:p>'; }
  function docxTable(head, rows, widths) {
    const border = n => '<w:' + n + ' w:val="single" w:sz="4" w:space="0" w:color="8A8F99"/>';
    const tc = (t, w, o) => '<w:tc><w:tcPr><w:tcW w:w="' + w + '" w:type="dxa"/>' + (o.fill ? '<w:shd w:val="clear" w:color="auto" w:fill="' + o.fill + '"/>' : '') + '</w:tcPr><w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr>' + (t === '' ? '' : run(t, { b: o.b, sz: o.sz })) + '</w:p></w:tc>';
    const sz = widths.length > 9 ? 15 : widths.length > 6 ? 17 : 19;
    let out = '<w:tbl><w:tblPr><w:tblW w:w="' + widths.reduce((a, b) => a + b, 0) + '" w:type="dxa"/><w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(border).join('') + '</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="70" w:type="dxa"/><w:right w:w="70" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>' + widths.map(w => '<w:gridCol w:w="' + w + '"/>').join('') + '</w:tblGrid>';
    if (head.some(Boolean)) out += '<w:tr><w:trPr><w:cantSplit/><w:tblHeader/></w:trPr>' + head.map((t, i) => tc(t, widths[i], { b: true, fill: 'E3E8F2', sz })).join('') + '</w:tr>';
    rows.forEach(r => { out += '<w:tr><w:trPr><w:cantSplit/></w:trPr>' + widths.map((w, i) => tc(r[i] === undefined ? '' : r[i], w, { b: i === 0 && widths.length > 2, sz })).join('') + '</w:tr>'; });
    return out + '</w:tbl>';
  }
  /** Columns for one table on one page width: a wide table becomes several, each repeating the first column. */
  function columnGroups(n, perPage) {
    if (n <= perPage) return [Array.from({ length: n }, (_, i) => i)];
    const groups = []; for (let c = 1; c < n; c += perPage - 1) { const g = [0]; for (let k = c; k < Math.min(n, c + perPage - 1); k++) g.push(k); groups.push(g); }
    return groups;
  }
  function docxBlob(what, opt) {
    opt = opt || {}; const many = sectionsOf(what);
    const widest = many.reduce((m, s) => Math.max(m, s.model.n), 0);
    const land = widest > 6; const usable = land ? 14400 : 10800; const perPage = land ? 13 : 7;
    let body = '';
    body += para('Summitide Learning · OwlCrest Academy', { sz: 16, color: '5B6472', after: 40 });
    if (opt.title) body += para(opt.title, { b: true, sz: 30, after: 60 });
    if (opt.sub) body += para(opt.sub, { sz: 20, color: '444B57', after: 120 });
    (opt.facts || []).forEach(f => { body += '<w:p><w:pPr><w:spacing w:before="0" w:after="20"/></w:pPr>' + run(f[0] + ': ', { b: true, sz: 20 }) + run(f[1], { sz: 20 }) + '</w:p>'; });
    if ((opt.facts || []).length) body += para('', { after: 80 });
    many.forEach(s => {
      const m = s.model; const groups = columnGroups(m.n, perPage);
      groups.forEach((g, gi) => {
        const label = (s.heading || '') + (groups.length > 1 ? (s.heading ? ' · part ' : 'Part ') + (gi + 1) + ' of ' + groups.length : '');
        if (label) body += para(label, { b: true, sz: 22, before: 160, after: 60, keep: true });
        const unit = Math.floor(usable / (g.length + (g.length > 2 ? 1 : 0)));
        const widths = g.map((c, i) => i === 0 && g.length > 2 ? unit * 2 : unit);
        body += docxTable(g.map(c => m.head[c] || ''), m.rows.map(r => g.map(c => r[c])), widths);
        body += para('', { after: 60 });
      });
    });
    if (opt.notes !== undefined && opt.notes !== null) {
      body += para(opt.notesHeading || 'Notes', { b: true, sz: 22, before: 160, after: 60, keep: true });
      const lines = String(opt.notes).split(/\r?\n/); (lines.join('').trim() ? lines : ['(none)']).forEach(l => { body += para(l, { sz: 20, after: 40 }); });
    }
    if (opt.footer) body += para(opt.footer, { sz: 15, color: '5B6472', before: 200 });
    const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
    const doc = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ' + W + '><w:body>' + body +
      '<w:sectPr>' + (land ? '<w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/>' : '<w:pgSz w:w="12240" w:h="15840"/>') + '<w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="360" w:footer="360" w:gutter="0"/></w:sectPr></w:body></w:document>';
    const styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ' + W + '><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="en-CA"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="80"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>';
    const types = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>';
    const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
    const docRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
    return new Blob([zip([['[Content_Types].xml', types], ['_rels/.rels', rels], ['word/document.xml', doc], ['word/_rels/document.xml.rels', docRels], ['word/styles.xml', styles]])], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }
  function downloadDocx(what, opt) { opt = opt || {}; save(fileName(opt.file || opt.title, 'docx'), docxBlob(what, opt)); }

  /* A .docx is a zip of a few XML files. This writes one without compression: small, and no library needed. */
  let crcTable = null;
  function crc32(bytes) {
    if (!crcTable) { crcTable = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; } }
    let c = 0xFFFFFFFF; for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function zip(files) {
    const enc = new TextEncoder(); const parts = []; const central = []; let offset = 0;
    const d = new Date(); const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1); const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    files.forEach(([name, content]) => {
      const nm = enc.encode(name), data = enc.encode(content), crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true); lh.setUint16(10, time, true); lh.setUint16(12, date, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, nm.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), nm, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true); ch.setUint16(12, time, true); ch.setUint16(14, date, true);
      ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, nm.length, true); ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), nm);
      offset += 30 + nm.length + data.length;
    });
    const csize = central.reduce((n, p) => n + p.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, csize, true); end.setUint32(16, offset, true);
    const all = parts.concat(central, [new Uint8Array(end.buffer)]); const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0)); let at = 0;
    all.forEach(p => { out.set(p, at); at += p.length; });
    return out;
  }

  /* ---------- printing ---------- */
  /** A copy of a cell's content that is safe on paper: typed values as text, no buttons, links as plain text. */
  function printCell(src, tag, colSpan) {
    const el = document.createElement(tag);
    if (src) {
      el.className = src.className;
      src.childNodes.forEach(n => el.appendChild(n.cloneNode(true)));
      const live = src.querySelectorAll('input, textarea, select'); const copies = el.querySelectorAll('input, textarea, select');
      copies.forEach((c, i) => { const o = live[i]; let v = '';
        if (o.tagName === 'SELECT') { const op = o.options[o.selectedIndex]; v = op ? op.textContent : ''; } else if (o.type === 'checkbox' || o.type === 'radio') v = o.checked ? '☑' : '☐'; else v = o.value;
        const s = document.createElement('span'); s.className = 'pt-val'; s.textContent = v === '' ? '–' : v; c.replaceWith(s); });
      el.querySelectorAll('button, .no-print, script, style').forEach(b => b.remove());
      el.querySelectorAll('a').forEach(a => { const s = document.createElement('span'); while (a.firstChild) s.appendChild(a.firstChild); a.replaceWith(s); });
      el.querySelectorAll('[id]').forEach(x => x.removeAttribute('id'));
      el.querySelectorAll('[title]').forEach(x => x.removeAttribute('title'));
    }
    if (colSpan > 1) el.colSpan = colSpan;
    return el;
  }
  /** One printable table from a model, for the given columns. */
  function buildTable(m, cols) {
    const t = document.createElement('table'); t.className = ((m.table && m.table.className) || '') + ' pt';
    if (m.head.some(Boolean)) { const th = t.createTHead().insertRow(); cols.forEach(c => { const cell = document.createElement('th'); cell.textContent = m.head[c] || ''; th.appendChild(cell); }); }
    const tb = t.createTBody();
    m.rows.forEach((row, ri) => { const tr = tb.insertRow();
      for (let i = 0; i < cols.length; i++) { const c = cols[i];
        const g = m.grid ? m.grid[m.h + ri][c] : null;
        if (!m.grid) { const td = document.createElement('td'); td.textContent = row[c]; tr.appendChild(td); continue; }
        if (!g) { tr.appendChild(document.createElement('td')); continue; }
        if (!g.top) { tr.appendChild(document.createElement('td')); continue; }           // lower part of a tall cell: left blank
        if (!g.left && i > 0 && m.grid[m.h + ri][cols[i - 1]] && m.grid[m.h + ri][cols[i - 1]].cell === g.cell) continue;   // already covered by the wide cell before it
        let span = 1; while (i + span < cols.length && m.grid[m.h + ri][cols[i + span]] && m.grid[m.h + ri][cols[i + span]].cell === g.cell) span++;
        tr.appendChild(printCell(g.cell, g.cell.tagName === 'TH' ? 'th' : 'td', span));
      } });
    return t;
  }
  function measureHost() {
    let h = document.getElementById('ptMeasure');
    if (!h) { h = document.createElement('div'); h.id = 'ptMeasure'; h.className = 'pt-measure'; h.setAttribute('aria-hidden', 'true'); document.body.appendChild(h); }
    return h;
  }
  const FONT = 10.5, FONT_MIN = 7.5, FONT_SPLIT = 9;     // px; a table is printed smaller before it is split
  const widthOf = t => t.getBoundingClientRect().width;
  /** Smallest width a table can take (text wrapped where it may wrap) and the width it would like. */
  function sizes(t) {
    const host = measureHost(); host.appendChild(t);
    t.style.width = 'auto'; const natural = widthOf(t);
    t.style.width = '10px'; const min = widthOf(t);
    const cols = []; Array.from(t.rows).forEach(tr => { let c = 0; Array.from(tr.cells).forEach(cell => { const cs = cell.colSpan || 1; if (cs === 1) cols[c] = Math.max(cols[c] || 0, cell.getBoundingClientRect().width); c += cs; }); });
    t.style.width = ''; t.remove();
    return { natural, min, cols };
  }
  /** Make one table fit the paper by letting text wrap, then by smaller print. True when it fits. */
  function fit(t, avail) {
    for (let fs = FONT; fs >= FONT_MIN - 0.01; fs -= 0.5) {
      t.style.fontSize = fs + 'px'; const z = sizes(t);
      if (z.min <= avail + 0.5) { t.style.width = z.natural <= avail ? 'auto' : '100%'; return true; }
    }
    return false;
  }
  /** How wide a model wants to be at normal print size (to choose portrait or landscape). */
  function need(m) { const t = buildTable(m, Array.from({ length: m.n }, (_, i) => i)); t.style.fontSize = FONT + 'px'; return sizes(t).min; }
  /** The table(s) to put on paper for one model, given the width of the paper. */
  function printable(m, avail) {
    const all = Array.from({ length: m.n }, (_, i) => i);
    const wrap = document.createElement('div'); wrap.className = 'pt-wrap';
    const whole = buildTable(m, all);
    if (fit(whole, avail) || m.n <= 3) { wrap.appendChild(whole); return wrap; }
    // too wide even in small print: several tables, each starting with the first column
    whole.style.fontSize = FONT_SPLIT + 'px'; const w = sizes(whole).cols;
    const groups = []; let cur = [0], used = w[0] || 0;
    for (let c = 1; c < m.n; c++) { const cw = w[c] || 0; if (cur.length > 1 && used + cw > avail - 2) { groups.push(cur); cur = [0]; used = w[0] || 0; } cur.push(c); used += cw; }
    if (cur.length > 1) groups.push(cur);
    groups.forEach((g, i) => { const cap = document.createElement('div'); cap.className = 'pt-part'; cap.textContent = 'Part ' + (i + 1) + ' of ' + groups.length + ' · columns ' + g[1] + ' to ' + g[g.length - 1] + ' of ' + (m.n - 1);
      const t = buildTable(m, g); t.style.fontSize = FONT_SPLIT + 'px'; const z = sizes(t);
      if (z.min > avail + 0.5) fit(t, avail); else t.style.width = z.natural <= avail ? 'auto' : '100%';
      const block = document.createElement('div'); block.className = 'pt-block'; block.appendChild(cap); block.appendChild(t); wrap.appendChild(block); });
    return wrap;
  }
  function pageStyle(landscape) {
    let s = document.getElementById('ptPage'); if (!s) { s = document.createElement('style'); s.id = 'ptPage'; document.head.appendChild(s); }
    s.textContent = landscape ? '@page { size: landscape; margin: 12mm; }' : '@page { margin: 12mm; }';
  }
  function cleanup() {
    document.querySelectorAll('.pt-wrap.pt-inplace').forEach(x => x.remove());
    document.querySelectorAll('.pt-hide').forEach(x => x.classList.remove('pt-hide'));
    const s = document.getElementById('ptPage'); if (s) s.remove();
    const sheet = document.getElementById('printSheet'); if (sheet) sheet.remove();
    document.body.classList.remove('sheet-printing');
  }
  /** How much narrower than the page the place a table sits in is (cards and boxes with padding around it). */
  function insetOf(el) {
    try { const app = document.getElementById('app'), par = el.parentNode; const pad = x => { const c = getComputedStyle(x); return (parseFloat(c.paddingLeft) || 0) + (parseFloat(c.paddingRight) || 0); };
      return Math.max(0, Math.min(260, (app.clientWidth - pad(app)) - (par.clientWidth - pad(par)))); } catch (e) { return 0; }
  }
  /** Before the browser prints the page as it is: swap in a printable copy of every table that would not fit. */
  function prepare() {
    if (document.body.classList.contains('sheet-printing')) return;
    cleanup();
    const tables = Array.from(document.querySelectorAll('#app table')).filter(t => t.rows.length && t.offsetParent !== null && !t.closest('.pt-wrap, .no-print-fix'));
    if (!tables.length) return;
    const jobs = tables.map(t => { const m = model(t); if (!m.n) return null; return { t, m, need: need(m) }; }).filter(Boolean);
    jobs.forEach(j => { j.box = j.t.closest('.d-wrap, .table-wrap') || j.t; j.inset = insetOf(j.box); });
    const landscape = jobs.some(j => j.need > (PORTRAIT - j.inset) * 0.8);
    jobs.forEach(j => { const avail = (landscape ? LANDSCAPE : PORTRAIT) - j.inset - 6;
      if (j.need <= avail * 0.8 && j.box === j.t) return;      // fits with room to spare and is not in a scrolling box: print it as it is
      const wrap = printable(j.m, avail); wrap.classList.add('pt-inplace');
      j.box.parentNode.insertBefore(wrap, j.box.nextSibling); j.box.classList.add('pt-hide'); });
    if (landscape) pageStyle(true);
  }
  window.addEventListener('beforeprint', () => { try { prepare(); } catch (e) { console.warn('print prepare', e); } });
  window.addEventListener('afterprint', () => { try { cleanup(); } catch (e) {} });

  /** Print only these tables, with a title: { title, sub, facts: [[label, value]], sections, notes, footer }. */
  function buildSheet(what, opt) {
    opt = opt || {}; cleanup();
    const many = sectionsOf(what);
    const landscape = many.some(s => need(s.model) > PORTRAIT);
    const avail = landscape ? LANDSCAPE : PORTRAIT;
    const sheet = document.createElement('div'); sheet.id = 'printSheet'; sheet.className = 'print-sheet';
    sheet.innerHTML = '<header class="ps-head"><img src="crest.png" alt="" class="ps-crest"><div><div class="ps-brand">Summitide Learning · OwlCrest Academy</div><h1>' + esc(opt.title || 'Table') + '</h1>' + (opt.sub ? '<div class="ps-sub">' + esc(opt.sub) + '</div>' : '') + '</div></header>' +
      ((opt.facts || []).length ? '<dl class="ps-facts">' + opt.facts.map(f => '<div><dt>' + esc(f[0]) + '</dt><dd>' + esc(f[1]) + '</dd></div>').join('') + '</dl>' : '');
    many.forEach((s, i) => { if (s.heading) { const h = document.createElement('h2'); h.textContent = s.heading; sheet.appendChild(h); } sheet.appendChild(printable(s.model, avail)); });
    if (opt.notes !== undefined && opt.notes !== null) { const n = document.createElement('div'); n.className = 'ps-notes'; n.innerHTML = '<h2>' + esc(opt.notesHeading || 'Notes') + '</h2>'; const p = document.createElement('div'); p.className = 'ps-notes-text'; p.textContent = String(opt.notes).trim() || '(none)'; n.appendChild(p); sheet.appendChild(n); }
    const f = document.createElement('footer'); f.className = 'ps-foot'; f.textContent = (opt.footer ? opt.footer + ' · ' : '') + 'Printed ' + new Date().toLocaleString();
    sheet.appendChild(f);
    document.body.appendChild(sheet); document.body.classList.add('sheet-printing'); pageStyle(landscape);
    return sheet;
  }
  function printSheet(what, opt) {
    buildSheet(what, opt);
    // let the crest load and the layout settle, then print; the sheet is taken away when printing ends
    setTimeout(() => { try { window.print(); } finally { if (!('onafterprint' in window)) cleanup(); } }, 60);
  }

  /* ---------- the small bar above data tables (staff) ---------- */
  const BAR = '<span class="muted small">This table:</span><button type="button" class="btn ghost sm" data-tt="print" title="Print just this table, every column">🖨️ Print</button><button type="button" class="btn ghost sm" data-tt="csv" title="A file for Excel, Google Sheets or Numbers">⬇️ CSV</button><button type="button" class="btn ghost sm" data-tt="docx" title="A document for Word, Google Docs or Pages">📄 Word</button>';
  function decorate() {
    const root = document.getElementById('app'); if (!root) return;
    if (!(window.Students && window.Students.isStaffSession)) return;
    root.querySelectorAll('.d-wrap > table, .table-wrap > table').forEach(t => {
      const box = t.parentNode; if (box.dataset.tt || t.closest('.no-table-tools, .pt-wrap, .print-doc') || t.rows.length < 2) return;
      box.dataset.tt = '1';
      const bar = document.createElement('div'); bar.className = 'table-tools'; bar.innerHTML = BAR; box.parentNode.insertBefore(bar, box);
    });
  }
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('.table-tools [data-tt]'); if (!b) return;
    const box = b.parentNode.nextElementSibling; const t = box && (box.tagName === 'TABLE' ? box : box.querySelector('table')); if (!t) return;
    e.preventDefault(); e.stopPropagation();
    const opt = { title: titleFor(t), sub: subFor() };
    try { if (b.dataset.tt === 'print') printSheet(t, opt); else if (b.dataset.tt === 'csv') downloadCsv(t, opt); else downloadDocx(t, opt); }
    catch (err) { console.error(err); alert('That did not work: ' + (err && err.message || err)); }
  });
  function watch() {
    const root = document.getElementById('app'); if (!root || !window.MutationObserver) return;
    let queued = false;
    new MutationObserver(() => { if (queued) return; queued = true; setTimeout(() => { queued = false; try { decorate(); } catch (e) { console.warn('table tools', e); } }, 80); }).observe(root, { childList: true, subtree: true });
    decorate();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();

  window.Tables = { model, modelOf, cellText, csvText, downloadCsv, docxBlob, downloadDocx, printSheet, buildSheet, prepare, cleanup, decorate, titleFor, PORTRAIT, LANDSCAPE };
})();
