# Supabase: database, sign-in, and AI

Supabase is Ampora's backend: the database, the accounts and sign-in system, and the server-side functions that call Google's AI. The app is "local-first," meaning it works fine on a device without ever talking to Supabase, but sign-in, cross-device sync, and real AI breakdowns all need it configured.

## What a migration actually is

A migration is a small text file of SQL instructions that changes the shape of the database: "create this table," "add this column," "add this safety rule." Running the migration files in this repo, in order, against a Supabase project builds up the exact database structure the app expects, one step at a time, the same way it was built originally.

## The project, and the thing that will come up repeatedly

The live project is named **Ampora**, project reference `pgqbwhksxqgnfdkmwlop`. Log in at [supabase.com/dashboard](https://supabase.com/dashboard) and open it.

**Supabase pauses free-tier projects automatically after about 7 days with no meaningful database activity.** This will happen to Ampora's project repeatedly, especially between work sessions, since nothing is running against it around the clock yet.

- **What it looks like when paused:** every request from the app just hangs and eventually times out. Sign-in silently fails. Nothing in the app itself explains why, since it has no "your backend is paused" message, it just looks broken.
- **If sign-in or sync suddenly stops working with no code change to explain it, check this first**, before debugging anything else.
- **How to fix it:** open the project in the dashboard, there is a **Restore project** (sometimes labeled **Resume**) button on the paused project's card. Click it, wait a couple of minutes, everything comes back with all data intact.
- One more timing detail worth knowing: if a project sits paused for more than 90 days, one-click restore stops being available and restoring becomes a manual backup-download process instead. It can still be restored up to about a year after pausing. This should not come up if the project gets opened every week or two, but do not leave it fully untouched for months.
- A paid Supabase plan never pauses. Not needed yet, just worth knowing this problem eventually goes away once the project moves to a paid plan.

## Running the migrations

All the migration files live in `supabase/migrations/` in this repo, named with a date-based prefix so they sort in the order they must run.

1. In the dashboard, open **SQL Editor** in the left sidebar.
2. Open the first file, `20260730000001_baseline_tasks_subtasks_settings.sql`, in a text editor. Select all, copy.
3. In the SQL Editor, click **New query**, paste the file's full contents, click **Run** (or press Ctrl+Enter / Cmd+Enter).
4. **What success looks like:** a green success message at the bottom of the editor, usually something like "Success. No rows returned." No red error text.
5. Repeat for each file **in exact numeric order**: `000001`, `000002`, `000003`, `000004`, `000005`, `000006`. They build on each other. Running them out of order can fail with an error like "relation does not exist," because a later file assumes an earlier one already ran.

A few files need special handling. Read this before running `000007` or `000008`:

- **`000001` is safe to run even without knowing whether it already ran.** It is written to detect and skip work that is already done (it creates the `tasks`, `subtasks`, and `settings` tables, which likely already exist on the live project from before any of these migration files existed). Running it again is a safe no-op, not a mistake.
- **`000007_drop_energy_columns_PENDING_REVIEW.sql`: do not run this without checking first.** The name says PENDING_REVIEW on purpose. It permanently deletes two database columns left over from a removed feature (`energy_required` on `tasks`, `energy_peak` on `settings`). Dropping a column deletes whatever data is in it, permanently, not just hides it.
  - **Before running it:** open **Table Editor** in the dashboard, look at the `tasks` table's columns and the `settings` table's columns. If neither `energy_required` nor `energy_peak` appears, the migration is a safe no-op (it uses `drop column if exists`, so it will not error either way) and can be run or simply left alone, it changes nothing either way. If either column exists and it is unclear what is in it, stop and figure that out before running this file.
- **`000008_settings_never_lock_categories_check.sql` is new**, added after the original migration files were written. Other docs in this repo may still say "seven migrations," that count is now out of date by one file. `000008` is the opposite risk profile from `000007`: it is safe. It adds a database rule ensuring the six protected "never lock" categories (phone, messages, maps, accessibility, OS settings, Ampora itself) can never be saved without all six present, and it repairs any existing row missing one of them before adding the rule. Run it any time after `000001` through `000006`, whether or not `000007` has been dealt with yet.

## Where the `.env` keys come from

In the dashboard: the Ampora project, then **Project Settings** (gear icon, bottom of the left sidebar), then **API**.

- `EXPO_PUBLIC_SUPABASE_URL` is the **Project URL** field on that page.
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` is the **anon** / **public** key, under Project API keys on the same page.

**The anon key is designed to be public.** It ships inside the app on purpose, and that is safe: the actual protection is the row-level security rules written into every migration file above (each one restricts a user to only their own rows), not secrecy of this key.

**The `service_role` key on that same page is completely different, and this is the distinction that gets small apps breached.** It bypasses every security rule. It must never go into `.env`, never into any file that ships with the app, never into git, never pasted into a chat with anyone, including Claude. If it is ever exposed (committed to git, pasted somewhere, put in the client bundle by mistake), treat it as fully compromised and roll it immediately using the regenerate button next to it on that same API settings page.

## Enabling Google sign-in

1. Go to the [Google Cloud Console](https://console.cloud.google.com), create a project (or pick one that already exists for Ampora).
2. In the left sidebar, open **APIs & Services**, then **Credentials**, then **+ Create Credentials**, then **OAuth client ID**.
3. The first time through, Google also asks to configure an **OAuth consent screen**. Choose **External** user type, fill in the app name and a support email. It is fine to leave it in "Testing" mode for now.
4. For the client ID itself, choose application type **Web application**.
5. Before saving, get Supabase's callback URL: open a second tab, Supabase dashboard, **Authentication**, **Providers**, **Google**. That page shows the exact callback URL to use, in the form `https://pgqbwhksxqgnfdkmwlop.supabase.co/auth/v1/callback`. Paste it into Google Cloud Console's **Authorized redirect URIs** field.
6. Click **Create** in Google Cloud Console. Google shows a **Client ID** and **Client Secret**, copy both.
7. Back in the Supabase tab (Authentication, Providers, Google), toggle the provider **on**, paste in the Client ID and Client Secret, click **Save**.

**What success looks like:** the Google provider shows as enabled in Supabase, and "Continue with Google" in the app opens a real Google account picker instead of erroring.

## Enabling Apple sign-in

Needs the paid Apple Developer Program membership from `01-apple.md` first. This step is blocked until that is active.

1. [developer.apple.com/account](https://developer.apple.com/account), **Identifiers**, **+**, **Services IDs**, register a new one (something like `com.ampora.app.signin`).
2. On that new Services ID, turn on **Sign In with Apple**, click Configure. Add the return URL: the same Supabase callback URL as Google above, `https://pgqbwhksxqgnfdkmwlop.supabase.co/auth/v1/callback`, and the domain `pgqbwhksxqgnfdkmwlop.supabase.co` as an associated domain.
3. **Keys**, **+**, give it a name, turn on **Sign In with Apple**, associate it with the main App ID (`com.ampora.app`), click Continue, Register.
4. **Before clicking Download: this `.p8` key file can only be downloaded once, ever.** There is no "download again" link later. If it is lost, the only fix is revoking that key, generating a new one, and redoing this whole step. Have a safe place ready for it outside this repo first (never commit it to git), then click **Download** and save it there immediately.
5. Back in Supabase: **Authentication**, **Providers**, **Apple**, toggle it on, fill in:
   - **Services ID**: the identifier from step 1 (`com.ampora.app.signin`)
   - **Team ID**: found at developer.apple.com/account, on the Membership details page
   - **Key ID**: shown next to the key just created in step 3
   - **Key**: open the downloaded `.p8` file in a plain text editor, copy the entire contents including the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines, paste all of it in
6. Click **Save**.

## Both providers need one more thing: the app's own redirect URL

Supabase dashboard, **Authentication**, **URL Configuration**, **Redirect URLs**, add `ampora://auth/callback`, **Save**.

This is the app's custom URL scheme (`"scheme": "ampora"` in `app.json`). It brings control back to Ampora after signing in through the browser, instead of leaving the person stranded on a Google or Apple web page.

## Deploying the edge functions

These are small server-side programs Supabase runs on Ampora's behalf, so the AI key and account-deletion admin powers never have to live inside the app itself.

1. Install the Supabase CLI if it is not already there: `npm install -g supabase` (or on a Mac, `brew install supabase/tap/supabase`).
2. From the repo root: `supabase login`, then `supabase link --project-ref pgqbwhksxqgnfdkmwlop`.
3. Deploy each function:
   ```
   supabase functions deploy ai-breakdown
   supabase functions deploy ai-refine
   supabase functions deploy ai-simplify
   supabase functions deploy ai-extract-tasks
   supabase functions deploy ai-project-task
   supabase functions deploy ai-verify-proof
   supabase functions deploy send-auth-email
   supabase functions deploy delete-account
   ```
   Running `supabase functions deploy` with no name deploys all of them at once, if that is easier.
4. **What success looks like:** the CLI prints a deployed URL for each function, and the dashboard's **Edge Functions** page lists all eight as active.

**`delete-account` matters for App Store approval specifically.** Apple requires apps that support account creation to also support deleting the account from inside the app. Make sure this one is deployed before submitting to the App Store.

## Setting the AI key

1. Get a free key from [Google AI Studio](https://aistudio.google.com/apikey), sign in with any Google account, click **Create API key**.
2. Set it as a server-side secret, **not** in `.env`:
   - Dashboard: **Edge Functions**, **Manage secrets**, add `GEMINI_API_KEY`, or
   - CLI, from the repo root: `supabase secrets set GEMINI_API_KEY=...`
3. **This step is genuinely optional and not urgent.** With no key set, every AI call quietly falls back to a decent local canned response, nothing in the app breaks or shows an error. Do this whenever real AI breakdowns matter more than the local fallback.
4. Once a key is set, avoid calling the AI functions routinely just to check they work, a single one-off check is enough. Repeated calls cost real money once past the free tier's limits.
