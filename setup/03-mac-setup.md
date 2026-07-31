# Setting up the Mac

Windows can run and edit almost all of Ampora, but it cannot compile the iOS app: that needs Xcode, which only runs on a Mac. This file gets a Mac ready to build and test the real, native version of the app.

## Before pasting anything: one manual copy

Three things cannot be reinstalled automatically and have to be physically carried over from the Windows machine. Zip these up and move them across by iCloud, Google Drive, Dropbox, or a USB stick:

```
C:\Users\Aria\.claude\skills\      →  ~/.claude/skills/
C:\Users\Aria\.claude\agents\      →  ~/.claude/agents/
C:\Users\Aria\.claude\CLAUDE.md    →  ~/.claude/CLAUDE.md
```

The `skills` folder holds design and Expo skill packs whose original install sources are not recorded anywhere, so a fresh install on the Mac cannot fetch them automatically. The `agents` folder holds custom subagent definitions built up over time. Neither contains a secret or key, both are safe to move by USB or cloud drive.

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
values, the manual ~/.claude copy if I have not done it).
```

## What happens after

Claude Code works through all six steps on its own and gives a report at the end. Three things in that report need a human, not Claude, to finish:

1. **OAuth authorization** for the `supabase` and `expo` MCP servers. Run `/mcp` inside an interactive Claude Code session on the Mac and follow the sign-in prompts for each. Claude Code cannot complete a browser sign-in flow by itself.
2. **The two env values it left blank.** Fill in `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in the new `.env` file, from `02-supabase.md`. Leave `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` blank until `05-revenuecat.md`.
3. **The manual `~/.claude` copy above**, if it was not done before running the prompt.

**What success looks like overall:** `npm run typecheck` reports 0 errors, `npm test` passes, and `npx expo export --platform web` completes, all three matching what already passes on the Windows machine. If any of them differ, that is a real machine difference worth looking at before moving on to `04-test-the-lock.md`, not something to work around.
