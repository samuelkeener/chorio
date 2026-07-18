import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function History() {
  const [history, setHistory] = useState([])

  useEffect(() => { fetchHistory() }, [])

  async function fetchHistory() {
    const { data } = await supabase.from('history').select('*').order('created_at', { ascending: false }).limit(50)
    if (data) setHistory(data)
  }

  async function deleteEntry(id) {
    await supabase.from('history').delete().eq('id', id)
    fetchHistory()
  }

  async function clearHistory() {
    if (!window.confirm('Clear all history? This cannot be undone.')) return
    await supabase.from('history').delete().not('id', 'is', null)
    fetchHistory()
  }

  const samCount = history.filter(h => h.who === 'Sam').length
  const anneCount = history.filter(h => h.who === 'Anne').length

  return (
    <div>
      <div className="stats-grid">
        <div className="stat"><div className="stat-label">Sam completed</div><div className="stat-val">{samCount}</div></div>
        <div className="stat"><div className="stat-label">Anne completed</div><div className="stat-val">{anneCount}</div></div>
        <div className="stat"><div className="stat-label">Total</div><div className="stat-val">{history.length}</div></div>
      </div>

      <div className="section-header">
        <h2>Completion log</h2>
        {!!history.length && <button onClick={clearHistory}>Clear history</button>}
      </div>

      {history.map(h => (
        <div key={h.id} className="history-row">
          <span className="history-who" style={{color: h.who === 'Sam' ? '#185FA5' : '#993556'}}>{h.who}</span>
          <span className="history-task">{h.task_name}</span>
          <span className="history-when">{new Date(h.created_at).toLocaleDateString()}</span>
          <button className="delete-btn" onClick={() => deleteEntry(h.id)}>✕</button>
        </div>
      ))}

      {!history.length && <div className="empty">Nothing completed yet.</div>}
    </div>
  )
}