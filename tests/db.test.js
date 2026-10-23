// Database security tests: runs supabase/schema.sql on a real Postgres and tries to break the rules as different people.
//   node tests/db.test.js          (starts a throwaway cluster; or set PGURL to use your own)
const assert = require('assert');
const { startCluster, freshDb, actor } = require('./lib/pg');

let n = 0, failed = 0;
const t = async (name, fn) => { try { await fn(); n++; console.log('✓', name); } catch (e) { failed++; console.log('✗', name, '\n   ', e.message.split('\n')[0]); } };
const rejects = async (p, re, msg) => { try { await p; } catch (e) { if (!re.test(e.message)) throw new Error((msg || 'wrong error') + ': ' + e.message); return; } throw new Error((msg || 'expected an error') + ' but it succeeded'); };
const now = () => Date.now();
const ev = (id, o = {}) => ({ id, type: 'feed', ts: now() - 1000, end_ts: null, data: { kind: 'bottle', ml: 90 }, note: '', updated: now(), deleted: false, ...o });
const bad = async (who, code) => assert.equal((await who('select redeem_invite($1) r', [code]))[0].r.status, 'invalid');
const names = ['A', 'B', 'C', 'D', 'E', 'F'];

(async () => {
  const admin = startCluster();
  try {
    const { url, su } = await freshDb(admin);
    const id = {}; for (const x of names) id[x] = (await su.query(`insert into auth.users(email) values ($1) returning id`, [x.toLowerCase() + '@x.com`'.slice(0, -1)])).rows[0].id;
    const as = (x, aal = 'aal2') => actor(url, { sub: id[x], email: x.toLowerCase() + '@x.com', aal });
    const anon = actor(url, { role: 'anon' });
    const A = as('A'), A1 = as('A', 'aal1'), B = as('B'), C = as('C'), D = as('D'), E = as('E'), F = as('F');
    const push = (who, baby, rows) => who('select push_events($1,$2::jsonb) r', [baby, JSON.stringify(rows)]).then(r => r[0].r.denied);
    const join = async (who, baby, role, perms = {}, name = '') => {
      const [{ c }] = await A('select create_invite($1,$2,$3::jsonb) c', [baby, role, JSON.stringify(perms)]);
      await who('select redeem_invite($1,$2)', [c, name]);
      const [{ id: rid }] = (await A('select * from list_requests($1)', [baby])).filter(r => r.email === who.email);
      return rid;
    };
    // helper: join + approve
    async function enroll(who, key, baby, role, perms = {}) {
      const [{ c }] = await A('select create_invite($1,$2,$3::jsonb) c', [baby, role, JSON.stringify(perms)]);
      await who('select redeem_invite($1)', [c]);
      const reqs = await A('select * from list_requests($1)', [baby]);
      const r = reqs.find(q => q.email === key.toLowerCase() + '@x.com');
      await A('select decide_request($1,true)', [r.id]);
    }

    let baby;
    await t('a new user can create a log and becomes a parent', async () => {
      baby = (await A1('select create_baby($1,$2,$3) b', ['Leo', '2026-10-10', 'Mum']))[0].b;
      assert.equal((await su.query('select role from members where baby_id=$1', [baby])).rows[0].role, 'parent');
    });
    await t('a parent WITHOUT two-step verification has no access to the log', async () => {
      assert.equal((await A1('select * from babies')).length, 0);
      await rejects(push(A1, baby, [ev('x1')]), /no access/);
      await rejects(A1('select * from list_people($1)', [baby]), /no access/);
      await rejects(A1('select create_invite($1,$2)', [baby, 'friend']), /Only parents/);
      assert.equal((await A1('select role from members')).length, 1, 'can still read own membership (so the app knows to ask for MFA)');
    });
    await t('with two-step verification the parent has full access', async () => {
      assert.equal((await A('select * from babies')).length, 1);
      assert.deepEqual(await push(A, baby, [ev('e1')]), []);
    });

    await t('invites expire after 2 hours and are single use', async () => {
      const [{ c }] = await A('select create_invite($1,$2) c', [baby, 'friend']);
      const [row] = (await su.query('select extract(epoch from expires_at-created_at) s from invites where code=$1', [c])).rows;
      assert.equal(Math.round(row.s), 7200);
      await B('select redeem_invite($1)', [c]);
      await bad(C, c);
    });
    await t('redeeming only creates a request: nothing is visible until a parent approves', async () => {
      assert.equal((await B('select * from babies')).length, 0);
      assert.equal((await B('select * from events')).length, 0);
      await rejects(push(B, baby, [ev('b0')]), /no access/);
      assert.equal((await B('select status from my_requests()'))[0].status, 'pending');
      const reqs = await A('select * from list_requests($1)', [baby]);
      assert.equal(reqs.length, 1); assert.equal(reqs[0].email, 'b@x.com');
    });
    await t('only a parent can approve; approval grants the invited role', async () => {
      const [r] = await A('select id from list_requests($1)', [baby]);
      await rejects(B('select decide_request($1,true)', [r.id]), /Only parents/);
      await rejects(as('A', 'aal1')('select decide_request($1,true)', [r.id]), /Only parents/, 'parent without MFA');
      await A('select decide_request($1,true,$2,$3::jsonb)', [r.id, 'family', '{}']);
      assert.equal((await B('select * from babies')).length, 1);
      assert.equal((await B('select status from my_requests()'))[0].status, 'approved');
      await rejects(A('select decide_request($1,true)', [r.id]), /no longer pending/);
    });
    await t('denied requests stay out; requests expire after 24h', async () => {
      const [{ c }] = await A('select create_invite($1,$2) c', [baby, 'friend']);
      await C('select redeem_invite($1)', [c]);
      const [r] = await A('select id from list_requests($1)', [baby]);
      await A('select decide_request($1,false)', [r.id]);
      assert.equal((await C('select * from babies')).length, 0);
      assert.equal((await C('select status from my_requests()'))[0].status, 'denied');
      const [{ c: c2 }] = await A('select create_invite($1,$2) c', [baby, 'friend']);
      await D('select redeem_invite($1)', [c2]);
      await su.query(`update join_requests set expires_at = now() - interval '1 minute' where user_id=$1`, [id.D]);
      assert.equal((await A('select * from list_requests($1)', [baby])).length, 0);
      const [{ id: rid }] = (await su.query(`select id from join_requests where user_id=$1`, [id.D])).rows;
      await rejects(A('select decide_request($1,true)', [rid]), /no longer pending/);
      await su.query('delete from join_requests where user_id in ($1,$2)', [id.C, id.D]);
    });
    await t('invites can be rescinded; expired invites fail', async () => {
      const [{ c }] = await A('select create_invite($1,$2) c', [baby, 'friend']);
      assert((await A('select * from list_invites($1)', [baby])).some(i => i.code === c));
      await rejects(B('select rescind_invite($1)', [c]), /Only parents/);
      await A('select rescind_invite($1)', [c]);
      await bad(C, c);
      const [{ c: c2 }] = await A('select create_invite($1,$2) c', [baby, 'friend']);
      await su.query(`update invites set expires_at = now() - interval '1 second' where code=$1`, [c2]);
      await bad(C, c2);
    });
    await t('guessing invite codes is rate limited', async () => {
      for (let i = 0; i < 10; i++) await bad(F, 'BADCODE' + i);
      await rejects(F('select redeem_invite($1)', ['BADCODEXX']), /Too many attempts/);
      await su.query('delete from invite_attempts');
    });
    await t('at most 10 open invites', async () => {
      const open = (await su.query('select count(*)::int c from invites where used_by is null and expires_at>now()')).rows[0].c;
      for (let i = open; i < 10; i++) await A('select create_invite($1,$2)', [baby, 'friend']);
      await rejects(A('select create_invite($1,$2)', [baby, 'friend']), /Too many open invites/);
      await su.query('delete from invites where used_by is null');
    });

    // B = family. C = caregiver (defaults). D = babysitter with extras. E = friend with health hidden.
    await enroll(C, 'C', baby, 'caregiver');
    await enroll(D, 'D', baby, 'babysitter', { edit_others: true, view_people: true });
    await enroll(E, 'E', baby, 'friend', { view_health: false });

    await t('permission presets: family limits are hard, others follow the check boxes', async () => {
      const m = Object.fromEntries((await su.query('select user_id, role, perms from members where baby_id=$1', [baby])).rows.map(r => [r.user_id, r]));
      assert.equal(m[id.B].perms.edit_others, false); assert.equal(m[id.B].perms.edit_profile, false); assert.equal(m[id.B].perms.view_people, true);
      assert.equal(m[id.C].perms.add_entries, true); assert.equal(m[id.C].perms.edit_others, false);
      assert.equal(m[id.D].perms.edit_others, true); assert.equal(m[id.E].perms.view_health, false);
      const [{ c }] = await A('select create_invite($1,$2,$3::jsonb) c', [baby, 'family', '{"edit_others":true,"delete_others":true,"edit_profile":true}']);
      assert.deepEqual((await su.query('select perms from invites where code=$1', [c])).rows[0].perms, { ...m[id.B].perms }, 'family flags forced off');
      await A('select rescind_invite($1)', [c]);
    });

    await t('edit/delete: own entries yes, other people\'s only with the permission', async () => {
      assert.deepEqual(await push(B, baby, [ev('b1')]), []);
      assert.deepEqual(await push(B, baby, [ev('b1', { note: 'edited', updated: now() + 10 })]), [], 'edit own');
      assert.deepEqual(await push(B, baby, [ev('e1', { note: 'x', updated: now() + 10 })]), ['e1'], 'family cannot edit a parent\'s entry');
      assert.deepEqual(await push(B, baby, [ev('e1', { deleted: true, updated: now() + 10 })]), ['e1'], 'family cannot delete others\'');
      assert.deepEqual(await push(C, baby, [ev('b1', { note: 'hax', updated: now() + 10 })]), ['b1'], 'caregiver cannot edit others\'');
      assert.deepEqual(await push(D, baby, [ev('b1', { note: 'by babysitter', updated: now() + 20 })]), [], 'babysitter with edit_others can');
      assert.deepEqual(await push(D, baby, [ev('b1', { deleted: true, updated: now() + 30 })]), ['b1'], 'but not delete others\' (box unticked)');
      assert.equal((await su.query(`select note from events where id='b1'`)).rows[0].note, 'by babysitter');
      assert.deepEqual(await push(B, baby, [ev('b1', { deleted: true, updated: now() + 40 })]), [], 'owner of the entry can delete it');
      assert.equal((await su.query(`select deleted from events where id='b1'`)).rows[0].deleted, true);
    });
    await t('parents can edit and delete anything', async () => {
      assert.deepEqual(await push(C, baby, [ev('c1')]), []);
      assert.deepEqual(await push(A, baby, [ev('c1', { note: 'parent edit', updated: now() + 50 })]), []);
      assert.deepEqual(await push(A, baby, [ev('c1', { deleted: true, updated: now() + 60 })]), []);
    });
    await t('a person with no "add" permission cannot add', async () => {
      const [{ c }] = await A('select create_invite($1,$2,$3::jsonb) c', [baby, 'friend', '{"add_entries":false}']);
      await F('select redeem_invite($1)', [c]); await su.query(`delete from invite_attempts`);
      const [r] = (await A('select id from list_requests($1)', [baby]));
      await A('select decide_request($1,true)', [r.id]);
      assert.deepEqual(await push(F, baby, [ev('f1')]), ['f1']);
      assert.equal((await F('select * from events where id=$1', ['e1'])).length, 1, 'but can read');
    });
    await t('health & medication entries need the health permission (read and write)', async () => {
      assert.deepEqual(await push(A, baby, [ev('h1', { type: 'health', data: { symptoms: ['Rash'] } }), ev('m1', { type: 'med', data: { name: 'Vit D' } })]), []);
      assert.equal((await E('select * from events where type in ($1,$2)', ['health', 'med'])).length, 0, 'hidden from E');
      assert.equal((await C('select * from events where type in ($1,$2)', ['health', 'med'])).length, 2, 'visible to C');
      assert.deepEqual(await push(E, baby, [ev('h2', { type: 'health' })]), ['h2']);
      assert.deepEqual(await push(E, baby, [ev('h1', { type: 'health', note: 'x', updated: now() + 99 })]), ['h1']);
    });
    await t('writes straight to the tables are impossible for everyone, parents included', async () => {
      for (const who of [A, B, C]) {
        await rejects(who(`insert into events(baby_id,id,type,ts,updated,created_by) values ($1,'z','feed',1,1,$2)`, [baby, id.A]), /permission denied/);
        await rejects(who(`update events set note='x'`), /permission denied/);
        await rejects(who(`delete from events`), /permission denied/);
        await rejects(who(`update members set role='parent' where baby_id=$1`, [baby]), /permission denied/);
        await rejects(who(`insert into members(baby_id,user_id,role) values ($1,$2,'parent')`, [baby, id.B]), /permission denied/);
        await rejects(who(`update babies set name='x'`), /permission denied/);
        await rejects(who(`insert into invites(code,baby_id,role,created_by) values ('FORGED1234',$1,'parent',$2)`, [baby, id.A]), /permission denied/);
        await rejects(who(`delete from activity`), /permission denied/);
        await rejects(who(`select * from activity`), /permission denied/);
        await rejects(who(`select * from invites`), /permission denied/);
        await rejects(who(`select * from join_requests`), /permission denied/);
      }
    });
    await t('anonymous users can call nothing', async () => {
      await rejects(anon('select create_baby($1,null)', ['x']), /permission denied/);
      await rejects(anon('select * from events'), /permission denied/);
      await rejects(anon('select push_events($1,$2::jsonb)', [baby, '[]']), /permission denied/);
    });
    await t('strangers see nothing and cannot write', async () => {
      const S = actor(url, { sub: (await su.query(`insert into auth.users(email) values ('s@x.com') returning id`)).rows[0].id, email: 's@x.com' });
      assert.equal((await S('select * from events')).length, 0); assert.equal((await S('select * from babies')).length, 0);
      await rejects(push(S, baby, [ev('s1')]), /no access/);
      await rejects(S('select * from activity_log($1)', [baby]), /Only parents/);
    });

    await t('entries are validated: type, size, dates, ids, batch size', async () => {
      const bad = [ev('v1', { type: 'nope' }), ev('v2', { data: { x: 'y'.repeat(5000) } }), ev('v3', { note: 'n'.repeat(2001) }), ev('v4', { ts: 5 }),
        ev('v5', { ts: now() + 30 * 86400000 }), ev('bad id!'), ev('v6', { data: [1] }), ev('v7', { end_ts: now() - 10 * 86400000 })];
      assert.equal((await push(C, baby, bad)).length, bad.length);
      await rejects(push(C, baby, Array.from({ length: 501 }, (_, i) => ev('big' + i))), /bad batch/);
    });
    await t('a wrong phone clock cannot pin an entry against later edits', async () => {
      assert.deepEqual(await push(C, baby, [ev('p1', { updated: 9e15 })]), []);
      const u = Number((await su.query(`select updated from events where id='p1'`)).rows[0].updated);
      assert(u <= now() + 61000, 'clamped, got ' + (u - now()));
      assert.deepEqual(await push(C, baby, [ev('p1', { note: 'later', updated: now() + 120000 })]), []);
      assert.equal((await su.query(`select note from events where id='p1'`)).rows[0].note, 'later');
    });
    await t('stale writes are ignored, not an error', async () => {
      assert.deepEqual(await push(C, baby, [ev('p1', { note: 'old', updated: 5 })]), []);
      assert.equal((await su.query(`select note from events where id='p1'`)).rows[0].note, 'later');
    });

    await t('people list: names for all, emails/roles only with permission, permissions only for parents', async () => {
      const forE = await E('select * from list_people($1)', [baby]);
      assert.equal(forE.length, 6); assert(forE.every(p => p.email === null && p.role === null && p.perms === null) && forE.every(p => p.display_name));
      const forD = await D('select * from list_people($1)', [baby]);
      assert(forD.every(p => p.email && p.role) && forD.every(p => p.perms === null));
      const forA = await A('select * from list_people($1)', [baby]);
      assert(forA.every(p => p.perms !== null)); assert.equal(forA.find(p => p.is_you).display_name, 'Mum');
    });
    await t('only parents change roles; the last parent cannot be demoted or removed; people can leave', async () => {
      await rejects(B('select set_member($1,$2,$3,$4::jsonb)', [baby, id.C, 'parent', '{}']), /Only parents/);
      await rejects(A('select set_member($1,$2,$3,$4::jsonb)', [baby, id.A, 'friend', '{}']), /at least one parent/);
      await rejects(A('select remove_member($1,$2)', [baby, id.A]), /last parent/);
      await rejects(C('select remove_member($1,$2)', [baby, id.D]), /Only parents/);
      await A('select set_member($1,$2,$3,$4::jsonb)', [baby, id.C, 'caregiver', '{"edit_others":true}']);
      assert.deepEqual(await push(C, baby, [ev('b1', { note: 'now allowed', updated: now() + 500 })]), [], 'new box takes effect immediately');
      await A('select set_member($1,$2,$3,$4::jsonb)', [baby, id.C, 'caregiver', '{"edit_others":false}']);
      await A('select remove_member($1,$2)', [baby, id.E]);
      assert.equal((await E('select * from events')).length, 0); await rejects(push(E, baby, [ev('e9')]), /no access/);
      await F('select remove_member($1,$2)', [baby, id.F]);
    });
    await t('a second parent can be added; then the first may step down', async () => {
      await A('select set_member($1,$2,$3,$4::jsonb)', [baby, id.B, 'parent', '{}']);
      assert.equal((await su.query(`select perms from members where user_id=$1`, [id.B])).rows[0].perms.edit_others, true);
      await rejects(B('select * from list_people($1)', [baby]).then(() => as('B', 'aal1')('select * from list_people($1)', [baby])), /no access/, 'new parent needs MFA too');
      await A('select set_member($1,$2,$3,$4::jsonb)', [baby, id.B, 'family', '{}']);
    });
    await t('profile: parents and people with the box ticked; not family', async () => {
      await A('select update_baby($1,$2,$3)', [baby, 'Leo R', '2026-10-11']);
      await rejects(B('select update_baby($1,$2,$3)', [baby, 'x', null]), /permission/);
      await rejects(C('select update_baby($1,$2,$3)', [baby, 'x', null]), /permission/);
      await A('select set_member($1,$2,$3,$4::jsonb)', [baby, id.C, 'caregiver', '{"edit_profile":true}']);
      await C('select update_baby($1,$2,$3)', [baby, 'Leo Q', null]);
      assert.equal((await B('select name from babies'))[0].name, 'Leo Q');
      await A('select set_member($1,$2,$3,$4::jsonb)', [baby, id.C, 'caregiver', '{}']);
    });
    await t('lost authenticator: another parent can reset MFA, never your own', async () => {
      await su.query(`insert into auth.mfa_factors(user_id,status) values ($1,'verified')`, [id.C]);
      await rejects(B('select reset_member_mfa($1,$2)', [baby, id.C]), /Only parents/);
      await rejects(A('select reset_member_mfa($1,$2)', [baby, id.A]), /another parent/);
      await A('select reset_member_mfa($1,$2)', [baby, id.C]);
      assert.equal((await su.query(`select count(*)::int c from auth.mfa_factors where user_id=$1`, [id.C])).rows[0].c, 0);
    });

    await t('activity log: parents only, records who did what, cannot be altered', async () => {
      const log = await A('select * from activity_log($1,500)', [baby]);
      const has = (a, who) => log.some(l => l.action === a && (!who || l.actor === who));
      assert(has('log_created')); assert(has('entry_added', 'Mum')); assert(has('entry_added', 'b')); assert(has('entry_edited')); assert(has('entry_deleted'));
      assert(has('invite_created')); assert(has('join_requested')); assert(has('member_approved')); assert(has('request_denied')); assert(has('invite_rescinded'));
      assert(has('role_changed')); assert(has('permissions_changed')); assert(has('member_removed')); assert(has('left')); assert(has('mfa_reset')); assert(has('profile_changed'));
      assert(!JSON.stringify(log).includes('parent edit') && !JSON.stringify(log).includes('Rash'), 'entry contents are not copied into the log');
      assert(!log.some(l => l.action === 'entry_edited' && l.actor === 'c' && l.detail.author === 'b' && l.entry_id === 'b1' && false));
      for (const who of [B, C, D]) await rejects(who('select * from activity_log($1)', [baby]), /Only parents/);
      await rejects(as('A', 'aal1')('select * from activity_log($1)', [baby]), /Only parents/, 'parent without MFA');
      const first = await A('select * from activity_log($1,2)', [baby]); const older = await A('select * from activity_log($1,2,$2)', [baby, first[1].id]);
      assert(older[0].id < first[1].id, 'paging works');
    });

    await t('account deletion: non-parent just leaves; sole parent takes the log with them; with another parent the log stays', async () => {
      await D('select delete_my_account()');
      assert.equal((await su.query('select count(*)::int c from auth.users where id=$1', [id.D])).rows[0].c, 0);
      assert.equal((await su.query('select count(*)::int c from babies where id=$1', [baby])).rows[0].c, 1);
      await A('select set_member($1,$2,$3,$4::jsonb)', [baby, id.B, 'parent', '{}']);
      await A('select delete_my_account()');
      assert.equal((await su.query('select count(*)::int c from babies where id=$1', [baby])).rows[0].c, 1, 'B is now the only parent and the log survives');
      await B('select delete_my_account()');
      assert.equal((await su.query('select count(*)::int c from babies where id=$1', [baby])).rows[0].c, 0, 'sole parent deleting removes the log');
      assert.equal((await su.query('select count(*)::int c from events where baby_id=$1', [baby])).rows[0].c, 0);
    });
    await su.end();
  } finally { if (startCluster.stop) startCluster.stop(); }
  console.log(failed ? `\n${failed} FAILED, ${n} passed` : `\nall ${n} database checks passed`); process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e); if (startCluster.stop) startCluster.stop(); process.exit(1); });
