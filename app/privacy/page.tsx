import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy · LootAura',
  description: 'LootAura privacy policy explaining how we collect, use, and protect your personal information.',
}

export default function PrivacyPage() {
  const lastUpdated = 'November 24, 2024'

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="max-w-3xl mx-auto px-4 md:px-6 lg:px-8 py-10 md:py-12">
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-500 mb-8">Last updated: {lastUpdated}</p>
        
        <div className="prose prose-gray max-w-none">
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">Information We Collect</h2>
            <p className="text-gray-700 mb-4">
              We collect information that you provide directly to us when you:
            </p>
            <ul className="list-disc list-inside text-gray-700 space-y-2 mb-4">
              <li>Create an account or profile</li>
              <li>Post a sale listing</li>
              <li>Upload photos or descriptions</li>
              <li>Contact us for support</li>
              <li>Use our services</li>
            </ul>
            <p className="text-gray-700 mb-4">
              This information may include your name, email address, location data, and any content you choose to share.
            </p>
            <p className="text-gray-700 mb-4">
              We also automatically collect certain information about your device and how you interact with our service, 
              including usage data, IP address, browser type, and device identifiers.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">How We Use Your Information</h2>
            <p className="text-gray-700 mb-4">
              We use the information we collect to:
            </p>
            <ul className="list-disc list-inside text-gray-700 space-y-2 mb-4">
              <li>Provide, maintain, and improve our services</li>
              <li>Process and display your sale listings</li>
              <li>Communicate with you about your account and our services</li>
              <li>Send you updates, security alerts, and support messages</li>
              <li>Detect, prevent, and address technical issues</li>
              <li>Personalize your experience</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">Third-Party Services</h2>
            <p className="text-gray-700 mb-4">
              We use third-party services to help us operate our platform:
            </p>
            <ul className="list-disc list-inside text-gray-700 space-y-2 mb-4">
              <li><strong>Supabase:</strong> For database and authentication services</li>
              <li><strong>Mapbox:</strong> For mapping and location services</li>
              <li><strong>Google AdSense:</strong> For advertising services</li>
              <li><strong>Analytics Services:</strong> To understand how our service is used</li>
            </ul>
            <p className="text-gray-700 mb-4">
              These services may collect information about you in accordance with their own privacy policies. 
              We encourage you to review their privacy policies to understand how they handle your data.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">Your Choices</h2>
            <p className="text-gray-700 mb-4">
              You have the right to:
            </p>
            <ul className="list-disc list-inside text-gray-700 space-y-2 mb-4">
              <li>Access and update your account information</li>
              <li>Delete your account and associated data</li>
              <li>Opt out of certain communications</li>
              <li>Request a copy of your personal data</li>
            </ul>
            <p className="text-gray-700 mb-4">
              To delete your account, please visit your account settings or contact us directly. 
              Note that some information may remain in our records after account deletion for legal or operational purposes.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">Data Security</h2>
            <p className="text-gray-700 mb-4">
              We implement appropriate technical and organizational measures to protect your personal information. 
              However, no method of transmission over the Internet or electronic storage is 100% secure, 
              and we cannot guarantee absolute security.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">Contact Us</h2>
            <p className="text-gray-700 mb-4">
              If you have questions about this Privacy Policy or our data practices, please contact us through 
              our support channels or by emailing us at support@lootaura.com.
            </p>
          </section>

          <p className="text-sm text-gray-500 mt-8 italic">
            This privacy policy is provided for informational purposes and does not constitute legal advice. 
            Please consult with a legal professional if you have specific privacy concerns.
          </p>
        </div>
      </div>
    </div>
  )
}

