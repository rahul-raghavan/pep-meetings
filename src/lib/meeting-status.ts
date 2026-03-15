export const MEETING_STATUSES = [
  'uploading',
  'queued',
  'transcribing',
  'analyzing',
  'completed',
  'failed',
] as const

export type MeetingStatus = (typeof MEETING_STATUSES)[number]

export const ACTIVE_MEETING_STATUSES: readonly MeetingStatus[] = [
  'queued',
  'transcribing',
  'analyzing',
]

export function isActiveMeetingStatus(status: string | null | undefined): boolean {
  return ACTIVE_MEETING_STATUSES.includes(status as MeetingStatus)
}

export function getMeetingStatusLabel(status: string): string {
  switch (status) {
    case 'uploading':
      return 'Uploading'
    case 'queued':
      return 'Queued'
    case 'transcribing':
      return 'Transcribing'
    case 'analyzing':
      return 'Analyzing'
    case 'completed':
      return 'Completed'
    case 'failed':
      return 'Failed'
    default:
      return status
  }
}
