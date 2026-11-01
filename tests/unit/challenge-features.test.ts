import { describe, expect, it } from 'vitest'
import { samples, type PlanInput, type Task } from '@/lib/schemas'
import { previewVersion } from '@/lib/domain/baseline'
import { runScenario } from '@/lib/domain/scenarios'
import { allTasks, taskPriority } from '@/lib/domain/timeline'
import { clock, dayOfSchedule } from '@/lib/domain/dayof'
import { toIcs } from '@/lib/domain/calendar'
import { customVendor, patchVendor, quoteCheck } from '@/lib/domain/vendors'
import { applyAction, mergeProgress } from '@/lib/domain/actions'

// The brief's required features beyond the core plan: task priority labels, reminders, a day-of schedule, and a
// vendor checklist where users add vendors, record contacts and track quotes.

const TODAY = '2026-11-01'
const wedding: PlanInput = { ...samples.wedding, planningStart: TODAY }
const task = (patch: Partial<Task>): Task => ({ id: 'wedding-5', title: 'Book music and sound', dueLabel: 'By 1 Jan 2027', done: false, tags: [], offsetDays: 45, ...patch })

describe('task priority labels', () => {
  it('ranks from the user context, always with a reason', () => {
    expect(taskPriority(task({ dueLabel: 'ASAP' }), wedding)).toEqual({ level: 'high', reason: 'Due now' })
    expect(taskPriority(task({ tags: ['Catering'] }), wedding)).toEqual({ level: 'high', reason: 'Your priority: Catering' })
    expect(taskPriority(task({ id: 'needs-diet' }), wedding)).toEqual({ level: 'high', reason: 'A guest need' })
    expect(taskPriority(task({ title: 'Book the venue', offsetDays: 270 }), wedding)).toEqual({ level: 'high', reason: 'Books out early' })
    expect(taskPriority(task({ offsetDays: 0 }), wedding).level).toBe('low')
    expect(taskPriority(task({}), wedding)).toEqual({ level: 'medium', reason: '' })
  })

  it('changes when the user reprioritizes', () => {
    const music = task({ tags: ['Music and sound'] })
    expect(taskPriority(music, wedding).level).toBe('medium')
    expect(taskPriority(music, { ...wedding, priorities: ['Music and sound'] }).level).toBe('high')
  })
})

describe('day-of run sheet', () => {
  it('formats a 12-hour clock without Intl and wraps around midnight', () => {
    expect(clock(0)).toBe('12:00 am')
    expect(clock(13 * 60 + 5)).toBe('1:05 pm')
    expect(clock(-30)).toBe('11:30 pm')
  })

  it('is ordered, starts from when guests arrive, and follows the start time', () => {
    const items = dayOfSchedule(wedding)
    expect(items.map((i) => i.at)).toEqual([...items.map((i) => i.at)].sort((a, b) => a - b))
    expect(items.find((i) => i.title.startsWith('Guests arrive'))?.time).toBe('5:00 pm')
    expect(dayOfSchedule(wedding, '18:30').find((i) => i.title.startsWith('Guests arrive'))?.time).toBe('6:30 pm')
  })

  it('adds steps for needs and priorities', () => {
    const titles = (i: PlanInput) => dayOfSchedule(i).map((x) => x.title).join(' | ')
    expect(titles(wedding)).toMatch(/Golden-hour portraits/) // Photo and video is a sample priority
    expect(titles(wedding)).not.toMatch(/ramps/)
    expect(titles({ ...wedding, accessibility: true, diet: ['Jain'] })).toMatch(/ramps.*\|.*Label the jain dishes/)
    expect(titles(samples.community)).toMatch(/help desk/) // 250 guests
  })
})

describe('calendar reminders (.ics)', () => {
  const v = previewVersion(wedding, TODAY)
  const tasks = allTasks(v.phases)
  const ics = toIcs({ input: wedding, tasks, today: TODAY, stamp: '20261101T100000Z', uid: 'abc' })
  const lines = ics.split('\r\n')

  it('is a valid calendar: CRLF, folded lines, one event per open task plus the event day', () => {
    expect(lines[0]).toBe('BEGIN:VCALENDAR')
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(lines.every((l) => l.length <= 75)).toBe(true)
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(tasks.length + 1)
    expect(ics).toContain('DTSTART;VALUE=DATE:20270214')
    expect(ics).toContain('TRIGGER:-PT15H')
  })

  it('puts overdue tasks on today, skips done tasks, and escapes text', () => {
    // The 300-day task was due before today, so it lands on today.
    expect(ics).toMatch(/UID:abc-wedding-0@soiree\r\nDTSTAMP:20261101T100000Z\r\nDTSTART;VALUE=DATE:20261101/)
    const done = toIcs({ input: wedding, tasks: tasks.map((t) => ({ ...t, done: true })), today: TODAY, stamp: 'x', uid: 'abc' })
    expect(done.match(/BEGIN:VEVENT/g)).toHaveLength(1)
    const odd = toIcs({ input: { ...wedding, title: 'A; B, C' }, tasks: [], today: TODAY, stamp: 'x', uid: 'abc' })
    expect(odd).toContain('SUMMARY:A\\; B\\, C')
  })
})

