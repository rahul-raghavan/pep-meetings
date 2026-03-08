'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'

type ActionItem = {
  id: string
  description: string
  assigned_to: string | null
  due_date: string | null
  is_completed: boolean
  meeting_id: string
  meeting: {
    id: string
    title: string
    meeting_date: string
    meeting_type: string
  }
}

export default function ActionItemsPage() {
  const [items, setItems] = useState<ActionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'open' | 'completed' | 'all'>('open')
  const [search, setSearch] = useState('')

  const fetchItems = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (filter === 'open') params.set('completed', 'false')
    if (filter === 'completed') params.set('completed', 'true')
    if (search) params.set('search', search)

    const res = await fetch(`/api/action-items?${params}`)
    const data = await res.json()
    setItems(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [filter, search])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  async function toggleItem(item: ActionItem) {
    const res = await fetch(`/api/meetings/${item.meeting_id}/action-items`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: item.id, is_completed: !item.is_completed }),
    })
    if (res.ok) {
      const updated = await res.json()
      setItems(prev => prev.map(i => i.id === updated.id ? { ...i, ...updated } : i))
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    fetchItems()
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-pep-gray mb-6">Action Items</h1>

      {/* Filters */}
      <div className="bg-pep-card rounded shadow-sm p-4 mb-4 flex flex-col sm:flex-row gap-3">
        <form onSubmit={handleSearch} className="flex-1 flex gap-2">
          <input
            type="text"
            placeholder="Search action items..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pep-blue/20 focus:border-pep-blue"
          />
          <button
            type="submit"
            className="bg-pep-blue text-white px-4 py-2 rounded text-sm font-medium uppercase tracking-wider hover:bg-pep-dark transition-colors cursor-pointer"
          >
            Search
          </button>
        </form>
        <div className="flex gap-1">
          {(['open', 'completed', 'all'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-2 rounded text-sm font-medium uppercase tracking-wider transition-colors cursor-pointer ${
                filter === f ? 'bg-pep-blue text-white' : 'bg-gray-50 text-pep-gray hover:bg-gray-100'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Items */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-pep-card rounded shadow-sm p-4 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-2/3 mb-2" />
              <div className="h-3 bg-gray-100 rounded w-1/3" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="bg-pep-card rounded shadow-sm p-8 text-center">
          <p className="text-pep-gray">
            {filter === 'open' ? 'No open action items.' : filter === 'completed' ? 'No completed action items.' : 'No action items found.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="bg-pep-card rounded shadow-sm p-4 flex items-start gap-3">
              <input
                type="checkbox"
                checked={item.is_completed}
                onChange={() => toggleItem(item)}
                className="mt-1 h-4 w-4 rounded border-gray-300 text-pep-blue cursor-pointer"
              />
              <div className="flex-1">
                <p className={`text-sm ${item.is_completed ? 'line-through text-pep-gray' : 'text-pep-gray'}`}>
                  {item.description}
                </p>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  {item.assigned_to && (
                    <span className="text-xs bg-gray-100 text-pep-gray px-2 py-0.5 rounded">
                      {item.assigned_to}
                    </span>
                  )}
                  {item.due_date && (
                    <span className="text-xs text-pep-gray">
                      Due: {new Date(item.due_date).toLocaleDateString()}
                    </span>
                  )}
                  {item.meeting && (
                    <Link
                      href={`/meetings/${item.meeting.id}`}
                      className="text-xs text-pep-coral hover:text-pep-coralhover"
                    >
                      {item.meeting.title} ({new Date(item.meeting.meeting_date).toLocaleDateString()})
                    </Link>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
