U_A=00000000-0000-0000-0000-00000000000a; U_B=00000000-0000-0000-0000-00000000000b; U_C=00000000-0000-0000-0000-00000000000c; U_D=00000000-0000-0000-0000-00000000000d
run() { # run <uid|anon> <sql>  -> prints result or ERROR
  local who=$1 sql=$2 role=authenticated; [ "$who" = anon ] && { role=anon; who=""; }
  printf '%s\n' "set role $role;" "\\o /dev/null" "select set_config('request.sub','$who',false);" "\\o" "$sql;" \
   | psql -h ${PGDIR:-/var/tmp/llpg} -p 5544 -U postgres -tA -q -f - 2>&1 | sed 's/^psql:.*ERROR: */ERROR: /' | grep -v '^$' | head -2 | tr '\n' ' '
}
fail=0
expect() { # expect <label> <pattern> <actual>
  if echo "$3" | grep -Eq "$2"; then echo "✓ $1"; else echo "✗ $1  -> got: $3"; fail=1; fi; }

BABY=$(run $U_A "select create_baby('Leo','2026-10-10')"); BABY=$(echo $BABY | tr -d ' ')
expect "owner creates baby" '^[0-9a-f-]{36}$' "$BABY"
expect "owner inserts event" 'INSERT|^$' "$(run $U_A "insert into events(baby_id,id,type,ts,updated) values ('$BABY','e1','feed',1,100)")"
expect "stranger sees no events"   '^$' "$(run $U_B "select id from events where baby_id='$BABY'")"
expect "stranger sees no baby"     '^$' "$(run $U_B "select name from babies where id='$BABY'")"
expect "stranger cannot insert event" 'row-level security' "$(run $U_B "insert into events(baby_id,id,type,ts,updated) values ('$BABY','x','feed',1,1)")"
expect "cannot self-join via members insert" 'row-level security' "$(run $U_B "insert into members(baby_id,user_id,role) values ('$BABY','$U_B','owner')")"
expect "cannot create baby directly" 'row-level security' "$(run $U_B "insert into babies(name) values ('x')")"
expect "cannot forge invite directly" 'row-level security' "$(run $U_B "insert into invites(code,baby_id,role) values ('FORGED1234','$BABY','caregiver')")"
expect "non-owner cannot create invite" 'only the owner' "$(run $U_B "select create_invite('$BABY','caregiver')")"
expect "anon cannot call rpc" 'permission denied' "$(run anon "select create_baby('x',null)")"

VC=$(run $U_A "select create_invite('$BABY','viewer')" | tr -d ' ')
expect "invite code is 10 chars" '^[A-Z2-9]{10}$' "$VC"
expect "viewer redeems" "$BABY" "$(run $U_B "select redeem_invite('$VC')")"
expect "invite is single use" 'invalid or has expired' "$(run $U_D "select redeem_invite('$VC')")"
expect "viewer can read events" '^e1' "$(run $U_B "select id from events where baby_id='$BABY'")"
expect "viewer cannot write events" 'row-level security' "$(run $U_B "insert into events(baby_id,id,type,ts,updated) values ('$BABY','v1','feed',1,1)")"
expect "viewer cannot edit existing event" '^$|UPDATE 0' "$(run $U_B "update events set note='hax' where baby_id='$BABY' returning id")"
expect "viewer cannot rename baby" '^$' "$(run $U_B "update babies set name='hax' where id='$BABY' returning id")"
expect "viewer cannot promote self" '^$' "$(run $U_B "update members set role='owner' where user_id='$U_B' returning role")"
expect "viewer sees members" 'a@x.com.*b@x.com|b@x.com.*a@x.com' "$(run $U_B "select email from members where baby_id='$BABY' order by email")"
expect "viewer cannot read invites" '^$' "$(run $U_B "select code from invites")"

CC=$(run $U_A "select create_invite('$BABY','caregiver')" | tr -d ' ')
expect "caregiver redeems" "$BABY" "$(run $U_C "select redeem_invite('$CC')")"
expect "caregiver writes event" 'INSERT|^$' "$(run $U_C "insert into events(baby_id,id,type,ts,updated) values ('$BABY','c1','feed',2,100)")"
expect "caregiver cannot invite" 'only the owner' "$(run $U_C "select create_invite('$BABY','caregiver')")"
expect "caregiver cannot remove owner" '^$' "$(run $U_C "delete from members where user_id='$U_A' returning role")"

# last-write-wins trigger
before=$(run $U_A "select synced_at from events where id='e1'")
expect "stale write ignored"  '^feed.*100$|100' "$(run $U_A "insert into events(baby_id,id,type,ts,updated,note) values ('$BABY','e1','feed',1,50,'old') on conflict (baby_id,id) do update set note=excluded.note, updated=excluded.updated returning note||updated" )"
expect "stale write left row untouched" '^100\| *$' "$(run $U_A "select updated||'|'||note from events where id='e1'")"
expect "newer write applied" 'new' "$(run $U_A "insert into events(baby_id,id,type,ts,updated,note) values ('$BABY','e1','feed',1,200,'new') on conflict (baby_id,id) do update set note=excluded.note, updated=excluded.updated returning note")"
after=$(run $U_A "select synced_at from events where id='e1'")
[ "$before" != "$after" ] && echo "✓ synced_at advances only on real change" || { echo "✗ synced_at did not advance"; fail=1; }

# expiry
EX=$(run $U_A "select create_invite('$BABY','viewer')" | tr -d ' ')
psql -h ${PGDIR:-/var/tmp/llpg} -p 5544 -U postgres -q -c "update invites set expires_at = now() - interval '1 hour' where code='$EX'" 
expect "expired invite rejected" 'invalid or has expired' "$(run $U_D "select redeem_invite('$EX')")"

# removal
expect "owner removes caregiver" 'caregiver' "$(run $U_A "delete from members where user_id='$U_C' returning role")"
expect "removed member loses read access" '^$' "$(run $U_C "select id from events where baby_id='$BABY'")"
expect "member can leave" 'viewer' "$(run $U_B "delete from members where user_id='$U_B' returning role")"
expect "someone else's baby unaffected for owner" '^e1|e1' "$(run $U_A "select id from events where baby_id='$BABY' order by id")"
# account deletion
B2=$(run $U_D "select create_baby('Mia',null)" | tr -d ' ')
run $U_D "insert into events(baby_id,id,type,ts,updated) values ('$B2','m1','feed',1,1)" >/dev/null
CC2=$(run $U_D "select create_invite('$B2','caregiver')" | tr -d ' '); run $U_C "select redeem_invite('$CC2')" >/dev/null
expect "anon cannot delete accounts" 'permission denied' "$(run anon "select delete_my_account()")"
run $U_D "select delete_my_account()" >/dev/null
q() { psql -h ${PGDIR:-/var/tmp/llpg} -p 5544 -U postgres -tA -q -c "$1" | tr -d ' '; }
expect "deleted user is gone"                    '^0$' "$(q "select count(*) from auth.users where id='$U_D'")"
expect "caregiver inherits ownership"            '^owner$' "$(q "select role from members where baby_id='$B2' and user_id='$U_C'")"
expect "shared log and its entries survive"      '^1$' "$(q "select count(*) from events where baby_id='$B2'")"
run $U_C "select delete_my_account()" >/dev/null
expect "last owner deleting removes the log"     '^0$' "$(q "select count(*) from babies where id='$B2'")"
expect "and its entries are gone"                '^0$' "$(q "select count(*) from events where baby_id='$B2'")"

echo; [ $fail = 0 ] && echo "ALL RLS CHECKS PASSED" || echo "SOME CHECKS FAILED"
