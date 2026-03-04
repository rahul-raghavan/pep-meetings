'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type Location = {
  id: string
  name: string
  user_count: number
  class_count: number
}

export default function AdminPage() {
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [unassignedCount, setUnassignedCount] = useState<number | null>(null)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)

  useEffect(() => {
    async function load() {
      const [locRes, meRes] = await Promise.all([
        fetch('/api/admin/campuses'),
        fetch('/api/user/me'),
      ])

      if (locRes.ok) {
        setLocations(await locRes.json())
      }

      let isSA = false
      if (meRes.ok) {
        const me = await meRes.json()
        isSA = me.role === 'super_admin'
        setIsSuperAdmin(isSA)
      }

      // Only fetch stats for super_admins (lightweight endpoint)
      if (isSA) {
        const statsRes = await fetch('/api/admin/stats')
        if (statsRes.ok) {
          const stats = await statsRes.json()
          setUnassignedCount(stats.unassignedMeetingCount)
        }
      }

      setLoading(false)
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-gray-200 rounded w-1/4" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <div key={i} className="h-32 bg-gray-100 rounded" />)}
        </div>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-pep-gray mb-6">Admin Dashboard</h1>

      {/* Location stats */}
      {locations.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {locations.map(loc => (
            <div key={loc.id} className="bg-pep-card rounded shadow-sm p-5">
              <h3 className="uppercase tracking-[0.15em] text-pep-blue text-sm font-semibold">{loc.name}</h3>
              <div className="flex gap-4 mt-3">
                <div>
                  <p className="text-2xl font-bold text-pep-blue">{loc.user_count}</p>
                  <p className="text-xs text-pep-gray">Users</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-pep-blue">{loc.class_count}</p>
                  <p className="text-xs text-pep-gray">Classes</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Unassigned meetings alert */}
      {isSuperAdmin && unassignedCount !== null && unassignedCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded px-5 py-4 mb-6">
          <p className="font-medium text-amber-800">
            {unassignedCount} meeting{unassignedCount !== 1 ? 's' : ''} not assigned to a class
          </p>
          <p className="text-sm text-amber-700 mt-1">
            These meetings are only visible to super admins. Assign them to classes so teachers can see them.
          </p>
        </div>
      )}

      {/* Quick links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Link
          href="/admin/users"
          className="bg-pep-card rounded shadow-sm p-5 hover:shadow-md transition-shadow"
        >
          <h3 className="uppercase tracking-[0.15em] text-pep-blue text-sm font-semibold">Manage Users</h3>
          <p className="text-sm text-pep-gray mt-1">
            {isSuperAdmin
              ? 'Assign users to locations, classes, and roles'
              : 'Assign users to classes in your location'}
          </p>
        </Link>
        <Link
          href="/admin/classes"
          className="bg-pep-card rounded shadow-sm p-5 hover:shadow-md transition-shadow"
        >
          <h3 className="uppercase tracking-[0.15em] text-pep-blue text-sm font-semibold">Manage Classes</h3>
          <p className="text-sm text-pep-gray mt-1">
            {isSuperAdmin
              ? 'Create and manage classes across all locations'
              : 'View classes in your location'}
          </p>
        </Link>
        {isSuperAdmin && (
          <Link
            href="/admin/locations"
            className="bg-pep-card rounded shadow-sm p-5 hover:shadow-md transition-shadow"
          >
            <h3 className="uppercase tracking-[0.15em] text-pep-blue text-sm font-semibold">Manage Locations</h3>
            <p className="text-sm text-pep-gray mt-1">
              Add or edit school locations (HSR, Whitefield, etc.)
            </p>
          </Link>
        )}
      </div>
    </div>
  )
}
