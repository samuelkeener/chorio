import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function formatInterval(chore) {
  if (!chore.interval_count || !chore.interval_unit) return ''
  const plural = chore.interval_count === 1 ? '' : 's'
  return `Every ${chore.interval_count} ${chore.interval_unit}${plural}`
}

// Does this chore have a manually-set recurring deadline (as opposed to being tracked
// relative to when it was last done)?
function hasDeadline(chore) {
  if (chore.frequency === 'Daily') return !!chore.deadline_time
  if (chore.frequency === 'Weekly') return chore.deadline_weekday !== null && chore.deadline_weekday !== undefined
  if (chore.frequency === 'Monthly') return chore.deadline_day_of_month !== null && chore.deadline_day_of_month !== undefined
  return false
}

function formatDeadline(chore) {
  const time = chore.deadline_time
  const timeSuffix = time ? ` at ${formatTime(time)}` : ''
  if (chore.frequency === 'Daily') return `Due daily${timeSuffix}`
  if (chore.frequency === 'Weekly') return `Due ${WEEKDAYS[chore.deadline_weekday]}s${timeSuffix}`
  if (chore.frequency === 'Monthly') return `Due on the ${ordinal(chore.deadline_day_of_month)}${timeSuffix}`
  return ''
}

function formatTime(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

// The most recent occurrence of a chore's fixed schedule that has already happened
// (e.g. "this past Sunday", or "today" / "yesterday" for a daily time-of-day deadline).
function mostRecentDeadlineOccurrence(chore, now) {
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

  return null
}

// How many days a chore's own repetition interval spans (used to scale the overdue
// color thresholds, whether the chore uses a manual deadline or not).
function intervalDays(chore) {
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
function choreColor(chore) {
  const now = new Date()
  const days = intervalDays(chore)
  let overdueBy

  if (hasDeadline(chore)) {
    const deadline = mostRecentDeadlineOccurrence(chore, now)
    // Don't judge the chore against a scheduled occurrence that happened before it even existed.
    if (chore.created_at && deadline < new Date(chore.created_at)) return `rgb(${GREEN.join(', ')})`
    const doneForThisCycle = chore.last_done_at && new Date(chore.last_done_at) >= deadline
    if (doneForThisCycle) return `rgb(${GREEN.join(', ')})`
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

// Default deadline field values for the inline editor, seeded from an existing chore if any.
function blankDeadlineDraft(chore) {
  return {
    time: chore?.deadline_time || '',
    weekday: chore?.deadline_weekday ?? 0,
    dayOfMonth: chore?.deadline_day_of_month ?? 1,
  }
}

export default function Chores({ user }) {
  const [chores, setChores] = useState([])
  const [newChore, setNewChore] = useState('')
  const [assignTo, setAssignTo] = useState('Sam')
  const [frequency, setFrequency] = useState('Weekly')
  const [intervalCount, setIntervalCount] = useState('1')
  const [intervalUnit, setIntervalUnit] = useState('week')
  const [deadlineEnabled, setDeadlineEnabled] = useState(false)
  const [deadlineDraft, setDeadlineDraft] = useState(blankDeadlineDraft())
  const [editingDeadlineId, setEditingDeadlineId] = useState(null)
  const [editDraft, setEditDraft] = useState(blankDeadlineDraft())

  useEffect(() => { fetchChores() }, [])

  async function fetchChores() {
    const { data } = await supabase.from('chores').select('*').order('created_at', { ascending: false })
    if (data) setChores(data)
  }

  async function addChore() {
    if (!newChore.trim()) return
    const isCustom = frequency === 'Custom'
    const count = parseInt(intervalCount, 10)
    if (isCustom && (!count || count < 1)) return

    const canHaveDeadline = ['Daily', 'Weekly', 'Monthly'].includes(frequency)
    const useDeadline = canHaveDeadline && deadlineEnabled

    await supabase.from('chores').insert({
      name: newChore,
      assigned_to: assignTo,
      frequency,
      interval_count: isCustom ? count : null,
      interval_unit: isCustom ? intervalUnit : null,
      deadline_time: useDeadline ? (deadlineDraft.time || null) : null,
      deadline_weekday: useDeadline && frequency === 'Weekly' ? deadlineDraft.weekday : null,
      deadline_day_of_month: useDeadline && frequency === 'Monthly' ? deadlineDraft.dayOfMonth : null,
    })
    setNewChore('')
    setDeadlineEnabled(false)
    setDeadlineDraft(blankDeadlineDraft())
    fetchChores()
  }

  async function markDone(chore) {
    await supabase.from('chores').update({ last_done_at: new Date().toISOString(), last_done_by: user }).eq('id', chore.id)
    await supabase.from('history').insert({ who: user, task_name: chore.name + ' (chore)' })
    fetchChores()
  }

  async function deleteChore(id) {
    await supabase.from('chores').delete().eq('id', id)
    fetchChores()
  }

  function startEditingDeadline(chore) {
    setEditingDeadlineId(chore.id)
    setEditDraft(blankDeadlineDraft(chore))
  }

  async function saveDeadline(chore) {
    await supabase.from('chores').update({
      deadline_time: editDraft.time || null,
      deadline_weekday: chore.frequency === 'Weekly' ? editDraft.weekday : null,
      deadline_day_of_month: chore.frequency === 'Monthly' ? editDraft.dayOfMonth : null,
    }).eq('id', chore.id)
    setEditingDeadlineId(null)
    fetchChores()
  }

  async function clearDeadline(chore) {
    await supabase.from('chores').update({
      deadline_time: null,
      deadline_weekday: null,
      deadline_day_of_month: null,
    }).eq('id', chore.id)
    setEditingDeadlineId(null)
    fetchChores()
  }

  const groups = ['Daily', 'Weekly', 'Biweekly', 'Monthly', 'Custom']
  const canHaveDeadline = ['Daily', 'Weekly', 'Monthly'].includes(frequency)

  return (
    <div>
      <div className="section-header"><h2>Recurring chores</h2></div>

      <div className="add-row">
        <input value={newChore} onChange={e => setNewChore(e.target.value)} onKeyDown={e => e.key === 'Enter' && addChore()} placeholder="New chore..." />
        <select value={assignTo} onChange={e => setAssignTo(e.target.value)}>
          <option>Sam</option>
          <option>Anne</option>
          <option>Both</option>
        </select>
        <select value={frequency} onChange={e => setFrequency(e.target.value)}>
          <option>Daily</option>
          <option>Weekly</option>
          <option>Biweekly</option>
          <option>Monthly</option>
          <option>Custom</option>
        </select>
        {frequency === 'Custom' && (
          <>
            <span className="interval-label">Every</span>
            <input
              className="interval-count"
              type="number"
              min="1"
              value={intervalCount}
              onChange={e => setIntervalCount(e.target.value)}
            />
            <select value={intervalUnit} onChange={e => setIntervalUnit(e.target.value)}>
              <option value="day">Day(s)</option>
              <option value="week">Week(s)</option>
              <option value="month">Month(s)</option>
            </select>
          </>
        )}
        <button onClick={addChore}>Add</button>
      </div>

      {canHaveDeadline && (
        <div className="add-row deadline-row">
          <label className="interval-label">
            <input type="checkbox" checked={deadlineEnabled} onChange={e => setDeadlineEnabled(e.target.checked)} /> Set deadline
          </label>
          {deadlineEnabled && frequency === 'Weekly' && (
            <select value={deadlineDraft.weekday} onChange={e => setDeadlineDraft({ ...deadlineDraft, weekday: parseInt(e.target.value, 10) })}>
              {WEEKDAYS.map((day, i) => <option key={day} value={i}>{day}</option>)}
            </select>
          )}
          {deadlineEnabled && frequency === 'Monthly' && (
            <select value={deadlineDraft.dayOfMonth} onChange={e => setDeadlineDraft({ ...deadlineDraft, dayOfMonth: parseInt(e.target.value, 10) })}>
              {Array.from({ length: 31 }, (_, i) => i + 1).map(day => <option key={day} value={day}>{ordinal(day)}</option>)}
            </select>
          )}
          {deadlineEnabled && (
            <input
              type="time"
              value={deadlineDraft.time}
              onChange={e => setDeadlineDraft({ ...deadlineDraft, time: e.target.value })}
            />
          )}
        </div>
      )}

      {groups.map(freq => {
        const items = chores.filter(c => c.frequency === freq)
        if (!items.length) return null
        return (
          <div key={freq} className="chore-group">
            <div className="chore-group-label">{freq}</div>
            {items.map(chore => (
              <div key={chore.id} className="task-row chore-row" style={{ backgroundColor: choreColor(chore) }}>
                <div className="check" onClick={() => markDone(chore)} />
                <div className="task-info">
                  <div className="task-name">{chore.name}</div>
                  <div className="task-meta">
                    <span className={`badge badge-${chore.assigned_to.toLowerCase()}`}>{chore.assigned_to}</span>
                    {freq === 'Custom' && <span>{formatInterval(chore)}</span>}
                    <span>{chore.last_done_at ? 'Last done: ' + new Date(chore.last_done_at).toLocaleDateString() : 'Never done'}</span>
                    {hasDeadline(chore) && <span>{formatDeadline(chore)}</span>}
                    {['Daily', 'Weekly', 'Monthly'].includes(freq) && editingDeadlineId !== chore.id && (
                      <span className="deadline-edit-link" onClick={() => startEditingDeadline(chore)}>
                        {hasDeadline(chore) ? 'Edit deadline' : 'Set deadline'}
                      </span>
                    )}
                  </div>
                  {editingDeadlineId === chore.id && (
                    <div className="deadline-editor">
                      {chore.frequency === 'Weekly' && (
                        <select value={editDraft.weekday} onChange={e => setEditDraft({ ...editDraft, weekday: parseInt(e.target.value, 10) })}>
                          {WEEKDAYS.map((day, i) => <option key={day} value={i}>{day}</option>)}
                        </select>
                      )}
                      {chore.frequency === 'Monthly' && (
                        <select value={editDraft.dayOfMonth} onChange={e => setEditDraft({ ...editDraft, dayOfMonth: parseInt(e.target.value, 10) })}>
                          {Array.from({ length: 31 }, (_, i) => i + 1).map(day => <option key={day} value={day}>{ordinal(day)}</option>)}
                        </select>
                      )}
                      <input type="time" value={editDraft.time} onChange={e => setEditDraft({ ...editDraft, time: e.target.value })} />
                      <button onClick={() => saveDeadline(chore)}>Save</button>
                      {hasDeadline(chore) && <button onClick={() => clearDeadline(chore)}>Clear</button>}
                      <button onClick={() => setEditingDeadlineId(null)}>Cancel</button>
                    </div>
                  )}
                </div>
                <button className="delete-btn" onClick={() => deleteChore(chore.id)}>✕</button>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
