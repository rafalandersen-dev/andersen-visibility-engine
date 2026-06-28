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

interface WelcomeProps {
  name?: string
  appUrl?: string
}

const WelcomeEmail = ({
  name = 'there',
  appUrl = 'https://milogrowth.com/app',
}: WelcomeProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Welcome to Milo Growth — your monthly AI growth planner</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Welcome to Milo Growth, {name}</Heading>
        <Text style={text}>
          Thanks for joining. Milo helps you plan and produce a month of focused
          AI-ready content for your business — opportunities, calendar, and
          briefs in one place.
        </Text>
        <Text style={text}>Start by setting up your first project:</Text>
        <Button style={button} href={appUrl}>
          Open Milo Growth
        </Button>
        <Hr style={hr} />
        <Text style={footer}>
          Milo Growth — built by Andersen Innovations.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: WelcomeEmail,
  subject: 'Welcome to Milo Growth',
  displayName: 'Welcome',
  previewData: { name: 'Rafał', appUrl: 'https://milogrowth.com/app' },
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
