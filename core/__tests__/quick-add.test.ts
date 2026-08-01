import { describe, expect, it } from 'vitest'
import { nextWeekday, parseQuickAdd } from '@/core/quick-add'
import { mondayAt } from './helpers/fixtures'

const now = mondayAt(8) // Monday 2026-01-05, 08:00 local

function endOfDay(d: Date): number {
  const c = new Date(d)
  c.setHours(23, 59, 0, 0)
  return c.getTime()
}

describe('quick-add: title extraction (no tokens)', () => {
  it('a plain line with no recognizable tokens is the title verbatim (trimmed)', () => {
    expect(parseQuickAdd('Buy groceries', now)).toEqual({ title: 'Buy groceries' })
  })
})

describe('quick-add: priority', () => {
  it.each([
    ['urgent', 4],
    ['high', 3],
    ['medium', 2],
    ['med', 2],
    ['low', 1],
  ] as const)('recognizes the priority word "%s" -> %d', (word, value) => {
    const result = parseQuickAdd(`Read book ${word}`, now)
    expect(result.priority).toBe(value)
    expect(result.title).toBe('Read book')
  })

  it('is case-insensitive', () => {
    expect(parseQuickAdd('Read book HIGH', now).priority).toBe(3)
  })
})

describe('quick-add: duration', () => {
  it.each([
    ['2h', 120],
    ['2hr', 120],
    ['2hrs', 120],
    ['2 hours', 120],
    ['1.5h', 90],
    ['30m', 30],
    ['30min', 30],
    ['30 minutes', 30],
    ['45mins', 45],
  ] as const)('recognizes duration token "%s" -> %d minutes', (token, mins) => {
    const result = parseQuickAdd(`Study ${token}`, now)
    expect(result.durationMin).toBe(mins)
    expect(result.title).toBe('Study')
  })
})

describe('quick-add: due dates', () => {
  it('"today" / "tonight" -> end of today', () => {
    const expected = endOfDay(new Date(now))
    expect(parseQuickAdd('Clean room today', now).due).toBe(expected)
    expect(parseQuickAdd('Clean room tonight', now).due).toBe(expected)
  })

  it('"tomorrow" / "tmrw" -> end of tomorrow', () => {
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const expected = endOfDay(tomorrow)
    expect(parseQuickAdd('Finish essay tomorrow', now).due).toBe(expected)
    expect(parseQuickAdd('Finish essay tmrw', now).due).toBe(expected)
  })

  it('"in N days" -> end of day N days out', () => {
    const target = new Date(now)
    target.setDate(target.getDate() + 3)
    expect(parseQuickAdd('Study for exam in 3 days', now).due).toBe(endOfDay(target))
  })

  it('"in N weeks" -> N*7 days out', () => {
    const target = new Date(now)
    target.setDate(target.getDate() + 14)
    expect(parseQuickAdd('Plan trip in 2 weeks', now).due).toBe(endOfDay(target))
  })

  it('a bare weekday resolves to the next occurrence of that day', () => {
    // now is Monday; "fri" should resolve to THIS week's Friday (4 days out).
    const friday = new Date(now)
    friday.setDate(friday.getDate() + 4)
    expect(parseQuickAdd('Read ch 11 due fri', now).due).toBe(endOfDay(friday))
  })

  it('naming today\'s own weekday resolves to today (not next week)', () => {
    // now is Monday; "mon" should resolve to today.
    expect(parseQuickAdd('Standup mon', now).due).toBe(endOfDay(new Date(now)))
  })

  it('"next <weekday>" pushes to the following week', () => {
    const plainFriday = nextWeekday(now, 5)
    const result = parseQuickAdd('Submit report due next friday', now)
    expect(result.due).toBeGreaterThan(plainFriday)
  })

  it('numeric M/D resolves within the current year when the date is still ahead', () => {
    // now = Jan 5 2026; 1/15 is later this same year.
    const result = parseQuickAdd('Call mom due 1/15', now)
    const d = new Date(result.due!)
    expect(d.getMonth()).toBe(0) // January
    expect(d.getDate()).toBe(15)
    expect(d.getFullYear()).toBe(2026)
  })

  it('numeric M/D in the past this year rolls over to next year', () => {
    // now = Jan 5 2026; 1/1 has already passed this year.
    const result = parseQuickAdd('New year resolution due 1/1', now)
    const d = new Date(result.due!)
    expect(d.getFullYear()).toBe(2027)
  })

  it('numeric M/D/YY resolves the explicit year, no rollover', () => {
    const result = parseQuickAdd('Old task due 1/1/25', now)
    const d = new Date(result.due!)
    expect(d.getFullYear()).toBe(2025)
  })
})

