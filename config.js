// Public client-side settings. None of these are secrets (the Supabase "anon" key is designed
// to be public; access is enforced by the row-level security in supabase/schema.sql).
// Leave a value empty to disable that feature. See SETUP.md.
window.LL_CONFIG = {
  supabaseUrl: '',      // e.g. https://abcdxyz.supabase.co
  supabaseKey: '',      // Project Settings → API → anon / public key
  dropboxKey: '',       // Dropbox app key (App folder access)
  googleClientId: '',   // Google OAuth client ID (Web), scope drive.appdata
  msClientId: '',       // Azure app registration (SPA), scope Files.ReadWrite.AppFolder
};
