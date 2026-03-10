import { createServiceClient } from '@/lib/supabase-server'

type Segment = { speaker: string; text: string; start: number; end: number }

const TENSE_SENTIMENTS = ['Tense']
const CONCERNING_SENTIMENTS = ['Concerned']

function shouldFlag(sections: Array<{ sentiment: string }>): boolean {
  if (sections.some(s => TENSE_SENTIMENTS.includes(s.sentiment))) return true
  const concernedCount = sections.filter(s => CONCERNING_SENTIMENTS.includes(s.sentiment)).length
  return concernedCount > sections.length / 2
}

function buildTranscript(segments: Segment[]): string {
  return segments
    .map(s => `${s.speaker}: ${s.text}`)
    .join('\n')
}

const MONTESSORI_CONTEXT = `You are analyzing a meeting at a Montessori school. The school values: child-centred learning, mixed-age classrooms, self-directed exploration, intrinsic motivation over rewards/grades, continuity of the Montessori program into later years, and deep parent-school partnership. The school is unapologetically distinctive — it does not try to be everything to everyone.`

const ADMISSION_ANALYSIS_PROMPT = `${MONTESSORI_CONTEXT}

You are a benevolent observer analyzing an admission meeting. Your job is to give the admissions team honest, actionable feedback about how this meeting went.

Analyze the transcript and the summary provided, then return ONLY valid JSON (no markdown fences) in this exact format:
{
  "overall_read": "A paragraph describing where this family stands — their level of interest, their concerns, and the overall dynamic of the meeting.",
  "parent_concerns": [
    { "concern": "Short title", "detail": "Evidence from the transcript supporting this concern", "priority": 1 }
  ],
  "school_assessment": {
    "strengths": ["What the school representative(s) did well in this meeting"],
    "weaknesses": ["Where the school lost them or could improve"],
    "missed_opportunities": ["Moments that could have gone better or topics that should have been explored"]
  },
  "red_flags": ["Things that suggest this family might struggle with the Montessori approach or school culture"],
  "green_flags": ["Things that suggest this family will thrive and partner well with the school"],
  "alignment_rating": {
    "score": 3,
    "reasoning": "Why this score — what evidence supports it",
    "why_not_higher": "What's missing for a higher rating",
    "why_not_lower": "What keeps them above the lower rating"
  },
  "key_quotes": [
    { "speaker": "Who said it", "quote": "The actual quote or close paraphrase", "why_it_matters": "Brief note on why this quote is significant" }
  ],
  "suggestions": ["Actionable next steps for the admissions team"]
}

Alignment scale:
- 1 = Clearly misaligned, wants conventional school structures (grades, homework, competition)
- 2 = Weak alignment, mostly shopping for convenience (location, fees, prestige) rather than philosophy
- 3 = Open and potentially compatible, but not yet deeply bought in to the Montessori approach
- 4 = Strong alignment, asks good philosophy questions, seems to "get it"
- 5 = Unusually high alignment, already speaks the language of child-centred learning and likely to partner well

For key_quotes, pick 3-5 direct quotes that capture the most important or revealing moments of the meeting. These should be moments the team would want to reference later.

Be specific. Use names and reference actual moments from the transcript. Don't be generic.`

const PARENT_TEACHER_ANALYSIS_PROMPT = `${MONTESSORI_CONTEXT}

You are a benevolent observer analyzing a parent-teacher meeting. Your job is to give the teaching team honest, actionable feedback about how this meeting went and what to do differently.

Analyze the transcript and the summary provided, then return ONLY valid JSON (no markdown fences) in this exact format:
{
  "overall_read": "A paragraph describing the meeting tone and dynamic — how did the parent and teacher interact?",
  "alignment_rating": {
    "score": 3,
    "reasoning": "Why this score — what evidence supports it",
    "why_not_higher": "1-2 sentences — what's missing for a higher rating",
    "why_not_lower": "1-2 sentences — what keeps them above the lower rating"
  },
  "parent_communication": {
    "concerns": [{ "concern": "Short title", "detail": "1 sentence of evidence from transcript" }],
    "celebrations": [{ "item": "Short title", "detail": "1 sentence of evidence from transcript" }],
    "questions_requests": ["What the parent asked for or seems to want"],
    "unspoken_signals": ["Reading between the lines — what the parent may be feeling but didn't say directly"]
  },
  "teacher_assessment": {
    "strengths": ["One sentence each — what the teacher did well"],
    "weaknesses": ["One sentence each — where the teacher could improve"],
    "missed_opportunities": ["One sentence each — moments that could have gone deeper"]
  },
  "key_quotes": [
    { "speaker": "Who said it", "quote": "The actual quote or close paraphrase", "why_it_matters": "Brief note on why this quote is significant" }
  ],
  "followup_email": "A warm, specific email the teacher can send to the parent summarizing what was discussed, celebrating positives, acknowledging concerns, and outlining next steps. Write it ready to send — professional but warm, 150-250 words. Use the parent's name if known.",
  "suggestions": ["Actionable next step — one sentence each, no overlap with weaknesses or missed opportunities"]
}

CRITICAL — BE CONCISE AND AVOID REPETITION:
- Each strength, weakness, missed opportunity, and suggestion must be ONE sentence.
- Do NOT repeat the same point across weaknesses, missed opportunities, and suggestions. If the teacher missed a chance to explore a topic, say it ONCE in the most relevant section. Don't say it again in suggestions.
- Limit: max 3 strengths, 3 weaknesses, 3 missed opportunities, 3 suggestions. Pick the most important ones.
- The alignment rating reasoning should be 2-3 sentences, not a paragraph.

Alignment scale (parent-school alignment):
- 1 = Fundamentally different views on what education should look like
- 2 = Surface-level cooperation but real tension underneath
- 3 = Generally aligned but some gaps in communication or expectations
- 4 = Strong alignment, parent and teacher working as a team
- 5 = Deeply aligned, parent actively reinforces the school's Montessori approach at home

For key_quotes, pick 3-5 direct quotes that capture the most important or revealing moments of the meeting.

Be specific. Use names and reference actual moments from the transcript. Don't be generic.`

