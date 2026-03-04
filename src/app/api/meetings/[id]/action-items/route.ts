import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { getCurrentUser } from '@/lib/auth'
import { assertMeetingAccess, AccessError } from '@/lib/rbac'

// GET — action items for a meeting
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  try {
    await assertMeetingAccess(user, id)
  } catch (err) {
    if (err instanceof AccessError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }

  const db = createServiceClient()

  const { data, error } = await db
    .from('pep_action_items')
    .select('*')
    .eq('meeting_id', id)
    .order('created_at')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST — add a manual action item
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  try {
    await assertMeetingAccess(user, id)
  } catch (err) {
    if (err instanceof AccessError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }

  const body = await request.json()
  const { description, assigned_to, due_date } = body

  if (!description) {
    return NextResponse.json({ error: 'Description is required' }, { status: 400 })
  }

  const db = createServiceClient()

  const { data, error } = await db
    .from('pep_action_items')
    .insert({
      meeting_id: id,
      description,
      assigned_to: assigned_to || null,
      due_date: due_date || null,
      source: 'manual',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// PATCH — update an action item (complete, edit, etc.)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  try {
    await assertMeetingAccess(user, id)
  } catch (err) {
    if (err instanceof AccessError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }

  const body = await request.json()
  const { item_id, ...updates } = body

  if (!item_id) {
    return NextResponse.json({ error: 'item_id is required' }, { status: 400 })
  }

  // Handle completion toggle
  if ('is_completed' in updates) {
    updates.completed_at = updates.is_completed ? new Date().toISOString() : null
  }

  // If description was edited, mark as manual so it survives re-analysis
  if ('description' in updates) {
    updates.source = 'manual'
  }

  const db = createServiceClient()

  const { data, error } = await db
    .from('pep_action_items')
    .update(updates)
    .eq('id', item_id)
    .eq('meeting_id', id)
    .select()
    .single()

  if (error) {
    if (error.code === 'PGRST116') return NextResponse.json({ error: 'Action item not found in this meeting' }, { status: 404 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}

// DELETE — remove an action item
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  try {
    await assertMeetingAccess(user, id)
  } catch (err) {
    if (err instanceof AccessError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }

  const { searchParams } = new URL(request.url)
  const itemId = searchParams.get('item_id')

  if (!itemId) {
    return NextResponse.json({ error: 'item_id is required' }, { status: 400 })
  }

  const db = createServiceClient()

  const { data, error } = await db
    .from('pep_action_items')
    .delete()
    .eq('id', itemId)
    .eq('meeting_id', id)
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data || data.length === 0) return NextResponse.json({ error: 'Action item not found in this meeting' }, { status: 404 })
  return NextResponse.json({ success: true })
}
