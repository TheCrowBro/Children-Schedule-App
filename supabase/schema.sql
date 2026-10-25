-- Little Log – Supabase schema (v3: end-to-end encryption, roles, permissions, MFA, approved invites, audit log).
-- Run once in the Supabase SQL editor on a fresh project. It replaces any earlier version of this file
-- (drop the old tables first if you ran v1; there is no data migration).
--
-- Security model
--   * Clients can only READ babies / their own membership row / events (row-level security).
--     Every write goes through the security-definer functions below, which check role + permissions.
--   * Roles: parent (admin, everything), family, caregiver, babysitter, medical (a medical assistant), friend. Everyone except parents has
--     per-person permission flags (see role_preset). Parents must use an MFA (aal2) session; without one a parent
--     has no more access than a stranger.
--   * Joining needs an invite code AND a parent's approval. Invites last 2 hours, work once, and can be rescinded.
--   * `activity` is an append-only log of who did what, readable only by parents.
--   * END-TO-END ENCRYPTION: this database never sees the baby's name/birthday or any entry's type, time or contents.
--     Entries are opaque ciphertext blobs (AES-GCM) made on the phones. Keys never reach the server in the clear: each
--     phone has a keypair, and the log keys are stored only as copies wrapped to each approved phone (`key_grants`).
--     The server still sees: emails and display names, roles and permissions, who wrote an entry and when it was
--     uploaded, entry counts and sizes, and a `sensitive` flag marking health-class entries (so the "see health notes"
--     permission is still enforced here as well as by a separate health key).

-- ── tables ────────────────────────────────────────────────────────────────────────────────────
create table babies (
  id uuid primary key default gen_random_uuid(),
  profile text not null default '' check (length(profile) <= 8192),   -- encrypted {children, pediatrician}
  epoch int not null default 1,                                        -- current key generation
  rotate_needed boolean not null default false,                        -- a parent's phone should rotate the keys
  recovery_pub jsonb,                                                  -- public key of the recovery code
  recovery_priv_wrapped text,                                          -- its private key, encrypted with the recovery code
  keyring_main text,                                                   -- older main keys, encrypted with the current main key
  keyring_health text,                                                 -- older health keys, encrypted with the current health key
  health_check text,                                                   -- MAC (under the main key) of the health key's fingerprint: lets a phone verify a health key it is given
  created_by uuid not null,
  created_at timestamptz not null default now()
);

-- One row per phone (app install). Only the PUBLIC key is stored.
create table devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '' check (length(name) <= 60),
  pubkey jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, pubkey)
);

-- The log keys, wrapped (encrypted) to one phone or to the recovery key. Opaque to the server.
create table key_grants (
  baby_id uuid not null references babies(id) on delete cascade,
  grantee text not null check (grantee = 'recovery' or grantee ~ '^d:[0-9a-f-]{36}$'),
  epoch int not null,
  wrap_main text not null check (length(wrap_main) <= 2048),
  wrap_health text check (length(wrap_health) <= 2048),
  auth text check (length(auth) <= 2048),    -- proof that the grant is genuine: from the QR invite secret, or (for a key change) a MAC under the previous keys
  tag text check (length(tag) <= 256),       -- key-holder's MAC over (grantee, public key, epoch): proves a real key holder approved it
  granted_by uuid,
  created_at timestamptz not null default now(),
  primary key (baby_id, grantee, epoch)
);

create table members (
  baby_id uuid not null references babies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null default '',
  display_name text not null default '' check (length(display_name) <= 60),
  role text not null check (role in ('parent','family','caregiver','babysitter','medical','friend')),
  perms jsonb not null default '{}',
  joined_at timestamptz not null default now(),
  details text not null default '' check (length(details) <= 4096),   -- encrypted {relation, phone, work…}, written by the person themselves
  details_epoch int not null default 0,
  primary key (baby_id, user_id)
);

