const weekdays = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const

const months = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

/** Format a currency value with the correct symbol and grouping (lakh/crore for INR). */
export function money(value: number, currency: 'INR' | 'USD' | 'EUR' | 'GBP') {
  const symbol = { INR: '₹', USD: '$', EUR: '€', GBP: '£' }[currency]
  const isNegative = value < 0
  const abs = Math.abs(Math.round(value))
  const s = abs.toString()

  let grouped = ''
  if (currency === 'INR') {
    if (s.length <= 3) {
      grouped = s
    } else {
      const lastThree = s.slice(-3)
      const rest = s.slice(0, -3)
      const groups = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')
      grouped = `${groups},${lastThree}`
    }
  } else {
    grouped = s.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  }

  return isNegative ? `-${symbol}${grouped}` : `${symbol}${grouped}`
}

/** Extract readable date parts from an ISO date string. */
export function dateParts(iso: string) {
  const d = new Date(`${iso}T12:00:00`)
  return {
    weekday: weekdays[d.getDay()] ?? 'Sunday',
    month: months[d.getMonth()] ?? 'January',
    day: d.getDate(),
    year: d.getFullYear(),
  }
}

/** Formats an ISO date into a short human string, e.g. "14 Feb 2027". */
export function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const monthName = months[(m ?? 1) - 1]?.slice(0, 3) ?? 'Jan'
  return `${d} ${monthName} ${y}`
}

/** Add or subtract days to an ISO date string (YYYY-MM-DD), returning an ISO date string. */
export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(y ?? 2000, (m ?? 1) - 1, (d ?? 1) + days))
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Number of days between two ISO date strings. */
export function daysBetween(from: string, to: string) {
  return Math.ceil(
    (new Date(`${to}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime()) / 86400000,
  )
}

/** Today's date as an ISO string (YYYY-MM-DD), using local time. */
export function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
