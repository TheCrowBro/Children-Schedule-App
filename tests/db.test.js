// Database security tests: runs supabase/schema.sql on a real Postgres and tries to break the rules as different people.
//   node tests/db.test.js          (starts a throwaway cluster; or set PGURL to use your own)
// Entries are opaque blobs here (the server can't read them); crypto itself is exercised in the end-to-end suite.
const assert = require('assert');
const fs = require('fs'), path = require('path');
const { startCluster, freshDb, dbFrom, dropDb, actor } = require('./lib/pg');

let n = 0, failed = 0;
const t = async (name, fn) => { try { await fn(); n++; console.log('✓', name); } catch (e) { failed++; console.log('✗', name, '\n   ', e.message.split('\n')[0]); } };
const rejects = async (p, re, msg) => { try { await p; } catch (e) { if (!re.test(e.message)) throw new Error((msg || 'wrong error') + ': ' + e.message); return; } throw new Error((msg || 'expected an error') + ' but it succeeded'); };
const now = () => Date.now();
let seq = 0;
const pub = () => { const k = String(++seq).padStart(4, '0'); return { kty: 'EC', crv: 'P-256', x: ('X' + k).padEnd(43, 'A'), y: ('Y' + k).padEnd(43, 'B') }; };
const W = (tag = 'w') => ('{"epk":"' + tag + '"}').padEnd(40, '-');
const HC = 'hc'.repeat(20);
const grant = (health = true, extra = {}) => ({ wrap_main: W('m'), wrap_health: health ? W('h') : null, tag: 'tag', ...extra });
const BLOB = 'B'.repeat(40);
const ev = (id, o = {}) => ({ id, blob: BLOB, epoch: 1, sensitive: false, updated: now(), deleted: false, ...o });
const bad = async (who, code, dev) => assert.equal((await who('select redeem_invite($1,$2,$3,$4) r', [code, '', dev, null]))[0].r.status, 'invalid');
const names = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

