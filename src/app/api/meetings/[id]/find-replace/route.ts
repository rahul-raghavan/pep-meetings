import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { getCurrentUser } from '@/lib/auth'
import { assertMeetingAccess, assertMeetingEdit, AccessError } from '@/lib/rbac'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  try {
    await assertMeetingAccess(user, id)
    await assertMeetingEdit(user, id)
  } catch (err) {
    if (err instanceof AccessError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }

  const { find, replace } = await request.json()
  if (!find || typeof find !== 'string') {
    return NextResponse.json({ error: 'Missing "find" text' }, { status: 400 })
  }
  const replaceText = typeof replace === 'string' ? replace : ''

  const supabase = createServiceClient()

  // Helper: replace all occurrences (case-sensitive)
  function replaceAll(text: string): string {
    return text.split(find).join(replaceText)
  }

  let segmentCount = 0
  let summaryUpdated = false
  let actionItemCount = 0

  // 1. Update transcript segments
  const { data: segments } = await supabase
    .from('pep_transcript_segments')
    .select('id, text')
    .eq('meeting_id', id)

  if (segments) {
    const updates = segments
      .filter(s => s.text.includes(find))
      .map(s => ({ id: s.id, text: replaceAll(s.text) }))

    for (const u of updates) {
      await supabase.from('pep_transcript_segments').update({ text: u.text }).eq('id', u.id)
    }
    segmentCount = updates.length
  }

  // 2. Update summary (summary text, topic sections, key decisions)
  const { data: summary } = await supabase
    .from('pep_meeting_summaries')
    .select('*')
    .eq('meeting_id', id)
    .single()

  if (summary) {
    const updatedSummary = replaceAll(summary.summary || '')

    const updatedTopics = (summary.topic_sections || []).map((section: { topic: string; summary: string; sentiment: string }) => ({
      ...section,
      topic: replaceAll(section.topic),
      summary: replaceAll(section.summary),
    }))

    const updatedDecisions = (summary.key_decisions || []).map((d: string) => replaceAll(d))

    const changed =
      updatedSummary !== summary.summary ||
      JSON.stringify(updatedTopics) !== JSON.stringify(summary.topic_sections) ||
      JSON.stringify(updatedDecisions) !== JSON.stringify(summary.key_decisions)

    if (changed) {
      await supabase
        .from('pep_meeting_summaries')
        .update({
          summary: updatedSummary,
          topic_sections: updatedTopics,
          key_decisions: updatedDecisions,
        })
        .eq('meeting_id', id)
      summaryUpdated = true
    }
  }

  // 3. Update action items
  const { data: actionItems } = await supabase
    .from('pep_action_items')
    .select('id, description')
    .eq('meeting_id', id)

  if (actionItems) {
    const updates = actionItems
      .filter(ai => ai.description.includes(find))
      .map(ai => ({ id: ai.id, description: replaceAll(ai.description) }))

    for (const u of updates) {
      await supabase.from('pep_action_items').update({ description: u.description }).eq('id', u.id)
    }
    actionItemCount = updates.length
  }

  return NextResponse.json({
    success: true,
    replaced: {
      segments: segmentCount,
      summary: summaryUpdated,
      action_items: actionItemCount,
    },
  })
}
