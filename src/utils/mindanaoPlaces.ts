/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CategoryType } from '../types/accessibility';
import {
  MINDANAO_BOUNDS,
  isWithinMindanaoBounds,
  loadGoogleMaps,
  mapGooglePlaceTypesToCategory,
} from './googleMapsLoader';

export interface DiscoveredEstablishment {
  googlePlaceId: string;
  name: string;
  address: string;
  category: CategoryType;
  lat: number;
  lng: number;
}

const ESTABLISHMENT_PRIMARY_TYPES = [
  'shopping_mall',
  'supermarket',
  'restaurant',
  'cafe',
  'hospital',
  'pharmacy',
  'school',
  'university',
  'park',
  'hotel',
  'bank',
  'city_hall',
];

function extractDisplayName(place: any): string {
  if (!place) return 'Establishment';
  if (typeof place.displayName === 'string') return place.displayName;
  if (place.displayName && typeof place.displayName.text === 'string') {
    return place.displayName.text;
  }
  return 'Establishment';
}

function toDiscoveredEstablishment(place: any): DiscoveredEstablishment | null {
  if (!place || !place.id || !place.location) return null;
  const lat =
    typeof place.location.lat === 'function' ? place.location.lat() : Number(place.location.lat);
  const lng =
    typeof place.location.lng === 'function' ? place.location.lng() : Number(place.location.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !isWithinMindanaoBounds(lat, lng)) {
    return null;
  }

  return {
    googlePlaceId: String(place.id),
    name: extractDisplayName(place),
    address: place.formattedAddress || 'Mindanao, Philippines',
    category: mapGooglePlaceTypesToCategory(place.primaryType, place.types || []),
    lat,
    lng,
  };
}

async function getPlacesLibrary(): Promise<any> {
  const googleMaps = await loadGoogleMaps();
  if (typeof googleMaps.importLibrary === 'function') {
    return googleMaps.importLibrary('places');
  }
  if (googleMaps.places) {
    return googleMaps.places;
  }
  throw new Error('Google Places API (New) library unavailable.');
}

/**
 * Fetches establishment details for a clicked Google Maps POI using Places API (New) `Place.fetchFields`.
 */
export async function fetchPlaceDetailsById(
  placeId: string
): Promise<DiscoveredEstablishment | null> {
  const placesLib = await getPlacesLibrary();
  const PlaceCtor = placesLib?.Place || window.google?.maps?.places?.Place;
  if (!PlaceCtor) {
    throw new Error('Places API (New) Place class is not available.');
  }

  const place = new PlaceCtor({
    id: placeId,
    requestedLanguage: 'en',
    requestedRegion: 'PH',
  });
  await place.fetchFields({
    fields: ['id', 'displayName', 'formattedAddress', 'location', 'primaryType', 'types'],
  });
  return toDiscoveredEstablishment(place);
}

/**
 * Discovers real Mindanao establishments around the current map viewport using Places API (New)
 * `Place.searchNearby`, de-duped by `googlePlaceId` and capped at ~40 results.
 */
export async function discoverNearbyEstablishments(
  center: { lat: number; lng: number },
  radiusMeters: number,
  maxTotal = 40
): Promise<DiscoveredEstablishment[]> {
  if (!isWithinMindanaoBounds(center.lat, center.lng)) return [];

  const placesLib = await getPlacesLibrary();
  const PlaceCtor = placesLib?.Place || window.google?.maps?.places?.Place;
  if (!PlaceCtor || typeof PlaceCtor.searchNearby !== 'function') {
    throw new Error('Places API (New) Place.searchNearby is not available.');
  }

  const clampedRadius = Math.max(400, Math.min(25000, Math.round(radiusMeters)));
  const batchA = ESTABLISHMENT_PRIMARY_TYPES.slice(0, 6);
  const batchB = ESTABLISHMENT_PRIMARY_TYPES.slice(6);

  const [resA, resB] = await Promise.all([
    PlaceCtor.searchNearby({
      fields: ['id', 'displayName', 'formattedAddress', 'location', 'primaryType', 'types'],
      locationRestriction: { center, radius: clampedRadius },
      includedPrimaryTypes: batchA,
      maxResultCount: 20,
      language: 'en',
      region: 'PH',
    }),
    PlaceCtor.searchNearby({
      fields: ['id', 'displayName', 'formattedAddress', 'location', 'primaryType', 'types'],
      locationRestriction: { center, radius: clampedRadius },
      includedPrimaryTypes: batchB,
      maxResultCount: 20,
      language: 'en',
      region: 'PH',
    }),
  ]);

  const seen = new Map<string, DiscoveredEstablishment>();
  for (const raw of [...(resA?.places || []), ...(resB?.places || [])]) {
    const parsed = toDiscoveredEstablishment(raw);
    if (parsed && !seen.has(parsed.googlePlaceId)) {
      seen.set(parsed.googlePlaceId, parsed);
      if (seen.size >= maxTotal) break;
    }
  }

  return Array.from(seen.values());
}

