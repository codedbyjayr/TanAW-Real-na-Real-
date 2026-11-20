/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { LocationPin, CategoryType } from '../types/accessibility';
import { getRatingColor } from '../utils/storage';
import {
  CityPreset,
  DEFAULT_CDO_CENTER,
  RoutePreviewResult,
  getCategoryIconSvg,
  buildInteractivePinHtml,
} from '../utils/routingAndSpatial';
import {
  MINDANAO_BOUNDS,
  MINDANAO_ESTABLISHMENT_MAP_STYLES,
  loadGoogleMaps,
  buildGoogleMarkerSvg,
  buildEstablishmentMarkerSvg,
} from '../utils/googleMapsLoader';
import {
  DiscoveredEstablishment,
  discoverNearbyEstablishments,
  fetchPlaceDetailsById,
} from '../utils/mindanaoPlaces';
import { useA11y } from '../context/A11yContext';
import { MapFloatingCard } from './MapFloatingCard';
import { MobileRiftFloraLayout } from './mobile/MobileRiftFloraLayout';
import {
  Locate,
  ZoomIn,
  ZoomOut,
  Layers,
  Check,
  Radar,
  Crosshair,
  Navigation,
  Sparkles,
  Eye,
  Key,
  ShieldAlert,
  X,
  Menu,
} from 'lucide-react';

export type GoogleMapStyle = 'roadmap' | 'satellite' | 'hybrid' | 'terrain';
export type MapTileStyle = GoogleMapStyle;

export interface ClickedGooglePoi {
  googlePlaceId: string;
  name: string;
  address: string;
  category: CategoryType;
  lat: number;
  lng: number;
}

export interface MapViewProps {
  locations: LocationPin[];
  totalLocationsCount?: number;
  selectedLocation: LocationPin | null;
  onSelectLocation: (loc: LocationPin) => void;
  onOpenDetails: (loc: LocationPin) => void;
  onRatePlace?: (loc: LocationPin) => void;
  onSelectGooglePoi?: (poi: ClickedGooglePoi) => void;
  isAddingLocation: boolean;
  newPinCoords: { lat: number; lng: number } | null;
  onNewPinCoordsChange: (coords: { lat: number; lng: number }) => void;
  activeCity: CityPreset;
  activeRoute: RoutePreviewResult | null;
  isRoutingLoading?: boolean;
  onToggleRoutePreview: (loc: LocationPin) => void;
  onClearRoute: () => void;
  userCoords: { lat: number; lng: number } | null;
  onUserCoordsChange: (coords: { lat: number; lng: number } | null) => void;
  nearbyRadiusKm: number | null;
  onNearbyRadiusChange: (radius: number | null) => void;
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
  selectedCategory?: CategoryType | 'All';
  onCategoryChange?: (cat: CategoryType | 'All') => void;
  onOpenAIAnalyzer?: () => void;
  onRunAIScan?: (loc: LocationPin | null) => void;
  onNavigateTab?: (tabId: string) => void;
  onOpenMobileMenu?: () => void;
}

const GOOGLE_MAP_STYLES: Array<{ id: GoogleMapStyle; label: string; desc: string }> = [
  { id: 'roadmap', label: 'Standard Roadmap', desc: 'Clean street & infrastructure map' },
  { id: 'satellite', label: 'Satellite', desc: 'High-resolution satellite imagery' },
  { id: 'hybrid', label: 'Hybrid', desc: 'Satellite imagery with street labels' },
  { id: 'terrain', label: 'Terrain', desc: 'Topographic elevation & physical features' },
];

const LEAFLET_TILES: Record<GoogleMapStyle, string> = {
  roadmap: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  hybrid: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  terrain: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
};

