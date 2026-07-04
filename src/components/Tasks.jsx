import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { hasDeadline, doneForCurrentCycle, relevantDueDate, formatDeadline, choreColor } from '../choreLogic'

function formatCompletedAt(timestamp) {
  if (!timestamp) return ''
  const d = new Date(timestamp)
  const date = d.toLocaleDateString()
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return `${date} ${time}`
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

// Normalize a task or chore into the shape the merged Today/Tomorrow/Future/Done list needs.
function toItem(record, type, now) {
  if (type === 'task') {
    return {
      type,
      record,
      id: record.id,
      name: record.name,
      assignedTo: record.assigned_to,
      isDone: record.done,
      doneAt: record.completed_at,
      dueDate: null,
    }
  }

  // chore
  const withDeadline = hasDeadline(record)
  const isDone = withDeadline
    ? doneForCurrentCycle(record, now)
    : !!(record.last_done_at && isSameDay(new Date(record.last_done_at), now))

  return {
    type,
    record,
    id: record.id,
    name: record.name,
    assignedTo: record.assigned_to,
    isDone,
    doneAt: record.last_done_at,
    // Chores without a manual deadline are always "ambient" (Today) unless done today -
    // there's no specific calendar date to place them on.
    dueDate: withDeadline && !isDone ? relevantDueDate(record, now) : null,
  }
}

function bucketOf(item, now) {
  if (item.isDone) return 'Done'
  if (!item.dueDate) return 'Today'
  const diffDays = Math.round((startOfDay(item.dueDate) - startOfDay(now)) / (1000 * 60 * 60 * 24))
  if (diffDays <= 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  return 'Future'
}

const SECTIONS = ['Today', 'Tomorrow', 'Future', 'Done']

export default function Tasks({ user }) {
  const [tasks, setTasks] = useState([])
  const [chores, setChores] = useState([])
  const [newTask, setNewTask] = useState('')
  const [assignTo, setAssignTo] = useState('Sam')
  const [filter, setFilter] = useState('all')
  const [aiInput, setAiInput] = useState('')
  const [aiResponse, setAiResponse] = useState('')
  const [aiLoading, setAiLoading] = useState(false)

  useEffect(() => { fetchTasks(); fetchChores() }, [])

  async function fetchTasks() {
    const { data } = await supabase.from('tasks').select('*').order('created_at', { ascending: false })
    if (data) setTasks(data)
  }

  async function fetchChores() {
    const { data } = await supabase.from('chores').select('*').order('created_at', { ascending: false })
    if (data) setChores(data)
  }

  async function addTask() {
    if (!newTask.trim()) return
    await supabase.from('tasks').insert({ name: newTask, assigned_to: assignTo })
    setNewTask('')
    fetchTasks()
  }

  async function toggleTask(task) {
    if (task.done) {
      await supabase.from('tasks').update({ done: false, completed_by: null, completed_at: null }).eq('id', task.id)
    } else {
      await supabase.from('tasks').update({ done: true, completed_by: user, completed_at: new Date().toISOString() }).eq('id', task.id)
      await supabase.from('history').insert({ who: user, task_name: task.name })
    }
    fetchTasks()
  }

  async function deleteTask(id) {
    await supabase.from('tasks').delete().eq('id', id)
    fetchTasks()
  }

  async function markChoreDone(chore) {
    await supabase.from('chores').update({ last_done_at: new Date().toISOString(), last_done_by: user }).eq('id', chore.id)
    await supabase.from('history').insert({ who: user, task_name: chore.name + ' (chore)' })
    fetchChores()
  }

  async function runAI() {
    if (!aiInput.trim()) return
    setAiLoading(true)
    setAiResponse('')
    const open = tasks.filter(t => !t.done).map(t => `${t.name} (${t.assigned_to})`).join(', ')
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        system: `You are a helpful household assistant for Sam and Anne (who just had a baby). Be warm and concise — 2-4 sentences. Open tasks: ${open || 'none'}. Current user: ${user}.`,
        messages: [{ role: 'user', content: aiInput }]
      })
    })
    const data = await res.json()
    setAiResponse(data.content?.[0]?.text || 'No response.')
    setAiLoading(false)
    setAiInput('')
  }

  const now = new Date()
  const items = [
    ...tasks.map(t => toItem(t, 'task', now)),
    ...chores.map(c => toItem(c, 'chore', now)),
  ].filter(item => {
    if (filter === 'mine') return item.assignedTo === user || item.assignedTo === 'Both'
    if (filter === 'open') return !item.isDone
    if (filter === 'done') return item.isDone
    return true
  })

  const sections = SECTIONS.map(name => {
    const sectionItems = items.filter(item => bucketOf(item, now) === name)
    sectionItems.sort((a, b) => {
      if (name === 'Done') return new Date(b.doneAt || 0) - new Date(a.doneAt || 0)
      const aKey = a.dueDate ? a.dueDate.getTime() : Infinity
      const bKey = b.dueDate ? b.dueDate.getTime() : Infinity
      return aKey - bKey
    })
    return { name, items: sectionItems }
  }).filter(section => section.items.length > 0)

  return (
    <div>
      <div className="ai-panel">
        <div className="ai-header">AI assist</div>
        <div className="add-row">
          <input value={aiInput} onChange={e => setAiInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && runAI()} placeholder="What should we tackle this weekend?" />
          <button onClick={runAI} disabled={aiLoading}>{aiLoading ? '...' : 'Ask'}</button>
        </div>
        {aiResponse && <div className="ai-response">{aiResponse}</div>}
      </div>

      <div className="section-header">
        <h2>Tasks</h2>
      </div>

      <div className="add-row">
        <input value={newTask} onChange={e => setNewTask(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTask()} placeholder="New task..." />
        <select value={assignTo} onChange={e => setAssignTo(e.target.value)}>
          <option>Sam</option>
          <option>Anne</option>
          <option>Both</option>
        </select>
        <button onClick={addTask}>Add</button>
      </div>

      <div className="filter-row">
        {['all','mine','open','done'].map(f => (
          <button key={f} className={filter === f ? 'filter-pill active' : 'filter-pill'} onClick={() => setFilter(f)}>{f}</button>
        ))}
      </div>

      {sections.map(section => (
        <div key={section.name}>
          <div className="section-divider"><span>{section.name}</span></div>
          {section.items.map(item => (
            <div
              key={`${item.type}-${item.id}`}
              className={item.type === 'chore' ? 'task-row chore-row' : 'task-row'}
              style={item.type === 'chore' ? { backgroundColor: choreColor(item.record) } : undefined}
            >
              <div
                className={`check ${item.isDone ? 'done' : ''}`}
                onClick={() => item.type === 'task' ? toggleTask(item.record) : markChoreDone(item.record)}
              />
              <div className="task-info">
                <div className={`task-name ${item.isDone ? 'done' : ''}`}>
                  {item.type === 'chore' && '🔁 '}{item.name}
                </div>
                <div className="task-meta">
                  <span className={`badge badge-${item.assignedTo.toLowerCase()}`}>{item.assignedTo}</span>
                  {item.type === 'task' && item.isDone && item.record.completed_by && (
                    <span>Done by {item.record.completed_by} {formatCompletedAt(item.record.completed_at)}</span>
                  )}
                  {item.type === 'chore' && hasDeadline(item.record) && <span>{formatDeadline(item.record)}</span>}
                  {item.type === 'chore' && item.isDone && (
                    <span>Last done: {formatCompletedAt(item.record.last_done_at)}</span>
                  )}
                </div>
              </div>
              {item.type === 'task' && (
                <button className="delete-btn" onClick={() => deleteTask(item.id)}>✕</button>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
