/**
 * Quick-add natural-language parser (pure).
 *
 * Turns a single free-text line ("Read ch 11 due fri 2h high") into a
 * structured draft ({ title, due, durationMin, priority }) that the Tasks tab
 * previews before committing via `taskStore.createTask`.
 *
 * Portability contract (matches `core/task-logic.ts` / `core/id.ts`): NO
 * react-native / expo / MMKV imports and NO direct `Date.now()` — every
 * function that needs "now" takes it as a parameter (epoch ms), so results are
 * fully deterministic and unit-testable. `due` values are epoch ms.
 *
 * Parsing strategy: tokens are matched and STRIPPED from the input
 * sequentially (priority -> duration -> due -> "due" stopword). Whatever
 * remains, trimmed of dangling stopwords and separator punctuation, is the
 * title.
 */

export interface QuickAddResult {
  title: string
  /** Epoch ms deadline, when a date and/or time-of-day token was recognized. */
  due?: number
  /** Duration in minutes, when a "2h" / "30m" style token was recognized. */
  durationMin?: number
  /** 1=Low, 2=Medium, 3=High, 4=Urgent, when a priority word was recognized. */
  priority?: number
  /** List name, when a "#token" hashtag was recognized. */
  list?: string
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Day-of-week names -> 0-6 (0 = Sunday), matching `Date#getDay()`. */
const WEEKDAYS: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thur: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
}

/**
 * Returns the epoch ms for the next occurrence of `dow` (0-6) at or after
 * `base`, set to 23:59 local time on that day. If `base` already falls on
 * `dow`, TODAY at 23:59 is returned (a weekday named for "today" means today).
 */
export function nextWeekday(base: number, dow: number): number {
  const d = new Date(base)
  const delta = (dow - d.getDay() + 7) % 7
  d.setDate(d.getDate() + delta)
  d.setHours(23, 59, 0, 0)
  return d.getTime()
}

/** End-of-day (23:59:00.000 local) for the day `offsetDays` from `base`. */
function endOfDayOffset(base: number, offsetDays: number): number {
  const d = new Date(base)
  d.setDate(d.getDate() + offsetDays)
  d.setHours(23, 59, 0, 0)
  return d.getTime()
}

/**
 * Removes the FIRST regex match from `input` and returns the remainder with
 * surrounding whitespace collapsed. Used to strip a recognized token so it
 * cannot also leak into the title.
 */
function stripMatch(input: string, match: RegExpExecArray): string {
  const before = input.slice(0, match.index)
  const after = input.slice(match.index + match[0].length)
  return `${before} ${after}`.replace(/\s+/g, ' ').trim()
}

/**
 * Like `stripMatch`, but also absorbs a single directly-adjacent leading
 * `sigil` character (no whitespace in between) so a punctuation marker like
 * "!high" doesn't leave the "!" stranded in the title.
 */
function stripMatchWithSigil(input: string, match: RegExpExecArray, sigil: string): string {
  let start = match.index
  if (start > 0 && input[start - 1] === sigil) start -= 1
  const before = input.slice(0, start)
  const after = input.slice(match.index + match[0].length)
  return `${before} ${after}`.replace(/\s+/g, ' ').trim()
}

// ---------------------------------------------------------------------------
// Priority
// ---------------------------------------------------------------------------

const PRIORITY_RE = /\b(urgent|high|medium|med|low)\b/i
const PRIORITY_VALUE: Record<string, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  med: 2,
  low: 1,
}

// ---------------------------------------------------------------------------
// List (#hashtag)
// ---------------------------------------------------------------------------

const LIST_RE = /#(\w+)/

// ---------------------------------------------------------------------------
// Duration
// ---------------------------------------------------------------------------

const DURATION_RE = /\b(\d+(?:\.\d+)?)\s*(hours|hour|hrs|hr|h|minutes|minute|mins|min|m)\b/i

function durationToMinutes(value: number, unit: string): number {
  const u = unit.toLowerCase()
  const isHours = u === 'h' || u === 'hr' || u === 'hrs' || u === 'hour' || u === 'hours'
  return Math.round(isHours ? value * 60 : value)
}

// ---------------------------------------------------------------------------
// Due date
// ---------------------------------------------------------------------------

/**
 * Try to match a due-date token anywhere in `input`. Returns the resolved
 * epoch ms and the leftover text (token stripped), or null if none matched.
 * Ordered most-specific first so e.g. "in 2 weeks" beats a bare weekday.
 */
