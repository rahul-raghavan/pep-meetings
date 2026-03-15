'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'

type NavBarProps = {
  userName: string
  userRole?: 'super_admin' | 'admin' | 'user'
}

export function NavBar({ userName, userRole }: NavBarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function fetchNotifications() {
      try {
        const res = await fetch('/api/meetings/notifications')
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled) {
          setUnreadCount(typeof data.unreadCount === 'number' ? data.unreadCount : 0)
        }
      } catch {
        // Ignore transient nav polling failures
      }
    }

    fetchNotifications()
    const interval = setInterval(fetchNotifications, 30000)

    function handleNotificationsUpdated(event: Event) {
      const detail = (event as CustomEvent<{ unreadCount?: number }>).detail
      if (typeof detail?.unreadCount === 'number') {
        setUnreadCount(detail.unreadCount)
      } else {
        fetchNotifications()
      }
    }

    window.addEventListener('meeting-notifications-updated', handleNotificationsUpdated)

    return () => {
      cancelled = true
      clearInterval(interval)
      window.removeEventListener('meeting-notifications-updated', handleNotificationsUpdated)
    }
  }, [])

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const links = [
    { href: '/meetings', label: 'Meetings' },
    ...(userRole === 'admin' || userRole === 'super_admin'
      ? [{ href: '/admin', label: 'Admin' }]
      : []),
  ]

  return (
    <nav className="bg-pep-navbar text-white shadow-md">
      <div className="max-w-6xl mx-auto px-4">
        {/* Top row: brand + user */}
        <div className="flex items-center justify-between h-12">
          <Link href="/meetings" className="font-bold text-lg shrink-0">
            PEP
          </Link>
          <div className="flex items-center gap-1 flex-1 justify-center">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-1.5 rounded text-xs font-medium uppercase tracking-wider transition-colors ${
                  pathname.startsWith(link.href)
                    ? 'bg-pep-blue/20 text-pep-blue'
                    : 'hover:bg-white/10'
                }`}
              >
                <span className="inline-flex items-center gap-1.5">
                  <span>{link.label}</span>
                  {link.href === '/meetings' && unreadCount > 0 && (
                    <span className="min-w-5 h-5 px-1 rounded-full bg-pep-coral text-white text-[10px] leading-5 text-center">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </span>
              </Link>
            ))}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-sm text-white/80 hidden sm:inline">{userName}</span>
            <button
              onClick={handleLogout}
              className="text-sm text-white/70 hover:text-pep-coral transition-colors cursor-pointer"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </nav>
  )
}
