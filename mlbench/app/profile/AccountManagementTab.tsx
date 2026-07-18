"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/lib/authContext";
import { getBackendBaseUrl } from "@/lib/backendUrl";

const CONFIRM_PHRASE = "DELETE";

const EXPIRY_OPTIONS = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "365 days", days: 365 },
  { label: "No expiration", days: null },
];

interface ApiKeyMeta {
  key_prefix: string;
  tier: "free" | "premium";
  status: "active" | "revoked";
  created_at: string;
  expires_at: string | null;
}

function obfuscate(prefix: string): string {
  return prefix.slice(0, 4) + "••••••••••••••••••••••••" + prefix.slice(-4);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric", month: "short", day: "numeric",
  });
}

export default function AccountManagementTab() {
  const router = useRouter();
  const { user } = useAuth();

  // ── Delete account ────────────────────────────────────────────────────────
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmInput, setConfirmInput] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const canConfirm = confirmInput === CONFIRM_PHRASE;

  // ── API Key ────────────────────────────────────────────────────────────────
  const [keyMeta, setKeyMeta] = useState<ApiKeyMeta | null>(null);
  const [keyLoading, setKeyLoading] = useState(true);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [selectedExpiry, setSelectedExpiry] = useState<number | null>(null);
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [newToken, setNewToken] = useState("");
  const [copied, setCopied] = useState(false);
  const [showDeleteKeyConfirm, setShowDeleteKeyConfirm] = useState(false);

  // Derived
  const isExpired = keyMeta?.expires_at
    ? new Date(keyMeta.expires_at) < new Date()
    : false;
  const isRevoked = keyMeta?.status === "revoked";
  const keyInactive = isExpired || isRevoked;

  // ── Fetch existing key on mount ───────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    (async () => {
      setKeyLoading(true);
      try {
        const token = await user.getIdToken();
        const res = await fetch(`${getBackendBaseUrl()}/users/me/apikey`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 404) { setKeyMeta(null); return; }
        if (!res.ok) throw new Error("Failed to load API key");
        setKeyMeta(await res.json());
      } catch {
        setKeyMeta(null);
      } finally {
        setKeyLoading(false);
      }
    })();
  }, [user]);

  // ── Generate key ─────────────────────────────────────────────────────────
  const handleGenerateKey = async () => {
    if (!user || keyMeta) return;
    const isDisabled = true;
    if (isDisabled) return;
    setGenerating(true);
    setKeyError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`${getBackendBaseUrl()}/users/me/apikey`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ expires_in_days: selectedExpiry }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail || "Failed to generate API key");
      }
      const data = await res.json();
      setKeyMeta({
        key_prefix: data.key_prefix,
        tier: data.tier,
        status: data.status,
        created_at: data.created_at,
        expires_at: data.expires_at,
      });
      setNewToken(data.token);
      setCopied(false);
      setShowTokenModal(true);
    } catch (err: any) {
      setKeyError(err.message || "Something went wrong");
    } finally {
      setGenerating(false);
    }
  };

  // ── Delete / remove key ───────────────────────────────────────────────────
  const handleDeleteKey = async () => {
    if (!user) return;
    setRemoving(true);
    setKeyError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`${getBackendBaseUrl()}/users/me/apikey`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail || "Failed to remove API key");
      }
      setKeyMeta(null);
      setShowDeleteKeyConfirm(false);
    } catch (err: any) {
      setKeyError(err.message || "Something went wrong");
    } finally {
      setRemoving(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(newToken).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleCloseModal = () => { setShowTokenModal(false); setNewToken(""); };

  // ── Delete account ────────────────────────────────────────────────────────
  const handleDeleteAccount = async () => {
    if (!canConfirm || !user) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`${getBackendBaseUrl()}/users/me`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail || "Account deletion failed.");
      }
      await signOut(auth);
      router.push("/");
    } catch (err: any) {
      setDeleteError(err.message || "Something went wrong.");
      setDeleting(false);
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-semibold text-gray-900 mb-6">Account Management</h2>

      {/* ── Email Preferences (coming soon) ─────────────────────────────── */}
      <div className="mb-8 opacity-75">
        <div className="flex items-center gap-3 mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Email Preferences</h3>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-200 text-black border border-yellow-300">
            Coming Soon
          </span>
        </div>
        <div className="bg-gray-50 rounded-lg p-6 space-y-4 pointer-events-none grayscale-[50%]">
          {[
            { label: "Email Notifications", desc: "Receive email notifications about your account activity" },
            { label: "Weekly Digest", desc: "Receive a weekly summary of new papers and updates" },
            { label: "Paper Updates", desc: "Get notified when papers you've bookmarked are updated" },
          ].map(({ label, desc }) => (
            <div key={label} className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700">{label}</p>
                <p className="text-xs text-gray-500 mt-1">{desc}</p>
              </div>
              <div className="w-11 h-6 bg-gray-200 rounded-full opacity-60" />
            </div>
          ))}
          <div className="pt-4 border-t border-gray-200">
            <button disabled className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg opacity-50 cursor-not-allowed">
              Save Email Preferences
            </button>
          </div>
        </div>
      </div>

      {/* ── API Key ──────────────────────────────────────────────────────── */}
      <div className="mb-8 border-t border-gray-200 pt-8">
        <div className="flex items-center gap-3 mb-1">
          <h3 className="text-lg font-semibold text-gray-900">API Key</h3>
          {/* <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700 border border-purple-200">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.347.347a3.75 3.75 0 01-5.303 0l-.347-.347z" />
            </svg>
            Experimental
          </span> */}
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-200 text-black border border-yellow-300">
            Coming Soon
          </span>
        </div>
        <p className="text-sm text-gray-500 mb-5">
          Generate a personal API key to access MLBench programmatically. Store it securely — it will
          only be shown once. You can have at most one active key at a time.
        </p>

        {keyError && (
          <p className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{keyError}</p>
        )}

        {keyLoading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Loading…
          </div>
        ) : !keyMeta ? (
          /* ── No key: generator ── */
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 space-y-5 pointer-events-none grayscale-[50%] opacity-75">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Token expiration</label>
              <div className="flex flex-wrap gap-2">
                {EXPIRY_OPTIONS.map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    disabled={true}
                    onClick={() => setSelectedExpiry(opt.days)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors cursor-not-allowed ${
                      selectedExpiry === opt.days
                        ? "bg-purple-600 text-white border-purple-600"
                        : "bg-white text-gray-600 border-gray-300 hover:border-purple-400 hover:text-purple-600"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {selectedExpiry !== null && (
                <p className="text-xs text-gray-500 mt-2">
                  Key will expire on{" "}
                  <span className="font-medium">
                    {new Date(Date.now() + selectedExpiry * 86400000).toLocaleDateString(undefined, {
                      year: "numeric", month: "short", day: "numeric",
                    })}
                  </span>
                </p>
              )}
            </div>
            <button
              onClick={handleGenerateKey}
              disabled={true}
              className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {generating ? (
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              )}
              {generating ? "Generating…" : "Generate API Key"}
            </button>
          </div>
        ) : (
          /* ── Key exists ── */
          <div className={`border rounded-xl p-6 space-y-4 ${
            keyInactive ? "bg-gray-50 border-gray-200" : "bg-green-50 border-green-200"
          }`}>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <svg className={`w-4 h-4 ${keyInactive ? "text-gray-400" : "text-gray-500"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                  <span className={`font-mono text-sm tracking-wide ${keyInactive ? "text-gray-400" : "text-gray-700"}`}>
                    {obfuscate(keyMeta.key_prefix.padEnd(32, "x"))}
                  </span>
                  {isExpired && (
                    <span className="text-xs font-medium text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full border border-gray-300">
                      Expired
                    </span>
                  )}
                  {isRevoked && !isExpired && (
                    <span className="text-xs font-medium text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full border border-gray-300">
                      Revoked
                    </span>
                  )}
                  <span className="text-xs font-medium text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full border border-purple-200 capitalize">
                    {keyMeta.tier}
                  </span>
                </div>
                <p className="text-xs text-gray-500">
                  Created: <span className="font-medium">{formatDate(keyMeta.created_at)}</span>
                </p>
                {keyMeta.expires_at ? (
                  <p className="text-xs text-gray-500">
                    {isExpired ? "Expired" : "Expires"}:{" "}
                    <span className={`font-medium ${isExpired ? "text-gray-500" : ""}`}>
                      {formatDate(keyMeta.expires_at)}
                    </span>
                  </p>
                ) : (
                  <p className="text-xs text-gray-500">Expiration: <span className="font-medium">Never</span></p>
                )}
              </div>

              {/* Action button */}
              {keyInactive ? (
                /* Expired/revoked: one-click remove, no confirm */
                <button
                  onClick={handleDeleteKey}
                  disabled={removing}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  {removing ? (
                    <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  )}
                  {removing ? "Removing…" : "Remove old key"}
                </button>
              ) : (
                /* Active: show revoke with confirm */
                <button
                  onClick={() => setShowDeleteKeyConfirm(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Revoke
                </button>
              )}
            </div>

            {showDeleteKeyConfirm && (
              <div className="bg-white border border-red-200 rounded-lg p-4 space-y-3">
                <p className="text-sm font-medium text-red-800">
                  Are you sure? Any integrations using this key will stop working immediately.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleDeleteKey}
                    disabled={removing}
                    className="px-3 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                  >
                    {removing ? "Revoking…" : "Yes, revoke key"}
                  </button>
                  <button
                    onClick={() => setShowDeleteKeyConfirm(false)}
                    className="px-3 py-1.5 bg-white text-gray-700 text-xs font-medium rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Token reveal modal ────────────────────────────────────────────── */}
      {showTokenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleCloseModal} />
          <div className="relative z-10 bg-white rounded-2xl shadow-2xl max-w-lg w-full p-8 space-y-6">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Your API Key</h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  Copy and store this key safely. It will <strong>not</strong> be shown again.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
              <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <p className="text-xs text-amber-800 font-medium">Treat it like a password — it cannot be recovered.</p>
            </div>
            <div className="bg-gray-900 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
              <code className="text-green-400 font-mono text-sm break-all select-all">{newToken}</code>
              <button
                onClick={handleCopy}
                className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  copied ? "bg-green-500 text-white" : "bg-gray-700 text-gray-200 hover:bg-gray-600"
                }`}
              >
                {copied ? (
                  <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>Copied!</>
                ) : (
                  <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>Copy</>
                )}
              </button>
            </div>
            <button
              onClick={handleCloseModal}
              className="w-full px-4 py-2.5 bg-purple-600 text-white text-sm font-semibold rounded-xl hover:bg-purple-700 transition-colors"
            >
              I've saved my key — close
            </button>
          </div>
        </div>
      )}

      {/* ── Danger Zone ──────────────────────────────────────────────────── */}
      <div className="border-t border-gray-200 pt-8">
        <h3 className="text-lg font-semibold text-red-600 mb-4">Danger Zone</h3>
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h4 className="text-sm font-semibold text-red-900 mb-2">Delete Account</h4>
          <p className="text-sm text-red-700 mb-4">
            Once you delete your account, there is no going back. This will permanently remove your
            profile, all bookmarks, and revoke your login credentials.
          </p>
          {!showConfirm ? (
            <button
              onClick={() => { setConfirmInput(""); setDeleteError(null); setShowConfirm(true); }}
              className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
            >
              Delete My Account
            </button>
          ) : (
            <div className="space-y-4">
              <p className="text-sm font-medium text-red-900">
                To confirm, type <span className="font-mono font-bold">{CONFIRM_PHRASE}</span> below:
              </p>
              <input
                type="text"
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value.toUpperCase())}
                placeholder={CONFIRM_PHRASE}
                disabled={deleting}
                className="w-full max-w-xs px-3 py-2 border-2 border-red-300 rounded-lg text-sm font-mono focus:outline-none focus:border-red-500 disabled:opacity-50"
              />
              {deleteError && (
                <p className="text-sm text-red-700 bg-red-100 border border-red-200 rounded-lg px-3 py-2">{deleteError}</p>
              )}
              <div className="flex gap-3">
                <button
                  onClick={handleDeleteAccount}
                  disabled={!canConfirm || deleting}
                  className="px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {deleting ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      Deleting…
                    </span>
                  ) : "Yes, permanently delete my account"}
                </button>
                <button
                  onClick={() => { setShowConfirm(false); setConfirmInput(""); setDeleteError(null); }}
                  disabled={deleting}
                  className="px-4 py-2 bg-white text-gray-700 text-sm font-medium rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