-- Helpers who no longer help (they moved away, stopped, or died). Retiring one ends their access exactly like removing them, but the
-- family keeps a note of who they were: name, role, dates, why, and their contact details (still end-to-end encrypted, with the keys of
-- that time), so past entries still say who added them. Only caregivers, babysitters, medical assistants and friends are retired.
create table retired (
  id uuid primary key default gen_random_uuid(),
  baby_id uuid not null references babies(id) on delete cascade,
  user_id uuid,                                                                -- (no reference: the note outlives a deleted account's membership)
  display_name text not null default '' check (length(display_name) <= 60),
  role text not null check (role in ('caregiver','babysitter','medical','friend')),
  details text not null default '' check (length(details) <= 4096),
  details_epoch int not null default 0,
  joined_at timestamptz,
  retired_at timestamptz not null default now(),
  reason text not null default '' check (reason in ('', 'moved', 'stopped', 'passed', 'other'))
);
create index retired_by_baby on retired (baby_id, retired_at desc);

create table invites (
  code text primary key,
  baby_id uuid not null references babies(id) on delete cascade,
  role text not null check (role in ('parent','family','caregiver','babysitter','medical','friend')),
  perms jsonb not null default '{}',
  created_by uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '2 hours',
  used_by uuid
);

create table join_requests (
  id uuid primary key default gen_random_uuid(),
  baby_id uuid not null references babies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null default '',
  display_name text not null default '',
  role text not null,
  perms jsonb not null default '{}',
  invited_by uuid,
  invite_code text,
  device_id uuid references devices(id) on delete cascade,
  proof text check (length(proof) <= 256),     -- HMAC made with the secret inside the QR code (never sent to the server)
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  status text not null default 'pending' check (status in ('pending','approved','denied','cancelled'))
);
create unique index join_requests_one_pending on join_requests (baby_id, user_id) where status = 'pending';

create table events (
  baby_id uuid not null references babies(id) on delete cascade,
  id text not null,
  blob text not null default '' check (length(blob) <= 8192),   -- ciphertext of {type, ts, end, data, note}
  epoch int not null,
  sensitive boolean not null default false,                      -- health-class entry (separate key, separate permission)
  updated bigint not null,                 -- client clock (ms), clamped to the server clock; last write wins
  deleted boolean not null default false,
  created_by uuid not null,
  updated_by uuid,
  synced_at timestamptz not null default clock_timestamp(),   -- server clock; clients pull by this
  primary key (baby_id, id)
);
create index events_pull on events (baby_id, synced_at);

create table activity (
  id bigint generated always as identity primary key,
  baby_id uuid not null references babies(id) on delete cascade,
  at timestamptz not null default now(),
  user_id uuid,
  actor text not null default '',
  action text not null,
  entry_id text,
  entry_type text,
  detail jsonb not null default '{}'
);
create index activity_by_baby on activity (baby_id, id desc);
create index activity_by_age on activity (baby_id, at);

create table invite_attempts (user_id uuid not null, at timestamptz not null default now());
create index invite_attempts_recent on invite_attempts (user_id, at);

-- ── helpers ───────────────────────────────────────────────────────────────────────────────────
create function jwt_aal() returns text language sql stable as $$ select coalesce(auth.jwt() ->> 'aal', 'aal1') $$;

create function role_preset(p_role text) returns jsonb language sql immutable as $$
  select case p_role
    when 'parent' then '{"add_entries":true,"edit_own":true,"delete_own":true,"edit_others":true,"delete_others":true,"view_health":true,"view_people":true,"edit_profile":true}'
    when 'family' then '{"add_entries":true,"edit_own":true,"delete_own":true,"edit_others":false,"delete_others":false,"view_health":true,"view_people":true,"edit_profile":false}'
    else               '{"add_entries":true,"edit_own":true,"delete_own":true,"edit_others":false,"delete_others":false,"view_health":true,"view_people":false,"edit_profile":false}'
  end::jsonb $$;

-- Fill missing flags from the role's preset, drop unknown keys, and apply the hard limits
-- (parents: everything; family: can never change settings or other people's entries).
create function normalize_perms(p_role text, p jsonb) returns jsonb language plpgsql immutable as $$
declare base jsonb := role_preset(p_role); k text; o jsonb := '{}';
begin
  if p_role = 'parent' then return base; end if;
  foreach k in array array['add_entries','edit_own','delete_own','edit_others','delete_others','view_health','view_people','edit_profile'] loop
    o := o || jsonb_build_object(k, coalesce((p ->> k)::boolean, (base ->> k)::boolean));
  end loop;
  if p_role = 'family' then o := o || '{"edit_others":false,"delete_others":false,"edit_profile":false}'; end if;
  return o;
end $$;

-- Access checks. A parent only counts as a member in an MFA (aal2) session.
create function is_member(b uuid) returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from members m where m.baby_id = b and m.user_id = auth.uid()
                 and (m.role <> 'parent' or jwt_aal() = 'aal2')) $$;
create function is_parent(b uuid) returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from members m where m.baby_id = b and m.user_id = auth.uid()
                 and m.role = 'parent' and jwt_aal() = 'aal2') $$;
create function has_perm(b uuid, p text) returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from members m where m.baby_id = b and m.user_id = auth.uid()
    and case when m.role = 'parent' then jwt_aal() = 'aal2' else coalesce((m.perms ->> p)::boolean, false) end) $$;

create function display_of(b uuid, u uuid) returns text language sql security definer stable set search_path = public as $$
  select coalesce(nullif(m.display_name, ''), split_part(m.email, '@', 1), '') from members m where m.baby_id = b and m.user_id = u $$;

create function log_activity(b uuid, a text, eid text default null, etype text default null, d jsonb default '{}')
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into activity (baby_id, user_id, actor, action, entry_id, entry_type, detail)
  values (b, auth.uid(), coalesce(display_of(b, auth.uid()), ''), a, eid, etype, d);
  -- keep the log bounded: now and then drop anything older than ~14 months
  if random() < 0.02 then delete from activity where baby_id = b and at < now() - interval '14 months'; end if;
end $$;

-- ── row-level security: read-only for clients ─────────────────────────────────────────────────
alter table babies          enable row level security;
alter table members         enable row level security;
alter table invites         enable row level security;
alter table join_requests   enable row level security;
alter table events          enable row level security;
alter table activity        enable row level security;
alter table invite_attempts enable row level security;
alter table devices         enable row level security;
alter table key_grants      enable row level security;

create policy babies_read  on babies  for select using (is_member(id));
create policy members_self on members for select using (user_id = auth.uid());   -- others via list_people()
create policy events_read  on events  for select using (
  is_member(baby_id) and (not sensitive or has_perm(baby_id, 'view_health')));
-- invites, join_requests, activity, invite_attempts, devices, key_grants: no policies = no direct access (functions only).

