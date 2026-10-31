# The family folder: the family's log in their own cloud

Little Log can keep a family's log in **a folder in the family's own cloud storage**, with no server of ours anywhere. A parent
installs the app, connects their Dropbox or Google Drive, starts the log, and shares the folder with the family from the Family tab. Each relative
installs the app, connects the same cloud with the email the folder was shared with, asks to join, and a parent approves them on
their phone. The folder is the family's: whoever can open it in their cloud is who can be in the log, and the family can look at it,
back it up or delete it from their cloud's own apps.

This is the store build's way of sharing (`config.js` with a cloud key and no `supabaseUrl`). The family server (Supabase,
[SETUP.md](SETUP.md)) stays for a family that would rather run one; the app works either way, and the rest of the app does not
know the difference.

## What the folder holds

Everything that is private is end-to-end encrypted on the phones exactly as in server mode ([e2ee.js](e2ee.js)): the cloud sees file
names, sizes and who wrote what, nothing else. The folder plays the server's part, file by file:

| Path | What | Sealed |
|---|---|---|
| `littlelog.json` | the family's id, that this is a Little Log folder, and the folder's **root**: the phone that created it (its signing key) | no (it holds no names); signed by the root |
| `keyring.json` | the key epoch, the older keys sealed under the newest, the health key's check, `rotate_needed` | keys sealed |
| `recovery.json` | the recovery key's public halves (one to wrap keys to, one to sign with), their private halves under the recovery code, the log's keys wrapped to it | keys sealed; signed by a parent's phone |
| `devices/<phone>.json` | a phone's public keys (one to wrap keys to, one it signs with), whose it is (an id, not the email), what it is called | no (public by nature) |
| `keys/<phone>.json` | the log's keys wrapped to that phone: its approval, saying whose phone it is, its role, its keys and the root (`ext`) | wrapped; signed by the approving parent's phone |
| `join/<phone>.json` | a phone asking to be let in, until a parent decides: its public keys, the person's name and cloud email, the proof of a join code | no |
| `members.json` | who is in the family and what each may do, the invitations by email, the retired helpers; a sequence number | yes; signed by a parent's phone |
| `profile.json` | the children | yes |
| `tree.json` | the family tree; a sequence number | yes; signed by a parent's phone |
| `events/<phone>/<n>.json` | the entries each phone wrote, in order | yes, entry by entry; each file signed by its phone |
| `media/<id>`, `media/<id>.t` | pictures and videos, and their thumbnails | yes |

Every phone **appends only its own** `events/<phone>/` files, numbered in order, so two phones never write the same file and nothing
conflicts. The documents that are shared (`members.json`, `tree.json`) are written with the cloud's "update only if unchanged"
mode: a phone that lost the race reads the newer copy and applies its change again. (Google Drive has no such mode: the phone
writes, then reads the file's revision list; when another phone's revision slipped in just before its own, it reads that copy back
and writes again with both changes in.)

## Who is believed: signatures and the chain of approvals

Every member's phone holds the main key, so a sealed file is not thereby trustworthy: a phone with a modified app could rewrite the
family list (giving itself the parent role), the tree, hand keys to a phone, or write entries in another's name. So every phone has
an ECDSA P-256 signing key next to its ECDH key, and **signs what it writes**; and a phone **believes a shared file only when the
chain of approvals reaches the phone that signed it**:

- The **root** is the phone that created the folder (its signing key is in `littlelog.json`, and in every grant's `ext`). A phone
  is given the root with its first keys, under the join code's proof (below) or checked by the security code read out: the log's
  security code covers the root key, so a phone handed keys with a made-up root shows a different code from the parents' phones.
- A **grant** (`keys/<phone>.json`) signed by a parent's phone the chain reaches adds that phone, with the person, role and keys the
  approving parent saw (`ext`). From the root, the chain reaches every approved phone; a recovery.json signed by a parent's phone
  adds the recovery key, which signs the grant of a phone let in with the recovery code.
- `members.json` and `tree.json` count only when signed by a phone the chain trusts as a parent's (the family list: or by anyone, for
  their own name and details only) and their sequence number is not older than what the phone accepted, so an old copy put back
  is ignored too. A change of keys (a new epoch) counts only when the phone's own new grant is a parent's.
- An entries file counts only when signed by the phone whose folder it is in, and its rows only in that person's name, unless the
  person may edit (or delete) others' entries.
- Each phone **remembers the phones the chain reached** (`db.meta.ftrust`): a phone keeps its standing when someone else overwrites
  its grant (its signing key is its own), and is forgotten when a parent's phone leaves it out of a change of keys or its person
  leaves the family list.

