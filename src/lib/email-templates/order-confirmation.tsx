import * as React from 'react'
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Row,
  Column,
  Section,
  Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

export interface OrderItem {
  name: string
  quantity: number
  price: string // formatted, e.g. "99.00 PLN"
}

interface OrderConfirmationProps {
  customerName?: string
  orderNumber?: string
  orderDate?: string
  items?: OrderItem[]
  total?: string
}

const defaultItems: OrderItem[] = [
  { name: 'Milo Growth — Growth plan', quantity: 1, price: '999.00 PLN' },
]

const OrderConfirmationEmail = ({
  customerName = 'there',
  orderNumber = 'MG-0001',
  orderDate = new Date().toISOString().slice(0, 10),
  items = defaultItems,
  total = '999.00 PLN',
}: OrderConfirmationProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Order {orderNumber} confirmed</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Order confirmed</Heading>
        <Text style={text}>
          Hi {customerName}, thanks for your order. Here is a summary for your records.
        </Text>

        <Section style={metaBox}>
          <Row>
            <Column style={metaLabel}>Order number</Column>
            <Column style={metaValue}>{orderNumber}</Column>
          </Row>
          <Row>
            <Column style={metaLabel}>Date</Column>
            <Column style={metaValue}>{orderDate}</Column>
          </Row>
        </Section>

        <Section>
          <Row style={tableHeadRow}>
            <Column style={thItem}>Item</Column>
            <Column style={thQty}>Qty</Column>
            <Column style={thPrice}>Price</Column>
          </Row>
          {items.map((item, i) => (
            <Row key={i} style={tableRow}>
              <Column style={tdItem}>{item.name}</Column>
              <Column style={tdQty}>{item.quantity}</Column>
              <Column style={tdPrice}>{item.price}</Column>
            </Row>
          ))}
        </Section>

        <Hr style={hr} />

        <Row>
          <Column style={totalLabel}>Total</Column>
          <Column style={totalValue}>{total}</Column>
        </Row>

        <Text style={footer}>
          Questions? Just reply to this email.<br />
          Milo Growth — built by Andersen Innovations.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: OrderConfirmationEmail,
  subject: ({ orderNumber }: Record<string, unknown>) =>
    `Order ${orderNumber ?? ''} confirmed`.trim(),
  displayName: 'Order confirmation',
  previewData: {
    customerName: 'Rafał',
    orderNumber: 'MG-1042',
    orderDate: '2026-06-28',
    items: defaultItems,
    total: '999.00 PLN',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#111111', margin: '0 0 16px' }
const text = { fontSize: '14px', color: '#55575d', lineHeight: '1.6', margin: '0 0 20px' }
const metaBox = {
  backgroundColor: '#f7f7f5',
  borderRadius: '8px',
  padding: '14px 16px',
  margin: '0 0 20px',
}
const metaLabel = { fontSize: '12px', color: '#888888', width: '40%' as const, padding: '4px 0' }
const metaValue = { fontSize: '13px', color: '#111111', padding: '4px 0' }
const tableHeadRow = { borderBottom: '1px solid #eeeeee' }
const tableRow = { borderBottom: '1px solid #f3f3f3' }
const thBase = { fontSize: '12px', color: '#888888', padding: '8px 0', textTransform: 'uppercase' as const, letterSpacing: '0.04em' }
const thItem = { ...thBase, width: '60%' as const }
const thQty = { ...thBase, width: '15%' as const, textAlign: 'right' as const }
const thPrice = { ...thBase, width: '25%' as const, textAlign: 'right' as const }
const tdBase = { fontSize: '13px', color: '#111111', padding: '10px 0' }
const tdItem = { ...tdBase, width: '60%' as const }
const tdQty = { ...tdBase, width: '15%' as const, textAlign: 'right' as const }
const tdPrice = { ...tdBase, width: '25%' as const, textAlign: 'right' as const }
const hr = { borderColor: '#eeeeee', margin: '16px 0' }
const totalLabel = { fontSize: '14px', fontWeight: 'bold' as const, color: '#111111', padding: '4px 0' }
const totalValue = { fontSize: '14px', fontWeight: 'bold' as const, color: '#111111', textAlign: 'right' as const, padding: '4px 0' }
const footer = { fontSize: '12px', color: '#999999', margin: '28px 0 0', lineHeight: '1.6' }
