// Public client-side settings. None of these are secrets (the Supabase "anon" key is designed to be public; access is
// enforced by the row-level security and functions in supabase/schema.sql). Leave a value empty to disable that feature.
// See SETUP.md and MOBILE.md.
window.LL_CONFIG = {
  supabaseUrl: 'https://drsyzyrkighlqninmdxm.supabase.co',      // the family's own Supabase project (SETUP.md §1)
  supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRyc3l6eXJraWdobHFuaW5tZHhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMwNjc1ODYsImV4cCI6MjEwODY0MzU4Nn0.yuo1ow6b2s1dQqxJRejgdDhSgTuBx5CbPwr8iyD05zA',      // its anon / public key: public by design, access is enforced by the database rules
  captchaSiteKey: '',   // Cloudflare Turnstile site key (turns on the security check at sign-in; also set the secret in Supabase)
  dropboxKey: '',       // Dropbox app key: Full Dropbox access for the family's own cloud (SETUP.md), which serves the cloud backup too
  googleClientId: '421294379745-fbl6v68vb9saa37nth733vqap4fb9i65.apps.googleusercontent.com',   // Google OAuth client ID of type "iOS": the family's own cloud (full Drive scope, SETUP.md) and the cloud backup (drive.appdata)
  msClientId: '',       // Azure app registration (mobile & desktop), scope Files.ReadWrite.AppFolder
  firstScreen: 'cloud', // with a family server configured too: 'cloud' puts the family's own cloud before the email sign-in on the first screen, '' the sign-in first (the other stays one tap away)
  appScheme: 'app.littlelog.newborn', // must match the app id; the OS uses it to return to the app after cloud sign-in and for invite links
  appStoreId: '',       // the app's number in the App Store (apps.apple.com/app/id…), once it is published: More → Update app opens it on iPhones
};
