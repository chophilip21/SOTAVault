export default function TermsPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Terms of Service</h1>

        <div className="prose prose-gray max-w-none">
          <p className="text-sm text-gray-600 mb-6">
            Last updated: {new Date().toLocaleDateString()}
          </p>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">1. Acceptance of Terms</h2>
            <p className="text-gray-700 leading-relaxed">
              By creating an account, checking the box indicating your agreement, and continuing to use or access SotaVault, you acknowledge that you have read, understood, and agree to be bound by these Terms of Service. If you do not agree, you are strictly prohibited from accessing or using any part of the Service.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">2. Age Restrictions and Eligibility</h2>
            <p className="text-gray-700 leading-relaxed">
              The Service is not intended for, or directed to, individuals under the age of 13. You must be at least 13 years old to create an account or utilize the platform. By checking the age verification box during sign-up, you represent and warrant that you meet this minimum age requirement. If we discover that personal data has been collected from a person under 13, it will be terminated and permanently deleted immediately.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">3. Non-Commercial Status and Availability</h2>
            <p className="text-gray-700 leading-relaxed">
              SotaVault is a non-commercial, independently managed machine learning benchmark archive. The Service is provided free of charge at the sole discretion of the administrator. We reserve the right to modify, suspend, throttle, or terminate the platform, specific endpoints (including Retrieval-Augmented Generation / RAG services), or your individual account access at any time, for any reason, without notice or liability.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">4. Intellectual Property and Data Ownership</h2>
            <div className="space-y-4 text-gray-700 leading-relaxed">
              <p>
                <strong>Third-Party Content:</strong> SotaVault does not claim ownership over any original academic papers, standard public datasets, or conference data displayed on the platform. All rights, titles, and copyrights belong to their respective original authors and publishers.
              </p>
              <p>
                <strong>SotaVault Benchmark Metadata:</strong> We retain exclusive ownership over the unique compiled benchmark metadata, structures, and schemas generated via our custom translation, extraction, and language model pipelines.
              </p>
              <p>
                <strong>Usage Restrictions:</strong> You are granted a limited, personal, non-transferable license to view, analyze, and manually browse this metadata for personal, academic, or research purposes. You are strictly forbidden from using automated programmatic tools (including scrapers, bots, scripts, or spiders) to bulk-extract, clone, or harvest data from our API or frontend interfaces.
              </p>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">5. Abuse Prevention and Security Guardrails</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              To protect cluster stability and control infrastructure costs, we monitor system traffic metrics. We reserve the absolute right to temporarily or permanently restrict, block, or delete your account if we detect suspicious behaviors, including but not limited to:
            </p>
            <ul className="list-disc list-inside text-gray-700 space-y-2 ml-4">
              <li>Submitting high-frequency automated endpoint calls (scraping attempts).</li>
              <li>Attempting Denial of Service (DoS) attacks or cluster infrastructure manipulation.</li>
              <li>Exploiting expensive compute pathways (such as RAG or LLM search endpoints).</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">6. Disclaimer of Warranties (&ldquo;AS IS&rdquo;)</h2>
            <p className="text-gray-700 leading-relaxed uppercase text-sm">
              The Service, including all comprehensive benchmark metadata, is provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis. The metadata has been extracted and transformed utilizing automated algorithms and machine learning models, which are inherently subject to errors, omissions, or hallucinations. The owner disclaims all warranties, express or implied, including any warranties of accuracy, completeness, merchantability, or fitness for a particular purpose. You use this data entirely at your own risk.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">7. Unilateral Modifications</h2>
            <p className="text-gray-700 leading-relaxed">
              We reserve the right to update or change these Terms at any time to reflect cloud infrastructure shifts, operational costs, or regulatory changes. When an update occurs, we will notify registered users via the email provided at registration or through a prominent banner on the platform. Your continued use of the platform after such notifications constitutes implicit acceptance of the revised Terms.
            </p>
          </section>

          <div className="mt-8 pt-6 border-t border-gray-200">
            <p className="text-sm text-gray-600">
              If you have any questions about these Terms of Service, please contact us.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
