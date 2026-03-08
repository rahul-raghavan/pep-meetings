import { createServiceClient } from '@/lib/supabase-server'

type Segment = { speaker: string; text: string; start: number; end: number }

const TENSE_SENTIMENTS = ['Tense']
const CONCERNING_SENTIMENTS = ['Concerned']

function shouldFlag(sections: Array<{ sentiment: string }>): boolean {
  if (sections.some(s => TENSE_SENTIMENTS.includes(s.sentiment))) return true
  const concernedCount = sections.filter(s => CONCERNING_SENTIMENTS.includes(s.sentiment)).length
  return concernedCount > sections.length / 2
}

/**
 * Run GPT-4o analysis on transcript segments to produce
 * a summary, topic sections, key decisions, and action items.
 * Saves results to DB (replaces existing summary + action items).
 */
export async function analyzeMeeting(
  meetingId: string,
  segments: Segment[],
  supabase: ReturnType<typeof createServiceClient>
) {
  if (segments.length === 0) return

  const transcript = segments
    .map((s, i) => `[${i}] ${s.speaker}: ${s.text}`)
    .join('\n')

  const OpenAI = (await import('openai')).default
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 8192,
    messages: [
      {
        role: 'system',
        content: `You are an expert at analyzing school meeting transcripts (parent-teacher meetings, staff training, admissions discussions, etc.). Your audience is school leadership and teachers.

Your job is to produce a rich, detailed analysis that captures everything important from the meeting.

Return ONLY valid JSON (no markdown fences) in this exact format:
{
  "summary": "3-4 sentence executive summary covering the key themes, decisions, and outcomes of the meeting",
  "topic_sections": [
    {
      "topic": "Clear topic name",
      "summary": "Detailed 3-5 sentence paragraph. Include specific names, data points, examples, and conclusions. Don't be vague — reference what was actually said.",
      "sentiment": "One of: Positive, Neutral, Concerned, Tense, Collaborative, Enthusiastic"
    }
  ],
  "overall_sentiment": "One of: Positive, Neutral, Concerned, Tense, Collaborative, Enthusiastic",
  "key_decisions": ["decision 1", "decision 2"],
  "action_items": ["action item 1", "action item 2"]
}

Guidelines for SUMMARY and TOPIC SECTIONS:
- Write like a smart colleague summarizing the meeting for someone who wasn't there
- Be specific: use names, mention particular students/topics/tools discussed, quote key points
- Don't just say "they discussed X" — say what the conclusion or takeaway was
- Each topic section should be 3-5 sentences with real substance
- Create 3-6 topic sections depending on meeting length

Guidelines for ACTION ITEMS:
- Cast a WIDE net. Extract every action item, follow-up, recommendation, suggestion, next step, or thing someone should do
- Include both explicit ("I will do X") and implicit ("we need to do X", "it would help to do X", "let's make sure we do X") action items
- Each action item should be a clear, specific, actionable sentence
- Err on the side of MORE action items — users can delete ones they don't need
- Aim for at least one action item per topic discussed`
      },
      {
        role: 'user',
        content: `Here is the meeting transcript:\n\n${transcript}`
      }
    ],
  })

  const rawContent = response.choices[0]?.message?.content || ''

  // Strip markdown fences if present
  const jsonStr = rawContent.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()

  try {
    const parsed = JSON.parse(jsonStr)

    const topicSections = parsed.topic_sections || []
    const overallSentiment = parsed.overall_sentiment || 'Neutral'
    const needsAttention = shouldFlag(topicSections)

    // Clear old AI-generated action items before saving new ones (preserve manual items)
    const { error: deleteError } = await supabase.from('pep_action_items').delete().eq('meeting_id', meetingId).eq('source', 'ai')
    if (deleteError) throw new Error(`Failed to delete old action items: ${deleteError.message}`)

    // Save summary with topic sections and sentiment
    const { error: summaryError } = await supabase
      .from('pep_meeting_summaries')
      .upsert({
        meeting_id: meetingId,
        summary: parsed.summary || 'No summary generated.',
        key_decisions: parsed.key_decisions || [],
        topic_sections: topicSections,
        overall_sentiment: overallSentiment,
        raw_llm_response: parsed,
      }, { onConflict: 'meeting_id' })
    if (summaryError) throw new Error(`Failed to save summary: ${summaryError.message}`)

    // Update the meeting's needs_attention flag
    const { error: flagError } = await supabase
      .from('pep_meetings')
      .update({ needs_attention: needsAttention })
      .eq('id', meetingId)
    if (flagError) throw new Error(`Failed to update needs_attention: ${flagError.message}`)

    // Save action items — now just simple string descriptions
    if (parsed.action_items && parsed.action_items.length > 0) {
      const items = parsed.action_items.map((item: unknown) => {
        // Handle both string format and old object format
        const description = typeof item === 'string' ? item : (item as Record<string, unknown>).description
        return {
          meeting_id: meetingId,
          description,
          assigned_to: null,
          source_segment_index: null,
        }
      })
      const { error: insertError } = await supabase.from('pep_action_items').insert(items)
      if (insertError) throw new Error(`Failed to save action items: ${insertError.message}`)
    }
  } catch {
    // Save raw response even if parsing fails
    await supabase
      .from('pep_meeting_summaries')
      .upsert({
        meeting_id: meetingId,
        summary: 'Analysis failed. Raw response saved.',
        key_decisions: [],
        topic_sections: [],
        overall_sentiment: null,
        raw_llm_response: { raw: rawContent, error: 'JSON parse failed' },
      }, { onConflict: 'meeting_id' })
  }
}
