#!/usr/bin/env bash
# Accurate hardcoded-colour sweep for the docs/02 "never hardcode colours" rule.
#
# The naive sweep this replaces was
#   grep -rEno "#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(" app/ components/ hooks/
# and it overcounts in three distinct ways, so the number it printed was never
# the number of actual violations:
#
#   1. COMMENTS. `#[0-9a-fA-F]{3,8}` happily matches `#185` in the many comments
#      referencing React error #185, and matches every hex quoted inside a
#      doc comment explaining which token to use. Prose is not a violation.
#   2. THE ONE SANCTIONED LITERAL. `utils/design-tokens.ts`'s cheatsheet
#      explicitly prescribes `text-neutral-500 dark:text-[#78716C]`, because
#      `colors.dark.textMuted` is a bespoke value (doc 02 section 14.6) that
#      sits on no step of the shared neutral ramp. `neutral.500` (#6F6862) is
#      close but drops the audited 3.65:1 to 3.19:1, under WCAG AA. Rewriting
#      it would be a regression, so it must not be counted as debt.
#   3. DOUBLE COUNTING. `rgba(` and a hex on the same line are two matches for
#      one decision.
#
# Counting violations rather than regex hits is the point: the rule is about
# colour decisions made outside the token system, not about characters.
set -euo pipefail
cd "$(dirname "$0")/.."

SCAN_DIRS=(app components hooks)

# Drop whole-line comments and the sanctioned dark textMuted literal, then
# count remaining lines that still carry a colour literal.
sweep() {
  grep -rEn "#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(" "${SCAN_DIRS[@]}" \
      --include='*.tsx' --include='*.ts' 2>/dev/null \
    | grep -vE ':[[:space:]]*(//|\*|/\*)' \
    | sed -E 's/dark:(text|bg|border)-\[#78716C\]//g' \
    | grep -E "#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(" || true
}

lines="$(sweep)"

if [ -z "$lines" ]; then
  echo "0 violations. Every colour comes from the token system."
  exit 0
fi

count=$(printf '%s\n' "$lines" | wc -l | tr -d ' ')
files=$(printf '%s\n' "$lines" | cut -d: -f1 | sort -u | wc -l | tr -d ' ')

echo "$count violating lines across $files files"
echo
echo "By file:"
printf '%s\n' "$lines" | cut -d: -f1 | sort | uniq -c | sort -rn

if [ "${1:-}" = "--list" ]; then
  echo
  echo "Every violation:"
  printf '%s\n' "$lines"
fi
