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

// "YYYY-MM-DD" for a Date, in local time - used to compare against the skipped_on column,
// which is a plain date with no timezone.
export function localDateStr(d) {
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Has this chore been explicitly skipped for today? Distinct from being done - skipping
// hides it from today's view without crediting anyone or touching last_done_at/by.
export function isSkippedToday(chore, now) {
  return chore.skipped_on === localDateStr(now)
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
  // Custom chores whose schedule hasn't started yet relative to `now` fall back to returning
  // their anchor date itself (see mostRecentDeadlineOccurrence) - that's already the next
  // occurrence, so adding another interval on top would overshoot by a full cycle.
  if (recent > now) return recent
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

// Whether an occurrence falls on the same calendar day as `now` - i.e. it's still coming up
// later today rather than tomorrow (or further out). Used by relevantDueDate to tell an early
// completion (done well before today's own deadline) apart from an on-time-or-late one: if the
// upcoming occurrence is still "later today", completing it now means that slot is already
// covered, so the next relevant one is the one after - not "due later today" again. This works
// the same way regardless of frequency, including Custom's rolling interval: whether the
// upcoming boundary happens to land on today's date is exactly the same question either way.
function isSameCalendarDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

// The single date that should drive deadline-sorted placement for a chore with a manual
// deadline. Chores without a manual deadline have no such date (they're always "ambient",
// see Tasks.jsx).
//
// If not done: the first occurrence missed since the last completion (or since created_at if
// never done) - anchored to that fixed point in the past, NOT to now. This matters once it's
// overdue: mostRecentDeadlineOccurrence(chore, now) would keep "catching up" to whatever
// occurrence is closest to today as time passes, making a chore neglected for weeks look barely
// overdue and never rise to the top of the deadline-sorted list. Anchoring to the last
// completion instead means the due date stays exactly where it first became overdue.
//
// If done for the current cycle: the next cycle's occurrence - but if the upcoming occurrence is
// still later today, that slot is already covered by this completion, so skip to the occurrence
// after it instead ("delete the current iteration and look ahead to when it's next due").
export function relevantDueDate(chore, now) {
  if (!hasDeadline(chore)) return null
  if (doneForCurrentCycle(chore, now)) {
    const upcoming = nextDeadlineOccurrence(chore, now)
    return isSameCalendarDay(upcoming, now) ? nextDeadlineOccurrence(chore, upcoming) : upcoming
  }
  const anchor = chore.last_done_at ? new Date(chore.last_done_at) : new Date(chore.created_at)
  return nextDeadlineOccurrence(chore, anchor)
}

// Deadline chores don't clutter the Tasks tab until they're actually relevant - hidden there
// (still fully visible/actionable on the Chores tab) until their next occurrence is within two
// weeks out. Overdue chores are always within two weeks by definition, so this never hides one
// that needs attention. Ambient chores (no manual deadline) have no due date to judge, so they're
// never hidden by this rule.
export function isTooFarOut(chore, now) {
  if (!hasDeadline(chore)) return false
  const due = relevantDueDate(chore, now)
  if (!due) return false
  const daysUntilDue = (due - now) / (1000 * 60 * 60 * 24)
  return daysUntilDue > 14
}

// Light-mode tints are soft pastels meant to sit on a white page; dark-mode uses deeper, more
// desaturated versions of the same hues so they read as tinted cards on a dark page instead of
// glowing/washing out. Same green/yellow/red/blue meaning either way.
const PALETTE = {
  light: { GREEN: [224, 242, 221], YELLOW: [255, 243, 205], RED: [250, 219, 219], BLUE: [219, 236, 250] },
  dark: { GREEN: [32, 64, 48], YELLOW: [72, 58, 20], RED: [74, 36, 36], BLUE: [30, 50, 74] },
}

// Red once past a due date, by any amount - no gradient, overdue is overdue. Yellow if the due
// date is today but hasn't passed yet. Otherwise green within a week out, blue one to two weeks
// out, and blank (no color) beyond two weeks, so the list doesn't light up for things that aren't
// worth thinking about yet. Shared by choreColor and taskColor below.
function colorForDueDate(dueDate, now, dark) {
  const { GREEN, YELLOW, RED, BLUE } = PALETTE[dark ? 'dark' : 'light']
  if (dueDate < now) return `rgb(${RED.join(', ')})`
  if (isSameCalendarDay(dueDate, now)) return `rgb(${YELLOW.join(', ')})`
  const daysUntilDue = (dueDate - now) / (1000 * 60 * 60 * 24)
  if (daysUntilDue > 14) return null
  if (daysUntilDue > 7) return `rgb(${BLUE.join(', ')})`
  return `rgb(${GREEN.join(', ')})`
}

// If a manual deadline is set, color is measured against that fixed schedule instead of
// last_done_at + interval - completing the chore early doesn't pull the next deadline forward.
export function choreColor(chore, dark) {
  const now = new Date()
  const { GREEN } = PALETTE[dark ? 'dark' : 'light']

  if (hasDeadline(chore)) {
    if (doneForCurrentCycle(chore, now)) return `rgb(${GREEN.join(', ')})`
    // relevantDueDate is already anchored to last_done_at/created_at, so it can never land
    // before the chore existed - no separate "fresh chore" guard needed here.
    return colorForDueDate(relevantDueDate(chore, now), now, dark)
  }

  const baseline = chore.last_done_at || chore.created_at
  if (!baseline) return null
  const virtualDueDate = new Date(new Date(baseline).getTime() + intervalDays(chore) * 24 * 60 * 60 * 1000)
  return colorForDueDate(virtualDueDate, now, dark)
}

// Same red/yellow/green/blue treatment for one-off tasks with a deadline. Done tasks and tasks
// with no deadline get no color.
export function taskColor(task, dark) {
  if (task.done || !task.deadline) return null
  return colorForDueDate(new Date(task.deadline), new Date(), dark)
}