/**
 * Generate deep analysis using Claude with adaptive thinking.
 * Only runs for admission and parent_teacher meeting types.
 */
async function generateDeepAnalysis(
  transcript: string,
  summary: string,
  meetingType: string,
): Promise<Record<string, unknown> | null> {
  if (meetingType !== 'admission' && meetingType !== 'parent_teacher') {
    return null
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.warn('[analyze-meeting] ANTHROPIC_API_KEY not set, skipping deep analysis')
    return null
  }

  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const client = new Anthropic({ apiKey })

  const systemPrompt = meetingType === 'admission'
    ? ADMISSION_ANALYSIS_PROMPT
    : PARENT_TEACHER_ANALYSIS_PROMPT

  const userContent = `Here is the meeting summary:\n\n${summary}\n\nHere is the full transcript:\n\n${transcript}`

  // Use streaming with finalMessage() to avoid HTTP timeouts on long thinking
  const stream = client.messages.stream({
    model: 'claude-opus-4-6',
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }],
  })

  const response = await stream.finalMessage()

  // Extract the text content (skip thinking blocks)
  const textBlock = response.content.find(
    (block: { type: string }) => block.type === 'text'
  ) as { type: 'text'; text: string } | undefined

  if (!textBlock) {
    console.error('[analyze-meeting] No text block in Claude response')
    return null
  }

  const rawContent = textBlock.text
  const jsonStr = rawContent.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()

  try {
    return JSON.parse(jsonStr)
  } catch (err) {
    console.error(`[analyze-meeting] Failed to parse Claude analysis JSON: ${err}`)
    console.error(`[analyze-meeting] Raw response (first 500 chars): ${rawContent.slice(0, 500)}`)
    return null
  }
}

/**
 * Run GPT-5.4 analysis on transcript segments to produce
 * a thick summary, topic sections, key decisions, and grouped action items.
 * Then run Claude deep analysis for admission/parent_teacher meetings.
 * Saves results to DB (replaces existing summary + action items).
 */
