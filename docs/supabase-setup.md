# Store budget scenarios in Supabase

The Budget page saves to the browser until you connect a Supabase project. Once connected, scenarios live in the database, follow you across devices, and each one has a read-only share link for your contractor. About ten minutes, no server to run.

1. **Create a project** at supabase.com (the free tier is enough). Pick any name and region.
2. **Create the table and rules.** Open `supabase/schema.sql`, replace `YOUR_EMAIL_HERE` (twice) with the email you will sign in with, paste the file into the SQL editor, and run it.
3. **Allow the sign-in link.** Under Authentication → URL Configuration, set the Site URL to where the site is published, and add that address (and `http://localhost:8000/**` if you test locally) to the redirect allow-list.
4. **Copy your keys.** Under Project Settings → API, copy the Project URL and the `anon` public key into `supabase-config.js`. The anon key is meant to be public; the rules from step 2 are what protect the data.
5. **Sign in once.** Open the Budget page, enter your email, and click the link that arrives. After your first sign-in you can turn off new sign-ups under Authentication → Providers → Email, so nobody else can create an account.
6. **Bring your old scenarios.** If you built scenarios before connecting, the page offers an "Import browser scenarios" button the first time you are signed in.

## How sharing works

- Only the editor email can list, create, edit or delete scenarios.
- "Copy share link" gives a URL ending in `?s=<random id>`. Anyone with it can read that one scenario; they cannot see your others or change anything.
- "One-pager" opens `summary.html?s=<id>`, a printable materials list built from that scenario. It works from the same share link, so your GC or designer can open it without signing in.
- Deleting a scenario kills its share link.

## Without Supabase

Leave `supabase-config.js` empty and the page works as before, saving in this browser only. The CSV download works either way.
