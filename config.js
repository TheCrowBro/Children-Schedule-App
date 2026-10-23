// Public client-side settings. None of these are secrets (the Supabase "anon" key is designed
// to be public; access is enforced by the row-level security in supabase/schema.sql).
// Leave a value empty to disable that feature. See SETUP.md.
window.LL_CONFIG = {
  supabaseUrl: '',      // e.g. https://abcdxyz.supabase.co
  supabaseKey: '',      // Project Settings → API → anon / public key
  dropboxKey: '',       // Dropbox app key (App folder access)
  googleClientId: '',   // Google OAuth client ID (Web), scope drive.appdata  [browser]
  googleNativeClientId: '', // Google OAuth client ID of type "iOS", for the phone app  [phone app]
  msClientId: '',       // Azure app registration (SPA), scope Files.ReadWrite.AppFolder
  appScheme: 'app.littlelog.newborn', // must match the app id; the OS uses it to return to the app after cloud sign-in
  publicUrl: '',        // where the web app is hosted (https://…); used in invite QR codes so people without the app can open them
};