function matchDue(input: string, now: number): { due: number; rest: string } | null {
  // today / tonight -> end of today.
  let m = /\b(today|tonight)\b/i.exec(input)
  if (m) return { due: endOfDayOffset(now, 0), rest: stripMatch(input, m) }

  // tomorrow / tmrw -> end of tomorrow.
  m = /\b(tomorrow|tmrw|tmr)\b/i.exec(input)
  if (m) return { due: endOfDayOffset(now, 1), rest: stripMatch(input, m) }

  // "in N days" / "in N weeks".
  m = /\bin\s+(\d+)\s*(days?|weeks?)\b/i.exec(input)
  if (m) {
    const n = parseInt(m[1], 10)
    const days = /^week/i.test(m[2]) ? n * 7 : n
    return { due: endOfDayOffset(now, days), rest: stripMatch(input, m) }
  }

  // Weekday, optionally prefixed with "next" (which pushes to the following
  // week when the named day is today or already passed this week).
  m = /\b(next\s+)?(sunday|saturday|thursday|thursday|wednesday|tuesday|monday|friday|sun|mon|tues|tue|wed|thurs|thur|thu|fri|sat)\b/i.exec(
    input
  )
  if (m) {
    const dow = WEEKDAYS[m[2].toLowerCase()]
    if (dow != null) {
      let due = nextWeekday(now, dow)
      if (m[1]) {
        // "next <day>": if the plain nextWeekday landed within the next 7 days
        // starting today, bump a week so "next fri" is never *this* week.
        const base = new Date(now)
        base.setHours(0, 0, 0, 0)
        if (due - base.getTime() < 7 * DAY_MS) due += 7 * DAY_MS
      }
      return { due, rest: stripMatch(input, m) }
    }
  }

  // Numeric date: M/D or M/D/YY or M/D/YYYY.
  m = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(input)
  if (m) {
    const month = parseInt(m[1], 10)
    const day = parseInt(m[2], 10)
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const d = new Date(now)
      let year = d.getFullYear()
      if (m[3] != null) {
        const raw = parseInt(m[3], 10)
        year = raw < 100 ? 2000 + raw : raw
      }
      d.setFullYear(year, month - 1, day)
      d.setHours(23, 59, 0, 0)
      // Bare M/D in the past this year -> assume next year.
      if (m[3] == null && d.getTime() < now) d.setFullYear(year + 1)
      return { due: d.getTime(), rest: stripMatch(input, m) }
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// Time of day
// ---------------------------------------------------------------------------

/**
 * Try to match a clock-time-of-day token ("3pm", "3 pm", "3:30pm", "15:00",
 * "at 3") anywhere in `input`. Returns the 24-hour hour/minute and the
 * leftover text (token stripped), or null if none matched. Deliberately
 * narrow — requires an explicit am/pm suffix, a colon, or a leading "at" — so
 * an ordinary bare number in the title (e.g. "ch 11") is never mistaken for a
 * time. Tried most-explicit-first so "3:30pm" isn't partially consumed by the
 * bare-colon branch.
 */
function matchTimeOfDay(input: string): { hour: number; minute: number; rest: string } | null {
  // "3pm" / "3 pm" / "3:30pm".
  let m = /\b(\d{1,2})(?::([0-5]\d))?\s*(am|pm)\b/i.exec(input)
  if (m) {
    let hour = parseInt(m[1], 10) % 12
    if (/pm/i.test(m[3])) hour += 12
    const minute = m[2] ? parseInt(m[2], 10) : 0
    if (hour > 23) return null
    return { hour, minute, rest: stripMatch(input, m) }
  }

  // 24-hour "15:00".
  m = /\b([01]?\d|2[0-3]):([0-5]\d)\b/.exec(input)
  if (m) {
    return { hour: parseInt(m[1], 10), minute: parseInt(m[2], 10), rest: stripMatch(input, m) }
  }

  // "at 3" — bare hour, no am/pm, taken as-is (24h).
  m = /\bat\s+(\d{1,2})\b/i.exec(input)
  if (m) {
    const hour = parseInt(m[1], 10)
    if (hour > 23) return null
    return { hour, minute: 0, rest: stripMatch(input, m) }
  }

  return null
}

// ---------------------------------------------------------------------------
// Title cleanup
// ---------------------------------------------------------------------------

/**
 * Two or more separators — comma, semicolon, colon — in a row, with only
 * whitespace between them, collapse to the first one. This is what a token
 * removed from BETWEEN two separators leaves behind, and it can happen
 * anywhere in the string, not just at the edges: "Bio, due Friday, 2h"
 * strips "due Friday" and "2h" and leaves "Bio,  ," (the comma that was
 * already after "Bio" plus the comma that was already after "Friday", with
 * the removed text between them) — this collapses it back to the single
 * "," it grew from. It fires just as well mid-string with real title text
 * on both sides: "Call mom, due tomorrow, then buy milk" strips "tomorrow"
 * to "Call mom,  , then buy milk", which collapses to "Call mom, then buy
 * milk" — one separator still joining two real clauses. A single separator
 * with real text on both sides never matches — nothing here to collapse.
 */
const DOUBLED_SEPARATOR_RE = /([,;:])(?:\s*[,;:])+/g

/**
 * A lone separator left dangling right at the start or end once nothing
 * real remains on that side (e.g. a trailing "#list" tag strips to a bare
 * trailing comma — never doubled, so DOUBLED_SEPARATOR_RE above doesn't
 * touch it). Runs after DOUBLED_SEPARATOR_RE so a collapsed run is already
 * down to one character by the time this checks the edges, and after
 * DANGLING_RE so a stopword trimmed off the edge can expose a separator
 * that was hiding behind it.
 */
const EDGE_SEPARATOR_RE = /^\s*[,;:]\s*|\s*[,;:]\s*$/g

/** Trailing/leading dangling stopwords left over after tokens are stripped. */
const DANGLING_RE = /^(?:\s*\b(?:due|at|for|by|on)\b\s*)+|(?:\s*\b(?:due|at|for|by|on)\b\s*)+$/gi

/**
 * Final cleanup of whatever text remains after every token has been
 * stripped out of the input. Order matters: collapse doubled separators
 * first (anywhere in the string), then trim dangling stopwords off the
 * edges, then trim a lone separator off the edges (catches both the
 * pre-existing lone-trailing-separator case and any separator a stopword
 * trim just exposed), then normalize whitespace.
 */
function cleanTitle(input: string): string {
  return input
    .replace(DOUBLED_SEPARATOR_RE, '$1')
    .replace(DANGLING_RE, '')
    .replace(EDGE_SEPARATOR_RE, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Parse a quick-add line into a task draft. Deterministic given `now` (epoch
 * ms). Tokens are stripped in list -> priority -> duration -> due -> time-of-
 * day -> "due" stopword order; the remainder (cleaned of dangling stopwords)
 * is the title.
 */
export function parseQuickAdd(input: string, now: number): QuickAddResult {
  let rest = input

  const result: QuickAddResult = { title: '' }

  // List (#hashtag).
  const listMatch = LIST_RE.exec(rest)
  if (listMatch) {
    result.list = listMatch[1]
    rest = stripMatch(rest, listMatch)
  }

  // Priority.
  const pMatch = PRIORITY_RE.exec(rest)
  if (pMatch) {
    result.priority = PRIORITY_VALUE[pMatch[1].toLowerCase()]
    // Sigil-aware: "!high" strips the leading "!" along with the word.
    rest = stripMatchWithSigil(rest, pMatch, '!')
  }

  // Duration.
  const dMatch = DURATION_RE.exec(rest)
  if (dMatch) {
    result.durationMin = durationToMinutes(parseFloat(dMatch[1]), dMatch[2])
    rest = stripMatch(rest, dMatch)
  }

  // Due date.
  const dueMatch = matchDue(rest, now)
  if (dueMatch) {
    result.due = dueMatch.due
    rest = dueMatch.rest
  }

  // Time of day — combines with the date just resolved above (overriding its
  // default 23:59 with the parsed clock time) or, if no date token was
  // present, applies to today.
  const timeMatch = matchTimeOfDay(rest)
  if (timeMatch) {
    const base = result.due ?? now
    const d = new Date(base)
    d.setHours(timeMatch.hour, timeMatch.minute, 0, 0)
    result.due = d.getTime()
    rest = timeMatch.rest
  }

  // Strip a leftover standalone "due" stopword (e.g. "due fri" -> "fri" was
  // consumed as the date, leaving "due").
  rest = rest.replace(/\bdue\b/gi, ' ')

  result.title = cleanTitle(rest)
  return result
}
