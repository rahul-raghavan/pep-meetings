'use client'

import Link from 'next/link'
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
                {link.label}
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
