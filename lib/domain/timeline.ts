import type { EventType, Phase, PlanInput, Task } from '../schemas'
import { addDays, shortDate } from '../format'
import { slugId } from './templates'

type TaskSeed = { id: string; title: string; offset?: number; tags?: string[] }
type SeedTemplate = Omit<TaskSeed, 'id'> & { offset: number }

const taskTemplates: Record<EventType, SeedTemplate[]> = {
  wedding: [
    { title: 'Set the guest list and the budget', offset: 300 },
    { title: 'Book the venue', offset: 270, tags: ['Venue and rentals'] },
    { title: 'Book photo and video', offset: 240, tags: ['Photo and video'] },
    { title: 'Shortlist caterers and schedule tastings', offset: 180, tags: ['Catering'] },
    { title: 'Send save-the-dates', offset: 150 },
    { title: 'Book music and sound', offset: 120, tags: ['Music and sound'] },
    { title: 'Confirm the decor and flower plan', offset: 90, tags: ['Decor and flowers'] },
    { title: 'Send invitations', offset: 60 },
    { title: 'Confirm the final guest count with catering', offset: 30, tags: ['Catering'] },
    { title: 'Share the day-of timeline with every vendor', offset: 14 },
    { title: 'Pay final balances and confirm arrival times', offset: 7 },
    { title: 'Hand the timeline to a trusted friend and enjoy the day', offset: 0 },
  ],
  birthday: [
    { title: 'Pick the venue and lock the date', offset: 60, tags: ['Venue'] },
    { title: 'Send invitations', offset: 45 },
    { title: 'Book entertainment', offset: 30, tags: ['Entertainment'] },
    { title: 'Plan the menu', offset: 21, tags: ['Food and cake'] },
    { title: 'Order the cake', offset: 21, tags: ['Food and cake'] },
    { title: 'Choose decor and a color story', offset: 14, tags: ['Decor'] },
    { title: 'Order return gifts', offset: 10, tags: ['Return gifts'] },
    { title: 'Confirm the guest count with the venue', offset: 3, tags: ['Venue'] },
    { title: 'Set up early and enjoy the party', offset: 0 },
  ],
  community: [
    { title: 'Apply for permits', offset: 90, tags: ['Permits'] },
    { title: 'Recruit volunteer leads', offset: 75, tags: ['Volunteers'] },
    { title: 'Book sound and stage', offset: 60, tags: ['Sound and stage'] },
    { title: 'Launch promotion: posters, groups, and local pages', offset: 45, tags: ['Promotion and reach'] },
    { title: 'Confirm food stalls or caterers', offset: 30, tags: ['Food'] },
    { title: 'Brief volunteers and assign shifts', offset: 21, tags: ['Volunteers'] },
    { title: 'Run a second promotion push', offset: 14, tags: ['Promotion and reach'] },
    { title: 'Walk the site and confirm the layout', offset: 7 },
    { title: 'Open the gates and welcome your neighbors', offset: 0 },
  ],
}

// Extra wedding steps when the notes or vibes describe a multi-day or traditional celebration.
const multiDay: TaskSeed[] = [
  { id: 'wedding-multi-0', title: 'Plan the schedule for each day of the celebration', offset: 120 },
  { id: 'wedding-multi-1', title: 'Arrange rooms and travel for out-of-town guests', offset: 90 },
]
const traditional: TaskSeed[] = [
  { id: 'wedding-trad-0', title: 'Confirm the officiant and ceremony rituals with both families', offset: 150 },
  { id: 'wedding-trad-1', title: 'Book fittings for traditional outfits', offset: 60 },
]

const DIET_WORDS = /\b(halal|jain|vegetarian|vegan|kosher|gluten[- ]free|nut[- ]free|allerg\w*)\b/gi

/** Needs found in the wizard fields or the notes become tasks, so they are never forgotten. */
function needSeeds(input: PlanInput): TaskSeed[] {
  const notes = input.notes ?? ''
  const seeds: TaskSeed[] = []
  if (input.accessibility || /step[- ]free|wheelchair|ramp/i.test(notes))
    seeds.push({ id: 'needs-access', title: 'Confirm step-free access and accessible restrooms', offset: 30 })
  const diet = [...new Set([...input.diet, ...(notes.match(DIET_WORDS) ?? [])].map((d) => d.toLowerCase()))]
  if (diet.length) seeds.push({ id: 'needs-diet', title: `Confirm ${diet.join(', ')} options with food vendors`, offset: 30 })
  if (/sign language|interpreter|deaf|hard of hearing/i.test(notes))
    seeds.push({ id: 'needs-sign', title: 'Book a sign language interpreter and reserve clear sightlines', offset: 45 })
  if (/sensory|autis|quiet (room|space|corner)|neurodivergent/i.test(notes))
    seeds.push({ id: 'needs-sensory', title: 'Set up a quiet, low-light space and share a sensory-friendly schedule', offset: 14 })
  return seeds
}

