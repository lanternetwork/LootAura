/**
 * Seller Weekly Analytics Email Template
 * Sent weekly to sellers showing their sales performance metrics
 */

import {
  Section,
  Text,
  Heading,
  Button,
} from '@react-email/components'
import { BaseLayout } from './BaseLayout'

export interface SellerWeeklyAnalyticsEmailProps {
  ownerDisplayName?: string | null
  totalViews: number
  totalSaves: number
  totalClicks: number
  topSales: Array<{
    title: string
    views: number
    saves: number
    clicks: number
    ctr?: number
  }>
  dashboardUrl: string
  weekStart: string
  weekEnd: string
  baseUrl?: string
  unsubscribeUrl?: string
}

export function SellerWeeklyAnalyticsEmail({
  ownerDisplayName,
  totalViews,
  totalSaves,
  totalClicks,
  topSales,
  dashboardUrl,
  weekStart,
  weekEnd,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  baseUrl: _baseUrl = 'https://lootaura.com', // Kept for backward compatibility, unused
  unsubscribeUrl,
}: SellerWeeklyAnalyticsEmailProps) {
  const greeting = ownerDisplayName ? `Hi ${ownerDisplayName},` : 'Hi there,'
  const ctr = totalViews > 0 ? ((totalClicks / totalViews) * 100).toFixed(1) : '0.0'

  return (
    <BaseLayout
      previewText={`Your LootAura weekly summary: ${totalViews} views, ${totalSaves} saves`}
      unsubscribeUrl={unsubscribeUrl}
    >
      <Heading style={headingStyle}>
        Your LootAura weekly summary
      </Heading>

      <Text style={textStyle}>
        {greeting}
      </Text>

      <Text style={textStyle}>
        Here's how your sales performed from {weekStart} to {weekEnd}:
      </Text>

      {/* Main metrics row */}
      <Section style={metricsSectionStyle}>
        <Section style={metricItemStyle}>
          <Text style={metricValueStyle}>{totalViews.toLocaleString()}</Text>
          <Text style={metricLabelStyle}>Views</Text>
        </Section>
        <Section style={metricItemStyle}>
          <Text style={metricValueStyle}>{totalSaves.toLocaleString()}</Text>
          <Text style={metricLabelStyle}>Saves</Text>
        </Section>
        <Section style={metricItemStyle}>
          <Text style={metricValueStyle}>{totalClicks.toLocaleString()}</Text>
          <Text style={metricLabelStyle}>Clicks</Text>
        </Section>
        <Section style={metricItemStyle}>
          <Text style={metricValueStyle}>{ctr}%</Text>
          <Text style={metricLabelStyle}>CTR</Text>
        </Section>
      </Section>

      {/* Top sales */}
      {topSales.length > 0 && (
        <>
          <Heading style={subheadingStyle}>
            Top Performing Sales
          </Heading>
          {topSales.map((sale, index) => {
            const saleCtr = sale.views > 0 ? ((sale.clicks / sale.views) * 100).toFixed(1) : '0.0'
            return (
              <Section key={index} style={saleCardStyle}>
                <Text style={saleTitleStyle}>
                  <strong>{sale.title}</strong>
                </Text>
                <Text style={saleMetricsStyle}>
                  {sale.views.toLocaleString()} views · {sale.saves.toLocaleString()} saves · {sale.clicks.toLocaleString()} clicks · {saleCtr}% CTR
                </Text>
              </Section>
            )
          })}
        </>
      )}

      <Section style={buttonSectionStyle}>
        <Button href={dashboardUrl} style={buttonStyle}>
          View Detailed Stats
        </Button>
      </Section>

      <Text style={textStyle}>
        Keep creating great listings to reach more buyers in your area!
      </Text>
    </BaseLayout>
  )
}

/**
 * Generate subject line for seller weekly analytics email
 */
export function buildSellerWeeklyAnalyticsSubject(weekStart: string): string {
  return `Your LootAura weekly summary - ${weekStart}`
}

// Email-safe inline styles
const headingStyle = {
  color: '#1a1a1a',
  fontSize: '24px',
  fontWeight: 'bold',
  lineHeight: '32px',
  margin: '0 0 24px 0',
}

const subheadingStyle = {
  color: '#1a1a1a',
  fontSize: '20px',
  fontWeight: 'bold',
  lineHeight: '28px',
  margin: '32px 0 16px 0',
}

const textStyle = {
  color: '#333333',
  fontSize: '16px',
  lineHeight: '24px',
  margin: '0 0 16px 0',
}

const metricsSectionStyle = {
  backgroundColor: '#f9f9f9',
  border: '1px solid #e5e5e5',
  borderRadius: '4px',
  padding: '24px',
  margin: '24px 0',
  display: 'flex',
  flexDirection: 'row' as const,
  justifyContent: 'space-around',
  flexWrap: 'wrap' as const,
}

const metricItemStyle = {
  textAlign: 'center' as const,
  minWidth: '100px',
  margin: '0 8px 16px 8px',
}

const metricValueStyle = {
  color: '#3A2268',
  fontSize: '32px',
  fontWeight: 'bold',
  lineHeight: '40px',
  margin: '0 0 4px 0',
}

const metricLabelStyle = {
  color: '#666666',
  fontSize: '14px',
  lineHeight: '20px',
  margin: '0',
  textTransform: 'uppercase' as const,
}

const saleCardStyle = {
  backgroundColor: '#ffffff',
  border: '1px solid #e5e5e5',
  borderRadius: '4px',
  padding: '16px',
  margin: '0 0 12px 0',
}

const saleTitleStyle = {
  color: '#333333',
  fontSize: '16px',
  fontWeight: 'bold',
  lineHeight: '24px',
  margin: '0 0 8px 0',
}

const saleMetricsStyle = {
  color: '#666666',
  fontSize: '14px',
  lineHeight: '20px',
  margin: '0',
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

