const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 60 * 60 * 1000],
  ['month', 30 * 24 * 60 * 60 * 1000],
  ['week', 7 * 24 * 60 * 60 * 1000],
  ['day', 24 * 60 * 60 * 1000],
  ['hour', 60 * 60 * 1000],
  ['minute', 60 * 1000],
]

/** "3 hours ago" in the given language; anything under a minute reads as "now". */
export function formatTimeAgo(date: Date, locale: string, now = Date.now()): string {
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  const elapsed = date.getTime() - now
  for (const [unit, ms] of UNITS) {
    if (Math.abs(elapsed) >= ms)
      return format.format(Math.round(elapsed / ms), unit)
  }
  return format.format(0, 'second')
}
