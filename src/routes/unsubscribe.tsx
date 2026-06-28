import * as React from 'react'
import { createFileRoute, useSearch } from '@tanstack/react-router'

type Status = 'loading' | 'ready' | 'confirming' | 'success' | 'already' | 'invalid' | 'error'

export const Route = createFileRoute('/unsubscribe')({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === 'string' ? search.token : '',
  }),
  head: () => ({
    meta: [
      { title: 'Unsubscribe — Milo Growth' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: UnsubscribePage,
})

function UnsubscribePage() {
  const { token } = useSearch({ from: '/unsubscribe' })
  const [status, setStatus] = React.useState<Status>('loading')
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!token) {
      setStatus('invalid')
      return
    }
    let cancelled = false
    fetch(`/email/unsubscribe?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}))
        if (cancelled) return
        if (!r.ok) {
          setStatus('invalid')
          return
        }
        if (data.valid === false && data.reason === 'already_unsubscribed') {
          setStatus('already')
          return
        }
        setStatus('ready')
      })
      .catch(() => !cancelled && setStatus('error'))
    return () => { cancelled = true }
  }, [token])

  async function confirm() {
    setStatus('confirming')
    setError(null)
    try {
      const res = await fetch('/email/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setStatus('error')
        setError(data.error ?? 'Something went wrong.')
        return
      }
      if (data.success === false && data.reason === 'already_unsubscribed') {
        setStatus('already')
        return
      }
      setStatus('success')
    } catch {
      setStatus('error')
    }
  }

  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-3">
          Milo Growth
        </p>
        <h1 className="text-2xl font-semibold text-foreground mb-4">
          Email preferences
        </h1>

        {status === 'loading' && (
          <p className="text-sm text-muted-foreground">Checking your unsubscribe link…</p>
        )}

        {status === 'ready' && (
          <>
            <p className="text-sm text-muted-foreground mb-6">
              Click the button below to confirm you no longer want to receive emails from Milo Growth at this address.
            </p>
            <button
              onClick={confirm}
              className="w-full rounded-lg bg-foreground text-background py-3 text-sm font-medium hover:opacity-90 transition"
            >
              Confirm unsubscribe
            </button>
          </>
        )}

        {status === 'confirming' && (
          <p className="text-sm text-muted-foreground">Updating your preferences…</p>
        )}

        {status === 'success' && (
          <p className="text-sm text-foreground">
            You're unsubscribed. You won't receive any further emails from Milo Growth at this address.
          </p>
        )}

        {status === 'already' && (
          <p className="text-sm text-foreground">
            This address is already unsubscribed. No further action needed.
          </p>
        )}

        {status === 'invalid' && (
          <p className="text-sm text-muted-foreground">
            This unsubscribe link is invalid or has expired. If you're still receiving unwanted emails, please reply to one of them and we'll handle it manually.
          </p>
        )}

        {status === 'error' && (
          <p className="text-sm text-destructive">
            {error ?? 'Something went wrong. Please try again in a moment.'}
          </p>
        )}

        <p className="mt-8 text-xs text-muted-foreground">
          Milo Growth — built by Andersen Innovations.
        </p>
      </div>
    </main>
  )
}
