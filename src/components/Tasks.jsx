import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { hasDeadline, doneForCurrentCycle, relevantDueDate, choreColor, taskColor, isSkippedToday, isTooFarOut, toDatetimeLocal, formatDateTime } from '../choreLogic'

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

// Order among undated items: explicit sort_order wins (ascending), then falls back to
// newest-created-first for anything never manually reordered - matches the pre-reorder default.
function compareBySortOrder(a, b) {
  const ao = a.record.sort_order
  const bo = b.record.sort_order
  if (ao != null && bo != null) return ao - bo
  if (ao != null) return -1
  if (bo != null) return 1
  return new Date(b.record.created_at) - new Date(a.record.created_at)
}

// Normalize a task or chore into the shape the merged deadline/no-deadline/Done list needs.
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
      dueDate: record.deadline ? new Date(record.deadline) : null,
    }
  }

  // chore
  const withDeadline = hasDeadline(record)
  const isDoneForCycle = withDeadline
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
    // Deadline chores never show as "done" here - completing one just rolls dueDate forward to
    // the next occurrence, so it reappears as a fresh, unchecked entry with the updated deadline
    // rather than sitting checked-off (there's always another occurrence coming). Ambient chores
    // (no manual deadline) have no discrete next occurrence to roll forward to, so they still
    // show checked for the rest of the day they're done.
    isDone: withDeadline ? false : isDoneForCycle,
    doneAt: record.last_done_at,
    // Always the real next occurrence: upcoming if just done, or pinned in the past (overdue) if
    // not. Chores never move to the Done section (see below) - this drives their position in the
    // deadline-sorted flow instead. Ambient chores have no specific calendar date to place them on.
    dueDate: withDeadline ? relevantDueDate(record, now) : null,
  }
}

