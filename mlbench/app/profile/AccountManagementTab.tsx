"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/lib/authContext";
import { getBackendBaseUrl } from "@/lib/backendUrl";

const CONFIRM_PHRASE = "DELETE";

export default function AccountManagementTab() {
  const router = useRouter();
  const { user } = useAuth();

  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmInput, setConfirmInput] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canConfirm = confirmInput === CONFIRM_PHRASE;

  const handleOpenConfirm = () => {
    setConfirmInput("");
    setError(null);
    setShowConfirm(true);
  };

  const handleCancel = () => {
    setShowConfirm(false);
    setConfirmInput("");
    setError(null);
  };

  const handleDeleteAccount = async () => {
    if (!canConfirm || !user) return;

    setDeleting(true);
    setError(null);

    try {
      const token = await user.getIdToken();
      const res = await fetch(`${getBackendBaseUrl()}/users/me`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail || "Account deletion failed. Please try again.");
      }

      // Backend deleted Firestore data + Firebase Auth record.
      // Sign out on the client to clear the local session.
      await signOut(auth);
      router.push("/");
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
      setDeleting(false);
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-semibold text-gray-900 mb-6">Account Management</h2>

      {/* Email Preferences — coming soon */}
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

      {/* Danger Zone */}
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
              onClick={handleOpenConfirm}
              className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
            >
              Delete My Account
            </button>
          ) : (
            <div className="space-y-4">
              <p className="text-sm font-medium text-red-900">
                To confirm, type <span className="font-mono font-bold">{CONFIRM_PHRASE}</span> in the box below:
              </p>

              <input
                type="text"
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value.toUpperCase())}
                placeholder={CONFIRM_PHRASE}
                disabled={deleting}
                className="w-full max-w-xs px-3 py-2 border-2 border-red-300 rounded-lg text-sm font-mono focus:outline-none focus:border-red-500 disabled:opacity-50"
              />

              {error && (
                <p className="text-sm text-red-700 bg-red-100 border border-red-200 rounded-lg px-3 py-2">
                  {error}
                </p>
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
                  ) : (
                    "Yes, permanently delete my account"
                  )}
                </button>
                <button
                  onClick={handleCancel}
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
