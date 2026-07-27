"use client";

import { useState, useRef, type ReactNode } from "react";
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
  loading: () => <GraphLoadingPlaceholder label="Loading topic map…" />,
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
  // Keep the papers topic map mounted after first visit (large Arrow decode).
  // Datasets remount on each visit so regenerations + WebGL state stay fresh.
  const [papersVisited, setPapersVisited] = useState(true);

  const paperResetRef = useRef<(() => void) | null>(null);
  const datasetResetRef = useRef<(() => void) | null>(null);

  const selectTab = (tab: TabKey) => {
    setActiveTab(tab);
    if (tab === "papers") setPapersVisited(true);
  };

  const handleResetView = () => {
    if (activeTab === "papers") {
      paperResetRef.current?.();
    } else if (activeTab === "datasets") {
      datasetResetRef.current?.();
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
      <div className="flex flex-col items-center gap-3 px-4 pt-4 pb-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="w-full text-center sm:w-auto sm:text-left">
          <h3 className="text-lg font-semibold text-gray-900">Semantic Graph Explorer</h3>
          <p className="mt-0.5 text-xs text-gray-500">
            Papers by topic clusters · dataset series by embedding similarity.
          </p>
        </div>
        <div className="flex items-center gap-2.5 shrink-0 flex-wrap justify-center sm:justify-end">
          <button
            type="button"
            onClick={handleResetView}
            className="rounded-lg border-2 border-green-600 bg-green-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-green-700 hover:border-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-1 transition-all"
          >
            Reset view
          </button>
          <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
            {TABS.map((tab) => (
              <TabButton key={tab.key} active={activeTab === tab.key} onClick={() => selectTab(tab.key)}>
                {tab.label}
              </TabButton>
            ))}
          </div>
        </div>
      </div>

      <div className="px-3 sm:px-4 pb-4">
        <div className={activeTab === "papers" ? "block" : "hidden"}>
          {papersVisited && <PaperGalaxyView onResetRef={paperResetRef} />}
        </div>
        <div className={activeTab === "datasets" ? "block" : "hidden"}>
          {activeTab === "datasets" && <DatasetGraphView onResetRef={datasetResetRef} />}
        </div>
      </div>
    </div>
  );
}
