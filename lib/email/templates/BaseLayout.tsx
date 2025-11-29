/**
 * Base email layout component
 * Uses React Email components for email-safe HTML
 */

import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Link,
} from '@react-email/components'

export interface BaseLayoutProps {
  previewText?: string
  children: React.ReactNode
}

export function BaseLayout({ previewText, children }: BaseLayoutProps) {
  return (
    <Html>
      <Head>
        {previewText && <Text style={previewTextStyle}>{previewText}</Text>}
      </Head>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          {/* Header */}
          <Section style={headerStyle}>
            <Text style={logoStyle}>LootAura</Text>
          </Section>

          {/* Content */}
          <Section style={contentStyle}>
            {children}
          </Section>

          {/* Footer */}
          <Section style={footerStyle}>
            <Text style={footerTextStyle}>
              You received this because you created a sale on LootAura. Visit{' '}
              <Link href="https://lootaura.com" style={linkStyle}>
                lootaura.com
              </Link>{' '}
              to manage your listings.
            </Text>
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

const logoStyle = {
  color: '#ffffff',
  fontSize: '24px',
  fontWeight: 'bold',
  margin: '0',
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