export const MapView: React.FC<MapViewProps> = ({
  locations,
  selectedLocation,
  onSelectLocation,
  onOpenDetails,
  onRatePlace,
  onSelectGooglePoi,
  isAddingLocation,
  newPinCoords,
  onNewPinCoordsChange,
  activeCity,
  activeRoute,
  isRoutingLoading = false,
  onToggleRoutePreview,
  onClearRoute,
  userCoords,
  onUserCoordsChange,
  nearbyRadiusKm,
  onNearbyRadiusChange,
  searchQuery = '',
  onSearchChange = () => {},
  selectedCategory = 'All',
  onCategoryChange = () => {},
  onOpenAIAnalyzer,
  onRunAIScan,
  onNavigateTab,
  onOpenMobileMenu,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const leafletContainerRef = useRef<HTMLDivElement>(null);
  const streetViewContainerRef = useRef<HTMLDivElement>(null);

  const googleMapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const establishmentMarkersRef = useRef<any[]>([]);
  const newPinMarkerRef = useRef<any>(null);
  const userMarkerRef = useRef<any>(null);
  const userCircleRef = useRef<any>(null);
  const routePolylineRef = useRef<any>(null);
  const routeCasingRef = useRef<any>(null);
  const streetViewPanoramaRef = useRef<any>(null);

  // Interactive fallback Leaflet refs when Google Maps API key is not configured
  const leafletMapRef = useRef<L.Map | null>(null);
  const leafletTileRef = useRef<L.TileLayer | null>(null);
  const leafletMarkersRef = useRef<L.LayerGroup | null>(null);
  const leafletRouteRef = useRef<L.LayerGroup | null>(null);

  const { announce } = useA11y();
  const [isLocating, setIsLocating] = useState(false);
  const [showSummaryCard, setShowSummaryCard] = useState(true);
  const [mapStyle, setMapStyle] = useState<GoogleMapStyle>('roadmap');
  const [showLayerPicker, setShowLayerPicker] = useState(false);
  const [showRadiusPicker, setShowRadiusPicker] = useState(false);
  const [showStreetView, setShowStreetView] = useState(false);
  const [dismissKeyNotice, setDismissKeyNotice] = useState(false);
  const [showEstablishments, setShowEstablishments] = useState(true);
  const [discoveredEstablishments, setDiscoveredEstablishments] = useState<DiscoveredEstablishment[]>([]);
  const [selectedUnratedEst, setSelectedUnratedEst] = useState<DiscoveredEstablishment | null>(null);
  const [placesNotice, setPlacesNotice] = useState<string | null>(null);
  const [poiLoadingLabel, setPoiLoadingLabel] = useState<string | null>(null);
  const onSelectGooglePoiRef = useRef(onSelectGooglePoi);
  const isAddingLocationRef = useRef(isAddingLocation);
  const showEstablishmentsRef = useRef(showEstablishments);

  useEffect(() => {
    onSelectGooglePoiRef.current = onSelectGooglePoi;
  }, [onSelectGooglePoi]);

  useEffect(() => {
    isAddingLocationRef.current = isAddingLocation;
  }, [isAddingLocation]);

  useEffect(() => {
    showEstablishmentsRef.current = showEstablishments;
    if (!showEstablishments) {
      setDiscoveredEstablishments([]);
      setSelectedUnratedEst(null);
    }
  }, [showEstablishments]);

  const [googleLoadError, setGoogleLoadError] = useState<string | null>(null);
  const hasApiKey = Boolean(import.meta.env.VITE_GOOGLE_MAPS_API_KEY);
  const useFallbackInteractiveMap = !hasApiKey || Boolean(googleLoadError);

  // 1. Initialize Google Map when VITE_GOOGLE_MAPS_API_KEY is present
  useEffect(() => {
    let isMounted = true;
    if (!hasApiKey) return;

    (window as any).gm_authFailure = () => {
      if (isMounted) {
        setGoogleLoadError('Google Maps API key authentication or billing check failed — switched to OpenStreetMap tiles.');
      }
    };

    loadGoogleMaps()
      .then((googleMaps) => {
        if (!isMounted || !mapContainerRef.current) return;

        const initialCenter = activeCity
          ? { lat: activeCity.lat, lng: activeCity.lng }
          : { lat: DEFAULT_CDO_CENTER.lat, lng: DEFAULT_CDO_CENTER.lng };

        const map = new googleMaps.Map(mapContainerRef.current, {
          center: initialCenter,
          zoom: activeCity?.zoom || 13,
          minZoom: 7,
          mapTypeId: mapStyle,
          styles: MINDANAO_ESTABLISHMENT_MAP_STYLES,
          disableDefaultUI: true,
          gestureHandling: 'greedy',
          restriction: {
            latLngBounds: MINDANAO_BOUNDS,
            strictBounds: true,
          },
          clickableIcons: true,
        });

        googleMapInstanceRef.current = map;

        // Discover real Mindanao establishments on map idle (Places API New, capped ~40, de-duped by placeId)
        let idleFetchId = 0;
        map.addListener('idle', () => {
          if (!showEstablishmentsRef.current) return;
          const zoom = map.getZoom();
          if (zoom < 11) return; // Avoid broad island-wide nearby queries when zoomed all the way out
          const centerObj = map.getCenter();
          if (!centerObj) return;

          const currentFetch = ++idleFetchId;
          const radiusMeters = zoom >= 15 ? 1200 : zoom >= 13 ? 3000 : 7000;
          discoverNearbyEstablishments(
            { lat: centerObj.lat(), lng: centerObj.lng() },
            radiusMeters,
            40
          )
            .then((list) => {
              if (!isMounted || currentFetch !== idleFetchId || !showEstablishmentsRef.current) {
                return;
              }
              setPlacesNotice(null);
              setDiscoveredEstablishments(list);
            })
            .catch(() => {
              if (isMounted && currentFetch === idleFetchId) {
                setPlacesNotice(
                  'Google Places discovery unavailable — check that Places API (New) is enabled on your key. Community pins remain active.'
                );
              }
            });
        });

        map.addListener('click', (e: any) => {
          // Click directly on a Google Maps POI -> fetch via Places API (New) Place.fetchFields
          if (e.placeId) {
            e.stop();
            setPoiLoadingLabel('Loading establishment details...');
            fetchPlaceDetailsById(e.placeId)
              .then((est) => {
                setPoiLoadingLabel(null);
                if (!est) return;
                setSelectedUnratedEst(est);
                setShowSummaryCard(true);
                onSelectGooglePoiRef.current?.(est);
              })
              .catch(() => {
                setPoiLoadingLabel(null);
                setPlacesNotice('Could not fetch establishment details (ensure Places API New is enabled).');
              });
            return;
          }

          if (!e.latLng) return;
          const coords = { lat: e.latLng.lat(), lng: e.latLng.lng() };
          if (isAddingLocationRef.current) {
            onNewPinCoordsChange(coords);
          } else {
            setShowSummaryCard(false);
            setSelectedUnratedEst(null);
          }
        });
      })
      .catch((err) => {
        if (isMounted) {
          setGoogleLoadError(err.message || 'Could not load Google Maps SDK');
        }
      });

    return () => {
      isMounted = false;
      if (googleMapInstanceRef.current && window.google?.maps?.event) {
        window.google.maps.event.clearInstanceListeners(googleMapInstanceRef.current);
      }
    };
  }, [hasApiKey]);

  // 2. Initialize Interactive Fallback Map when VITE_GOOGLE_MAPS_API_KEY is not set
  useEffect(() => {
    if (!useFallbackInteractiveMap || !leafletContainerRef.current || leafletMapRef.current) return;

    const initialCenter = activeCity
      ? ([activeCity.lat, activeCity.lng] as [number, number])
      : ([DEFAULT_CDO_CENTER.lat, DEFAULT_CDO_CENTER.lng] as [number, number]);

    const map = L.map(leafletContainerRef.current, {
      center: initialCenter,
      zoom: activeCity?.zoom || 8,
      minZoom: 7,
      zoomControl: false,
      maxBounds: [
        [MINDANAO_BOUNDS.south, MINDANAO_BOUNDS.west],
        [MINDANAO_BOUNDS.north, MINDANAO_BOUNDS.east],
      ],
    });

    const tile = L.tileLayer(LEAFLET_TILES[mapStyle], {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    const markersGroup = L.layerGroup().addTo(map);
    const routeGroup = L.layerGroup().addTo(map);

    map.on('click', (e: L.LeafletMouseEvent) => {
      if (isAddingLocation) {
        onNewPinCoordsChange({ lat: e.latlng.lat, lng: e.latlng.lng });
      } else {
        setShowSummaryCard(false);
      }
    });

    leafletMapRef.current = map;
    leafletTileRef.current = tile;
    leafletMarkersRef.current = markersGroup;
    leafletRouteRef.current = routeGroup;

    return () => {
      map.remove();
      leafletMapRef.current = null;
    };
  }, [useFallbackInteractiveMap]);

  // Update Map Type (Roadmap / Satellite / Hybrid / Terrain)
  useEffect(() => {
    if (googleMapInstanceRef.current) {
      googleMapInstanceRef.current.setMapTypeId(mapStyle);
    }
    if (leafletTileRef.current) {
      leafletTileRef.current.setUrl(LEAFLET_TILES[mapStyle]);
    }
  }, [mapStyle]);

  // Pan to active city when changed
  useEffect(() => {
    if (!activeCity) return;
    if (googleMapInstanceRef.current) {
      googleMapInstanceRef.current.panTo({ lat: activeCity.lat, lng: activeCity.lng });
      googleMapInstanceRef.current.setZoom(activeCity.zoom);
    }
    if (leafletMapRef.current) {
      leafletMapRef.current.flyTo([activeCity.lat, activeCity.lng], activeCity.zoom, {
        duration: 0.8,
      });
    }
  }, [activeCity?.id]);

  // Center on selected location
  useEffect(() => {
    if (!selectedLocation) return;
    setShowSummaryCard(true);

    if (googleMapInstanceRef.current) {
      googleMapInstanceRef.current.panTo({
        lat: selectedLocation.lat,
        lng: selectedLocation.lng,
      });
      googleMapInstanceRef.current.setZoom(Math.max(googleMapInstanceRef.current.getZoom(), 15));

      if (showStreetView && streetViewPanoramaRef.current) {
        streetViewPanoramaRef.current.setPosition({
          lat: selectedLocation.lat,
          lng: selectedLocation.lng,
        });
      }
    }
    if (leafletMapRef.current) {
      leafletMapRef.current.flyTo(
        [selectedLocation.lat, selectedLocation.lng],
        Math.max(leafletMapRef.current.getZoom(), 15),
        { duration: 0.6 }
      );
    }
  }, [selectedLocation?.id]);

  // Render Markers (Google Maps + Fallback Interactive Map)
  useEffect(() => {
    if (googleMapInstanceRef.current && window.google?.maps) {
      markersRef.current.forEach((m) => m.setMap(null));
      markersRef.current = [];

      const map = googleMapInstanceRef.current;
      const googleMaps = window.google.maps;

      locations.forEach((loc) => {
        const isSelected = selectedLocation?.id === loc.id;
        const colorMeta = getRatingColor(loc.averageRating, loc.totalReviews);
        const iconSvg = getCategoryIconSvg(loc.category);
        const markerIconUrl = buildGoogleMarkerSvg(
          colorMeta.hex,
          iconSvg,
          loc.averageRating,
          isSelected
        );

        const marker = new googleMaps.Marker({
          position: { lat: loc.lat, lng: loc.lng },
          map: map,
          title: `${loc.name} (${colorMeta.label})`,
          icon: {
            url: markerIconUrl,
            scaledSize: new googleMaps.Size(isSelected ? 50 : 42, isSelected ? 72 : 64),
            anchor: new googleMaps.Point(isSelected ? 25 : 21, isSelected ? 56 : 50),
          },
          zIndex: isSelected ? 1000 : 10,
          animation: isSelected ? googleMaps.Animation.BOUNCE : null,
        });

        if (isSelected) {
          setTimeout(() => marker.setAnimation(null), 750);
        }

        marker.addListener('click', () => {
          setSelectedUnratedEst(null);
          onSelectLocation(loc);
          setShowSummaryCard(true);
        });

        markersRef.current.push(marker);
      });
    }

    // Render Unrated Google Establishments (distinct outlined "Rate" pins, de-duped against rated locations)
    if (googleMapInstanceRef.current && window.google?.maps) {
      establishmentMarkersRef.current.forEach((m) => m.setMap(null));
      establishmentMarkersRef.current = [];

      if (showEstablishments && discoveredEstablishments.length > 0) {
        const map = googleMapInstanceRef.current;
        const googleMaps = window.google.maps;
        const ratedPlaceIds = new Set(locations.map((l) => l.googlePlaceId).filter(Boolean));
        const ratedNames = new Set(locations.map((l) => l.name.trim().toLowerCase()));

        discoveredEstablishments.forEach((est) => {
          if (
            ratedPlaceIds.has(est.googlePlaceId) ||
            ratedNames.has(est.name.trim().toLowerCase())
          ) {
            return;
          }
          const isSelected = selectedUnratedEst?.googlePlaceId === est.googlePlaceId;
          const iconSvg = getCategoryIconSvg(est.category);
          const markerUrl = buildEstablishmentMarkerSvg(iconSvg, isSelected);

          const marker = new googleMaps.Marker({
            position: { lat: est.lat, lng: est.lng },
            map,
            title: `${est.name} — Click to rate accessibility`,
            icon: {
              url: markerUrl,
              scaledSize: new googleMaps.Size(isSelected ? 46 : 38, isSelected ? 66 : 58),
              anchor: new googleMaps.Point(isSelected ? 23 : 19, isSelected ? 52 : 46),
            },
            zIndex: isSelected ? 950 : 5,
          });

          marker.addListener('click', () => {
            setSelectedUnratedEst(est);
            setShowSummaryCard(true);
            onSelectGooglePoiRef.current?.(est);
          });

          establishmentMarkersRef.current.push(marker);
        });
      }
    }

    if (leafletMarkersRef.current && leafletMapRef.current) {
      leafletMarkersRef.current.clearLayers();
      locations.forEach((loc) => {
        const isSelected = selectedLocation?.id === loc.id;
        const icon = L.divIcon({
          className: 'custom-a11y-pin',
          html: buildInteractivePinHtml(loc, isSelected, true),
          iconSize: [44, 56],
          iconAnchor: [22, 48],
        });
        const m = L.marker([loc.lat, loc.lng], {
          icon,
          zIndexOffset: isSelected ? 900 : 10,
        });
        m.on('click', () => {
          onSelectLocation(loc);
          setShowSummaryCard(true);
        });
        m.addTo(leafletMarkersRef.current!);
      });
    }
  }, [locations, selectedLocation, useFallbackInteractiveMap, showEstablishments, discoveredEstablishments, selectedUnratedEst]);

  // Render User Location & Proximity Radius Ring
  useEffect(() => {
    const origin = userCoords || (nearbyRadiusKm !== null ? DEFAULT_CDO_CENTER : null);

    if (googleMapInstanceRef.current && window.google?.maps) {
      const map = googleMapInstanceRef.current;
      const googleMaps = window.google.maps;

      if (userMarkerRef.current) userMarkerRef.current.setMap(null);
      if (userCircleRef.current) userCircleRef.current.setMap(null);

      if (origin) {
        if (nearbyRadiusKm !== null) {
          userCircleRef.current = new googleMaps.Circle({
            map,
            center: { lat: origin.lat, lng: origin.lng },
            radius: nearbyRadiusKm * 1000,
            strokeColor: '#0d9488',
            strokeOpacity: 0.8,
            strokeWeight: 1.5,
            fillColor: '#14b8a6',
            fillOpacity: 0.08,
          });
        }

        userMarkerRef.current = new googleMaps.Marker({
          map,
          position: { lat: origin.lat, lng: origin.lng },
          title: userCoords ? 'Your Current Location' : 'Philippine Reference Point',
          icon: {
            path: googleMaps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: '#0d9488',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 3,
          },
          zIndex: 999,
        });
      }
    }
  }, [userCoords, nearbyRadiusKm]);

  // Render Pedestrian Route Polyline
  useEffect(() => {
    if (googleMapInstanceRef.current && window.google?.maps) {
      const map = googleMapInstanceRef.current;
      const googleMaps = window.google.maps;

      if (routePolylineRef.current) routePolylineRef.current.setMap(null);
      if (routeCasingRef.current) routeCasingRef.current.setMap(null);

      if (activeRoute && activeRoute.coordinates.length >= 2) {
        const path = activeRoute.coordinates.map((pt) => ({ lat: pt[0], lng: pt[1] }));

        routeCasingRef.current = new googleMaps.Polyline({
          map,
          path,
          strokeColor: '#0f172a',
          strokeOpacity: 0.45,
          strokeWeight: 7,
        });

        routePolylineRef.current = new googleMaps.Polyline({
          map,
          path,
          strokeColor: '#0284c7',
          strokeOpacity: 0.95,
          strokeWeight: 4,
        });

        const bounds = new googleMaps.LatLngBounds();
        path.forEach((p) => bounds.extend(p));
        map.fitBounds(bounds, { top: 70, right: 70, bottom: 70, left: 70 });
      }
    }

    if (leafletRouteRef.current && leafletMapRef.current) {
      leafletRouteRef.current.clearLayers();
      if (activeRoute && activeRoute.coordinates.length >= 2) {
        L.polyline(activeRoute.coordinates, {
          color: '#0f172a',
          weight: 7,
          opacity: 0.45,
        }).addTo(leafletRouteRef.current);

        const poly = L.polyline(activeRoute.coordinates, {
          color: '#0284c7',
          weight: 4,
          opacity: 0.95,
        }).addTo(leafletRouteRef.current);

        leafletMapRef.current.fitBounds(poly.getBounds(), { padding: [60, 60] });
      }
    }
  }, [activeRoute, useFallbackInteractiveMap]);

  // Draggable pin for "+ Add Location"
  useEffect(() => {
    if (!googleMapInstanceRef.current || !window.google?.maps) return;

    const map = googleMapInstanceRef.current;
    const googleMaps = window.google.maps;

    if (isAddingLocation && newPinCoords) {
      if (!newPinMarkerRef.current) {
        newPinMarkerRef.current = new googleMaps.Marker({
          map,
          position: { lat: newPinCoords.lat, lng: newPinCoords.lng },
          draggable: true,
          title: 'Drag to adjust place coordinates',
          icon: {
            path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z',
            fillColor: '#0d9488',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2,
            scale: 2,
            anchor: new googleMaps.Point(12, 24),
          },
          zIndex: 1200,
          animation: googleMaps.Animation.DROP,
        });

        newPinMarkerRef.current.addListener('dragend', (e: any) => {
          if (e.latLng) {
            onNewPinCoordsChange({ lat: e.latLng.lat(), lng: e.latLng.lng() });
          }
        });
      } else {
        newPinMarkerRef.current.setPosition({ lat: newPinCoords.lat, lng: newPinCoords.lng });
      }
    } else if (newPinMarkerRef.current) {
      newPinMarkerRef.current.setMap(null);
      newPinMarkerRef.current = null;
    }
  }, [isAddingLocation, newPinCoords]);

  // Street View Panorama activation
  useEffect(() => {
    if (!showStreetView || !streetViewContainerRef.current || !window.google?.maps) return;

    const target = selectedLocation || (locations.length > 0 ? locations[0] : null);
    if (!target) return;

    const googleMaps = window.google.maps;
    const panorama = new googleMaps.StreetViewPanorama(streetViewContainerRef.current, {
      position: { lat: target.lat, lng: target.lng },
      pov: { heading: 165, pitch: 0 },
      zoom: 1,
      addressControl: true,
      fullscreenControl: false,
    });

    streetViewPanoramaRef.current = panorama;
  }, [showStreetView, selectedLocation]);

  // GPS Locate
  const handleLocateMe = () => {
    if (!navigator.geolocation) {
      announce('Geolocation is not supported by your browser.');
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false);
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        onUserCoordsChange(coords);
        if (googleMapInstanceRef.current) {
          googleMapInstanceRef.current.panTo(coords);
          googleMapInstanceRef.current.setZoom(15);
        }
        if (leafletMapRef.current) {
          leafletMapRef.current.flyTo([coords.lat, coords.lng], 15);
        }
        announce('Centered on your GPS location.');
      },
      () => {
        setIsLocating(false);
        const coords = DEFAULT_CDO_CENTER;
        onUserCoordsChange(coords);
        if (googleMapInstanceRef.current) {
          googleMapInstanceRef.current.panTo(coords);
          googleMapInstanceRef.current.setZoom(15);
        }
        if (leafletMapRef.current) {
          leafletMapRef.current.flyTo([coords.lat, coords.lng], 15);
        }
        announce('Using Cagayan de Oro reference location.');
      },
      { timeout: 7000 }
    );
  };

  const handleRecenter = () => {
    const target = activeCity
      ? { lat: activeCity.lat, lng: activeCity.lng, zoom: activeCity.zoom }
      : { lat: DEFAULT_CDO_CENTER.lat, lng: DEFAULT_CDO_CENTER.lng, zoom: 14 };

    if (googleMapInstanceRef.current) {
      googleMapInstanceRef.current.panTo({ lat: target.lat, lng: target.lng });
      googleMapInstanceRef.current.setZoom(target.zoom);
    }
    if (leafletMapRef.current) {
      leafletMapRef.current.flyTo([target.lat, target.lng], target.zoom);
    }
  };

  // Top Left: City Badge & Mobile Quick Search/Filter Bar (Mobile-First)
  return (
    <div className="relative w-full h-full flex flex-col bg-slate-100 overflow-hidden select-none">
      {/* Google Maps Container */}
      <div
        ref={mapContainerRef}
        className={`w-full h-full min-h-[350px] ${useFallbackInteractiveMap ? 'hidden' : 'block'}`}
        tabIndex={0}
        aria-label="Google Maps Philippine Interactive Canvas"
      />

      {/* Interactive Fallback Map Container */}
      {useFallbackInteractiveMap && (
        <div
          ref={leafletContainerRef}
          className="w-full h-full min-h-[350px]"
          tabIndex={0}
          aria-label="Interactive Accessibility Map Canvas"
        />
      )}

      {/* Embedded Google Street View Overlay Panel */}
      {showStreetView && (
        <div className="absolute inset-x-4 top-16 bottom-20 z-[600] bg-black rounded-3xl shadow-2xl overflow-hidden border-2 border-slate-700 flex flex-col animate-scale-up">
          <div className="p-3 bg-slate-900/90 backdrop-blur-md text-white flex items-center justify-between px-4">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-bold">
                Google Street View · 360° Storefront Audit
              </span>
              {selectedLocation && (
                <span className="text-xs text-slate-400">• {selectedLocation.name}</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowStreetView(false)}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white transition-colors cursor-pointer"
            >
              Exit Street View
            </button>
          </div>
          {useFallbackInteractiveMap ? (
            <div className="flex-1 grid place-items-center p-6 text-center text-slate-300 text-xs">
              <div className="max-w-sm space-y-2">
                <p className="font-bold text-white text-sm">360° Street View requires a Google Maps API Key</p>
                <p>Add <code className="text-emerald-300 font-mono">VITE_GOOGLE_MAPS_API_KEY</code> to your <code className="font-mono">.env</code> file to enable live Google Street View panoramas.</p>
              </div>
            </div>
          ) : (
            <div ref={streetViewContainerRef} className="w-full flex-1" />
          )}
        </div>
      )}

      {/* Dismissible Google Maps Key Notice Banner */}
      {!hasApiKey && !dismissKeyNotice && (
        <div className="hidden md:block absolute top-16 left-4 z-[520] max-w-sm">
          <div className="p-2.5 bg-white/95 backdrop-blur-md rounded-2xl shadow-lg border border-amber-300 text-xs text-slate-800 flex items-start gap-2.5">
            <div className="w-7 h-7 rounded-xl bg-amber-100 text-amber-800 grid place-items-center shrink-0">
              <Key className="w-3.5 h-3.5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1 font-bold text-slate-900">
                <span>Mindanao locked + Places enabled</span>
                <button
                  type="button"
                  onClick={() => setDismissKeyNotice(true)}
                  className="text-slate-400 hover:text-slate-700 p-0.5 cursor-pointer"
                  aria-label="Dismiss notice"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">
                Interactive map active. Add <code className="bg-slate-100 px-1 rounded font-mono text-[10px]">VITE_GOOGLE_MAPS_API_KEY</code> in <code className="font-mono text-[10px]">.env</code> with Maps JS + Places API (New) for live establishment discovery.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Google Maps SDK Error Banner */}
      {googleLoadError && !dismissKeyNotice && (
        <div className="hidden md:block absolute top-16 left-4 z-[520] max-w-sm">
          <div className="p-2.5 bg-white/95 backdrop-blur-md rounded-2xl shadow-lg border border-rose-300 text-xs text-slate-800 flex items-start gap-2.5">
            <div className="w-7 h-7 rounded-xl bg-rose-100 text-rose-700 grid place-items-center shrink-0">
              <ShieldAlert className="w-3.5 h-3.5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between font-bold text-slate-900">
                <span>Google Maps Fallback Active</span>
                <button
                  type="button"
                  onClick={() => setDismissKeyNotice(true)}
                  className="text-slate-400 hover:text-slate-700 p-0.5 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">{googleLoadError}</p>
            </div>
          </div>
        </div>
      )}

      {/* Non-blocking Places Notice */}
      {placesNotice && (
        <div className="absolute top-16 left-4 z-[520] max-w-sm">
          <div className="p-2.5 bg-white/95 backdrop-blur-md rounded-2xl shadow-lg border border-amber-300 text-xs text-slate-800 flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <p className="text-[11px] text-slate-700 flex-1">{placesNotice}</p>
            <button
              type="button"
              onClick={() => setPlacesNotice(null)}
              className="text-slate-400 hover:text-slate-700 cursor-pointer"
              aria-label="Dismiss Places notice"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Top Left: Mobile Menu Trigger + City Badge (Mobile + Desktop unified, non-overlapping) */}
      <div className="absolute top-3 left-3 sm:top-4 sm:left-4 z-[450] flex items-center gap-1.5 select-none max-w-[calc(100%-180px)]">
        {onOpenMobileMenu && (
          <button
            type="button"
            onClick={onOpenMobileMenu}
            className="md:hidden w-10 h-10 rounded-2xl bg-white/95 backdrop-blur-md border border-slate-200/90 shadow-sm text-slate-800 hover:bg-slate-50 active:scale-95 transition-all grid place-items-center shrink-0 cursor-pointer"
            title="Open Accessibility Settings & Menu"
            aria-label="Open Accessibility Settings & Menu"
          >
            <Menu className="w-4 h-4" />
          </button>
        )}
        <div className="inline-flex items-center gap-1.5 sm:gap-2 px-3 py-2 rounded-2xl bg-white/95 backdrop-blur-md border border-slate-200/90 shadow-sm min-w-0">
          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
          <span className="text-xs font-bold text-slate-800 truncate">{activeCity.name}</span>
          <span className="text-slate-300">•</span>
          <span className="text-xs text-slate-600 font-semibold shrink-0">{locations.length}</span>
          <span className="hidden sm:inline text-slate-300">•</span>
          <span className="hidden sm:inline text-[10px] font-bold uppercase tracking-wider text-teal-700 bg-teal-50 px-1.5 py-0.2 rounded border border-teal-200/60">
            Mindanao · Tap any place to rate
          </span>
        </div>
      </div>

      {/* POI Loading Toast */}
      {poiLoadingLabel && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[520] px-4 py-2 rounded-full bg-slate-900 text-white text-xs font-bold shadow-lg">
          {poiLoadingLabel}
        </div>
      )}

      {/* Top Center / Below Header: Active Route Banner */}
      {activeRoute && (
        <div className="absolute top-14 sm:top-4 left-3 right-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 z-[460] pointer-events-auto">
          <div className="px-3.5 py-1.5 rounded-full bg-slate-900 text-white text-xs font-medium shadow-lg flex items-center justify-between sm:justify-center gap-2.5 max-w-md mx-auto">
            <div className="flex items-center gap-2 truncate">
              <Navigation className="w-3.5 h-3.5 text-teal-400 shrink-0" />
              <span className="truncate">
                <b>Step-Free Route: {activeRoute.distanceKm} km</b> (~{activeRoute.durationMinutes} min)
              </span>
            </div>
            <button
              type="button"
              onClick={onClearRoute}
              className="p-0.5 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer shrink-0"
              title="Clear Route"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Top Right: Controls Pill (Map Style, Street View, Radar, Locate — 40px+ touch targets for mobile accessibility) */}
      <div className="absolute top-3 right-3 sm:top-4 sm:right-4 z-[450] flex items-center gap-1.5">
        <div className="flex items-center gap-1 p-1 bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200/90 shadow-sm">
          {/* Map Type Switcher */}
          <div className="relative">
            <button
              type="button"
              aria-expanded={showLayerPicker}
              onClick={() => {
                setShowLayerPicker(!showLayerPicker);
                setShowRadiusPicker(false);
              }}
              className={`w-9 h-9 rounded-xl grid place-items-center text-slate-700 hover:bg-slate-100 active:scale-95 transition-all cursor-pointer ${
                showLayerPicker ? 'bg-teal-50 text-teal-800 font-bold' : ''
              }`}
              title="Map Styles (Roadmap, Satellite, Terrain)"
              aria-label="Map Styles"
            >
              <Layers className="w-4 h-4" />
            </button>

            {showLayerPicker && (
              <div className="absolute top-11 right-0 w-52 bg-white rounded-xl shadow-xl border border-slate-200 p-1.5 z-[600] space-y-0.5 animate-scale-up">
                <span className="block px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Google Map Type
                </span>
                {GOOGLE_MAP_STYLES.map((style) => {
                  const isActive = mapStyle === style.id;
                  return (
                    <button
                      key={style.id}
                      type="button"
                      onClick={() => {
                        setMapStyle(style.id);
                        setShowLayerPicker(false);
                      }}
                      className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center justify-between text-left transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-teal-50 text-teal-900 font-semibold'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <div>
                        <div className="font-semibold text-slate-900">{style.label}</div>
                        <div className="text-[10px] text-slate-500">{style.desc}</div>
                      </div>
                      {isActive && <Check className="w-3.5 h-3.5 text-teal-600 shrink-0 ml-1" />}
                    </button>
                  );
                })}

                <div className="my-1 h-px bg-slate-200" />
                <button
                  type="button"
                  role="switch"
                  aria-checked={showEstablishments}
                  onClick={() => setShowEstablishments(!showEstablishments)}
                  className={`w-full px-2.5 py-2 rounded-lg text-xs font-bold flex items-center justify-between text-left transition-colors cursor-pointer ${
                    showEstablishments
                      ? 'bg-sky-50 text-sky-900'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <div>
                    <div>Establishments</div>
                    <div className="text-[10px] font-normal text-slate-500">
                      Highlight Mindanao places to rate
                    </div>
                  </div>
                  <span
                    className={`w-8 h-4.5 rounded-full p-0.5 transition-colors flex items-center ${
                      showEstablishments ? 'bg-sky-600 justify-end' : 'bg-slate-300 justify-start'
                    }`}
                  >
                    <span className="w-3.5 h-3.5 rounded-full bg-white shadow-xs" />
                  </span>
                </button>
              </div>
            )}
          </div>

          {/* Google Street View Toggle Button */}
          <button
            type="button"
            onClick={() => setShowStreetView(!showStreetView)}
            className={`p-2 rounded-lg transition-colors cursor-pointer ${
              showStreetView ? 'bg-amber-100 text-amber-900' : 'text-slate-700 hover:bg-slate-100'
            }`}
            title="Google Street View (360° Entrance Audit)"
            aria-label="Toggle Google Street View"
          >
            <Eye className="w-4 h-4" />
          </button>

          {/* Proximity Radar */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowRadiusPicker(!showRadiusPicker);
                setShowLayerPicker(false);
              }}
              className={`p-2 rounded-lg transition-colors cursor-pointer ${
                nearbyRadiusKm !== null
                  ? 'bg-teal-600 text-white'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
              title="Filter nearby places by radius"
              aria-label="Filter nearby places by radius"
            >
              <Radar className="w-4 h-4" />
            </button>

            {showRadiusPicker && (
              <div className="absolute top-11 right-0 w-44 bg-white rounded-xl shadow-xl border border-slate-200 p-1.5 z-[600] space-y-0.5 animate-scale-up">
                <span className="block px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Nearby Radius
                </span>
                {[
                  { label: 'Off (All distances)', val: null },
                  { label: 'Within 3 km', val: 3 },
                  { label: 'Within 5 km', val: 5 },
                  { label: 'Within 10 km', val: 10 },
                  { label: 'Within 25 km', val: 25 },
                ].map((opt) => (
                  <button
                    key={String(opt.val)}
                    type="button"
                    onClick={() => {
                      onNearbyRadiusChange(opt.val);
                      setShowRadiusPicker(false);
                    }}
                    className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center justify-between text-left transition-colors cursor-pointer ${
                      nearbyRadiusKm === opt.val
                        ? 'bg-teal-50 text-teal-900 font-semibold'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span>{opt.label}</span>
                    {nearbyRadiusKm === opt.val && <Check className="w-3.5 h-3.5 text-teal-600" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* GPS Locate Me */}
          <button
            type="button"
            onClick={handleLocateMe}
            className="p-2 rounded-lg text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            title="Locate my position (GPS)"
            aria-label="Locate my position"
          >
            <Locate className={`w-4 h-4 ${isLocating ? 'animate-spin text-teal-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* Right: Zoom & Recenter Controls */}
      <div className="absolute top-16 sm:top-20 right-3 sm:right-4 z-[440] flex flex-col gap-1 p-1 bg-white/95 backdrop-blur-md rounded-xl border border-slate-200/80 shadow-xs">
        <button
          type="button"
          onClick={() => {
            if (googleMapInstanceRef.current) {
              googleMapInstanceRef.current.setZoom(googleMapInstanceRef.current.getZoom() + 1);
            }
            if (leafletMapRef.current) {
              leafletMapRef.current.zoomIn();
            }
          }}
          className="p-2 rounded-lg text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          title="Zoom in"
          aria-label="Zoom in"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => {
            if (googleMapInstanceRef.current) {
              googleMapInstanceRef.current.setZoom(googleMapInstanceRef.current.getZoom() - 1);
            }
            if (leafletMapRef.current) {
              leafletMapRef.current.zoomOut();
            }
          }}
          className="p-2 rounded-lg text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          title="Zoom out"
          aria-label="Zoom out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <div className="w-full h-px bg-slate-200 my-0.5" />
        <button
          type="button"
          onClick={handleRecenter}
          className="p-2 rounded-lg text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          title="Recenter to active region"
          aria-label="Recenter to active region"
        >
          <Crosshair className="w-4 h-4" />
        </button>
      </div>

      {/* Compact Legend & Powered by Google Attribution */}
      <div className="hidden md:flex absolute bottom-3 left-3 z-[430] items-center gap-2.5 px-3 py-1.5 rounded-full bg-white/95 backdrop-blur-md border border-slate-200/90 shadow-xs text-[10px] font-semibold text-slate-600">
        <span className="inline-flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
          4★+ Accessible
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
          Partial
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-600" />
          Barrier
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-white border-2 border-sky-600" />
          Unrated (Tap to Rate)
        </span>
        <span className="text-slate-300">|</span>
        <span className="text-slate-500 font-bold">Powered by Google</span>
      </div>

      {/* Floating Card at Bottom (Mobile & Desktop — Rated Pin or Unrated Google Establishment) */}
      {showSummaryCard && (selectedLocation || selectedUnratedEst) && (
        <MapFloatingCard
          location={
            selectedLocation ||
            (selectedUnratedEst
              ? {
                  id: `google-${selectedUnratedEst.googlePlaceId}`,
                  googlePlaceId: selectedUnratedEst.googlePlaceId,
                  source: 'google',
                  name: selectedUnratedEst.name,
                  category: selectedUnratedEst.category,
                  address: selectedUnratedEst.address,
                  lat: selectedUnratedEst.lat,
                  lng: selectedUnratedEst.lng,
                  averageRating: 0,
                  totalReviews: 0,
                  tags: [],
                  photos: [],
                  reviews: [],
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                }
              : null)
          }
          onOpenDetails={onOpenDetails}
          onRatePlace={onRatePlace}
          onClose={() => {
            setShowSummaryCard(false);
            setSelectedUnratedEst(null);
          }}
          userCoords={userCoords}
          activeRoute={activeRoute}
          isRoutingLoading={isRoutingLoading}
          onToggleRoutePreview={onToggleRoutePreview}
        />
      )}
    </div>
  );
};