(async () => {
  const admin = startCluster();
  try {
    const { url, su } = await freshDb(admin);
    const id = {}; for (const x of names) id[x] = (await su.query(`insert into auth.users(email) values ($1) returning id`, [x.toLowerCase() + '@x.com'])).rows[0].id;
    const as = (x, aal = 'aal2') => actor(url, { sub: id[x], email: x.toLowerCase() + '@x.com', aal });
    const anon = actor(url, { role: 'anon' });
    const A = as('A'), A1 = as('A', 'aal1'), B = as('B'), C = as('C'), D = as('D'), E = as('E'), F = as('F'), G = as('G'), H = as('H');
    const q = async (sql, p) => (await su.query(sql, p)).rows;
    const dev = async (who, name = 'phone') => (await who('select register_device($1,$2::jsonb) d', [name, JSON.stringify(pub())]))[0].d;
    const push = (who, baby, rows) => who('select push_events($1,$2::jsonb) r', [baby, JSON.stringify(rows)]).then(r => r[0].r);
    const denied = async (who, baby, rows) => (await push(who, baby, rows)).denied;
    const dA = {}; // device ids per user

    let baby;
    await t('a new user registers a phone and creates a log; keys are stored only as opaque wrapped blobs', async () => {
      dA.A = await dev(A1, 'Mum phone');
      baby = (await A1('select create_baby($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7::jsonb,null,$8) b', ['P'.repeat(40), 'Mum', dA.A, JSON.stringify(grant()), JSON.stringify(pub()), 'R'.repeat(40), JSON.stringify(grant()), HC]))[0].b;
      assert.equal((await q('select role from members where baby_id=$1', [baby]))[0].role, 'parent');
      const g = await q('select grantee, epoch from key_grants where baby_id=$1 order by grantee', [baby]);
      assert.deepEqual(g.map(x => x.grantee), ['d:' + dA.A, 'recovery'].sort()); assert(g.every(x => x.epoch === 1));
      assert.equal((await q('select epoch, rotate_needed from babies'))[0].epoch, 1);
    });
    await t('creating a log without both keys, a real phone, or a valid recovery key is refused', async () => {
      const d = await dev(B); const mk = (g, rg, rp = pub(), hc = HC) => B('select create_baby($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7::jsonb,null,$8)', ['P', 'x', d, JSON.stringify(g), JSON.stringify(rp), 'R', JSON.stringify(rg), hc]);
      await rejects(mk(grant(false), grant()), /both keys/); await rejects(mk(grant(), grant(false)), /both keys/); await rejects(mk(grant(), grant(), { kty: 'EC' }), /bad recovery/); await rejects(mk(grant(), grant(), pub(), null), /health check is required/);
      await rejects(B('select create_baby($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7::jsonb,null,$8)', ['P', 'x', dA.A, JSON.stringify(grant()), JSON.stringify(pub()), 'R', JSON.stringify(grant()), HC]), /unknown phone/, 'someone else\'s phone');
    });
    await t('the phone chooses the log\'s id (it is part of what the keys are wrapped to); an id can\'t be reused', async () => {
      const uid = (await su.query(`insert into auth.users(email) values ('own@x.com') returning id`)).rows[0].id, O = actor(url, { sub: uid, email: 'own@x.com' });
      const d = await dev(O, 'own'), mine = '11111111-2222-3333-4444-555555555555';
      const mk = pid => O('select create_baby($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7::jsonb,$8,$9) b', ['P'.repeat(40), 'Own', d, JSON.stringify(grant()), JSON.stringify(pub()), 'R'.repeat(40), JSON.stringify(grant()), pid, HC]);
      assert.equal((await mk(mine))[0].b, mine); await rejects(mk(mine), /duplicate key/);
      await q('delete from babies where id=$1', [mine]);
    });
    await t('a parent WITHOUT two-step verification has no access: no data, no keys, no admin', async () => {
      assert.equal((await A1('select * from babies')).length, 0);
      await rejects(push(A1, baby, [ev('x1')]), /no access/);
      await rejects(A1('select * from list_people($1)', [baby]), /no access/);
      await rejects(A1('select * from my_grant($1,$2)', [baby, dA.A]), /no access/);
      await rejects(A1('select * from get_recovery($1)', [baby]), /no access/);
      await rejects(A1('select * from list_devices($1)', [baby]), /no access/);
      await rejects(A1('select create_invite($1,$2)', [baby, 'friend']), /Only parents/);
      assert.equal((await A1('select role from members')).length, 1, 'can still read own membership (so the app knows to ask for MFA)');
    });
    await t('with two-step verification the parent has full access', async () => {
      assert.equal((await A('select * from babies')).length, 1);
      assert.deepEqual((await push(A, baby, [ev('e1')])).denied, []);
      assert.equal((await A('select * from my_grant($1,$2)', [baby, dA.A]))[0].wrap_health, W('h'));
    });

    // ---- invites & approvals ----
    const invite = async (role, perms = {}) => (await A('select create_invite($1,$2,$3::jsonb) c', [baby, role, JSON.stringify(perms)]))[0].c;
    const redeem = async (who, key, code, proof = null) => { dA[key] = dA[key] || await dev(who, key + ' phone'); return (await who('select redeem_invite($1,$2,$3,$4) r', [code, '', dA[key], proof]))[0].r; };
    const vhOf = (role, perms) => role === 'parent' || perms.view_health !== false;
    async function enroll(who, key, role, perms = {}) {
      const c = await invite(role, perms); await redeem(who, key, c);
      const r = (await A('select * from list_requests($1)', [baby])).find(x => x.email === key.toLowerCase() + '@x.com');
      await A('select decide_request($1,true,null,null,$2::jsonb)', [r.id, JSON.stringify(grant(vhOf(role, perms)))]);
    }
    let inviteB;
    await t('invites last 2 hours; a request carries the phone and QR proof; nothing is visible until approved', async () => {
      inviteB = await invite('family');
      const [row] = await q('select extract(epoch from expires_at-created_at) s from invites where code=$1', [inviteB]); assert.equal(Math.round(row.s), 7200);
      await rejects(B('select redeem_invite($1,$2,$3,$4)', [inviteB, '', dA.A, null]), /unknown phone/, 'must use your own phone');
      assert.equal((await redeem(B, 'B', inviteB, 'proof-abc')).status, 'pending');
      assert.equal((await B('select * from babies')).length, 0); assert.equal((await B('select * from events')).length, 0);
      await rejects(push(B, baby, [ev('b0')]), /no access/);
      await rejects(B('select * from my_grant($1,$2)', [baby, dA.B]), /no access/);
      const [rq] = await A('select * from list_requests($1)', [baby]);
      assert.equal(rq.email, 'b@x.com'); assert.equal(rq.invite_code, inviteB); assert.equal(rq.proof, 'proof-abc'); assert.equal(rq.device_id, dA.B); assert.equal(rq.device_pub.kty, 'EC');
      await bad(C, inviteB, await dev(C, 'C0'));
    });
    await t('approval must share the keys; the health key goes exactly to people allowed health notes', async () => {
      const [r] = await A('select id from list_requests($1)', [baby]);
      await rejects(B('select decide_request($1,true)', [r.id]), /Only parents/);
      await rejects(as('A', 'aal1')('select decide_request($1,true)', [r.id]), /Only parents/, 'parent without MFA');
      await rejects(A('select decide_request($1,true)', [r.id]), /keys must be shared/);
      await rejects(A('select decide_request($1,true,null,null,$2::jsonb)', [r.id, JSON.stringify(grant(false))]), /health key must be given/, 'family has health access: needs the health key');
      await rejects(A('select decide_request($1,true,$2,$3::jsonb,$4::jsonb)', [r.id, 'family', '{"view_health":false}', JSON.stringify(grant(true))]), /health key must be given/, 'no health access: must NOT get the health key');
      await A('select decide_request($1,true,null,null,$2::jsonb)', [r.id, JSON.stringify(grant(true, { auth: 'qr-auth' }))]);
      assert.equal((await B('select * from babies')).length, 1);
      const g = (await B('select * from my_grant($1,$2)', [baby, dA.B]))[0]; assert.equal(g.wrap_main, W('m')); assert.equal(g.auth, 'qr-auth'); assert.equal(g.granted_by_name, 'Mum');
      await rejects(A('select decide_request($1,true)', [r.id]), /no longer pending/);
    });
    await t('denied and expired requests stay out; rescinded and expired invites fail', async () => {
      await redeem(C, 'C', await invite('friend')); const [r] = await A('select id from list_requests($1)', [baby]);
      await A('select decide_request($1,false)', [r.id]); assert.equal((await C('select * from babies')).length, 0); assert.equal((await C('select status from my_requests()'))[0].status, 'denied');
      await redeem(D, 'D', await invite('friend')); await su.query(`update join_requests set expires_at = now() - interval '1 minute' where user_id=$1`, [id.D]);
      assert.equal((await A('select * from list_requests($1)', [baby])).length, 0);
      const [{ id: rid }] = await q(`select id from join_requests where user_id=$1`, [id.D]); await rejects(A('select decide_request($1,true,null,null,$2::jsonb)', [rid, JSON.stringify(grant())]), /no longer pending/);
      const c = await invite('friend'); await rejects(B('select rescind_invite($1)', [c]), /Only parents/); await A('select rescind_invite($1)', [c]); await bad(C, c, dA.C);
      const c2 = await invite('friend'); await su.query(`update invites set expires_at = now() - interval '1 second' where code=$1`, [c2]); await bad(C, c2, dA.C);
      await su.query('delete from join_requests where user_id in ($1,$2)', [id.C, id.D]);
    });
    await t('guessing invite codes is rate limited; at most 10 open invites', async () => {
      const f = await dev(F, 'F0');
      for (let i = 0; i < 10; i++) await bad(F, 'BADCODE' + i, f);
      await rejects(F('select redeem_invite($1,$2,$3,$4)', ['BADCODEXX', '', f, null]), /Too many attempts/); await su.query('delete from invite_attempts');
      await su.query('delete from invites where used_by is null');
      for (let i = 0; i < 10; i++) await invite('friend');
      await rejects(invite('friend'), /Too many open invites/); await su.query('delete from invites where used_by is null');
    });

    await enroll(C, 'C', 'caregiver');
    await enroll(D, 'D', 'babysitter', { edit_others: true, view_people: true });
    await enroll(E, 'E', 'friend', { view_health: false });

    await t('permission presets: family limits are hard, others follow the check boxes', async () => {
      const m = Object.fromEntries((await q('select user_id, perms from members where baby_id=$1', [baby])).map(r => [r.user_id, r.perms]));
      assert.equal(m[id.B].edit_others, false); assert.equal(m[id.B].edit_profile, false); assert.equal(m[id.B].view_people, true);
      assert.equal(m[id.C].add_entries, true); assert.equal(m[id.C].edit_others, false); assert.equal(m[id.D].edit_others, true); assert.equal(m[id.E].view_health, false);
      const c = await invite('family', { edit_others: true, delete_others: true, edit_profile: true });
      assert.deepEqual((await q('select perms from invites where code=$1', [c]))[0].perms, m[id.B], 'family flags forced off'); await A('select rescind_invite($1)', [c]);
    });
    await t('the health key is withheld from people without health access (grants, recovery, keyring)', async () => {
      assert.equal((await E('select wrap_health from my_grant($1,$2)', [baby, dA.E]))[0].wrap_health, null);
      assert.equal((await C('select wrap_health from my_grant($1,$2)', [baby, dA.C]))[0].wrap_health, W('h'));
      assert.equal((await E('select wrap_health from get_recovery($1)', [baby]))[0].wrap_health, null);
      assert.equal((await C('select wrap_health from get_recovery($1)', [baby]))[0].wrap_health, W('h'));
      assert.equal((await E('select keyring_health from get_keyring($1)', [baby]))[0].keyring_health, null);
      await rejects(E('select * from my_grant($1,$2)', [baby, dA.C]), /unknown phone/, 'only your own phone');
    });

    await t('edit/delete: own entries yes, other people\'s only with the permission', async () => {
      assert.deepEqual(await denied(B, baby, [ev('b1')]), []);
      assert.deepEqual(await denied(B, baby, [ev('b1', { blob: 'E'.repeat(40), updated: now() + 10 })]), [], 'edit own');
      assert.deepEqual(await denied(B, baby, [ev('e1', { updated: now() + 10 })]), ['e1'], 'family cannot edit a parent\'s entry');
      assert.deepEqual(await denied(B, baby, [ev('e1', { deleted: true, updated: now() + 10 })]), ['e1'], 'family cannot delete others\'');
      assert.deepEqual(await denied(C, baby, [ev('b1', { updated: now() + 10 })]), ['b1'], 'caregiver cannot edit others\'');
      assert.deepEqual(await denied(D, baby, [ev('b1', { blob: 'D'.repeat(40), updated: now() + 20 })]), [], 'babysitter with edit_others can');
      assert.deepEqual(await denied(D, baby, [ev('b1', { deleted: true, updated: now() + 30 })]), ['b1'], 'but not delete others\' (box unticked)');
      assert.equal((await q(`select blob from events where id='b1'`))[0].blob, 'D'.repeat(40));
      assert.deepEqual(await denied(B, baby, [ev('b1', { deleted: true, updated: now() + 40 })]), [], 'owner of the entry can delete it');
      assert.equal((await q(`select deleted, blob from events where id='b1'`))[0].blob, '', 'tombstone keeps no content');
    });
    await t('parents can edit and delete anything', async () => {
      assert.deepEqual(await denied(C, baby, [ev('c1')]), []);
      assert.deepEqual(await denied(A, baby, [ev('c1', { updated: now() + 50 })]), []); assert.deepEqual(await denied(A, baby, [ev('c1', { deleted: true, updated: now() + 60 })]), []);
    });
    await t('a person with no "add" permission cannot add (but can read)', async () => {
      const c = await invite('friend', { add_entries: false }); await redeem(F, 'F', c); const [r] = await A('select id from list_requests($1)', [baby]);
      await A('select decide_request($1,true,null,null,$2::jsonb)', [r.id, JSON.stringify(grant())]); await su.query('delete from invite_attempts');
      assert.deepEqual(await denied(F, baby, [ev('f1')]), ['f1']); assert.equal((await F('select * from events where id=$1', ['e1'])).length, 1);
    });
    await t('health-class entries need the health permission (read, write, edit), and the class can\'t be changed', async () => {
      assert.deepEqual(await denied(A, baby, [ev('h1', { sensitive: true }), ev('m1', { sensitive: true })]), []);
      assert.equal((await E('select * from events where sensitive')).length, 0, 'hidden from E'); assert.equal((await C('select * from events where sensitive')).length, 2, 'visible to C');
      assert.deepEqual(await denied(E, baby, [ev('h2', { sensitive: true })]), ['h2']);
      assert.deepEqual(await denied(E, baby, [ev('h1', { sensitive: true, updated: now() + 99 })]), ['h1']);
      assert.deepEqual(await denied(C, baby, [ev('h1', { sensitive: false, updated: now() + 99 })]), ['h1'], 'cannot turn a health entry into a normal one');
      assert.deepEqual(await denied(C, baby, [ev('c9')]), []); assert.deepEqual(await denied(C, baby, [ev('c9', { sensitive: true, updated: now() + 5 })]), ['c9'], 'nor the reverse');
    });
    await t('writes straight to any table are impossible for everyone, parents included', async () => {
      for (const who of [A, B, C]) {
        for (const sql of [`insert into events(baby_id,id,blob,epoch,updated,created_by) values ('${baby}','z','${BLOB}',1,1,'${id.A}')`, `update events set blob='x'`, `delete from events`,
          `update members set role='parent'`, `insert into members(baby_id,user_id,role) values ('${baby}','${id.B}','parent')`, `update babies set profile='x'`, `update babies set epoch=99`,
          `insert into invites(code,baby_id,role,created_by) values ('FORGED1234','${baby}','parent','${id.A}')`, `delete from activity`, `select * from activity`, `select * from invites`,
          `select * from join_requests`, `select * from key_grants`, `select * from devices`, `insert into key_grants(baby_id,grantee,epoch,wrap_main) values ('${baby}','recovery',1,'x')`, `update devices set pubkey='{}'`])
          await rejects(who(sql), /permission denied/, sql.slice(0, 40));
      }
    });
    await t('anonymous users can call nothing', async () => {
      await rejects(anon('select register_device($1,$2::jsonb)', ['x', JSON.stringify(pub())]), /permission denied/); await rejects(anon('select * from events'), /permission denied/);
      await rejects(anon('select push_events($1,$2::jsonb)', [baby, '[]']), /permission denied/); await rejects(anon('select * from my_grant($1,$2)', [baby, dA.A]), /permission denied/);
    });
    await t('strangers see nothing and cannot write or fetch keys', async () => {
      const sid = (await su.query(`insert into auth.users(email) values ('s@x.com') returning id`)).rows[0].id, S = actor(url, { sub: sid, email: 's@x.com' }), sd = await dev(S, 'S');
      assert.equal((await S('select * from events')).length, 0); assert.equal((await S('select * from babies')).length, 0);
      await rejects(push(S, baby, [ev('s1')]), /no access/); await rejects(S('select * from activity_log($1)', [baby]), /Only parents/);
      await rejects(S('select * from my_grant($1,$2)', [baby, sd]), /no access/); await rejects(S('select * from get_recovery($1)', [baby]), /no access/); await rejects(S('select * from get_keyring($1)', [baby]), /no access/);
      await rejects(S('select grant_device($1,$2,$3,$4,$5,$6)', [baby, sd, W(), W(), null, 't']), /no access/, 'cannot give themselves keys');
    });

    await t('entries are validated: ids, size, epoch, batch size; old keys get a "stale" answer instead of being lost', async () => {
      const rows = [ev('v1', { blob: 'x'.repeat(9000) }), ev('v2', { blob: 'short' }), ev('bad id!'), ev('v3', { epoch: 0 }), { id: 'v4', blob: BLOB }, { ...ev('v5'), updated: 'abc' }];
      assert.equal((await denied(C, baby, rows)).length, rows.length);
      await rejects(push(C, baby, Array.from({ length: 501 }, (_, i) => ev('big' + i))), /bad batch/);
      const r = await push(C, baby, [ev('old1', { epoch: 7 })]); assert.equal(r.stale, 1); assert.deepEqual(r.denied, []); assert.equal((await q(`select count(*)::int c from events where id='old1'`))[0].c, 0);
    });
    await t('a wrong phone clock cannot pin an entry against later edits; stale writes are ignored', async () => {
      assert.deepEqual(await denied(C, baby, [ev('p1', { updated: 9e15 })]), []);
      assert(Number((await q(`select updated from events where id='p1'`))[0].updated) <= now() + 61000);
      assert.deepEqual(await denied(C, baby, [ev('p1', { blob: 'L'.repeat(40), updated: now() + 120000 })]), []); assert.equal((await q(`select blob from events where id='p1'`))[0].blob, 'L'.repeat(40));
      assert.deepEqual(await denied(C, baby, [ev('p1', { blob: 'O'.repeat(40), updated: 5 })]), []); assert.equal((await q(`select blob from events where id='p1'`))[0].blob, 'L'.repeat(40));
    });

    await t('people list: names for all, emails/roles only with permission, permissions only for parents', async () => {
      const forE = await E('select * from list_people($1)', [baby]); assert.equal(forE.length, 6);
      assert(forE.every(p => p.email === null && p.role === null && p.perms === null) && forE.every(p => p.display_name));
      assert((await D('select * from list_people($1)', [baby])).every(p => p.email && p.role && p.perms === null));
      const forA = await A('select * from list_people($1)', [baby]); assert(forA.every(p => p.perms !== null)); assert.equal(forA.find(p => p.is_you).display_name, 'Mum');
    });

    await t('phones: a parent sees everyone\'s and which already hold keys; others only their own', async () => {
      const all = await A('select * from list_devices($1)', [baby]); assert(all.length >= 6); assert(all.find(d => d.grantee === 'd:' + dA.A).has_grant);
      const eDev = all.find(d => d.grantee === 'd:' + dA.E); assert.equal(eDev.has_grant, true); assert.equal(eDev.view_health, false); assert.equal(eDev.tag, 'tag');
      const own = await C('select * from list_devices($1)', [baby]); assert(own.length >= 1 && own.every(d => d.user_id === id.C) && own.some(d => d.grantee === 'd:' + dA.C), 'only C\'s own phones');
      assert.equal((await A('select * from list_recovery($1)', [baby]))[0].tag, 'tag'); await rejects(C('select * from list_recovery($1)', [baby]), /Only parents/);
    });
    await t('a second phone of the same person starts without keys and needs approval (by a parent or their own first phone)', async () => {
      const d2 = await dev(C, 'C second');
      assert.equal((await A('select * from list_devices($1)', [baby])).find(d => d.grantee === 'd:' + d2).has_grant, false);
      await rejects(C('select * from my_grant($1,$2)', [baby, d2]).then(r => { if (!r.length) throw new Error('none'); }), /none/);
      await rejects(D('select grant_device($1,$2,$3,$4,$5,$6)', [baby, d2, W(), W(), null, 't']), /Only parents can approve/, 'another member cannot approve it');
      await rejects(C('select grant_device($1,$2,$3,$4,$5,$6)', [baby, d2, W(), null, null, 't']), /health key must be given/);
      await C('select grant_device($1,$2,$3,$4,$5,$6)', [baby, d2, W('m2'), W('h2'), null, 'tag2']);
      assert.equal((await C('select wrap_main from my_grant($1,$2)', [baby, d2]))[0].wrap_main, W('m2'));
      const d3 = await dev(C, 'C third'); await A('select grant_device($1,$2,$3,$4,$5,$6)', [baby, d3, W('m3'), W('h3'), null, 'tag3']);
      assert.equal((await C('select wrap_main from my_grant($1,$2)', [baby, d3]))[0].wrap_main, W('m3'));
      const dE = await dev(E, 'E second'); await rejects(A('select grant_device($1,$2,$3,$4,$5,$6)', [baby, dE, W(), W(), null, 't']), /health key must be given/, 'E has no health access');
      await A('select grant_device($1,$2,$3,$4,$5,$6)', [baby, dE, W(), null, null, 't']);
      const stranger = (await su.query(`insert into auth.users(email) values ('s2@x.com') returning id`)).rows[0].id, sd = await dev(actor(url, { sub: stranger, email: 's2@x.com' }), 'S');
      await rejects(A('select grant_device($1,$2,$3,$4,$5,$6)', [baby, sd, W(), W(), null, 't']), /not a member/, 'cannot give keys to a non-member\'s phone');
    });
    await t('removing a phone deletes its keys and asks for a key rotation', async () => {
      const d = await dev(C, 'C lost'); await A('select grant_device($1,$2,$3,$4,$5,$6)', [baby, d, W(), W(), null, 't']);
      await rejects(D('select remove_device($1)', [d]).then(() => q(`select count(*)::int c from devices where id=$1`, [d])).then(r => { if (r[0].c) throw new Error('still there'); }), /still there/, 'cannot remove someone else\'s phone');
      await su.query(`insert into auth.mfa_factors(user_id,status) values ($1,'verified')`, [id.C]);
      await rejects(as('C', 'aal1')('select remove_device($1)', [d]), /Two-step verification/, 'with two-step verification set up, an email code alone cannot cut a phone off');
      await C('select remove_device($1)', [d]);
      assert.equal((await q(`select count(*)::int c from key_grants where grantee=$1`, ['d:' + d]))[0].c, 0); assert.equal((await q('select rotate_needed from babies'))[0].rotate_needed, true);
      await su.query('update babies set rotate_needed=false');
    });

    await t('only parents rotate keys: next epoch only, members\' phones only, health key only for people with health access, recovery required', async () => {
      const devs = await A('select * from list_devices($1)', [baby]); const gr = devs.filter(d => d.has_grant).map(d => ({ grantee: d.grantee, wrap_main: W('n'), wrap_health: d.view_health ? W('nh') : null, tag: 'nt', auth: '{"1":"chain"}' }));
      const rec = { grantee: 'recovery', wrap_main: W('n'), wrap_health: W('nh'), tag: 'nt' };
      const rot = (who, ep, grants, hc = 'HC2'.repeat(10)) => who('select rotate_keys($1,$2,$3::jsonb,$4,$5,$6,$7)', [baby, ep, JSON.stringify(grants), 'KM'.repeat(20), 'KH'.repeat(20), 'NEWPROFILE'.repeat(5), hc]);
      await rejects(rot(B, 2, [...gr, rec]), /Only parents/); await rejects(rot(A, 3, [...gr, rec]), /stale epoch/); await rejects(rot(A, 1, [...gr, rec]), /stale epoch/);
      await rejects(rot(A, 2, gr), /recovery grant is required/); await rejects(rot(A, 2, [...gr, rec], null), /health check is required/);
      await rejects(rot(A, 2, [...gr.map(g => g.grantee === 'd:' + dA.E ? { ...g, wrap_health: W() } : g), rec]), /health key must be given/);
      await rejects(rot(A, 2, [...gr, rec, { grantee: 'd:' + (await q(`select id from devices where user_id=$1 and name='S'`, [id.A]).then(r => r[0] ? r[0].id : '00000000-0000-0000-0000-000000000000')), wrap_main: W(), wrap_health: W() }]), /not a member/);
      assert.equal((await q('select epoch from babies'))[0].epoch, 1, 'failed attempts changed nothing');
      assert.equal((await q('select count(*)::int c from key_grants'))[0].c, devs.filter(d => d.has_grant).length + 1);
      await su.query('update babies set rotate_needed=true'); await rot(A, 2, [...gr, rec]);
      const b = (await q('select epoch, rotate_needed, keyring_main, profile from babies'))[0]; assert.equal(b.epoch, 2); assert.equal(b.rotate_needed, false); assert.equal((await C('select health_check from get_keyring($1)', [baby]))[0].health_check, 'HC2'.repeat(10), 'members can read the health check (it reveals nothing)'); assert.equal(b.keyring_main, 'KM'.repeat(20)); assert(b.profile.startsWith('NEWPROFILE'));
      assert((await q('select epoch from key_grants')).every(g => g.epoch === 2), 'old grants replaced');
      assert.equal((await q(`select auth from key_grants where grantee=$1`, ['d:' + dA.C]))[0].auth, '{"1":"chain"}', 'the key-change proof is stored for the receiving phone');
      assert.equal((await C('select wrap_main from my_grant($1,$2)', [baby, dA.C]))[0].wrap_main, W('n'));
      assert.equal((await E('select wrap_health from my_grant($1,$2)', [baby, dA.E]))[0].wrap_health, null);
    });
    await t('after a rotation, old entries stay readable but new/edited content must use the new epoch', async () => {
      assert.equal((await C('select * from events where id=$1', ['e1'])).length, 1);
      const r = await push(A, baby, [ev('e1', { epoch: 1, updated: now() + 700 })]); assert.equal(r.stale, 2); assert.equal((await q(`select epoch from events where id='e1'`))[0].epoch, 1);
      assert.deepEqual((await push(A, baby, [ev('e1', { epoch: 2, updated: now() + 800 })])).denied, []); assert.equal((await q(`select epoch from events where id='e1'`))[0].epoch, 2);
      assert.deepEqual((await push(A, baby, [ev('e1', { epoch: 1, deleted: true, updated: now() + 900 })])).denied, [], 'a delete needs no key');
    });
    await t('recovery code can be replaced by a parent only', async () => {
      const call = (who) => who('select set_recovery($1,$2::jsonb,$3,$4,$5,$6)', [baby, JSON.stringify(pub()), 'NEWPRIV'.repeat(8), W('rm'), W('rh'), 'rtag']);
      await rejects(call(B), /Only parents/); await call(A);
      assert.equal((await C('select wrap_main from get_recovery($1)', [baby]))[0].wrap_main, W('rm')); assert.equal((await q(`select recovery_priv_wrapped from babies`))[0].recovery_priv_wrapped, 'NEWPRIV'.repeat(8));
      await rejects(A('select set_recovery($1,$2::jsonb,$3,$4,$5,$6)', [baby, JSON.stringify({ kty: 'EC' }), 'x', W(), W(), 't']), /bad recovery/);
    });

    await t('only parents change roles; the last parent cannot be demoted or removed; people can leave', async () => {
      await rejects(B('select set_member($1,$2,$3,$4::jsonb)', [baby, id.C, 'parent', '{}']), /Only parents/);
      await rejects(A('select set_member($1,$2,$3,$4::jsonb)', [baby, id.A, 'friend', '{}']), /at least one parent/);
      await rejects(A('select remove_member($1,$2)', [baby, id.A]), /last parent/); await rejects(C('select remove_member($1,$2)', [baby, id.D]), /Only parents/);
      await A('select set_member($1,$2,$3,$4::jsonb)', [baby, id.C, 'caregiver', '{"edit_others":true}']);
      assert.deepEqual(await denied(C, baby, [ev('b1', { blob: 'N'.repeat(40), epoch: 2, updated: now() + 2000 })]), [], 'new box takes effect immediately');
      await A('select set_member($1,$2,$3,$4::jsonb)', [baby, id.C, 'caregiver', '{"edit_others":false}']);
    });
    await t('only parents rename members (the name the family sees in this log, trimmed, logged); an empty name or a stranger is refused', async () => {
      await rejects(C('select rename_member($1,$2,$3)', [baby, id.A, 'Mummy']), /Only parents/);
      const was = (await q('select display_name from members where baby_id=$1 and user_id=$2', [baby, id.C]))[0].display_name;
      await A('select rename_member($1,$2,$3)', [baby, id.C, '  Nanny Carol  ']);
      assert.equal((await q('select display_name from members where baby_id=$1 and user_id=$2', [baby, id.C]))[0].display_name, 'Nanny Carol', 'trimmed');
      assert.equal((await A('select * from list_people($1)', [baby])).find(p => p.user_id === id.C).display_name, 'Nanny Carol', 'as everyone lists them');
      await rejects(A('select rename_member($1,$2,$3)', [baby, id.C, '   ']), /Enter a name/); await rejects(A('select rename_member($1,$2,$3)', [baby, '00000000-0000-0000-0000-000000000001', 'x']), /not a member/);
      assert.deepEqual((await q(`select detail from activity where baby_id=$1 and action='member_renamed'`, [baby])).map(r => [r.detail.person, r.detail.name]), [[was || 'c', 'Nanny Carol']], 'the activity log says who was renamed to what');
      await A('select rename_member($1,$2,$3)', [baby, id.C, was || 'c']);
    });
    await t('health access: gaining it needs the health key for each phone; losing it removes the key and asks for rotation', async () => {
      await rejects(A('select set_member($1,$2,$3,$4::jsonb)', [baby, id.E, 'friend', '{"view_health":true}']), /health key grants are required/);
      const dE = (await A('select * from list_devices($1)', [baby])).filter(d => d.user_id === id.E && d.has_grant).map(d => d.grantee.slice(2));
      await A('select set_member($1,$2,$3,$4::jsonb,$5::jsonb)', [baby, id.E, 'friend', '{"view_health":true}', JSON.stringify(dE.map(d => ({ device: d, wrap_health: W('eh') })))]);
      assert.equal((await E('select wrap_health from my_grant($1,$2)', [baby, dA.E]))[0].wrap_health, W('eh'));
      assert.equal((await E('select count(*)::int c from events where sensitive'))[0].c > 0, true, 'now sees health entries');
      await A('select set_member($1,$2,$3,$4::jsonb)', [baby, id.E, 'friend', '{"view_health":false}']);
      assert.equal((await E('select wrap_health from my_grant($1,$2)', [baby, dA.E]))[0].wrap_health, null); assert.equal((await q('select rotate_needed from babies'))[0].rotate_needed, true);
      assert.equal((await E('select count(*)::int c from events where sensitive'))[0].c, 0); await su.query('update babies set rotate_needed=false');
    });
    await t('removing someone ends their access and deletes their keys; the log asks for rotation', async () => {
      await A('select remove_member($1,$2)', [baby, id.E]);
      assert.equal((await E('select * from events')).length, 0); await rejects(push(E, baby, [ev('e9', { epoch: 2 })]), /no access/); await rejects(E('select * from my_grant($1,$2)', [baby, dA.E]), /no access/);
      assert.equal((await q(`select count(*)::int c from key_grants where grantee=$1`, ['d:' + dA.E]))[0].c, 0); assert.equal((await q('select rotate_needed from babies'))[0].rotate_needed, true);
      await F('select remove_member($1,$2)', [baby, id.F]); await su.query('update babies set rotate_needed=false');
    });
    await t('retiring a helper (caregiver, babysitter, medical assistant, friend) ends their access like removing them; a note of who they were stays', async () => {
      await enroll(G, 'G', 'medical'); await enroll(H, 'H', 'babysitter');
      assert.equal((await q('select role from members where user_id=$1', [id.G]))[0].role, 'medical', 'the medical assistant role');
      await G('select set_my_details($1,$2,$3)', [baby, 'D'.repeat(60), 1]);   // their contact details (ciphertext, as always)
      await rejects(G('select retire_member($1,$2,$3)', [baby, id.H, 'moved']), /Only parents/);
      await rejects(as('A', 'aal1')('select retire_member($1,$2,$3)', [baby, id.G, 'moved']), /Only parents/, 'parent without MFA');
      await rejects(A('select retire_member($1,$2,$3)', [baby, id.A, 'moved']), /Only caregivers, babysitters, medical assistants and friends/, 'never a parent or family member');
      await rejects(A('select retire_member($1,$2,$3)', [baby, id.G, 'gone fishing']), /bad reason/);
      await A('select retire_member($1,$2,$3)', [baby, id.G, 'moved']);
      assert.equal((await G('select * from events')).length, 0, 'no more access'); await rejects(G('select * from my_grant($1,$2)', [baby, dA.G]), /no access/);
      assert.equal((await q(`select count(*)::int c from key_grants where grantee=$1`, ['d:' + dA.G]))[0].c, 0); assert.equal((await q('select rotate_needed from babies'))[0].rotate_needed, true);
      const r = await A('select * from list_retired($1)', [baby]);
      assert.deepEqual(r.map(x => [x.display_name, x.role, x.reason, x.details, x.details_epoch, x.user_id]), [['g', 'medical', 'moved', 'D'.repeat(60), 1, id.G]]);
      assert((await A('select * from activity_log($1)', [baby])).some(l => l.action === 'member_retired' && l.detail.person === 'g' && l.detail.reason === 'moved'));
      assert.deepEqual(await H('select * from list_retired($1)', [baby]), [], 'only for people who may see the family list');
      await rejects(G('select * from list_retired($1)', [baby]), /no access/, 'not the retired person');
      await rejects(H('select forget_retired($1)', [r[0].id]), /Only parents/);
      await A('select retire_member($1,$2,$3)', [baby, id.H, 'passed']);
      await A('select forget_retired($1)', [r[0].id]);
      assert.deepEqual((await A('select * from list_retired($1)', [baby])).map(x => [x.display_name, x.reason]), [['h', 'passed']], 'a parent can delete the note');
      await H('select delete_my_account()'); assert.deepEqual(await A('select * from list_retired($1)', [baby]), [], 'a deleted account takes the note about it along');
      await su.query('update babies set rotate_needed=false');
    });
    await t('a second parent can be added; then the first may step down', async () => {
      await A('select set_member($1,$2,$3,$4::jsonb,$5::jsonb)', [baby, id.B, 'parent', '{}', JSON.stringify((await A('select * from list_devices($1)', [baby])).filter(d => d.user_id === id.B).map(d => ({ device: d.grantee.slice(2), wrap_health: W('bh') })))]);
      assert.equal((await q(`select perms from members where user_id=$1`, [id.B]))[0].perms.edit_others, true);
      const bName = (await q('select display_name from members where baby_id=$1 and user_id=$2', [baby, id.B]))[0].display_name;   // (a parent can rename the other parent, and the other way round)
      await A('select rename_member($1,$2,$3)', [baby, id.B, 'Papa']); assert.equal((await q('select display_name from members where baby_id=$1 and user_id=$2', [baby, id.B]))[0].display_name, 'Papa');
      await B('select rename_member($1,$2,$3)', [baby, id.A, 'Mama']); assert.equal((await q('select display_name from members where baby_id=$1 and user_id=$2', [baby, id.A]))[0].display_name, 'Mama');
      await B('select rename_member($1,$2,$3)', [baby, id.A, 'Mum']); await A('select rename_member($1,$2,$3)', [baby, id.B, bName]);
      await rejects(as('B', 'aal1')('select * from list_people($1)', [baby]), /no access/, 'new parent needs MFA too');
      await A('select set_member($1,$2,$3,$4::jsonb)', [baby, id.B, 'family', '{}']);
    });
    await t('profile: parents and people with the box ticked; not family; must use the current epoch', async () => {
      await A('select update_baby($1,$2,2)', [baby, 'PROFILE2'.repeat(5)]); await rejects(A('select update_baby($1,$2,1)', [baby, 'x'.repeat(10)]), /stale epoch/);
      await rejects(B('select update_baby($1,$2,2)', [baby, 'x']), /permission/); await rejects(C('select update_baby($1,$2,2)', [baby, 'x']), /permission/);
      await A('select set_member($1,$2,$3,$4::jsonb)', [baby, id.C, 'caregiver', '{"edit_profile":true}']); await C('select update_baby($1,$2,2)', [baby, 'PROFILE3'.repeat(5)]);
      assert((await B('select profile from babies'))[0].profile.startsWith('PROFILE3')); await A('select set_member($1,$2,$3,$4::jsonb)', [baby, id.C, 'caregiver', '{}']);
    });
    await t('the family tree: only the children\'s relatives get it (parents, family members), only parents change it (with the current keys), and it is kept as ciphertext', async () => {
      assert.deepEqual(await A('select * from get_tree($1)', [baby]), [], 'none yet');
      const T = 'TREE'.repeat(10);
      await rejects(B('select set_tree($1,$2,2)', [baby, T]), /Only parents/, 'not a family member');
      await rejects(C('select set_tree($1,$2,2)', [baby, T]), /Only parents/, 'not a caregiver');
      await rejects(A1('select set_tree($1,$2,2)', [baby, T]), /Only parents/, 'not a parent without two-step verification');
      await rejects(A('select set_tree($1,$2,1)', [baby, T]), /stale epoch/, 'with the current keys only');
      await rejects(A('select set_tree($1,$2,2)', [baby, 'T'.repeat(32769)]), /too large/);
      await A('select set_tree($1,$2,2)', [baby, T]); await A('select set_tree($1,$2,2)', [baby, T + 'X']);
      assert.deepEqual((await B('select blob, epoch from get_tree($1)', [baby])).map(r => [r.blob, r.epoch]), [[T + 'X', 2]], 'a family member reads it');
      assert.deepEqual((await q('select blob, updated_by from trees')).map(r => [r.blob, r.updated_by]), [[T + 'X', id.A]], 'one tree per log, as the phone sealed it');
      await rejects(C('select * from get_tree($1)', [baby]), /no access/, 'not a caregiver');
      await rejects(D('select * from get_tree($1)', [baby]), /no access/, 'not a babysitter, even one who may see the family list');
      await rejects(A1('select * from get_tree($1)', [baby]), /no access/, 'not a parent without two-step verification');
      for (const who of [A, B, C]) await rejects(who('select * from trees'), /permission denied/, 'no direct access to the table');
      assert.equal((await A('select * from activity_log($1)', [baby])).filter(l => l.action === 'tree_changed').length, 2, 'in the activity log');
    });
    await t('lost authenticator: another parent can reset MFA, never your own', async () => {
      await su.query(`insert into auth.mfa_factors(user_id,status) values ($1,'verified')`, [id.C]);
      await rejects(B('select reset_member_mfa($1,$2)', [baby, id.C]), /Only parents/); await rejects(A('select reset_member_mfa($1,$2)', [baby, id.A]), /another parent/);
      await su.query(`insert into auth.sessions(user_id) values ($1),($1),($2)`, [id.C, id.A]);
      await A('select reset_member_mfa($1,$2)', [baby, id.C]); assert.equal((await q(`select count(*)::int c from auth.mfa_factors where user_id=$1`, [id.C]))[0].c, 0);
      assert.equal((await q(`select count(*)::int c from auth.sessions where user_id=$1`, [id.C]))[0].c, 0, 'their sessions (including any that already passed MFA) are ended');
      assert.equal((await q(`select count(*)::int c from auth.sessions where user_id=$1`, [id.A]))[0].c, 1, 'other people\'s sessions are untouched');
    });

    await t('activity log: parents only, records who did what (never entry types or contents), cannot be altered', async () => {
      const log = await A('select * from activity_log($1,500)', [baby]); const has = (a, who) => log.some(l => l.action === a && (!who || l.actor === who));
      for (const a of ['log_created', 'entry_edited', 'entry_deleted', 'invite_created', 'join_requested', 'member_approved', 'request_denied', 'invite_rescinded', 'role_changed', 'permissions_changed',
        'member_removed', 'left', 'mfa_reset', 'profile_changed', 'device_approved', 'keys_rotated', 'recovery_code_changed']) assert(has(a), 'missing ' + a);
      assert(has('entry_added', 'Mum')); assert(log.some(l => l.action === 'entry_added' && l.entry_type === 'private'), 'health-class entries are labelled private');
      assert(log.filter(l => l.entry_type).every(l => l.entry_type === 'private'), 'no entry types are recorded');
      for (const who of [B, C, D]) await rejects(who('select * from activity_log($1)', [baby]), /Only parents/); await rejects(as('A', 'aal1')('select * from activity_log($1)', [baby]), /Only parents/);
      const first = await A('select * from activity_log($1,2)', [baby]); assert((await A('select * from activity_log($1,2,$2)', [baby, first[1].id]))[0].id < first[1].id, 'paging works');
    });

    await t('language reports: only the server function can use the limits (5 an hour per sender, 200 a day in all); the app can neither call it nor read who reported', async () => {
      await rejects(A('select language_report_allow($1) ok', ['x'.repeat(64)]), /permission denied/, 'a signed-in person');
      await rejects(anon('select language_report_allow($1) ok', ['x'.repeat(64)]), /permission denied/, 'anyone');
      await rejects(A('select * from report_limits'), /permission denied/, 'reading the table');
      const allow = async k => (await q('select language_report_allow($1) ok', [k]))[0].ok, k1 = 'a'.repeat(64), k2 = 'b'.repeat(64);
      const r = []; for (let i = 0; i < 6; i++) r.push(await allow(k1));
      assert.deepEqual(r, [true, true, true, true, true, false], 'five an hour');
      assert.equal(await allow(k2), true, 'someone else still can');
      await q(`update report_limits set since = now() - interval '61 minutes' where k = $1`, [k1]);
      assert.equal(await allow(k1), true, 'an hour later they can again');
      await q(`update report_limits set n = 200 where k = '*'`);
      assert.equal(await allow('c'.repeat(64)), false, '200 a day from everyone at most');
      await rejects(q('select language_report_allow($1)', ['*']), /bad key/); await rejects(q('select language_report_allow($1)', ['short']), /bad key/);
      assert.equal((await q(`select count(*)::int c from report_limits where k <> '*' and k !~ '^[a-c]{64}$'`))[0].c, 0, 'only the hashed keys are kept');
    });

    await t('pictures and videos (the "media" bucket): members read a log\'s files, people who may add entries upload under its id only, their own files they may delete, other people\'s only with the permission; strangers and parents without two-step verification get nothing', async () => {
      const obj = (who, name, owner) => who('insert into storage.objects (bucket_id, name, owner_id) values ($1, $2, $3)', ['media', name, owner]);
      const mid = (await su.query(`insert into auth.users(email) values ('media@x.com') returning id`)).rows[0].id, M = actor(url, { sub: mid, email: 'media@x.com', aal: 'aal1' });
      await q(`insert into members (baby_id, user_id, email, display_name, role, perms) values ($1, $2, 'media@x.com', 'Nanny', 'caregiver', role_preset('caregiver'))`, [baby, mid]);
      await obj(A, `${baby}/pic1`, id.A); await obj(M, `${baby}/pic2`, mid);
      await rejects(obj(H, `${baby}/pic3`, id.H), /row-level security/, 'a stranger'); await rejects(obj(A1, `${baby}/pic4`, id.A), /row-level security/, 'a parent without two-step verification');
      await rejects(obj(A, 'pic5', id.A), /row-level security/, 'not under a log'); await rejects(obj(A, `${baby}/a/pic6`, id.A), /row-level security/, 'nested'); await rejects(obj(A, `00000000-0000-0000-0000-000000000000/pic7`, id.A), /row-level security/, 'someone else\'s log');
      await q(`update members set perms = perms || '{"add_entries": false}' where user_id = $1`, [mid]); await rejects(obj(M, `${baby}/pic8`, mid), /row-level security/, 'without the permission to add entries');
      await q(`update members set perms = perms || '{"add_entries": true}' where user_id = $1`, [mid]);
      const names = who => who('select name from storage.objects where bucket_id = $1 order by name', ['media']).then(r => r.map(x => x.name));
      assert.deepEqual(await names(M), [`${baby}/pic1`, `${baby}/pic2`]); assert.deepEqual(await names(A), [`${baby}/pic1`, `${baby}/pic2`]); assert.deepEqual(await names(H), []); assert.deepEqual(await names(A1), []);
      const del = (who, name) => who('delete from storage.objects where bucket_id = $1 and name = $2 returning name', ['media', name]).then(r => r.length);
      assert.equal(await del(M, `${baby}/pic1`), 0, 'not someone else\'s'); assert.equal(await del(H, `${baby}/pic1`), 0); assert.equal(await del(M, `${baby}/pic2`), 1, 'their own');
      await obj(M, `${baby}/pic2`, mid); await q(`update members set perms = perms || '{"delete_own": false}' where user_id = $1`, [mid]); assert.equal(await del(M, `${baby}/pic2`), 0, 'not even their own without the permission');
      assert.equal(await del(A, `${baby}/pic2`), 1, 'a parent deletes anyone\'s'); assert.equal(await del(A, `${baby}/pic1`), 1);
      await q('delete from members where user_id = $1', [mid]); await q('delete from auth.users where id = $1', [mid]);
    });
    await t('account deletion: a non-parent just leaves (log asks for rotation); sole parent takes the log with them; with another parent the log stays', async () => {
      await su.query(`insert into auth.mfa_factors(user_id,status) values ($1,'verified')`, [id.A]);
      await rejects(as('A', 'aal1')('select delete_my_account()'), /Two-step verification/, 'with two-step verification set up, an email code alone cannot delete the account');
      await D('select delete_my_account()'); assert.equal((await q('select count(*)::int c from auth.users where id=$1', [id.D]))[0].c, 0);
      assert.equal((await q('select count(*)::int c from babies where id=$1', [baby]))[0].c, 1); assert.equal((await q('select rotate_needed from babies'))[0].rotate_needed, true);
      await A('select set_member($1,$2,$3,$4::jsonb,$5::jsonb)', [baby, id.B, 'parent', '{}', JSON.stringify((await A('select * from list_devices($1)', [baby])).filter(d => d.user_id === id.B).map(d => ({ device: d.grantee.slice(2), wrap_health: W('bh') })))]);
      await A('select delete_my_account()'); assert.equal((await q('select count(*)::int c from babies where id=$1', [baby]))[0].c, 1, 'B is now the only parent and the log survives');
      await B('select delete_my_account()');
      for (const tb of ['babies', 'events', 'key_grants', 'members']) assert.equal((await q(`select count(*)::int c from ${tb}`))[0].c, 0, tb + ' emptied');
    });
    await t('supabase/upgrade.sql: a 1.0.0 project upgraded is the same as a fresh schema.sql (functions, rules, grants, tables); run again it changes nothing, nor on a fresh project; its data stays; schema_version() is the one the app was built for', async () => {
      const UP = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'upgrade.sql'), 'utf8');
      // everything that makes up the schema, as text: function definitions (bodies included) and their grants, tables and columns,
      // constraints, indexes, policies, triggers, row-level security, table grants, storage buckets
      const shape = async c => {
        const rows = async sql => (await c.query(sql)).rows;
        return {
          functions: await rows(`select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' f, pg_get_functiondef(p.oid) def, p.proacl::text acl from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' order by 1`),
          columns: await rows(`select table_schema, table_name, column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema in ('public', 'storage') order by 1, 2, ordinal_position`),
          constraints: await rows(`select conrelid::regclass::text t, conname, pg_get_constraintdef(oid) d from pg_constraint where connamespace = 'public'::regnamespace order by 1, 2`),
          indexes: await rows(`select schemaname, tablename, indexname, indexdef from pg_indexes where schemaname in ('public', 'storage') order by 1, 2, 3`),
          policies: await rows(`select schemaname, tablename, policyname, permissive, roles::text, cmd, qual, with_check from pg_policies where schemaname in ('public', 'storage') order by 1, 2, 3`),
          triggers: await rows(`select tgrelid::regclass::text t, tgname, pg_get_triggerdef(oid) d from pg_trigger where not tgisinternal order by 1, 2`),
          rls: await rows(`select relname, relrowsecurity, relforcerowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' order by 1`),
          grants: await rows(`select grantee, table_schema, table_name, privilege_type from information_schema.role_table_grants where table_schema in ('public', 'storage') and grantee in ('anon', 'authenticated') order by 1, 2, 3, 4`),
          buckets: await rows(`select id, name, public, file_size_limit from storage.buckets order by 1`),
        };
      };
      const diff = (a, b) => { for (const k of Object.keys(a)) { const x = JSON.stringify(a[k]), y = JSON.stringify(b[k]); if (x !== y) { let i = 0; while (x[i] === y[i]) i++; return `${k} differs near …${x.slice(Math.max(0, i - 80), i + 120)}… vs …${y.slice(Math.max(0, i - 80), i + 120)}…`; } } return ''; };
      const fresh = await dbFrom(admin, 'llfresh', ['tests/lib/stub-supabase.sql', 'supabase/schema.sql']);
      const want = await shape(fresh.su);
      await fresh.su.query(UP); assert.equal(diff(await shape(fresh.su), want), '', 'on a fresh project it changes nothing');
      assert.equal((await fresh.su.query('select schema_version() v')).rows[0].v, /SCHEMA = '([\d.]+)'/.exec(fs.readFileSync(path.join(__dirname, '..', 'sync.js'), 'utf8'))[1], 'schema_version() is the one sync.js is built for');
      await fresh.su.end();
      const old = await dbFrom(admin, 'llold', ['tests/lib/stub-supabase.sql', 'tests/fixtures/schema-1.0.0.sql']);
      assert.notEqual(diff(await shape(old.su), want), '', 'the 1.0.0 schema is not the current one');
      await rejects(old.su.query('select schema_version()'), /does not exist/); await rejects(old.su.query('select rename_member(null, null, null)'), /does not exist/);
      const uid = (await old.su.query(`insert into auth.users(email) values ('old@x.com') returning id`)).rows[0].id, O = actor(old.url, { sub: uid, email: 'old@x.com' });
      const d = (await O('select register_device($1,$2::jsonb) d', ['old phone', JSON.stringify(pub())]))[0].d;
      const b = (await O('select create_baby($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7::jsonb,null,$8) b', ['P'.repeat(40), 'Old', d, JSON.stringify(grant()), JSON.stringify(pub()), 'R'.repeat(40), JSON.stringify(grant()), HC]))[0].b;
      await O('select push_events($1,$2::jsonb)', [b, JSON.stringify([ev('o1'), ev('o2')])]);
      await old.su.query(UP); assert.equal(diff(await shape(old.su), want), '', 'a 1.0.0 project plus upgrade.sql');
      await old.su.query(UP); assert.equal(diff(await shape(old.su), want), '', 'run again');
      assert.equal((await old.su.query('select count(*)::int c from events where baby_id = $1', [b])).rows[0].c, 2, 'its entries are still there');
      assert.equal((await O('select display_name from members where baby_id = $1', [b]))[0].display_name, 'Old');
      await O('select rename_member($1,$2,$3)', [b, uid, 'Older']); assert.equal((await O('select display_name from members where baby_id = $1', [b]))[0].display_name, 'Older', 'and the 1.16.0 function works');
      await old.su.end(); await dropDb(admin, 'llfresh'); await dropDb(admin, 'llold');
    });
    await su.end();
  } finally { if (startCluster.stop) startCluster.stop(); }
  console.log(failed ? `\n${failed} FAILED, ${n} passed` : `\nall ${n} database checks passed`); process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e); if (startCluster.stop) startCluster.stop(); process.exit(1); });
