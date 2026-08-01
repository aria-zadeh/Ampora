# Setting up the Mac

Windows can run and edit almost all of Ampora, but it cannot compile the iOS app: that needs Xcode, which only runs on a Mac. This file gets a Mac ready to build and test the real, native version of the app.

## Before pasting anything: carry one folder across

Three things cannot be reinstalled automatically, because nothing records where they originally came from. They have already been packaged up for you on the Windows Desktop:

- **`Desktop\transfer\`** — the folder, ready to copy
- **`Desktop\ampora-claude-config.zip`** — the same thing zipped, about 7 MB, easier to upload

It contains the skill packs, 17 custom subagent definitions, and the personal `CLAUDE.md` working rules. **No keys, no passwords, no tokens** — documentation and configuration only.

**Do this:**

1. Upload `ampora-claude-config.zip` to Google Drive from the Windows machine.
2. On the Mac, download it and unzip onto the Desktop, so you end up with `~/Desktop/transfer/`.
3. Run the prompt below. It looks for that folder and copies everything into place itself.

If the folder is not there, the prompt says so and carries on with everything else, so nothing breaks.

**Doing it by hand instead**, if that is ever easier:

```
mkdir -p ~/.claude
cp -R ~/Desktop/transfer/claude-config/skills ~/.claude/skills
cp -R ~/Desktop/transfer/claude-config/agents ~/.claude/agents
cp ~/Desktop/transfer/claude-config/CLAUDE.md ~/.claude/CLAUDE.md
```

Everything else (plugins, marketplaces, MCP servers) gets installed by the prompt below.

**Do not copy `~/.claude.json` across.** Unlike the three files above, this one stores API keys in plain text. The Windows machine's copy has at least one live key and one revoked one sitting in it. The setup prompt below asks for any key it actually needs directly, instead of relying on this file. Leave it behind, and if there is a live key referenced there that should not be, rotate that key while thinking about it.

## The setup prompt

Once the Mac has Claude Code installed, open it in any directory and paste the following. It works through prerequisites, plugins, MCP servers, and cloning the repo on its own, and reports back what worked and what did not, rather than asking for confirmation at every step.

```
Set this Mac up as a second development machine for the Ampora project. I work
primarily on a Windows desktop and I want this machine to have the same Claude
Code environment, plus the native iOS toolchain that Windows cannot run.

Work through these steps in order. Tell me what succeeded and what failed at the
end. Do not ask me to confirm each step, just do them and report.

## 0. Restore my Claude config from the transfer folder

Look for a folder at ~/Desktop/transfer. I copied it over from my Windows
machine, via Google Drive, because these three things cannot be reinstalled
automatically: nothing records where they originally came from.

If ~/Desktop/transfer/claude-config exists, copy its contents into place:

  mkdir -p ~/.claude
  cp -R ~/Desktop/transfer/claude-config/skills ~/.claude/skills
  cp -R ~/Desktop/transfer/claude-config/agents ~/.claude/agents
  cp ~/Desktop/transfer/claude-config/CLAUDE.md ~/.claude/CLAUDE.md

Then confirm it worked by telling me how many entries are in ~/.claude/skills
and ~/.claude/agents. I expect roughly 50 skills and 17 agents. If either count
looks far off, say so rather than moving on.

If I unzipped it somewhere else, check ~/Downloads and the Desktop for a folder
or zip named "transfer" or "ampora-claude-config" before giving up.

If you cannot find it anywhere, do not stop. Say so clearly, carry on with
every step below, and remind me at the end. Everything else works without it,
the Mac will just be missing some skills until I copy the folder over.

There are no keys or passwords in that folder. If you find anything that looks
like a credential in it, stop and tell me instead of copying it.

## 1. Prerequisites

Check what is already installed and install only what is missing, using Homebrew
where possible:
- Xcode from the App Store, plus `xcode-select --install` for the command line
  tools. Verify with `xcodebuild -version`. This is a large download. If Xcode
  is absent, tell me and stop rather than waiting on it.
