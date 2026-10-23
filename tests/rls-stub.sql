create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.sub', true), '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('email', (select email from auth.users where id = auth.uid())) $$;
create role anon nologin; create role authenticated nologin;
grant usage on schema public, auth to anon, authenticated;
grant execute on function auth.uid(), auth.jwt() to anon, authenticated;
alter default privileges in schema public grant all on tables to authenticated;
insert into auth.users values ('00000000-0000-0000-0000-00000000000a','a@x.com'),('00000000-0000-0000-0000-00000000000b','b@x.com'),('00000000-0000-0000-0000-00000000000c','c@x.com'),('00000000-0000-0000-0000-00000000000d','d@x.com');
