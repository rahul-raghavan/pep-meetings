'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

const ERROR_MESSAGES: Record<string, string> = {
  domain_not_allowed: 'Only PEP School, Accel School, and Ribbons email accounts can sign in.',
  auth_failed: 'Authentication failed. Please try again.',
}

function LoginContent() {
  const searchParams = useSearchParams()
  const errorCode = searchParams.get('error')
  const errorMessage = errorCode ? ERROR_MESSAGES[errorCode] || 'Something went wrong. Please try again.' : null

  const handleLogin = async () => {
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/callback`,
      },
    })
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-pep-light">
      <div className="bg-pep-card rounded shadow-lg p-8 w-full max-w-md text-center">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-pep-blue">PEP Meetings</h1>
          <p className="text-pep-gray mt-2">Meeting transcription & action items</p>
        </div>

        {errorMessage && (
          <div className="bg-red-50 text-red-700 rounded px-4 py-3 text-sm mb-4">
            {errorMessage}
          </div>
        )}

        <button
          onClick={handleLogin}
          className="w-full flex items-center justify-center gap-3 bg-pep-blue text-white rounded px-6 py-3 font-medium uppercase tracking-wider hover:bg-pep-dark transition-colors cursor-pointer"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
            <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Sign in with Google
        </button>

        <p className="mt-6 text-sm text-pep-gray">
          Only PEP School staff accounts can access this app.
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  )
}
