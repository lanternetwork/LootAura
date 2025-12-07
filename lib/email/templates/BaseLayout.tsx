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
  const logoUrl = `${siteUrl.replace(/\/$/, '')}/images/logo-white.png`
  
  return (
    <Html>
      <Head />
      <Body style={bodyStyle}>
        {previewText && <Text style={previewTextStyle}>{previewText}</Text>}
        <Container style={containerStyle}>
          {/* Header */}
          <Section style={headerStyle}>
            <Img
              src={logoUrl}
              alt="LootAura"
              width="150"
              height="40"
              style={logoImageStyle}
            />
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
                To unsubscribe from all non-administrative emails,{' '}
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

const logoImageStyle = {
  display: 'block',
  margin: '0 auto',
  maxWidth: '150px',
  height: 'auto',
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

