"use client";

import { useState } from "react";
import { useAuth } from "@/lib/authContext";
import { getBackendBaseUrl } from "@/lib/backendUrl";

interface UserProfileData {
  uid: string;
  email: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  affiliation: string | null;
  photo_url: string | null;
  bio: string | null;
  job_title: string | null;
}

interface EditProfileTabProps {
  profileData: UserProfileData;
  onProfileUpdate: () => void;
}

export default function EditProfileTab({ profileData, onProfileUpdate }: EditProfileTabProps) {
  const { user, refreshUserProfile, updateUserProfileOptimistic } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form fields
  const [displayName, setDisplayName] = useState(profileData.display_name || "");
  const [firstName, setFirstName] = useState(profileData.first_name || "");
  const [lastName, setLastName] = useState(profileData.last_name || "");
  const [affiliation, setAffiliation] = useState(profileData.affiliation || "");
  const [bio, setBio] = useState(profileData.bio || "");
  const [jobTitle, setJobTitle] = useState(profileData.job_title || "");
  const [photoUrl, setPhotoUrl] = useState(profileData.photo_url || "");

  const handleUpdateProfile = async () => {
    if (!user || !profileData) return;

    // Save current state for potential revert
    const previousProfileData = { ...profileData };
    const previousDisplayName = displayName;
    const previousFirstName = firstName;
    const previousLastName = lastName;
    const previousAffiliation = affiliation;
    const previousBio = bio;
    const previousJobTitle = jobTitle;
    const previousPhotoUrl = photoUrl;

    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const token = await user.getIdToken();
      if (!token) {
        setError("Not authenticated");
        return;
      }

      // Update profile fields
      const updateData: any = {};
      if (displayName !== (profileData?.display_name || "")) {
        updateData.display_name = displayName || null;
      }
      if (firstName !== (profileData?.first_name || "")) {
        updateData.first_name = firstName || null;
      }
      if (lastName !== (profileData?.last_name || "")) {
        updateData.last_name = lastName || null;
      }
      if (affiliation !== (profileData?.affiliation || "")) {
        updateData.affiliation = affiliation || null;
      }
      if (bio !== (profileData?.bio || "")) {
        updateData.bio = bio || null;
      }
      if (jobTitle !== (profileData?.job_title || "")) {
        updateData.job_title = jobTitle || null;
      }
      if (photoUrl !== (profileData?.photo_url || "")) {
        updateData.photo_url = photoUrl || null;
      }

      // OPTIMISTIC UPDATE: Update UI immediately before server response
      if (Object.keys(updateData).length > 0) {
        const optimisticProfile: UserProfileData = {
          ...profileData,
          ...updateData,
        };

        // Update auth context state and cache optimistically (immediate UI update)
        const optimisticUserProfile = {
          uid: optimisticProfile.uid,
          email: optimisticProfile.email,
          display_name: optimisticProfile.display_name,
          first_name: optimisticProfile.first_name,
          last_name: optimisticProfile.last_name,
          affiliation: optimisticProfile.affiliation,
          photo_url: optimisticProfile.photo_url,
          bio: optimisticProfile.bio,
          job_title: optimisticProfile.job_title,
        };

        updateUserProfileOptimistic(optimisticUserProfile);
      }

      // Send PATCH request to server
      if (Object.keys(updateData).length > 0) {
        const response = await fetch(`${getBackendBaseUrl()}/users/me`, {
          method: "PATCH",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(updateData),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ detail: "Failed to update profile" }));
          throw new Error(errorData.detail || "Failed to update profile");
        }

        // Server confirmed - update with server response and refresh cache
        const updatedProfile = await response.json();

        // Update auth context cache with server response
        const serverUserProfile = {
          uid: updatedProfile.uid,
          email: updatedProfile.email,
          display_name: updatedProfile.display_name,
          first_name: updatedProfile.first_name,
          last_name: updatedProfile.last_name,
          affiliation: updatedProfile.affiliation,
          photo_url: updatedProfile.photo_url,
          bio: updatedProfile.bio,
          job_title: updatedProfile.job_title,
        };

        // Update auth context state
        await refreshUserProfile();
        onProfileUpdate();
        setSuccess("Profile updated successfully!");
      } else {
        setSuccess("No changes to save");
      }
    } catch (err: any) {
      console.error("Error updating profile:", err);

      // REVERT: Restore previous state on error
      setDisplayName(previousDisplayName);
      setFirstName(previousFirstName);
      setLastName(previousLastName);
      setAffiliation(previousAffiliation);
      setBio(previousBio);
      setJobTitle(previousJobTitle);
      setPhotoUrl(previousPhotoUrl);

      // Revert auth context state and cache
      const previousUserProfile = {
        uid: previousProfileData.uid,
        email: previousProfileData.email,
        display_name: previousProfileData.display_name,
        first_name: previousProfileData.first_name,
        last_name: previousProfileData.last_name,
        affiliation: previousProfileData.affiliation,
        photo_url: previousProfileData.photo_url,
        bio: previousProfileData.bio,
        job_title: previousProfileData.job_title,
      };
      updateUserProfileOptimistic(previousUserProfile);

      setError(err.message || "Update failed. Changes have been reverted.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-semibold text-gray-900 mb-6">Profile Information</h2>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700">
          {success}
        </div>
      )}

      <div className="space-y-6">
        {/* Email (Read-only) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Email
          </label>
          <input
            type="email"
            value={profileData.email}
            disabled
            className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed"
          />
          <p className="mt-1 text-xs text-gray-500">Email cannot be changed</p>
        </div>

        {/* Display Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Display Name
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            placeholder="Enter display name"
          />
        </div>

        {/* First Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            First Name
          </label>
          <input
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            placeholder="Enter first name"
          />
        </div>

        {/* Last Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Last Name
          </label>
          <input
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            placeholder="Enter last name"
          />
        </div>

        {/* Job Title */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Job Title
          </label>
          <input
            type="text"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            placeholder="Enter job title"
          />
        </div>

        {/* Affiliation */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Affiliation
          </label>
          <input
            type="text"
            value={affiliation}
            onChange={(e) => setAffiliation(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            placeholder="Enter affiliation (e.g., University, Company)"
          />
        </div>

        {/* Bio */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Bio
          </label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={4}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            placeholder="Tell us about yourself"
          />
        </div>

        {/* Profile Photo (Coming Soon) */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 opacity-75">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">
              Profile Photo
            </label>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-200 text-black border border-yellow-300">
              Coming Soon
            </span>
          </div>
          <div className="mt-1 flex items-center justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md">
            <div className="space-y-1 text-center">
              <svg
                className="mx-auto h-12 w-12 text-gray-400"
                stroke="currentColor"
                fill="none"
                viewBox="0 0 48 48"
                aria-hidden="true"
              >
                <path
                  d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <div className="flex text-sm text-gray-600">
                <span className="relative cursor-not-allowed bg-white rounded-md font-medium text-gray-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-green-500">
                  Upload a file
                </span>
                <p className="pl-1">or drag and drop</p>
              </div>
              <p className="text-xs text-gray-500">PNG, JPG, GIF up to 10MB</p>
            </div>
          </div>
        </div>
      </div>

      {/* Update Button */}
      <div className="mt-8 pt-6 border-t border-gray-200 flex justify-center">
        <button
          onClick={handleUpdateProfile}
          disabled={saving}
          className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? "Updating..." : "Update Profile"}
        </button>
      </div>
    </div>
  );
}
