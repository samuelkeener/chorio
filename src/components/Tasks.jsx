import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function Tasks({ user }) {
  const [tasks, setTasks] = useState([])
  const [newTask, setNewTask] = useState('')
  const [assignTo, setAssignTo] = useState('Sam')
  const [filter, setFilter] = useState('all')
  const [aiInput, setAiInput] = useState('')
  const [aiResponse, setAiResponse] = useState('')
  const [aiLoading, setAiLoading] = useState(false)

  useEffect(() => { fetchTasks() }, [])

  async function fetchTasks() {
    const { data } = await supabase.from('tasks').select('*').order('created_at', { ascending: false })
    if (data) setTasks(data)
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
        system: `You are a helpful household assistant for Sam and his wife (who just had a baby). Be warm and concise — 2-4 sentences. Open tasks: ${open || 'none'}. Current user: ${user}.`,
        messages: [{ role: 'user', content: aiInput }]
      })
    })
    const data = await res.json()
    setAiResponse(data.content?.[0]?.text || 'No response.')
    setAiLoading(false)
    setAiInput('')
  }

  const filtered = tasks.filter(t => {
    if (filter === 'mine') return t.assigned_to === user || t.assigned_to === 'Both'
    if (filter === 'open') return !t.done
    if (filter === 'done') return t.done
    return true
  })

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
          <option>Wife</option>
          <option>Both</option>
        </select>
        <button onClick={addTask}>Add</button>
      </div>

      <div className="filter-row">
        {['all','mine','open','done'].map(f => (
          <button key={f} className={filter === f ? 'filter-pill active' : 'filter-pill'} onClick={() => setFilter(f)}>{f}</button>
        ))}
      </div>

      {filtered.map(task => (
        <div key={task.id} className="task-row">
          <div className={`check ${task.done ? 'done' : ''}`} onClick={() => toggleTask(task)} />
          <div className="task-info">
            <div className={`task-name ${task.done ? 'done' : ''}`}>{task.name}</div>
            <div className="task-meta">
              <span className={`badge badge-${task.assigned_to.toLowerCase()}`}>{task.assigned_to}</span>
              {task.done && task.completed_by && <span>Done by {task.completed_by}</span>}
            </div>
          </div>
          <button className="delete-btn" onClick={() => deleteTask(task.id)}>✕</button>
        </div>
      ))}
    </div>
  )
}