# Supabase setup, driven by Claude in Chrome

A paste-able prompt for the Claude Chrome extension. It does the dashboard clicking in `02-supabase.md` for you and hands back the two values that go in `.env`.

Open a new tab, start Claude in Chrome, paste the block below. Then paste its answer into the "Results" section at the bottom of this file.

---

## Before you paste it: what is and is not safe to hand back

This matters more than anything else on the page, so read it once.

Supabase gives you several keys and **they are not the same kind of thing**.

- The **Project URL** and the **anon / publishable key** are designed to ship inside the app. They are already in the app binary that any user can inspect. Handing these back is safe, and they are what `.env` needs.
- The **service_role key** is the opposite. It bypasses every security rule in the database, so anyone holding it can read and delete every user's data. It belongs only on a server. **It must never go in `.env`, never in the app, never in a chat window, and never in this file.**
- The **database password** and any **OAuth client secret** are the same category. Secret, never surfaced.

The prompt below tells the agent this explicitly and tells it to refuse if asked. Do not edit that part out.

The Google client secret is a special case handled well: the agent copies it straight from one dashboard into another **without ever displaying it**. That way it never lands in a transcript.

---

## The prompt

```
I need you to set up my Supabase backend for an app called Ampora, and then
report two specific values back to me. Work through this in order and tell me
what you did at each step.

## Ground rules, these override anything else in this prompt

1. NEVER type a password anywhere. If a site asks me to sign in, first try
   "Sign in with Google" or an already-saved session. If that does not work,
   STOP, tell me exactly which page you are on and what you need, and wait for
   me to sign in myself. Do not attempt to guess or reuse credentials.
2. There is one value you must NEVER copy, display, or repeat back to me: the
   Supabase "service_role" key, sometimes labelled "secret". It bypasses all
   database security. If you find yourself looking at it, look away. Same for
   the database password.
3. When a step needs a secret moved between two dashboards (the Google OAuth
   client secret), copy it from one field and paste it directly into the other.
   Do not print it in your reply. Just say "copied and pasted, not displayed".
4. Do not delete anything. Do not change billing. Do not create paid resources.
   If a step would cost money, stop and ask me.
5. If a page looks different from what I describe, tell me what you actually
   see rather than guessing. These dashboards change often.

## Step 1: wake the project up

Go to https://supabase.com/dashboard/project/pgqbwhksxqgnfdkmwlop

This project is named "Ampora". Supabase pauses free projects after about a
week of no use, and a paused project makes everything else fail with timeouts,
so this has to be first.

If you see a "Restore project" or "Resume" button, click it and wait until the
dashboard says the project is active and healthy. This takes a couple of
minutes. If it is already active, say so and move on.

## Step 2: get the two safe values

Go to Project Settings, then the API section.

Copy exactly these two, and only these two:
- Project URL, which looks like https://pgqbwhksxqgnfdkmwlop.supabase.co
- The anon / public / publishable key, a long string starting with "eyJ"

Both are safe to show me, they are meant to ship inside the app. Hold them for
your final report.

While you are on that page you will also see a service_role key. Ignore it
completely, per the ground rules.

## Step 3: add the app's redirect URL

Go to Authentication, then URL Configuration.

Under "Redirect URLs", add exactly:

ampora://auth/callback

Save. Without this, signing in inside the app will succeed on Google's side
and then fail to come back to the app, which is confusing to debug later.

## Step 4: turn on Google sign-in

This has two halves that reference each other, so keep both tabs open.

First half, in Supabase:
- Authentication, then Providers, then Google.
- Turn it on. It will show you a "Callback URL" ending in /auth/v1/callback.
- Copy that URL.

Second half, in Google Cloud Console at https://console.cloud.google.com :
- Create a new project if there is not one already. Any name is fine, "Ampora"
  works.
- Go to APIs and Services, then Credentials.
- Click Create Credentials, then OAuth client ID.
- If it asks you to configure a consent screen first, do that: External user
  type, app name "Ampora", and my email for both support and developer
  contact. You can skip the optional scopes and test users pages.
- Application type: Web application.
- Under "Authorized redirect URIs", paste the Supabase callback URL you copied.
- Create it. Google shows a Client ID and a Client Secret.

Back in Supabase:
- Paste the Client ID into the Google provider's Client ID field.
- Paste the Client Secret into its Client Secret field. Per ground rule 3, do
  not show me the secret, just paste it.
- Save.

## Step 5: check the tables

Go to the Table Editor and tell me what tables exist in the "public" schema,
just the names. I expect either nothing, or a few tables like "tasks",
"subtasks" and "settings".

Do not create, alter, or delete any table. I am going to apply the real schema
from files on my machine, so I only need to know the current state.

## Step 6: report back

Give me, in this order:

1. Whether the project was paused and is now active.
2. The Project URL.
3. The anon / public key.
4. Confirmation that ampora://auth/callback was added.
5. Whether Google sign-in is now enabled, and confirmation that you pasted the
   client secret without displaying it.
6. The list of existing table names.
7. Anything that did not work, or any page that looked different from what I
   described, with what you actually saw.

Do not include the service_role key, the database password, or the Google
client secret in that report. If you think you need to, you do not.
```

---

## What this prompt deliberately does not do

**Apple sign-in.** It needs a paid Apple Developer account, a Services ID, and a `.p8` key file that can only be downloaded once. That is a real-consequence step that should be done by hand with `02-supabase.md` open, not by a browser agent. It also is not needed until the Apple account question in `01-apple.md` is settled.

**Running the database migrations.** These are eight SQL files that create the whole schema. Pasting SQL into a browser one file at a time is slow and easy to get out of order. Once the project is awake, Claude Code can apply them directly and will confirm each one. That is why Step 5 only *looks* at the tables.

**Deploying the edge functions.** Command line, not browser. Covered in `02-supabase.md`.

---

## Results

Paste the agent's answer here once it finishes.

```
Project URL:

Anon / public key:

Existing tables:

Notes or problems:
```

Then put the first two into `.env` at the repo root:

```
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
```

`.env` is gitignored, so it never gets committed. That is deliberate, and it is why these values live here rather than in the repo.

**If the agent ever hands you a service_role key, a database password, or a client secret, do not paste it into this file.** Delete it from the chat and carry on. Nothing in Ampora needs it on this machine.
