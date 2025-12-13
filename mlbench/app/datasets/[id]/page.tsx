"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { config } from "@/lib/config";

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

  useEffect(() => {
    const fetchDataset = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${config.backendUrl}/datasets/${datasetId}`);
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
                <span className="px-3 py-1 text-sm bg-green-100 text-green-800 rounded-full">
                  {dataset.domain}
                </span>
              )}
              {dataset.modalities && dataset.modalities.map((modality) => (
                <span key={modality} className="px-3 py-1 text-sm bg-blue-100 text-blue-800 rounded-full">
                  {modality}
                </span>
              ))}
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

