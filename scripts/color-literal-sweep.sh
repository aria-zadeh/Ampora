#!/usr/bin/env bash
# Accurate hardcoded-colour sweep for the docs/02 "never hardcode colours" rule.
#
# The rule is about colour DECISIONS made outside the token system, so this
# counts literals in code and ignores literals in prose. A bare grep cannot
# tell the two apart, and the difference is most of the number:
#
#   1. COMMENTS. This codebase documents measured contrast ratios inline, e.g.
#      "primary-600 (#2563EB) measures 3.38:1 on the dark card". Those hexes
#      are the evidence for a decision, not a decision, and deleting them to
#      satisfy a grep would make the codebase worse. A bare grep also matches
#      `#185` in the many comments referencing React error #185. Comments are
#      stripped below INCLUDING multi-line `{/* ... */}` JSX blocks, whose
#      continuation lines carry no marker of their own and so survive any
#      line-based filter.
#   2. THE ONE SANCTIONED LITERAL. `utils/design-tokens.ts`'s cheatsheet
#      prescribes `text-neutral-500 dark:text-[#78716C]`, because
#      `colors.dark.textMuted` is bespoke and sits on no step of the shared
#      neutral ramp. `neutral.500` (#6F6862) is close but drops the audited
#      3.65:1 to 3.19:1, under WCAG AA. Rewriting it is a contrast regression,
#      so it must not be counted as debt.
#
# Anything this still reports is a real literal in real code.
set -euo pipefail
cd "$(dirname "$0")/.."

python3 - "${1:-}" <<'PY'
import os, re, sys

SCAN_DIRS = ("app", "components", "hooks")
LITERAL = re.compile(r"#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(")
SANCTIONED = re.compile(r"dark:(text|bg|border)-\[#78716C\]")

def strip_comments(src):
    """Blank out // line comments and /* */ blocks, preserving line numbers."""
    out, i, n = [], 0, len(src)
    in_block = in_line = False
    in_str = None
    while i < n:
        c, two = src[i], src[i:i+2]
        if in_block:
            if two == "*/":
                in_block = False; out.append("  "); i += 2; continue
            out.append("\n" if c == "\n" else " "); i += 1; continue
        if in_line:
            if c == "\n":
                in_line = False; out.append("\n"); i += 1; continue
            out.append(" "); i += 1; continue
        if in_str:
            if c == "\\":
                out.append("  "); i += 2; continue
            if c == in_str:
                in_str = None
            out.append(c); i += 1; continue
        if two == "/*":
            in_block = True; out.append("  "); i += 2; continue
        if two == "//":
            in_line = True; out.append("  "); i += 2; continue
        if c in "\"'`":
            in_str = c
        out.append(c); i += 1
    return "".join(out)

hits = []
for d in SCAN_DIRS:
    for root, _, files in os.walk(d):
        for name in sorted(files):
            if not name.endswith((".ts", ".tsx")):
                continue
            path = os.path.join(root, name)
            with open(path, encoding="utf-8") as fh:
                raw = fh.read()
            code = strip_comments(raw)
            raw_lines = raw.split("\n")
            for lineno, line in enumerate(code.split("\n"), 1):
                # Belt and braces for whole-line `//` comments. The character
                # scanner above tracks string state so it can tell a `//`
                # inside a string from a real comment, but JSX TEXT is not a
                # string and routinely contains an apostrophe ("don't lock"),
                # which opens a quote the scanner never sees closed and
                # desynchronises everything after it. A line whose first
                # non-whitespace is `//` is a comment regardless of what the
                # scanner thinks, so check that directly and cheaply.
                original = raw_lines[lineno - 1] if lineno <= len(raw_lines) else ""
                if original.lstrip().startswith("//"):
                    continue
                line = SANCTIONED.sub("", line)
                if LITERAL.search(line):
                    hits.append((path, lineno, line.strip()))

if not hits:
    print("0 violations. Every colour comes from the token system.")
    sys.exit(0)

files = sorted({h[0] for h in hits})
print(f"{len(hits)} violating lines across {len(files)} files")
print()
print("By file:")
counts = {}
for p, _, _ in hits:
    counts[p] = counts.get(p, 0) + 1
for p in sorted(counts, key=lambda k: -counts[k]):
    print(f"{counts[p]:7d} {p}")

if sys.argv[1] == "--list":
    print()
    print("Every violation:")
    for p, ln, text in hits:
        print(f"{p}:{ln}:{text}")
PY
