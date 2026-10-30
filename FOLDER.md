# The family folder: the family's log in their own cloud

Little Log can keep a family's log in **a folder in the family's own cloud storage**, with no server of ours anywhere. A parent
installs the app, connects their Dropbox, starts the log, and shares the folder with the family from the Family tab. Each relative
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
| `littlelog.json` | the family's id, and that this is a Little Log folder | no (it holds no names) |
| `keyring.json` | the key epoch, the older keys sealed under the newest, the health key's check, `rotate_needed` | keys sealed |
| `recovery.json` | the recovery key's public half, its private half under the recovery code, the log's keys wrapped to it | keys sealed |
| `devices/<phone>.json` | a phone's public key, whose it is (an id, not the email), what it is called | no (public by nature) |
| `keys/<phone>.json` | the log's keys wrapped to that phone: its approval | wrapped |
| `join/<phone>.json` | a phone asking to be let in, until a parent decides: its public key, the person's name and cloud email | no |
| `members.json` | who is in the family and what each may do, the invitations by email, the retired helpers | yes |
| `profile.json` | the children | yes |
| `tree.json` | the family tree | yes |
| `events/<phone>/<n>.json` | the entries each phone wrote, in order | yes, entry by entry |
| `media/<id>`, `media/<id>.t` | pictures and videos, and their thumbnails | yes |

Every phone **appends only its own** `events/<phone>/` files, numbered in order, so two phones never write the same file and nothing
conflicts. The documents that are shared (`members.json`, `tree.json`) are written with the cloud's "update only if unchanged"
mode: a phone that lost the race reads the newer copy and applies its change again.

## How a sync goes

1. **What changed?** The phone asks the cloud for the changes since its last cursor (Dropbox's `list_folder/continue`). A sync with
   nothing new is that one small call.
2. **Keys.** If the folder's key epoch moved on, or this phone has no keys yet, it reads its `keys/<phone>.json` and checks it the
   way server mode does: first keys only with a parent's proof (the security code compared out loud; the QR route is server-only),
   a key change only when signed by someone who held the previous keys, the health key only when it matches the check the main
   key holders signed.
3. **The family.** `members.json` says who this phone's person is and what they may do. Someone no longer in it is cleared from the
   phone (the log stays in the folder).
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
  they can open. Someone with edit access who modified their app could write files it should not; the parents' phones would
  still only accept what verifies (a sealed entry of the right class, keys signed by key holders). A family member you would not
  trust with edit access to a folder should not be in the log at all.
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
- **A parent's new phone**: it asks to join like anyone, and either another phone approves it under *Phones waiting for access*,
  or the parent types the recovery code on the waiting screen and is in at once.
- **Every phone gone**: the recovery code opens the folder on a new phone. Without it, and without the cloud's own version
  history, the sealed files cannot be opened by anyone. Write the code down.

## Clouds

Dropbox first. The app needs a Dropbox app registered by whoever builds it, with **Full Dropbox** access (the family folder is a
shared folder, which a member's Dropbox mounts wherever they like) and the permissions `files.metadata.read`, `files.content.read`,
`files.content.write`, `sharing.read`, `sharing.write` and `account_info.read` ([SETUP.md](SETUP.md), *The family's own cloud*).
Each phone signs in to its own Dropbox through the system browser (OAuth with PKCE, no secret in the app) and the family folder is
addressed by its shared-folder id, the same from every account.

The protocol does not depend on Dropbox: a backend is `list(cursor)`, `get`, `put` (add / overwrite / update-if-unchanged),
`delete`, `share`, `unshare`, `leave`, `candidates`, `mount`. Google Drive, OneDrive and iCloud Drive (through the Files app on
iPhones) are next, and the files are the same.

## What the tests prove

[tests/folder.test.js](tests/folder.test.js) runs the real app, built without a family server as the store build is, on three
phones against a fake Dropbox ([tests/lib/fake-dropbox.js](tests/lib/fake-dropbox.js): shared folders, revisions, delta cursors,
invitations). It walks the whole life of a family folder: starting the log, sharing out, joining and approving, a caregiver who
never receives health notes, pictures, the family tree, offline edits, the newest edit winning, removing someone (new keys, phone
cleared), a parent's new phone with the recovery code and another approved from the first phone, leaving, disconnecting, and
that no plain name is ever in the folder.
