/**
 * Sale Created Confirmation Email Template
 * Sent when a user successfully publishes a sale
 */

import {
  Section,
  Text,
  Heading,
  Button,
} from '@react-email/components'
import { BaseLayout } from './BaseLayout'

export interface SaleCreatedConfirmationEmailProps {
  recipientName?: string
  saleTitle: string
  saleAddress: string
  saleDateRangeText: string
  saleUrl: string
}

export function SaleCreatedConfirmationEmail({
  recipientName,
  saleTitle,
  saleAddress,
  saleDateRangeText,
  saleUrl,
}: SaleCreatedConfirmationEmailProps) {
  const greeting = recipientName ? `Hi ${recipientName},` : 'Hi there,'

  return (
    <BaseLayout
      previewText={`Your yard sale "${saleTitle}" is now live on LootAura`}
    >
      <Heading style={headingStyle}>
        Your yard sale is live on LootAura
      </Heading>

      <Text style={textStyle}>
        {greeting}
      </Text>

      <Text style={textStyle}>
        Great news! Your yard sale has been successfully published and is now live on LootAura. 
        Shoppers can now find and view your sale on the map.
      </Text>

      <Section style={detailsSectionStyle}>
        <Text style={detailLabelStyle}>Sale Details:</Text>
        <Text style={detailTextStyle}>
          <strong>{saleTitle}</strong>
        </Text>
        <Text style={detailTextStyle}>
          📍 {saleAddress}
        </Text>
        <Text style={detailTextStyle}>
          📅 {saleDateRangeText}
        </Text>
      </Section>

      <Section style={buttonSectionStyle}>
        <Button href={saleUrl} style={buttonStyle}>
          View Your Sale
        </Button>
      </Section>

      <Text style={textStyle}>
        You can manage your sale, view analytics, and make updates from your dashboard at any time.
      </Text>
    </BaseLayout>
  )
}

/**
 * Generate subject line for sale created confirmation email
 */
export function getSaleCreatedSubject(saleTitle: string): string {
  return `Your sale "${saleTitle}" is live on LootAura`
}

// Email-safe inline styles
const headingStyle = {
  color: '#1a1a1a',
  fontSize: '24px',
  fontWeight: 'bold',
  lineHeight: '32px',
  margin: '0 0 24px 0',
}

const textStyle = {
  color: '#333333',
  fontSize: '16px',
  lineHeight: '24px',
  margin: '0 0 16px 0',
}

const detailsSectionStyle = {
  backgroundColor: '#f9f9f9',
  border: '1px solid #e5e5e5',
  borderRadius: '4px',
  padding: '20px',
  margin: '24px 0',
}

const detailLabelStyle = {
  color: '#666666',
  fontSize: '14px',
  fontWeight: 'bold',
  margin: '0 0 12px 0',
  textTransform: 'uppercase' as const,
}

const detailTextStyle = {
  color: '#333333',
  fontSize: '16px',
  lineHeight: '24px',
  margin: '0 0 8px 0',
}

const buttonSectionStyle = {
  margin: '32px 0',
  textAlign: 'center' as const,
}

const buttonStyle = {
  backgroundColor: '#3A2268',
  borderRadius: '4px',
  color: '#ffffff',
  display: 'inline-block',
  fontSize: '16px',
  fontWeight: 'bold',
  lineHeight: '44px',
  padding: '0 32px',
  textDecoration: 'none',
}

