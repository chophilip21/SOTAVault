"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { useAuth } from "@/lib/authContext";
import { useRouter } from "next/navigation";
import { config } from "@/lib/config";
import EditProfileTab from "./EditProfileTab";
import BookmarksTab from "./BookmarksTab";
import AccountManagementTab from "./AccountManagementTab";

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

type TabType = "edit" | "bookmarks" | "account";

export default function ProfilePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [profileData, setProfileData] = useState<UserProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>("edit");

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/");
      return;
    }

    if (user && !authLoading) {
      fetchProfile();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const token = await user?.getIdToken();
      if (!token) {
        return;
      }

      const response = await fetch(`${config.backendUrl}/users/me`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        const data = await response.json();
        setProfileData(data);
      }
    } catch (err) {
      console.error("Error fetching profile:", err);
    } finally {
      setLoading(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!user || !profileData) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">Please log in to view your profile</div>
      </div>
    );
  }

  const displayName = profileData.display_name || 
    (profileData.first_name && profileData.last_name 
      ? `${profileData.first_name} ${profileData.last_name}` 
      : profileData.first_name || profileData.last_name || "User");
  const photoUrl = profileData.photo_url || "/Gemini_Generated_Image_hojkkjhojkkjhojk.png";

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header Section with Profile Picture */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
          <div className="px-6 py-8">
            <div className="flex flex-col items-center">
              {/* Circle Cropped Photo */}
              <div className="relative w-32 h-32 rounded-full overflow-hidden border-4 border-white shadow-lg mb-4">
                <Image
                  src={photoUrl}
                  alt="Profile"
                  width={128}
                  height={128}
                  className="object-cover w-full h-full"
                />
              </div>
              
              {/* Name */}
              <h1 className="text-3xl font-bold text-gray-900 mb-2" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif' }}>
                {displayName}
              </h1>
              
              {/* Job Title */}
              {profileData.job_title && (
                <p 
                  className="text-lg text-gray-600 mb-1" 
                  style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif' }}
                >
                  {profileData.job_title.charAt(0).toUpperCase() + profileData.job_title.slice(1).toLowerCase()}
                </p>
              )}
              
              {/* Affiliation */}
              {profileData.affiliation && (
                <p 
                  className="text-gray-500 mb-4"
                  style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif' }}
                >
                  {profileData.affiliation}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
          <div className="border-b border-gray-200 overflow-x-auto">
            <nav className="flex justify-center -mb-px min-w-max">
              <button
                onClick={() => setActiveTab("edit")}
                className={`px-4 sm:px-6 py-4 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                  activeTab === "edit"
                    ? "border-green-600 text-green-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                Edit Profile
              </button>
              <button
                onClick={() => setActiveTab("bookmarks")}
                className={`px-4 sm:px-6 py-4 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                  activeTab === "bookmarks"
                    ? "border-green-600 text-green-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                Bookmarks
              </button>
              <button
                onClick={() => setActiveTab("account")}
                className={`px-4 sm:px-6 py-4 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                  activeTab === "account"
                    ? "border-green-600 text-green-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                Account Management
              </button>
            </nav>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {activeTab === "edit" && (
              <EditProfileTab 
                profileData={profileData} 
                onProfileUpdate={fetchProfile}
              />
            )}
            {activeTab === "bookmarks" && <BookmarksTab />}
            {activeTab === "account" && <AccountManagementTab />}
          </div>
        </div>
      </div>
    </div>
  );
}
