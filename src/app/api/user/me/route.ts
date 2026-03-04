import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'

// GET — return current user's basic info (role, campus_id)
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  return NextResponse.json({
    id: user.id,
    role: user.role,
    campus_id: user.campus_id,
  })
}