describe('quick-add: combined / real-world lines', () => {
  it('"Read ch 11 due fri 2h high" extracts all four fields and a clean title', () => {
    const result = parseQuickAdd('Read ch 11 due fri 2h high', now)
    expect(result.title).toBe('Read ch 11')
    expect(result.priority).toBe(3)
    expect(result.durationMin).toBe(120)
    const friday = new Date(now)
    friday.setDate(friday.getDate() + 4)
    expect(result.due).toBe(endOfDay(friday))
  })

  it('"Submit report due next friday high 1.5h" extracts all fields regardless of token order', () => {
    const result = parseQuickAdd('Submit report due next friday high 1.5h', now)
    expect(result.title).toBe('Submit report')
    expect(result.priority).toBe(3)
    expect(result.durationMin).toBe(90)
    expect(result.due).toBeGreaterThan(now)
  })

  it('the "due" stopword itself never leaks into the title', () => {
    const result = parseQuickAdd('Call mom due tomorrow', now)
    expect(result.title).toBe('Call mom')
  })
})

describe('quick-add: PRD §9.6 coverage (previously-documented gaps, now implemented)', () => {
  // PRD §9.6: "Parse a typed line into {title, duration, due, list, priority,
  // recurrence}". These three cases were once real gaps between that spec and
  // the parser (core/quick-add.ts), deliberately left FAILING as findings
  // rather than weakened or deleted. All three have since been implemented —
  // time-of-day parsing (`matchTimeOfDay`), "#list" hashtag extraction
  // (`LIST_RE` + the `list` field on `QuickAddResult`), and sigil-aware
  // stripping for punctuation markers like "!high" (`stripMatchWithSigil`) —
  // so these now pass and are kept as regression coverage. Assertions
  // unchanged from when they were written as failing findings.

  it('a clock time alongside a relative day ("tomorrow 3pm") sets a specific due time and does not leak into the title — matchTimeOfDay combines with the date resolved from "tomorrow"', () => {
    const result = parseQuickAdd('tomorrow 3pm', now)
    // Per PRD §9.6 (a fully-parsed line leaves nothing behind for the title):
    // title is empty and due carries the 15:00 time.
    expect(result.title).toBe('')
    const tomorrow3pm = new Date(now)
    tomorrow3pm.setDate(tomorrow3pm.getDate() + 1)
    tomorrow3pm.setHours(15, 0, 0, 0)
    expect(result.due).toBe(tomorrow3pm.getTime())
  })

  it('a "#list" token is extracted into a list field and stripped from the title — LIST_RE plus the list field on QuickAddResult', () => {
    const result = parseQuickAdd('Read ch1 #biology', now) as unknown as { title: string; list?: string }
    expect(result.list).toBe('biology')
    expect(result.title).toBe('Read ch1')
  })

  it('"!high"-style punctuation priority markers do not leave stray punctuation behind in the title — stripMatchWithSigil absorbs the leading "!" along with the matched word', () => {
    const result = parseQuickAdd('read book !high', now)
    expect(result.priority).toBe(3)
    expect(result.title).toBe('read book')
  })
})

describe('quick-add: dangling separator cleanup', () => {
  // A token stripped from the MIDDLE of the input (between two separators,
  // or between a separator and the edge) used to leave the separator(s)
  // behind: stripMatch only collapses whitespace, and the old DANGLING_RE
  // only matched stopwords anchored at the very start/end of the whole
  // string, so it could neither see punctuation nor reach mid-string.

  it.each([
    ['Read Chapter 11 for Bio, due Friday, 2h', 'Read Chapter 11 for Bio'],
    ['Read ch 11, due Friday, 2h high', 'Read ch 11'],
    ['Essay, 2h, !high', 'Essay'],
    ['Lab report; due tomorrow; 90m', 'Lab report'],
    ['Study #bio, due friday', 'Study'],
  ] as const)('"%s" -> clean title "%s"', (input, expected) => {
    expect(parseQuickAdd(input, now).title).toBe(expected)
  })

  it('a leading token (due-date at the very front) leaves no dangling comma either', () => {
    // Same fields as the first case above, reordered so the removed token
    // sits at the START instead of buried in the middle.
    const result = parseQuickAdd('due Friday, Read ch 11, 2h', now)
    expect(result.title).toBe('Read ch 11')
  })

  it('a token removed from the middle collapses a doubled separator back to ONE, not zero, when real text remains on both sides', () => {
    // Distinct from the cases above: here the collapsed separator is not
    // trailing garbage to delete, it is the join between two real clauses
    // and must survive as a single comma.
    const result = parseQuickAdd('Call mom, due tomorrow, then buy milk', now)
    expect(result.title).toBe('Call mom, then buy milk')
  })

  it('reordering priority to the front still cleans up the trailing separator left by duration', () => {
    const result = parseQuickAdd('high, Essay, 2h', now)
    expect(result.priority).toBe(3)
    expect(result.durationMin).toBe(120)
    expect(result.title).toBe('Essay')
  })

  it('does not overreach: a legitimate internal comma with no stripped token nearby survives untouched', () => {
    const result = parseQuickAdd('Read ch 11, then review notes', now)
    expect(result.title).toBe('Read ch 11, then review notes')
  })

  it('does not overreach: a legitimate colon in the title survives untouched', () => {
    const result = parseQuickAdd('Lab: write up results', now)
    expect(result.title).toBe('Lab: write up results')
  })
})
