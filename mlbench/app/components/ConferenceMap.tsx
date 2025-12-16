'use client';

import 'leaflet/dist/leaflet.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapContainer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { MapLibreTileLayer } from './MapLibreTileLayer';

interface Venue {
  id?: string;
  name: string;
  short_name?: string | null;
  acronym?: string | null;
  conference_start_date?: string | null;
  place?: string | null;
}

interface ConferenceMarker {
  name: string;
  lat: number;
  lng: number;
  venues: Venue[];
  color: string;
}

interface ConferenceMapProps {
  markers: ConferenceMarker[];
}

const ConferenceMap = ({ markers }: ConferenceMapProps) => {
  return (
    <div className="w-full h-[600px] rounded-xl overflow-hidden relative z-0">
      <MapContainer
        center={[20, 0]}
        zoom={2}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={false}
      >
        <MapLibreTileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tiles.openfreemap.org/styles/positron"
        />
        
        {markers.map((marker, idx) => {
          const customIcon = L.divIcon({
            className: 'custom-marker',
            html: `
              <div style="
                width: 32px;
                height: 32px;
                background: ${marker.color};
                border: 3px solid white;
                border-radius: 50%;
                box-shadow: 0 2px 8px rgba(0,0,0,0.4);
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-weight: bold;
                font-size: 12px;
              ">
                ${marker.venues.length}
              </div>
            `,
            iconSize: [32, 32],
            iconAnchor: [16, 16],
            popupAnchor: [0, -16],
          });

          return (
            <Marker
              key={idx}
              position={[marker.lat, marker.lng]}
              icon={customIcon}
            >
              <Popup>
                <div className="text-sm min-w-[200px]">
                  <strong className="block text-lg font-semibold mb-2" style={{ color: marker.color }}>
                    {marker.name}
                  </strong>
                  <div className="text-gray-600 mb-3 text-xs">
                    {marker.venues.length} conference{marker.venues.length !== 1 ? 's' : ''}
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {marker.venues.map((venue, vIdx) => (
                      <div key={vIdx} className="text-xs text-gray-700 flex items-start gap-2">
                        <span style={{ color: marker.color }}>•</span>
                        <span className="flex-1">
                          <span className="font-medium text-gray-900">
                            {venue.short_name || venue.acronym || venue.name}
                          </span>
                          {venue.conference_start_date && (
                            <span className="text-gray-500 ml-1">
                              ({venue.conference_start_date})
                            </span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
};

export default ConferenceMap;

