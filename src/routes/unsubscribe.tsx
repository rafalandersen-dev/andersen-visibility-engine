import * as React from 'react'
import { createFileRoute, Link, useSearch } from '@tanstack/react-router'
import { CheckCircle2, AlertCircle, Loader2, MailX } from 'lucide-react'
import { toast } from 'sonner'

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
  const [email, setEmail] = React.useState<string | null>(null)
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
        if (typeof data.email === 'string') setEmail(data.email)
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
    return () => {
      cancelled = true
    }
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
      if (typeof data.email === 'string') setEmail(data.email)
      if (!res.ok) {
        setStatus('error')
        setError(data.error ?? 'Something went wrong.')
        toast.error('Unsubscribe failed', {
          description: 'Please try again, or reply to one of our emails and we\'ll handle it.',
        })
        return
      }
      if (data.success === false && data.reason === 'already_unsubscribed') {
        setStatus('already')
        toast('Already unsubscribed', {
          description: 'No further emails will be sent to this address.',
        })
        return
      }
      setStatus('success')
      toast.success('You\'ve been unsubscribed', {
        description: email ?? 'No further emails will be sent to this address.',
      })
    } catch {
      setStatus('error')
      toast.error('Unsubscribe failed', {
        description: 'Check your connection and try again.',
      })
    }
  }

  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-3">
          Milo Growth
        </p>
        <h1 className="text-2xl font-semibold text-foreground mb-2">
          {status === 'success' || status === 'already'
            ? 'You\'re unsubscribed'
            : status === 'invalid'
            ? 'Link no longer valid'
            : status === 'error'
            ? 'Something went wrong'
            : 'Email preferences'}
        </h1>

        {email && (status === 'ready' || status === 'success' || status === 'already') && (
          <p className="text-sm text-muted-foreground mb-6 break-all">{email}</p>
        )}

        {status === 'loading' && (
          <StatusRow icon={<Loader2 className="w-4 h-4 animate-spin" />}>
            Checking your unsubscribe link…
          </StatusRow>
        )}

        {status === 'ready' && (
          <>
            <p className="text-sm text-muted-foreground mb-6">
              Click below to confirm you no longer want to receive emails from Milo Growth at this address.
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
          <StatusRow icon={<Loader2 className="w-4 h-4 animate-spin" />}>
            Updating your preferences…
          </StatusRow>
        )}

        {(status === 'success' || status === 'already') && (
          <>
            <StatusRow
              tone="success"
              icon={<CheckCircle2 className="w-5 h-5" />}
            >
              {status === 'success'
                ? 'We\'ve removed this address from our mailing list. It may take a few minutes for any already-queued emails to stop.'
                : 'This address was already unsubscribed. No further action is needed.'}
            </StatusRow>
            <p className="mt-6 text-xs text-muted-foreground">
              Changed your mind? Reply to any past email from us and we\'ll resubscribe you manually.
            </p>
            <Link
              to="/"
              className="mt-6 inline-block text-sm text-foreground underline underline-offset-4 hover:opacity-80"
            >
              Back to Milo Growth
            </Link>
          </>
        )}

        {status === 'invalid' && (
          <StatusRow tone="muted" icon={<MailX className="w-5 h-5" />}>
            This unsubscribe link is invalid or has expired. If you're still receiving unwanted emails, reply to one of them and we'll handle it manually.
          </StatusRow>
        )}

        {status === 'error' && (
          <>
            <StatusRow tone="error" icon={<AlertCircle className="w-5 h-5" />}>
              {error ?? 'Something went wrong. Please try again in a moment.'}
            </StatusRow>
            <button
              onClick={confirm}
              className="mt-6 w-full rounded-lg border border-border bg-card py-3 text-sm font-medium hover:bg-muted transition"
            >
              Try again
            </button>
          </>
        )}

        <p className="mt-8 text-xs text-muted-foreground">
          Milo Growth — built by Andersen Innovations.
        </p>
      </div>
    </main>
  )
}

function StatusRow({
  icon,
  tone = 'muted',
  children,
}: {
  icon: React.ReactNode
  tone?: 'success' | 'error' | 'muted'
  children: React.ReactNode
}) {
  const toneClass =
    tone === 'success'
      ? 'text-foreground'
      : tone === 'error'
      ? 'text-destructive'
      : 'text-muted-foreground'
  return (
    <div className={`flex items-start gap-3 text-sm ${toneClass}`}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="leading-relaxed">{children}</span>
    </div>
  )
}
