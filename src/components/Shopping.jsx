import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function Shopping({ user }) {
  const [items, setItems] = useState([])
  const [newItem, setNewItem] = useState('')
  const [category, setCategory] = useState('Produce')
  const [editingNoteId, setEditingNoteId] = useState(null)
  const [noteDraft, setNoteDraft] = useState('')

  useEffect(() => { fetchItems() }, [])

  async function fetchItems() {
    const { data } = await supabase.from('shop_items').select('*').order('created_at', { ascending: false })
    if (data) setItems(data)
  }

  async function addItem() {
    if (!newItem.trim()) return
    await supabase.from('shop_items').insert({ name: newItem, category, added_by: user })
    setNewItem('')
    fetchItems()
  }

  async function toggleItem(item) {
    await supabase.from('shop_items').update({ checked: !item.checked }).eq('id', item.id)
    fetchItems()
  }

  async function deleteItem(id) {
    await supabase.from('shop_items').delete().eq('id', id)
    fetchItems()
  }

  async function clearChecked() {
    await supabase.from('shop_items').delete().eq('checked', true)
    fetchItems()
  }

  function startEditingNote(item) {
    setEditingNoteId(item.id)
    setNoteDraft(item.note || '')
  }

  async function saveNote(item) {
    setEditingNoteId(null)
    const trimmed = noteDraft.trim()
    if (trimmed === (item.note || '')) return
    await supabase.from('shop_items').update({ note: trimmed || null }).eq('id', item.id)
    fetchItems()
  }

  const categories = [...new Set(items.map(i => i.category))].sort()

  return (
    <div>
      <div className="section-header">
        <h2>Shopping list</h2>
        <button onClick={clearChecked}>Clear checked</button>
      </div>

      <div className="add-row">
        <input value={newItem} onChange={e => setNewItem(e.target.value)} onKeyDown={e => e.key === 'Enter' && addItem()} placeholder="Add item..." />
        <select value={category} onChange={e => setCategory(e.target.value)}>
          <option>Produce</option>
          <option>Dairy</option>
          <option>Meat</option>
          <option>Pantry</option>
          <option>Frozen</option>
          <option>Baby</option>
          <option>Household</option>
          <option>Other</option>
        </select>
        <button onClick={addItem}>Add</button>
      </div>

      {categories.map(cat => (
        <div key={cat} className="chore-group">
          <div className="chore-group-label">{cat}</div>
          {items.filter(i => i.category === cat).map(item => (
            <div key={item.id} className="shop-item">
              <input type="checkbox" checked={item.checked} onChange={() => toggleItem(item)} />
              <div className="shop-info">
                <span className={item.checked ? 'shop-label checked' : 'shop-label'}>{item.name}</span>
                {editingNoteId === item.id ? (
                  <input
                    className="task-note-input"
                    value={noteDraft}
                    autoFocus
                    placeholder="Note..."
                    onChange={e => setNoteDraft(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') saveNote(item)
                      if (e.key === 'Escape') setEditingNoteId(null)
                    }}
                    onBlur={() => saveNote(item)}
                  />
                ) : (
                  <div className="task-note editable-name" onClick={() => startEditingNote(item)}>
                    {item.note || '+ Note'}
                  </div>
                )}
              </div>
              <span className="shop-cat">by {item.added_by}</span>
              <button className="delete-btn" onClick={() => deleteItem(item.id)}>✕</button>
            </div>
          ))}
        </div>
      ))}

      {!items.length && <div className="empty">List is empty.</div>}
    </div>
  )
}