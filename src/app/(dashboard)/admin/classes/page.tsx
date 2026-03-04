'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type AdminClass = {
  id: string
  name: string
  campus_id: string
  campus_name: string
  member_count: number
  is_active: boolean
}

type Location = {
  id: string
  name: string
}

export default function AdminClassesPage() {
  const [classes, setClasses] = useState<AdminClass[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [newName, setNewName] = useState('')
  const [newLocationId, setNewLocationId] = useState('')
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    const [classesRes, locationsRes, meRes] = await Promise.all([
      fetch('/api/admin/classes'),
      fetch('/api/admin/campuses'),
      fetch('/api/user/me'),
    ])

    if (classesRes.ok) setClasses(await classesRes.json())
    if (locationsRes.ok) {
      const data = await locationsRes.json()
      setLocations(data)
      if (data.length > 0 && !newLocationId) setNewLocationId(data[0].id)
    }
    if (meRes.ok) {
      const me = await meRes.json()
      setIsSuperAdmin(me.role === 'super_admin')
    }
    setLoading(false)
  }

  async function createClass(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim() || !newLocationId) return
    setCreating(true)
    setError('')

    const res = await fetch('/api/admin/classes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim(), campus_id: newLocationId }),
    })

    if (res.ok) {
      setNewName('')
      await loadData()
    } else {
      const data = await res.json()
      setError(data.error || 'Failed to create class')
    }
    setCreating(false)
  }

  async function renameClass(classId: string) {
    if (!editName.trim()) return
    setError('')

    const res = await fetch('/api/admin/classes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: classId, name: editName.trim() }),
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

  async function deleteClass(classId: string) {
    if (!confirm('Are you sure? This cannot be undone.')) return
    setError('')

    const res = await fetch(`/api/admin/classes?id=${classId}`, { method: 'DELETE' })

    if (res.ok) {
      await loadData()
    } else {
      const data = await res.json()
      setError(data.error || 'Failed to delete')
    }
  }

  // Group classes by location
  const classesByLocation = locations.map(loc => ({
    location: loc,
    classes: classes.filter(c => c.campus_id === loc.id),
  }))

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
        <h1 className="text-2xl font-bold text-pep-gray">Manage Classes</h1>
        <span className="text-sm text-pep-gray">({classes.length})</span>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 rounded px-4 py-3 text-sm mb-4">{error}</div>
      )}

      {/* Create new class (super_admin only) */}
      {isSuperAdmin && (
        <div className="bg-pep-card rounded shadow-sm p-5 mb-6">
          <h2 className="uppercase tracking-[0.15em] text-pep-blue text-sm font-semibold mb-3">Create New Class</h2>
          <form onSubmit={createClass} className="flex gap-3">
            <input
              type="text"
              placeholder="Class name (e.g., Butterfly)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="flex-1 border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pep-blue/20"
            />
            <select
              value={newLocationId}
              onChange={(e) => setNewLocationId(e.target.value)}
              className="border border-gray-200 rounded px-3 py-2 text-sm cursor-pointer"
            >
              {locations.map(loc => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </select>
            <button
              type="submit"
              disabled={creating || !newName.trim()}
              className="bg-pep-blue text-white px-4 py-2 rounded text-sm font-medium hover:bg-pep-dark transition-colors cursor-pointer disabled:opacity-50 uppercase tracking-wider"
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
          </form>
        </div>
      )}

      {/* Classes grouped by location */}
      {classesByLocation.map(({ location, classes: locClasses }) => (
        <div key={location.id} className="mb-6">
          <h2 className="uppercase tracking-[0.15em] text-pep-blue text-sm font-semibold mb-3">
            {location.name}
          </h2>

          {locClasses.length === 0 ? (
            <p className="text-sm text-pep-gray bg-pep-card rounded shadow-sm p-4">
              No classes yet.{isSuperAdmin ? ' Create one above.' : ''}
            </p>
          ) : (
            <div className="space-y-2">
              {locClasses.map(cls => (
                <div key={cls.id} className="bg-pep-card rounded shadow-sm px-4 py-3 flex items-center justify-between">
                  {editingId === cls.id ? (
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') renameClass(cls.id)
                          if (e.key === 'Escape') { setEditingId(null); setEditName('') }
                        }}
                        className="flex-1 border border-gray-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-pep-blue/20"
                      />
                      <button
                        onClick={() => renameClass(cls.id)}
                        className="text-sm text-pep-coral hover:text-pep-coralhover cursor-pointer uppercase tracking-wider"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => { setEditingId(null); setEditName('') }}
                        className="text-sm text-pep-gray hover:underline cursor-pointer uppercase tracking-wider"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <div>
                        <span className="font-medium text-pep-gray">{cls.name}</span>
                        <span className="text-sm text-pep-gray ml-2">
                          {cls.member_count} member{cls.member_count !== 1 ? 's' : ''}
                        </span>
                      </div>
                      {isSuperAdmin && (
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => { setEditingId(cls.id); setEditName(cls.name) }}
                            className="text-sm text-pep-coral hover:text-pep-coralhover cursor-pointer"
                          >
                            Rename
                          </button>
                          {cls.member_count === 0 && (
                            <button
                              onClick={() => deleteClass(cls.id)}
                              className="text-sm text-pep-coral hover:text-pep-coralhover cursor-pointer"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
