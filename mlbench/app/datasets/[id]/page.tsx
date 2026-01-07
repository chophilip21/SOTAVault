"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { config } from "@/lib/config";
import { getBackendBaseUrl } from "@/lib/backendUrl";

interface Dataset {
  id: string;
  name: string;
  full_name?: string;
  slug: string;
  description?: string;
  domain?: string;
  homepage?: string;
  introduced_date?: string;
  modalities?: string[];
  languages?: string[];
  variants?: string[];
  task_ids?: string[];
  paper_count?: number;
  created_at?: string;
  updated_at?: string;
}

interface Task {
  id: string;
  name: string;
  slug: string;
  description?: string;
  domain?: string;
}

interface TasksResponse {
  items: Task[];
  limit: number;
  next_cursor?: string | null;
  has_more: boolean;
}

const DOMAIN_ICONS: Record<string, string> = {
  cv: "/icons/cv.png",
  nlp: "/icons/nlp.png",
  audio: "/icons/audio.png",
  robots: "/icons/robotics.png",
  time_series: "/icons/timeseries.png",
  multimodal: "/icons/multi.png",
  theory: "/icons/theory.png",
  other: "/icons/cv.png",
};

const getDomainIcon = (domain?: string): string => {
  if (!domain) return "/icons/cv.png";
  return DOMAIN_ICONS[domain] || "/icons/cv.png";
};

