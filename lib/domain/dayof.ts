import type { EventType, PlanInput } from '../schemas'

/** One line of the day-of run sheet. `time` is a 12-hour clock label, `at` minutes after midnight (for sorting). */
type RunSheetItem = { at: number; time: string; title: string }

type Slot = [offsetMin: number, title: string]

/** When guests usually arrive, per event type (24-hour "HH:MM"). The run sheet is relative to this. */
export const defaultStart: Record<EventType, string> = {
  wedding: '17:00',
  birthday: '19:00',
  community: '10:00',
}

// Offsets in minutes from guest arrival. Setup steps are negative.
const slots: Record<EventType, Slot[]> = {
  wedding: [
    [-360, 'Venue opens: decor and rentals go up'],
    [-300, 'Caterer arrives and checks the kitchen'],
    [-240, 'Hair and makeup begin'],
    [-120, 'Sound check; photographer arrives'],
    [-60, 'Family photos'],
    [0, 'Guests arrive; welcome drinks'],
    [45, 'Ceremony'],
    [120, 'Dinner is served'],
    [195, 'Toasts and first dance'],
    [300, 'Send-off'],
    [330, 'Vendors pack up; settle final balances'],
  ],
  birthday: [
    [-180, 'Decor and balloons go up'],
    [-90, 'Cake and food arrive'],
    [-30, 'Playlist and lighting check'],
    [0, 'Guests arrive'],
    [60, 'Entertainment begins'],
    [120, 'Cake cutting and a toast'],
    [150, 'Return gifts at the door'],
    [210, 'Wrap up and clean up'],
  ],
  community: [
    [-240, 'Volunteer leads arrive and walk the site'],
    [-180, 'Stalls and stage go up; keep permit copies on site'],
    [-60, 'Sound check; brief volunteers on their shifts'],
    [0, 'Gates open'],
    [60, 'Welcome from the stage'],
    [120, 'Peak hour: food stalls and activities'],
    [300, 'Closing announcement'],
    [330, 'Teardown and litter sweep'],
  ],
}

/** Steps added from the user's own context: needs, priorities and size. */
function contextSlots(input: PlanInput): Slot[] {
  const extra: Slot[] = []
  if (input.accessibility)
    extra.push([-45, 'Check ramps, accessible seating and restrooms are clear'])
  if (input.diet.length)
    extra.push([
      -20,
      `Label the ${input.diet.join(', ').toLowerCase()} dishes and brief the servers`,
    ])
  if (input.eventType === 'wedding' && input.priorities.includes('Photo and video'))
    extra.push([75, 'Golden-hour portraits with the photographer'])
  if (input.eventType === 'birthday' && input.priorities.includes('Entertainment'))
    extra.push([90, 'Second entertainment set or group game'])
  if (input.eventType === 'community' && input.guestCount >= 200)
    extra.push([-15, 'Open the help desk and lost-and-found'])
  return extra
}

const toMinutes = (hhmm: string) => {
  const [h = '0', m = '0'] = hhmm.split(':')
  return (Number(h) * 60 + Number(m)) % 1440
}

/** "5:00 pm". Deterministic, no Intl, so server and browser agree. */
export function clock(minutes: number) {
  const m = ((minutes % 1440) + 1440) % 1440
  const h = Math.floor(m / 60)
  return `${h % 12 || 12}:${String(m % 60).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`
}

/** Day-of run sheet for the plan, starting from when guests arrive (24-hour "HH:MM"). */
export function dayOfSchedule(
  input: PlanInput,
  start = defaultStart[input.eventType],
): RunSheetItem[] {
  const base = toMinutes(start)
  return [...slots[input.eventType], ...contextSlots(input)]
    .sort((a, b) => a[0] - b[0])
    .map(([offset, title]) => ({ at: base + offset, time: clock(base + offset), title }))
}
