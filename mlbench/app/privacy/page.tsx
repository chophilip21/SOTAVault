export default function PrivacyPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Privacy Policy</h1>

        <div className="prose prose-gray max-w-none">
          <p className="text-sm text-gray-600 mb-6">
            Last updated: {new Date().toLocaleDateString()}
          </p>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">1. Data We Collect and Why</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              Because SotaVault requires user authentication to access services, we collect the following information:
            </p>
            <div className="space-y-4 text-gray-700 leading-relaxed">
              <p>
                <strong>Account Identification (Required):</strong> Email address and account password (securely encrypted). We use your email to securely identify you, manage active sessions, and monitor resource usage metrics across sensitive computing pipelines.
              </p>
              <p>
                <strong>Optional Profile Data (Optional):</strong> Your name and institutional/professional affiliation. These fields are completely voluntary; you do not need to fill them out to use the platform.
              </p>
              <p>
                <strong>Automated System Logs:</strong> Standard network logs, including your IP address and access timestamps, are collected strictly to maintain infrastructure security, analyze database errors, and prevent malicious web scraping.
              </p>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">2. Legal Basis for Processing</h2>
            <p className="text-gray-700 leading-relaxed">
              We process your information based on your explicit Consent provided when checking the agreement boxes at registration, and our Legitimate Interest in protecting our cloud infrastructure from resource exhaustion and malicious security threats.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">3. Data Storage, Retention, and Security</h2>
            <p className="text-gray-700 leading-relaxed">
              Your personal account info is hosted using secure Google Cloud Platform (GCP) infrastructure. We employ industry-standard access management and encryption controls to keep your email safe. We do not sell, trade, or share your data with any third-party commercial entities.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">4. User Rights: Modification and Absolute Deletion</h2>
            <p className="text-gray-700 leading-relaxed">
              You retain complete control over your profile data. From your account&apos;s Settings tab, you have the right to modify your optional details or completely delete your account at any time. Upon clicking &ldquo;Delete Account&rdquo;, all of your personal identifier records, emails, and linked metadata will be instantly and permanently purged from our active databases and downstream system backup states.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">5. Content Correction Requests for Authors</h2>
            <p className="text-gray-700 leading-relaxed">
              We value data integrity within the machine learning community. If you are an author or verified owner of a paper or dataset cataloged on SotaVault, and you discover an error, misattribution, or ingestion hallucination within our data schema, please contact us directly at{" "}
              <a href="mailto:admin@sotavault.ai" className="text-green-600 hover:text-green-700 underline">
                admin@sotavault.ai
              </a>
              . We will process and rectify valid metadata corrections promptly.
            </p>
          </section>

          <div className="mt-8 pt-6 border-t border-gray-200">
            <p className="text-sm text-gray-600">
              If you have any questions about this Privacy Policy, please contact us at{" "}
              <a href="mailto:admin@sotavault.ai" className="text-green-600 hover:text-green-700 underline">
                admin@sotavault.ai
              </a>
              .
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
