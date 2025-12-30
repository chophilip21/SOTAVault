"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { config } from "@/lib/config";
import { getBackendBaseUrl } from "@/lib/backendUrl";

interface UserProfile {
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

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  logout: () => Promise<void>;
  refreshUserProfile: () => Promise<void>;
  updateUserProfileOptimistic: (profile: UserProfile) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const USER_PROFILE_CACHE_KEY = "mlbench_user_profile";
const USER_PROFILE_CACHE_TIMESTAMP_KEY = "mlbench_user_profile_timestamp";
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Load cached user profile
  const loadCachedProfile = (uid: string): UserProfile | null => {
    if (typeof window === "undefined") return null;

    try {
      const cached = localStorage.getItem(USER_PROFILE_CACHE_KEY);
      const timestamp = localStorage.getItem(USER_PROFILE_CACHE_TIMESTAMP_KEY);
      
      if (cached && timestamp) {
        const cacheTime = parseInt(timestamp, 10);
        const now = Date.now();
        
        // Check if cache is still valid and matches current user
        if (now - cacheTime < CACHE_DURATION) {
          const profile = JSON.parse(cached);
          if (profile.uid === uid) {
            return profile;
          }
        }
      }
    } catch (error) {
      console.error("Failed to load cached user profile:", error);
    }
    
    return null;
  };

  // Save user profile to cache
  const saveCachedProfile = (profile: UserProfile) => {
    if (typeof window === "undefined") return;

    try {
      localStorage.setItem(USER_PROFILE_CACHE_KEY, JSON.stringify(profile));
      localStorage.setItem(USER_PROFILE_CACHE_TIMESTAMP_KEY, Date.now().toString());
    } catch (error) {
      console.error("Failed to save cached user profile:", error);
    }
  };

  // Clear cached user profile
  const clearCachedProfile = () => {
    if (typeof window === "undefined") return;

    try {
      localStorage.removeItem(USER_PROFILE_CACHE_KEY);
      localStorage.removeItem(USER_PROFILE_CACHE_TIMESTAMP_KEY);
    } catch (error) {
      console.error("Failed to clear cached user profile:", error);
    }
  };

  // Fetch user profile from backend
  const fetchUserProfile = async (uid: string, email: string): Promise<UserProfile | null> => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return null;

      const response = await fetch(`${getBackendBaseUrl()}/users/me`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        const profile = await response.json();
        const userProfile: UserProfile = {
          uid: profile.uid,
          email: profile.email,
          display_name: profile.display_name,
          first_name: profile.first_name,
          last_name: profile.last_name,
          affiliation: profile.affiliation,
          photo_url: profile.photo_url,
          bio: profile.bio,
          job_title: profile.job_title,
        };
        saveCachedProfile(userProfile);
        return userProfile;
      } else {
        // If profile doesn't exist, create a minimal one from auth data
        const minimalProfile: UserProfile = {
          uid,
          email,
          display_name: null,
          first_name: null,
          last_name: null,
          affiliation: null,
          photo_url: null,
          bio: null,
          job_title: null,
        };
        saveCachedProfile(minimalProfile);
        return minimalProfile;
      }
    } catch (error) {
      console.error("Failed to fetch user profile:", error);
      // Return minimal profile on error
      const minimalProfile: UserProfile = {
        uid,
        email,
        display_name: null,
        first_name: null,
        last_name: null,
        affiliation: null,
        photo_url: null,
        bio: null,
        job_title: null,
      };
      return minimalProfile;
    }
  };

  // Refresh user profile (bypasses cache)
  const refreshUserProfile = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setUserProfile(null);
      return;
    }

    const profile = await fetchUserProfile(currentUser.uid, currentUser.email || "");
    if (profile) {
      setUserProfile(profile);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      
      if (firebaseUser) {
        // Check cache first
        const cachedProfile = loadCachedProfile(firebaseUser.uid);
        
        if (cachedProfile) {
          setUserProfile(cachedProfile);
          setLoading(false);
          
          // Only refresh in background if cache is older than 5 seconds
          const cacheTimestamp = localStorage.getItem(USER_PROFILE_CACHE_TIMESTAMP_KEY);
          const cacheAge = cacheTimestamp ? Date.now() - parseInt(cacheTimestamp, 10) : Infinity;
          
          if (cacheAge > 5000) { // 5 seconds
            fetchUserProfile(firebaseUser.uid, firebaseUser.email || "").then((profile) => {
              if (profile) {
                setUserProfile(profile);
              }
            });
          }
        } else {
          // Fetch from backend if not cached
          const profile = await fetchUserProfile(firebaseUser.uid, firebaseUser.email || "");
          setUserProfile(profile);
          setLoading(false);
        }
      } else {
        setUserProfile(null);
        clearCachedProfile();
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const logout = async () => {
    try {
      clearCachedProfile();
      await signOut(auth);
      // State will be updated by onAuthStateChanged listener
    } catch (error) {
      console.error("Logout error:", error);
      // Clear cache even if signOut fails
      clearCachedProfile();
      setUser(null);
      setUserProfile(null);
      throw error;
    }
  };

  // Update user profile optimistically (for optimistic UI updates)
  const updateUserProfileOptimistic = (profile: UserProfile) => {
    setUserProfile(profile);
    saveCachedProfile(profile);
  };

  return (
    <AuthContext.Provider value={{ user, userProfile, loading, logout, refreshUserProfile, updateUserProfileOptimistic }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
