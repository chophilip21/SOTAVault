"use client";

import { useState } from "react";
import Link from "next/link";

export default function DocsPage() {
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Helper to copy text to clipboard with a brief visual feedback
  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(id);
    setTimeout(() => setCopiedText(null), 2000);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fadeIn">
      {/* Page Header */}
      <div className="mb-10 text-center sm:text-left">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">
          Developer Documentation
        </h1>
        <p className="mt-3 text-lg text-gray-600 max-w-3xl">
          Learn how to access SotaVault&apos;s papers, benchmarks, datasets, and venues programmatically using our standard REST API endpoints.
        </p>
      </div>

      {/* Section 1: Authentication & API Keys */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-8 mb-8 transition-all hover:shadow-md">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2.5 bg-green-50 text-green-600 rounded-xl">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900">1. Authentication & API Keys</h2>
        </div>

        <p className="text-gray-700 leading-relaxed mb-6">
          All programmatic calls to SotaVault&apos;s public REST API require a personal API key to authorize requests and enforce rate limits.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-50 rounded-xl p-5 sm:p-6 border border-gray-150">
          <div>
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <span className="flex items-center justify-center w-5 h-5 bg-green-100 text-green-700 rounded-full text-xs font-bold">1</span>
              Generating Your API Key
            </h3>
            <ol className="space-y-2.5 text-sm text-gray-650 list-decimal pl-5">
              <li>Sign in to your SotaVault account.</li>
              <li>
                Click on your user avatar in the top-right corner and select{" "}
                <Link href="/profile" className="text-green-600 hover:text-green-750 font-medium underline">
                  Profile
                </Link>.
              </li>
              <li>Navigate to the <strong>Account Management</strong> tab.</li>
              <li>Locate the <strong>API Key</strong> card and click <strong>Generate API Key</strong>.</li>
              <li>
                <span className="text-red-600 font-medium">Important:</span> Copy the 32-character key immediately. For security, it will not be displayed again.
              </li>
            </ol>
          </div>

          <div className="border-t md:border-t-0 md:border-l border-gray-200 pt-5 md:pt-0 md:pl-6">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <span className="flex items-center justify-center w-5 h-5 bg-green-100 text-green-700 rounded-full text-xs font-bold">2</span>
              Key Usage & Limits
            </h3>
            <ul className="space-y-2 text-sm text-gray-650 list-disc pl-5">
              <li>
                <strong>Header Authentication (Recommended):</strong>
                <code className="block mt-1 p-1.5 bg-gray-200 text-gray-800 rounded font-mono text-xs select-all">
                  X-API-Key: sv_YOUR_API_KEY
                </code>
                or using a Bearer token:
                <code className="block mt-1 p-1.5 bg-gray-200 text-gray-800 rounded font-mono text-xs select-all">
                  Authorization: Bearer sv_YOUR_API_KEY
                </code>
              </li>
              <li>
                <strong>Service Limits & Quotas:</strong>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-gray-200 text-gray-600">
                        <th className="pb-1.5 font-semibold">Policy</th>
                        <th className="pb-1.5 font-semibold">REST API</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-gray-600">
                      <tr>
                        <td className="py-1.5 font-medium">Rate Limit</td>
                        <td className="py-1.5">60 req/min</td>
                      </tr>
                      <tr>
                        <td className="py-1.5 font-medium">Daily Quota</td>
                        <td className="py-1.5">2,500 req/day</td>
                      </tr>
                      <tr>
                        <td className="py-1.5 font-medium">Concurrency</td>
                        <td className="py-1.5">Max 5</td>
                      </tr>
                      <tr>
                        <td className="py-1.5 font-medium">Timeout</td>
                        <td className="py-1.5">15s</td>
                      </tr>
                      <tr>
                        <td className="py-1.5 font-medium">Max Response</td>
                        <td className="py-1.5">10MB</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* Section 2: REST API Docs */}
      <section className="mb-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <div className="p-2.5 bg-purple-50 text-purple-600 rounded-xl">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            2. Using the REST API
          </h2>
        </div>

        <div className="space-y-8 animate-fadeIn">
          {/* Description */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-8">
            <h3 className="text-xl font-bold text-gray-900 mb-3">About SotaVault REST API</h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              SotaVault provides a complete, developer-friendly JSON REST API. All endpoints are versioned under <code className="px-1.5 py-0.5 bg-gray-100 rounded text-red-600 font-mono text-sm">/v1</code> and return standard response schemas.
            </p>
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-semibold rounded-lg border border-blue-100">
                Base URL: https://api.sotavault.ai/v1
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 text-xs font-semibold rounded-lg border border-green-100">
                Auth Header Required
              </span>
            </div>
          </div>

          {/* How to Setup */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-8">
            <h3 className="text-xl font-bold text-gray-900 mb-4">How to Call</h3>
            <p className="text-gray-750 text-sm mb-4">
              Include your API key as a header. Below are call examples using various languages:
            </p>

            <div className="relative">
              <pre className="bg-gray-900 text-gray-100 font-mono text-xs rounded-xl p-4 overflow-x-auto select-all">
{`# 1. cURL Example
curl -H "X-API-Key: sv_YOUR_API_KEY" \\
     "https://api.sotavault.ai/v1/papers/attention-is-all-you-need"

# 2. Python Example
import requests

headers = {"X-API-Key": "sv_YOUR_API_KEY"}
response = requests.get(
    "https://api.sotavault.ai/v1/papers/attention-is-all-you-need", 
    headers=headers
)
paper = response.json()
print(paper["title"])`}
              </pre>
              <button
                onClick={() =>
                  handleCopy(
                    `curl -H "X-API-Key: sv_YOUR_API_KEY" \\\n     "https://api.sotavault.ai/v1/papers/attention-is-all-you-need"`,
                    "curl_example"
                  )
                }
                className="absolute right-3 top-3 px-3 py-1.5 text-[10px] font-semibold bg-gray-800 text-gray-300 hover:text-white rounded-lg transition-colors border border-gray-700"
              >
                {copiedText === "curl_example" ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>

          {/* Endpoints Table */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-6 sm:p-8 border-b border-gray-200">
              <h3 className="text-xl font-bold text-gray-900">REST API Endpoints</h3>
              <p className="text-sm text-gray-600 mt-1">
                The following routes are available on SotaVault&apos;s public API:
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-gray-750 font-semibold">
                    <th className="px-6 py-4">Method</th>
                    <th className="px-6 py-4">Endpoint</th>
                    <th className="px-6 py-4">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-150 text-gray-655 font-mono">
                  <tr className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-green-700 font-bold">GET</td>
                    <td className="px-6 py-4 font-medium">/v1/papers/{"{paper_id}"}</td>
                    <td className="px-6 py-4 font-sans text-gray-600">Get metadata details for a paper by ID.</td>
                  </tr>
                  <tr className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-green-700 font-bold">GET</td>
                    <td className="px-6 py-4 font-medium">/v1/papers/{"{paper_id}"}/results</td>
                    <td className="px-6 py-4 font-sans text-gray-600">Get specific benchmark evaluation result rows for a paper.</td>
                  </tr>
                  <tr className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-green-700 font-bold">GET</td>
                    <td className="px-6 py-4 font-medium">/v1/papers/{"{paper_id}"}/related</td>
                    <td className="px-6 py-4 font-sans text-gray-600">Find other preprint or conference variants sharing the same logical ID.</td>
                  </tr>
                  <tr className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-green-700 font-bold">GET</td>
                    <td className="px-6 py-4 font-medium">/v1/datasets/series/{"{series_id}"}</td>
                    <td className="px-6 py-4 font-sans text-gray-600">Get canonical dataset series family info (e.g. COCO).</td>
                  </tr>
                  <tr className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-green-700 font-bold">GET</td>
                    <td className="px-6 py-4 font-medium">/v1/datasets/series/{"{series_id}"}/variants</td>
                    <td className="px-6 py-4 font-sans text-gray-600">Get concrete variants and splits belonging to a series.</td>
                  </tr>
                  <tr className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-green-700 font-bold">GET</td>
                    <td className="px-6 py-4 font-medium">/v1/datasets/leaderboard/{"{dataset_id}"}</td>
                    <td className="px-6 py-4 font-sans text-gray-600">Fetch the ranked benchmark leaderboard for a specific dataset split.</td>
                  </tr>
                  <tr className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-green-700 font-bold">GET</td>
                    <td className="px-6 py-4 font-medium">/v1/tasks</td>
                    <td className="px-6 py-4 font-sans text-gray-600">List all task definitions (optional: filter by ?domain).</td>
                  </tr>
                  <tr className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-green-700 font-bold">GET</td>
                    <td className="px-6 py-4 font-medium">/v1/tasks/{"{task_id}"}</td>
                    <td className="px-6 py-4 font-sans text-gray-600">Get description and taxonomy details for a specific task.</td>
                  </tr>
                  <tr className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-green-700 font-bold">GET</td>
                    <td className="px-6 py-4 font-medium">/v1/venues/deadlines</td>
                    <td className="px-6 py-4 font-sans text-gray-600">List upcoming abstract and submission deadlines (default: 90 days).</td>
                  </tr>
                  <tr className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-green-700 font-bold">GET</td>
                    <td className="px-6 py-4 font-medium">/v1/venues/{"{venue_id}"}</td>
                    <td className="px-6 py-4 font-sans text-gray-600">Retrieve dates and location details for a specific conference venue.</td>
                  </tr>
                  <tr className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-green-700 font-bold">GET</td>
                    <td className="px-6 py-4 font-medium">/v1/search/fuzzy</td>
                    <td className="px-6 py-4 font-sans text-gray-600">Fuzzy search both papers and datasets (query: ?q, limit: ?limit).</td>
                  </tr>
                  <tr className="hover:bg-gray-50 transition-colors opacity-60">
                    <td className="px-6 py-4 text-green-700 font-bold flex items-center gap-1.5">
                      GET
                      <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded font-sans font-medium uppercase">Planned</span>
                    </td>
                    <td className="px-6 py-4 font-medium">/v1/search/semantic</td>
                    <td className="px-6 py-4 font-sans text-gray-550 italic">Semantic vector search. (Will be available in a future release once embedding generation is ready).</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
