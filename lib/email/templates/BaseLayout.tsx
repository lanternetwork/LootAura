/**
 * Base email layout component
 * Uses React Email components for email-safe HTML
 */

import React from 'react'
import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Link,
  Img,
} from '@react-email/components'

export interface BaseLayoutProps {
  previewText?: string
  children: React.ReactNode
  unsubscribeUrl?: string
  baseUrl?: string
}

export function BaseLayout({ previewText, children, unsubscribeUrl, baseUrl }: BaseLayoutProps) {
  // Get base URL for logo (use provided baseUrl or fallback to env var or default)
  const siteUrl = baseUrl || process.env.NEXT_PUBLIC_SITE_URL || 'https://lootaura.com'
  const logoUrl = `${siteUrl.replace(/\/$/, '')}/sitelogo.svg`
  
  return (
    <Html>
      <Head />
      <Body style={bodyStyle}>
        {previewText && <Text style={previewTextStyle}>{previewText}</Text>}
        <Container style={containerStyle}>
          {/* Header */}
          <Section style={headerStyle}>
            <table
              role="presentation"
              cellPadding="0"
              cellSpacing="0"
              border={0}
              style={tableStyle}
            >
              <tbody>
                <tr>
                  <td align="center" style={{ verticalAlign: 'middle' }}>
                    <table
                      role="presentation"
                      cellPadding="0"
                      cellSpacing="0"
                      border={0}
                    >
                      <tbody>
                        <tr>
                          <td style={{ verticalAlign: 'middle', paddingRight: '8px' }}>
                            <Img
                              src={logoUrl}
                              alt="LootAura"
                              width={32}
                              height={32}
                              style={logoImageStyle}
                            />
                          </td>
                          <td style={{ verticalAlign: 'middle' }}>
                            <Text style={logoTextStyle}>LootAura</Text>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>

          {/* Content */}
          <Section style={contentStyle}>
            {children}
          </Section>

          {/* Footer - Conditional based on unsubscribeUrl */}
          <Section style={footerStyle}>
            {unsubscribeUrl && unsubscribeUrl.trim() !== '' ? (
              // Mode A: Non-admin / marketing (unsubscribe)
              <Text style={footerTextStyle}>
                You're receiving this email because you're subscribed to LootAura notifications.{' '}
                To unsubscribe,{' '}
                <Link href={unsubscribeUrl} style={linkStyle}>
                  click here
                </Link>.
              </Text>
            ) : (
              // Mode B: Admin / transactional (account-only)
              <Text style={footerTextStyle}>
                You received this email from LootAura. Visit{' '}
                <Link href="https://lootaura.com" style={linkStyle}>
                  lootaura.com
                </Link>{' '}
                to manage your account.
              </Text>
            )}
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

// Email-safe inline styles
const bodyStyle = {
  backgroundColor: '#f5f5f5',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
}

const containerStyle = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '0',
  maxWidth: '600px',
}

const headerStyle = {
  backgroundColor: '#3A2268',
  padding: '24px',
  textAlign: 'center' as const,
}

const tableStyle = {
  width: '100%',
  margin: '0 auto',
}

const logoImageStyle = {
  display: 'block',
  width: '32px',
  height: '32px',
}

const logoTextStyle = {
  color: '#ffffff',
  fontSize: '24px',
  fontWeight: 'bold',
  margin: '0',
  verticalAlign: 'middle',
}

const contentStyle = {
  padding: '32px 24px',
}

const footerStyle = {
  backgroundColor: '#f9f9f9',
  padding: '24px',
  borderTop: '1px solid #e5e5e5',
}

const footerTextStyle = {
  color: '#666666',
  fontSize: '12px',
  lineHeight: '18px',
  margin: '0',
  textAlign: 'center' as const,
}

const linkStyle = {
  color: '#3A2268',
  textDecoration: 'underline',
}

const previewTextStyle: React.CSSProperties & { msoHide?: string } = {
  display: 'none',
  fontSize: '1px',
  lineHeight: '1px',
  maxHeight: '0px',
  maxWidth: '0px',
  opacity: 0,
  overflow: 'hidden',
  msoHide: 'all',
  visibility: 'hidden',
}

