/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CategoryType } from '../types/accessibility';
import { RoutePreviewResult } from './routingAndSpatial';

declare global {
  interface Window {
    google?: any;
    __googleMapsPromise?: Promise<any>;
  }
}

/**
 * Strict geographic bounding box focused on the Mindanao region.
 */
export const MINDANAO_BOUNDS = {
  north: 9.9,
  south: 4.5,
  west: 121.5,
  east: 126.8,
};

// Kept exported for backward compatibility with any external imports
export const PHILIPPINES_BOUNDS = MINDANAO_BOUNDS;

export function isWithinMindanaoBounds(lat: number, lng: number): boolean {
  return (
    lat >= MINDANAO_BOUNDS.south &&
    lat <= MINDANAO_BOUNDS.north &&
    lng >= MINDANAO_BOUNDS.west &&
    lng <= MINDANAO_BOUNDS.east
  );
}

/**
 * Clean map styling highlighting clickable establishments (POIs) across Mindanao.
 */
export const MINDANAO_ESTABLISHMENT_MAP_STYLES = [
  {
    featureType: 'poi.business',
    elementType: 'labels.icon',
    stylers: [{ visibility: 'on' }, { saturation: 20 }],
  },
  {
    featureType: 'poi.medical',
    elementType: 'labels.icon',
    stylers: [{ visibility: 'on' }, { saturation: 35 }],
  },
  {
    featureType: 'poi.school',
    elementType: 'labels.icon',
    stylers: [{ visibility: 'on' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'labels.icon',
    stylers: [{ visibility: 'on' }],
  },
];

export function mapGooglePlaceTypesToCategory(
  primaryType?: string,
  types: string[] = []
): CategoryType {
  const joined = [primaryType || '', ...types].join(' ').toLowerCase();
  if (/(hospital|doctor|dentist|pharmacy|health|clinic|medical)/.test(joined)) return 'Healthcare';
  if (/(restaurant|cafe|coffee|bakery|food|meal|bar|fast_food)/.test(joined)) return 'Dining & Cafe';
  if (/(shopping_mall|department_store|supermarket|grocery|store|market|mall)/.test(joined)) {
    return 'Shopping';
  }
  if (/(school|university|library|college|campus)/.test(joined)) return 'Education';
  if (/(park|city_hall|local_government|museum|church|plaza|tourist_attraction|civic)/.test(joined)) {
    return 'Public Space';
  }
  if (/(lodging|hotel|resort|inn|hostel)/.test(joined)) return 'Hotel & Lodging';
  if (/(bank|atm|post_office|gas_station|car_repair|service)/.test(joined)) return 'Service';
  return 'Other';
}

/**
 * Dynamically loads the official Google Maps JavaScript API with Philippine region biasing
 * and Places API (New) support.
 */
export function loadGoogleMaps(apiKey?: string): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Window not available'));

  if (window.google?.maps) {
    return Promise.resolve(window.google.maps);
  }

  if (window.__googleMapsPromise) {
    return window.__googleMapsPromise;
  }

  const key = apiKey || import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
  if (!key) {
    return Promise.reject(new Error('VITE_GOOGLE_MAPS_API_KEY is not configured.'));
  }

  window.__googleMapsPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById('google-maps-js');
    if (existing) {
      if (window.google?.maps) {
        resolve(window.google.maps);
      } else {
        existing.addEventListener('load', () => resolve(window.google.maps));
        existing.addEventListener('error', () =>
          reject(new Error('Failed to load Google Maps script.'))
        );
      }
      return;
    }

    const script = document.createElement('script');
    script.id = 'google-maps-js';
    script.src = `https://maps.googleapis.com/maps/api/js?v=weekly&key=${encodeURIComponent(
      key
    )}&libraries=places,geometry,marker&region=PH&language=en`;
    script.async = true;
    script.defer = true;

    script.onload = () => {
      if (window.google?.maps) {
        resolve(window.google.maps);
      } else {
        reject(new Error('Google Maps SDK loaded but window.google.maps is undefined.'));
      }
    };

    script.onerror = () => {
      reject(new Error('Failed to load Google Maps script. Check your network or API key.'));
    };

    document.head.appendChild(script);
  });

  return window.__googleMapsPromise;
}

/**
 * Generates an SVG data URL for a rated community accessibility marker.
 */
