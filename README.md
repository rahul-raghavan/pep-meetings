## PEP Meetings

PEP Meetings is built around a simple operational model:

- uploads should feel seamless
- audio should be stored safely first
- transcription and analysis happen in the background
- next-day completion is acceptable during peak weeks

That means the app uses:

- a web service for the UI and API
- a single background worker for queued meeting processing

## Worker Setup

Run the web app normally:

```bash
npm run dev
```

Run the background worker in a second terminal:

```bash
npm run worker:meetings
```

Recommended worker defaults:

```bash
MEETING_WORKER_CONCURRENCY=1
MEETING_WORKER_POLL_MS=5000
MEETING_WORKER_ERROR_MS=15000
```

Uploads are queued automatically after the audio file is stored. The worker picks meetings up later and moves them through:

- `queued`
- `transcribing`
- `analyzing`
- `completed`
- `failed`

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
