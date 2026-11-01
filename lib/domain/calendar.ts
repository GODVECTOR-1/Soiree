import type { PlanInput, Task } from '../schemas'
import { addDays } from '../format'

// iCalendar (RFC 5545) export, so reminders land in the calendar people already use. No server, no email.

const esc = (s: string) =>
  s
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/[,;]/g, (c) => `\\${c}`)
const day = (iso: string) => iso.replace(/-/g, '')

/** Lines longer than 75 characters continue on the next line, indented by one space. */
function fold(line: string) {
  const parts: string[] = []
  for (let i = 0; i < line.length; i += i === 0 ? 75 : 74)
    parts.push(line.slice(i, i + (i === 0 ? 75 : 74)))
  return parts.join('\r\n ')
}

function allDay(
  uid: string,
  date: string,
  summary: string,
  description: string,
  stamp: string,
  remind: boolean,
) {
  return [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${day(date)}`,
    `DTEND;VALUE=DATE:${day(addDays(date, 1))}`,
    `SUMMARY:${esc(summary)}`,
    `DESCRIPTION:${esc(description)}`,
    ...(remind
      ? [
          'BEGIN:VALARM',
          'ACTION:DISPLAY',
          `DESCRIPTION:${esc(summary)}`,
          'TRIGGER:-PT15H',
          'END:VALARM',
        ]
      : []),
    'END:VEVENT',
  ]
}

/**
 * The event day plus one all-day entry per open task on its due date, each with a reminder at 9 am the day before.
 * Overdue and urgent tasks are placed on `today`. `stamp` is the UTC creation time (YYYYMMDDTHHMMSSZ).
 */
export function toIcs(opts: {
  input: PlanInput
  tasks: Task[]
  today: string
  stamp: string
  uid: string
}): string {
  const { input, tasks, today, stamp, uid } = opts
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Soiree//Event plan//EN',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${esc(input.title)}`,
    ...allDay(
      `${uid}-event@soiree`,
      input.date,
      input.title,
      `${input.guestCount} guests in ${input.city}`,
      stamp,
      true,
    ),
  ]
  for (const t of tasks) {
    if (t.done) continue
    const due = t.offsetDays === undefined ? today : addDays(input.date, -t.offsetDays)
    lines.push(
      ...allDay(
        `${uid}-${t.id}@soiree`,
        due < today ? today : due,
        t.title,
        `For ${input.title}`,
        stamp,
        true,
      ),
    )
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}
