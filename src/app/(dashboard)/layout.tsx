import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { NavBar } from '@/components/nav-bar'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  return (
    <div className="min-h-screen bg-pep-light">
      <NavBar userName={user.name} userRole={user.role} />
      <main className="max-w-6xl mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  )
}