export function buildGoogleMarkerSvg(
  colorHex: string,
  categoryIconSvg: string,
  rating: number,
  isSelected: boolean
): string {
  const strokeWidth = isSelected ? 3 : 2;
  const strokeColor = isSelected ? '#0f172a' : '#ffffff';
  const size = isSelected ? 50 : 42;
  const ratingText = rating > 0 ? `${rating.toFixed(1)}★` : 'NEW';

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size + 22}" viewBox="0 0 48 68" fill="none">
      <defs>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="3" stdDeviation="2.5" flood-color="#000000" flood-opacity="0.35"/>
        </filter>
      </defs>
      <g filter="url(#shadow)">
        <path d="M24 2C13 2 4 11 4 22C4 35 24 54 24 54C24 54 44 35 44 22C44 11 35 2 24 2Z" 
              fill="${colorHex}" 
              stroke="${strokeColor}" 
              stroke-width="${strokeWidth}" />
        <circle cx="24" cy="22" r="14" fill="#ffffff" />
        <g transform="translate(16, 14) scale(0.66)" stroke="${colorHex}" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
          ${categoryIconSvg}
        </g>
        <rect x="6" y="52" width="36" height="14" rx="7" fill="#0f172a" stroke="${colorHex}" stroke-width="1.5" />
        <text x="24" y="62" text-anchor="middle" fill="#ffffff" font-family="system-ui, sans-serif" font-size="8.5" font-weight="800">${ratingText}</text>
      </g>
    </svg>
  `.trim();

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

/**
 * Generates a visually distinct SVG data URL for an unrated Google Maps establishment pin
 * with a highlighted outline and a "Rate" affordance pill.
 */
export function buildEstablishmentMarkerSvg(
  categoryIconSvg: string,
  isSelected: boolean
): string {
  const size = isSelected ? 46 : 38;
  const ringColor = isSelected ? '#0f766e' : '#0284c7';
  const strokeWidth = isSelected ? 3 : 2.2;

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size + 20}" viewBox="0 0 48 66" fill="none">
      <defs>
        <filter id="estShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#0f172a" flood-opacity="0.28"/>
        </filter>
      </defs>
      <g filter="url(#estShadow)">
        <path d="M24 3C13.5 3 5 11.5 5 22C5 34.5 24 52 24 52C24 52 43 34.5 43 22C43 11.5 34.5 3 24 3Z"
              fill="#ffffff"
              stroke="${ringColor}"
              stroke-width="${strokeWidth}" />
        <g transform="translate(15, 13) scale(0.75)" stroke="${ringColor}" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round">
          ${categoryIconSvg}
        </g>
        <rect x="8" y="50" width="32" height="14" rx="7" fill="${ringColor}" stroke="#ffffff" stroke-width="1.2" />
        <text x="24" y="60" text-anchor="middle" fill="#ffffff" font-family="system-ui, sans-serif" font-size="8.5" font-weight="800">Rate</text>
      </g>
    </svg>
  `.trim();

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

/**
 * Calculates accessible pedestrian routes using the Google Maps Directions Service.
 */
export async function calculateGoogleWalkingRoute(
  origin: { lat: number; lng: number },
  dest: { lat: number; lng: number }
): Promise<RoutePreviewResult> {
  const google = await loadGoogleMaps();

  return new Promise((resolve, reject) => {
    const directionsService = new google.maps.DirectionsService();

    directionsService.route(
      {
        origin: new google.maps.LatLng(origin.lat, origin.lng),
        destination: new google.maps.LatLng(dest.lat, dest.lng),
        travelMode: google.maps.TravelMode.WALKING,
        provideRouteAlternatives: false,
        region: 'PH',
      },
      (result: any, status: any) => {
        if (status === 'OK' && result && result.routes && result.routes[0]) {
          const route = result.routes[0];
          const leg = route.legs[0];

          const coordinates: [number, number][] = [];
          if (route.overview_path) {
            route.overview_path.forEach((pt: any) => {
              coordinates.push([pt.lat(), pt.lng()]);
            });
          }

          const distKm = Math.round(((leg.distance?.value || 1000) / 1000) * 10) / 10;
          const durationMins = Math.max(1, Math.round((leg.duration?.value || 60) / 60));

          resolve({
            coordinates,
            distanceKm: distKm,
            durationMinutes: durationMins,
            isFallbackArc: false,
            summaryText: `Google Pedestrian Route (${distKm} km • ~${durationMins} min mobility transit)`,
          });
        } else {
          reject(new Error(`Google Directions failed with status: ${status}`));
        }
      }
    );
  });
}
