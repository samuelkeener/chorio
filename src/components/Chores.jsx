import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

function formatInterval(chore) {
  if (!chore.interval_count || !chore.interval_unit) return ''
  const plural = chore.interval_count === 1 ? '' : 's'
  return `Every ${chore.interval_count} ${chore.interval_unit}${plural}`
}

// How many days a chore's own repetition interval spans.
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
function choreColor(chore) {
  const baseline = chore.last_done_at || chore.created_at
  if (!baseline) return null

  const days = intervalDays(chore)
  const daysSince = (Date.now() - new Date(baseline).getTime()) / (1000 * 60 * 60 * 24)
  const overdueBy = daysSince - days

  if (overdueBy <= 0) return `rgb(${GREEN.join(', ')})`

  const yellowAt = Math.ceil(days / 6)
  const redAt = yellowAt * 2

  if (overdueBy >= redAt) return `rgb(${RED.join(', ')})`
  if (overdueBy <= yellowAt) return lerpColor(GREEN, YELLOW, overdueBy / yellowAt)
  return lerpColor(YELLOW, RED, (overdueBy - yellowAt) / (redAt - yellowAt))
}

export default function Chores({ user }) {
  const [chores, setChores] = useState([])
  const [newChore, setNewChore] = useState('')
  const [assignTo, setAssignTo] = useState('Sam')
  const [frequency, setFrequency] = useState('Weekly')
  const [intervalCount, setIntervalCount] = useState('1')
  const [intervalUnit, setIntervalUnit] = useState('week')

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

    await supabase.from('chores').insert({
      name: newChore,
      assigned_to: assignTo,
      frequency,
      interval_count: isCustom ? count : null,
      interval_unit: isCustom ? intervalUnit : null,
    })
    setNewChore('')
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

  const groups = ['Daily', 'Weekly', 'Biweekly', 'Monthly', 'Custom']

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
                  </div>
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
