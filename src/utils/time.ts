// A colon always separates units, so `1:14:514` means hours, minutes, and seconds, not minutes, seconds, and milliseconds.
const CLOCK_PATTERN = /^(?:(?:(\d+):)?(\d+):)?(\d+)(?:\.(\d+))?$/

// `ms` has to be tried before `m`, so the longer unit wins.
const OFFSET_PATTERN = /^(\d+(?:\.\d+)?)(ms|h|m|s)$/iu

/**
 * Reads a clock value, where the fraction is padded or truncated to millisecond precision.
 *
 * `14.514` is fourteen seconds, not fourteen minutes: a colon, not a dot, introduces the larger units.
 */
const parseClock = (value: string): number | undefined => {
  // A dot alone is enough to make a number a clock reading, which is what keeps `500` out.
  if (!value.includes(':') && !value.includes('.')) {
    return undefined
  }

  const match = CLOCK_PATTERN.exec(value)
  if (!match) {
    return undefined
  }

  const hour = Number(match[1] ?? 0)
  const minute = Number(match[2] ?? 0)
  const second = Number(match[3] ?? 0)
  const millisecond = Number((match[4] ?? '').padEnd(3, '0').slice(0, 3))

  return ((hour * 60 + minute) * 60 + second) * 1000 + millisecond
}

/**
 * Reads an offset such as `1.5s`, `2m`, `500ms`, or `1h`.
 */
const parseOffset = (value: string): number | undefined => {
  const match = OFFSET_PATTERN.exec(value)
  if (!match) {
    return undefined
  }

  const amount = Number(match[1])
  if (!Number.isFinite(amount)) {
    return undefined
  }

  switch ((match[2] ?? '').toLowerCase()) {
    case 'h':
      return Math.round(amount * 3600000)
    case 'm':
      return Math.round(amount * 60000)
    case 'ms':
      return Math.round(amount)
    default:
      return Math.round(amount * 1000)
  }
}

/**
 * Reports whether a value reads as a time.
 */
export const isTime = (body: string) => {
  return parseTime(body) !== undefined
}

/**
 * Reads a time value into milliseconds.
 *
 * A clock reading accepts `ss.fraction`, `mm:ss.fraction`, and `hh:mm:ss.fraction`.
 * An offset accepts a number with an `h`, `m`, `s`, or `ms` suffix.
 * A bare number returns `undefined`, and so does anything else.
 */
export const parseTime = (body: string): number | undefined => {
  const trimmed = body.trim()
  if (trimmed === '') {
    return undefined
  }

  return parseOffset(trimmed) ?? parseClock(trimmed)
}

/**
 * Tokens `h`, `m`, `s`, and `S` select hours, minutes, seconds, and fractional seconds.
 * Repeated unit tokens set minimum width; `S` tokens select up to three fractional digits.
 *
 * Omitting hours carries them into minutes; negative or non-finite input writes zero fields.
 */
export const formatTime = (time: number, format = 'mm:ss.SSS') => {
  if (!Number.isFinite(time) || time < 0) {
    return format.replace(/h+|m+|s+|S+/g, (run) => '0'.repeat(run.length))
  }

  const total = Math.floor(time)
  const totalSeconds = Math.floor(total / 1000)
  const totalMinutes = Math.floor(totalSeconds / 60)
  const millisecond = String(total % 1000).padStart(3, '0')

  const fields: Record<string, string> = {
    h: String(Math.floor(totalMinutes / 60)),
    m: String(format.includes('h') ? totalMinutes % 60 : totalMinutes),
    s: String(totalSeconds % 60),
    S: millisecond,
  }

  return format.replace(/h+|m+|s+|S+/g, (run) => {
    const field = fields[run[0] as string] as string

    if (run[0] === 'S') {
      return field.slice(0, run.length)
    }

    return field.padStart(run.length, '0')
  })
}
