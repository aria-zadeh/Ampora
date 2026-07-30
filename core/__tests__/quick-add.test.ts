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

describe('quick-add: PRD §9.6 gaps (documented, not fixed)', () => {
  // PRD §9.6: "Parse a typed line into {title, duration, due, list, priority,
  // recurrence}". The following are real gaps between that spec and the
  // current parser (core/quick-add.ts). Per task instructions these are left
  // FAILING rather than weakened, so they surface as findings.

  it('a clock time alongside a relative day ("tomorrow 3pm") should set a specific due time and not leak into the title — currently unsupported: no time-of-day parsing exists at all, so "3pm" is left as literal title text', () => {
    const result = parseQuickAdd('tomorrow 3pm', now)
    // What SHOULD happen per PRD §9.6 (a fully-parsed line leaves nothing
    // behind for the title): title is empty and due carries the 15:00 time.
    expect(result.title).toBe('')
    const tomorrow3pm = new Date(now)
    tomorrow3pm.setDate(tomorrow3pm.getDate() + 1)
    tomorrow3pm.setHours(15, 0, 0, 0)
    expect(result.due).toBe(tomorrow3pm.getTime())
  })

  it('a "#list" token should be extracted into a list field and stripped from the title — currently unsupported: no list/hashtag parsing exists, QuickAddResult has no `list` field, and the token is left verbatim in the title', () => {
    const result = parseQuickAdd('Read ch1 #biology', now) as unknown as { title: string; list?: string }
    expect(result.list).toBe('biology')
    expect(result.title).toBe('Read ch1')
  })

  it('"!high"-style punctuation priority markers should not leave stray punctuation behind in the title', () => {
    // The word-boundary regex DOES recognize "high" inside "!high" (a nice
    // accident), but stripMatch only removes the word "high", leaving the
    // leading "!" as dangling punctuation in the title.
    const result = parseQuickAdd('read book !high', now)
    expect(result.priority).toBe(3) // this part already works
    expect(result.title).toBe('read book') // BUG: actually "read book !"
  })
})