export default function Tasks({ user, theme = 'light', title = 'Tasks', projectId = null, includeChores = true }) {
  const [tasks, setTasks] = useState([])
  const [chores, setChores] = useState([])
  const [newTask, setNewTask] = useState('')
  const [assignTo, setAssignTo] = useState('Sam')
  const [newCategory, setNewCategory] = useState('')
  const [filter, setFilter] = useState('mine')
  const [showDone, setShowDone] = useState(true)
  const [activeCategories, setActiveCategories] = useState(new Set())
  const [editingNameKey, setEditingNameKey] = useState(null)
  const [nameDraft, setNameDraft] = useState('')
  const [editingAssigneeKey, setEditingAssigneeKey] = useState(null)
  const [editingCategoryKey, setEditingCategoryKey] = useState(null)
  const [categoryDraft, setCategoryDraft] = useState('')
  const [categoryTouched, setCategoryTouched] = useState(false)
  const [editingCompletedByKey, setEditingCompletedByKey] = useState(null)
  const [editingDeadlineKey, setEditingDeadlineKey] = useState(null)
  const [deadlineDraft, setDeadlineDraft] = useState('')
  const [editingNoteKey, setEditingNoteKey] = useState(null)
  const [noteDraft, setNoteDraft] = useState('')

  useEffect(() => { fetchTasks(); if (includeChores) fetchChores() }, [projectId])

  async function fetchTasks() {
    let query = supabase.from('tasks').select('*').order('created_at', { ascending: false })
    query = projectId ? query.eq('project_id', projectId) : query.is('project_id', null)
    const { data } = await query
    if (data) setTasks(data)
  }

  async function fetchChores() {
    const { data } = await supabase.from('chores').select('*').order('created_at', { ascending: false })
    if (data) setChores(data)
  }

  async function addTask() {
    if (!newTask.trim()) return
    await supabase.from('tasks').insert({ name: newTask, assigned_to: assignTo, category: newCategory.trim() || null, project_id: projectId })
    setNewTask('')
    setNewCategory('')
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

  // Deletes whatever done tasks are currently visible in the Done section (respects the active
  // filter/category selection). Chores never appear in Done - they always stay in the
  // deadline-sorted flow at their real next occurrence, checkbox reflecting done/not-done - so
  // there's nothing for this to do to them.
  async function clearDone(doneTaskIds) {
    if (!doneTaskIds.length) return
    if (!window.confirm(`Clear ${doneTaskIds.length} done task${doneTaskIds.length === 1 ? '' : 's'}? This cannot be undone.`)) return
    await supabase.from('tasks').delete().in('id', doneTaskIds)
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

  async function saveCompletedBy(item, newCompletedBy) {
    setEditingCompletedByKey(null)
    if (newCompletedBy === item.record.completed_by) return
    await supabase.from('tasks').update({ completed_by: newCompletedBy }).eq('id', item.id)
    fetchTasks()
  }

  function startEditingDeadline(item) {
    setEditingDeadlineKey(item.key)
    setDeadlineDraft(toDatetimeLocal(item.record.deadline))
  }

  async function saveDeadline(item) {
    setEditingDeadlineKey(null)
    if (!deadlineDraft) return
    await supabase.from('tasks').update({ deadline: new Date(deadlineDraft).toISOString() }).eq('id', item.id)
    fetchTasks()
  }

  async function clearDeadline(item) {
    setEditingDeadlineKey(null)
    await supabase.from('tasks').update({ deadline: null }).eq('id', item.id)
    fetchTasks()
  }

  function startEditingNote(item) {
    setEditingNoteKey(item.key)
    setNoteDraft(item.record.note || '')
  }

  async function saveNote(item) {
    setEditingNoteKey(null)
    const trimmed = noteDraft.trim()
    if (trimmed === (item.record.note || '')) return
    await supabase.from('tasks').update({ note: trimmed || null }).eq('id', item.id)
    fetchTasks()
  }

  // Renumbers the whole undated group to match the new order after a single up/down move -
  // sidesteps tie-breaking edge cases from swapping just two possibly-null sort_order values.
  async function moveWithinNoDeadline(list, index, direction) {
    const otherIndex = index + direction
    if (otherIndex < 0 || otherIndex >= list.length) return
    const reordered = [...list]
    const [moved] = reordered.splice(index, 1)
    reordered.splice(otherIndex, 0, moved)
    await Promise.all(reordered.map((item, i) => {
      const table = item.type === 'task' ? 'tasks' : 'chores'
      return supabase.from(table).update({ sort_order: i }).eq('id', item.id)
    }))
    await fetchTasks()
    if (includeChores) await fetchChores()
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
    ...(includeChores ? chores.filter(c => !isSkippedToday(c, now) && !isTooFarOut(c, now)).map(c => toItem(c, 'chore', now)) : []),
  ].filter(item => {
    if (filter === 'mine' && !(item.assignedTo === user || item.assignedTo === 'Both')) return false
    if (filter === 'open' && item.isDone) return false
    if (filter === 'done' && !item.isDone) return false
    if (activeCategories.size > 0) {
      if (item.type === 'chore') return false
      if (!activeCategories.has(item.category)) return false
    }
    return true
  })

  // Chores never move to Done - they always stay in the deadline/no-deadline flow at their real
  // next occurrence (checkbox still reflects done/not-done). Only tasks get a separate Done pile.
  const openItems = items.filter(item => item.type === 'chore' || !item.isDone)
  const withDeadline = openItems.filter(item => item.dueDate).sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
  const noDeadline = openItems.filter(item => !item.dueDate).sort(compareBySortOrder)
  const doneItems = items.filter(item => item.type === 'task' && item.isDone).sort((a, b) => new Date(b.doneAt || 0) - new Date(a.doneAt || 0))

  const sections = [
    { name: null, items: withDeadline },
    { name: 'No deadline', items: noDeadline },
    ...(showDone ? [{ name: 'Done', items: doneItems }] : []),
  ].filter(section => section.items.length > 0)

  return (
    <div>
      <div className="section-header">
        <h2>{title}</h2>
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
        <input
          className="category-input new-category-input"
          value={newCategory}
          onChange={e => setNewCategory(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addTask()}
          placeholder="Category..."
          list="category-options"
        />
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
        <div key={section.name || 'deadline'}>
          {section.name && (
            <div className="section-divider">
              <span>
                {section.name}
                {section.name === 'Done' && section.items.length > 0 && (
                  <button
                    className="clear-done-btn"
                    onClick={() => clearDone(section.items.map(i => i.id))}
                  >
                    Clear done
                  </button>
                )}
              </span>
            </div>
          )}
          {section.items.map((item, idx) => {
            const color = item.type === 'chore' ? choreColor(item.record, theme === 'dark') : taskColor(item.record, theme === 'dark')
            return (
            <div
              key={item.key}
              className={color ? 'task-row chore-row' : 'task-row'}
              style={color ? { backgroundColor: color } : undefined}
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
                {item.type === 'task' && (
                  editingNoteKey === item.key ? (
                    <input
                      className="task-note-input"
                      value={noteDraft}
                      autoFocus
                      placeholder="Note..."
                      onChange={e => setNoteDraft(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') saveNote(item)
                        if (e.key === 'Escape') setEditingNoteKey(null)
                      }}
                      onBlur={() => saveNote(item)}
                    />
                  ) : (
                    <div className="task-note editable-name" onClick={() => startEditingNote(item)}>
                      {item.record.note || '+ Note'}
                    </div>
                  )
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
                    editingCompletedByKey === item.key ? (
                      <select
                        className="assignee-select"
                        value={item.record.completed_by}
                        autoFocus
                        onChange={e => saveCompletedBy(item, e.target.value)}
                        onBlur={() => setEditingCompletedByKey(null)}
                      >
                        <option>Sam</option>
                        <option>Anne</option>
                      </select>
                    ) : (
                      <span className="editable-name" onClick={() => setEditingCompletedByKey(item.key)}>
                        Done by {item.record.completed_by} {formatCompletedAt(item.record.completed_at)}
                      </span>
                    )
                  )}
                  {item.type === 'chore' && item.dueDate && <span>Due {formatDateTime(item.dueDate)}</span>}
                  {item.type === 'chore' && (
                    <span>{item.record.last_done_at ? `Last done: ${formatCompletedAt(item.record.last_done_at)}` : 'Never done'}</span>
                  )}
                  {item.type === 'task' && editingDeadlineKey !== item.key && (
                    <span className="deadline-edit-link" onClick={() => startEditingDeadline(item)}>
                      {item.record.deadline ? `Due ${formatDateTime(item.record.deadline)}` : 'Set deadline'}
                    </span>
                  )}
                </div>
                {item.type === 'task' && editingDeadlineKey === item.key && (
                  <div className="deadline-editor">
                    <input type="datetime-local" value={deadlineDraft} onChange={e => setDeadlineDraft(e.target.value)} />
                    <button onClick={() => saveDeadline(item)}>Save</button>
                    {item.record.deadline && <button onClick={() => clearDeadline(item)}>Clear</button>}
                    <button onClick={() => setEditingDeadlineKey(null)}>Cancel</button>
                  </div>
                )}
              </div>
              {section.name === 'No deadline' && (
                <div className="reorder-btns">
                  <button disabled={idx === 0} onClick={() => moveWithinNoDeadline(section.items, idx, -1)}>▲</button>
                  <button disabled={idx === section.items.length - 1} onClick={() => moveWithinNoDeadline(section.items, idx, 1)}>▼</button>
                </div>
              )}
              {item.type === 'task' && (
                <button className="delete-btn" onClick={() => deleteTask(item.id)}>✕</button>
              )}
            </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
