/**
 * Moderation Daily Digest Email Template
 * Sent daily to admins with a summary of new sale reports
 */

import {
  Section,
  Text,
  Heading,
  Button,
} from '@react-email/components'
import { BaseLayout } from './BaseLayout'

export interface ReportDigestItem {
  reportId: string
  saleId: string
  saleTitle: string
  saleAddress: string
  reason: string
  createdAt: string
  reporterId?: string
  adminViewUrl: string
}

export interface ModerationDailyDigestEmailProps {
  reports: ReportDigestItem[]
  dateWindow: string // e.g., "December 9, 2025"
  baseUrl?: string
}

export function ModerationDailyDigestEmail({
  reports,
  dateWindow,
  baseUrl = 'https://lootaura.com',
}: ModerationDailyDigestEmailProps) {
  const previewText = reports.length > 0
    ? `${reports.length} new sale report${reports.length > 1 ? 's' : ''} require${reports.length > 1 ? '' : 's'} review`
    : 'No new reports'

  return (
    <BaseLayout previewText={previewText} baseUrl={baseUrl}>
      <Heading style={headingStyle}>Moderation Daily Digest</Heading>
      
      <Text style={textStyle}>
        Summary of new sale reports for {dateWindow}
      </Text>

      {reports.length === 0 ? (
        <Text style={textStyle}>
          No new reports in the last 24 hours.
        </Text>
      ) : (
        <>
          <Text style={textStyle}>
            <strong>{reports.length}</strong> new report{reports.length > 1 ? 's' : ''} require{reports.length > 1 ? '' : 's'} review:
          </Text>

          {reports.map((report) => (
            <Section key={report.reportId} style={reportSectionStyle}>
              <Text style={reportTitleStyle}>
                <strong>{report.saleTitle}</strong>
              </Text>
              <Text style={reportDetailStyle}>
                Address: {report.saleAddress}
              </Text>
              <Text style={reportDetailStyle}>
                Reason: <strong>{report.reason}</strong>
              </Text>
              <Text style={reportDetailStyle}>
                Reported: {new Date(report.createdAt).toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </Text>
              <Button
                href={report.adminViewUrl}
                style={buttonStyle}
              >
                Review Report
              </Button>
            </Section>
          ))}

          <Section style={sectionStyle}>
            <Button
              href={`${baseUrl}/admin/tools/reports`}
              style={buttonStyle}
            >
              View All Reports
            </Button>
          </Section>
        </>
      )}
    </BaseLayout>
  )
}

export function buildModerationDigestSubject(reportCount: number): string {
  if (reportCount === 0) {
    return 'Moderation Digest: No new reports'
  }
  return `Moderation Digest: ${reportCount} new report${reportCount > 1 ? 's' : ''}`
}

const headingStyle = {
  fontSize: '24px',
  fontWeight: 'bold',
  marginBottom: '16px',
  color: '#1a1a1a',
}

const textStyle = {
  fontSize: '16px',
  lineHeight: '24px',
  color: '#333',
  marginBottom: '16px',
}

const sectionStyle = {
  marginBottom: '24px',
}

const reportSectionStyle = {
  border: '1px solid #e0e0e0',
  borderRadius: '8px',
  padding: '16px',
  marginBottom: '16px',
  backgroundColor: '#f9f9f9',
}

const reportTitleStyle = {
  fontSize: '18px',
  fontWeight: 'bold',
  marginBottom: '8px',
  color: '#1a1a1a',
}

const reportDetailStyle = {
  fontSize: '14px',
  lineHeight: '20px',
  color: '#666',
  marginBottom: '4px',
}

const buttonStyle = {
  backgroundColor: '#0070f3',
  color: '#ffffff',
  padding: '12px 24px',
  borderRadius: '6px',
  textDecoration: 'none',
  display: 'inline-block',
  fontWeight: '600',
  marginTop: '12px',
}