-- ── devices, key grants, recovery ──────────────────────────────────────────────────────────────
-- The server only stores public keys and wrapped (encrypted) keys. The checks here keep the data model sane;
-- the cryptographic trust decisions (is this really that person's phone?) are made on the parents' phones.
create function pub_ok(p jsonb) returns boolean language sql immutable as $$
  select jsonb_typeof(p) = 'object' and p ->> 'kty' = 'EC' and p ->> 'crv' = 'P-256'
         and length(coalesce(p ->> 'x', '')) between 40 and 64 and length(coalesce(p ->> 'y', '')) between 40 and 64 $$;

create function register_device(p_name text, p_pub jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); id_ uuid; pk jsonb;
begin
  if me is null then raise exception 'not signed in'; end if;
  if not pub_ok(p_pub) then raise exception 'bad public key'; end if;
  pk := jsonb_build_object('kty', 'EC', 'crv', 'P-256', 'x', p_pub ->> 'x', 'y', p_pub ->> 'y');
  select id into id_ from devices where user_id = me and pubkey = pk;
  if found then return id_; end if;
  if (select count(*) from devices where user_id = me) >= 10 then raise exception 'Too many phones on this account – remove one first'; end if;
  insert into devices (user_id, name, pubkey) values (me, left(coalesce(p_name, ''), 60), pk) returning id into id_;
  return id_;
end $$;

create function my_devices() returns table (id uuid, name text, created_at timestamptz, pubkey jsonb)
language sql security definer stable set search_path = public as $$
  select d.id, d.name, d.created_at, d.pubkey from devices d where d.user_id = auth.uid() order by d.created_at $$;

-- Removing a phone (lost or stolen) deletes its keys; every log you belong to must then change its keys.
create function remove_device(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if not exists (select 1 from devices where id = p_id and user_id = me) then return; end if;
  delete from key_grants where grantee = 'd:' || p_id::text;
  delete from devices where id = p_id;
  update babies set rotate_needed = true where id in (select baby_id from members where user_id = me);
end $$;

create function my_grant(p_baby uuid, p_device uuid)
returns table (epoch int, wrap_main text, wrap_health text, auth text, granted_by_name text)
language plpgsql security definer stable set search_path = public as $$
begin
  if not is_member(p_baby) then raise exception 'no access'; end if;
  if not exists (select 1 from devices where id = p_device and user_id = auth.uid()) then raise exception 'unknown phone'; end if;
  return query select g.epoch, g.wrap_main, case when has_perm(p_baby, 'view_health') then g.wrap_health end, g.auth, display_of(p_baby, g.granted_by)
               from key_grants g join babies b on b.id = g.baby_id and b.epoch = g.epoch
               where g.baby_id = p_baby and g.grantee = 'd:' || p_device::text;
end $$;

-- A new phone that has the recovery code fetches the recovery material (still encrypted with that code).
create function get_recovery(p_baby uuid)
returns table (epoch int, recovery_pub jsonb, recovery_priv_wrapped text, wrap_main text, wrap_health text)
language plpgsql security definer stable set search_path = public as $$
begin
  if not is_member(p_baby) then raise exception 'no access'; end if;
  return query select b.epoch, b.recovery_pub, b.recovery_priv_wrapped, g.wrap_main, case when has_perm(p_baby, 'view_health') then g.wrap_health end
               from babies b join key_grants g on g.baby_id = b.id and g.epoch = b.epoch and g.grantee = 'recovery' where b.id = p_baby;
end $$;

create function get_keyring(p_baby uuid)
returns table (epoch int, keyring_main text, keyring_health text, rotate_needed boolean, health_check text)
language plpgsql security definer stable set search_path = public as $$
begin
  if not is_member(p_baby) then raise exception 'no access'; end if;
  return query select b.epoch, b.keyring_main, case when has_perm(p_baby, 'view_health') then b.keyring_health end, b.rotate_needed, b.health_check from babies b where b.id = p_baby;
end $$;

-- Phones of the log's members and whether each already holds the keys. Parents see everyone's; others see their own.
create function list_devices(p_baby uuid)
returns table (grantee text, user_id uuid, person text, device_name text, pubkey jsonb, has_grant boolean, tag text, view_health boolean, created_at timestamptz)
language plpgsql security definer stable set search_path = public as $$
declare parent boolean;
begin
  if not is_member(p_baby) then raise exception 'no access'; end if;
  parent := is_parent(p_baby);
  return query
    select 'd:' || d.id::text, d.user_id, display_of(p_baby, d.user_id), d.name, d.pubkey,
           g.grantee is not null, g.tag,
           (m.role = 'parent' or coalesce((m.perms ->> 'view_health')::boolean, false)), d.created_at
    from devices d join members m on m.user_id = d.user_id and m.baby_id = p_baby
    join babies b on b.id = p_baby
    left join key_grants g on g.baby_id = p_baby and g.grantee = 'd:' || d.id::text and g.epoch = b.epoch
    where parent or d.user_id = auth.uid()
    order by d.created_at;
end $$;

create function list_recovery(p_baby uuid)
returns table (recovery_pub jsonb, tag text)
language plpgsql security definer stable set search_path = public as $$
begin
  if not is_parent(p_baby) then raise exception 'Only parents can do this'; end if;
  return query select b.recovery_pub, g.tag from babies b left join key_grants g on g.baby_id = b.id and g.epoch = b.epoch and g.grantee = 'recovery' where b.id = p_baby;
end $$;

-- Gives one phone the keys. A parent may approve anyone's phone; a member may approve their own other phone
-- (using keys they already hold). Health keys only go to people allowed to see health notes.
create function grant_device(p_baby uuid, p_device uuid, p_wrap_main text, p_wrap_health text, p_auth text, p_tag text) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); owner_ uuid; m members; ep int; vh boolean;
begin
  if not is_member(p_baby) then raise exception 'no access'; end if;
  select user_id into owner_ from devices where id = p_device;
  if owner_ is null then raise exception 'unknown phone'; end if;
  if owner_ <> me and not is_parent(p_baby) then raise exception 'Only parents can approve someone else''s phone'; end if;
  select * into m from members where baby_id = p_baby and user_id = owner_;
  if not found then raise exception 'not a member'; end if;
  vh := m.role = 'parent' or coalesce((m.perms ->> 'view_health')::boolean, false);
  if vh <> (p_wrap_health is not null) then raise exception 'health key must be given exactly to people who may see health notes'; end if;
  select epoch into ep from babies where id = p_baby;
  insert into key_grants (baby_id, grantee, epoch, wrap_main, wrap_health, auth, tag, granted_by)
    values (p_baby, 'd:' || p_device::text, ep, p_wrap_main, p_wrap_health, p_auth, p_tag, me)
    on conflict (baby_id, grantee, epoch) do update set wrap_main = excluded.wrap_main, wrap_health = excluded.wrap_health,
      auth = excluded.auth, tag = excluded.tag, granted_by = excluded.granted_by, created_at = now();
  perform log_activity(p_baby, 'device_approved', null, null, jsonb_build_object('person', display_of(p_baby, owner_), 'phone', (select name from devices where id = p_device)));
end $$;

-- Replaces the recovery code (a parent generated a new one and re-wrapped the current keys to it).
create function set_recovery(p_baby uuid, p_pub jsonb, p_priv_wrapped text, p_wrap_main text, p_wrap_health text, p_tag text) returns void
language plpgsql security definer set search_path = public as $$
declare ep int;
begin
  if not is_parent(p_baby) then raise exception 'Only parents can do this'; end if;
  if not pub_ok(p_pub) or p_wrap_main is null or p_wrap_health is null or p_priv_wrapped is null then raise exception 'bad recovery data'; end if;
  select epoch into ep from babies where id = p_baby;
  update babies set recovery_pub = p_pub, recovery_priv_wrapped = p_priv_wrapped where id = p_baby;
  insert into key_grants (baby_id, grantee, epoch, wrap_main, wrap_health, tag, granted_by)
    values (p_baby, 'recovery', ep, p_wrap_main, p_wrap_health, p_tag, auth.uid())
    on conflict (baby_id, grantee, epoch) do update set wrap_main = excluded.wrap_main, wrap_health = excluded.wrap_health, tag = excluded.tag, granted_by = excluded.granted_by, created_at = now();
  perform log_activity(p_baby, 'recovery_code_changed');
end $$;

-- A parent's phone changed the keys (after someone left, lost a phone, or lost health access).
-- Old entries stay readable through the keyrings; new entries use the new epoch.
create function rotate_keys(p_baby uuid, p_epoch int, p_grants jsonb, p_keyring_main text, p_keyring_health text, p_profile text, p_health_check text default null) returns void
language plpgsql security definer set search_path = public as $$
declare g jsonb; cur int; owner_ uuid; m members; vh boolean; seen_recovery boolean := false; me uuid := auth.uid();
begin
  if not is_parent(p_baby) then raise exception 'Only parents can change the keys'; end if;
  select epoch into cur from babies where id = p_baby for update;
  if p_epoch <> cur + 1 then raise exception 'stale epoch'; end if;
  if jsonb_typeof(p_grants) <> 'array' or jsonb_array_length(p_grants) > 200 then raise exception 'bad grants'; end if;
  if length(coalesce(p_profile, '')) > 8192 then raise exception 'profile too large'; end if;
  if p_health_check is null then raise exception 'the health check is required'; end if;
  delete from key_grants where baby_id = p_baby;
  for g in select value from jsonb_array_elements(p_grants) loop
    if g ->> 'grantee' = 'recovery' then
      if (g ->> 'wrap_health') is null then raise exception 'recovery needs both keys'; end if;
      seen_recovery := true;
    else
      select d.user_id into owner_ from devices d where 'd:' || d.id::text = g ->> 'grantee';
      select * into m from members where baby_id = p_baby and user_id = owner_;
      if not found then raise exception 'grant for someone who is not a member'; end if;
      vh := m.role = 'parent' or coalesce((m.perms ->> 'view_health')::boolean, false);
      if vh <> ((g ->> 'wrap_health') is not null) then raise exception 'health key must be given exactly to people who may see health notes'; end if;
    end if;
    insert into key_grants (baby_id, grantee, epoch, wrap_main, wrap_health, auth, tag, granted_by)
      values (p_baby, g ->> 'grantee', p_epoch, g ->> 'wrap_main', g ->> 'wrap_health', g ->> 'auth', g ->> 'tag', me);
  end loop;
  if not seen_recovery then raise exception 'recovery grant is required'; end if;
  update babies set epoch = p_epoch, keyring_main = p_keyring_main, keyring_health = p_keyring_health, health_check = p_health_check,
                    profile = coalesce(p_profile, profile), rotate_needed = false where id = p_baby;
  perform log_activity(p_baby, 'keys_rotated');
end $$;

-- ── babies & people ───────────────────────────────────────────────────────────────────────────
-- p_grant / p_recovery_grant look like {"wrap_main": "...", "wrap_health": "...", "tag": "..."}.
create function create_baby(p_profile text, p_display_name text, p_device uuid, p_grant jsonb, p_recovery_pub jsonb,
                            p_recovery_priv_wrapped text, p_recovery_grant jsonb, p_id uuid default null, p_health_check text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare b uuid; me uuid := auth.uid();
begin
  if me is null then raise exception 'not signed in'; end if;
  if (select count(*) from babies where created_by = me) >= 5 then raise exception 'Baby limit reached'; end if;
  if not exists (select 1 from devices where id = p_device and user_id = me) then raise exception 'unknown phone'; end if;
  if not pub_ok(p_recovery_pub) or p_recovery_priv_wrapped is null then raise exception 'bad recovery data'; end if;
  if p_health_check is null then raise exception 'the health check is required'; end if;
  if (p_grant ->> 'wrap_main') is null or (p_grant ->> 'wrap_health') is null
     or (p_recovery_grant ->> 'wrap_main') is null or (p_recovery_grant ->> 'wrap_health') is null then raise exception 'both keys are required'; end if;
  -- The phone picks the log's id itself: it is part of the context the keys are wrapped under.
  insert into babies (id, profile, created_by, recovery_pub, recovery_priv_wrapped, health_check)
    values (coalesce(p_id, gen_random_uuid()), left(coalesce(p_profile, ''), 8192), me, p_recovery_pub, p_recovery_priv_wrapped, left(p_health_check, 256)) returning id into b;
  insert into members (baby_id, user_id, email, display_name, role, perms)
    values (b, me, coalesce(auth.jwt() ->> 'email', ''), left(coalesce(p_display_name, ''), 60), 'parent', role_preset('parent'));
  insert into key_grants (baby_id, grantee, epoch, wrap_main, wrap_health, auth, tag, granted_by) values
    (b, 'd:' || p_device::text, 1, p_grant ->> 'wrap_main', p_grant ->> 'wrap_health', null, p_grant ->> 'tag', me),
    (b, 'recovery', 1, p_recovery_grant ->> 'wrap_main', p_recovery_grant ->> 'wrap_health', null, p_recovery_grant ->> 'tag', me);
  perform log_activity(b, 'log_created');
  return b;
end $$;

create function update_baby(p_baby uuid, p_profile text, p_epoch int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_perm(p_baby, 'edit_profile') then raise exception 'You do not have permission to change the profile'; end if;
  if p_epoch <> (select epoch from babies where id = p_baby) then raise exception 'stale epoch'; end if;
  if length(coalesce(p_profile, '')) > 8192 then raise exception 'profile too large'; end if;
  update babies set profile = p_profile where id = p_baby;
  perform log_activity(p_baby, 'profile_changed');
end $$;

create function list_people(p_baby uuid)
returns table (user_id uuid, display_name text, role text, email text, perms jsonb, joined_at timestamptz, is_you boolean, details text, details_epoch int)
language plpgsql security definer stable set search_path = public as $$
declare full_view boolean;
begin
  if not is_member(p_baby) then raise exception 'no access'; end if;
  full_view := has_perm(p_baby, 'view_people');
  return query
    select m.user_id,
           coalesce(nullif(m.display_name, ''), split_part(m.email, '@', 1)),
           case when full_view then m.role end,
           case when full_view then m.email end,
           case when is_parent(p_baby) then m.perms end,
           m.joined_at, m.user_id = auth.uid(),
           case when full_view or m.user_id = auth.uid() then m.details else '' end,
           case when full_view or m.user_id = auth.uid() then m.details_epoch else 0 end
    from members m where m.baby_id = p_baby order by m.joined_at;
end $$;

-- A person's own contact details for one log (ciphertext made on their phone; only people who may see the member list get it back).
create function set_my_details(p_baby uuid, p_blob text, p_epoch int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_member(p_baby) then raise exception 'no access'; end if;
  if length(coalesce(p_blob, '')) > 4096 then raise exception 'details too large'; end if;
  if p_epoch is null or p_epoch < 1 or p_epoch > (select epoch from babies where id = p_baby) then raise exception 'bad epoch'; end if;
  update members set details = coalesce(p_blob, ''), details_epoch = p_epoch where baby_id = p_baby and user_id = auth.uid();
end $$;

create function set_display_name(p_name text) returns void language sql security definer set search_path = public as $$
  update members set display_name = left(trim(coalesce(p_name, '')), 60) where user_id = auth.uid() $$;

-- p_health_grants: when the person newly gains health access, [{"device": "<uuid>", "wrap_health": "..."}] for each of
-- their phones that already holds keys. Losing health access removes their health key and asks for a key rotation.
create function set_member(p_baby uuid, p_user uuid, p_role text, p_perms jsonb, p_health_grants jsonb default '[]') returns void
language plpgsql security definer set search_path = public as $$
declare old members; new_perms jsonb; old_vh boolean; new_vh boolean; g jsonb; n int;
begin
  if not is_parent(p_baby) then raise exception 'Only parents can change access'; end if;
  if p_role not in ('parent','family','caregiver','babysitter','medical','friend') then raise exception 'bad role'; end if;
  select * into old from members where baby_id = p_baby and user_id = p_user for update;
  if not found then raise exception 'not a member'; end if;
  if old.role = 'parent' and p_role <> 'parent'
     and (select count(*) from members where baby_id = p_baby and role = 'parent') < 2 then
    raise exception 'A log needs at least one parent';
  end if;
  new_perms := normalize_perms(p_role, p_perms);
  old_vh := old.role = 'parent' or coalesce((old.perms ->> 'view_health')::boolean, false);
  new_vh := p_role = 'parent' or coalesce((new_perms ->> 'view_health')::boolean, false);
  if new_vh and not old_vh then
    for g in select value from jsonb_array_elements(coalesce(p_health_grants, '[]')) loop
      update key_grants k set wrap_health = g ->> 'wrap_health'
        where k.baby_id = p_baby and k.grantee = 'd:' || (g ->> 'device') and k.epoch = (select epoch from babies where id = p_baby)
          and (g ->> 'device')::uuid in (select id from devices where user_id = p_user);
    end loop;
    select count(*) into n from key_grants k join babies b on b.id = k.baby_id and b.epoch = k.epoch
      where k.baby_id = p_baby and k.wrap_health is null and k.grantee in (select 'd:' || id::text from devices where user_id = p_user);
    if n > 0 then raise exception 'health key grants are required for each of their phones'; end if;
  elsif old_vh and not new_vh then
    update key_grants set wrap_health = null where baby_id = p_baby and grantee in (select 'd:' || id::text from devices where user_id = p_user);
    update babies set rotate_needed = true where id = p_baby;
  end if;
  update members set role = p_role, perms = new_perms where baby_id = p_baby and user_id = p_user;
  perform log_activity(p_baby, case when old.role <> p_role then 'role_changed' else 'permissions_changed' end,
                       null, null, jsonb_build_object('person', display_of(p_baby, p_user), 'role', p_role));
end $$;

create function remove_member(p_baby uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t members; me uuid := auth.uid();
begin
  if me is null then raise exception 'not signed in'; end if;
  if p_user <> me and not is_parent(p_baby) then raise exception 'Only parents can remove people'; end if;
  select * into t from members where baby_id = p_baby and user_id = p_user for update;
  if not found then return; end if;
  if t.role = 'parent' and (select count(*) from members where baby_id = p_baby and role = 'parent') < 2 then
    raise exception 'Make someone else a parent before removing the last parent';
  end if;
  perform log_activity(p_baby, case when p_user = me then 'left' else 'member_removed' end, null, null,
                       jsonb_build_object('person', display_of(p_baby, p_user)));
  delete from members where baby_id = p_baby and user_id = p_user;
  delete from key_grants where baby_id = p_baby and grantee in (select 'd:' || id::text from devices where user_id = p_user);
  update babies set rotate_needed = true where id = p_baby;   -- they may still hold the keys: change them
end $$;

-- Retire a helper (caregiver, babysitter, medical assistant, friend): their access ends as with remove_member, and the note above is kept.
create function retire_member(p_baby uuid, p_user uuid, p_reason text default '') returns void
language plpgsql security definer set search_path = public as $$
declare t members;
begin
  if not is_parent(p_baby) then raise exception 'Only parents can retire people'; end if;
  if coalesce(p_reason, '') not in ('', 'moved', 'stopped', 'passed', 'other') then raise exception 'bad reason'; end if;
  select * into t from members where baby_id = p_baby and user_id = p_user for update;
  if not found then return; end if;
  if t.role not in ('caregiver','babysitter','medical','friend') then raise exception 'Only caregivers, babysitters, medical assistants and friends can be retired'; end if;
  insert into retired (baby_id, user_id, display_name, role, details, details_epoch, joined_at, reason)
    values (p_baby, p_user, coalesce(nullif(t.display_name, ''), split_part(t.email, '@', 1)), t.role, t.details, t.details_epoch, t.joined_at, coalesce(p_reason, ''));
  perform log_activity(p_baby, 'member_retired', null, null, jsonb_build_object('person', display_of(p_baby, p_user), 'reason', coalesce(p_reason, '')));
  delete from members where baby_id = p_baby and user_id = p_user;
  delete from key_grants where baby_id = p_baby and grantee in (select 'd:' || id::text from devices where user_id = p_user);
  update babies set rotate_needed = true where id = p_baby;   -- they may still hold the keys: change them
end $$;

-- The retired helpers of a log, for the people who may see the family list (newest first).
create function list_retired(p_baby uuid)
returns table (id uuid, user_id uuid, display_name text, role text, details text, details_epoch int, joined_at timestamptz, retired_at timestamptz, reason text)
language plpgsql security definer stable set search_path = public as $$
begin
  if not is_member(p_baby) then raise exception 'no access'; end if;
  if not has_perm(p_baby, 'view_people') then return; end if;
  return query select r.id, r.user_id, r.display_name, r.role, r.details, r.details_epoch, r.joined_at, r.retired_at, r.reason
               from retired r where r.baby_id = p_baby order by r.retired_at desc;
end $$;

-- A parent can delete the note about a retired helper.
create function forget_retired(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare b uuid;
begin
  select baby_id into b from retired where id = p_id;
  if b is null then return; end if;
  if not is_parent(b) then raise exception 'Only parents can do this'; end if;
  delete from retired where id = p_id;
end $$;

-- Lost authenticator: another parent can reset a member's two-step verification (they re-enrol on next sign-in).
create function reset_member_mfa(p_baby uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_parent(p_baby) then raise exception 'Only parents can do this'; end if;
  if p_user = auth.uid() then raise exception 'Ask another parent to reset yours'; end if;
  if not exists (select 1 from members where baby_id = p_baby and user_id = p_user) then raise exception 'not a member'; end if;
  delete from auth.mfa_factors where user_id = p_user;
  delete from auth.sessions where user_id = p_user;   -- a session that already passed MFA must not outlive the reset (it may be the compromised one)
  perform log_activity(p_baby, 'mfa_reset', null, null, jsonb_build_object('person', display_of(p_baby, p_user)));
end $$;

-- ── invites (2 hours, single use, rescindable) + parent approval ──────────────────────────────
create function create_invite(p_baby uuid, p_role text, p_perms jsonb default '{}') returns text
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not is_parent(p_baby) then raise exception 'Only parents can invite'; end if;
  if p_role not in ('parent','family','caregiver','babysitter','medical','friend') then raise exception 'bad role'; end if;
  delete from invites where expires_at < now() - interval '1 day';
  if (select count(*) from invites where baby_id = p_baby and used_by is null and expires_at > now()) >= 10 then
    raise exception 'Too many open invites – rescind some first';
  end if;
  c := (select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::int, 1), '') from generate_series(1, 10));
  insert into invites (code, baby_id, role, perms, created_by)
    values (c, p_baby, p_role, normalize_perms(p_role, p_perms), auth.uid());
  perform log_activity(p_baby, 'invite_created', null, null, jsonb_build_object('role', p_role));
  return c;
end $$;

create function list_invites(p_baby uuid)
returns table (code text, role text, perms jsonb, expires_at timestamptz, created_by_name text)
language plpgsql security definer stable set search_path = public as $$
begin
  if not is_parent(p_baby) then raise exception 'Only parents can see invites'; end if;
  return query select i.code, i.role, i.perms, i.expires_at, display_of(p_baby, i.created_by)
               from invites i where i.baby_id = p_baby and i.used_by is null and i.expires_at > now() order by i.created_at desc;
end $$;

create function rescind_invite(p_code text) returns void language plpgsql security definer set search_path = public as $$
declare i invites;
begin
  select * into i from invites where code = upper(trim(p_code));
  if not found then return; end if;
  if not is_parent(i.baby_id) then raise exception 'Only parents can rescind invites'; end if;
  delete from invites where code = i.code and used_by is null;
  perform log_activity(i.baby_id, 'invite_rescinded', null, null, jsonb_build_object('role', i.role));
end $$;

-- Redeeming only creates a *request*; nothing is shared until a parent approves it.
-- p_device is the redeemer's registered phone, p_proof an HMAC made with the secret inside the QR code (if they scanned it).
-- Returns {status:'pending'} or {status:'invalid'} (wrong, used, rescinded or expired code).
create function redeem_invite(p_code text, p_display_name text default '', p_device uuid default null, p_proof text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare i invites; me uuid := auth.uid(); mail text := coalesce(auth.jwt() ->> 'email', ''); rid uuid;
begin
  if me is null then raise exception 'not signed in'; end if;
  delete from invite_attempts where at < now() - interval '1 day';
  if (select count(*) from invite_attempts where user_id = me and at > now() - interval '15 minutes') >= 10 then
    raise exception 'Too many attempts. Try again in a few minutes.';
  end if;
  insert into invite_attempts (user_id) values (me);
  select * into i from invites where code = upper(trim(p_code)) for update;
  if not found or i.used_by is not null or i.expires_at < now() then
    -- Return (don't raise): an exception would roll back the attempt record above and defeat the rate limit.
    return jsonb_build_object('status', 'invalid');
  end if;
  if exists (select 1 from members where baby_id = i.baby_id and user_id = me) then
    raise exception 'You already have access to this log';
  end if;
  if not exists (select 1 from devices where id = p_device and user_id = me) then raise exception 'unknown phone'; end if;
  update invites set used_by = me where code = i.code;
  update join_requests set status = 'cancelled' where baby_id = i.baby_id and user_id = me and status = 'pending';
  insert into join_requests (baby_id, user_id, email, display_name, role, perms, invited_by, invite_code, device_id, proof)
    values (i.baby_id, me, mail, left(coalesce(nullif(trim(p_display_name), ''), split_part(mail, '@', 1)), 60), i.role, i.perms, i.created_by,
            i.code, p_device, left(p_proof, 256))
    returning id into rid;
  perform log_activity(i.baby_id, 'join_requested', null, null, jsonb_build_object('email', mail, 'role', i.role));
  return jsonb_build_object('status', 'pending', 'request_id', rid);
end $$;

create function my_requests() returns table (id uuid, status text, created_at timestamptz, expires_at timestamptz)
language sql security definer stable set search_path = public as $$
  select r.id, case when r.status = 'pending' and r.expires_at < now() then 'expired' else r.status end, r.created_at, r.expires_at
  from join_requests r where r.user_id = auth.uid() and r.created_at > now() - interval '2 days' order by r.created_at desc $$;

create function cancel_my_request(p_id uuid) returns void language sql security definer set search_path = public as $$
  update join_requests set status = 'cancelled' where id = p_id and user_id = auth.uid() and status = 'pending' $$;

create function list_requests(p_baby uuid)
returns table (id uuid, email text, display_name text, role text, perms jsonb, created_at timestamptz, expires_at timestamptz,
               device_id uuid, device_name text, device_pub jsonb, invite_code text, proof text)
language plpgsql security definer stable set search_path = public as $$
begin
  if not is_parent(p_baby) then raise exception 'Only parents can see requests'; end if;
  return query select r.id, r.email, r.display_name, r.role, r.perms, r.created_at, r.expires_at, r.device_id, d.name, d.pubkey, r.invite_code, r.proof
               from join_requests r left join devices d on d.id = r.device_id
               where r.baby_id = p_baby and r.status = 'pending' and r.expires_at > now() order by r.created_at;
end $$;

-- Approving needs p_grant: the log keys wrapped to the requester's phone ({"wrap_main","wrap_health","auth","tag"}).
create function decide_request(p_id uuid, p_approve boolean, p_role text default null, p_perms jsonb default null, p_grant jsonb default null) returns void
language plpgsql security definer set search_path = public as $$
declare r join_requests; role_ text; perms_ jsonb; vh boolean; ep int;
begin
  select * into r from join_requests where id = p_id for update;
  if not found or r.status <> 'pending' or r.expires_at < now() then raise exception 'This request is no longer pending'; end if;
  if not is_parent(r.baby_id) then raise exception 'Only parents can decide requests'; end if;
  if p_approve then
    role_ := coalesce(p_role, r.role);
    perms_ := normalize_perms(role_, coalesce(p_perms, r.perms));
    vh := role_ = 'parent' or coalesce((perms_ ->> 'view_health')::boolean, false);
    if p_grant is null or (p_grant ->> 'wrap_main') is null or r.device_id is null then raise exception 'the encryption keys must be shared when approving'; end if;
    if vh <> ((p_grant ->> 'wrap_health') is not null) then raise exception 'health key must be given exactly to people who may see health notes'; end if;
    select epoch into ep from babies where id = r.baby_id;
    insert into members (baby_id, user_id, email, display_name, role, perms)
      values (r.baby_id, r.user_id, r.email, r.display_name, role_, perms_)
      on conflict (baby_id, user_id) do nothing;
    insert into key_grants (baby_id, grantee, epoch, wrap_main, wrap_health, auth, tag, granted_by)
      values (r.baby_id, 'd:' || r.device_id::text, ep, p_grant ->> 'wrap_main', p_grant ->> 'wrap_health', p_grant ->> 'auth', p_grant ->> 'tag', auth.uid())
      on conflict (baby_id, grantee, epoch) do update set wrap_main = excluded.wrap_main, wrap_health = excluded.wrap_health, auth = excluded.auth, tag = excluded.tag;
    update join_requests set status = 'approved' where id = p_id;
    perform log_activity(r.baby_id, 'member_approved', null, null, jsonb_build_object('email', r.email, 'role', role_));
  else
    update join_requests set status = 'denied' where id = p_id;
    perform log_activity(r.baby_id, 'request_denied', null, null, jsonb_build_object('email', r.email));
  end if;
end $$;

-- ── entries: the only write path ──────────────────────────────────────────────────────────────
-- p_rows: [{id, blob, epoch, sensitive, updated, deleted}]. The server cannot read `blob`; it checks who may write,
-- sizes, and that new content uses the current key epoch. Returns {"denied": [ids], "stale": <current epoch or null>, "ceiling": the newest edit time it accepts}:
-- `stale` means the phone has old keys and must fetch the new ones and re-send (nothing is lost).
create function push_events(p_baby uuid, p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid(); r jsonb; ex events; denied text[] := '{}'; stale int := null; cur int;
  v_id text; v_blob text; v_epoch int; v_sens boolean; v_upd bigint; v_del boolean;
  now_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint; need text; mine boolean;
begin
  if me is null then raise exception 'not signed in'; end if;
  if not is_member(p_baby) then raise exception 'no access'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then raise exception 'bad batch'; end if;
  if (select count(*) from events where baby_id = p_baby) + jsonb_array_length(p_rows) > 150000 then
    raise exception 'Entry limit reached for this log';
  end if;
  select epoch into cur from babies where id = p_baby;

  for r in select value from jsonb_array_elements(p_rows) loop
    v_id := r ->> 'id'; v_blob := coalesce(r ->> 'blob', '');
    begin
      v_epoch := (r ->> 'epoch')::int; v_sens := coalesce((r ->> 'sensitive')::boolean, false);
      v_upd := (r ->> 'updated')::bigint; v_del := coalesce((r ->> 'deleted')::boolean, false);
    exception when others then
      denied := denied || coalesce(v_id, '?'); continue;
    end;
    if v_id is null or v_id !~ '^[A-Za-z0-9_-]{1,64}$' or v_upd is null or v_epoch is null or v_epoch < 1
       or length(v_blob) > 8192 or (not v_del and length(v_blob) < 24) then
      denied := denied || coalesce(v_id, '?'); continue;
    end if;
    if v_del then v_blob := ''; end if;
    v_upd := least(v_upd, now_ms + 60000);   -- a phone with a wrong clock can't pin an entry against later edits

    select * into ex from events where baby_id = p_baby and id = v_id for update;
    if not found then
      if v_del then continue; end if;       -- deleting something the server never had: nothing to record
      if not has_perm(p_baby, 'add_entries') or (v_sens and not has_perm(p_baby, 'view_health')) then
        denied := denied || v_id; continue;
      end if;
      if v_epoch <> cur then stale := cur; continue; end if;
      insert into events (baby_id, id, blob, epoch, sensitive, updated, deleted, created_by, updated_by)
        values (p_baby, v_id, v_blob, v_epoch, v_sens, v_upd, false, me, me);
      perform log_activity(p_baby, 'entry_added', v_id, case when v_sens then 'private' end);
    else
      if v_upd <= ex.updated then continue; end if;
      if v_sens <> ex.sensitive or (ex.sensitive and not has_perm(p_baby, 'view_health')) then
        denied := denied || v_id; continue;
      end if;
      mine := ex.created_by = me;
      need := case when v_del and not ex.deleted then (case when mine then 'delete_own' else 'delete_others' end)
                   else (case when mine then 'edit_own' else 'edit_others' end) end;
      if v_del and ex.deleted then continue; end if;
      if not has_perm(p_baby, need) then denied := denied || v_id; continue; end if;
      if not v_del and v_epoch <> cur then stale := cur; continue; end if;
      update events set blob = v_blob, epoch = case when v_del then ex.epoch else v_epoch end, updated = v_upd, deleted = v_del,
                        updated_by = me, synced_at = clock_timestamp()
        where baby_id = p_baby and id = v_id;
      perform log_activity(p_baby, case when v_del then 'entry_deleted' else 'entry_edited' end, v_id, case when ex.sensitive then 'private' end,
                           jsonb_build_object('author', display_of(p_baby, ex.created_by)));
    end if;
  end loop;
  return jsonb_build_object('denied', to_jsonb(denied), 'stale', stale, 'ceiling', now_ms + 60000);
end $$;

-- ── audit log (parents only) ──────────────────────────────────────────────────────────────────
create function activity_log(p_baby uuid, p_limit int default 100, p_before bigint default null)
returns table (id bigint, at timestamptz, actor text, action text, entry_id text, entry_type text, detail jsonb)
language plpgsql security definer stable set search_path = public as $$
begin
  if not is_parent(p_baby) then raise exception 'Only parents can see the activity log'; end if;
  return query select a.id, a.at, a.actor, a.action, a.entry_id, a.entry_type, a.detail
               from activity a where a.baby_id = p_baby and (p_before is null or a.id < p_before)
               order by a.id desc limit least(greatest(p_limit, 1), 500);
end $$;

-- ── account deletion (App Store / Play Store requirement) ─────────────────────────────────────
-- If you are a log's only parent, the log is deleted with your account (the app warns first).
-- If another parent exists, you simply leave it.
create function delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); b record;
begin
  if me is null then raise exception 'not signed in'; end if;
  for b in select baby_id from members where user_id = me loop
    if (select role from members where baby_id = b.baby_id and user_id = me) = 'parent'
       and not exists (select 1 from members where baby_id = b.baby_id and role = 'parent' and user_id <> me) then
      delete from babies where id = b.baby_id;     -- cascades to events, invites, requests, members, activity, grants
    else
      perform log_activity(b.baby_id, 'left', null, null, jsonb_build_object('person', display_of(b.baby_id, me), 'account_deleted', true));
      update babies set rotate_needed = true where id = b.baby_id;
    end if;
  end loop;
  delete from retired where user_id = me;          -- (notes about this person as a retired helper go too)
  delete from auth.users where id = me;            -- cascades to remaining memberships, requests and phones
end $$;

-- ── My account, my requests ───────────────────────────────────────────────────────────────────
-- ── language reports ────────────────────────────────────────────────────────────────────────────
-- The language-report Edge Function (supabase/functions/language-report) passes reports of translation problems on by email. So
-- that nobody can flood that inbox, it asks here first: at most 5 reports an hour from one sender, and 200 a day from everyone.
-- Senders are kept only as hashes (of an account id or an address), never as they are. Only the function's service role calls this;
-- the app itself can't read the table or call the function (see the privileges below).
create table report_limits (k text primary key check (length(k) <= 128), since timestamptz not null default now(), n int not null default 0);
alter table report_limits enable row level security;   -- and no policies: nobody but the service role gets in
create function language_report_allow(p_key text) returns boolean
language plpgsql security definer set search_path = public as $$
declare mine int; everyone int;
begin
  if p_key is null or length(p_key) not between 8 and 128 or p_key = '*' then raise exception 'bad key'; end if;
  insert into report_limits as r (k, since, n) values (p_key, now(), 1)
    on conflict (k) do update set n = case when r.since < now() - interval '1 hour' then 1 else r.n + 1 end,
                                  since = case when r.since < now() - interval '1 hour' then now() else r.since end
    returning n into mine;
  insert into report_limits as r (k, since, n) values ('*', now(), 1)
    on conflict (k) do update set n = case when r.since < now() - interval '1 day' then 1 else r.n + 1 end,
                                  since = case when r.since < now() - interval '1 day' then now() else r.since end
    returning n into everyone;
  delete from report_limits where k <> '*' and since < now() - interval '1 day';   -- old senders are forgotten
  return mine <= 5 and everyone <= 200;
end $$;
do $$ begin if exists (select 1 from pg_roles where rolname = 'service_role') then grant execute on function language_report_allow(text) to service_role; end if; end $$;

-- ── privileges: clients read three tables and call the functions below; nothing else ──────────
revoke all on all tables in schema public from anon, authenticated;
grant select on babies, members, events to authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
grant execute on function
  jwt_aal(), is_member(uuid), is_parent(uuid), has_perm(uuid, text),   -- used inside the read policies
  register_device(text, jsonb), my_devices(), remove_device(uuid), my_grant(uuid, uuid), get_recovery(uuid), get_keyring(uuid),
  list_devices(uuid), list_recovery(uuid), grant_device(uuid, uuid, text, text, text, text), set_recovery(uuid, jsonb, text, text, text, text),
  rotate_keys(uuid, int, jsonb, text, text, text, text),
  create_baby(text, text, uuid, jsonb, jsonb, text, jsonb, uuid, text), update_baby(uuid, text, int), list_people(uuid), set_display_name(text), set_my_details(uuid, text, int),
  set_member(uuid, uuid, text, jsonb, jsonb), remove_member(uuid, uuid), reset_member_mfa(uuid, uuid),
  retire_member(uuid, uuid, text), list_retired(uuid), forget_retired(uuid),
  create_invite(uuid, text, jsonb), list_invites(uuid), rescind_invite(text), redeem_invite(text, text, uuid, text),
  my_requests(), cancel_my_request(uuid), list_requests(uuid), decide_request(uuid, boolean, text, jsonb, jsonb),
  push_events(uuid, jsonb), activity_log(uuid, int, bigint), delete_my_account()
to authenticated;
