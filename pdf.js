'use strict';
/* PDF documents made on the phone, so they work offline and in every language. Each page is laid out and drawn on a canvas with the
   phone's own fonts (so every script, right-to-left text and joined-up letters come out right) and kept in the PDF as a picture of
   the page. Pages are A4, or US Letter where that is the paper people use.

   Pdf.make(blocks, options) lays out a list of blocks:
     { h: 1 | 2 | 3, text }                  a heading (each stays with what follows it)
     { p: text, muted, bold, size }          a paragraph
     { kv: [[name, value], …] }              names and values in two columns
     { table: { caption, cols: [{ w, align }], head: [...], rows: [[...], …] } }   a table: column widths are shares of the line,
                                             and the caption and head repeat on every page the table runs onto
     { gap: points }
   and resolves to { bytes (the PDF file), pages, text (the lines written on each page) }. */
const Pdf = (() => {
  const SIZE = { a4: [595.28, 841.89], letter: [612, 792] };
  const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "Helvetica Neue", Arial, sans-serif';
  const M = { x: 42, top: 44, bottom: 50 }, INK = '#1d1a16', MUTE = '#6b6259', LINE = '#d6cec2', SHADE = '#f4efe7', PAD = 4;
  /** The direction of a text by its first letter (a note typed in English stays left to right in an Arabic report), or null. */
  const own = s => { for (const ch of s) { if (/[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufefc]/.test(ch)) return 'rtl'; if (/\p{L}/u.test(ch)) return 'ltr'; } return null; };
  const STYLE = { 1: [19, 700, 1.25, 4], 2: [13, 700, 1.3, 4], 3: [10.5, 700, 1.3, 2] };   // size, weight, line height, space after

  /** The text in lines no wider than `w` (in the context's font). Lines break between words, or between characters in scripts
      written without spaces (Intl.Segmenter knows where words end in Thai, Chinese and Japanese). */
  function wrap(ctx, text, w, seg) {
    const lines = [], all = String(text == null ? '' : text);
    if (!all.includes('\n') && ctx.measureText(all).width <= w) return [all];   // (most texts fit on one line)
    for (const para of all.split('\n')) {
      const parts = seg ? Array.from(seg.segment(para), s => s.segment) : para.split(/(?<=\s)/);
      let line = '';
      const push = () => { lines.push(line.trimEnd()); line = ''; };
      for (const part of parts) {
        if (ctx.measureText(line + part).width <= w) { line += part; continue; }
        if (line.trim()) push();
        if (ctx.measureText(part).width <= w) { line = part.trimStart(); continue; }
        for (const ch of Array.from(part)) { if (line && ctx.measureText(line + ch).width > w) push(); line += ch; }   // a word wider than the line
      }
      push();
    }
    return lines;
  }

  /** Lays out (and, when `draw`, draws) every block: the pages (each a JPEG when drawing, made as soon as the page is full so only
      one page is in memory at a time) and the text on each. */
  async function layout(blocks, o, draw, total) {
    const [W, H] = SIZE[o.size] || SIZE.a4, k = o.dpi / 72, CW = W - 2 * M.x, bottom = H - M.bottom;
    let seg = null; try { seg = new Intl.Segmenter(o.lang, { granularity: 'word' }); } catch (e) { /* an older phone: break at spaces */ }
    const measure = document.createElement('canvas').getContext('2d'), pages = [], text = [];
    let ctx = measure, y = 0;
    const font = (size, weight = 400) => { ctx.font = `${weight} ${size}px ${FONT}`; };
    const X = (x, w) => (o.rtl ? W - x - w : x);   // a box [x, x + w] measured from the start side, placed on the page
    /** One line of text in the box [x, x + w] (from the start side), on the baseline `base`. */
    const put = (s, x, w, base, align = 'start') => {
      text[text.length - 1].push(s);
      if (!draw) return;
      const left = X(x, w), side = align === 'center' ? 'center' : (align === 'start') !== o.rtl ? 'left' : 'right';
      ctx.direction = own(s) || (o.rtl ? 'rtl' : 'ltr'); ctx.textAlign = side;
      ctx.fillText(s, side === 'center' ? left + w / 2 : side === 'left' ? left : left + w, base);
    };
    let canvas = null;
    const finish = async () => {
      if (!draw) return;
      const n = pages.length + 1;
      font(7.5); ctx.fillStyle = MUTE;
      ctx.fillRect(M.x, H - M.bottom + 14, CW, 0.5);
      put(o.footer(n, total), M.x, CW, H - M.bottom + 28, 'start');
      if (n > 1 && o.header) put(o.header, M.x, CW, M.top - 18, 'start');
      const blob = await new Promise(done => canvas.toBlob(done, 'image/jpeg', o.quality));
      pages.push({ bytes: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height });
      canvas.width = canvas.height = 0;   // (the phone has the memory back)
    };
    const newPage = async () => {
      if (text.length) { if (draw) await finish(); else pages.push(null); }
      if (draw) {
        canvas = document.createElement('canvas'); canvas.width = Math.round(W * k); canvas.height = Math.round(H * k); canvas.dir = o.rtl ? 'rtl' : 'ltr';
        ctx = canvas.getContext('2d', { alpha: false }); ctx.setTransform(k, 0, 0, k, 0, 0); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
        ctx.direction = o.rtl ? 'rtl' : 'ltr'; ctx.textBaseline = 'alphabetic';
      }
      text.push([]); y = M.top;
    };
    /** Makes room for `h` points, on a new page if this one is full. */
    const room = async h => { if (y + h > bottom && y > M.top) await newPage(); };
    await newPage();
    for (const b of blocks) {
      if (b.gap) { y += b.gap; continue; }
      if (b.h) {
        const [size, weight, lh, after] = STYLE[b.h];
        font(size, weight); const lines = wrap(ctx, b.text, CW, seg);
        await room(lines.length * size * lh + (b.h === 1 ? 0 : 6) + 40);   // (and a few lines of what follows)
        if (b.h === 2 && y > M.top) y += 8;
        font(size, weight); if (draw) ctx.fillStyle = INK;
        for (const l of lines) { put(l, M.x, CW, y + size, 'start'); y += size * lh; }
        if (b.h === 2 && draw) { ctx.fillStyle = LINE; ctx.fillRect(M.x, y + 1, CW, 0.8); }
        y += after + (b.h === 2 ? 4 : 0);
        continue;
      }
      if (b.p != null) {
        const size = b.size || 9.5, lh = size * 1.42;
        font(size, b.bold ? 700 : 400);
        for (const l of wrap(ctx, b.p, CW, seg)) { await room(lh); font(size, b.bold ? 700 : 400); if (draw) ctx.fillStyle = b.muted ? MUTE : INK; put(l, M.x, CW, y + size, 'start'); y += lh; }
        y += 4;
        continue;
      }
      if (b.kv) {
        const size = 9.5, lh = size * 1.42, nw = CW * 0.4, vw = CW - nw - 8;
        for (const [name, value] of b.kv) {
          font(size); const n = wrap(ctx, name, nw, seg); font(size, 600); const v = wrap(ctx, value, vw, seg);
          const h = Math.max(n.length, v.length) * lh + 3;
          await room(h);
          font(size); if (draw) ctx.fillStyle = MUTE; n.forEach((l, i) => put(l, M.x, nw, y + size + i * lh, 'start'));
          font(size, 600); if (draw) ctx.fillStyle = INK; v.forEach((l, i) => put(l, M.x + nw + 8, vw, y + size + i * lh, 'start'));
          y += h;
        }
        y += 4;
        continue;
      }
      if (b.imgs) {   // a row of pictures (each {img, w, h}) as tall as ROW points, scaled down together when they don't fit the width
        const gap = 6, ROW = 110, ws0 = b.imgs.map(p => (p.w / p.h) * ROW), tot = ws0.reduce((a, w) => a + w, 0) + gap * (ws0.length - 1), s = Math.min(1, CW / tot), h = ROW * s, ws = ws0.map(w => w * s);
        await room(h + 8);
        if (draw) { let x = M.x; b.imgs.forEach((p, i) => { ctx.drawImage(p.img, X(x, ws[i]), y, ws[i], h); x += ws[i] + gap; }); }
        y += h + 8;
        continue;
      }
      if (b.table) {
        const t = b.table, size = 8.5, lh = size * 1.35, sum = t.cols.reduce((a, c) => a + c.w, 0);
        const xs = [], ws = t.cols.map(c => (c.w / sum) * CW);
        ws.reduce((x, w, i) => { xs[i] = x; return x + w; }, M.x);
        const row = (cells, head) => {
          font(size, head ? 700 : 400);
          const lines = cells.map((c, i) => wrap(ctx, c, ws[i] - 2 * PAD, seg)), h = Math.max(1, ...lines.map(l => l.length)) * lh + 2 * PAD - 1;
          return { lines, h, head };
        };
        const drawRow = r => {
          if (draw) {
            if (r.head) { ctx.fillStyle = SHADE; ctx.fillRect(M.x, y, CW, r.h); }
            ctx.fillStyle = LINE; ctx.fillRect(M.x, y + r.h, CW, 0.5);
            ctx.fillStyle = INK; font(size, r.head ? 700 : 400);
          }
          r.lines.forEach((ls, i) => ls.forEach((l, j) => put(l, xs[i] + PAD, ws[i] - 2 * PAD, y + PAD + size + j * lh - 1, t.cols[i].align || 'start')));
          y += r.h;
        };
        const head = t.head && row(t.head, true), csize = 10, cap = () => {
          if (!t.caption) return;
          font(csize, 700); if (draw) ctx.fillStyle = INK; put(t.caption, M.x, CW, y + csize, 'start'); y += csize * 1.5;
        };
        await room((t.caption ? csize * 1.5 : 0) + (head ? head.h : 0) + 3 * lh); cap(); if (head) drawRow(head);
        for (const cells of t.rows) {
          const r = row(cells, false);
          if (y + r.h > bottom) { await newPage(); cap(); if (head) drawRow(head); }
          drawRow(r);
        }
        y += 8;
        continue;
      }
    }
    if (draw) await finish(); else pages.push(null);
    return { pages, text };
  }

  const hex4 = n => n.toString(16).toUpperCase().padStart(4, '0');
  /** A PDF text string that can hold any language (UTF-16 with a byte-order mark). */
  const utf16 = s => '<FEFF' + Array.from(String(s)).map(ch => { const c = ch.codePointAt(0); if (c < 0x10000) return hex4(c); const v = c - 0x10000; return hex4(0xd800 + (v >> 10)) + hex4(0xdc00 + (v & 0x3ff)); }).join('') + '>';
  const stamp = d => 'D:' + [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()].map((n, i) => String(n).padStart(i ? 2 : 4, '0')).join('');

  /** The PDF file: one page for each JPEG picture, filling a page of size [W, H] points. */
  function write(jpegs, [W, H], { title = '', lang = '' } = {}) {
    const enc = new TextEncoder(), parts = [], offsets = [];
    let len = 0;
    const add = x => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; };
    const obj = (n, dict, stream) => { offsets[n] = len; add(`${n} 0 obj\n${dict}\n`); if (stream) { add('stream\n'); add(stream); add('\nendstream\n'); } add('endobj\n'); };
    add('%PDF-1.4\n'); add(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));   // (a binary comment, so it is never taken for text)
    obj(1, `<< /Type /Catalog /Pages 2 0 R${/^[a-zA-Z-]+$/.test(lang) ? ` /Lang (${lang})` : ''} >>`);
    obj(2, `<< /Type /Pages /Kids [${jpegs.map((_, i) => `${4 + i * 3} 0 R`).join(' ')}] /Count ${jpegs.length} >>`);
    obj(3, `<< /Title ${utf16(title)} /Producer (Little Log) /CreationDate (${stamp(new Date())}) >>`);
    jpegs.forEach((j, i) => {
      const p = 4 + i * 3, w = W.toFixed(2), h = H.toFixed(2), draw = `q ${w} 0 0 ${h} 0 0 cm /P${i} Do Q`;
      obj(p, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /P${i} ${p + 1} 0 R >> >> /Contents ${p + 2} 0 R >>`);
      obj(p + 1, `<< /Type /XObject /Subtype /Image /Width ${j.width} /Height ${j.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${j.bytes.length} >>`, j.bytes);
      obj(p + 2, `<< /Length ${draw.length} >>`, enc.encode(draw));
    });
    const xref = len, count = 4 + jpegs.length * 3;
    add(`xref\n0 ${count}\n0000000000 65535 f \n${offsets.slice(1).map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`);
    add(`trailer\n<< /Size ${count} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    const out = new Uint8Array(len); let at = 0;
    for (const b of parts) { out.set(b, at); at += b.length; }
    return out;
  }

  async function make(blocks, opts = {}) {
    const o = { size: 'a4', dpi: 200, quality: 0.9, rtl: false, lang: 'en', title: '', header: '', footer: () => '', ...opts };
    const plan = await layout(blocks, o, false, 0);   // first how many pages there are, for "page 2 of 5"
    const { pages, text } = await layout(blocks, o, true, plan.pages.length);
    return { bytes: write(pages, SIZE[o.size] || SIZE.a4, o), pages: pages.length, text };
  }

  return { make, write, wrap, SIZE };
})();
