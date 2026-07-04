import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function Chores({ user }) {
  const [chores, setChores] = useState([])
  const [newChore, setNewChore] = useState('')
  const [assignTo, setAssignTo] = useState('Sam')
  const [frequency, setFrequency] = useState('Weekly')

  useEffect(() => { fetchChores() }, [])

  async function fetchChores() {
    const { data } = await supabase.from('chores').select('*').order('created_at', { ascending: false })
    if (data) setChores(data)
  }

  async function addChore() {
    if (!newChore.trim()) return
    await supabase.from('chores').insert({ name: newChore, assigned_to: assignTo, frequency })
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

  const groups = ['Daily', 'Weekly', 'Biweekly', 'Monthly']

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
        </select>
        <button onClick={addChore}>Add</button>
      </div>

      {groups.map(freq => {
        const items = chores.filter(c => c.frequency === freq)
        if (!items.length) return null
        return (
          <div key={freq} className="chore-group">
            <div className="chore-group-label">{freq}</div>
            {items.map(chore => (
              <div key={chore.id} className="task-row">
                <div className="check" onClick={() => markDone(chore)} />
                <div className="task-info">
                  <div className="task-name">{chore.name}</div>
                  <div className="task-meta">
                    <span className={`badge badge-${chore.assigned_to.toLowerCase()}`}>{chore.assigned_to}</span>
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