/** Every task seed for a plan, with ids from the template index (never from the phase). */
export function taskSeeds(input: PlanInput): TaskSeed[] {
  const seeds: TaskSeed[] = taskTemplates[input.eventType].map((t, n) => ({ ...t, id: `${input.eventType}-${n}` }))
  if (input.eventType === 'wedding') {
    const text = `${input.notes ?? ''} ${input.vibes.join(' ')}`
    if (/multi[- ]?day|two[- ]day|three[- ]day|several days|weekend/i.test(text)) seeds.push(...multiDay)
    if (/traditional|mehendi|mehndi|sangeet|haldi|ritual|ceremony/i.test(text)) seeds.push(...traditional)
  }
  return [...seeds, ...needSeeds(input)]
}

const phaseFor = (offset: number) =>
  offset >= 270 ? '12 months out' : offset >= 150 ? '6 months out' : offset >= 60 ? '3 months out'
    : offset >= 8 ? '1 month out' : offset >= 1 ? 'Final week' : 'Day of'
const PHASE_ORDER = ['This week', '12 months out', '6 months out', '3 months out', '1 month out', 'Final week', 'Day of']
const URGENT = Number.MAX_SAFE_INTEGER

/**
 * Bucket tasks into date-aware phases. Overdue tasks, and tasks without an offset, move to "This week" as ASAP.
 * Ids, titles and progress are kept, so re-bucketing after a date change loses nothing.
 */
export function toPhases(tasks: Task[], date: string, today: string): Phase[] {
  const buckets = new Map<string, Task[]>()
  const ordered = [...tasks].sort((a, b) => (b.offsetDays ?? URGENT) - (a.offsetDays ?? URGENT))
  for (const t of ordered) {
    const o = t.offsetDays
    const due = o === undefined ? today : addDays(date, -o)
    let label = 'This week'
    let dueLabel = 'ASAP'
    if (o !== undefined && !(o > 0 && due < today)) {
      label = phaseFor(o)
      dueLabel = o === 0 ? 'On the day' : `By ${shortDate(due)}`
    }
    buckets.set(label, [...(buckets.get(label) ?? []), { ...t, dueLabel }])
  }
  return PHASE_ORDER.filter((l) => buckets.has(l)).map((label) => ({ id: slugId(label), label, tasks: buckets.get(label) ?? [] }))
}

/** All tasks of a plan, in phase order. */
export const allTasks = (phases: Phase[]) => phases.flatMap((p) => p.tasks)

export type TaskPriority = 'high' | 'medium' | 'low'

// Bookings that sell out months ahead; everything else waits on them.
const BOOKS_EARLY = /\b(venue|permits?|photo|officiant)\b/i

/**
 * Priority label for a task, decided from the user's context, with the reason shown next to it (so the label is
 * never colour alone): due now (overdue, or a short lead time), tied to a ranked priority, a guest need, or a
 * booking that sells out early.
 */
export function taskPriority(t: Task, input: PlanInput): { level: TaskPriority; reason: string } {
  if (t.dueLabel === 'ASAP' && !t.done) return { level: 'high', reason: 'Due now' }
  const tied = t.tags?.find((tag) => input.priorities.includes(tag))
  if (tied) return { level: 'high', reason: `Your priority: ${tied}` }
  if (t.id.startsWith('needs-')) return { level: 'high', reason: 'A guest need' }
  if (BOOKS_EARLY.test(t.title) && (t.offsetDays ?? 0) >= 60) return { level: 'high', reason: 'Books out early' }
  if (t.offsetDays === 0) return { level: 'low', reason: 'On the day' }
  return { level: 'medium', reason: '' }
}

export type TimelinePersonalization = {
  renames?: Record<string, string>
  additions?: { title: string; offsetDays: number; tags?: string[] }[]
}

/** Date-aware phases from the templates, optionally personalized (renames keep ids; additions get `note-{n}`). */
export function buildPhases(input: PlanInput, today: string, personal: TimelinePersonalization = {}): Phase[] {
  const tasks: Task[] = taskSeeds(input).map((s) => ({
    id: s.id, title: personal.renames?.[s.id] ?? s.title, dueLabel: '', done: false, tags: s.tags ?? [], offsetDays: s.offset,
  }))
  ;(personal.additions ?? []).forEach((a, n) =>
    tasks.push({ id: `note-${n}`, title: a.title, dueLabel: '', done: false, tags: a.tags ?? [], offsetDays: a.offsetDays }),
  )
  return toPhases(tasks, input.date, today)
}
