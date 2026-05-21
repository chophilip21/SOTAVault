"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cleanEmbeddingText } from "@/lib/embedding/cleanEmbeddingText";

type WorkerRequest =
  | { type: "embed"; id: number; text: string }
  | { type: "ping" }
  | { type: "check-cache" }
  | { type: "preload" };

type WorkerResponse =
  | { type: "ready" }
  | { type: "cached"; isCached: boolean }
  | { type: "preload-done" }
  | { type: "success"; id: number; embedding: number[] }
  | { type: "error"; id?: number; error: string };

export function useEmbeddingWorker() {
  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef(
    new Map<number, { resolve: (v: number[]) => void; reject: (e: Error) => void }>(),
  );
  const nextIdRef = useRef(1);

  const [workerReady, setWorkerReady] = useState(false);
  /** Whether the model files are confirmed present in the browser Cache API. */
  const [modelCached, setModelCached] = useState<boolean | null>(null); // null = checking
  /** True while the model is being downloaded/preloaded. */
  const [downloading, setDownloading] = useState(false);
  const [modelLoading, setModelLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const worker = new Worker(new URL("./embedding.worker.ts", import.meta.url));
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data;

      if (msg.type === "ready") {
        setWorkerReady(true);
        setError(null);
        // Ask worker to check cache immediately after it starts
        worker.postMessage({ type: "check-cache" } satisfies WorkerRequest);
        return;
      }

      if (msg.type === "cached") {
        setModelCached(msg.isCached);
        return;
      }

      if (msg.type === "preload-done") {
        setDownloading(false);
        setModelCached(true);
        return;
      }

      if (msg.type === "error") {
        if (msg.id != null) {
          const pending = pendingRef.current.get(msg.id);
          pendingRef.current.delete(msg.id);
          pending?.reject(new Error(msg.error));
        } else {
          setError(msg.error);
          setDownloading(false);
        }
        setModelLoading(false);
        return;
      }

      if (msg.type === "success") {
        const pending = pendingRef.current.get(msg.id);
        pendingRef.current.delete(msg.id);
        setModelLoading(false);
        setError(null);
        pending?.resolve(msg.embedding);
      }
    };

    worker.onerror = () => {
      setError("Embedding worker failed to start.");
      setModelLoading(false);
      setDownloading(false);
    };

    worker.postMessage({ type: "ping" } satisfies WorkerRequest);

    return () => {
      worker.terminate();
      workerRef.current = null;
      pendingRef.current.clear();
    };
  }, []);

  /** Trigger a model preload (download + cache). Only call if !modelCached. */
  const downloadModel = useCallback(() => {
    const worker = workerRef.current;
    if (!worker || !workerReady) return;
    setDownloading(true);
    setError(null);
    worker.postMessage({ type: "preload" } satisfies WorkerRequest);
  }, [workerReady]);

  const embed = useCallback(async (rawText: string): Promise<number[]> => {
    const text = cleanEmbeddingText(rawText);
    if (!text) throw new Error("Enter a search query.");
    const worker = workerRef.current;
    if (!worker) throw new Error("Embedding worker is not available.");

    const id = nextIdRef.current++;
    setModelLoading(true);
    setError(null);

    return new Promise<number[]>((resolve, reject) => {
      pendingRef.current.set(id, { resolve, reject });
      worker.postMessage({ type: "embed", id, text } satisfies WorkerRequest);
    });
  }, []);

  return {
    embed,
    workerReady,
    /** null = still checking; false = not cached; true = model is in cache */
    modelCached,
    downloading,
    modelLoading,
    error,
    downloadModel,
  };
}
