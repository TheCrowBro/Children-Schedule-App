# Little Log on iPhone with iCloud Drive: a family's guide

Little Log keeps a family's log in a folder in the family's own cloud. On an iPhone or iPad that cloud can be **iCloud Drive**, and
it works differently from Google Drive or Dropbox: there is nothing to sign in to in the app, the folder is shared from Apple's
**Files app**, and relatives are invited by name with a **join code** rather than by email. This page walks through it. The same
steps are in the app itself: *Little Log on iPhone with iCloud Drive: step by step*, on the first screens and the Family tab.

## Before you start

- Everyone in the family needs an **iPhone or iPad with iCloud Drive turned on**: Settings → your name → iCloud → iCloud Drive.
  Little Log uses the iCloud account the phone is signed in to. An Android phone cannot join an iCloud Drive family (it can join one
  kept in Google Drive or Dropbox instead).
- Turn on **two-factor authentication** for everyone's Apple ID: that account is the key to the folder.
- The folder counts towards the **iCloud storage** of whoever owns it. Pictures and videos add up; the free 5 GB goes a long way for
  text, less far for video.

## The parent who starts the log

1. Open Little Log, tap **Share with family**, then **Connect iCloud Drive**. The app is connected at once; no sign-in.
2. Type your name and the baby's details and tap **Create log**. The Files app's picker opens so you can choose **where the Little Log
   folder goes**: iCloud Drive itself is fine. Tap **Open**. A folder named *Little Log (the baby's name)* is made there, with a
   `README.txt` the family can read and scrambled files nobody can.
3. **Write down the recovery code** the app shows and keep it somewhere safe, not only on this phone. It is the only way back in if
   every phone is lost.
4. To invite someone: **Family tab → Share with someone** → their name and what they may do → **Share in Files and make a join
   code**. The share sheet opens for the folder:
   - choose **Collaborate** (not *Send Copy*);
   - under the options, set **Only invited people** and **Can make changes**;
   - add their **Apple ID email** and send.
   Their **join code** (eight letters) appears under *Shared, not joined yet*. Tell it to them by voice or in a message of your own,
   not in the share invitation itself.
5. When their request pops up on your phone it shows **Verified** if they typed the code: tap **Approve**. Without a code, ask them
   to read out the security code their phone shows, tick *It matches*, then Approve. Approving hands their phone the keys.
6. To take someone off: **Family tab → their name → Remove from this log**, which changes the keys. Then, in the Files app, press and
   hold the Little Log folder, tap **Manage Shared Folder** and remove them there too (the app reminds you).

## A relative who joins

1. **Accept the invitation.** The message or notification says a folder was shared with you; open it, and the folder appears in the
   Files app under **iCloud Drive → Shared**.
2. Install Little Log, tap **Share with family**, then **Connect iCloud Drive**.
3. Type your name and the **join code** the parent gave you, then tap **Choose the shared folder…**. In the picker go to **iCloud
   Drive → Shared** (or *Browse → iCloud Drive*), tap the Little Log folder and tap **Open**.
4. Wait for a parent to approve you: the screen updates by itself, or tap **Check now**. If you had no join code, read out the
   security code on your screen to the parent.
5. You are in. Entries travel through iCloud, so give a phone that was offline a moment to catch up.

## A new phone of your own

Connect iCloud Drive, tap *Choose the shared folder…* and pick the Little Log folder, which is already in your iCloud Drive (your own,
or shared with you). A parent types the **recovery code** to get straight in; anyone else approves the new phone from their other
phone, under *Phones waiting for access* on the Family tab, after comparing the security code. Little Log recognises it as a phone of
the same person: the app keeps a small id in your iCloud Keychain, the same on all your devices.

## Good to know

- **Never rename, move or delete anything inside** the Little Log folder: the phones find the files by name. A renamed subfolder
  makes entries vanish from everyone's phones. The folder itself may be moved anywhere in iCloud Drive and renamed, as long as its
  name still starts with *Little Log*.
- Everything in the folder is **encrypted on the phones**; the Files app (and Apple) only ever see scrambled files. The security
  code on the Family tab is the same on every phone that holds the keys.
- Do not share the folder with someone the app has not made a join code for, and do not share it from the Files app with people
  outside the family: anyone with access to the folder can read whatever keys they are later given, and can delete files (iCloud's
  *Recently Deleted* keeps them for 30 days).
- Leaving: **Family tab → Leave this log** drops your keys and asks the parents' phones to change the keys; then remove the folder
  from your iCloud Drive in the Files app.

## If something does not work

| What you see | What to do |
|---|---|
| The Little Log folder does not appear in the picker | Check iCloud Drive is on (Settings → your name → iCloud) and that you accepted the share; in the picker, look under *Shared* and under *Browse → iCloud Drive*. |
| *The folder is not shared with you any more* | Ask a parent to add you again in the Files app (press and hold the folder → Manage Shared Folder). Your phone cleared the log; it comes back once you are approved again. |
| The request never shows Verified | The join code was mistyped, or the parent's phone that made it is not the one approving: the parent compares the security code instead. |
| Entries from another phone take long to appear | iCloud syncs in the background; open the Files app once, or wait a minute. The app lists the folder every 30 s while open. |
| *Phones waiting for access* shows a phone you do not know | Do not approve it. Someone with access to the folder asked to join; a parent can remove them in the Files app. |

What is shared, what is sealed and how the phones check each other is in [FOLDER.md](FOLDER.md); what still has to be tried on real
iPhones before this is published is in [MOBILE.md](MOBILE.md).
