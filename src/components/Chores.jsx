import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import {
  WEEKDAYS,
  DEADLINE_FREQUENCIES,
  formatInterval,
  formatDateTime,
  hasDeadline,
  formatDeadline,
  ordinal,
  toDatetimeLocal,
  choreColor,
  localDateStr,
  isSkippedToday,
} from '../choreLogic'

// Default deadline field values for the inline editor, seeded from an existing chore if any.
function blankDeadlineDraft(chore) {
  return {
    time: chore?.deadline_time || '',
    weekday: chore?.deadline_weekday ?? 0,
    dayOfMonth: chore?.deadline_day_of_month ?? 1,
    anchor: toDatetimeLocal(chore?.deadline_anchor),
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
  const [editingTimestampId, setEditingTimestampId] = useState(null)
  const [timestampDraft, setTimestampDraft] = useState('')
  const [whoFilter, setWhoFilter] = useState('All')
  const [editingNameId, setEditingNameId] = useState(null)
  const [nameDraft, setNameDraft] = useState('')
  const [editingAssigneeId, setEditingAssigneeId] = useState(null)

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

    const useDeadline = DEADLINE_FREQUENCIES.includes(frequency) && deadlineEnabled

    await supabase.from('chores').insert({
      name: newChore,
      assigned_to: assignTo,
      frequency,
      interval_count: isCustom ? count : null,
      interval_unit: isCustom ? intervalUnit : null,
      deadline_time: useDeadline && frequency !== 'Custom' ? (deadlineDraft.time || null) : null,
      deadline_weekday: useDeadline && frequency === 'Weekly' ? deadlineDraft.weekday : null,
      deadline_day_of_month: useDeadline && frequency === 'Monthly' ? deadlineDraft.dayOfMonth : null,
      deadline_anchor: useDeadline && frequency === 'Custom' ? new Date(deadlineDraft.anchor).toISOString() : null,
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

  async function skipToday(chore) {
    await supabase.from('chores').update({ skipped_on: localDateStr(new Date()) }).eq('id', chore.id)
    fetchChores()
  }

  async function unskip(chore) {
    await supabase.from('chores').update({ skipped_on: null }).eq('id', chore.id)
    fetchChores()
  }

  function startEditingName(chore) {
    setEditingNameId(chore.id)
    setNameDraft(chore.name)
  }

  async function saveName(chore) {
    const trimmed = nameDraft.trim()
    setEditingNameId(null)
    if (!trimmed || trimmed === chore.name) return
    await supabase.from('chores').update({ name: trimmed }).eq('id', chore.id)
    fetchChores()
  }

  async function saveAssignee(chore, newAssignee) {
    setEditingAssigneeId(null)
    if (newAssignee === chore.assigned_to) return
    await supabase.from('chores').update({ assigned_to: newAssignee }).eq('id', chore.id)
    fetchChores()
  }

  function startEditingDeadline(chore) {
    setEditingDeadlineId(chore.id)
    setEditDraft(blankDeadlineDraft(chore))
  }

  function startEditingTimestamp(chore) {
    setEditingTimestampId(chore.id)
    setTimestampDraft(toDatetimeLocal(chore.last_done_at))
  }

  async function saveTimestamp(chore) {
    if (!timestampDraft) return
    await supabase.from('chores').update({ last_done_at: new Date(timestampDraft).toISOString() }).eq('id', chore.id)
    setEditingTimestampId(null)
    fetchChores()
  }

  async function saveDeadline(chore) {
    await supabase.from('chores').update({
      deadline_time: chore.frequency !== 'Custom' ? (editDraft.time || null) : null,
      deadline_weekday: chore.frequency === 'Weekly' ? editDraft.weekday : null,
      deadline_day_of_month: chore.frequency === 'Monthly' ? editDraft.dayOfMonth : null,
      deadline_anchor: chore.frequency === 'Custom' ? new Date(editDraft.anchor).toISOString() : null,
    }).eq('id', chore.id)
    setEditingDeadlineId(null)
    fetchChores()
  }

  async function clearDeadline(chore) {
    await supabase.from('chores').update({
      deadline_time: null,
      deadline_weekday: null,
      deadline_day_of_month: null,
      deadline_anchor: null,
    }).eq('id', chore.id)
    setEditingDeadlineId(null)
    fetchChores()
  }

  const groups = ['Daily', 'Weekly', 'Biweekly', 'Monthly', 'Custom']
  const canHaveDeadline = DEADLINE_FREQUENCIES.includes(frequency)
  const now = new Date()

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
          {deadlineEnabled && frequency !== 'Custom' && (
            <input
              type="time"
              value={deadlineDraft.time}
              onChange={e => setDeadlineDraft({ ...deadlineDraft, time: e.target.value })}
            />
          )}
          {deadlineEnabled && frequency === 'Custom' && (
            <input
              type="datetime-local"
              value={deadlineDraft.anchor}
              onChange={e => setDeadlineDraft({ ...deadlineDraft, anchor: e.target.value })}
            />
          )}
        </div>
      )}

      <div className="filter-row">
        {['All', 'Sam', 'Anne'].map(who => (
          <button
            key={who}
            className={whoFilter === who ? 'filter-pill active' : 'filter-pill'}
            onClick={() => setWhoFilter(who)}
          >
            {who}
          </button>
        ))}
      </div>

      {groups.map(freq => {
        const items = chores.filter(c => c.frequency === freq && (whoFilter === 'All' || c.assigned_to === whoFilter || c.assigned_to === 'Both'))
        if (!items.length) return null
        return (
          <div key={freq} className="chore-group">
            <div className="chore-group-label">{freq}</div>
            {items.map(chore => {
              const skipped = isSkippedToday(chore, now)
              return (
              <div key={chore.id} className="task-row chore-row" style={{ backgroundColor: choreColor(chore), opacity: skipped ? 0.6 : 1 }}>
                <div className="check" onClick={() => markDone(chore)} />
                <div className="task-info">
                  {editingNameId === chore.id ? (
                    <input
                      className="task-name-input"
                      value={nameDraft}
                      autoFocus
                      onChange={e => setNameDraft(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') saveName(chore)
                        if (e.key === 'Escape') setEditingNameId(null)
                      }}
                      onBlur={() => saveName(chore)}
                    />
                  ) : (
                    <div className="task-name editable-name" onClick={() => startEditingName(chore)}>{chore.name}</div>
                  )}
                  <div className="task-meta">
                    {editingAssigneeId === chore.id ? (
                      <select
                        className="assignee-select"
                        value={chore.assigned_to}
                        autoFocus
                        onChange={e => saveAssignee(chore, e.target.value)}
                        onBlur={() => setEditingAssigneeId(null)}
                      >
                        <option>Sam</option>
                        <option>Anne</option>
                        <option>Both</option>
                      </select>
                    ) : (
                      <span
                        className={`badge badge-${chore.assigned_to.toLowerCase()} editable-badge`}
                        onClick={() => setEditingAssigneeId(chore.id)}
                      >
                        {chore.assigned_to}
                      </span>
                    )}
                    {freq === 'Custom' && <span>{formatInterval(chore)}</span>}
                    <span>{chore.last_done_at ? 'Last done: ' + formatDateTime(chore.last_done_at) : 'Never done'}</span>
                    {chore.last_done_at && editingTimestampId !== chore.id && (
                      <span className="deadline-edit-link" onClick={() => startEditingTimestamp(chore)}>Edit timestamp</span>
                    )}
                    {hasDeadline(chore) && <span>{formatDeadline(chore)}</span>}
                    {DEADLINE_FREQUENCIES.includes(freq) && editingDeadlineId !== chore.id && (
                      <span className="deadline-edit-link" onClick={() => startEditingDeadline(chore)}>
                        {hasDeadline(chore) ? 'Edit deadline' : 'Set deadline'}
                      </span>
                    )}
                    {skipped ? (
                      <span className="deadline-edit-link" onClick={() => unskip(chore)}>Skipped today (Unskip)</span>
                    ) : (
                      <span className="deadline-edit-link" onClick={() => skipToday(chore)}>Skip today</span>
                    )}
                  </div>
                  {editingTimestampId === chore.id && (
                    <div className="deadline-editor">
                      <input type="datetime-local" value={timestampDraft} onChange={e => setTimestampDraft(e.target.value)} />
                      <button onClick={() => saveTimestamp(chore)}>Save</button>
                      <button onClick={() => setEditingTimestampId(null)}>Cancel</button>
                    </div>
                  )}
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
                      {chore.frequency !== 'Custom' && (
                        <input type="time" value={editDraft.time} onChange={e => setEditDraft({ ...editDraft, time: e.target.value })} />
                      )}
                      {chore.frequency === 'Custom' && (
                        <input type="datetime-local" value={editDraft.anchor} onChange={e => setEditDraft({ ...editDraft, anchor: e.target.value })} />
                      )}
                      <button onClick={() => saveDeadline(chore)}>Save</button>
                      {hasDeadline(chore) && <button onClick={() => clearDeadline(chore)}>Clear</button>}
                      <button onClick={() => setEditingDeadlineId(null)}>Cancel</button>
                    </div>
                  )}
                </div>
                <button className="delete-btn" onClick={() => deleteChore(chore.id)}>✕</button>
              </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