/**
 * Searches real Mindanao establishments using Places API (New) `Place.searchByText`,
 * strictly bounded to `MINDANAO_BOUNDS` and `region: 'PH'`.
 */
export async function searchMindanaoPlacesByText(
  textQuery: string,
  maxResults = 8
): Promise<DiscoveredEstablishment[]> {
  const clean = textQuery.trim();
  if (clean.length < 2) return [];

  const placesLib = await getPlacesLibrary();
  const PlaceCtor = placesLib?.Place || window.google?.maps?.places?.Place;
  if (!PlaceCtor || typeof PlaceCtor.searchByText !== 'function') {
    throw new Error('Places API (New) Place.searchByText is not available.');
  }

  const res = await PlaceCtor.searchByText({
    textQuery: clean,
    fields: ['id', 'displayName', 'formattedAddress', 'location', 'primaryType', 'types'],
    locationRestriction: MINDANAO_BOUNDS,
    region: 'PH',
    language: 'en',
    maxResultCount: maxResults,
  });

  const seen = new Map<string, DiscoveredEstablishment>();
  for (const raw of res?.places || []) {
    const parsed = toDiscoveredEstablishment(raw);
    if (parsed && !seen.has(parsed.googlePlaceId)) {
      seen.set(parsed.googlePlaceId, parsed);
    }
  }
  return Array.from(seen.values());
}

/**
 * Mounts the new `PlaceAutocompleteElement` widget restricted to Mindanao (`MINDANAO_BOUNDS`, PH).
 * Returns a cleanup function.
 */
export async function mountMindanaoPlaceAutocomplete(
  container: HTMLElement,
  onSelect: (est: DiscoveredEstablishment) => void
): Promise<() => void> {
  const placesLib = await getPlacesLibrary();
  const AutocompleteCtor =
    placesLib?.PlaceAutocompleteElement ||
    window.google?.maps?.places?.PlaceAutocompleteElement;

  if (!AutocompleteCtor) {
    throw new Error('Places API (New) PlaceAutocompleteElement is not available.');
  }

  container.innerHTML = '';
  const el = new AutocompleteCtor({
    locationRestriction: MINDANAO_BOUNDS,
    includedRegionCodes: ['ph'],
  });
  el.style.width = '100%';

  const handleSelect = async (event: any) => {
    try {
      const place =
        event?.placePrediction?.toPlace?.() ||
        event?.place ||
        null;
      if (!place) return;
      await place.fetchFields({
        fields: ['id', 'displayName', 'formattedAddress', 'location', 'primaryType', 'types'],
      });
      const parsed = toDiscoveredEstablishment(place);
      if (parsed) onSelect(parsed);
    } catch (err) {
      console.warn('[TanAW Places] Failed to fetch selected autocomplete place:', err);
    }
  };

  el.addEventListener('gmp-select', handleSelect);
  el.addEventListener('gmp-placeselect', handleSelect);
  container.appendChild(el);

  return () => {
    el.removeEventListener('gmp-select', handleSelect);
    el.removeEventListener('gmp-placeselect', handleSelect);
    if (el.parentNode === container) {
      container.removeChild(el);
    }
  };
}
