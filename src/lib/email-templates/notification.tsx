import * as React from 'react'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

interface NotificationProps {
  recipientName?: string
  title?: string
  message?: string
  actionLabel?: string
  actionUrl?: string
}

const NotificationEmail = ({
  recipientName = 'there',
  title = 'You have a new update',
  message = 'Something in your Milo Growth workspace needs your attention.',
  actionLabel,
  actionUrl,
}: NotificationProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{title}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>{title}</Heading>
        <Text style={text}>Hi {recipientName},</Text>
        <Text style={text}>{message}</Text>
        {actionLabel && actionUrl ? (
          <Button style={button} href={actionUrl}>
            {actionLabel}
          </Button>
        ) : null}
        <Hr style={hr} />
        <Text style={footer}>Milo Growth — built by Andersen Innovations.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: NotificationEmail,
  subject: ({ title }: Record<string, unknown>) =>
    typeof title === 'string' && title.length > 0 ? title : 'New update from Milo Growth',
  displayName: 'Notification',
  previewData: {
    recipientName: 'Rafał',
    title: 'Your monthly plan is ready',
    message: 'Milo generated this month\'s opportunities and calendar for Butelki Wodorowe. Review and approve when you\'re ready.',
    actionLabel: 'Open workspace',
    actionUrl: 'https://milogrowth.com/app',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#111111', margin: '0 0 20px' }
const text = { fontSize: '14px', color: '#55575d', lineHeight: '1.6', margin: '0 0 20px' }
const button = {
  backgroundColor: '#111111',
  color: '#ffffff',
  fontSize: '14px',
  borderRadius: '8px',
  padding: '12px 20px',
  textDecoration: 'none',
}
const hr = { borderColor: '#eeeeee', margin: '32px 0 16px' }
const footer = { fontSize: '12px', color: '#999999', margin: 0 }
