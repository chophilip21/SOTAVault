"use client";

import { useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { LoadingSpinner } from "../LoadingSpinner";

function GraphLoadingPlaceholder({ label }: { label: string }) {
  return (
    <div className="h-[480px] flex flex-col items-center justify-center gap-3 bg-gray-50 rounded-lg">
      <LoadingSpinner size="lg" />
      <p className="text-gray-500 text-sm">{label}</p>
    </div>
  );
}

// deck.gl needs WebGL, so both views are client-only and only bundled/mounted on demand.
const PaperGalaxyView = dynamic(() => import("./PaperGalaxyView"), {
  ssr: false,
  loading: () => <GraphLoadingPlaceholder label="Loading paper galaxy…" />,
});
const DatasetGraphView = dynamic(() => import("./DatasetGraphView"), {
  ssr: false,
  loading: () => <GraphLoadingPlaceholder label="Loading dataset graph…" />,
});

type TabKey = "papers" | "datasets";

const TABS: { key: TabKey; label: string }[] = [
  { key: "papers", label: "Papers" },
  { key: "datasets", label: "Datasets" },
];

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 text-sm font-medium rounded-md transition ${
        active ? "bg-white text-green-700 shadow-sm" : "text-gray-600 hover:text-gray-900"
      }`}
    >
      {children}
    </button>
  );
}

export default function GraphExplorer() {
  const [activeTab, setActiveTab] = useState<TabKey>("papers");
  // Once a tab has been visited we keep it mounted (just hidden) so switching
  // back doesn't re-fetch/re-decode the (large) Arrow file.
  const [visited, setVisited] = useState<Record<TabKey, boolean>>({
    papers: true,
    datasets: false,
  });

  const selectTab = (tab: TabKey) => {
    setActiveTab(tab);
    setVisited((prev) => (prev[tab] ? prev : { ...prev, [tab]: true }));
  };

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
      <div className="flex flex-wrap items-start sm:items-center justify-between gap-3 px-4 sm:px-5 pt-4 pb-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Semantic Graph Explorer</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Every paper and dataset, positioned by embedding similarity.
          </p>
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {TABS.map((tab) => (
            <TabButton key={tab.key} active={activeTab === tab.key} onClick={() => selectTab(tab.key)}>
              {tab.label}
            </TabButton>
          ))}
        </div>
      </div>

      <div className="px-3 sm:px-4 pb-4">
        <div className={activeTab === "papers" ? "block" : "hidden"}>
          {visited.papers && <PaperGalaxyView />}
        </div>
        <div className={activeTab === "datasets" ? "block" : "hidden"}>
          {visited.datasets && <DatasetGraphView />}
        </div>
      </div>
    </div>
  );
}
