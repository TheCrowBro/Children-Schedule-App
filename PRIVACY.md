# Little Log privacy policy

*The policy for the store build (the app as published in the app stores, 1.29.2 onwards). It is published at
https://crowmade.app/littlelog/privacy/ (`site/`, written by `scripts/build-site.js`), the address `privacyUrl` in `config.js`
carries and the stores are given. Have it read by a lawyer where you publish, and keep it in step with the app: everything
below is what the code does today.*

**Effective date:** 31 October 2026

Little Log is an app for parents and the people who help them, to keep a log of a child's days: feeds, sleep, nappies, health
notes, growth, pictures, big moments, and the family around the child. This policy says what the app records, where it goes, who can
see it, and what you can do about it.

## The short version

* **We run no server and receive nothing.** The app has no account with us, no analytics, no advertising and no tracking. Nothing
  you type, photograph or record is ever sent to the people who make Little Log.
* **Your family's log lives on your phones and, if a parent chooses, in a folder in your family's own cloud account** (Dropbox,
  Google Drive, or iCloud Drive on iPhones). Everything in that folder is encrypted on your phone before it is uploaded; the cloud
  provider stores files it cannot read.
* **Only the family members a parent approves can read the log**, each with the role the parent gave them. Health notes can be
  kept from people whose role does not include them.
* **You can delete everything yourself**, at any time, from the app and from your own cloud account.

## What the app records

What you and your family enter: entries about the child (feeding, sleep, nappies and potty, play, baths, vomiting, medicines and
doses, health notes such as symptoms and temperatures, allergies, growth measurements, teeth, meals, school and daycare days, big
moments), the names and birth dates of the children, the names of the family members and how they are related (the family tree),
pictures and short videos you attach, notes you type, the places and people you name for drop-offs, and your settings (language,
units, region, appearance, notification times, the app lock).

The app also keeps, on the phone only: the encryption keys for the family's log, the phone's own signing key, a random id for the
phone, the sign-in tokens for the cloud account a parent connected, the recovery code's cryptographic counterpart, and, if you turn
on the app lock with a PIN, a salted hash of the PIN. These are kept in the phone's secure storage (the Keychain on iPhones, the
Keystore-backed storage on Android) and are not included in backups.

## Where it goes

**On the phone.** The log is stored on the phone so the app works offline. On Android the app's data is excluded from Google's
device backup. On iPhones the app marks its storage as excluded from iCloud and computer backups.

**In your family's own cloud folder, if a parent chooses to share the log.** A parent connects their own Dropbox, Google Drive or,
on iPhones, iCloud Drive, and the app makes a folder named *Little Log* there. Every entry, picture, name and the family tree is
encrypted on the phone with keys only the family's phones hold before it is written to that folder (AES-256-GCM, with keys agreed
between phones over elliptic-curve cryptography and every file signed by the phone that wrote it). The cloud provider stores and
synchronises files it cannot read. What the cloud provider does see: that the folder exists and its name, the file names (which are
random ids and counts, not your words), file sizes and times, and which of its own accounts the folder is shared with. The provider's
own privacy policy applies to your account with it: [Dropbox](https://www.dropbox.com/privacy), [Google](https://policies.google.com/privacy),
[Apple iCloud](https://www.apple.com/legal/privacy/).

**Sharing with family members** happens through the cloud's own sharing: a parent shares the folder with a relative's cloud account
(by their email address on Dropbox and Google Drive, by invitation in the Files app on iPhones). The relative's phone then asks to
join and a parent approves it in the app, checking a short code. The app shows the family the names and roles of the members and
which phones have access.

**Nowhere else.** The app talks to no server of ours. There are no advertising or analytics libraries in it. Opening a video from
the Guide opens YouTube in your browser or the YouTube app, under YouTube's own policy. Adding a reminder to your calendar happens
on your phone. Notifications are made on the phone. Crash reports are off in this build.

## Children

Little Log is made for parents and carers, not for children to use. It records information about children, including health
information, because that is what a parent uses it for; the parent decides what to record and whom to share it with, and none of it
reaches us. If you are a parent who wants everything about your child gone, see *Deleting* below.

## Who can see what

A parent gives every family member a role: parent, caregiver, babysitter, medical assistant, friend, or a relative who reads. The
role sets what the person can add, change and see; health notes are visible only to roles that include them, and the keys for
health notes are handed only to those phones. A parent can remove a member or a phone at any time; the keys are then changed, and
the removed phone clears the log the next time it syncs (a copy that person exported before remains theirs). A parent can move the
whole log out of the cloud folder or disconnect it.

## Deleting

* Any entry can be deleted by whoever may edit it.
* **Delete all entries** (More → Your data) removes every entry from the log for the whole family.
* **Leave the family** or **disconnect** on a phone removes the log from that phone.
* **The folder in your cloud** is yours: deleting it in Dropbox, Google Drive or iCloud Drive deletes the family's shared copy;
  every phone keeps only what it had and clears it when it finds the folder gone.
* **Uninstalling** the app removes everything it kept on that phone, including the keys.
* We hold nothing, so there is nothing for us to delete; there is also nothing we could restore. **The recovery code shown when a
  log is created is the only way back into the log after every phone is lost**: without it, the encrypted folder cannot be read by
  anyone, including us.

## Permissions the app asks for

Camera, only to scan a family member's invitation code; Face ID, Touch ID or the fingerprint sensor, only to unlock the app if you
turn the app lock on; notifications, for the sleep check you can turn on; the calendar, only when you add an event to it; and the
photo picker, when you attach a picture (the app sees only the picture you pick).

## Security

Everything shared between phones is end-to-end encrypted with keys that never leave the family's phones. Each phone signs what it
writes, and a parent's phone repairs or rejects files that do not come from an approved phone. The app lock protects the app on a
lost phone, and the cloud account that holds the folder should have two-step verification on. No system is perfect: the app's
security model and its known limits are described in the project's SECURITY.md.

## Your rights

Because we hold no personal data about you or your family, requests for access, correction, portability or deletion are things you
do yourself in the app and in your own cloud account; the app's export (More → Your data) gives you everything in a readable file.
For questions about this policy, or about data a cloud provider holds, their privacy policies and your local data-protection
authority are the places to turn, and you can write to us at the address below.

## Changes

If a future version of the app sends anything anywhere new, this policy will say so before that version is published, and the app's
release notes will say it too.

**Contact:** support@crowmade.app