export async function analyzeMeeting(
  meetingId: string,
  segments: Segment[],
  supabase: ReturnType<typeof createServiceClient>,
  meetingType?: string,
) {
  if (segments.length === 0) return

  const transcript = buildTranscript(segments)

  const OpenAI = (await import('openai')).default
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const response = await openai.chat.completions.create({
    model: 'gpt-5.4',
    max_completion_tokens: 8192,
    messages: [
      {
        role: 'system',
        content: `You are an expert at analyzing school meeting transcripts (parent-teacher meetings, staff training, admissions discussions, etc.). Your audience is school leadership and teachers.

Your job is to produce a rich, detailed, substantive analysis that captures everything important from the meeting. Write like a smart colleague summarizing the meeting for someone who wasn't there — be thorough and specific. Write in flowing narrative prose — do not cite line numbers or segment indices.

Return ONLY valid JSON (no markdown fences) in this exact format:
{
  "summary": "5-8 sentence executive summary covering the key themes, decisions, outcomes, and overall tone of the meeting. Use specific names, reference particular topics discussed, and capture the arc of the conversation — not just what was discussed but what was concluded or left open.",
  "topic_sections": [
    {
      "topic": "Clear topic name",
      "summary": "Detailed 5-8 sentence paragraph. Include specific names, data points, examples, quotes, and conclusions. Reference what was actually said, by whom, and what the group decided or disagreed about. Capture nuance — don't flatten complex discussions into a single takeaway.",
      "sentiment": "One of: Positive, Neutral, Concerned, Tense, Collaborative, Enthusiastic"
    }
  ],
  "overall_sentiment": "One of: Positive, Neutral, Concerned, Tense, Collaborative, Enthusiastic",
  "key_decisions": ["decision 1", "decision 2"],
  "action_item_groups": [
    {
      "category": "Logical group name (e.g., Follow-ups, Curriculum, Communication, Administration)",
      "items": ["Specific action item 1", "Specific action item 2"]
    }
  ]
}

Guidelines for SUMMARY:
- 5-8 sentences, not 3-4. Go deeper.
- Use names of participants when they are identifiable
- Mention specific students, topics, tools, or initiatives discussed
- Don't just say "they discussed X" — say what the conclusion or takeaway was
- Capture the emotional tone and dynamic of the meeting

Guidelines for TOPIC SECTIONS:
- Each section should be 5-8 sentences with real substance
- Include direct quotes or paraphrases of key statements when they matter
- Note who said what when it's important (e.g., "The parent expressed concern about...")
- Create 3-6 topic sections depending on meeting length
- If a topic had disagreement or tension, capture both sides

Guidelines for ACTION ITEMS:
- Extract genuine action items — things someone needs to DO. Not observations or discussion points.
- Group them logically by theme (e.g., "Follow-ups", "Curriculum Changes", "Parent Communication")
- Include both explicit ("I will do X") and implicit ("we need to do X") action items
- Each item should be a clear, specific, actionable sentence
- Be selective: quality over quantity. A 1-hour meeting typically has 8-15 real action items, not 60.
- If something was merely discussed but no one committed to doing anything about it, it's NOT an action item`
      },
      {
        role: 'user',
        content: `Here is the meeting transcript:\n\n${transcript}`
      }
    ],
  })

  const rawContent = response.choices[0]?.message?.content || ''

  // Strip markdown fences if present (handle leading/trailing whitespace and newlines)
  const jsonStr = rawContent.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()

  try {
    const parsed = JSON.parse(jsonStr)

    const topicSections = parsed.topic_sections || []
    const overallSentiment = parsed.overall_sentiment || 'Neutral'
    const needsAttention = shouldFlag(topicSections)

    // Clear old AI-generated action items before saving new ones (preserve manual items)
    const { error: deleteError } = await supabase.from('pep_action_items').delete().eq('meeting_id', meetingId).eq('source', 'ai')
    if (deleteError) throw new Error(`Failed to delete old action items: ${deleteError.message}`)

    // Run deep analysis with Claude (only for admission/parent_teacher)
    let analysis: Record<string, unknown> | null = null
    if (meetingType) {
      try {
        analysis = await generateDeepAnalysis(transcript, parsed.summary || '', meetingType)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        console.error(`[analyze-meeting] Deep analysis failed for meeting ${meetingId}: ${msg}`)
        // Continue without analysis — the thick summary still gets saved
      }
    }

    // Save summary with topic sections, sentiment, and analysis
    const { error: summaryError } = await supabase
      .from('pep_meeting_summaries')
      .upsert({
        meeting_id: meetingId,
        summary: parsed.summary || 'No summary generated.',
        key_decisions: parsed.key_decisions || [],
        topic_sections: topicSections,
        overall_sentiment: overallSentiment,
        raw_llm_response: parsed,
        analysis,
      }, { onConflict: 'meeting_id' })
    if (summaryError) throw new Error(`Failed to save summary: ${summaryError.message}`)

    // Update the meeting's needs_attention flag
    const { error: flagError } = await supabase
      .from('pep_meetings')
      .update({ needs_attention: needsAttention })
      .eq('id', meetingId)
    if (flagError) throw new Error(`Failed to update needs_attention: ${flagError.message}`)

    // Save grouped action items with category
    const groups = parsed.action_item_groups || []
    const allItems: { meeting_id: string; description: string; category: string | null; assigned_to: null; source_segment_index: null }[] = []

    for (const group of groups) {
      const category = group.category || null
      const items = group.items || []
      for (const item of items) {
        const description = typeof item === 'string' ? item : (item as Record<string, unknown>).description
        if (description) {
          allItems.push({
            meeting_id: meetingId,
            description: description as string,
            category,
            assigned_to: null,
            source_segment_index: null,
          })
        }
      }
    }

    // Fallback: handle old flat action_items format
    if (allItems.length === 0 && parsed.action_items?.length > 0) {
      for (const item of parsed.action_items) {
        const description = typeof item === 'string' ? item : (item as Record<string, unknown>).description
        if (description) {
          allItems.push({
            meeting_id: meetingId,
            description: description as string,
            category: null,
            assigned_to: null,
            source_segment_index: null,
          })
        }
      }
    }

    if (allItems.length > 0) {
      const { error: insertError } = await supabase.from('pep_action_items').insert(allItems)
      if (insertError) throw new Error(`Failed to save action items: ${insertError.message}`)
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    console.error(`[analyze-meeting] Failed for meeting ${meetingId}: ${errorMessage}`)
    console.error(`[analyze-meeting] Raw LLM response (first 500 chars): ${rawContent.slice(0, 500)}`)

    // Save raw response so we can debug later
    await supabase
      .from('pep_meeting_summaries')
      .upsert({
        meeting_id: meetingId,
        summary: `Analysis failed: ${errorMessage}`,
        key_decisions: [],
        topic_sections: [],
        overall_sentiment: null,
        raw_llm_response: { raw: rawContent, error: errorMessage },
      }, { onConflict: 'meeting_id' })
  }
}
