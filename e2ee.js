'use strict';
/* End-to-end encryption. The server only ever stores ciphertext and *wrapped* keys; plaintext and keys exist on the phones.

   Keys    Each log has a MAIN key (everything) and a HEALTH key (health notes and medication, shared only with people allowed
           to see them). Keys have an "epoch"; they are replaced (rotated) when someone leaves or loses a phone.
   Phones  Every phone has its own ECDH P-256 key pair; the private half lives in the Keychain / Keystore. A log's keys are
           stored on the server only as copies wrapped (ECIES: ephemeral ECDH + HKDF + AES-GCM) to each approved phone.
   Trust   Giving keys to a phone is only safe if the phone's public key is the real one (the server could substitute its own).
           A QR invite carries a secret the server never sees: the joiner proves possession (HMAC) and the parent authenticates the
           grant back with it. Without a QR (typed code, new phone) people compare a security code instead.
           Every grant also carries a MAC made with the main key; a rotating parent only re-wraps keys to phones whose MAC checks
           out, so the server (or an attacker with a stolen session) cannot slip a phone into the key distribution.
   Recovery A random recovery code protects a key pair whose public half receives a copy of every key set, so losing the
           only phone is not fatal. The code is shown once and never stored. */
const E2EE = (() => {
  const enc = new TextEncoder(), dec = new TextDecoder(), S = crypto.subtle;
  const ECDH = { name: 'ECDH', namedCurve: 'P-256' };
  const TYPES = ['feed', 'diaper', 'sleep', 'wake', 'vomit', 'play', 'health', 'med', 'trip', 'leg'];
  const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // exactly 32 symbols = 5 bits each

  // ---- encoding helpers ---------------------------------------------------------------------
  const b64 = u8 => btoa(String.fromCharCode(...u8));
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const unb64u = s => unb64(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  const rand = n => crypto.getRandomValues(new Uint8Array(n));
  /** crypto.randomUUID() needs iOS 15.4+; this works everywhere. */
  const uuid = () => { if (crypto.randomUUID) return crypto.randomUUID(); const b = rand(16); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128; const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join(''); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`; };
  const cat = (...a) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
  const pubOf = j => ({ kty: 'EC', crv: 'P-256', x: j.x, y: j.y });
  const canon = pub => cat(unb64u(pub.x), unb64u(pub.y));
  const sha256 = async u8 => new Uint8Array(await S.digest('SHA-256', u8));
  /** Groups of 5 digits from a hash: easy to compare out loud. */
  const digits = (u8, n = 30) => { let v = 0n; for (const b of u8.slice(0, 16)) v = (v << 8n) | BigInt(b); const s = (v % 10n ** BigInt(n)).toString().padStart(n, '0'); return s.match(/.{5}/g).join(' '); };

  // ---- primitives ---------------------------------------------------------------------------
  async function hkdf(ikm, salt, info, bytes = 32) {
    const k = await S.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
    return new Uint8Array(await S.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode(info) }, k, bytes * 8));
  }
  async function hmac(keyBytes, msg) {
    const k = await S.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return b64(new Uint8Array(await S.sign('HMAC', k, enc.encode(msg))));
  }
  /** AES-256-GCM. Output is base64(iv ‖ ciphertext). `aad` binds the ciphertext to its context so it can't be moved or swapped. */
  async function seal(key, bytes, aad) {
    const iv = rand(12), k = await S.importKey('raw', key, 'AES-GCM', false, ['encrypt']);
    return b64(cat(iv, new Uint8Array(await S.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, k, bytes))));
  }
  async function open(key, s, aad) {
    const all = unb64(s), k = await S.importKey('raw', key, 'AES-GCM', false, ['decrypt']);
    return new Uint8Array(await S.decrypt({ name: 'AES-GCM', iv: all.slice(0, 12), additionalData: enc.encode(aad) }, k, all.slice(12)));
  }
  /** ECIES-style: only the holder of the matching private key can open it. */
  async function wrapTo(pub, bytes, ctx) {
    const eph = await S.generateKey(ECDH, true, ['deriveBits']), peer = await S.importKey('jwk', pubOf(pub), ECDH, false, []);
    const bits = new Uint8Array(await S.deriveBits({ name: 'ECDH', public: peer }, eph.privateKey, 256));
    const epk = pubOf(await S.exportKey('jwk', eph.publicKey));
    const key = await hkdf(bits, await sha256(canon(epk)), 'littlelog/wrap/v1|' + ctx);
    return JSON.stringify({ e: { x: epk.x, y: epk.y }, c: await seal(key, bytes, ctx) });
  }
  async function unwrapWith(privJwk, wrapped, ctx) {
    const w = JSON.parse(wrapped), epk = pubOf({ x: w.e.x, y: w.e.y });
    const priv = await S.importKey('jwk', privJwk, ECDH, false, ['deriveBits']), peer = await S.importKey('jwk', epk, ECDH, false, []);
    const bits = new Uint8Array(await S.deriveBits({ name: 'ECDH', public: peer }, priv, 256));
    return open(await hkdf(bits, await sha256(canon(epk)), 'littlelog/wrap/v1|' + ctx), w.c, ctx);
  }
  async function newKeyPair() { const kp = await S.generateKey(ECDH, true, ['deriveBits']); const priv = await S.exportKey('jwk', kp.privateKey); return { priv, pub: pubOf(priv) }; }
  const fingerprint = async pub => digits(await sha256(canon(pub)));
  const fpRaw = async pub => b64(await sha256(canon(pub)));

  // ---- contexts (what each ciphertext / MAC is bound to) -----------------------------------------
  const entryAad = (baby, id, epoch, sens) => `ll1|entry|${baby}|${id}|${epoch}|${sens ? 'h' : 'm'}`;
  const profileAad = (baby, epoch) => `ll1|profile|${baby}|${epoch}`;
  const keyringAad = (cls, baby, epoch) => `ll1|keyring-${cls}|${baby}|${epoch}`;
  const grantCtx = (baby, epoch, grantee) => `ll1|grant|${baby}|${epoch}|${grantee}`;
  // The health key's fingerprint, signed with the main key: a phone that is handed a health key checks it against this, so the server can't substitute one.
  const healthCheck = async (baby, epoch, main, health) => hmac(main, `ll1|hk|${baby}|${epoch}|${b64(await sha256(health))}`);
  const tagMsg = async (baby, epoch, grantee, pub) => `ll1|tag|${baby}|${epoch}|${grantee}|${await fpRaw(pub)}`;

  // ---- key store (Keychain / Keystore) -------------------------------------------------------------
  const store = {};   // babyId -> { epoch, keys: { [epoch]: { main: b64, health: b64|null } } }
  const skey = baby => 'e2ee.keys.' + baby;
  async function load(baby) {
    if (store[baby]) return store[baby];
    try { const v = await Native.Secure.get(skey(baby)); if (v) store[baby] = JSON.parse(v); } catch (e) {}
    return store[baby] || null;
  }
  const persist = baby => Native.Secure.set(skey(baby), JSON.stringify(store[baby]));
  const raw = (baby, epoch, cls) => { const e = store[baby] && store[baby].keys[epoch]; return e && e[cls] ? unb64(e[cls]) : null; };
  const current = baby => { const s = store[baby]; return s ? { epoch: s.epoch, main: raw(baby, s.epoch, 'main'), health: raw(baby, s.epoch, 'health') } : null; };
  async function setKeys(baby, epoch, main, health) {
    const s = store[baby] || (store[baby] = { epoch, keys: {} });
    const e = s.keys[epoch] || (s.keys[epoch] = { main: null, health: null });
    e.main = b64(main); if (health) e.health = b64(health);
    if (epoch >= s.epoch) s.epoch = epoch;
    await persist(baby);
  }

  // ---- this phone ---------------------------------------------------------------------------
  let dev = null;   // { user, id, priv, pub }
  const dkey = uid => 'e2ee.device.' + uid;
  async function ensureDevice() {
    const uid = Auth.id;
    if (!dev || dev.user !== uid) {
      dev = null;
      try { const v = await Native.Secure.get(dkey(uid)); if (v) dev = JSON.parse(v); } catch (e) {}
      if (!dev) { const kp = await newKeyPair(); dev = { user: uid, id: null, priv: kp.priv, pub: kp.pub }; }
    }
    let known = false;
    if (dev.id) { try { known = (await Auth.rpc('my_devices')).some(d => d.id === dev.id); } catch (e) { return dev; } }   // offline: keep going
    if (!known) { dev.id = await Auth.rpc('register_device', { p_name: (Native.platform || 'phone') + ' phone', p_pub: dev.pub }); }
    await Native.Secure.set(dkey(uid), JSON.stringify(dev));
    return dev;
  }

  // ---- grants ----------------------------------------------------------------------------------------
  /** Wrap a key set to one phone (or the recovery key). Includes a main-key MAC, and a QR-secret MAC when `secret` is known. */
  async function makeGrant(baby, epoch, keys, grantee, pub, { health, secret, chain } = {}) {
    const ctx = grantCtx(baby, epoch, grantee);
    const wrap_main = await wrapTo(pub, keys.main, ctx + '|m');
    const wrap_health = health ? await wrapTo(pub, keys.health, ctx + '|h') : null;
    const tag = await hmac(keys.main, await tagMsg(baby, epoch, grantee, pub));
    // `auth` proves the grant is genuine, because anyone (the server included) can wrap keys to a public key:
    //  - first keys for a QR joiner: a MAC under the invite secret that the server never sees
    //  - a key change for a phone that already has keys: a MAC under each of the previous epochs' main keys (`chain`), which
    //    the phone checks against the newest one it holds, so keys the server made up are rejected
    const body = `${ctx}|${wrap_main}|${wrap_health || ''}`; let auth = null;
    if (secret) auth = await hmac(await hkdf(unb64u(secret), new Uint8Array(0), 'll1/grant-auth'), body);
    else if (chain && chain.length) { const m = {}; for (const c of chain) m[c.epoch] = await hmac(c.key, body); auth = JSON.stringify(m); }
    return { wrap_main, wrap_health, auth, tag };
  }
  /** Main keys of the most recent epochs we hold (newest first), to authenticate a grant for a phone that may still hold older keys. */
  function chainOf(baby) {
    const s = store[baby]; if (!s) return [];
    return Object.entries(s.keys).filter(([, e]) => e.main).map(([ep, e]) => ({ epoch: +ep, key: unb64(e.main) })).sort((a, b) => b.epoch - a.epoch).slice(0, 6);
  }
  async function tagOk(baby, cur, row) {   // does this device/recovery row carry a valid MAC from a real key holder?
    if (!row.tag || !row.pubkey) return false;
    try { return row.tag === await hmac(cur.main, await tagMsg(baby, cur.epoch, row.grantee, row.pubkey)); } catch (e) { return false; }
  }

  // ---- QR secrets & proofs ---------------------------------------------------------------------------
  const newSecret = () => b64(rand(16)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  async function rememberInvite(code, secret) {
    let m = {}; try { m = JSON.parse(await Native.Secure.get('e2ee.invites') || '{}'); } catch (e) {}
    m[code] = { s: secret, at: Date.now() };
    const keep = Object.entries(m).sort((a, b) => b[1].at - a[1].at).slice(0, 20); await Native.Secure.set('e2ee.invites', JSON.stringify(Object.fromEntries(keep)));
  }
  async function inviteSecret(code) { try { const m = JSON.parse(await Native.Secure.get('e2ee.invites') || '{}'); return m[code] ? m[code].s : null; } catch (e) { return null; } }
  const proofKey = async secret => hkdf(unb64u(secret), new Uint8Array(0), 'll1/join-proof');
  const joinProof = async (secret, deviceId, pub) => hmac(await proofKey(secret), `${deviceId}|${await fpRaw(pub)}`);
  async function verifyRequest(req) {   // did the requester prove they hold the QR secret for *this* public key?
    if (!req.proof || !req.invite_code) return false;
    const s = await inviteSecret(req.invite_code); if (!s) return false;
    try { return req.proof === await joinProof(s, req.device_id, req.device_pub); } catch (e) { return false; }
  }

  // ---- recovery code -----------------------------------------------------------------------------
  const genCode = () => Array.from(rand(32), x => RECOVERY_ALPHABET[x & 31]).join('').match(/.{4}/g).join('-');
  const normCode = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const recoveryKey = code => hkdf(enc.encode(normCode(code)), enc.encode('ll1/recovery'), 'littlelog/recovery-priv/v1');
  async function newRecovery() {
    const code = genCode(), kp = await newKeyPair();
    return { code, pub: kp.pub, privWrapped: await seal(await recoveryKey(code), enc.encode(JSON.stringify(kp.priv)), 'll1|recovery-priv') };
  }

  // ---- entries & profile ---------------------------------------------------------------------------
  const isSensitive = type => type === 'health' || type === 'med';
  // Whatever a (possibly buggy or hostile) writer put inside an entry, only known fields of the right type reach the screens.
  const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
  const num = v => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(v, 1e6)) : undefined);
  function sanitize(type, d) {
    d = d && typeof d === 'object' && !Array.isArray(d) ? d : {};
    const o = {}, n = k => { const v = num(d[k]); if (v !== undefined) o[k] = v; }, s = (k, len) => { if (typeof d[k] === 'string') o[k] = str(d[k], len); }, b = k => { if (typeof d[k] === 'boolean') o[k] = d[k]; };
    switch (type) {
      case 'feed': if (d.kind === 'bottle' || d.kind === 'breast') o.kind = d.kind; s('side', 10); s('milk', 20); s('formula', 60); n('min'); n('ml'); break;
      case 'diaper': b('pee'); b('poo'); b('rash'); s('color', 20); break;
      case 'wake': n('min'); s('why', 30); break;
      case 'vomit': s('amount', 20); b('projectile'); break;
      case 'play': s('activity', 30); n('min'); break;
      case 'health': o.symptoms = Array.isArray(d.symptoms) ? d.symptoms.filter(x => typeof x === 'string').slice(0, 20).map(x => x.slice(0, 60)) : []; n('temp'); break;
      case 'med': s('name', 60); s('dose', 60); break;
      case 'trip': case 'leg': if (typeof d.means === 'string' && Travel.KINDS.includes(d.means)) o.means = d.means; break;
    }
    if (d.approx === true) o.approx = true;   // logged on the go: the time is an estimate
    return o;
  }
  async function encryptEntry(baby, e) {
    const cur = current(baby), sens = isSensitive(e.type), key = cur && (sens ? cur.health : cur.main);
    if (!key) throw new Error('no key');
    // `u` (edit time) and `a` (author) are sealed inside: the server's copies of them can't be trusted, so phones check them against these.
    const plain = JSON.stringify({ type: e.type, ts: e.ts, end: e.end == null ? null : e.end, data: e.data || {}, note: e.note || '', u: e.updated, a: e.by || null, c: e.child || null });
    return { blob: await seal(key, enc.encode(plain), entryAad(baby, e.id, cur.epoch, sens)), epoch: cur.epoch, sensitive: sens };
  }
  /** Decrypts one server row. Returns {entry}, {locked:true} (we don't hold that key yet) or {bad:true} (tampered / forged). */
  async function decryptWith(keys, baby, r) {
    const k = keys[r.epoch] && (r.sensitive ? keys[r.epoch].health : keys[r.epoch].main);
    if (!k) return { locked: true };
    try {
      const p = JSON.parse(dec.decode(await open(unb64(k), r.blob, entryAad(baby, r.id, r.epoch, r.sensitive))));
      // A health/medication entry must live in the health class (and nothing else may): stops people without the health key planting one.
      if (!TYPES.includes(p.type) || isSensitive(p.type) !== !!r.sensitive || !Number.isFinite(p.ts)) return { bad: true };
      // The row's edit time may only be *lower* than the sealed one (the server clamps wild clocks). A higher one means the server is passing an
      // old version off as newer, to roll a phone back.
      if (!Number.isFinite(p.u) || !(+r.updated <= p.u)) return { bad: true };
      return { entry: { id: r.id, type: p.type, ts: p.ts, ...(Number.isFinite(p.end) ? { end: p.end } : {}), data: sanitize(p.type, p.data), note: str(p.note, 1000), updated: +r.updated, by: typeof p.a === 'string' ? p.a.slice(0, 64) : r.created_by, ...(typeof p.c === 'string' && /^[A-Za-z0-9_-]{1,24}$/.test(p.c) ? { child: p.c } : {}) } };
    } catch (e) { return { bad: true }; }
  }
  const decryptRow = (baby, r) => decryptWith((store[baby] && store[baby].keys) || {}, baby, r);
  // The profile holds the children (name, birth date, boy/girl, colour). `name`/`birth` mirror the first child, for older phones.
  const sealProfile = (baby, epoch, main, p) => { const kids = Kids.clean(p.kids, p.name, p.birth); return seal(main, enc.encode(JSON.stringify({ name: kids[0].name, birth: kids[0].birth, kids, doctor: Guide.cleanDoctor(p.doctor) })), profileAad(baby, epoch)); };
  const encryptProfile = (baby, p) => { const c = current(baby); return sealProfile(baby, c.epoch, c.main, p); };
  async function decryptProfile(baby, blob, epoch) {
    const k = raw(baby, epoch, 'main'); if (!k || !blob) return null;
    try { const p = JSON.parse(dec.decode(await open(k, blob, profileAad(baby, epoch)))); const kids = Kids.clean(p.kids, p.name, p.birth); return { name: kids[0].name, birth: kids[0].birth, kids, doctor: Guide.cleanDoctor(p.doctor) }; } catch (e) { return null; }
  }

  // A person's contact details (phone, work…), sealed with the log's key and bound to that person, so the server can't read them or swap them.
  const detailsAad = (baby, user, epoch) => `ll1|details|${baby}|${user}|${epoch}`;
  async function sealDetails(baby, user, d) { const c = current(baby); return { blob: await seal(c.main, enc.encode(JSON.stringify(Guide.cleanDetails(d))), detailsAad(baby, user, c.epoch)), epoch: c.epoch }; }
  async function openDetails(baby, user, blob, epoch) {
    const k = raw(baby, epoch, 'main'); if (!k || !blob) return null;
    try { return Guide.cleanDetails(JSON.parse(dec.decode(await open(k, blob, detailsAad(baby, user, epoch))))); } catch (e) { return null; }
  }

  // ---- getting keys onto this phone ------------------------------------------------------------------
  async function absorbKeyring(baby, kr) {
    const c = raw(baby, kr.epoch, 'main'); if (!c) return;
    for (const [cls, field, key] of [['main', kr.keyring_main, c], ['health', kr.keyring_health, raw(baby, kr.epoch, 'health')]]) {
      if (!field || !key) continue;
      try {
        const old = JSON.parse(dec.decode(await open(key, field, keyringAad(cls, baby, kr.epoch))));
        const s = store[baby];
        for (const [ep, k] of Object.entries(old)) { const e = s.keys[ep] || (s.keys[ep] = { main: null, health: null }); if (!e[cls]) e[cls] = k; }
      } catch (e) { /* a keyring we cannot open (e.g. before health access was given) is simply skipped */ }
    }
    await persist(baby);
  }
  /** Brings this phone's keys up to date. Returns 'ready' or 'needs-access'. meta.unverified is set when the first keys arrived
      without a QR proof (the person should compare the log's security code with a parent). */
  async function refresh(baby, meta, { health: wantHealth } = {}) {
    await load(baby); await ensureDevice();
    const kr = (await Auth.rpc('get_keyring', { p_baby: baby }))[0]; if (!kr) return 'needs-access';
    const heldMain = raw(baby, kr.epoch, 'main'), heldHealth = raw(baby, kr.epoch, 'health');
    if (!heldMain || (wantHealth && !heldHealth)) {
      const g = (await Auth.rpc('my_grant', { p_baby: baby, p_device: dev.id }))[0];
      if (!g || g.epoch !== kr.epoch) return heldMain ? 'ready' : 'needs-access';
      const ctx = grantCtx(baby, g.epoch, 'd:' + dev.id);
      let main = heldMain, health = heldHealth;
      try {
        if (!main) main = await unwrapWith(dev.priv, g.wrap_main, ctx + '|m');
        if (!health && g.wrap_health) health = await unwrapWith(dev.priv, g.wrap_health, ctx + '|h');
      } catch (e) { throw new Error('The keys sent to this phone could not be opened. Ask a parent to approve this phone again.'); }
      const first = !(store[baby] && Object.values(store[baby].keys).some(e => e.main));
      if (!heldMain) {
        const body = `${ctx}|${g.wrap_main}|${g.wrap_health || ''}`;
        if (first) {
          const sec = await joinSecretGet();
          if (sec) {   // joined with a QR code: the keys must carry the proof only the inviting parent could make (a missing proof is as bad as a wrong one)
            const want = await hmac(await hkdf(unb64u(sec), new Uint8Array(0), 'll1/grant-auth'), body);
            if (!g.auth || want !== g.auth) throw new Error('These encryption keys did not come from the parent who invited you. Do not continue – tell them.');
          } else if (meta) meta.unverified = true;   // typed code / approved phone: compare the log security code
        } else if (g.epoch > store[baby].epoch) {
          // A key change must be signed with keys this phone already trusts; otherwise the server could substitute keys of its own.
          let ok = false;
          try {
            const m = JSON.parse(g.auth || '{}');
            const have = Object.keys(store[baby].keys).map(Number).filter(e => raw(baby, e, 'main') && m[e]).sort((a, b) => b - a);
            if (have.length) ok = m[have[0]] === await hmac(raw(baby, have[0], 'main'), body);
          } catch (e) { ok = false; }
          if (!ok) throw new Error('A change of encryption keys was not signed by anyone who held the previous keys, so this phone ignored it. Tell a parent.');
        }
      }
      // The health key must match the fingerprint that holders of the main key signed.
      if (health && !heldHealth && (!kr.health_check || kr.health_check !== await healthCheck(baby, g.epoch, main, health))) throw new Error('The health key sent to this phone did not check out, so it was ignored. Tell a parent.');
      await setKeys(baby, g.epoch, main, health);
      if (first) await setJoinSecret(null);   // used up
    }
    await absorbKeyring(baby, kr);
    return raw(baby, kr.epoch, 'main') ? 'ready' : 'needs-access';
  }
  let joinSecret = null;
  const joinSecretGet = async () => joinSecret || (joinSecret = await Native.Secure.get('e2ee.join'));
  async function setJoinSecret(s) { joinSecret = s; if (s) await Native.Secure.set('e2ee.join', s); else await Native.Secure.remove('e2ee.join'); }

  async function unlockWithRecovery(baby, code, meta) {
    await load(baby); await ensureDevice();
    const r = (await Auth.rpc('get_recovery', { p_baby: baby }))[0]; if (!r) throw new Error('This log has no recovery code on file.');
    let priv;
    try { priv = JSON.parse(dec.decode(await open(await recoveryKey(code), r.recovery_priv_wrapped, 'll1|recovery-priv'))); }
    catch (e) { throw new Error('That recovery code is not right.'); }
    const ctx = grantCtx(baby, r.epoch, 'recovery');
    const main = await unwrapWith(priv, r.wrap_main, ctx + '|m'), health = r.wrap_health ? await unwrapWith(priv, r.wrap_health, ctx + '|h') : null;
    const kr = (await Auth.rpc('get_keyring', { p_baby: baby }))[0];
    if (health && (!kr || kr.health_check !== await healthCheck(baby, r.epoch, main, health))) throw new Error('The health key did not check out.');
    await setKeys(baby, r.epoch, main, health);
    if (meta) meta.unverified = false;
    await selfGrant(baby);   // so the next key change includes this phone
    await refresh(baby, meta);
  }
  async function selfGrant(baby) {
    const cur = current(baby), g = await makeGrant(baby, cur.epoch, cur, 'd:' + dev.id, dev.pub, { health: !!cur.health });
    await Auth.rpc('grant_device', { p_baby: baby, p_device: dev.id, p_wrap_main: g.wrap_main, p_wrap_health: g.wrap_health, p_auth: null, p_tag: g.tag });
  }

  // ---- parent operations ---------------------------------------------------------------------------
  async function createLog(profile, displayName) {
    await ensureDevice();
    const baby = uuid(), keys = { main: rand(32), health: rand(32) }, rec = await newRecovery();
    const mine = await makeGrant(baby, 1, keys, 'd:' + dev.id, dev.pub, { health: true });
    const recG = await makeGrant(baby, 1, keys, 'recovery', rec.pub, { health: true });
    const id = await Auth.rpc('create_baby', { p_profile: await sealProfile(baby, 1, keys.main, profile), p_display_name: displayName || '', p_device: dev.id,
      p_grant: mine, p_recovery_pub: rec.pub, p_recovery_priv_wrapped: rec.privWrapped, p_recovery_grant: recG, p_id: baby, p_health_check: await healthCheck(baby, 1, keys.main, keys.health) });
    store[id] = { epoch: 1, keys: {} }; await setKeys(id, 1, keys.main, keys.health);
    return { babyId: id, code: rec.code };
  }
  /** Keys for a join request. The parent must have verified the requester (QR proof, or compared security codes). */
  async function grantForRequest(baby, req, { manualOk } = {}) {
    const cur = current(baby); if (!cur) throw new Error('This phone does not have the keys yet.');
    const s = await inviteSecret(req.invite_code), qrOk = await verifyRequest(req);
    if (!qrOk && !manualOk) throw new Error('Compare the security code with their phone first.');
    const health = req.role === 'parent' || !!(req.perms && req.perms.view_health);
    return makeGrant(baby, cur.epoch, cur, 'd:' + req.device_id, req.device_pub, { health, secret: qrOk ? s : null });
  }
  async function approveDevice(baby, d) {   // d: a row from list_devices (without keys yet); the approver compared security codes
    const cur = current(baby); if (!cur) throw new Error('This phone does not have the keys yet.');
    const g = await makeGrant(baby, cur.epoch, cur, d.grantee, d.pubkey, { health: d.view_health, chain: chainOf(baby) });   // chain: lets a phone that still holds older keys check it
    await Auth.rpc('grant_device', { p_baby: baby, p_device: d.grantee.slice(2), p_wrap_main: g.wrap_main, p_wrap_health: g.wrap_health, p_auth: g.auth, p_tag: g.tag });
  }
  /** Health key copies for a person's phones (when they are given health access). Only phones whose grant verifies get one. */
  async function healthGrants(baby, userId) {
    const cur = current(baby), out = [];
    for (const d of await Auth.rpc('list_devices', { p_baby: baby })) {
      if (d.user_id !== userId || !d.has_grant || !await tagOk(baby, cur, d)) continue;
      out.push({ device: d.grantee.slice(2), wrap_health: await wrapTo(d.pubkey, cur.health, grantCtx(baby, cur.epoch, d.grantee) + '|h') });
    }
    return out;
  }
  /** Replace the keys (new epoch) and wrap them to every phone that holds a verified grant, plus the recovery key. */
  async function rotate(baby, profile) {
    const cur = current(baby), epoch = cur.epoch + 1, keys = { main: rand(32), health: rand(32) };
    const grants = [], skipped = [], chain = chainOf(baby);
    for (const d of await Auth.rpc('list_devices', { p_baby: baby })) {
      if (!d.has_grant) continue;
      if (!await tagOk(baby, cur, d)) { skipped.push(d.grantee); continue; }
      const g = await makeGrant(baby, epoch, keys, d.grantee, d.pubkey, { health: d.view_health, chain });
      grants.push({ grantee: d.grantee, wrap_main: g.wrap_main, wrap_health: g.wrap_health, auth: g.auth, tag: g.tag });
    }
    const rec = (await Auth.rpc('list_recovery', { p_baby: baby }))[0];
    if (!rec || !rec.recovery_pub || !await tagOk(baby, cur, { grantee: 'recovery', pubkey: rec.recovery_pub, tag: rec.tag })) throw new Error('The recovery key could not be verified, so the keys were not changed. Create a new recovery code first.');
    const rg = await makeGrant(baby, epoch, keys, 'recovery', rec.recovery_pub, { health: true });
    grants.push({ grantee: 'recovery', wrap_main: rg.wrap_main, wrap_health: rg.wrap_health, tag: rg.tag });
    const s = store[baby], hist = { main: {}, health: {} };
    for (const [ep, e] of Object.entries(s.keys)) { if (e.main) hist.main[ep] = e.main; if (e.health) hist.health[ep] = e.health; }
    await Auth.rpc('rotate_keys', { p_baby: baby, p_epoch: epoch, p_grants: grants,
      p_keyring_main: await seal(keys.main, enc.encode(JSON.stringify(hist.main)), keyringAad('main', baby, epoch)),
      p_keyring_health: await seal(keys.health, enc.encode(JSON.stringify(hist.health)), keyringAad('health', baby, epoch)),
      p_profile: await sealProfile(baby, epoch, keys.main, profile), p_health_check: await healthCheck(baby, epoch, keys.main, keys.health) });
    await setKeys(baby, epoch, keys.main, keys.health);
    return { skipped };
  }
  async function replaceRecovery(baby) {
    const cur = current(baby), rec = await newRecovery(), g = await makeGrant(baby, cur.epoch, cur, 'recovery', rec.pub, { health: true });
    await Auth.rpc('set_recovery', { p_baby: baby, p_pub: rec.pub, p_priv_wrapped: rec.privWrapped, p_wrap_main: g.wrap_main, p_wrap_health: g.wrap_health, p_tag: g.tag });
    return rec.code;
  }

  const securityCode = async baby => { const c = current(baby); return c ? digits(unb64(await hmac(c.main, 'll1|code|' + baby))) : ''; };
  async function forget(baby) { delete store[baby]; await Native.Secure.remove(skey(baby)); }
  async function wipeUser(uid) { dev = null; joinSecret = null; await Native.Secure.remove(dkey(uid)); await Native.Secure.remove('e2ee.join'); await Native.Secure.remove('e2ee.invites'); }

  return {
    load, ensureDevice, refresh, createLog, makeGrant, unlockWithRecovery, grantForRequest, approveDevice, healthGrants, rotate, replaceRecovery,
    encryptEntry, decryptRow, decryptWith, encryptProfile, decryptProfile, sealDetails, openDetails,
    uuid, newSecret, rememberInvite, inviteSecret, joinProof, verifyRequest, setJoinSecret, joinSecretGet, tagOk, selfGrant,
    fingerprint, securityCode, forget, wipeUser,
    get device() { return dev; },
    hasKeys: baby => !!(store[baby] && raw(baby, store[baby].epoch, 'main')),
    hasHealthKey: baby => !!(store[baby] && raw(baby, store[baby].epoch, 'health')),
    epoch: baby => (store[baby] ? store[baby].epoch : 0),
    keysOf: baby => (store[baby] ? store[baby].keys : {}),
    normCode,
  };
})();
