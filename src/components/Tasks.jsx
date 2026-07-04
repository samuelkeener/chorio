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
      key: `task:${record.id}`,
      name: record.name,
      assignedTo: record.assigned_to,
      category: record.category,
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
    key: `chore:${record.id}`,
    name: record.name,
    assignedTo: record.assigned_to,
    category: null,
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
  const [showDone, setShowDone] = useState(true)
  const [activeCategories, setActiveCategories] = useState(new Set())
  const [editingNameKey, setEditingNameKey] = useState(null)
  const [nameDraft, setNameDraft] = useState('')
  const [editingAssigneeKey, setEditingAssigneeKey] = useState(null)
  const [editingCategoryKey, setEditingCategoryKey] = useState(null)
  const [categoryDraft, setCategoryDraft] = useState('')
  const [categoryTouched, setCategoryTouched] = useState(false)

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

  function refetch(item) {
    return item.type === 'task' ? fetchTasks() : fetchChores()
  }

  function startEditingName(item) {
    setEditingNameKey(item.key)
    setNameDraft(item.name)
  }

  async function saveName(item) {
    const trimmed = nameDraft.trim()
    setEditingNameKey(null)
    if (!trimmed || trimmed === item.name) return
    const table = item.type === 'task' ? 'tasks' : 'chores'
    await supabase.from(table).update({ name: trimmed }).eq('id', item.id)
    refetch(item)
  }

  async function saveAssignee(item, newAssignee) {
    setEditingAssigneeKey(null)
    if (newAssignee === item.assignedTo) return
    const table = item.type === 'task' ? 'tasks' : 'chores'
    await supabase.from(table).update({ assigned_to: newAssignee }).eq('id', item.id)
    refetch(item)
  }

  function startEditingCategory(item) {
    setEditingCategoryKey(item.key)
    // Start empty (not pre-filled with the current category) so the dropdown of every
    // existing category shows in full immediately, instead of Chrome filtering the
    // datalist suggestions down to matches of whatever text is already in the field.
    setCategoryDraft('')
    setCategoryTouched(false)
  }

  async function saveCategory(item) {
    setEditingCategoryKey(null)
    // Untouched (just clicked in and clicked away again) should never clear an existing category.
    if (!categoryTouched) return
    const trimmed = categoryDraft.trim()
    if (trimmed === (item.category || '')) return
    await supabase.from('tasks').update({ category: trimmed || null }).eq('id', item.id)
    fetchTasks()
  }

  function toggleCategory(cat) {
    setActiveCategories(prev => {
      const next = new Set(prev)
      next.has(cat) ? next.delete(cat) : next.add(cat)
      return next
    })
  }

  const categories = [...new Set(tasks.map(t => t.category).filter(Boolean))].sort()

  const now = new Date()
  const items = [
    ...tasks.map(t => toItem(t, 'task', now)),
    ...chores.map(c => toItem(c, 'chore', now)),
  ].filter(item => {
    if (filter === 'mine' && !(item.assignedTo === user || item.assignedTo === 'Both')) return false
    if (filter === 'open' && item.isDone) return false
    if (filter === 'done' && !item.isDone) return false
    if (activeCategories.size > 0 && item.type === 'task' && !activeCategories.has(item.category)) return false
    return true
  })

  const sections = SECTIONS.filter(name => name !== 'Done' || showDone).map(name => {
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
      <div className="section-header">
        <h2>Tasks</h2>
      </div>

      <datalist id="category-options">
        {categories.map(cat => <option key={cat} value={cat} />)}
      </datalist>

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
        <label className="interval-label show-done-toggle">
          <input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} /> Show done
        </label>
      </div>

      {categories.length > 0 && (
        <div className="filter-row">
          {categories.map(cat => (
            <button
              key={cat}
              className={activeCategories.has(cat) ? 'filter-pill active' : 'filter-pill'}
              onClick={() => toggleCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {sections.map(section => (
        <div key={section.name}>
          <div className="section-divider"><span>{section.name}</span></div>
          {section.items.map(item => (
            <div
              key={item.key}
              className={item.type === 'chore' ? 'task-row chore-row' : 'task-row'}
              style={item.type === 'chore' ? { backgroundColor: choreColor(item.record) } : undefined}
            >
              <div
                className={`check ${item.isDone ? 'done' : ''}`}
                onClick={() => item.type === 'task' ? toggleTask(item.record) : markChoreDone(item.record)}
              />
              <div className="task-info">
                {editingNameKey === item.key ? (
                  <input
                    className="task-name-input"
                    value={nameDraft}
                    autoFocus
                    onChange={e => setNameDraft(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') saveName(item)
                      if (e.key === 'Escape') setEditingNameKey(null)
                    }}
                    onBlur={() => saveName(item)}
                  />
                ) : (
                  <div className={`task-name editable-name ${item.isDone ? 'done' : ''}`} onClick={() => startEditingName(item)}>
                    {item.type === 'chore' && '🔁 '}{item.name}
                  </div>
                )}
                <div className="task-meta">
                  {editingAssigneeKey === item.key ? (
                    <select
                      className="assignee-select"
                      value={item.assignedTo}
                      autoFocus
                      onChange={e => saveAssignee(item, e.target.value)}
                      onBlur={() => setEditingAssigneeKey(null)}
                    >
                      <option>Sam</option>
                      <option>Anne</option>
                      <option>Both</option>
                    </select>
                  ) : (
                    <span
                      className={`badge badge-${item.assignedTo.toLowerCase()} editable-badge`}
                      onClick={() => setEditingAssigneeKey(item.key)}
                    >
                      {item.assignedTo}
                    </span>
                  )}
                  {item.type === 'task' && (
                    editingCategoryKey === item.key ? (
                      <input
                        className="category-input"
                        value={categoryDraft}
                        autoFocus
                        placeholder={item.category || 'Category...'}
                        list="category-options"
                        onChange={e => { setCategoryDraft(e.target.value); setCategoryTouched(true) }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') saveCategory(item)
                          if (e.key === 'Escape') setEditingCategoryKey(null)
                        }}
                        onBlur={() => saveCategory(item)}
                      />
                    ) : (
                      <span className="category-tag editable-badge" onClick={() => startEditingCategory(item)}>
                        {item.category || '+ Category'}
                      </span>
                    )
                  )}
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
