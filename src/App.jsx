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

  return (
    <div className="app">
      <div className="header">
        <h1>Home hub</h1>
        <div className="person-toggle">
          <button className={user === 'Sam' ? 'pill sam active' : 'pill sam'} onClick={() => setUser('Sam')}>Sam</button>
          <button className={user === 'Wife' ? 'pill wife active' : 'pill wife'} onClick={() => setUser('Wife')}>Wife</button>
        </div>
      </div>

      <div className="tabs">
        {['tasks','chores','shopping','history'].map(t => (
          <button key={t} className={tab === t ? 'tab active' : 'tab'} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'tasks' && <Tasks user={user} />}
      {tab === 'chores' && <Chores user={user} />}
      {tab === 'shopping' && <Shopping user={user} />}
      {tab === 'history' && <History />}
    </div>
  )
}