"use client";

/**
 * Minimal toast system — no external dependency.
 *
 * Usage:
 *   import { toast } from "@/lib/toast";
 *   toast.info("Hello");
 *   toast.error("Something failed");
 *   toast.warn("Page is stale — please refresh.");
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type ToastKind = "info" | "success" | "warn" | "error";

interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
  action?: { label: string; onClick: () => void };
}

interface ToastContextValue {
  add: (message: string, kind: ToastKind, action?: ToastItem["action"]) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let _globalAdd: ToastContextValue["add"] | null = null;

// Imperative API — works outside React components.
export const toast = {
  info: (msg: string, action?: ToastItem["action"]) => _globalAdd?.(msg, "info", action),
  success: (msg: string, action?: ToastItem["action"]) => _globalAdd?.(msg, "success", action),
  warn: (msg: string, action?: ToastItem["action"]) => _globalAdd?.(msg, "warn", action),
  error: (msg: string, action?: ToastItem["action"]) => _globalAdd?.(msg, "error", action),
};

const KIND_STYLES: Record<ToastKind, string> = {
  info: "bg-gray-800 text-white",
  success: "bg-green-600 text-white",
  warn: "bg-amber-500 text-white",
  error: "bg-red-600 text-white",
};

let _nextId = 0;
const DURATION_MS = 6000;

function ToastItem({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(item.id), DURATION_MS);
    return () => clearTimeout(t);
  }, [item.id, onDismiss]);

  return (
    <div
      role="alert"
      className={`flex items-start gap-3 min-w-[260px] max-w-sm px-4 py-3 rounded-lg shadow-lg text-sm ${KIND_STYLES[item.kind]}`}
    >
      <span className="flex-1">{item.message}</span>
      {item.action && (
        <button
          onClick={() => { item.action!.onClick(); onDismiss(item.id); }}
          className="underline font-semibold whitespace-nowrap opacity-90 hover:opacity-100"
        >
          {item.action.label}
        </button>
      )}
      <button onClick={() => onDismiss(item.id)} aria-label="Dismiss" className="opacity-70 hover:opacity-100 text-lg leading-none">
        ×
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const [mounted, setMounted] = useState(false);

  const add = useCallback<ToastContextValue["add"]>((message, kind, action) => {
    const id = ++_nextId;
    setItems((prev) => [...prev, { id, message, kind, action }]);
  }, []);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Register global imperative handle.
  useEffect(() => {
    _globalAdd = add;
    setMounted(true);
    return () => { _globalAdd = null; };
  }, [add]);

  return (
    <ToastContext.Provider value={{ add }}>
      {children}
      {mounted && createPortal(
        <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
          {items.map((item) => (
            <div key={item.id} className="pointer-events-auto">
              <ToastItem item={item} onDismiss={dismiss} />
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
