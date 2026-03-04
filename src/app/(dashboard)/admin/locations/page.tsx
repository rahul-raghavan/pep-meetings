'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type Location = {
  id: string
  name: string
  user_count: number
  class_count: number
}

export default function AdminLocationsPage() {
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    const res = await fetch('/api/admin/campuses')
    if (res.ok) setLocations(await res.json())
    setLoading(false)
  }

  async function createLocation(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    setCreating(true)
    setError('')

    const res = await fetch('/api/admin/campuses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim() }),
    })

    if (res.ok) {
      setNewName('')
      await loadData()
    } else {
      const data = await res.json()
      setError(data.error || 'Failed to create location')
    }
    setCreating(false)
  }

  async function renameLocation(locId: string) {
    if (!editName.trim()) return
    setError('')

    const res = await fetch('/api/admin/campuses', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: locId, name: editName.trim() }),
    })

    if (res.ok) {
      setEditingId(null)
      setEditName('')
      await loadData()
    } else {
      const data = await res.json()
      setError(data.error || 'Failed to rename')
    }
  }

  async function deleteLocation(locId: string) {
    if (!confirm('Are you sure you want to delete this location?')) return
    setError('')

    const res = await fetch(`/api/admin/campuses?id=${locId}`, { method: 'DELETE' })

    if (res.ok) {
      await loadData()
    } else {
      const data = await res.json()
      setError(data.error || 'Failed to delete')
    }
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-gray-200 rounded w-1/4" />
        {[1, 2, 3].map(i => <div key={i} className="h-16 bg-gray-100 rounded" />)}
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin" className="text-pep-gray hover:text-pep-gray transition-colors">&larr;</Link>
        <h1 className="text-2xl font-bold text-pep-gray">Manage Locations</h1>
        <span className="text-sm text-pep-gray">({locations.length})</span>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 rounded px-4 py-3 text-sm mb-4">{error}</div>
      )}

      {/* Create new location */}
      <div className="bg-pep-card rounded shadow-sm p-5 mb-6">
        <h2 className="uppercase tracking-[0.15em] text-pep-blue text-sm font-semibold mb-3">Add New Location</h2>
        <form onSubmit={createLocation} className="flex gap-3">
          <input
            type="text"
            placeholder="Location name (e.g., Indiranagar)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="flex-1 border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pep-blue/20"
          />
          <button
            type="submit"
            disabled={creating || !newName.trim()}
            className="bg-pep-blue text-white px-4 py-2 rounded text-sm font-medium hover:bg-pep-dark transition-colors cursor-pointer disabled:opacity-50 uppercase tracking-wider"
          >
            {creating ? 'Adding...' : 'Add'}
          </button>
        </form>
      </div>

      {/* Locations list */}
      <div className="space-y-2">
        {locations.map(loc => (
          <div key={loc.id} className="bg-pep-card rounded shadow-sm px-5 py-4 flex items-center justify-between">
            {editingId === loc.id ? (
              <div className="flex items-center gap-2 flex-1">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') renameLocation(loc.id)
                    if (e.key === 'Escape') { setEditingId(null); setEditName('') }
                  }}
                  className="flex-1 border border-gray-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-pep-blue/20"
                />
                <button onClick={() => renameLocation(loc.id)} className="text-sm text-pep-coral hover:text-pep-coralhover cursor-pointer uppercase tracking-wider">Save</button>
                <button onClick={() => { setEditingId(null); setEditName('') }} className="text-sm text-pep-gray hover:underline cursor-pointer uppercase tracking-wider">Cancel</button>
              </div>
            ) : (
              <>
                <div>
                  <h3 className="font-semibold text-pep-gray">{loc.name}</h3>
                  <p className="text-sm text-pep-gray mt-0.5">
                    {loc.user_count} user{loc.user_count !== 1 ? 's' : ''} &middot; {loc.class_count} class{loc.class_count !== 1 ? 'es' : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => { setEditingId(loc.id); setEditName(loc.name) }}
                    className="text-sm text-pep-coral hover:text-pep-coralhover cursor-pointer"
                  >
                    Rename
                  </button>
                  {loc.user_count === 0 && loc.class_count === 0 && (
                    <button
                      onClick={() => deleteLocation(loc.id)}
                      className="text-sm text-pep-coral hover:text-pep-coralhover cursor-pointer"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
