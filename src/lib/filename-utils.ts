/**
 * Clean a filename into a readable meeting title.
 * "2026-03-02_Grade-5A.m4a" → "2026 03 02 Grade 5A"
 * "parent_teacher_meeting.mp3" → "Parent Teacher Meeting"
 */
export function filenameToTitle(filename: string): string {
  // Remove extension
  const name = filename.replace(/\.[^.]+$/, '')

  // Replace separators with spaces
  const spaced = name.replace(/[-_]+/g, ' ')

  // Collapse multiple spaces
  const collapsed = spaced.replace(/\s+/g, ' ').trim()

  // If it looks like a date prefix (e.g. "2026 03 02 ..."), keep as-is
  // Otherwise capitalize each word
  if (/^\d{4}\s\d{2}\s\d{2}/.test(collapsed)) {
    // Capitalize the non-date part
    const datePart = collapsed.slice(0, 10)
    const rest = collapsed.slice(10).trim()
    if (!rest) return datePart
    const capitalized = rest.replace(/\b\w/g, (c) => c.toUpperCase())
    return `${datePart} ${capitalized}`
  }

  return collapsed.replace(/\b\w/g, (c) => c.toUpperCase())
}