What a phone would not believe is said on the Family tab ("changed by a phone that may not"), and a **parent's phone puts things
right by itself**: the last family list and tree it accepted go back over a forged copy (with a higher sequence number), a grant
overwritten by someone who may not is made again from what it remembers of the approval, forged keys are superseded by new keys
of its own (the warning names whose phone did it, so the parents can remove them), and `littlelog.json`, `keyring.json` and
`recovery.json` go back when deleted, emptied or rolled back. The cloud's own version history remains the safety net beneath that.

**A join code.** When a parent shares the folder with someone, their phone makes a one-time join code (eight letters) and keeps it;
the parent tells it to the person. Typed on the joining phone, it proves to the parent's phone that the request is really from that
phone (the request carries a proof made with the code, over both of the phone's keys), so the request shows *Verified* and needs no
digits read across the room; and the keys that come back carry a proof made with the same code, so the joining phone knows they
came from the parent who gave it. Without a code, the security code read out is the check, as before. The parent's phone also takes
**who wrote the request from the cloud's own record** (Drive's last modifying user, Dropbox's `modified_by`), not from the file: a
request that claims to be someone else is marked (*written by the account …*) and cannot be approved.

**A folder from before signing** (made by an app before 1.28) has no root. The first parent's phone to run the new version becomes
the root, signs what is there (the family list, the tree, every grant, recovery.json) and writes the root into `littlelog.json`;
every other phone takes the root from there once it names a parent of the family list it holds. A parent's phone should be the
first to update. A phone whose grant was signed before it had a signing key shows under *Phones waiting for access* on the parents'
phones ("approve it again"), and what it writes counts once it has been.

## How a sync goes

1. **What changed?** The phone asks the cloud for the changes since its last cursor (Dropbox's `list_folder/continue`, Drive's
   changes feed). A sync with nothing new is that one small call.
2. **Keys.** If the folder's key epoch moved on, or this phone has no keys yet, it reads its `keys/<phone>.json` and checks it the
   way server mode does: first keys only with a parent's proof (the join code's proof, or the security code compared out loud), a
   key change only when signed by someone who held the previous keys **and** by a parent's phone the chain reaches, the health key
   only when it matches the check the main key holders signed.
3. **The chain.** The signed grants are walked from the root (above), and the family list is read only if a parent's phone signed it.
   `members.json` says who this phone's person is and what they may do. Someone no longer in it is cleared from the phone (the log
   stays in the folder). A parent's phone puts back what it would not believe, and the files the folder cannot do without.
4. **The children, the entries, the tree.** New `events/<other phone>/` files are read and merged: the newest edit wins, deletions
   are tombstones, exactly as in server mode (the merge is the same code). Then this phone's own new entries go up as one more file.
5. **Pictures and videos** waiting on the phone go up; thumbnails come down as they are shown.
6. **Parents' phones** also read the `join/` requests and the phones without keys, to show them for approval.

Deltas, revisions and what each phone has read are kept with the log on the phone (`db.meta.fidx`), so a phone that was away for a
month reads only what it missed.

## Who may do what

Roles and permissions (parent, family member, caregiver, babysitter, medical assistant, friend, and the check boxes) live in
`members.json` and are **enforced by the apps**, as they are shown and applied in the app's screens. Two things are different from
the family server, and worth saying plainly to the family:

- **The cloud's own sharing is the floor.** Anyone the folder is shared with can read every sealed file; only the keys decide what
  they can open. Someone with edit access who modified their app could write files it should not; the other phones only believe
  what the chain of approvals signs for (above), and a parent's phone puts the rest right, but such a person can still delete or
  empty files (the cloud's version history gets them back) and read everything the keys they hold open. A family member you would
  not trust with edit access to a folder should not be in the log at all.
- **Who may share the folder on.** The folder's owner can turn on *Only my phone can share this folder* (Family tab → Share with
  someone): Drive's `writersCanShare` or Dropbox's folder policy, so that other parents' phones approve requests but cannot share
  the folder in the cloud. Everyone's cloud account is their key to the folder: the app asks for 2-step verification on it.
- **No activity log** in this first version: who added or changed what is still on every entry (sealed inside it), but the
  server's "who joined, who changed whose access" record has no equivalent yet.

The health key still goes only to the phones of people allowed to see health notes and medication; a caregiver without that box
never receives it, so those entries never reach their phone, not even sealed.

## Leaving, removing, losing a phone, losing everything

- **A parent removes someone**: their line goes from `members.json`, their phones' `keys/` and `devices/` files go, the folder is
  unshared with them in the cloud, and the keys are changed at once (a new epoch, wrapped to every remaining phone and to the
  recovery key; the old keys sealed under the new, so old entries stay readable). Their phone finds the folder gone at its next
  sync and clears itself.
