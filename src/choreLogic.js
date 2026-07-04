// Shared chore scheduling/deadline/color logic, used by both the Chores tab and the
// auto-populated Today/Tomorrow/Future grouping on the Tasks tab.

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const DEADLINE_FREQUENCIES = ['Daily', 'Weekly', 'Monthly', 'Custom']

export function formatInterval(chore) {
  if (!chore.interval_count || !chore.interval_unit) return ''
  const plural = chore.interval_count === 1 ? '' : 's'
  return `Every ${chore.interval_count} ${chore.interval_unit}${plural}`
}

export function formatDateTime(iso) {
  const d = new Date(iso)
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
}

export function formatTime(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`
}

export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

// Convert an ISO timestamp to the local "YYYY-MM-DDTHH:MM" string a datetime-local input expects.
export function toDatetimeLocal(isoString) {
  const d = isoString ? new Date(isoString) : new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// Does this chore have a manually-set recurring deadline (as opposed to being tracked
// relative to when it was last done)?
export function hasDeadline(chore) {
  if (chore.frequency === 'Daily') return !!chore.deadline_time
  if (chore.frequency === 'Weekly') return chore.deadline_weekday !== null && chore.deadline_weekday !== undefined
  if (chore.frequency === 'Monthly') return chore.deadline_day_of_month !== null && chore.deadline_day_of_month !== undefined
  if (chore.frequency === 'Custom') return !!chore.deadline_anchor
  return false
}

// How many days a chore's own repetition interval spans (used to scale the overdue
// color thresholds, and to advance Custom deadlines, whether the chore uses a manual
// deadline or not).
export function intervalDays(chore) {
  if (chore.frequency === 'Daily') return 1
  if (chore.frequency === 'Weekly') return 7
  if (chore.frequency === 'Biweekly') return 14
  if (chore.frequency === 'Monthly') return 30
  if (chore.frequency === 'Custom') {
    const unitDays = { day: 1, week: 7, month: 30 }
    return (chore.interval_count || 1) * (unitDays[chore.interval_unit] || 1)
  }
  return 7
}

// The most recent occurrence of a chore's fixed schedule that has already happened
// (e.g. "this past Sunday", or "today" / "yesterday" for a daily time-of-day deadline).
// For Custom chores, the schedule is anchored to an arbitrary date/time and repeats every
// interval from there, rather than snapping to a fixed weekday/day-of-month.
export function mostRecentDeadlineOccurrence(chore, now) {
  const [h, m] = (chore.deadline_time || '23:59').split(':').map(Number)

  if (chore.frequency === 'Daily') {
    const d = new Date(now)
    d.setHours(h, m, 0, 0)
    if (d > now) d.setDate(d.getDate() - 1)
    return d
  }

  if (chore.frequency === 'Weekly') {
    const d = new Date(now)
    d.setHours(h, m, 0, 0)
    let diff = d.getDay() - chore.deadline_weekday
    if (diff < 0) diff += 7
    d.setDate(d.getDate() - diff)
    if (d > now) d.setDate(d.getDate() - 7)
    return d
  }

  if (chore.frequency === 'Monthly') {
    const dayInMonth = (year, month) => {
      const lastDay = new Date(year, month + 1, 0).getDate()
      return new Date(year, month, Math.min(chore.deadline_day_of_month, lastDay), h, m, 0, 0)
    }
    const thisMonth = dayInMonth(now.getFullYear(), now.getMonth())
    if (thisMonth <= now) return thisMonth
    return dayInMonth(now.getFullYear(), now.getMonth() - 1)
  }

  if (chore.frequency === 'Custom' && chore.deadline_anchor) {
    const anchor = new Date(chore.deadline_anchor)
    const intervalMs = intervalDays(chore) * 24 * 60 * 60 * 1000
    const elapsed = now - anchor
    if (elapsed < 0) return anchor
    const cycles = Math.floor(elapsed / intervalMs)
    return new Date(anchor.getTime() + cycles * intervalMs)
  }

  return null
}

// The next occurrence after the most recent one - used once a chore is already satisfied
// for its current cycle, to know when it becomes relevant again.
export function nextDeadlineOccurrence(chore, now) {
  const recent = mostRecentDeadlineOccurrence(chore, now)
  if (!recent) return null
  const [h, m] = (chore.deadline_time || '23:59').split(':').map(Number)

  if (chore.frequency === 'Daily') {
    const d = new Date(recent)
    d.setDate(d.getDate() + 1)
    return d
  }
  if (chore.frequency === 'Weekly') {
    const d = new Date(recent)
    d.setDate(d.getDate() + 7)
    return d
  }
  if (chore.frequency === 'Monthly') {
    const y = recent.getFullYear(), mo = recent.getMonth()
    const lastDay = new Date(y, mo + 2, 0).getDate()
    return new Date(y, mo + 1, Math.min(chore.deadline_day_of_month, lastDay), h, m, 0, 0)
  }
  if (chore.frequency === 'Custom') {
    return new Date(recent.getTime() + intervalDays(chore) * 24 * 60 * 60 * 1000)
  }
  return null
}

// The occurrence before the most recent one - the start of the current cycle. A chore is
// "done for this cycle" if it was completed any time since then, not just after the most
// recent occurrence's exact time - otherwise a chore done earlier the same calendar day (or
// earlier in the week/month) as its deadline would wrongly look unsatisfied.
export function previousDeadlineOccurrence(chore, now) {
  const recent = mostRecentDeadlineOccurrence(chore, now)
  if (!recent) return null
  const [h, m] = (chore.deadline_time || '23:59').split(':').map(Number)

  if (chore.frequency === 'Daily') {
    const d = new Date(recent)
    d.setDate(d.getDate() - 1)
    return d
  }
  if (chore.frequency === 'Weekly') {
    const d = new Date(recent)
    d.setDate(d.getDate() - 7)
    return d
  }
  if (chore.frequency === 'Monthly') {
    const y = recent.getFullYear(), mo = recent.getMonth()
    const lastDay = new Date(y, mo, 0).getDate()
    return new Date(y, mo - 1, Math.min(chore.deadline_day_of_month, lastDay), h, m, 0, 0)
  }
  if (chore.frequency === 'Custom') {
    return new Date(recent.getTime() - intervalDays(chore) * 24 * 60 * 60 * 1000)
  }
  return null
}

export function formatDeadline(chore) {
  const time = chore.deadline_time
  const timeSuffix = time ? ` at ${formatTime(time)}` : ''
  if (chore.frequency === 'Daily') return `Due daily${timeSuffix}`
  if (chore.frequency === 'Weekly') return `Due ${WEEKDAYS[chore.deadline_weekday]}s${timeSuffix}`
  if (chore.frequency === 'Monthly') return `Due on the ${ordinal(chore.deadline_day_of_month)}${timeSuffix}`
  if (chore.frequency === 'Custom' && chore.deadline_anchor) {
    const next = nextDeadlineOccurrence(chore, new Date())
    return `Next due: ${formatDateTime(next)}`
  }
  return ''
}

// Has this chore already been done for its current deadline cycle? Only meaningful for
// chores with a manual deadline - chores tracked by the relative last-done model don't
// have a discrete "cycle" the way a fixed schedule does. "This cycle" is the window since
// the previous occurrence, not just after the most recent occurrence's exact time - so doing
// a "due Sunday 6pm" chore on Sunday morning (or any day that week) still counts.
export function doneForCurrentCycle(chore, now) {
  if (!hasDeadline(chore)) return false
  const cycleStart = previousDeadlineOccurrence(chore, now)
  return !!(chore.last_done_at && cycleStart && new Date(chore.last_done_at) >= cycleStart)
}

// The single date that should drive Today/Tomorrow/Future placement for a chore with a
// manual deadline: the current cycle's deadline if not yet done, or the next cycle's if it is.
// Chores without a manual deadline have no such date (they're always "ambient", see Tasks.jsx).
export function relevantDueDate(chore, now) {
  if (!hasDeadline(chore)) return null
  const recent = mostRecentDeadlineOccurrence(chore, now)
  return doneForCurrentCycle(chore, now) ? nextDeadlineOccurrence(chore, now) : recent
}

const GREEN = [224, 242, 221]
const YELLOW = [255, 243, 205]
const RED = [250, 219, 219]

function lerpColor(from, to, t) {
  const mix = (a, b) => Math.round(a + (b - a) * t)
  return `rgb(${mix(from[0], to[0])}, ${mix(from[1], to[1])}, ${mix(from[2], to[2])})`
}

// Green while not yet due, then eases through yellow into red the further overdue it gets.
// Thresholds scale with the chore's own interval (interval/6 for yellow, double that for red) -
// this reproduces the daily (1/2 day), weekly (2/4 day) and monthly (5/10 day) targets exactly,
// and extends the same rule to Biweekly and Custom frequencies.
//
// If a manual deadline is set, overdue-ness is measured against that fixed schedule instead of
// last_done_at + interval - completing the chore early doesn't pull the next deadline forward.
export function choreColor(chore) {
  const now = new Date()
  const days = intervalDays(chore)
  let overdueBy

  if (hasDeadline(chore)) {
    const deadline = mostRecentDeadlineOccurrence(chore, now)
    // Don't judge the chore against a scheduled occurrence that happened before it even existed.
    if (chore.created_at && deadline < new Date(chore.created_at)) return `rgb(${GREEN.join(', ')})`
    if (doneForCurrentCycle(chore, now)) return `rgb(${GREEN.join(', ')})`
    overdueBy = (now - deadline) / (1000 * 60 * 60 * 24)
  } else {
    const baseline = chore.last_done_at || chore.created_at
    if (!baseline) return null
    const daysSince = (now - new Date(baseline)) / (1000 * 60 * 60 * 24)
    overdueBy = daysSince - days
    if (overdueBy <= 0) return `rgb(${GREEN.join(', ')})`
  }

  const yellowAt = Math.ceil(days / 6)
  const redAt = yellowAt * 2

  if (overdueBy >= redAt) return `rgb(${RED.join(', ')})`
  if (overdueBy <= yellowAt) return lerpColor(GREEN, YELLOW, overdueBy / yellowAt)
  return lerpColor(YELLOW, RED, (overdueBy - yellowAt) / (redAt - yellowAt))
}
