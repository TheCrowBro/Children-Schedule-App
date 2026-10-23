// Public client-side settings. None of these are secrets (the Supabase "anon" key is designed to be public; access is
// enforced by the row-level security and functions in supabase/schema.sql). Leave a value empty to disable that feature.
// See SETUP.md and MOBILE.md.
window.LL_CONFIG = {
  supabaseUrl: '',      // e.g. https://abcdxyz.supabase.co
  supabaseKey: '',      // Project Settings → API → anon / public key
  captchaSiteKey: '',   // Cloudflare Turnstile site key (turns on the security check at sign-in; also set the secret in Supabase)
  dropboxKey: '',       // Dropbox app key (App folder access)
  googleClientId: '',   // Google OAuth client ID of type "iOS" (Drive appdata scope)
  msClientId: '',       // Azure app registration (mobile & desktop), scope Files.ReadWrite.AppFolder
  appScheme: 'app.littlelog.newborn', // must match the app id; the OS uses it to return to the app after cloud sign-in and for invite links
};