- **Someone leaves**: their phone drops its own keys, asks the parents' phones to change the keys (`rotate_needed` in
  `keyring.json`), and leaves the shared folder in their cloud.
- **A lost phone**: Family tab → My phones → Remove. Its keys go and the keys are changed.
- **A lapsed cloud sign-in** (the cloud rejects the phone's token: a revoked app, or Google's weekly renewal while an app is in
  testing): nothing is cleared. The sync stops with *Reconnect* on the Family tab and under More, which opens the cloud's sign-in
  again and carries on. Only a folder no longer shared with the account clears the phone.
- **A parent's new phone**: it asks to join like anyone, and either another phone approves it under *Phones waiting for access*,
  or the parent types the recovery code on the waiting screen and is in at once.
- **Every phone gone**: the recovery code opens the folder on a new phone. Without it, and without the cloud's own version
  history, the sealed files cannot be opened by anyone. Write the code down.

## Moving a log from a family server

A family on a family server ([SETUP.md](SETUP.md) §1) can move into a folder without losing anything. A parent opens More → *Security &
account* → **Move this log to the family's own cloud**. Their phone syncs with the server, fetches every picture and video (opened
with the server log's keys and kept on the phone), signs in to the cloud, ends its server session (so the server sync never sees what
follows), and makes the family folder from what it holds: a new log with new keys, every entry, the tree, the pictures sent again
under the new keys, and the family's names, so entries by people who have not joined the folder yet still say who wrote them. The
parent's own entries move to their new identity (the cloud account); the recovery code shows as for any new log. Then they share the
folder from the Family tab, and the others sign out of the server on their phones and join through their own cloud. The server's copy
stays as it was, for the day the project is deleted.


**Dropbox** and **Google Drive**, each registered once by whoever builds the app ([SETUP.md](SETUP.md), *The family's own cloud*).
Each phone signs in to its own account through the system browser (OAuth with PKCE, no secret in the app), and the family folder is
addressed by an id that is the same from every account: Dropbox's shared-folder id, Drive's folder id.

- **Dropbox** needs *Full Dropbox* access (the family folder is a shared folder, which each member's Dropbox mounts wherever they
  like) and the permissions `files.metadata.read`, `files.content.read`, `files.content.write`, `sharing.read`, `sharing.write`
  and `account_info.read`. Sharing invites people; they accept, and the app mounts the folder for them.
- **Google Drive** needs the full Drive scope: the narrower per-file scope only reaches files the app made or the user picked, never
  a folder someone else shared. The app still only touches the family folder. Drive differs in three ways the backend absorbs:
  there is no "write only if unchanged", so a shared document is checked against the file's revision list after writing (above);
  only a file's owner may delete it, so another phone empties it instead and an empty file counts as gone; and sharing is immediate
  (no invitation to accept). Drive's ids for the folder's paths are kept with the log on the phone (`db.meta.gdid`).

The protocol does not depend on either: a backend is `list(cursor)`, `get`, `put` (add / overwrite / update-if-unchanged),
`delete`, `share`, `unshare`, `leave`, `candidates`, `mount`. OneDrive and iCloud Drive (through the Files app on iPhones) are
next, and the files are the same.

## What the tests prove

[tests/folder.test.js](tests/folder.test.js) runs the real app, built without a family server as the store build is, on three
phones against a fake of each cloud ([tests/lib/fake-dropbox.js](tests/lib/fake-dropbox.js): shared folders, revisions, delta
cursors, invitations; [tests/lib/fake-gdrive.js](tests/lib/fake-gdrive.js): files by id, revisions, the changes feed, permissions,
shared-with-me, owner-only deletion). It walks the whole life of a family folder, once per cloud: starting the log, sharing out, joining and approving, a caregiver who
never receives health notes, what a member's phone with a modified app could try and how the others hold up (the family list
rewritten to make herself a parent and a stranger put on the tree, ignored and put back; an entries file under another phone's
name and an entry claiming another author, dropped; the key files deleted, put back; keys of her own set for everyone, superseded
by a parent's, which names her phone), a join code typed on the joining phone (*Verified*, no digits read out) beside a request
that claims to be someone else (marked by the cloud's word, no Approve), the owner's *Only my phone can share* refusing another
parent's share, pictures, the family tree (two parents changing it at the same moment, both changes kept), offline
edits, the newest edit winning, removing someone (new keys, phone
cleared), a parent's new phone with the recovery code (its grant signed by the recovery key) and another approved from the first
phone, leaving, disconnecting, a folder from before signing taken over by the first parent's phone, and that no plain name is ever
in the folder.
