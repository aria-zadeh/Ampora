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
 * remains, trimmed of dangling stopwords, is the title.
 */

export interface QuickAddResult {
  title: string
  /** Epoch ms deadline, when a date token was recognized. */
  due?: number
  /** Duration in minutes, when a "2h" / "30m" style token was recognized. */
  durationMin?: number
  /** 1=Low, 2=Medium, 3=High, 4=Urgent, when a priority word was recognized. */
  priority?: number
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
// Title cleanup
// ---------------------------------------------------------------------------

/** Trailing/leading dangling stopwords left over after tokens are stripped. */
const DANGLING_RE = /^(?:\s*\b(?:due|at|for|by|on)\b\s*)+|(?:\s*\b(?:due|at|for|by|on)\b\s*)+$/gi

function cleanTitle(input: string): string {
  return input.replace(DANGLING_RE, '').replace(/\s+/g, ' ').trim()
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Parse a quick-add line into a task draft. Deterministic given `now` (epoch
 * ms). Tokens are stripped in priority -> duration -> due -> "due" stopword
 * order; the remainder (cleaned of dangling stopwords) is the title.
 */
export function parseQuickAdd(input: string, now: number): QuickAddResult {
  let rest = input

  const result: QuickAddResult = { title: '' }

  // Priority.
  const pMatch = PRIORITY_RE.exec(rest)
  if (pMatch) {
    result.priority = PRIORITY_VALUE[pMatch[1].toLowerCase()]
    rest = stripMatch(rest, pMatch)
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

  // Strip a leftover standalone "due" stopword (e.g. "due fri" -> "fri" was
  // consumed as the date, leaving "due").
  rest = rest.replace(/\bdue\b/gi, ' ')

  result.title = cleanTitle(rest)
  return result
}
