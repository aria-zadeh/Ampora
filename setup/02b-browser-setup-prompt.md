# Supabase setup, driven by Claude in Chrome

A paste-able prompt for the Claude Chrome extension. It does the dashboard clicking in `02-supabase.md` for you and hands back the two values that go in `.env`.

Open a new tab, start Claude in Chrome, paste the block below. Then paste its answer into the "Results" section at the bottom of this file.

---

## Nothing here needs an Apple account

You can run all of this today, alone. No Apple Developer account, no second person, nothing paid. Apple sign-in is the only part of `02-supabase.md` that needs any of that, and it is deliberately left out of this prompt.

## Yes, it gives you the API key

**The prompt copies the key you need and reports it back to you at the end.** That is the whole point of it.

The confusing part is that Supabase shows **two different keys on the same screen**, and only one of them is yours to use:

| Key | What it is | This prompt |
|---|---|---|
| **anon** / public / publishable | The app's key. Ships inside the app, readable by anyone who inspects a build. This is the one `.env` needs. | **Copies it and hands it to you** |
| **service_role** / secret | An admin key that bypasses every security rule. Anyone holding it can read or delete every user's data. Ampora never uses it. | Ignores it |

So "do not copy the key" only ever meant the second one. The first one is exactly what you are here for.

Same idea for the **database password** and the **Google client secret**: the app does not need either, so neither gets surfaced. The client secret does get *used*, but the agent moves it straight from Google's dashboard into Supabase's without displaying it, so it never ends up in a chat log.

**If the agent cannot copy the anon key for any reason**, the prompt tells it to stop on that exact screen and leave it visible so you can copy it yourself. Either way you end up with it.

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

## Step 2: get the two values I actually need

Go to Project Settings, then the API section.

Copy exactly these two, and report both to me at the end:
- Project URL, which looks like https://pgqbwhksxqgnfdkmwlop.supabase.co
- The anon / public / publishable key, a long string starting with "eyJ"

**Both of these are safe to show me and I want them.** They ship inside the
app and are readable by anyone who inspects a build, so telling me is not a
leak. This is the main thing I am asking you for.

If for any reason you cannot read or copy the anon key, do not skip it and do
not summarise it. Stop on that exact screen with the key visible, tell me it is
on screen, and let me copy it myself. Then carry on.

On that same page you will also see a service_role key, sometimes labelled
"secret". That one is not mine to use and Ampora never touches it, so skip it
entirely per the ground rules. Two keys, one screen, I only want the first.

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
2. The Project URL, written out in full.
3. The anon / public key, written out in full. Do not truncate it, do not
   abbreviate it with an ellipsis, and do not describe it. I need to paste it
   into a config file, so I need the actual string.
4. Confirmation that ampora://auth/callback was added.
5. Whether Google sign-in is now enabled, and confirmation that you pasted the
   client secret without displaying it.
6. The list of existing table names.
7. Anything that did not work, or any page that looked different from what I
   described, with what you actually saw.

Items 2 and 3 are the whole reason I asked you to do this, so do not leave them
out or soften them.

The only things to keep out of that report are the service_role key, the
database password, and the Google client secret. None of those go anywhere
near the app, so I have no use for them.
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
