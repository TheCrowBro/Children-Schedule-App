-- Little Log – Supabase schema (v2: roles, permissions, MFA, approved invites, audit log).
-- Run once in the Supabase SQL editor on a fresh project. It replaces any earlier version of this file
-- (drop the old tables first if you ran v1; there is no data migration).
--
-- Security model
--   * Clients can only READ babies / their own membership row / events (row-level security).
--     Every write goes through the security-definer functions below, which check role + permissions.
--   * Roles: parent (admin, everything), family, caregiver, babysitter, friend. Everyone except parents has
--     per-person permission flags (see role_preset). Parents must use an MFA (aal2) session; without one a parent
--     has no more access than a stranger.
--   * Joining needs an invite code AND a parent's approval. Invites last 2 hours, work once, and can be rescinded.
--   * `activity` is an append-only log of who did what, readable only by parents.

-- ── tables ────────────────────────────────────────────────────────────────────────────────────
create table babies (
  id uuid primary key default gen_random_uuid(),
  name text not null default '' check (length(name) <= 100),
  birth date,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create table members (
  baby_id uuid not null references babies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null default '',
  display_name text not null default '' check (length(display_name) <= 60),
  role text not null check (role in ('parent','family','caregiver','babysitter','friend')),
  perms jsonb not null default '{}',
  joined_at timestamptz not null default now(),
  primary key (baby_id, user_id)
);

create table invites (
  code text primary key,
  baby_id uuid not null references babies(id) on delete cascade,
  role text not null check (role in ('parent','family','caregiver','babysitter','friend')),
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
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  status text not null default 'pending' check (status in ('pending','approved','denied','cancelled'))
);
create unique index join_requests_one_pending on join_requests (baby_id, user_id) where status = 'pending';

create table events (
  baby_id uuid not null references babies(id) on delete cascade,
  id text not null,
  type text not null,
  ts bigint not null,
  end_ts bigint,
  data jsonb not null default '{}',
  note text not null default '',
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
returns void language sql security definer set search_path = public as $$
  insert into activity (baby_id, user_id, actor, action, entry_id, entry_type, detail)
  values (b, auth.uid(), coalesce(display_of(b, auth.uid()), ''), a, eid, etype, d) $$;

-- ── row-level security: read-only for clients ─────────────────────────────────────────────────
alter table babies          enable row level security;
alter table members         enable row level security;
alter table invites         enable row level security;
alter table join_requests   enable row level security;
alter table events          enable row level security;
alter table activity        enable row level security;
alter table invite_attempts enable row level security;

create policy babies_read  on babies  for select using (is_member(id));
create policy members_self on members for select using (user_id = auth.uid());   -- others via list_people()
create policy events_read  on events  for select using (
  is_member(baby_id) and (type not in ('health','med') or has_perm(baby_id, 'view_health')));
-- invites, join_requests, activity, invite_attempts: no policies = no direct access (functions only).

-- ── babies & people ───────────────────────────────────────────────────────────────────────────
create function create_baby(p_name text, p_birth date, p_display_name text default '') returns uuid
language plpgsql security definer set search_path = public as $$
declare b uuid; me uuid := auth.uid();
begin
  if me is null then raise exception 'not signed in'; end if;
  if (select count(*) from babies where created_by = me) >= 5 then raise exception 'Baby limit reached'; end if;
  insert into babies (name, birth, created_by) values (left(coalesce(p_name, ''), 100), p_birth, me) returning id into b;
  insert into members (baby_id, user_id, email, display_name, role, perms)
    values (b, me, coalesce(auth.jwt() ->> 'email', ''), left(coalesce(p_display_name, ''), 60), 'parent', role_preset('parent'));
  perform log_activity(b, 'log_created');
  return b;
end $$;

create function update_baby(p_baby uuid, p_name text, p_birth date) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_perm(p_baby, 'edit_profile') then raise exception 'You do not have permission to change the profile'; end if;
  update babies set name = left(coalesce(p_name, ''), 100), birth = p_birth where id = p_baby;
  perform log_activity(p_baby, 'profile_changed');
end $$;

create function list_people(p_baby uuid)
returns table (user_id uuid, display_name text, role text, email text, perms jsonb, joined_at timestamptz, is_you boolean)
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
           m.joined_at, m.user_id = auth.uid()
    from members m where m.baby_id = p_baby order by m.joined_at;
end $$;

create function set_display_name(p_name text) returns void language sql security definer set search_path = public as $$
  update members set display_name = left(trim(coalesce(p_name, '')), 60) where user_id = auth.uid() $$;

create function set_member(p_baby uuid, p_user uuid, p_role text, p_perms jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare old members;
begin
  if not is_parent(p_baby) then raise exception 'Only parents can change access'; end if;
  if p_role not in ('parent','family','caregiver','babysitter','friend') then raise exception 'bad role'; end if;
  select * into old from members where baby_id = p_baby and user_id = p_user for update;
  if not found then raise exception 'not a member'; end if;
  if old.role = 'parent' and p_role <> 'parent'
     and (select count(*) from members where baby_id = p_baby and role = 'parent') < 2 then
    raise exception 'A log needs at least one parent';
  end if;
  update members set role = p_role, perms = normalize_perms(p_role, p_perms) where baby_id = p_baby and user_id = p_user;
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
end $$;

-- Lost authenticator: another parent can reset a member's two-step verification (they re-enrol on next sign-in).
create function reset_member_mfa(p_baby uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_parent(p_baby) then raise exception 'Only parents can do this'; end if;
  if p_user = auth.uid() then raise exception 'Ask another parent to reset yours'; end if;
  if not exists (select 1 from members where baby_id = p_baby and user_id = p_user) then raise exception 'not a member'; end if;
  delete from auth.mfa_factors where user_id = p_user;
  perform log_activity(p_baby, 'mfa_reset', null, null, jsonb_build_object('person', display_of(p_baby, p_user)));
end $$;

-- ── invites (2 hours, single use, rescindable) + parent approval ──────────────────────────────
create function create_invite(p_baby uuid, p_role text, p_perms jsonb default '{}') returns text
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not is_parent(p_baby) then raise exception 'Only parents can invite'; end if;
  if p_role not in ('parent','family','caregiver','babysitter','friend') then raise exception 'bad role'; end if;
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
-- Returns {status:'pending'} or {status:'invalid'} (wrong, used, rescinded or expired code).
create function redeem_invite(p_code text, p_display_name text default '') returns jsonb
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
  update invites set used_by = me where code = i.code;
  update join_requests set status = 'cancelled' where baby_id = i.baby_id and user_id = me and status = 'pending';
  insert into join_requests (baby_id, user_id, email, display_name, role, perms, invited_by)
    values (i.baby_id, me, mail, left(coalesce(nullif(trim(p_display_name), ''), split_part(mail, '@', 1)), 60), i.role, i.perms, i.created_by)
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
returns table (id uuid, email text, display_name text, role text, perms jsonb, created_at timestamptz, expires_at timestamptz)
language plpgsql security definer stable set search_path = public as $$
begin
  if not is_parent(p_baby) then raise exception 'Only parents can see requests'; end if;
  return query select r.id, r.email, r.display_name, r.role, r.perms, r.created_at, r.expires_at
               from join_requests r where r.baby_id = p_baby and r.status = 'pending' and r.expires_at > now() order by r.created_at;
end $$;

create function decide_request(p_id uuid, p_approve boolean, p_role text default null, p_perms jsonb default null) returns void
language plpgsql security definer set search_path = public as $$
declare r join_requests; role_ text;
begin
  select * into r from join_requests where id = p_id for update;
  if not found or r.status <> 'pending' or r.expires_at < now() then raise exception 'This request is no longer pending'; end if;
  if not is_parent(r.baby_id) then raise exception 'Only parents can decide requests'; end if;
  if p_approve then
    role_ := coalesce(p_role, r.role);
    insert into members (baby_id, user_id, email, display_name, role, perms)
      values (r.baby_id, r.user_id, r.email, r.display_name, role_, normalize_perms(role_, coalesce(p_perms, r.perms)))
      on conflict (baby_id, user_id) do nothing;
    update join_requests set status = 'approved' where id = p_id;
    perform log_activity(r.baby_id, 'member_approved', null, null, jsonb_build_object('email', r.email, 'role', role_));
  else
    update join_requests set status = 'denied' where id = p_id;
    perform log_activity(r.baby_id, 'request_denied', null, null, jsonb_build_object('email', r.email));
  end if;
end $$;

-- ── entries: the only write path ──────────────────────────────────────────────────────────────
-- Applies a batch of entries. Returns {"denied": [ids]} for rows this person may not write, so the client
-- can restore the server's version. Stale writes (older than what is stored) are ignored silently.
create function push_events(p_baby uuid, p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid(); r jsonb; ex events; denied text[] := '{}';
  v_id text; v_type text; v_ts bigint; v_end bigint; v_upd bigint; v_del boolean; v_data jsonb; v_note text;
  now_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint; need text; mine boolean;
begin
  if me is null then raise exception 'not signed in'; end if;
  if not is_member(p_baby) then raise exception 'no access'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then raise exception 'bad batch'; end if;
  if (select count(*) from events where baby_id = p_baby) + jsonb_array_length(p_rows) > 150000 then
    raise exception 'Entry limit reached for this log';
  end if;

  for r in select value from jsonb_array_elements(p_rows) loop
    v_id := r ->> 'id'; v_type := r ->> 'type'; v_note := coalesce(r ->> 'note', ''); v_data := coalesce(r -> 'data', '{}');
    v_del := coalesce((r ->> 'deleted')::boolean, false);
    begin
      v_ts := (r ->> 'ts')::bigint; v_end := (r ->> 'end_ts')::bigint; v_upd := (r ->> 'updated')::bigint;
    exception when others then
      denied := denied || coalesce(v_id, '?'); continue;
    end;
    if v_id is null or v_id !~ '^[A-Za-z0-9_-]{1,64}$'
       or v_type is null or v_type not in ('feed','diaper','sleep','wake','vomit','play','health','med')
       or v_ts is null or v_upd is null or v_ts < 946684800000 or v_ts > now_ms + 7 * 86400000
       or (v_end is not null and (v_end < v_ts or v_end > now_ms + 7 * 86400000))
       or jsonb_typeof(v_data) <> 'object' or octet_length(v_data::text) > 4096 or length(v_note) > 2000 then
      denied := denied || coalesce(v_id, '?'); continue;
    end if;
    v_upd := least(v_upd, now_ms + 60000);   -- a phone with a wrong clock can't pin an entry against future edits

    select * into ex from events where baby_id = p_baby and id = v_id for update;
    if not found then
      if v_del then continue; end if;       -- deleting something the server never had: nothing to record
      if not has_perm(p_baby, 'add_entries') or (v_type in ('health','med') and not has_perm(p_baby, 'view_health')) then
        denied := denied || v_id; continue;
      end if;
      insert into events (baby_id, id, type, ts, end_ts, data, note, updated, deleted, created_by, updated_by)
        values (p_baby, v_id, v_type, v_ts, v_end, v_data, v_note, v_upd, false, me, me);
      perform log_activity(p_baby, 'entry_added', v_id, v_type, jsonb_build_object('at', v_ts));
    else
      if v_upd <= ex.updated then continue; end if;
      if v_type <> ex.type or (ex.type in ('health','med') and not has_perm(p_baby, 'view_health')) then
        denied := denied || v_id; continue;
      end if;
      mine := ex.created_by = me;
      need := case when v_del and not ex.deleted then (case when mine then 'delete_own' else 'delete_others' end)
                   else (case when mine then 'edit_own' else 'edit_others' end) end;
      if v_del and ex.deleted then continue; end if;
      if not has_perm(p_baby, need) then denied := denied || v_id; continue; end if;
      update events set ts = v_ts, end_ts = v_end, data = v_data, note = v_note, updated = v_upd, deleted = v_del,
                        updated_by = me, synced_at = clock_timestamp()
        where baby_id = p_baby and id = v_id;
      perform log_activity(p_baby, case when v_del then 'entry_deleted' else 'entry_edited' end, v_id, v_type,
                           jsonb_build_object('at', v_ts, 'author', display_of(p_baby, ex.created_by)));
    end if;
  end loop;
  return jsonb_build_object('denied', to_jsonb(denied));
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
  for b in select baby_id from members where user_id = me and role = 'parent' loop
    if not exists (select 1 from members where baby_id = b.baby_id and role = 'parent' and user_id <> me) then
      delete from babies where id = b.baby_id;     -- cascades to events, invites, requests, members, activity
    else
      perform log_activity(b.baby_id, 'left', null, null, jsonb_build_object('person', display_of(b.baby_id, me), 'account_deleted', true));
    end if;
  end loop;
  delete from auth.users where id = me;            -- cascades to remaining memberships and requests
end $$;

-- ── privileges: clients read three tables and call the functions below; nothing else ──────────
revoke all on all tables in schema public from anon, authenticated;
grant select on babies, members, events to authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
grant execute on function
  jwt_aal(), is_member(uuid), is_parent(uuid), has_perm(uuid, text),   -- used inside the read policies
  create_baby(text, date, text), update_baby(uuid, text, date), list_people(uuid), set_display_name(text),
  set_member(uuid, uuid, text, jsonb), remove_member(uuid, uuid), reset_member_mfa(uuid, uuid),
  create_invite(uuid, text, jsonb), list_invites(uuid), rescind_invite(text), redeem_invite(text, text),
  my_requests(), cancel_my_request(uuid), list_requests(uuid), decide_request(uuid, boolean, text, jsonb),
  push_events(uuid, jsonb), activity_log(uuid, int, bigint), delete_my_account()
to authenticated;