- CocoaPods (`brew install cocoapods`)
- Node 20 or newer (`brew install node`), and confirm `npm -v`
- Watchman (`brew install watchman`)
- The EAS CLI (`npm i -g eas-cli`)
- Git, and confirm `git --version`

## 2. Claude Code marketplaces and plugins

Add these plugin marketplaces:
- anthropics/claude-plugins-official
- obra/superpowers-marketplace
- vercel/vercel-plugin
- JuliusBrussee/caveman
- morphllm/morph-claude-code-plugin
- nextlevelbuilder/ui-ux-pro-max-skill
- VoltAgent/awesome-claude-code-subagents

Then install these plugins:
- frontend-design, vercel, remember, claude-md-management and claude-code-setup
  from claude-plugins-official
- superpowers and superpowers-lab from superpowers-marketplace
- caveman from the caveman marketplace
- morph-compact from the morph marketplace

Enable frontend-design, vercel, caveman and morph-compact.

## 3. MCP servers

Add these at user scope:
- context7, HTTP, https://mcp.context7.com/mcp
- expo, HTTP, https://mcp.expo.dev/mcp
- supabase, HTTP, https://mcp.supabase.com/mcp?project_ref=pgqbwhksxqgnfdkmwlop
- playwright, stdio, npx -y @playwright/mcp@latest
- memory, stdio, npx -y @modelcontextprotocol/server-memory
- sequential-thinking, stdio, npx -y @modelcontextprotocol/server-sequential-thinking

Skip the GitHub and Obsidian servers for now. Both need credentials I have not
given you, and I will add them myself. Do not invent placeholder tokens, and do
not ask me to paste a token into the chat.

The supabase and expo servers use OAuth. Tell me at the end that I need to run
`/mcp` in an interactive session to authorise them, since you cannot complete an
OAuth flow yourself.

## 4. The repo

Clone the Ampora repository into ~/Developer/Ampora, check out the branch I am
working on, then run `npm ci`.

Create a `.env` file at the repo root with these keys, and leave the values
blank for me to fill in:
  EXPO_PUBLIC_SUPABASE_URL=
  EXPO_PUBLIC_SUPABASE_ANON_KEY=
  EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=
`.env` is gitignored. Never commit it, and never print a real key into the chat.
The RevenueCat key is a public/publishable key (like a Stripe publishable key,
not a secret), but it still has no business in chat or in git, see
setup/05-revenuecat.md for where it actually comes from.

## 5. Verify the baseline before touching anything native

Run these and report the exact output:
  npm run typecheck        # must be 0 errors
  npm test                 # must pass
  npx expo export --platform web   # must complete

If any of them fail, stop and show me the failure. Do not attempt to fix them.
They pass on Windows, so a failure here is a machine or environment difference I
want to see before we go further.

## 6. Report

Tell me: what you installed, what was already present, what failed, and the
exact commands I still need to run myself (OAuth authorisation, the two env
values, and the transfer folder if you could not find it).
```

## What happens after

Claude Code works through all six steps on its own and gives a report at the end. Three things in that report need a human, not Claude, to finish:

1. **OAuth authorization** for the `supabase` and `expo` MCP servers. Run `/mcp` inside an interactive Claude Code session on the Mac and follow the sign-in prompts for each. Claude Code cannot complete a browser sign-in flow by itself.
2. **The two env values it left blank.** Fill in `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in the new `.env` file, from `02-supabase.md`. Leave `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` blank until `05-revenuecat.md`.
3. **The transfer folder**, if the prompt reported it could not find `~/Desktop/transfer`.

**What success looks like overall:** `npm run typecheck` reports 0 errors, `npm test` passes, and `npx expo export --platform web` completes, all three matching what already passes on the Windows machine. If any of them differ, that is a real machine difference worth looking at before moving on to `04-test-the-lock.md`, not something to work around.
