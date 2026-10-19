export * from './annotation'

// A colon always separates units, so `1:14:514` means hours, minutes, and seconds, not minutes, seconds, and milliseconds.
const TIME_PATTERN = /^(?:(?:(\d+):)?(\d+):)?(\d+)(?:\.(\d+))?$/

/**
 * Bare integers are excluded because formats may use them as millisecond counts or offsets.
 */
export const isTime = (body: string) => {
  const trimmed = body.trim()
  return (trimmed.includes(':') || trimmed.includes('.')) && TIME_PATTERN.test(trimmed)
}

/**
 * Fractional seconds are padded or truncated to millisecond precision.
 *
 * Invalid clock syntax returns `undefined`; time bounds are left to model validation.
 */
export const parseTime = (body: string) => {
  if (!isTime(body)) {
    return undefined
  }

  const match = TIME_PATTERN.exec(body.trim()) as RegExpExecArray

  const hour = Number(match[1] ?? 0)
  const minute = Number(match[2] ?? 0)
  const second = Number(match[3])
  const millisecond = Number((match[4] ?? '').padEnd(3, '0').slice(0, 3))

  return ((hour * 60 + minute) * 60 + second) * 1000 + millisecond
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
