"use client";

import { useState } from "react";
import Link from "next/link";

type Tab = "mcp" | "api";

export default function DocsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("mcp");
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
          Learn how to access SotaVault&apos;s papers, benchmarks, datasets, and venues programmatically using our Model Context Protocol (MCP) server or standard REST API endpoints.
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
          All programmatic calls to SotaVault—whether via the MCP server or the public REST API—require a personal API key to authorize requests and enforce rate limits.
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
                        <th className="pb-1.5 font-semibold">MCP Server</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-gray-600">
                      <tr>
                        <td className="py-1.5 font-medium">Rate Limit</td>
                        <td className="py-1.5">60 req/min</td>
                        <td className="py-1.5">20 req/min</td>
                      </tr>
                      <tr>
                        <td className="py-1.5 font-medium">Daily Quota</td>
                        <td className="py-1.5">2,500 req/day</td>
                        <td className="py-1.5">1,000 req/day</td>
                      </tr>
                      <tr>
                        <td className="py-1.5 font-medium">Concurrency</td>
                        <td className="py-1.5">Max 5</td>
                        <td className="py-1.5">Max 2</td>
                      </tr>
                      <tr>
                        <td className="py-1.5 font-medium">Timeout</td>
                        <td className="py-1.5">15s</td>
                        <td className="py-1.5">10s</td>
                      </tr>
                      <tr>
                        <td className="py-1.5 font-medium">Max Response</td>
                        <td className="py-1.5">10MB</td>
                        <td className="py-1.5">2MB</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* Section 2: Choose Integration Style */}
      <section className="mb-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <div className="p-2.5 bg-purple-50 text-purple-600 rounded-xl">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            2. Choose Integration Type
          </h2>

          {/* Toggle Buttons */}
          <div className="flex bg-gray-150 p-1 rounded-xl border border-gray-200">
            <button
              onClick={() => setActiveTab("mcp")}
              className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
                activeTab === "mcp"
                  ? "bg-white text-purple-700 shadow-sm"
                  : "text-gray-655 hover:text-gray-900"
              }`}
            >
              Model Context Protocol (MCP)
            </button>
            <button
              onClick={() => setActiveTab("api")}
              className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
                activeTab === "api"
                  ? "bg-white text-purple-700 shadow-sm"
                  : "text-gray-655 hover:text-gray-900"
              }`}
            >
              Public REST API
            </button>
          </div>
        </div>

        {/* Tab 1: MCP Server Docs */}
        {activeTab === "mcp" && (
          <div className="space-y-8 animate-fadeIn">
            {/* Description */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-8">
              <h3 className="text-xl font-bold text-gray-900 mb-3">About SotaVault MCP</h3>
              <p className="text-gray-700 leading-relaxed mb-4">
                SotaVault implements a read-only <strong>Model Context Protocol (MCP)</strong> server. MCP allows LLM clients (like Claude Desktop, Cursor, or custom local agents) to automatically explore the benchmark repository, fetch papers, search dataset taxonomies, and locate conference deadlines.
              </p>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-purple-50 text-purple-700 text-xs font-semibold rounded-lg border border-purple-100">
                Protocol Version: MCP 2.0+
              </div>
            </div>

            {/* How to setup */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-8">
              <h3 className="text-xl font-bold text-gray-900 mb-4">How to Setup</h3>
              <p className="text-gray-750 text-sm mb-4">
                SotaVault serves MCP over **SSE (Server-Sent Events)**. You can connect Claude Desktop or custom agents using the hosted transport endpoint.
              </p>

              <h4 className="font-semibold text-gray-900 text-sm mb-2">Claude Desktop Configuration</h4>
              <p className="text-xs text-gray-600 mb-3">
                Add the following connection details to your <code className="p-1 bg-gray-100 rounded font-mono text-xs">claude_desktop_config.json</code>:
              </p>

              <div className="relative">
                <pre className="bg-gray-900 text-gray-100 font-mono text-xs rounded-xl p-4 overflow-x-auto select-all">
{`{
  "mcpServers": {
    "sotavault": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/inspector",
        "https://api.sotavault.ai/mcp/sse?api_key=YOUR_API_KEY"
      ]
    }
  }
}`}
                </pre>
                <button
                  onClick={() =>
                    handleCopy(
                      `{\n  "mcpServers": {\n    "sotavault": {\n      "command": "npx",\n      "args": [\n        "-y",\n        "@modelcontextprotocol/inspector",\n        "https://api.sotavault.ai/mcp/sse?api_key=YOUR_API_KEY"\n      ]\n    }\n  }\n}`,
                      "claude_config"
                    )
                  }
                  className="absolute right-3 top-3 px-3 py-1.5 text-[10px] font-semibold bg-gray-800 text-gray-300 hover:text-white rounded-lg transition-colors border border-gray-700"
                >
                  {copiedText === "claude_config" ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>

            {/* Available tools */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="p-6 sm:p-8 border-b border-gray-200">
                <h3 className="text-xl font-bold text-gray-900">Available MCP Tools</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Once connected, your LLM agent will have automatic access to the following functions:
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200 text-gray-750 font-semibold">
                      <th className="px-6 py-4">Tool Name</th>
                      <th className="px-6 py-4">Arguments</th>
                      <th className="px-6 py-4">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-150 text-gray-655">
                    <tr className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 font-mono text-purple-700 font-medium">get_paper</td>
                      <td className="px-6 py-4 font-mono text-xs">{"{ paper_id: string }"}</td>
                      <td className="px-6 py-4">Fetch detailed metadata for a paper (title, year, abstract, authors).</td>
                    </tr>
                    <tr className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 font-mono text-purple-700 font-medium">get_paper_results</td>
                      <td className="px-6 py-4 font-mono text-xs">{"{ paper_id: string }"}</td>
                      <td className="px-6 py-4">Fetch specific benchmark performance rows (metrics, splits, datasets evaluated).</td>
                    </tr>
                    <tr className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 font-mono text-purple-700 font-medium">list_related_papers</td>
                      <td className="px-6 py-4 font-mono text-xs">{"{ paper_id: string }"}</td>
                      <td className="px-6 py-4">Find other preprints or editions of the same work sharing a logical ID.</td>
                    </tr>
                    <tr className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 font-mono text-purple-700 font-medium">get_dataset_series</td>
                      <td className="px-6 py-4 font-mono text-xs">{"{ series_id: string }"}</td>
                      <td className="px-6 py-4">Retrieve canonical dataset family info (e.g. ImageNet, COCO).</td>
                    </tr>
                    <tr className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 font-mono text-purple-700 font-medium">list_datasets_in_series</td>
                      <td className="px-6 py-4 font-mono text-xs">{"{ series_id: string }"}</td>
                      <td className="px-6 py-4">Retrieve concrete variants, splits, and modalities inside a series.</td>
                    </tr>
                    <tr className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 font-mono text-purple-700 font-medium">get_dataset_leaderboard</td>
                      <td className="px-6 py-4 font-mono text-xs">{"{ dataset_id: string }"}</td>
                      <td className="px-6 py-4">Fetch ranked leaderboard entries for a given dataset.</td>
                    </tr>
                    <tr className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 font-mono text-purple-700 font-medium">list_tasks</td>
                      <td className="px-6 py-4 font-mono text-xs">{"{ domain?: string }"}</td>
                      <td className="px-6 py-4">List all task definitions, optionally filtered by domain (e.g. &apos;Computer Vision&apos;).</td>
                    </tr>
                    <tr className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 font-mono text-purple-700 font-medium">get_task_details</td>
                      <td className="px-6 py-4 font-mono text-xs">{"{ task_id: string }"}</td>
                      <td className="px-6 py-4">Get description and metadata details for a task.</td>
                    </tr>
                    <tr className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 font-mono text-purple-700 font-medium">get_venue_details</td>
                      <td className="px-6 py-4 font-mono text-xs">{"{ venue_id: string }"}</td>
                      <td className="px-6 py-4">Fetch details for a specific conference/venue edition.</td>
                    </tr>
                    <tr className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 font-mono text-purple-700 font-medium">list_conference_deadlines</td>
                      <td className="px-6 py-4 font-mono text-xs">{"{ days_ahead?: number }"}</td>
                      <td className="px-6 py-4">List upcoming submission and abstract deadlines.</td>
                    </tr>
                    <tr className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 font-mono text-purple-700 font-medium">search_papers_fuzzy</td>
                      <td className="px-6 py-4 font-mono text-xs">{"{ query: string, limit?: number }"}</td>
                      <td className="px-6 py-4">Fuzzy text search for papers using Meilisearch indexes.</td>
                    </tr>
                    <tr className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 font-mono text-purple-700 font-medium">search_datasets_fuzzy</td>
                      <td className="px-6 py-4 font-mono text-xs">{"{ query: string, limit?: number }"}</td>
                      <td className="px-6 py-4">Fuzzy text search for datasets using Meilisearch indexes.</td>
                    </tr>
                    <tr className="hover:bg-gray-50 transition-colors opacity-60">
                      <td className="px-6 py-4 font-mono text-purple-700 font-medium flex items-center gap-1.5">
                        semantic_search
                        <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded font-sans font-medium uppercase">Planned</span>
                      </td>
                      <td className="px-6 py-4 font-mono text-xs">{"{ query: string, limit?: number }"}</td>
                      <td className="px-6 py-4 text-gray-550 italic">Semantic vector search for papers and datasets. (Will be available in a future release once embedding generation is ready).</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* How to call it */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-8">
              <h3 className="text-xl font-bold text-gray-900 mb-4">How to Call (JSON-RPC Example)</h3>
              <p className="text-gray-750 text-sm mb-4">
                To invoke a tool, send a standard JSON-RPC request body to the server:
              </p>

              <div className="relative">
                <pre className="bg-gray-900 text-gray-100 font-mono text-xs rounded-xl p-4 overflow-x-auto select-all">
{`{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "search_papers_fuzzy",
    "arguments": {
      "query": "transformer",
      "limit": 3
    }
  },
  "id": 1
}`}
                </pre>
                <button
                  onClick={() =>
                    handleCopy(
                      `{\n  "jsonrpc": "2.0",\n  "method": "tools/call",\n  "params": {\n    "name": "search_papers_fuzzy",\n    "arguments": {\n      "query": "transformer",\n      "limit": 3\n    }\n  },\n  "id": 1\n}`,
                      "jsonrpc_example"
                    )
                  }
                  className="absolute right-3 top-3 px-3 py-1.5 text-[10px] font-semibold bg-gray-800 text-gray-300 hover:text-white rounded-lg transition-colors border border-gray-700"
                >
                  {copiedText === "jsonrpc_example" ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: REST API Docs */}
        {activeTab === "api" && (
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
        )}
      </section>
    </div>
  );
}
