# Store listing

The text for both stores and the suggested answers to their forms, for the store build (no server of ours; the family's own cloud
folder). The screenshots are in `android/` (1080×1920) and `ios/` (1290×2796), JPEG; the feature graphic is `feature-graphic.png`; remake
them from a fresh demo with `node scripts/store-shots.js <demo.html>`. Read each form's own definitions before ticking a box: the
answers below are what the code does, in the forms' words as of late 2026.

## Text

**Name** (30 characters at most on both stores): Little Log

**Short description** (Google, 80 characters): Your child's days, logged by the whole family. Encrypted, in your own cloud.

**Subtitle** (Apple, 30 characters): The family's log of a child

**Promotional text** (Apple, 170 characters): A clock of the day for feeds, sleep and nappies; the whole family on one log; everything
end-to-end encrypted in your own Dropbox, Google Drive or iCloud Drive.

**Keywords** (Apple, 100 characters): baby,newborn,feeding,sleep,nappy,diaper,tracker,log,family,toddler,growth,milestones,encrypted

**Full description** (both stores, 4,000 characters at most):

Little Log is the family's log of a child's days, from the first feed to the teenage years.

The day as a clock. Feeds, sleep, nappies, play, baths and medicines go around a clock of the day, so you see at a glance when the
last feed was and how long the nap has run. Big buttons for busy moments: a tap, a rough time, done. Wake-ups, naps, pumping, the
milk stash, formula and solid foods, allergens, teeth, growth, the potty chart and the big moments all have a place.

The whole family, one log. Parents, grandparents, a babysitter, a nanny, the daycare: each gets a role and sees what that role may
see, and health notes stay with the people you choose. A join code and a short security code make sure a new phone is who it says.
The family tree grows with the family and is painted in the watercolour of your region.

Your own cloud, encrypted. There is no account with us and no server of ours. The log lives on your phones and, if you choose, in a
folder in your own Dropbox, Google Drive or iCloud Drive, encrypted on your phone before it leaves it: the cloud stores files it
cannot read, and so do we. A recovery code gets you back in if every phone is lost.

Grows with the child. The Day page, the Guide and the entries follow the child's age: newborn, baby, toddler, preschool, school,
teenager. Month-by-month milestones, what is common at each age, when to call, the health record, the report for the doctor as a
PDF, and short videos from health services and children's hospitals.

Also: the routine the app learns from your days, a sleep check that asks whether the baby is still asleep, a travel mode across time
zones, a handover card for the babysitter, an app lock with Face ID, Touch ID, fingerprint or a PIN, dark mode, and 32 languages.

Little Log gives general information from the NHS, the AAP, the CDC and the WHO. It is not medical advice: for your child, ask your
pediatrician, and in an emergency call your local emergency number.

**Category:** Google Play *Parenting*; App Store primary *Lifestyle*, secondary *Health & Fitness* (not *Medical*: the app records
what a family enters and gives general information; it does not diagnose or treat).

**Contact:** the support address on your domain; the privacy policy at `privacyUrl`; a home page on the same domain.

## Google Play: Data safety (suggested answers)

The form asks about data *collected* (transmitted off the device to you or to third parties) and *shared*. Little Log sends
nothing to us. What leaves the phone goes only to the cloud account the family itself connected, end-to-end encrypted, so the
developer and the provider cannot read it; the form's definitions decide whether that counts as collection, so read them in the
console before answering. Then:

* Data collected or shared: if the form's exemption for data the developer cannot read applies, **none**; otherwise declare, as
  *collected* and *not shared*, *Health info*, *Photos and videos*, *Name* (the children's and the family's) and *Other user-generated
  content*, each **optional**, **encrypted in transit**, **not used for advertising or analytics**, **can be deleted by the user**,
  and with the purpose *App functionality*.
* Data is encrypted in transit: **yes** (HTTPS to the cloud, and the content itself encrypted before that).
* Users can request deletion: **yes**: the app deletes entries, the family's log and its own data on request, and the folder is in
  the user's own cloud account.
* Independent security review: no.
* Account creation: the app has no accounts of its own.

## Google Play: declarations

* Ads: **no**. Target audience: **adults** (parents and carers); the app is not designed for children. App access: **all
  functionality is available without special access** (no login). Government app: no. Financial features: none. News app: no.
* Health apps declaration: the app **records health information the user enters** about their children (symptoms, temperatures,
  medicines, allergies, growth); it is **not a medical device** and gives **general information with sources**, not diagnosis.
* Content rating (IARC): no violence, no sexual content, no drugs, no gambling, no user interaction with strangers (sharing is with
  family members the user chooses); mention that the Guide's teenage section discusses puberty, contraception and sexually
  transmitted infections in plain, informational terms, so the rating lands where it should rather than being corrected later.

## App Store: App Privacy (suggested answers)

Apple's labels ask what is collected by the developer or third-party partners. Little Log collects nothing: no data is sent to us
or to anyone on our behalf. The family's own cloud account receives only data the user cannot be distinguished from encrypted files
by. Answer **Data Not Collected**, and keep the privacy policy's wording in step with that.

* Export compliance: see MOBILE.md, *iOS release* (the app's cryptography is the operating system's standard algorithms; the
  Info.plist key is set).
* Age rating: the same facts as the IARC answers above; the puberty section makes the honest rating 12+.
* Trader status: as applies to you (a person or a company selling or giving away the app in the European Union).
