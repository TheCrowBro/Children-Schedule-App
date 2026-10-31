// Public client-side settings. None of these are secrets (the Supabase "anon" key is designed to be public; access is
// enforced by the row-level security and functions in supabase/schema.sql). Leave a value empty to disable that feature.
// See SETUP.md and MOBILE.md.
window.LL_CONFIG = {
  supabaseUrl: '',      // a family server (Supabase, SETUP.md §1): kept in the code for later, off while this is empty (the store build)
  supabaseKey: '',      // its anon / public key (public by design, access is enforced by the database rules); empty with the address above
  captchaSiteKey: '',   // Cloudflare Turnstile site key (turns on the security check at sign-in; also set the secret in Supabase)
  dropboxKey: '',       // Dropbox app key: Full Dropbox access for the family's own cloud (SETUP.md), which serves the cloud backup too
  googleClientId: '421294379745-fbl6v68vb9saa37nth733vqap4fb9i65.apps.googleusercontent.com',   // Google OAuth client ID of type "iOS": the family's own cloud (full Drive scope, SETUP.md) and the cloud backup (drive.appdata)
  msClientId: '',       // Azure app registration (mobile & desktop), scope Files.ReadWrite.AppFolder
  firstScreen: 'cloud', // with a family server configured too: 'cloud' puts the family's own cloud before the email sign-in on the first screen, '' the sign-in first (the other stays one tap away)
  appScheme: 'app.littlelog.newborn', // must match the app id; the OS uses it to return to the app after cloud sign-in and for invite links
  appStoreId: '',       // the app's number in the App Store (apps.apple.com/app/id…), once it is published: More → Update app opens it on iPhones
  privacyUrl: '',       // where the privacy policy (PRIVACY.md) is published: More → App updates shows a Privacy policy link once this is set (the stores want the same address)
};