export default function DatasetDetailPage() {
  const params = useParams();
  const datasetId = params.id as string;
  
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tasksById, setTasksById] = useState<Record<string, Task>>({});
  const [tasksLoading, setTasksLoading] = useState(false);
  const [showAllTasks, setShowAllTasks] = useState(false);

  useEffect(() => {
    const fetchDataset = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${getBackendBaseUrl()}/datasets/${datasetId}`);
        if (!res.ok) {
          if (res.status === 404) {
            throw new Error("Dataset not found");
          }
          throw new Error("Failed to load dataset");
        }
        const data: Dataset = await res.json();
        setDataset(data);
      } catch (err: any) {
        setError(err.message || "Failed to load dataset");
      } finally {
        setLoading(false);
      }
    };

    if (datasetId) {
      fetchDataset();
    }
  }, [datasetId]);

  const taskIds = dataset?.task_ids || [];
  const totalTaskCount = taskIds.length;
  const visibleTaskIds = useMemo(() => {
    if (showAllTasks) return taskIds;
    return taskIds.slice(0, 7);
  }, [taskIds, showAllTasks]);

  // Resolve task_ids -> task names for this dataset.
  // Performance: only fetch the first 7 initially; fetch all when expanded.
  useEffect(() => {
    if (!dataset || visibleTaskIds.length === 0) return;

    const controller = new AbortController();
    setTasksLoading(true);
    (async () => {
      try {
        // Only request IDs we don't already have.
        const missing = visibleTaskIds.filter((id) => !tasksById[id]);
        if (missing.length === 0) return;

        const chunks: string[][] = [];
        for (let i = 0; i < missing.length; i += 200) chunks.push(missing.slice(i, i + 200));

        for (const chunk of chunks) {
          const url = new URL(`${getBackendBaseUrl()}/tasks/bulk`);
          chunk.forEach((id) => url.searchParams.append("ids", id));
          const res = await fetch(url.toString(), { signal: controller.signal });
          if (!res.ok) continue;
          const data: TasksResponse = await res.json();
          const items = data.items || [];
          if (items.length === 0) continue;
          setTasksById((prev) => {
            const next = { ...prev };
            for (const t of items) next[t.id] = t;
            return next;
          });
        }
      } catch (err: any) {
        if (err?.name === "AbortError") return;
      } finally {
        setTasksLoading(false);
      }
    })();

    return () => controller.abort();
  }, [dataset, visibleTaskIds, tasksById]);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-gray-500">Loading dataset...</div>
      </div>
    );
  }

  if (error || !dataset) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-red-600">{error || "Dataset not found"}</div>
        <Link href="/benchmark" className="text-green-600 hover:underline mt-4 inline-block">
          ← Back to Benchmarks
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <Link href="/benchmark" className="text-green-600 hover:underline inline-flex items-center gap-1">
        <span>←</span> Back to Benchmarks
      </Link>

      <div className="bg-white border border-gray-100 rounded-2xl p-8 shadow-sm">
        <div className="flex items-start gap-6">
          <div className="flex-shrink-0 w-32 h-32 relative rounded-xl border border-gray-100 overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100">
            <Image
              src={getDomainIcon(dataset.domain)}
              alt={`${dataset.domain || 'dataset'} icon`}
              fill
              sizes="128px"
              className="object-contain p-3"
            />
          </div>
          
          <div className="flex-1">
            <h1 className="text-4xl font-bold text-gray-900">{dataset.name}</h1>
            {dataset.full_name && dataset.full_name !== dataset.name && (
              <p className="text-xl text-gray-600 mt-2">{dataset.full_name}</p>
            )}
            
            <div className="flex flex-wrap gap-2 mt-4">
              {dataset.domain && (
                <span className="px-3 py-1 text-sm bg-gray-100 text-gray-800 rounded-full">
                  {dataset.domain}
                </span>
              )}
              {dataset.modalities && dataset.modalities.map((modality) => (
                <span key={modality} className="px-3 py-1 text-sm bg-green-50 text-green-700 border border-green-100 rounded-full">
                  {modality}
                </span>
              ))}
              {(dataset.task_ids && dataset.task_ids.length > 0) && (
                <>
                  {visibleTaskIds
                    .map((id) => tasksById[id]?.name)
                    .filter(Boolean)
                    .map((name) => (
                      <span
                        key={name as string}
                        className="px-3 py-1 text-sm bg-blue-50 text-blue-700 border border-blue-100 rounded-full"
                      >
                        {name as string}
                      </span>
                    ))}
                  {!showAllTasks && totalTaskCount > 7 && (
                    <button
                      type="button"
                      onClick={() => setShowAllTasks(true)}
                      className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1 px-1 py-0.5"
                    >
                      Show all tasks <span aria-hidden>»</span>
                    </button>
                  )}
                  {showAllTasks && totalTaskCount > 7 && (
                    <button
                      type="button"
                      onClick={() => setShowAllTasks(false)}
                      className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1 px-1 py-0.5"
                    >
                      <span aria-hidden>«</span> Hide tasks
                    </button>
                  )}
                  {tasksLoading && (
                    <span className="px-3 py-1 text-sm bg-blue-50 text-blue-400 border border-blue-100 rounded-full">
                      Loading tasks…
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {dataset.description && (
          <div className="mt-6 pt-6 border-t border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Description</h2>
            <p className="text-gray-700 leading-relaxed">{dataset.description}</p>
          </div>
        )}

        <div className="mt-6 pt-6 border-t border-gray-100 grid grid-cols-1 md:grid-cols-2 gap-6">
          {dataset.homepage && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Homepage</h3>
              <a 
                href={dataset.homepage} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-green-600 hover:underline break-all"
              >
                {dataset.homepage}
              </a>
            </div>
          )}

          {dataset.introduced_date && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Introduced</h3>
              <p className="text-gray-700">{new Date(dataset.introduced_date).toLocaleDateString()}</p>
            </div>
          )}

          {dataset.languages && dataset.languages.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Languages</h3>
              <p className="text-gray-700">{dataset.languages.join(", ")}</p>
            </div>
          )}

          {dataset.variants && dataset.variants.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Variants</h3>
              <p className="text-gray-700">{dataset.variants.join(", ")}</p>
            </div>
          )}

          {dataset.paper_count !== undefined && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Papers</h3>
              <p className="text-gray-700">
                {dataset.paper_count} {dataset.paper_count === 1 ? 'paper' : 'papers'}
              </p>
            </div>
          )}
        </div>

        {dataset.created_at && (
          <div className="mt-6 pt-6 border-t border-gray-100 text-sm text-gray-400">
            Added {new Date(dataset.created_at).toLocaleDateString()}
          </div>
        )}
      </div>
    </div>
  );
}


