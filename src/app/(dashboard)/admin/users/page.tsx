'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type ClassInfo = { id: string; name: string }

type AdminUser = {
  id: string
  email: string
  name: string
  role: 'super_admin' | 'admin' | 'user'
  campus_id: string | null
  campus_name: string | null
  is_active: boolean
  classes: ClassInfo[]
}

type AvailableClass = {
  id: string
  name: string
  campus_id: string
  campus_name: string
}

type Location = {
  id: string
  name: string
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  user: 'User',
}

const ROLE_COLORS: Record<string, string> = {
  super_admin: 'bg-purple-100 text-purple-800',
  admin: 'bg-blue-100 text-blue-800',
  user: 'bg-gray-100 text-gray-700',
}

function ClassCheckboxes({
  classes,
  locations,
  selectedIds,
  onToggle,
}: {
  classes: AvailableClass[]
  locations: Location[]
  selectedIds: string[]
  onToggle: (id: string) => void
}) {
  // Group classes by location
  const grouped = locations
    .map(loc => ({
      location: loc,
      classes: classes.filter(c => c.campus_id === loc.id),
    }))
    .filter(g => g.classes.length > 0)

  if (classes.length === 0) {
    return <p className="text-sm text-pep-gray">No classes available. Create classes first.</p>
  }

  return (
    <div className="space-y-3">
      {grouped.map(({ location, classes: locClasses }) => (
        <div key={location.id}>
          <p className="text-xs font-medium text-pep-gray uppercase tracking-wide mb-1.5">{location.name}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {locClasses.map(c => (
              <label key={c.id} className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(c.id)}
                  onChange={() => onToggle(c.id)}
                  className="rounded border-gray-300 text-pep-blue focus:ring-pep-blue/30 cursor-pointer"
                />
                <span className="text-sm text-pep-gray">{c.name}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [classes, setClasses] = useState<AvailableClass[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editRole, setEditRole] = useState('')
  const [editClassIds, setEditClassIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Create user form state
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newRole, setNewRole] = useState('user')
  const [newClassIds, setNewClassIds] = useState<string[]>([])
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    const [usersRes, classesRes, locationsRes, meRes] = await Promise.all([
      fetch('/api/admin/users'),
      fetch('/api/admin/classes'),
      fetch('/api/admin/campuses'),
      fetch('/api/user/me'),
    ])

    if (usersRes.ok) setUsers(await usersRes.json())
    if (classesRes.ok) setClasses(await classesRes.json())
    if (locationsRes.ok) setLocations(await locationsRes.json())
    if (meRes.ok) {
      const me = await meRes.json()
      setIsSuperAdmin(me.role === 'super_admin')
    }
    setLoading(false)
  }

  function startEditing(u: AdminUser) {
    setEditingId(u.id)
    setEditRole(u.role)
    setEditClassIds(u.classes.map(c => c.id))
    setError('')
  }

  function cancelEditing() {
    setEditingId(null)
    setEditRole('')
    setEditClassIds([])
    setError('')
  }

  function toggleEditClass(classId: string) {
    setEditClassIds(prev =>
      prev.includes(classId) ? prev.filter(id => id !== classId) : [...prev, classId]
    )
  }

  function toggleNewClass(classId: string) {
    setNewClassIds(prev =>
      prev.includes(classId) ? prev.filter(id => id !== classId) : [...prev, classId]
    )
  }

  async function saveUser(userId: string) {
    setSaving(true)
    setError('')

    const body: Record<string, unknown> = {
      user_id: userId,
      class_ids: editClassIds,
    }

    // Only super_admin sends role/active changes
    if (isSuperAdmin) {
      body.role = editRole
    }

    const res = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (res.ok) {
      await loadData()
      cancelEditing()
    } else {
      const data = await res.json()
      setError(data.error || 'Failed to save')
    }
    setSaving(false)
  }

  async function toggleActive(userId: string, currentlyActive: boolean) {
    const res = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, is_active: !currentlyActive }),
    })

    if (res.ok) {
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_active: !currentlyActive } : u))
    }
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim() || !newEmail.trim()) return
    setCreating(true)
    setError('')

    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newName.trim(),
        email: newEmail.trim().toLowerCase(),
        role: newRole,
        class_ids: newClassIds,
      }),
    })

    if (res.ok) {
      setNewName('')
      setNewEmail('')
      setNewRole('user')
      setNewClassIds([])
      setShowCreateForm(false)
      await loadData()
    } else {
      const data = await res.json()
      setError(data.error || 'Failed to create user')
    }
    setCreating(false)
  }

  function resetCreateForm() {
    setShowCreateForm(false)
    setNewName('')
    setNewEmail('')
    setNewRole('user')
    setNewClassIds([])
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
        <h1 className="text-2xl font-bold text-pep-gray">Manage Users</h1>
        <span className="text-sm text-pep-gray">({users.length})</span>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 rounded px-4 py-3 text-sm mb-4">{error}</div>
      )}

      {/* Create user */}
      <div className="mb-6">
          {!showCreateForm ? (
            <button
              onClick={() => setShowCreateForm(true)}
              className="bg-pep-blue text-white px-4 py-2 rounded text-sm font-medium hover:bg-pep-dark transition-colors cursor-pointer uppercase tracking-wider"
            >
              + Add User
            </button>
          ) : (
            <div className="bg-pep-card rounded shadow-sm p-5">
              <h2 className="uppercase tracking-[0.15em] text-pep-blue text-sm font-semibold mb-3">Add New User</h2>
              <p className="text-sm text-pep-gray mb-4">
                Create a user before they sign in. When they log in with Google using this email, they&apos;ll automatically get the role and classes you set here.
              </p>
              <form onSubmit={createUser} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    placeholder="Full name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pep-blue/20"
                  />
                  <input
                    type="email"
                    placeholder="Email address"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pep-blue/20"
                  />
                </div>

                {isSuperAdmin && (
                <div>
                  <label className="block text-sm font-medium text-pep-gray mb-1">Role</label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    className="border border-gray-200 rounded px-3 py-2 text-sm cursor-pointer"
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                    <option value="super_admin">Super Admin</option>
                  </select>
                </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-pep-gray mb-1">Assign to classes</label>
                  <ClassCheckboxes
                    classes={classes}
                    locations={locations}
                    selectedIds={newClassIds}
                    onToggle={toggleNewClass}
                  />
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={creating || !newName.trim() || !newEmail.trim()}
                    className="bg-pep-blue text-white px-4 py-2 rounded text-sm font-medium hover:bg-pep-dark transition-colors cursor-pointer disabled:opacity-50 uppercase tracking-wider"
                  >
                    {creating ? 'Creating...' : 'Create User'}
                  </button>
                  <button
                    type="button"
                    onClick={resetCreateForm}
                    className="text-sm text-pep-gray hover:underline cursor-pointer px-3 py-2 uppercase tracking-wider"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}
      </div>

      <div className="space-y-2">
        {users.map(u => {
          const isEditing = editingId === u.id

          return (
            <div key={u.id} className={`bg-pep-card rounded shadow-sm p-4 ${!u.is_active ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-pep-gray">{u.name}</h3>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${ROLE_COLORS[u.role]}`}>
                      {ROLE_LABELS[u.role]}
                    </span>
                    {!u.is_active && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded bg-red-100 text-red-700">
                        Inactive
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-pep-gray">{u.email}</p>
                  {u.classes.length > 0 ? (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {u.classes.map(c => (
                        <span key={c.id} className="text-xs bg-pep-blue/10 text-pep-blue px-2 py-0.5 rounded">
                          {c.name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-amber-600 mt-1">No classes assigned</p>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0 ml-3">
                  {!isEditing ? (
                    <>
                      {/* Admins can only edit regular users, not other admins/super_admins */}
                      {(isSuperAdmin || u.role === 'user') && (
                      <button
                        onClick={() => startEditing(u)}
                        className="text-sm text-pep-coral hover:text-pep-coralhover cursor-pointer"
                      >
                        Edit
                      </button>
                      )}
                      {isSuperAdmin && (
                        <button
                          onClick={() => toggleActive(u.id, u.is_active)}
                          className={`text-sm cursor-pointer ${u.is_active ? 'text-pep-coral hover:text-pep-coralhover' : 'text-green-600 hover:underline'}`}
                        >
                          {u.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <button
                        onClick={cancelEditing}
                        className="text-sm text-pep-gray hover:underline cursor-pointer uppercase tracking-wider"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => saveUser(u.id)}
                        disabled={saving}
                        className="text-sm bg-pep-blue text-white px-3 py-1 rounded hover:bg-pep-dark transition-colors cursor-pointer disabled:opacity-50 uppercase tracking-wider"
                      >
                        {saving ? 'Saving...' : 'Save'}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Editing panel */}
              {isEditing && (
                <div className="mt-3 pt-3 border-t border-gray-100 space-y-3">
                  {/* Role (super_admin only) */}
                  {isSuperAdmin && (
                    <div>
                      <label className="block text-sm font-medium text-pep-gray mb-1">Role</label>
                      <select
                        value={editRole}
                        onChange={(e) => setEditRole(e.target.value)}
                        className="border border-gray-200 rounded px-3 py-2 text-sm cursor-pointer"
                      >
                        <option value="user">User</option>
                        <option value="admin">Admin</option>
                        <option value="super_admin">Super Admin</option>
                      </select>
                    </div>
                  )}

                  {/* Class assignments (both admin and super_admin) */}
                  <div>
                    <label className="block text-sm font-medium text-pep-gray mb-1">Classes</label>
                    <ClassCheckboxes
                      classes={classes}
                      locations={locations}
                      selectedIds={editClassIds}
                      onToggle={toggleEditClass}
                    />
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
