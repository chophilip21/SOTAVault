import Image from "next/image";

export default function AcknowledgementPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6 md:p-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4 sm:mb-6">Acknowledgements</h1>
        
        <div className="prose prose-gray max-w-none">
          <p className="text-gray-700 leading-relaxed mb-8">
            This project would not be possible without the generous contributions from the following organizations and open-source communities. We extend our sincere gratitude to all of them.
          </p>

          {/* arXiv Acknowledgement */}
          <section className="mb-10 p-4 sm:p-6 bg-gradient-to-r from-red-50 to-orange-50 rounded-xl border border-red-100">
            <div className="flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-6">
              <div className="flex-shrink-0 flex justify-center sm:justify-start">
                <a 
                  href="https://arxiv.org" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="block"
                >
                  <Image
                    src="/ArXiv_logo_2022.png"
                    alt="arXiv logo"
                    width={120}
                    height={50}
                    className="object-contain"
                  />
                </a>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-3 text-center sm:text-left">arXiv</h2>
                <p className="text-gray-700 leading-relaxed mb-4">
                  Thank you to arXiv for use of its open access interoperability.
                </p>
                <p className="text-gray-600 text-sm leading-relaxed">
                  arXiv is a free distribution service and an open-access archive for millions of scholarly articles in the fields of physics, mathematics, computer science, quantitative biology, quantitative finance, statistics, electrical engineering and systems science, and economics. We rely on arXiv&apos;s API and metadata to provide comprehensive paper information to our users.
                </p>
                <a 
                  href="https://arxiv.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 mt-4 text-red-600 hover:text-red-700 font-medium text-sm transition-colors"
                >
                  Visit arXiv.org
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </div>
            </div>
          </section>

          {/* Papers with Code Acknowledgement */}
          <section className="mb-10 p-4 sm:p-6 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-100">
            <div className="flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-6">
              <div className="flex-shrink-0 flex justify-center sm:justify-start">
                <a 
                  href="https://paperswithcode.com" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="w-[120px] h-[50px] bg-blue-600 rounded-lg flex items-center justify-center"
                >
                  <span className="text-white font-bold text-sm text-center leading-tight px-2">
                    Papers<br/>With Code
                  </span>
                </a>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-3 text-center sm:text-left">Papers with Code</h2>
                <p className="text-gray-700 leading-relaxed mb-4">
                  We gratefully acknowledge Papers with Code for sharing their legacy dataset with the open-source community.
                </p>
                <p className="text-gray-600 text-sm leading-relaxed">
                  Papers with Code provides an incredible resource that links machine learning papers with their implementation code, datasets, and evaluation benchmarks. Their open dataset, licensed under CC-BY-SA, has been instrumental in building our knowledge base of research papers, methods, and benchmark results.
                </p>
                <div className="flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4 mt-4">
                  <a 
                    href="https://paperswithcode.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium text-sm transition-colors"
                  >
                    Visit Papers with Code
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                  <a 
                    href="https://github.com/paperswithcode/paperswithcode-data"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-gray-700 hover:text-gray-900 font-medium text-sm transition-colors"
                  >
                    <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                      <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                    </svg>
                    <span className="break-words">View Dataset on GitHub</span>
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </div>
              </div>
            </div>
          </section>

          {/* Additional Thanks */}
          <section className="mb-8 p-4 sm:p-6 bg-gray-50 rounded-xl border border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Open Source Community</h2>
            <p className="text-gray-700 leading-relaxed">
              We also extend our thanks to the broader open-source community and all the researchers who openly share their work. The spirit of open science and collaboration makes projects like this possible.
            </p>
          </section>

          <div className="mt-8 pt-6 border-t border-gray-200">
            <p className="text-sm text-gray-600">
              If you believe we should acknowledge additional sources or have any questions, please contact us.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

