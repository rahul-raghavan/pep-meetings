'use client'

import { useEffect, useState } from 'react'

type UserClass = {
  id: string
  name: string
  campus_name: string
}

type ClassSelectorProps = {
  value: string[]
  onChange: (classIds: string[]) => void
  disabled?: boolean
}

export function ClassSelector({ value, onChange, disabled }: ClassSelectorProps) {
  const [classes, setClasses] = useState<UserClass[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchClasses() {
      const res = await fetch('/api/user/classes')
      if (res.ok) {
        const data = await res.json()
        setClasses(data)
        // Auto-select if only one class
        if (data.length === 1 && value.length === 0) {
          onChange([data[0].id])
        }
      }
      setLoading(false)
    }
    fetchClasses()
  }, [])

  if (loading) {
    return (
      <div className="text-sm text-pep-gray py-2">Loading classes...</div>
    )
  }

  if (classes.length === 0) {
    return (
      <div className="bg-amber-50 text-amber-800 rounded px-4 py-3 text-sm">
        You haven&apos;t been assigned to any classes yet. Ask your admin to assign you to a class.
      </div>
    )
  }

  // Auto-selected (1 class) — show it but don't require interaction
  if (classes.length === 1) {
    return (
      <div className="text-sm text-pep-gray py-1">
        Class: <span className="font-medium text-pep-gray">{classes[0].name}</span>
        <span className="text-pep-gray ml-1">({classes[0].campus_name})</span>
      </div>
    )
  }

  // Multiple classes — show checkboxes
  function toggleClass(classId: string) {
    if (value.includes(classId)) {
      onChange(value.filter(id => id !== classId))
    } else {
      onChange([...value, classId])
    }
  }

  // Group by campus
  const campuses = [...new Set(classes.map(c => c.campus_name))]

  return (
    <div>
      <label className="block text-sm font-medium text-pep-gray mb-1.5">Classes</label>
      <div className="space-y-2">
        {campuses.map(campus => {
          const campusClasses = classes.filter(c => c.campus_name === campus)
          return (
            <div key={campus}>
              {campuses.length > 1 && (
                <p className="text-xs font-medium text-pep-gray uppercase tracking-wide mb-1">{campus}</p>
              )}
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {campusClasses.map(c => (
                  <label key={c.id} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={value.includes(c.id)}
                      onChange={() => toggleClass(c.id)}
                      disabled={disabled}
                      className="h-4 w-4 rounded border-gray-300 text-pep-blue focus:ring-pep-blue/20 cursor-pointer disabled:opacity-50"
                    />
                    <span className="text-sm text-pep-gray">{c.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Hook for getting class list (used by bulk upload and other pages)
export function useUserClasses() {
  const [classes, setClasses] = useState<UserClass[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchClasses() {
      const res = await fetch('/api/user/classes')
      if (res.ok) {
        const data = await res.json()
        setClasses(data)
      }
      setLoading(false)
    }
    fetchClasses()
  }, [])

  return { classes, loading, hasClasses: classes.length > 0 }
}
