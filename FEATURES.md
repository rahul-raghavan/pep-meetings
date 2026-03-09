# PEP Meetings — Feature Guide

PEP Meetings automatically transcribes and analyzes in-person school meetings. Record or upload audio, and the app generates speaker-labeled transcripts, summaries, sentiment analysis, and action items.

---

## Meetings

### Create a Meeting
- Click **+ New Meeting** from the meetings page
- Fill in the title, type (Parent-Teacher, Admission, Training, HR, Internal, Other), date, and optional notes
- Select which class(es) this meeting belongs to
- Attach an audio file and submit — transcription starts automatically

### Record a Meeting
- Click **Record** to open the in-browser recorder
- Fill in meeting details, then hit **Start Recording**
- Pause/resume as needed — a live audio level meter shows the mic is working
- Stop when done, preview the recording, then upload
- If the browser crashes mid-recording, the app recovers saved chunks automatically on your next visit

### Bulk Upload
- Upload multiple audio files at once via drag-and-drop or file picker
- Set a default meeting type, date, and class for all files
- Override type and class per file if needed
- Files are uploaded and transcribed with up to 3 concurrent transcriptions
- Track progress per file — retry any that fail

### Meeting List
- View all your meetings with status badges (uploading, processing, completed, failed)
- Filter by meeting type or class
- Search by title
- Expand a meeting card to see a summary preview and sentiment
- Meetings flagged "Needs Attention" show a red indicator

### Edit & Delete
- Inline-edit meeting title, type, and date from the list view
- Delete a meeting (with confirmation)
- Retry transcription on failed meetings

---

## Transcription

### How It Works
- Audio is transcribed using Voxtral (Mistral AI) with automatic speaker diarization
- Each speaker is labeled (Speaker 1, Speaker 2, etc.) with timestamps
- Long recordings are split into chunks and processed with automatic retry on rate limits

### Supported Formats
MP3, M4A, WAV, WebM, OGG, Opus, AAC, MPEG, 3GP, MP4 — up to 50 MB per file (large files are automatically compressed)

### Viewing the Transcript
- Full transcript displayed with timestamps and color-coded speaker labels
- Download as a TXT file (includes summary, key decisions, action items, and full transcript)

### Find & Replace
- Search and replace text across the entire transcript, summary, and action items in one operation
- Useful for fixing recurring transcription errors (misspelled names, etc.)

---

## Speaker Management

### Edit Speaker Names
- Open the **Speakers** section on any meeting and click **Edit speakers**
- Assign real names (e.g., "Mrs. Sharma") and roles (teacher, parent, student, admin, counselor)
- Names replace generic labels throughout the transcript and summary

### Merge Speakers
- If the AI split one person into two speakers, merge them: "Change Speaker 3 into Speaker 1"
- All segments from the merged speaker are reassigned

---

## Meeting Analysis

### Auto-Generated Summary
- GPT-4o produces a 3-4 sentence executive summary after transcription
- **Topic sections** break the meeting into 3-6 themes, each with a detailed paragraph and sentiment label
- **Key decisions** are listed as bullet points

### Sentiment Analysis
- Each topic section gets a sentiment: Positive, Neutral, Concerned, Tense, Collaborative, or Enthusiastic
- An overall sentiment badge is shown on the meeting card
- Meetings with Tense or majority-Concerned topics are automatically flagged as **Needs Attention**

### Regenerate Analysis
- If you've edited speaker names or fixed transcript errors, regenerate the summary to get an updated analysis
- Only AI-generated action items are replaced — manually added ones are preserved

---

## Action Items

### Auto-Extracted
- The AI extracts every action item, follow-up, suggestion, and next step from the meeting
- Items appear under the **Action Items** tab on the meeting page

### Manual Management
- Add your own action items manually
- Click any item to inline-edit its text
- Check items off as completed
- Delete items you don't need

### Action Items Hub
- A dedicated page showing action items across **all** your meetings
- Filter by open, completed, or all
- Search by text
- Each item links back to its source meeting

### Generate Email
- Click **Generate Email** to create a pre-filled email with all open action items
- Edit the draft, then copy to clipboard and paste into your email client

---

## Admin Dashboard

### Overview
- See stats per campus: user count and class count
- Alert for unassigned meetings that need a class

### Manage Users
- **Add User**: Create users before they sign in — enter their name, school email, role, and class assignments. When they log in with Google, they're automatically linked.
- **Edit**: Change a user's role or class assignments
- **Activate/Deactivate**: Disable access without deleting the user (super admin only)
- Roles:
  - **Super Admin** — sees everything, manages all campuses
  - **Admin** — manages users and classes within their campus
  - **User** — can upload and view meetings in their assigned classes

### Manage Classes
- Create classes with creative names (e.g., "Butterfly") and assign them to a campus
- Rename or delete empty classes

### Manage Locations (Campuses)
- Create, rename, or delete campuses
- Each campus is tied to an email domain (pepschoolv2.com, accelschool.in, ribbons.education)

---

## Access Control

- **Sign in** with your school Google account — only school email domains are allowed
- **Class-scoped access**: you see meetings belonging to your assigned classes
- **Admin routes** are protected — regular users are redirected if they try to access /admin
- **Edit permissions**: only the meeting creator and admins can edit a meeting's transcript, speakers, or action items

---

## Tips & Tricks

- **Phone recording is best for long meetings** — use Voice Memos (iPhone) or Recorder (Android), then upload the file afterwards
- **In-app recording works great for short meetings** — just make sure your browser has microphone permission
- **Name your speakers right away** — the summary reads much better with real names instead of "Speaker 1"
- **Use Find & Replace after transcription** — quickly fix any names or words the AI got wrong
- **Check the Action Items hub regularly** — it aggregates items across all your meetings so nothing gets lost
- **Bulk upload for catching up** — if you have a backlog of recordings, use bulk upload to process them all at once