describe('vendor checklist: your own vendors, contacts and quotes', () => {
  const v = previewVersion(wedding, TODAY)
  const catering = v.vendors.find((x) => x.category === 'Catering')!

  it('patches whitelisted fields; empty strings and a null quote clear them', () => {
    const a = patchVendor(catering, { name: 'Spice Route', contact: 'hello@example.com', quote: 90000, status: 'quote_received' })
    expect(a).toMatchObject({ name: 'Spice Route', contact: 'hello@example.com', quote: 90000, status: 'quote_received' })
    const b = patchVendor(a, { contact: '', quote: null })
    expect(b.contact).toBeUndefined()
    expect(b.quote).toBeUndefined()
    expect(b.name).toBe('Spice Route')
  })

  it('compares a quote with the planning range', () => {
    expect(quoteCheck(catering)).toBeNull()
    expect(quoteCheck({ ...catering, quote: catering.estHigh + 1 })).toBe('over')
    expect(quoteCheck({ ...catering, quote: catering.estLow })).toBe('within')
    expect(quoteCheck({ ...catering, quote: catering.estLow - 1 })).toBe('under')
    expect(quoteCheck({ ...catering, estLow: 0, estHigh: 0, quote: 5 })).toBeNull()
  })

  it('adds vendors with deterministic ids that borrow the category range', () => {
    const one = customVendor(v, 'Catering', 'Second caterer')
    expect(one).toMatchObject({ id: 'custom-1', custom: true, estLow: catering.estLow, estHigh: catering.estHigh, name: 'Second caterer' })
    const after = applyAction(wedding, v, { type: 'vendor-add', category: 'Other' }).version
    expect(after.vendors.at(-1)).toMatchObject({ id: 'custom-1', estHigh: 0 })
    expect(customVendor(after, 'Catering').id).toBe('custom-2')
    // Only vendors the user added can be removed.
    expect(applyAction(wedding, after, { type: 'vendor-remove', id: 'custom-1' }).version.vendors).toHaveLength(v.vendors.length)
    expect(applyAction(wedding, after, { type: 'vendor-remove', id: catering.id }).version.vendors).toHaveLength(v.vendors.length + 1)
  })

  it('keeps records and added vendors when a what-if is applied', () => {
    const draft = runScenario(wedding, v, { kind: 'budget_change', value: -10 }).draft
    let cur = applyAction(wedding, v, { type: 'vendor', id: catering.id, patch: { quote: 70000, contact: '98 7654 3210' } }).version
    cur = applyAction(wedding, cur, { type: 'vendor-add', category: 'Catering', name: 'Backup caterer' }).version
    const merged = mergeProgress(cur, draft)
    expect(merged.vendors.find((x) => x.id === catering.id)).toMatchObject({ quote: 70000, contact: '98 7654 3210' })
    // The added vendor survives and takes the new (cut) planning range.
    const added = merged.vendors.find((x) => x.id === 'custom-1')
    const line = merged.lines.find((l) => l.category === 'Catering')!
    expect(added).toMatchObject({ name: 'Backup caterer', estHigh: Math.round(line.amount * 1.15) })
  })

  it('a cancelled venue does not carry the old venue contact or quote to the replacement', () => {
    const cur = { ...v, vendors: v.vendors.map((x) => (x.category === 'Venue and rentals' ? { ...x, status: 'booked' as const, contact: 'old', quote: 1 } : x)) }
    const r = runScenario(wedding, cur, { kind: 'venue_cancelled', today: TODAY })
    const venue = r.draft.vendors.find((x) => x.category === 'Venue and rentals')
    expect(venue).toMatchObject({ status: 'not_started' })
    expect(venue?.contact).toBeUndefined()
    expect(venue?.quote).toBeUndefined()
  })
})
