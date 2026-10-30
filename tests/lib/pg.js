// Test helper: starts a throwaway local Postgres (or uses $PGURL), loads the Supabase stub + schema.sql,
// and lets tests run SQL "as" a signed-in user the way PostgREST does (role + JWT claims, one transaction per call).
const { execSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const { Client } = require('pg');
const root = path.join(__dirname, '..', '..');
const PORT = 5544;
let dir = null;

function startCluster() {
  if (process.env.PGURL) return process.env.PGURL;
  const bin = fs.readdirSync('/usr/lib/postgresql').sort().pop();
  const B = `/usr/lib/postgresql/${bin}/bin`;
  dir = fs.mkdtempSync(path.join('/var/tmp', 'llpg-'));
  const asPg = process.getuid && process.getuid() === 0;
  const run = c => execSync(asPg ? `su postgres -c "${c}"` : c, { stdio: 'pipe' });
  if (asPg) execSync(`chown postgres ${dir}`);
  run(`${B}/initdb -D ${dir}/data -A trust`);
  run(`${B}/pg_ctl -D ${dir}/data -o '-p ${PORT} -k ${dir} -c listen_addresses=127.0.0.1' -l ${dir}/log start -w`);
  startCluster.stop = () => { try { run(`${B}/pg_ctl -D ${dir}/data stop -m immediate`); } catch (e) {} fs.rmSync(dir, { recursive: true, force: true }); };
  return `postgres://postgres@127.0.0.1:${PORT}/postgres`;
}

/** A throwaway database `name` with those SQL files (paths from the repo root) run in order. */
async function dbFrom(adminUrl, name, files) {
  const admin = new Client({ connectionString: adminUrl }); await admin.connect();
  await admin.query(`drop database if exists ${name} with (force)`); await admin.query(`create database ${name}`); await admin.end();
  const url = adminUrl.replace(/\/[^/]*$/, '/' + name);
  const su = new Client({ connectionString: url }); await su.connect();
  for (const f of files) await su.query(fs.readFileSync(path.join(root, f), 'utf8'));
  return { url, su };
}
const freshDb = adminUrl => dbFrom(adminUrl, 'lltest', ['tests/lib/stub-supabase.sql', 'supabase/schema.sql']);
async function dropDb(adminUrl, name) { const admin = new Client({ connectionString: adminUrl }); await admin.connect(); await admin.query(`drop database if exists ${name} with (force)`); await admin.end(); }

/** Runs SQL as a signed-in user. Returns rows, or throws with the Postgres message. */
function actor(url, { sub = null, email = '', aal = 'aal2', role = 'authenticated' } = {}) {
  return async (sql, params = []) => {
    const c = new Client({ connectionString: url }); await c.connect();
    try {
      await c.query('begin'); await c.query(`set local role ${role}`);
      await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(sub ? { sub, email, aal } : {})]);
      const r = await c.query(sql, params); await c.query('commit'); return r.rows;
    } catch (e) { await c.query('rollback').catch(() => {}); throw e; } finally { await c.end(); }
  };
}
module.exports = { startCluster, freshDb, dbFrom, dropDb, actor };
