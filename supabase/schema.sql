-- Little Log – Supabase schema. Paste into the Supabase SQL editor and run once.
-- Every table has row-level security: only members of a baby can see its data,
-- and only 'owner' / 'caregiver' members can write. 'viewer' is read-only.

create table if not exists babies (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  birth date,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists members (
  baby_id uuid not null references babies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null default '',
  role text not null check (role in ('owner','caregiver','viewer')),
  joined_at timestamptz not null default now(),
  primary key (baby_id, user_id)
);

create table if not exists invites (
  code text primary key,
  baby_id uuid not null references babies(id) on delete cascade,
  role text not null check (role in ('caregiver','viewer')),
  created_by uuid not null default auth.uid(),
  expires_at timestamptz not null default now() + interval '48 hours',
  used_by uuid
);

create table if not exists events (
  baby_id uuid not null references babies(id) on delete cascade,
  id text not null,
  type text not null,
  ts bigint not null,
  end_ts bigint,
  data jsonb not null default '{}',
  note text not null default '',
  updated bigint not null,          -- client clock (ms); last write wins
  deleted boolean not null default false,
  synced_at timestamptz not null default clock_timestamp(),  -- server clock; used for pulling
  updated_by uuid default auth.uid(),
  primary key (baby_id, id)
);
create index if not exists events_pull on events (baby_id, synced_at);

-- Membership helpers (security definer so policies don't recurse).
create or replace function is_member(b uuid) returns boolean language sql security definer stable set search_path = public as
$$ select exists (select 1 from members where baby_id = b and user_id = auth.uid()) $$;
create or replace function can_write(b uuid) returns boolean language sql security definer stable set search_path = public as
$$ select exists (select 1 from members where baby_id = b and user_id = auth.uid() and role in ('owner','caregiver')) $$;
create or replace function is_owner(b uuid) returns boolean language sql security definer stable set search_path = public as
$$ select exists (select 1 from members where baby_id = b and user_id = auth.uid() and role = 'owner') $$;

alter table babies  enable row level security;
alter table members enable row level security;
alter table invites enable row level security;
alter table events  enable row level security;

create policy babies_read   on babies  for select using (is_member(id));
create policy babies_update on babies  for update using (can_write(id)) with check (can_write(id));

create policy members_read   on members for select using (is_member(baby_id));
create policy members_remove on members for delete using (is_owner(baby_id) or user_id = auth.uid());

create policy invites_read on invites for select using (is_owner(baby_id));
create policy invites_del  on invites for delete using (is_owner(baby_id));

create policy events_read   on events for select using (is_member(baby_id));
create policy events_insert on events for insert with check (can_write(baby_id));
create policy events_update on events for update using (can_write(baby_id)) with check (can_write(baby_id));

-- Stamp rows with the server clock, and ignore writes that are not newer than what is stored.
create or replace function events_before_write() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.updated <= old.updated then
    return old;                       -- stale write: keep the stored row untouched
  end if;
  new.synced_at := clock_timestamp();
  new.updated_by := auth.uid();
  return new;
end $$;
drop trigger if exists events_before_write on events;
create trigger events_before_write before insert or update on events
  for each row execute function events_before_write();

-- RPCs ------------------------------------------------------------------------
create or replace function create_baby(p_name text, p_birth date) returns uuid
language plpgsql security definer set search_path = public as $$
declare b uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into babies (name, birth, created_by) values (coalesce(p_name,''), p_birth, auth.uid()) returning id into b;
  insert into members (baby_id, user_id, email, role)
    values (b, auth.uid(), coalesce(auth.jwt() ->> 'email',''), 'owner');
  return b;
end $$;

create or replace function create_invite(p_baby uuid, p_role text) returns text
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not is_owner(p_baby) then raise exception 'only the owner can invite'; end if;
  if p_role not in ('caregiver','viewer') then raise exception 'bad role'; end if;
  -- 10 chars from an unambiguous alphabet (~50 bits)
  c := (select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random()*31)::int, 1), '')
        from generate_series(1,10));
  insert into invites (code, baby_id, role) values (c, p_baby, p_role);
  return c;
end $$;

create or replace function redeem_invite(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare i invites;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into i from invites where code = upper(trim(p_code)) for update;
  if not found or i.used_by is not null or i.expires_at < now() then
    raise exception 'This invite is invalid or has expired';
  end if;
  insert into members (baby_id, user_id, email, role)
    values (i.baby_id, auth.uid(), coalesce(auth.jwt() ->> 'email',''), i.role)
    on conflict (baby_id, user_id) do nothing;
  update invites set used_by = auth.uid() where code = i.code;
  return i.baby_id;
end $$;

-- In-app account deletion (required by the App Store / Play Store). Shared logs are handled so nobody is orphaned:
-- an owner's log passes to its longest-standing caregiver; if there is none, the log is deleted with the account.
create or replace function delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); b record; heir uuid;
begin
  if me is null then raise exception 'not signed in'; end if;
  for b in select baby_id from members where user_id = me and role = 'owner' loop
    select user_id into heir from members
      where baby_id = b.baby_id and user_id <> me and role = 'caregiver' order by joined_at limit 1;
    if heir is not null then
      update members set role = 'owner' where baby_id = b.baby_id and user_id = heir;
    else
      delete from babies where id = b.baby_id;      -- cascades to events, invites, members
    end if;
  end loop;
  delete from auth.users where id = me;              -- cascades to this user's remaining memberships
end $$;

revoke all on function create_baby(text,date), create_invite(uuid,text), redeem_invite(text), delete_my_account() from public, anon;
grant execute on function create_baby(text,date), create_invite(uuid,text), redeem_invite(text), delete_my_account() to authenticated;
