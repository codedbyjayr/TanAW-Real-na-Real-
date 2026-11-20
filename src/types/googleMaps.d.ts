/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Global Google Maps & Places API (New) ambient definitions
declare namespace google {
  export namespace maps {
    export class Map {
      constructor(mapDiv: Element | null, opts?: any);
      setCenter(latLng: any): void;
      getCenter(): LatLng | null;
      getBounds(): LatLngBounds | null;
      setZoom(zoom: number): void;
      getZoom(): number;
      panTo(latLng: any): void;
      fitBounds(bounds: any, padding?: any): void;
      setMapTypeId(type: string): void;
      addListener(eventName: string, handler: Function): any;
      setHeading(heading: number): void;
    }
    export class Marker {
      constructor(opts?: any);
      setMap(map: Map | null): void;
      setPosition(latLng: any): void;
      setIcon(icon: any): void;
      setTitle(title: string): void;
      setZIndex(index: number): void;
      setAnimation(animation: any): void;
      addListener(eventName: string, handler: Function): any;
    }
    export class InfoWindow {
      constructor(opts?: any);
      open(opts?: any): void;
      close(): void;
      setContent(content: string | Element): void;
    }
    export class LatLng {
      constructor(lat: number, lng: number);
      lat(): number;
      lng(): number;
    }
    export class LatLngBounds {
      constructor(sw?: any, ne?: any);
      extend(latLng: any): void;
      getNorthEast(): LatLng;
      getSouthWest(): LatLng;
    }
    export class Circle {
      constructor(opts?: any);
      setMap(map: Map | null): void;
      setCenter(center: any): void;
      setRadius(radius: number): void;
    }
    export class Polyline {
      constructor(opts?: any);
      setMap(map: Map | null): void;
      setPath(path: any): void;
    }
    export class DirectionsService {
      route(request: any, callback: (result: any, status: any) => void): void;
    }
    export class StreetViewPanorama {
      constructor(container: Element | null, opts?: any);
      setPosition(latLng: any): void;
      setVisible(visible: boolean): void;
    }
    export enum TravelMode {
      WALKING = 'WALKING',
      DRIVING = 'DRIVING',
      TRANSIT = 'TRANSIT',
      BICYCLING = 'BICYCLING',
    }
    export enum MapTypeId {
      ROADMAP = 'roadmap',
      SATELLITE = 'satellite',
      HYBRID = 'hybrid',
      TERRAIN = 'terrain',
    }
    export namespace event {
      export function clearInstanceListeners(instance: any): void;
      export function addListener(instance: any, eventName: string, handler: Function): any;
    }
    export function importLibrary(name: string): Promise<any>;

    export namespace places {
      export class Place {
        id: string;
        displayName?: string | { text?: string };
        formattedAddress?: string;
        location?: LatLng;
        primaryType?: string;
        types?: string[];
        constructor(options: { id: string; requestedLanguage?: string; requestedRegion?: string });
        fetchFields(options: { fields: string[] }): Promise<{ place: Place }>;
        static searchNearby(request: {
          fields: string[];
          locationRestriction: { center: { lat: number; lng: number } | LatLng; radius: number };
          includedPrimaryTypes?: string[];
          maxResultCount?: number;
          rankPreference?: any;
          language?: string;
          region?: string;
        }): Promise<{ places: Place[] }>;
        static searchByText(request: {
          textQuery: string;
          fields: string[];
          locationRestriction?: { north: number; south: number; east: number; west: number };
          region?: string;
          language?: string;
          maxResultCount?: number;
        }): Promise<{ places: Place[] }>;
      }

      export class PlaceAutocompleteElement extends HTMLElement {
        locationRestriction?: { north: number; south: number; east: number; west: number } | null;
        includedRegionCodes?: string[] | null;
        constructor(options?: {
          locationRestriction?: { north: number; south: number; east: number; west: number };
          includedRegionCodes?: string[];
        });
      }
    }
  }
}
