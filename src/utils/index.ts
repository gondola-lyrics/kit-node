/**
 * A time, whose last two colon-separated parts are minutes and seconds and an extra leading part is hours: `mm:ss`, `mm:ss.mmm`, `hh:mm:ss`.
 * A dot introduces milliseconds, so `1:14.514` is one minute fourteen seconds and 514 ms.
 * A colon separates units, so `1:14:514` is one hour fourteen minutes and 514 seconds.
 * The leading parts are optional, so `14.514` is fourteen seconds and 514 ms with no minute stated.
 */
const TIME_PATTERN = /^(?:(?:(\d+):)?(\d+):)?(\d+)(?:\.(\d+))?$/

/**
 * Whether the text is a time.
 * A time always holds a colon or a dot, so a bare number is not one: a source writing `123` states a count of milliseconds rather than a point on the clock, and which field it counts for is its own tag's business.
 */
export const isTime = (body: string) => {
  const trimmed = body.trim()
  return (trimmed.includes(':') || trimmed.includes('.')) && TIME_PATTERN.test(trimmed)
}

/**
 * Reads a time into milliseconds, or undefined when the text is not one.
 * A trailing part of fewer than three digits counts as milliseconds padded on the right, so `1:14.5` is 500 ms past the second.
 * No bound is applied here: a time the schema would reject is the model's to report, and kit's only question is whether the text held a time at all.
 * This reads the clock the LRC and QRC families write; a format reading its own clock, such as TTML with frame counts, needs a reader of its own.
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
 * Writes a time as the clock its format asks for, the shape `parseTime` reads back.
 * `h`, `m`, `s` and `S` stand for hours, minutes, seconds and milliseconds, and a letter written twice pads that field to two digits: `hh:mm:ss.SSS` writes `01:14:34.514`.
 * A format naming no hour carries them in the minute field, so `mm:ss.SSS` writes an hour as `60:00.000` rather than dropping it.
 * A time that is not a finite number of milliseconds, or that is negative, writes zeros, since no time can be written from it.
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

    // The millisecond field carries three digits, so a shorter run takes that many from its front.
    if (run[0] === 'S') {
      return field.slice(0, run.length)
    }

    return field.padStart(run.length, '0')
  })
}
