-- Little Log – upgrade.sql: brings a Supabase project that already runs an earlier schema.sql up to the current one (1.21.0).
-- schema.sql is for a fresh project and would stop at its first table on a project that has one. A project set up with any release
-- since 1.0.0 keeps its data and runs THIS file instead, in the SQL editor, after an app update: it only adds or replaces what changed
-- since 1.0.0, touches no row, and is safe to run again (on a project that is already current it changes nothing). The app says when
-- it is due: a parent sees "The cloud project needs an update" on the Family tab and under More → App updates (SETUP.md, Upgrading an
-- existing project).
--
-- What changed, by release:
--   1.5.0   the private storage bucket "media" and its rules (pictures and a short video with a big moment)
--   1.13.0  removing a phone or deleting an account needs a session that passed two-step verification; invite codes come from
--           cryptographic randomness
--   1.16.0  rename_member: a parent renames anyone in the log
--   1.21.0  schema_version(), which lets the app tell when this file is due
-- The database tests (tests/db.test.js) prove that a 1.0.0 project plus this file is the same as a fresh schema.sql, so a release that
-- changes schema.sql carries the change in here too. Function bodies below are the ones in schema.sql, word for word.

-- ── 1.5.0: pictures and videos ────────────────────────────────────────────────────────────────
-- A big moment can carry pictures and a short video. They are files in the bucket "media", encrypted on the phones with the log's main
-- key before upload (the server sees sizes and who uploaded what, nothing else), at <baby_id>/<media id> and <baby_id>/<media id>.t
-- (a thumbnail). The rules mirror the entries': members read, people who may add entries upload, people who may delete entries
-- delete (their own, or anyone's). Safe to run again on an installation that already has the rest.
insert into storage.buckets (id, name, public, file_size_limit) values ('media', 'media', false, 62914560)
  on conflict (id) do update set public = false, file_size_limit = 62914560;
create or replace function media_baby(p_name text) returns uuid language sql immutable as $$
  select case when p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9_.-]{1,64}$'
              then split_part(p_name, '/', 1)::uuid end $$;
grant execute on function media_baby(text) to authenticated;
drop policy if exists media_read on storage.objects;
drop policy if exists media_add on storage.objects;
drop policy if exists media_delete on storage.objects;
create policy media_read   on storage.objects for select to authenticated using (bucket_id = 'media' and is_member(media_baby(name)));
create policy media_add    on storage.objects for insert to authenticated with check (bucket_id = 'media' and has_perm(media_baby(name), 'add_entries'));
create policy media_delete on storage.objects for delete to authenticated using (bucket_id = 'media'
  and ((owner_id = auth.uid()::text and has_perm(media_baby(name), 'delete_own')) or has_perm(media_baby(name), 'delete_others')));

-- ── 1.13.0: two-step verification before cutting off phones or deleting an account; cryptographic invite codes ──
-- (create or replace keeps each function's grants as they are)
-- Removing a phone (lost or stolen) deletes its keys; every log you belong to must then change its keys. With two-step verification set
-- up, only a session that passed it may do this (an email code alone must not be able to cut a parent's phones off).
create or replace function remove_device(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if jwt_aal() <> 'aal2' and exists (select 1 from auth.mfa_factors where user_id = me and status = 'verified') then raise exception 'Two-step verification is required'; end if;
  if not exists (select 1 from devices where id = p_id and user_id = me) then return; end if;
  delete from key_grants where grantee = 'd:' || p_id::text;
  delete from devices where id = p_id;
  update babies set rotate_needed = true where id in (select baby_id from members where user_id = me);
end $$;

create or replace function create_invite(p_baby uuid, p_role text, p_perms jsonb default '{}') returns text
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not is_parent(p_baby) then raise exception 'Only parents can invite'; end if;
  if p_role not in ('parent','family','caregiver','babysitter','medical','friend') then raise exception 'bad role'; end if;
  delete from invites where expires_at < now() - interval '1 day';
  if (select count(*) from invites where baby_id = p_baby and used_by is null and expires_at > now()) >= 10 then
    raise exception 'Too many open invites – rescind some first';
  end if;
  -- 10 symbols from the random bytes of a v4 UUID (gen_random_uuid is cryptographic; random() is not), skipping its two fixed bytes
  c := (select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + get_byte(x.b, u.i) % 31, 1), '' order by u.n)
        from (select decode(replace(gen_random_uuid()::text, '-', ''), 'hex') b) x cross join unnest(array[0, 1, 2, 3, 4, 5, 7, 9, 10, 11]) with ordinality as u(i, n));
  insert into invites (code, baby_id, role, perms, created_by)
    values (c, p_baby, p_role, normalize_perms(p_role, p_perms), auth.uid());
  perform log_activity(p_baby, 'invite_created', null, null, jsonb_build_object('role', p_role));
  return c;
end $$;

-- ── account deletion (App Store / Play Store requirement) ─────────────────────────────────────
-- If you are a log's only parent, the log is deleted with your account (the app warns first).
-- If another parent exists, you simply leave it. Someone who has set up two-step verification must be in a session that passed it:
-- an email code alone (a phished or glimpsed one) is not enough to delete a family's log.
create or replace function delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); b record;
begin
  if me is null then raise exception 'not signed in'; end if;
  if jwt_aal() <> 'aal2' and exists (select 1 from auth.mfa_factors where user_id = me and status = 'verified') then raise exception 'Two-step verification is required'; end if;
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
  update trees set updated_by = null where updated_by = me;
  delete from auth.users where id = me;            -- cascades to remaining memberships, requests and phones
end $$;

-- ── 1.16.0: a parent renames anyone in the log ────────────────────────────────────────────────
-- (Supabase lets anon and authenticated call a new function by default: the revoke puts that back before the grant, as schema.sql does)
-- A parent gives a member of this log a different name, the one the family sees here (other parents included). The member's name
-- in any other log is untouched, and they can still change it themselves under Security & account.
create or replace function rename_member(p_baby uuid, p_user uuid, p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare old_name text; new_name text := left(trim(coalesce(p_name, '')), 60);
begin
  if not is_parent(p_baby) then raise exception 'Only parents can rename members'; end if;
  if new_name = '' then raise exception 'Enter a name'; end if;
  select display_of(p_baby, p_user) into old_name;
  update members set display_name = new_name where baby_id = p_baby and user_id = p_user;
  if not found then raise exception 'not a member'; end if;
  perform log_activity(p_baby, 'member_renamed', null, null, jsonb_build_object('person', old_name, 'name', new_name));
end $$;
revoke all on function rename_member(uuid, uuid, text) from public, anon, authenticated;
grant execute on function rename_member(uuid, uuid, text) to authenticated;

-- ── 1.21.0: the schema version the app asks for ───────────────────────────────────────────────
-- The Little Log release whose database this is. The app asks for it after sign-in and, when the project is behind the release the
-- app was built for (or has no such function at all: a project from before 1.21.0), tells a parent that supabase/upgrade.sql is due.
-- Raise it, and carry the change into upgrade.sql, whenever this file changes: the database tests hold the two files together.
create or replace function schema_version() returns text language sql immutable as $$ select '1.21.0' $$;
revoke all on function schema_version() from public, anon, authenticated;
grant execute on function schema_version() to authenticated;

-- PostgREST (the API layer) notices new functions by itself; this asks it to do so right away.
notify pgrst, 'reload schema';
