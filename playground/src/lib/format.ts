import type { TimeRange } from '@gondola-lyrics/model/runtime'

/**
 * Missing time bounds remain unknown rather than appearing at the start of the song.
 */
export const formatTime = (value: number | undefined): string => {
  if (value === undefined || !Number.isFinite(value)) {
    return '—'
  }
  const time = Math.round(Math.abs(value))
  const minutes = Math.floor(time / 60000)
  const seconds = Math.floor((time % 60000) / 1000)
  const milliseconds = time % 1000
  return `${value < 0 ? '-' : ''}${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`
}

/**
 * Keep open-ended ranges visible when the source provides no end timestamp.
 */
export const formatRange = (time: TimeRange | undefined): string => {
  if (!time) {
    return '—'
  }
  return `${formatTime(time.start)} → ${formatTime(time.end)}`
}

/**
 * Use binary units to compare UTF-8 input with the encoded model.
 */
export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KiB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`
}
