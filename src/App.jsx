import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import Tasks from './components/Tasks'
import Chores from './components/Chores'
import Shopping from './components/Shopping'
import History from './components/History'
import './App.css'

export default function App() {
  const [user, setUser] = useState('Sam')
  const [tab, setTab] = useState('tasks')
  const [projects, setProjects] = useState([])
  const [addingProject, setAddingProject] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [editingProjectId, setEditingProjectId] = useState(null)
  const [projectNameDraft, setProjectNameDraft] = useState('')

  useEffect(() => { fetchProjects() }, [])

  async function fetchProjects() {
    const { data } = await supabase.from('projects').select('*').order('created_at', { ascending: true })
    if (data) setProjects(data)
  }

  async function addProject() {
    const trimmed = newProjectName.trim()
    setAddingProject(false)
    setNewProjectName('')
    if (!trimmed) return
    const { data } = await supabase.from('projects').insert({ name: trimmed }).select().single()
    await fetchProjects()
    if (data) setTab(`project:${data.id}`)
  }

  function startEditingProject(p) {
    setEditingProjectId(p.id)
    setProjectNameDraft(p.name)
  }

  async function saveProjectName(p) {
    const trimmed = projectNameDraft.trim()
    setEditingProjectId(null)
    if (!trimmed || trimmed === p.name) return
    await supabase.from('projects').update({ name: trimmed }).eq('id', p.id)
    fetchProjects()
  }

  async function deleteProject(p) {
    if (!window.confirm(`Delete project "${p.name}"? This deletes all its tasks too.`)) return
    await supabase.from('projects').delete().eq('id', p.id)
    if (tab === `project:${p.id}`) setTab('tasks')
    fetchProjects()
  }

  const activeProject = projects.find(p => `project:${p.id}` === tab)

  return (
    <div className="app">
      <div className="header">
        <h1>Home hub</h1>
        <div className="person-toggle">
          <button className={user === 'Sam' ? 'pill sam active' : 'pill sam'} onClick={() => setUser('Sam')}>Sam</button>
          <button className={user === 'Anne' ? 'pill anne active' : 'pill anne'} onClick={() => setUser('Anne')}>Anne</button>
        </div>
      </div>

      <div className="tabs">
        {['tasks', 'chores', 'shopping', 'history'].map(t => (
          <button key={t} className={tab === t ? 'tab active' : 'tab'} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
        {projects.map(p => {
          const tabId = `project:${p.id}`
          const isActive = tab === tabId
          return (
            <div key={p.id} className={isActive ? 'tab project-tab active' : 'tab project-tab'}>
              {editingProjectId === p.id ? (
                <input
                  className="project-tab-input"
                  value={projectNameDraft}
                  autoFocus
                  onChange={e => setProjectNameDraft(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') saveProjectName(p)
                    if (e.key === 'Escape') setEditingProjectId(null)
                  }}
                  onBlur={() => saveProjectName(p)}
                />
              ) : (
                // Clicking the already-active project tab renames it; clicking an inactive one switches to it.
                <span onClick={() => (isActive ? startEditingProject(p) : setTab(tabId))}>{p.name}</span>
              )}
              {isActive && editingProjectId !== p.id && (
                <button className="delete-btn project-tab-delete" onClick={() => deleteProject(p)}>✕</button>
              )}
            </div>
          )
        })}
        {addingProject ? (
          <input
            className="project-tab-input new-project-input"
            value={newProjectName}
            autoFocus
            placeholder="Project name..."
            onChange={e => setNewProjectName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') addProject()
              if (e.key === 'Escape') { setAddingProject(false); setNewProjectName('') }
            }}
            // Blur without Enter just cancels - unlike renaming, creating is not idempotent,
            // so we can't safely fire the same insert from both Enter and blur.
            onBlur={() => { setAddingProject(false); setNewProjectName('') }}
          />
        ) : (
          <button className="tab add-tab" onClick={() => setAddingProject(true)}>+</button>
        )}
      </div>

      {tab === 'tasks' && <Tasks user={user} />}
      {tab === 'chores' && <Chores user={user} />}
      {tab === 'shopping' && <Shopping user={user} />}
      {tab === 'history' && <History />}
      {activeProject && <Tasks user={user} title={activeProject.name} projectId={activeProject.id} includeChores={false} />}
    </div>
  )
}
