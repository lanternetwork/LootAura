import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms of Use · LootAura',
  description: 'LootAura terms of use governing your access to and use of our platform.',
}

export default function TermsPage() {
  const lastUpdated = 'November 24, 2024'

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="max-w-3xl mx-auto px-4 md:px-6 lg:px-8 py-10 md:py-12">
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">Terms of Use</h1>
        <p className="text-sm text-gray-500 mb-8">Last updated: {lastUpdated}</p>
        
        <div className="prose prose-gray max-w-none">
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">Acceptance of Terms</h2>
            <p className="text-gray-700 mb-4">
              By accessing or using Loot Aura, you agree to be bound by these Terms of Use and all applicable laws and regulations. 
              If you do not agree with any of these terms, you are prohibited from using or accessing this service.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">Eligibility & Account Responsibilities</h2>
            <p className="text-gray-700 mb-4">
              You must be at least 18 years old to use Loot Aura. By creating an account, you represent and warrant that:
            </p>
            <ul className="list-disc list-inside text-gray-700 space-y-2 mb-4">
              <li>You are of legal age to form a binding contract</li>
              <li>You will provide accurate and complete information</li>
              <li>You will maintain the security of your account credentials</li>
              <li>You are responsible for all activities that occur under your account</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">User Content</h2>
            <p className="text-gray-700 mb-4">
              When you post sale listings, photos, descriptions, or other content on Loot Aura, you agree that:
            </p>
            <ul className="list-disc list-inside text-gray-700 space-y-2 mb-4">
              <li>You own or have the right to post the content</li>
              <li>All information is accurate and truthful</li>
              <li>You will not post illegal, harmful, or fraudulent content</li>
              <li>You grant us a license to display and distribute your content on our platform</li>
              <li>You are responsible for ensuring your listings comply with all applicable laws</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">Prohibited Activities</h2>
            <p className="text-gray-700 mb-4">
              You agree not to:
            </p>
            <ul className="list-disc list-inside text-gray-700 space-y-2 mb-4">
              <li>Post listings for illegal items or services</li>
              <li>Harass, abuse, or harm other users</li>
              <li>Impersonate any person or entity</li>
              <li>Use the service for any fraudulent or unlawful purpose</li>
              <li>Interfere with or disrupt the service or servers</li>
              <li>Attempt to gain unauthorized access to any part of the service</li>
              <li>Collect or harvest information about other users without their consent</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">Transactions Between Users</h2>
            <p className="text-gray-700 mb-4">
              Loot Aura is a platform that connects buyers and sellers. We are not involved in any transactions between users. 
              You acknowledge that:
            </p>
            <ul className="list-disc list-inside text-gray-700 space-y-2 mb-4">
              <li>All transactions are between you and other users</li>
              <li>We are not responsible for the quality, safety, or legality of items listed</li>
              <li>We do not guarantee the accuracy of listings or user information</li>
              <li>You are responsible for verifying information before making purchases</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">Limitation of Liability</h2>
            <p className="text-gray-700 mb-4">
              To the fullest extent permitted by law, Loot Aura and its operators shall not be liable for any indirect, 
              incidental, special, consequential, or punitive damages, or any loss of profits or revenues, whether incurred 
              directly or indirectly, or any loss of data, use, goodwill, or other intangible losses resulting from your use 
              of the service.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">Changes to Terms</h2>
            <p className="text-gray-700 mb-4">
              We reserve the right to modify these Terms of Use at any time. We will notify users of any material changes 
              by posting the new terms on this page and updating the "Last updated" date. Your continued use of the service 
              after such changes constitutes acceptance of the new terms.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">Termination</h2>
            <p className="text-gray-700 mb-4">
              We may terminate or suspend your account and access to the service immediately, without prior notice, 
              for any reason, including if you breach these Terms of Use.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">Contact Information</h2>
            <p className="text-gray-700 mb-4">
              If you have questions about these Terms of Use, please contact us at support@lootaura.com.
            </p>
          </section>

          <p className="text-sm text-gray-500 mt-8 italic">
            These terms of use are provided for informational purposes and do not constitute legal advice. 
            Please consult with a legal professional if you have specific questions about your rights and obligations.
          </p>
        </div>
      </div>
    </div>
  )
}

