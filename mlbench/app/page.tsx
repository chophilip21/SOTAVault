"use client";

import { useEffect, useState, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { Playfair_Display } from "next/font/google";
import dynamic from "next/dynamic";
import { config } from "@/lib/config";
import { getBackendBaseUrl } from "@/lib/backendUrl";
import ProtectedLink from "./components/ProtectedLink";
import { PaperCoverArt } from "./components/PaperCoverArt";
import { DomainBadge } from "./components/DomainBadge";
import AuthModal from "./components/AuthModal";
import { useAuth } from "@/lib/authContext";

const ConferenceMap = dynamic(() => import("./components/ConferenceMap"), { ssr: false });

const playfairDisplay = Playfair_Display({ subsets: ["latin"], weight: ["700"] });

interface Paper {
  id: string;
  title: string;
  abstract?: string;
  authors?: string[];
  venue?: string | null;
  year?: number | null;
  arxiv_id?: string | null;
  bookmark_count?: number;
  created_at?: string;
}

interface PapersResponse {
  items: Paper[];
  limit: number;
  next_cursor?: string | null;
  has_more: boolean;
}

interface Dataset {
  id: string;
  name: string;
  full_name?: string;
  slug: string;
  description?: string;
  domain?: string;
  paper_count?: number;
  created_at?: string;
}

interface DatasetsResponse {
  items: Dataset[];
  limit: number;
  next_cursor?: string | null;
  has_more: boolean;
}

interface VenueTimeline {
  pdf_deadline?: string | null;
}

interface Venue {
  id: string;
  name: string;
  short_name?: string | null;
  acronym?: string | null;
  place?: string | null;
  conference_start_date?: string | null;
  conference_end_date?: string | null;
  timeline?: VenueTimeline[];
  website?: string | null;
  tags?: string[];
}

interface VenuesResponse {
  items: Venue[];
  limit: number;
  next_cursor?: string | null;
  has_more: boolean;
}

interface ConferenceMarker {
  name: string;
  lat: number;
  lng: number;
  venues: Venue[];
  color: string;
}

// Simple geocoding function - maps common city names to coordinates
// For production, you might want to use a proper geocoding service
const geocodeCity = (place: string): [number, number] | null => {
  if (!place) return null;
  
  const normalizedPlace = place.toLowerCase().trim();
  
  // Common conference cities mapping
  const cityMap: Record<string, [number, number]> = {
    // North America
    "new york": [-74.006, 40.7128],
    "san francisco": [-122.4194, 37.7749],
    "los angeles": [-118.2437, 34.0522],
    "chicago": [-87.6298, 41.8781],
    "boston": [-71.0589, 42.3601],
    "seattle": [-122.3321, 47.6062],
    "washington": [-77.0369, 38.9072],
    "atlanta": [-84.3880, 33.7490],
    "austin": [-97.7431, 30.2672],
    "denver": [-104.9903, 39.7392],
    "portland": [-122.6784, 45.5152],
    "san diego": [-117.1611, 32.7157],
    "las vegas": [-115.1398, 36.1699],
    "miami": [-80.1918, 25.7617],
    "vancouver": [-123.1216, 49.2827],
    "toronto": [-79.3832, 43.6532],
    "montreal": [-73.5673, 45.5017],
    "calgary": [-114.0719, 51.0447],
    "mexico city": [-99.1332, 19.4326],
    
    // Europe
    "london": [-0.1276, 51.5074],
    "paris": [2.3522, 48.8566],
    "berlin": [13.4050, 52.5200],
    "munich": [11.5820, 48.1351],
    "vienna": [16.3738, 48.2082],
    "amsterdam": [4.9041, 52.3676],
    "barcelona": [2.1734, 41.3851],
    "madrid": [-3.7038, 40.4168],
    "rome": [12.4964, 41.9028],
    "milan": [9.1900, 45.4642],
    "zurich": [8.5417, 47.3769],
    "geneva": [6.1432, 46.2044],
    "copenhagen": [12.5683, 55.6761],
    "stockholm": [18.0686, 59.3293],
    "oslo": [10.7522, 59.9139],
    "helsinki": [24.9384, 60.1699],
    "dublin": [-6.2603, 53.3498],
    "edinburgh": [-3.1883, 55.9533],
    "brussels": [4.3517, 50.8503],
    "prague": [14.4378, 50.0755],
    "budapest": [19.0402, 47.4979],
    "warsaw": [21.0122, 52.2297],
    "lisbon": [-9.1393, 38.7223],
    "athens": [23.7275, 37.9838],
    "istanbul": [28.9784, 41.0082],
    "glasgow": [-4.2518, 55.8642],
    "manchester": [-2.2426, 53.4808],
    "frankfurt": [8.6821, 50.1109],
    "hamburg": [9.9937, 53.5511],
    "cologne": [6.9603, 50.9375],
    
    // Asia Pacific
    "tokyo": [139.6503, 35.6762],
    "kyoto": [135.7681, 35.0116],
    "osaka": [135.5023, 34.6937],
    "seoul": [126.9780, 37.5665],
    "singapore": [103.8198, 1.3521],
    "hong kong": [114.1694, 22.3193],
    "beijing": [116.4074, 39.9042],
    "shanghai": [121.4737, 31.2304],
    "shenzhen": [114.0579, 22.5431],
    "taipei": [121.5654, 25.0330],
    "bangkok": [100.5018, 13.7563],
    "kuala lumpur": [101.6869, 3.1390],
    "manila": [120.9842, 14.5995],
    "ho chi minh": [106.6297, 10.8231],
    "jakarta": [106.8456, -6.2088],
    "sydney": [151.2093, -33.8688],
    "melbourne": [144.9631, -37.8136],
    "brisbane": [153.0251, -27.4698],
    "auckland": [174.7633, -36.8485],
    "wellington": [174.7762, -41.2865],
    "mumbai": [72.8777, 19.0760],
    "bangalore": [77.5946, 12.9716],
    "delhi": [77.1025, 28.7041],
    "new delhi": [77.1025, 28.7041],
    "hyderabad": [78.4867, 17.3850],
    "pune": [73.8567, 18.5204],
    
    // Middle East & Africa
    "dubai": [55.2708, 25.2048],
    "abu dhabi": [54.3773, 24.4539],
    "tel aviv": [34.7818, 32.0853],
    "doha": [51.5310, 25.2854],
    "riyadh": [46.6753, 24.7136],
    "cairo": [31.2357, 30.0444],
    "cape town": [18.4241, -33.9249],
    "johannesburg": [28.0473, -26.2041],
    "nairobi": [36.8219, -1.2921],
    
    // South America
    "rio de janeiro": [-43.1729, -22.9068],
    "são paulo": [-46.6333, -23.5505],
    "buenos aires": [-58.3816, -34.6037],
    "santiago": [-70.6693, -33.4489],
    "bogotá": [-74.0721, 4.7110],
    "lima": [-77.0428, -12.0464],
    
    // Additional specific variations
    "san jose": [-121.8863, 37.3382],
    "philadelphia": [-75.1652, 39.9526],
    "phoenix": [-112.0740, 33.4484],
    "salt lake city": [-111.8910, 40.7608],
    "minneapolis": [-93.2650, 44.9778],
    "st louis": [-90.1994, 38.6270],
    "fields institute, toronto": [-79.3832, 43.6532],
    "mumbai, india": [72.8777, 19.0760],
  };
  
  // Try exact match first
  if (cityMap[normalizedPlace]) {
    return cityMap[normalizedPlace];
  }
  
  // Try partial matches (e.g., "New York, USA" -> "new york")
  for (const [city, coords] of Object.entries(cityMap)) {
    if (normalizedPlace.includes(city) || city.includes(normalizedPlace)) {
      return coords;
    }
  }
  
  // Try extracting city name from common patterns
  const patterns = [
    /^([^,]+),/i,  // "City, Country"
    /^([^,]+)$/i,  // Just city name
  ];
  
  for (const pattern of patterns) {
    const match = normalizedPlace.match(pattern);
    if (match) {
      const cityName = match[1].trim().toLowerCase();
      if (cityMap[cityName]) {
        return cityMap[cityName];
      }
    }
  }
  
  return null;
};

const toISODate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export default function Home() {
  const [popularPapers, setPopularPapers] = useState<Paper[]>([]);
  const [popularDatasets, setPopularDatasets] = useState<Dataset[]>([]);
  const [upcomingVenues, setUpcomingVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        // Fetch papers (we'll fetch more and sort by bookmark_count)
        const papersUrl = new URL(`${getBackendBaseUrl()}/papers/`);
        papersUrl.searchParams.set("limit", "50"); // Fetch more to get better selection
        
        const papersRes = await fetch(papersUrl.toString());
        if (!papersRes.ok) throw new Error("Failed to load papers");
        const papersData: PapersResponse = await papersRes.json();
        
        // Sort by bookmark_count descending and take top 3
        const sortedPapers = [...(papersData.items || [])]
          .sort((a, b) => (b.bookmark_count || 0) - (a.bookmark_count || 0))
          .slice(0, 3);
        
        setPopularPapers(sortedPapers);

        // Fetch datasets (we'll fetch more and sort by paper_count)
        const datasetsUrl = new URL(`${getBackendBaseUrl()}/datasets/`);
        datasetsUrl.searchParams.set("limit", "50"); // Fetch more to get better selection
        
        const datasetsRes = await fetch(datasetsUrl.toString());
        if (!datasetsRes.ok) throw new Error("Failed to load datasets");
        const datasetsData: DatasetsResponse = await datasetsRes.json();
        
        // Sort by paper_count descending and take ONLY top 3
        const allDatasets = datasetsData.items || [];
        const sortedDatasets = [...allDatasets]
          .sort((a, b) => (b.paper_count || 0) - (a.paper_count || 0))
          .slice(0, 3); // Explicitly limit to 3 datasets
        
        // Ensure we only set exactly 3 datasets
        if (sortedDatasets.length > 3) {
          console.warn('Warning: More than 3 datasets in sortedDatasets');
        }
        setPopularDatasets(sortedDatasets.slice(0, 3));

        // Fetch upcoming conferences
        const venuesUrl = new URL(`${getBackendBaseUrl()}/venues/`);
        venuesUrl.searchParams.set("limit", "500");
        venuesUrl.searchParams.set("min_date", toISODate(new Date())); // Only upcoming conferences
        
        const venuesRes = await fetch(venuesUrl.toString());
        if (!venuesRes.ok) throw new Error("Failed to load venues");
        const venuesData: VenuesResponse = await venuesRes.json();
        
        setUpcomingVenues(venuesData.items || []);
      } catch (err: any) {
        setError(err.message || "Failed to load data");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Get conferences with closest submission deadlines
  const featuredDeadlineConferences = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    
    // Filter venues with upcoming deadlines
    const withDeadlines = upcomingVenues
      .filter(venue => {
        if (!venue.timeline || venue.timeline.length === 0) return false;
        const deadline = venue.timeline[0]?.pdf_deadline;
        return deadline && deadline >= today;
      })
      .map(venue => ({
        ...venue,
        deadline: venue.timeline![0].pdf_deadline!
      }))
      .sort((a, b) => a.deadline.localeCompare(b.deadline))
      .slice(0, 3);
    
    return withDeadlines;
  }, [upcomingVenues]);

  // Group venues by place and geocode them
  const conferenceMarkers = useMemo(() => {
    const placeMap = new Map<string, Venue[]>();
    
    // Group venues by place
    upcomingVenues.forEach((venue) => {
      if (venue.place) {
        const normalizedPlace = venue.place.trim();
        if (!placeMap.has(normalizedPlace)) {
          placeMap.set(normalizedPlace, []);
        }
        placeMap.get(normalizedPlace)!.push(venue);
      }
    });
    
    // Color palette for markers
    const markerColors = [
      "#10B981", // green
      "#3B82F6", // blue
      "#8B5CF6", // purple
      "#F59E0B", // amber
      "#EF4444", // red
      "#EC4899", // pink
      "#06B6D4", // cyan
      "#84CC16", // lime
    ];

    // Create markers with coordinates
    const markers: ConferenceMarker[] = [];
    const missingCities: string[] = [];
    let colorIndex = 0;
    placeMap.forEach((venues, place) => {
      const coords = geocodeCity(place);
      if (coords) {
        markers.push({
          name: place,
          lng: coords[0],
          lat: coords[1],
          venues: venues,
          color: markerColors[colorIndex % markerColors.length],
        });
        colorIndex++;
      } else {
        missingCities.push(place);
      }
    });
    
    // Log missing cities for debugging
    if (missingCities.length > 0) {
      console.log('Missing geocoding for cities:', missingCities);
    }
    
    return markers;
  }, [upcomingVenues]);

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-7xl min-[1600px]:max-w-[1400px] min-[2000px]:max-w-[1700px] px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-gray-500">Loading highlights...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-7xl min-[1600px]:max-w-[1400px] min-[2000px]:max-w-[1700px] px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-red-600 text-sm">{error}</div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl min-[1600px]:max-w-[1400px] min-[2000px]:max-w-[1700px] px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-green-100 to-emerald-100 border border-green-300 rounded-xl p-6 shadow-sm">
        <h1 className={`text-2xl font-bold text-gray-800 mb-2 ${playfairDisplay.className}`}>
          Welcome to MLTree
        </h1>
        <p className="text-gray-700 text-base leading-relaxed">
          Your comprehensive resource for discovering machine learning conferences and research papers. 
          Stay up-to-date with upcoming deadlines, explore venues worldwide, and access a curated collection 
          of impactful research from the ML community.
        </p>
      </div>

      {/* Upcoming Conferences Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className={`text-3xl font-bold text-gray-900 ${playfairDisplay.className}`}>
            Upcoming Conferences
          </h2>
          <ProtectedLink 
            href="/conference" 
            className="text-green-600 hover:text-green-700 text-sm font-medium transition"
            onLoginRequired={() => setIsAuthModalOpen(true)}
          >
            View all →
          </ProtectedLink>
        </div>

        {/* Featured Conferences with Closest Deadlines */}
        {featuredDeadlineConferences.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {featuredDeadlineConferences.map((venue) => {
              const deadline = new Date(venue.deadline);
              const today = new Date();
              const daysUntil = Math.ceil((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
              
              return (
                <div
                  key={venue.id}
                  className="bg-gradient-to-br from-green-50 to-blue-50 border border-green-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 text-base line-clamp-1">
                        {venue.short_name || venue.acronym || venue.name}
                      </h3>
                      {venue.place && (
                        <p className="text-xs text-gray-600 mt-1">
                          📍 {venue.place}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  <div className="mt-3 pt-3 border-t border-green-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">
                          Deadline
                        </p>
                        <p className="text-sm font-semibold text-green-700 mt-0.5">
                          {deadline.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-500">
                          {daysUntil === 0 ? 'Today!' : daysUntil === 1 ? 'Tomorrow' : `${daysUntil} days`}
                        </p>
                        {venue.conference_start_date && (
                          <p className="text-xs text-gray-400 mt-1">
                            📅 {new Date(venue.conference_start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {venue.website && (
                    <a
                      href={venue.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 block text-center text-xs text-green-600 hover:text-green-700 font-medium"
                    >
                      Visit Website →
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
        
        <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-200">
          {conferenceMarkers.length > 0 ? (
            <ConferenceMap markers={conferenceMarkers} />
          ) : (
            <div className="text-gray-500 text-center py-12">
              {loading ? "Loading conferences..." : "No upcoming conferences found."}
            </div>
          )}
          
          {conferenceMarkers.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2 text-sm text-gray-600">
              <span className="font-medium">Locations:</span>
              {conferenceMarkers.slice(0, 10).map((marker) => (
                <span key={marker.name} className="px-2 py-1 bg-gray-100 rounded">
                  {marker.name} ({marker.venues.length})
                </span>
              ))}
              {conferenceMarkers.length > 10 && (
                <span className="px-2 py-1 bg-gray-100 rounded">
                  +{conferenceMarkers.length - 10} more
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Popular Papers Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className={`text-3xl font-bold text-gray-900 ${playfairDisplay.className}`}>
            Popular Papers
          </h2>
          <ProtectedLink 
            href="/papers" 
            className="text-green-600 hover:text-green-700 text-sm font-medium transition"
            onLoginRequired={() => setIsAuthModalOpen(true)}
          >
            View all →
          </ProtectedLink>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {popularPapers.map((paper) => (
            <ProtectedLink
              key={paper.id}
              href={`/papers/${paper.id}`}
              className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:shadow-md hover:border-gray-300 transition-all duration-200 group"
              onLoginRequired={() => setIsAuthModalOpen(true)}
            >
              <div className="flex items-start gap-3 mb-3">
                <div className="flex-shrink-0 w-12 h-12 relative rounded-lg border border-gray-100 overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100">
                  <PaperCoverArt
                    seed={paper.arxiv_id || paper.id}
                    title={paper.title}
                    authors={paper.authors}
                    year={paper.year}
                    className="absolute inset-0"
                    ariaLabel={paper.title ? `Paper cover: ${paper.title}` : "Paper cover"}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold text-gray-900 group-hover:text-green-600 transition line-clamp-2">
                    {paper.title}
                  </h3>
                </div>
              </div>
              
              {paper.authors && paper.authors.length > 0 && (
                <p className="text-xs text-gray-600 mb-2 line-clamp-1">
                  {paper.authors.slice(0, 3).join(", ")}
                  {paper.authors.length > 3 && " et al."}
                </p>
              )}
              
              {(paper.venue || paper.year) && (
                <p className="text-xs text-gray-500 mb-3">
                  {[paper.venue, paper.year].filter(Boolean).join(" · ")}
                </p>
              )}
              
              {paper.abstract && (
                <p className="text-sm text-gray-700 mb-3 line-clamp-3">
                  {paper.abstract}
                </p>
              )}
              
              <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span className="text-amber-500">★</span>
                  <span>{paper.bookmark_count || 0} bookmarks</span>
                </div>
                {paper.created_at && (
                  <span className="text-xs text-gray-400">
                    {new Date(paper.created_at).toLocaleDateString()}
                  </span>
                )}
              </div>
            </ProtectedLink>
          ))}
        </div>
        
        {popularPapers.length === 0 && (
          <div className="text-gray-500 text-center py-8">No popular papers found.</div>
        )}
      </div>

      {/* Popular Datasets Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className={`text-3xl font-bold text-gray-900 ${playfairDisplay.className}`}>
            Popular Datasets
          </h2>
          <ProtectedLink 
            href="/benchmark" 
            className="text-green-600 hover:text-green-700 text-sm font-medium transition"
            onLoginRequired={() => setIsAuthModalOpen(true)}
          >
            View all →
          </ProtectedLink>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {popularDatasets.slice(0, 3).map((dataset) => (
            <ProtectedLink
              key={dataset.id}
              href={`/datasets/${dataset.id}`}
              className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:shadow-md hover:border-gray-300 transition-all duration-200 group"
              onLoginRequired={() => setIsAuthModalOpen(true)}
            >
              <div className="flex items-start gap-3 mb-3">
                <div className="flex-shrink-0 w-12 h-12 relative rounded-lg border border-gray-100 overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100">
                  <DomainBadge domain={dataset.domain} size={24} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold text-gray-900 group-hover:text-green-600 transition line-clamp-2">
                    {dataset.name}
                  </h3>
                  {dataset.full_name && dataset.full_name !== dataset.name && (
                    <p className="text-xs text-gray-600 mt-1 line-clamp-1">
                      {dataset.full_name}
                    </p>
                  )}
                </div>
              </div>
              
              {dataset.description && (
                <p className="text-sm text-gray-700 mb-3 line-clamp-3">
                  {dataset.description}
                </p>
              )}
              
              <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                <div className="flex items-center gap-2">
                  {dataset.domain && (
                    <span className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded">
                      {dataset.domain}
                    </span>
                  )}
                  <div className="flex items-center gap-1 text-xs text-green-600">
                    <span className="font-medium">{dataset.paper_count || 0}</span>
                    <span>{dataset.paper_count === 1 ? 'paper' : 'papers'}</span>
                  </div>
                </div>
                {dataset.created_at && (
                  <span className="text-xs text-gray-400">
                    {new Date(dataset.created_at).toLocaleDateString()}
                  </span>
                )}
              </div>
            </ProtectedLink>
          ))}
        </div>
        
        {popularDatasets.length === 0 && (
          <div className="text-gray-500 text-center py-8">No popular datasets found.</div>
        )}
      </div>

      {/* Auth Modal */}
      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    </div>
  );
}
