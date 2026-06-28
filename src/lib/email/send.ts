import { supabase } from '@/integrations/supabase/client'

export interface SendTransactionalEmailArgs {
  templateName: 'welcome' | 'order-confirmation' | 'notification' | (string & {})
  recipientEmail: string
  /** Deterministic key so retries don't double-send (e.g. `welcome-${userId}`). */
  idempotencyKey: string
  templateData?: Record<string, unknown>
}

/**
 * Sends a transactional app email via the queue-backed send route.
 * Must be called from an authenticated client context (carries the user's JWT).
 */
export async function sendTransactionalEmail(args: SendTransactionalEmailArgs) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) {
    throw new Error('Not authenticated')
  }

  const res = await fetch('/lovable/email/transactional/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(args),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Failed to send email (${res.status}): ${text}`)
  }
  return res.json().catch(() => ({}))
}
