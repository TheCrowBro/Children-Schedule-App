'use strict';
/* Pictures and short videos kept with a big moment (app.js has the moment sheet, the cards, the viewer and the book).
   A file is encrypted on the phone with the log's key, like every entry, and lives in the family's private storage bucket as
   <log>/<id> (the picture or video) and <log>/<id>.t (a small thumbnail); the server sees sizes and who uploaded what, nothing else.
   Each phone keeps what it has shown in IndexedDB (store.js). Uploads and deletions wait in db.meta (mediaUp, mediaDel) and go with
   the next sync, so a picture added offline arrives by itself later. Without a signed-in family log everything stays on this phone. */
const Media = (() => {
  const MAX = { photos: 4, videos: 1, seconds: 60, videoBytes: 60 * 1024 * 1024, side: 1600, thumb: 320 };
  const urls = new Map();      // name → object URL of a blob already shown ('<id>', or '<id>.t' for its thumbnail)
  const failed = new Map();    // name → when fetching it last failed (not tried again for a minute)
  const wanted = new Set();
  let priming = null;
  const M = { MAX, onChange: null };

  // ---- from a file on the phone ----
  const bitmap = async file => {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch (e) { return new Promise((ok, no) => { const u = URL.createObjectURL(file), im = new Image(); im.onload = () => { URL.revokeObjectURL(u); ok(im); }; im.onerror = () => { URL.revokeObjectURL(u); no(new Error('bad image')); }; im.src = u; }); }
  };
  const sizeOf = im => [im.naturalWidth || im.width, im.naturalHeight || im.height];
  const fit = (w, h, max) => { const s = Math.min(1, max / Math.max(w, h)); return [Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s))]; };
  const jpeg = (src, w, h, q) => new Promise((ok, no) => { const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(src, 0, 0, w, h); c.toBlob(b => (b ? ok(b) : no(new Error('bad image'))), 'image/jpeg', q); });
  const bad = () => ({ error: __("That file isn't a picture or a video Little Log can show.") });
  /** A picture, shrunk to fit MAX.side: a phone's 12-megapixel photo is far more than a phone screen shows, and ten times the upload. */
  async function fromPhoto(file) {
    let im; try { im = await bitmap(file); } catch (e) { return bad(); }
    const [w0, h0] = sizeOf(im); if (!w0 || !h0) return bad();
    const [w, h] = fit(w0, h0, MAX.side), [tw, th] = fit(w0, h0, MAX.thumb);
    try { const blob = await jpeg(im, w, h, 0.85), thumb = await jpeg(im, tw, th, 0.7); return { item: { id: uid(), kind: 'photo', w, h, bytes: blob.size, mime: 'image/jpeg' }, blob, thumb }; }
    catch (e) { return bad(); } finally { if (im.close) im.close(); }
  }
  /** A video, kept as it is: up to a minute and MAX.videoBytes, with a frame from its start as the thumbnail. */
  function fromVideo(file) {
    if (file.size > MAX.videoBytes) return Promise.resolve({ error: __('That video is too big. Up to {max} MB.', { max: Math.round(MAX.videoBytes / 1048576) }) });
    return new Promise(ok => {
      const v = document.createElement('video'), u = URL.createObjectURL(file); let done = false;
      const end = r => { if (done) return; done = true; clearTimeout(timer); v.removeAttribute('src'); v.load(); URL.revokeObjectURL(u); ok(r); };
      const timer = setTimeout(() => end(bad()), 20000);
      const check = () => {
        const dur = v.duration;
        if (!Number.isFinite(dur) || dur <= 0) return end(bad());
        if (dur > MAX.seconds + 0.5) return end({ error: __('That video is longer than a minute. Trim it in your Photos app first.') });
        v.onseeked = async () => {
          v.onseeked = null;
          const w0 = v.videoWidth, h0 = v.videoHeight; if (!w0 || !h0) return end(bad());
          const [tw, th] = fit(w0, h0, MAX.thumb);
          try { const thumb = await jpeg(v, tw, th, 0.7); end({ item: { id: uid(), kind: 'video', w: w0, h: h0, dur: Math.round(dur * 10) / 10, bytes: file.size, mime: file.type || 'video/mp4' }, blob: file, thumb }); }
          catch (e) { end(bad()); }
        };
        v.currentTime = Math.min(0.5, dur / 2);
      };
      v.muted = true; v.playsInline = true; v.preload = 'auto';
      v.onerror = () => end(bad());
      v.onloadedmetadata = () => {
        // a video just recorded can say its length is unknown (Infinity): seeking far past the end makes the browser work it out
        if (Number.isFinite(v.duration)) return check();
        v.ontimeupdate = () => { v.ontimeupdate = null; check(); }; v.currentTime = 1e6;
      };
      v.src = u;
    });
  }

  // ---- on this phone ----
  const remember = (name, blob) => { const old = urls.get(name); if (old) URL.revokeObjectURL(old); const u = URL.createObjectURL(blob); urls.set(name, u); return u; };
  /** Keeps a prepared picture or video on this phone and queues its upload. Returns the item that goes in the entry. */
  async function stage(prep) {
    await Store.blobPut(prep.item.id, prep.blob); await Store.blobPut(prep.item.id + '.t', prep.thumb);
    remember(prep.item.id + '.t', prep.thumb);
    (db.meta.mediaUp || (db.meta.mediaUp = [])).push(prep.item.id);
    return prep.item;
  }
  /** Forgets pictures and videos no entry refers to any more: off this phone now, off the family's storage with the next sync. */
  async function discard(ids) {
    const used = new Set(db.events.flatMap(e => ((e.data || {}).media || []).map(m => m.id)));
    for (const id of ids.filter(x => !used.has(x))) {
      for (const name of [id, id + '.t']) { await Store.blobDel(name); const u = urls.get(name); if (u) { URL.revokeObjectURL(u); urls.delete(name); } }
      db.meta.mediaUp = (db.meta.mediaUp || []).filter(x => x !== id);
      if (Sync.linked()) (db.meta.mediaDel || (db.meta.mediaDel = [])).push(id);
    }
  }

  // ---- the family's storage ----
  const linkedUp = () => typeof E2EE !== 'undefined' && Sync.linked() && !!db.meta.babyId;
  const objPath = (baby, name, read) => `/storage/v1/object/${read ? 'authenticated/' : ''}media/${baby}/${name}`;
  async function upload(baby, id) {
    for (const name of [id + '.t', id]) {   // (the thumbnail first: it is what the family sees first)
      const blob = await Store.blobGet(name); if (!blob) continue;
      await Auth.upload(objPath(baby, name), await E2EE.sealMedia(baby, name, new Uint8Array(await blob.arrayBuffer())));
    }
  }
  /** Sends what is waiting and deletes what was taken off; each sync calls it. A network error stops it: the rest waits for the next. */
  async function flush() {
    if (!linkedUp()) return;
    const baby = db.meta.babyId;
    for (const id of [...(db.meta.mediaUp || [])]) {
      try { await upload(baby, id); } catch (e) { if (e.status !== 403 && e.status !== 413) throw e; }   // (refused: it stays on this phone only)
      db.meta.mediaUp = (db.meta.mediaUp || []).filter(x => x !== id);
    }
    for (const id of [...(db.meta.mediaDel || [])]) {
      for (const name of [id, id + '.t']) { try { await Auth.remove(objPath(baby, name)); } catch (e) { if (e.status !== 403) throw e; } }
      db.meta.mediaDel = (db.meta.mediaDel || []).filter(x => x !== id);
    }
  }
  /** The decrypted file from the family's storage, kept on this phone; null when it isn't there (yet). */
  async function fetched(name, mime) {
    if (!linkedUp()) return null;
    const bytes = await Auth.download(objPath(db.meta.babyId, name, true)); if (!bytes) return null;
    const blob = new Blob([await E2EE.openMedia(db.meta.babyId, name, bytes)], { type: mime });
    await Store.blobPut(name, blob); return blob;
  }

  // ---- showing ----
  /** The object URL of a picture, video or thumbnail already shown on this phone, or null (prime() fetches thumbnails). */
  const url = name => urls.get(name) || null;
  /** The object URL of a picture, video or thumbnail: from this phone, or fetched and kept. Throws when it can't be had. */
  async function ensure(name, mime) {
    if (urls.has(name)) return urls.get(name);
    const blob = (await Store.blobGet(name)) || (await fetched(name, mime));
    if (!blob) throw new Error(N_("Couldn't load it. Check the connection and try again."));
    return remember(name, blob);
  }
  /** Thumbnails for the moments shown: whatever isn't on this phone yet is fetched in the background, then onChange() redraws. */
  function prime(items) {
    for (const m of items || []) { const t = m.id + '.t'; if (!urls.has(t) && Date.now() - (failed.get(t) || 0) > 60000) wanted.add(t); }
    if (priming || !wanted.size) return;
    priming = (async () => {
      let got = 0;
      while (wanted.size) { const t = wanted.values().next().value; wanted.delete(t); try { await ensure(t, 'image/jpeg'); got++; } catch (e) { failed.set(t, Date.now()); } }
      priming = null; if (got && M.onChange) M.onChange();
    })();
  }

  Object.assign(M, { fromPhoto, fromVideo, stage, discard, flush, url, ensure, prime });
  return M;
})();
