/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { A11yProvider, useA11y } from './context/A11yContext';
import { SidebarRail, AppViewMode } from './components/SidebarRail';
import { PlacesPanel, PlacesTab } from './components/PlacesPanel';
import { MapView, ClickedGooglePoi } from './components/MapView';
import { LocationDetailDrawer } from './components/LocationDetailDrawer';
import { AddLocationModal } from './components/AddLocationModal';
import {
  RatePlaceSheet,
  RatePlaceTarget,
  RatePlaceSubmission,
} from './components/RatePlaceSheet';
import { AIStorefrontModal } from './components/AIStorefrontModal';
import { AuthGatePage } from './components/AuthGatePage';
import { ProfileHubView } from './components/ProfileHubView';
import { CommunityView } from './components/CommunityView';
import { Modal } from './components/ui/Modal';
import {
  LocationPin,
  CategoryType,
  Review,
  StorefrontAnalysisResult,
  LocationTag,
  ClaimedOwnerInfo,
  OwnerResponse,
} from './types/accessibility';
import {
  AuthUser,
  getCurrentUser,
  setCurrentUserSession,
  getSavedPlaceIds,
  toggleSavedPlaceId,
  loadLocations,
  saveLocations,
  getStoredUserVotes,
  getStoredVoteWeight,
  saveStoredUserVote,
  calculateDistanceKm,
} from './utils/storage';
import {
  CityPreset,
  MINDANAO_CITY_PRESETS,
  ACCESSIBILITY_QUICK_FILTERS,
  RoutePreviewResult,
  fetchAccessibleRoute,
} from './utils/routingAndSpatial';
import { calculateGoogleWalkingRoute } from './utils/googleMapsLoader';
import { DiscoveredEstablishment } from './utils/mindanaoPlaces';
import { getVoteWeight, hasPermission } from './utils/rbac';
import {
  fetchLocations,
  persistLocation,
  resetLocationsToSeed,
} from './services/locationService';
import {
  MapPin,
  Plus,
  List,
  Users,
  User,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';

function AccessMapApp() {
  const { announce } = useA11y();

  // Signed-in User State (supports AuthGatePage, LoginPage, and static signin.html / signup.html sessions)
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => getCurrentUser());

  // Active primary view ('map' | 'community' | 'profile')
  const [activeView, setActiveView] = useState<AppViewMode>('map');

  // Saved / Bookmarked Place IDs for current user
  const [savedPlaceIds, setSavedPlaceIds] = useState<string[]>(() => {
    const user = getCurrentUser();
    return user ? getSavedPlaceIds(user.id) : [];
  });

  useEffect(() => {
    if (currentUser) {
      setSavedPlaceIds(getSavedPlaceIds(currentUser.id));
    } else {
      setSavedPlaceIds([]);
    }
  }, [currentUser?.id]);

  const handleToggleSavePlace = (locationId: string) => {
    if (!currentUser) return;
    const next = toggleSavedPlaceId(currentUser.id, locationId);
    setSavedPlaceIds(next);
    announce(
      next.includes(locationId)
        ? 'Place saved to your Profile.'
        : 'Place removed from Saved Places.'
    );
  };

  // Core locations state
  const [locations, setLocations] = useState<LocationPin[]>(() => {
    const loaded = loadLocations();
    const storedVotes = getStoredUserVotes();
    return loaded.map((loc) => ({
      ...loc,
      tags: loc.tags.map((tag) => {
        const key = `${loc.id}__${tag.name}`;
        return {
          ...tag,
          userVoted: storedVotes[key] || undefined,
        };
      }),
    }));
  });

  // Active Mindanao Region Preset (defaults to Cagayan de Oro at zoom 13)
  const [activeCity, setActiveCity] = useState<CityPreset>(MINDANAO_CITY_PRESETS[1]);

  // Selected Location
  const [selectedLocation, setSelectedLocation] = useState<LocationPin | null>(null);

  // Quick Rate Place Sheet target (click-to-rate without manual address typing)
  const [ratePlaceTarget, setRatePlaceTarget] = useState<RatePlaceTarget | null>(null);

  // Detail Drawer Visibility
  const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState(false);

  // Collapsible Places Panel (opens on pin click or via sidebar/floating button)
  const [isPlacesPanelOpen, setIsPlacesPanelOpen] = useState<boolean>(() => {
    return typeof window !== 'undefined' ? window.innerWidth >= 768 : false;
  });

  // Mobile Navigation Drawer & Quick Guide Modal
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const [isHowItWorksOpen, setIsHowItWorksOpen] = useState<boolean>(false);

  // Unified Filter State (shared across PlacesPanel, AI Agent, and MapView)
  const [activeStatusTab, setActiveStatusTab] = useState<PlacesTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CategoryType | 'All'>('All');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [activeA11yFilters, setActiveA11yFilters] = useState<string[]>([]);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [nearbyRadiusKm, setNearbyRadiusKm] = useState<number | null>(null);
  const [aiMatchedIds, setAiMatchedIds] = useState<string[]>([]);

  // Route Preview state (Google Directions API with OSRM/Geodesic fallback)
  const [activeRoute, setActiveRoute] = useState<RoutePreviewResult | null>(null);
  const [isRoutingLoading, setIsRoutingLoading] = useState(false);

  // Add Location Flow State
  const [isAddingLocation, setIsAddingLocation] = useState(false);
  const [newPinCoords, setNewPinCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // AI Storefront Analyzer State
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [aiTargetLocation, setAiTargetLocation] = useState<LocationPin | null>(null);

  // Pre-filled data for new pin from AI Analyzer or direct Google Maps POI click
  const [aiNewPinData, setAiNewPinData] = useState<{
    name?: string;
    address?: string;
    category?: CategoryType;
    tags: string[];
    photoUrl?: string;
    summary?: string;
    barriers?: string[];
  } | null>(null);

  // Direct Google Maps Establishment Click -> select existing pin if rated, otherwise let MapFloatingCard show unrated place
  const handleSelectGooglePoi = (poi: ClickedGooglePoi) => {
    const existing = locations.find(
      (loc) =>
        (poi.googlePlaceId && loc.googlePlaceId === poi.googlePlaceId) ||
        calculateDistanceKm(loc.lat, loc.lng, poi.lat, poi.lng) <= 0.06 ||
        loc.name.trim().toLowerCase() === poi.name.trim().toLowerCase()
    );

    if (existing) {
      setSelectedLocation(existing);
      announce(`Selected ${existing.name}. Tap Rate this place or Details.`);
      return;
    }

    setSelectedLocation(null);
    announce(`Selected ${poi.name}. Tap Rate this place to add the first accessibility rating.`);
  };

  // Search bar selection of a live Google Place in Mindanao
  const handleSelectGoogleSearchPlace = (est: DiscoveredEstablishment) => {
    const existing = locations.find(
      (loc) =>
        loc.googlePlaceId === est.googlePlaceId ||
        calculateDistanceKm(loc.lat, loc.lng, est.lat, est.lng) <= 0.06
    );

    if (
      activeCity.id !== 'mindanao' &&
      calculateDistanceKm(activeCity.lat, activeCity.lng, est.lat, est.lng) > 45
    ) {
      setActiveCity(MINDANAO_CITY_PRESETS[0]);
    }

    if (existing) {
      setSelectedLocation(existing);
      announce(`Focused ${existing.name} on the map.`);
      return;
    }

    const now = new Date().toISOString();
    setSelectedLocation({
      id: `google-${est.googlePlaceId}`,
      googlePlaceId: est.googlePlaceId,
      source: 'google',
      name: est.name,
      category: est.category,
      address: est.address,
      lat: est.lat,
      lng: est.lng,
      averageRating: 0,
      totalReviews: 0,
      tags: [],
      photos: [],
      reviews: [],
      createdAt: now,
      updatedAt: now,
    });
    announce(`Focused ${est.name} on the map. Tap Rate this place to rate it.`);
  };

  // Open compact click-to-rate sheet from MapFloatingCard
  const handleOpenRateSheet = (loc: LocationPin) => {
    if (!hasPermission(currentUser, 'submit_report')) {
      announce('Please sign in with a verified account to rate establishments.');
      return;
    }
    const existsInStore = locations.some(
      (p) => p.id === loc.id || (loc.googlePlaceId && p.googlePlaceId === loc.googlePlaceId)
    );
    setRatePlaceTarget({
      existingPinId: existsInStore ? loc.id : undefined,
      googlePlaceId: loc.googlePlaceId,
      source: loc.source || (loc.googlePlaceId ? 'google' : 'custom'),
      name: loc.name,
      address: loc.address,
      category: loc.category,
      lat: loc.lat,
      lng: loc.lng,
    });
  };

  // Submit rating from RatePlaceSheet -> auto-creates LocationPin for unrated Google establishments or appends review
  const handleRatePlace = (submission: RatePlaceSubmission) => {
    if (!currentUser) return;
    const { target, rating, selectedTags: chosenTags, tagRatings, note } = submission;
    const now = new Date().toISOString();
    const today = now.split('T')[0];

    const newReview: Review = {
      id: `rev-${Date.now()}`,
      authorId: currentUser.id,
      authorName: currentUser.name,
      rating,
      comment: note || 'Submitted via quick accessibility rating.',
      date: today,
      createdAtMs: Date.now(),
      tagRatings: Object.keys(tagRatings).length > 0 ? tagRatings : undefined,
      status: 'published',
    };

    const existing = locations.find(
      (loc) =>
        (target.googlePlaceId && loc.googlePlaceId === target.googlePlaceId) ||
        (target.existingPinId && loc.id === target.existingPinId)
    );

    if (existing) {
      const updatedReviews = [newReview, ...existing.reviews];
      const published = updatedReviews.filter((r) => (r.status ?? 'published') === 'published');
      let weightedSum = 0;
      let totalWeight = 0;
      published.forEach((r) => {
        const w = r.onSiteVerified ? 1.5 : 1;
        weightedSum += r.rating * w;
        totalWeight += w;
      });
      const newAvg =
        totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 10) / 10 : rating;

      const mergedTags: LocationTag[] = existing.tags.map((t) => {
        if (!chosenTags.includes(t.name)) return t;
        const incomingRating = tagRatings[t.name] || rating;
        const nextCount = t.ratingCount + 1;
        return {
          ...t,
          confirmations: t.confirmations + 1,
          rating: Math.round(((t.rating * t.ratingCount + incomingRating) / nextCount) * 10) / 10,
          ratingCount: nextCount,
        };
      });

      const existingTagNames = new Set(existing.tags.map((t) => t.name));
      chosenTags.forEach((tagName) => {
        if (!existingTagNames.has(tagName)) {
          mergedTags.push({
            name: tagName,
            rating: tagRatings[tagName] || rating,
            ratingCount: 1,
            confirmations: 1,
            disputes: 0,
          });
        }
      });

      const updatedPin: LocationPin = {
        ...existing,
        googlePlaceId: existing.googlePlaceId || target.googlePlaceId,
        averageRating: newAvg,
        totalReviews: published.length,
        tags: mergedTags,
        reviews: updatedReviews,
        updatedAt: now,
      };

      updateAndSaveLocations(
        (prev) => prev.map((loc) => (loc.id === existing.id ? updatedPin : loc)),
        existing.id
      );
      setSelectedLocation(updatedPin);
      announce(`Saved your ${rating}-star accessibility rating for ${updatedPin.name}.`);
      return;
    }

    const createdPin: LocationPin = {
      id: target.googlePlaceId ? `google-${target.googlePlaceId}` : `loc-${Date.now()}`,
      googlePlaceId: target.googlePlaceId,
      source: target.source,
      name: target.name,
      category: target.category,
      address: target.address,
      lat: target.lat,
      lng: target.lng,
      averageRating: rating,
      totalReviews: 1,
      tags: chosenTags.map((tagName) => ({
        name: tagName,
        rating: tagRatings[tagName] || rating,
        ratingCount: 1,
        confirmations: 1,
        disputes: 0,
      })),
      photos: [],
      reviews: [newReview],
      createdAt: now,
      updatedAt: now,
    };

    updateAndSaveLocations((prev) => [createdPin, ...prev], createdPin.id);
    setSelectedLocation(createdPin);
    announce(`Added and rated ${createdPin.name} (${rating} stars).`);
  };

  // Persist updates locally and to Firebase Firestore
  const updateAndSaveLocations = (
    updater: (prev: LocationPin[]) => LocationPin[],
    affectedPinId?: string
  ) => {
    setLocations((prev) => {
      const next = updater(prev);
      saveLocations(next);
      if (affectedPinId) {
        const pin = next.find((p) => p.id === affectedPinId);
        if (pin) persistLocation(pin);
      }
      return next;
    });
  };

  // Sync locations from Firestore on initial mount
  useEffect(() => {
    let isMounted = true;
    fetchLocations().then(({ locations: loaded, source }) => {
      if (!isMounted) return;
      setLocations(loaded);
      if (source === 'firestore') {
        announce('Connected to Firebase Firestore cloud database.');
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  // Sync selectedLocation if it was updated in locations array
  useEffect(() => {
    if (selectedLocation) {
      const fresh = locations.find((l) => l.id === selectedLocation.id);
      if (fresh) setSelectedLocation(fresh);
    }
  }, [locations]);

  // Toggle Accessible Route Preview (Google Walking Directions -> OSRM Fallback)
  const handleToggleRoute = async (loc: LocationPin) => {
    if (activeRoute && selectedLocation?.id === loc.id) {
      setActiveRoute(null);
      announce('Route preview cleared.');
      return;
    }

    const origin = userCoords || { lat: activeCity.lat, lng: activeCity.lng };
    setIsRoutingLoading(true);
    announce(`Calculating accessible step-free route to ${loc.name}...`);
    try {
      const result = await calculateGoogleWalkingRoute(origin, { lat: loc.lat, lng: loc.lng });
      setActiveRoute(result);
      setSelectedLocation(loc);
      announce(
        `Google walking route ready: ${result.distanceKm} km, ~${result.durationMinutes} min mobility transit.`
      );
    } catch {
      const fallback = await fetchAccessibleRoute(origin.lat, origin.lng, loc.lat, loc.lng);
      setActiveRoute(fallback);
      setSelectedLocation(loc);
      announce(`Accessible route ready: ${fallback.distanceKm} km, ~${fallback.durationMinutes} min est.`);
    } finally {
      setIsRoutingLoading(false);
    }
  };

  // Community Voting (Confirm / Dispute) — RBAC vote weight (2x for PWD/Caregiver/Moderator/Admin, 1x for Contributors, 0 for Guests)
  const handleVoteTag = (pinId: string, tagName: string, vote: 'confirm' | 'dispute') => {
    if (!hasPermission(currentUser, 'vote_tags')) {
      announce('Please sign in with a verified account to vote on accessibility tags.');
      return;
    }
    const newWeight = getVoteWeight(currentUser);
    const prevWeight = getStoredVoteWeight(pinId, tagName);

    updateAndSaveLocations((prev) =>
      prev.map((loc) => {
        if (loc.id !== pinId) return loc;
        return {
          ...loc,
          tags: loc.tags.map((tag) => {
            if (tag.name !== tagName) return tag;

            let conf = tag.confirmations;
            let disp = tag.disputes;
            const prevVote = tag.userVoted;

            if (prevVote === vote) {
              if (vote === 'confirm') conf = Math.max(0, conf - prevWeight);
              if (vote === 'dispute') disp = Math.max(0, disp - prevWeight);
              saveStoredUserVote(pinId, tagName, null);
              return { ...tag, confirmations: conf, disputes: disp, userVoted: undefined };
            }

            if (prevVote === 'confirm') conf = Math.max(0, conf - prevWeight);
            if (prevVote === 'dispute') disp = Math.max(0, disp - prevWeight);

            if (vote === 'confirm') conf += newWeight;
            if (vote === 'dispute') disp += newWeight;

            saveStoredUserVote(pinId, tagName, vote, newWeight);
            return { ...tag, confirmations: conf, disputes: disp, userVoted: vote };
          }),
        };
      }),
      pinId
    );
  };

  // Add or Edit Structured Accessibility Report (1 active report per user per establishment)
  const handleAddOrUpdateReview = (
    pinId: string,
    reviewInput: Omit<Review, 'id' | 'date'>,
    existingReviewId?: string,
    triggersCircuitBreaker = false
  ) => {
    const today = new Date().toISOString().split('T')[0];

    updateAndSaveLocations((prev) =>
      prev.map((loc) => {
        if (loc.id !== pinId) return loc;

        let updatedReviews: Review[];
        if (existingReviewId) {
          updatedReviews = loc.reviews.map((r) =>
            r.id === existingReviewId
              ? { ...r, ...reviewInput, date: today }
              : r
          );
        } else {
          const newReview: Review = {
            ...reviewInput,
            id: `rev-${Date.now()}`,
            date: today,
          };
          updatedReviews = [newReview, ...loc.reviews];
        }

        // Recalculate weighted average using only published reports (On-Site Verified gets 1.5x weight)
        const published = updatedReviews.filter((r) => (r.status ?? 'published') === 'published');
        let weightedSum = 0;
        let totalWeight = 0;
        published.forEach((r) => {
          const w = r.onSiteVerified ? 1.5 : 1;
          weightedSum += r.rating * w;
          totalWeight += w;
        });
        const newAvg =
          totalWeight > 0
            ? Math.round((weightedSum / totalWeight) * 10) / 10
            : loc.averageRating;

        return {
          ...loc,
          totalReviews: published.length,
          averageRating: newAvg,
          reviews: updatedReviews,
          brigadeFrozen: triggersCircuitBreaker ? true : loc.brigadeFrozen,
          updatedAt: new Date().toISOString(),
        };
      }),
      pinId
    );
  };

  // Pillar 4: "Still Accurate?" Confirmation Voting on Reviews
  const handleVoteReview = (
    pinId: string,
    reviewId: string,
    vote: 'confirm' | 'inaccurate'
  ) => {
    updateAndSaveLocations((prev) =>
      prev.map((loc) => {
        if (loc.id !== pinId) return loc;
        return {
          ...loc,
          reviews: loc.reviews.map((r) => {
            if (r.id !== reviewId) return r;
            const prevVote = r.userVote;
            let conf = r.confirmations || 0;
            let flags = r.inaccurateFlags || 0;
            if (prevVote === vote) {
              if (vote === 'confirm') conf = Math.max(0, conf - 1);
              if (vote === 'inaccurate') flags = Math.max(0, flags - 1);
              return { ...r, confirmations: conf, inaccurateFlags: flags, userVote: undefined };
            }
            if (prevVote === 'confirm') conf = Math.max(0, conf - 1);
            if (prevVote === 'inaccurate') flags = Math.max(0, flags - 1);
            if (vote === 'confirm') conf += 1;
            if (vote === 'inaccurate') flags += 1;
            return { ...r, confirmations: conf, inaccurateFlags: flags, userVote: vote };
          }),
        };
      }),
      pinId
    );
  };

  // Pillar 5 & Layer 2: Quarantine Review as 'under_review'
  const handleQuarantineReview = (pinId: string, reviewId: string, reason: string) => {
    updateAndSaveLocations((prev) =>
      prev.map((loc) => {
        if (loc.id !== pinId) return loc;
        return {
          ...loc,
          reviews: loc.reviews.map((r) =>
            r.id === reviewId ? { ...r, status: 'under_review', statusReason: reason } : r
          ),
        };
      }),
      pinId
    );
  };

  // Pillar 5: Verified Business Owner Claim & Official Pinned Response
  const handleClaimOwner = (pinId: string, ownerInfo: ClaimedOwnerInfo) => {
    updateAndSaveLocations(
      (prev) =>
        prev.map((loc) => (loc.id === pinId ? { ...loc, claimedOwner: ownerInfo } : loc)),
      pinId
    );
  };

  const handleOwnerReply = (pinId: string, reviewId: string, response: OwnerResponse) => {
    updateAndSaveLocations((prev) =>
      prev.map((loc) => {
        if (loc.id !== pinId) return loc;
        return {
          ...loc,
          reviews: loc.reviews.map((r) =>
            r.id === reviewId ? { ...r, ownerResponse: response } : r
          ),
        };
      }),
      pinId
    );
  };

  // Layer 3 & 4: Human Moderator Approve / Remove
  const handleModerateReview = (
    pinId: string,
    reviewId: string,
    newStatus: 'published' | 'removed'
  ) => {
    updateAndSaveLocations((prev) =>
      prev.map((loc) => {
        if (loc.id !== pinId) return loc;
        return {
          ...loc,
          brigadeFrozen: newStatus === 'published' ? false : loc.brigadeFrozen,
          reviews: loc.reviews.map((r) =>
            r.id === reviewId ? { ...r, status: newStatus } : r
          ),
        };
      }),
      pinId
    );
  };

  // Apply AI Storefront tags to an existing location
  const handleApplyTagsToLocation = (
    locationId: string,
    acceptedTags: string[],
    analysis: StorefrontAnalysisResult
  ) => {
    updateAndSaveLocations((prev) =>
      prev.map((loc) => {
        if (loc.id !== locationId) return loc;

        const existingTagNames = new Set(loc.tags.map((t) => t.name));
        const newTags: LocationTag[] = acceptedTags
          .filter((tName) => !existingTagNames.has(tName))
          .map((tName) => ({
            name: tName,
            rating: 4.5,
            ratingCount: 1,
            confirmations: 1,
            disputes: 0,
            isAiSuggested: true,
          }));

        const updatedPhotos =
          analysis.imagePreviewUrl && !loc.photos.includes(analysis.imagePreviewUrl)
            ? [analysis.imagePreviewUrl, ...loc.photos]
            : loc.photos;

        return {
          ...loc,
          tags: [...loc.tags, ...newTags],
          photos: updatedPhotos,
          aiSummary: analysis.summary,
          aiBarriers: analysis.possible_barriers,
          updatedAt: new Date().toISOString(),
        };
      }),
      locationId
    );
  };

  const handleStartNewPinFromAnalysis = (
    acceptedTags: string[],
    analysis: StorefrontAnalysisResult,
    photoDataUrl: string
  ) => {
    setAiNewPinData({
      tags: acceptedTags,
      photoUrl: photoDataUrl,
      summary: analysis.summary,
      barriers: analysis.possible_barriers,
    });
    setNewPinCoords({ lat: activeCity.lat, lng: activeCity.lng });
    setIsAddModalOpen(true);
  };

  const handleSaveLocation = (newPin: LocationPin) => {
    updateAndSaveLocations((prev) => [newPin, ...prev], newPin.id);
    setSelectedLocation(newPin);
    setIsAddingLocation(false);
    setNewPinCoords(null);
    setAiNewPinData(null);
  };

  // Reset to seed data (RBAC: Admin only)
  const handleResetData = async () => {
    if (!hasPermission(currentUser, 'reset_seed_data')) {
      announce('Only Platform Admins can reset the seed database.');
      return;
    }
    if (window.confirm('Reset all TanAW pins to initial Mindanao seed places?')) {
      const reset = await resetLocationsToSeed();
      setLocations(reset);
      setSelectedLocation(null);
      setActiveRoute(null);
      setAiMatchedIds([]);
      announce('Database reset to Mindanao seed data.');
    }
  };

  const handleResetAllFilters = () => {
    setActiveStatusTab('all');
    setSearchQuery('');
    setSelectedCategory('All');
    setSelectedTags([]);
    setActiveA11yFilters([]);
    setNearbyRadiusKm(null);
    setAiMatchedIds([]);
    announce('All filters cleared.');
  };

  // Unified Filter Pipeline
  const filteredLocations = useMemo(() => {
    let result = [...locations];

    // AI Agent semantic filter
    if (aiMatchedIds.length > 0) {
      result = result.filter((loc) => aiMatchedIds.includes(loc.id));
    }

    // Mindanao City Preset filter (when a specific city is chosen)
    if (activeCity.id !== 'mindanao') {
      result = result.filter((loc) => {
        const dist = calculateDistanceKm(activeCity.lat, activeCity.lng, loc.lat, loc.lng);
        if (dist <= 45) return true;
        const addr = loc.address.toLowerCase();
        return (
          addr.includes(activeCity.name.toLowerCase()) ||
          addr.includes(activeCity.shortName.toLowerCase())
        );
      });
    }

    return result.filter((loc) => {
      if (activeStatusTab === 'verified') {
        const isVerified =
          loc.tags.some((t) => t.confirmations >= 2 && t.confirmations > t.disputes) &&
          loc.averageRating >= 4.0;
        if (!isVerified) return false;
      } else if (activeStatusTab === 'barriers') {
        const hasBarriers =
          (loc.aiBarriers && loc.aiBarriers.length > 0) ||
          (loc.averageRating > 0 && loc.averageRating < 3.0);
        if (!hasBarriers) return false;
      }

      if (selectedCategory !== 'All' && loc.category !== selectedCategory) {
        return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matches =
          loc.name.toLowerCase().includes(q) ||
          loc.address.toLowerCase().includes(q) ||
          loc.category.toLowerCase().includes(q) ||
          loc.tags.some((t) => t.name.toLowerCase().includes(q));
        if (!matches) return false;
      }

      if (selectedTags.length > 0) {
        const locTagNames = loc.tags.map((t) => t.name);
        if (!selectedTags.every((t) => locTagNames.includes(t))) {
          return false;
        }
      }

      if (activeA11yFilters.length > 0) {
        for (const filterId of activeA11yFilters) {
          const def = ACCESSIBILITY_QUICK_FILTERS.find((f) => f.id === filterId);
          if (!def) continue;
          if (def.minRating && loc.averageRating < def.minRating) return false;
          if (
            def.tagKeyword &&
            !loc.tags.some(
              (t) =>
                t.name.toLowerCase().includes(def.tagKeyword!) &&
                t.confirmations >= t.disputes
            )
          ) {
            return false;
          }
        }
      }

      if (nearbyRadiusKm !== null) {
        const origin = userCoords || { lat: activeCity.lat, lng: activeCity.lng };
        const dist = calculateDistanceKm(origin.lat, origin.lng, loc.lat, loc.lng);
        if (dist > nearbyRadiusKm) return false;
      }

      return true;
    });
  }, [
    locations,
    aiMatchedIds,
    activeCity,
    activeStatusTab,
    selectedCategory,
    searchQuery,
    selectedTags,
    activeA11yFilters,
    nearbyRadiusKm,
    userCoords,
  ]);

  if (!currentUser) {
    return (
      <AuthGatePage
        onAuthenticated={(user) => {
          setCurrentUser(user);
          announce(`Signed in as ${user.name}. Welcome to TanAW.`);
        }}
      />
    );
  }

  return (
    <div className="flex flex-col md:flex-row h-dvh w-screen bg-[#f1f5f9] text-slate-900 overflow-hidden font-sans">
      {/* Left Navigation Sidebar */}
      <SidebarRail
        activeView={activeView}
        onViewChange={setActiveView}
        currentUser={currentUser}
        onSignOut={() => {
          setCurrentUserSession(null);
          setCurrentUser(null);
          announce('Signed out of TanAW.');
        }}
        onOpenAIAnalyzer={() => {
          setAiTargetLocation(null);
          setIsAIModalOpen(true);
        }}
        onOpenAddModal={() => {
          setActiveView('map');
          setIsAddingLocation(true);
          setNewPinCoords({ lat: activeCity.lat, lng: activeCity.lng });
          setIsAddModalOpen(true);
        }}
        onToggleFilterPanel={() => setIsPlacesPanelOpen(!isPlacesPanelOpen)}
        isFilterPanelOpen={isPlacesPanelOpen}
        isMobileOpen={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
        onOpenHowItWorks={() => setIsHowItWorksOpen(true)}
      />

      {/* Collapsible Places & AI Agent Panel — visible when on Map view */}
      {activeView === 'map' && (
        <PlacesPanel
          locations={filteredLocations}
          totalLocationsCount={locations.length}
          selectedLocation={selectedLocation}
          savedPlaceIds={savedPlaceIds}
          onToggleSavePlace={handleToggleSavePlace}
          onSelectLocation={(loc) => setSelectedLocation(loc)}
          onOpenDetails={(loc) => {
            setSelectedLocation(loc);
            setIsDetailDrawerOpen(true);
          }}
          onRunAIScan={(loc) => {
            setAiTargetLocation(loc);
            setIsAIModalOpen(true);
          }}
          activeTab={activeStatusTab}
          onTabChange={setActiveStatusTab}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
          selectedTags={selectedTags}
          onToggleTag={(tag) => {
            setSelectedTags((prev) =>
              prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
            );
          }}
          onClearTags={() => setSelectedTags([])}
          activeA11yFilters={activeA11yFilters}
          onToggleA11yFilter={(fId) =>
            setActiveA11yFilters((prev) =>
              prev.includes(fId) ? prev.filter((id) => id !== fId) : [...prev, fId]
            )
          }
          onClearFilters={handleResetAllFilters}
          userCoords={userCoords}
          onResetData={handleResetData}
          isOpen={isPlacesPanelOpen}
          onCloseMobile={() => setIsPlacesPanelOpen(false)}
          activeCity={activeCity}
          onSelectCityPreset={(city) => {
            setActiveCity(city);
            if (activeRoute) setActiveRoute(null);
          }}
          onOpenAddModal={() => {
            setIsAddingLocation(true);
            setNewPinCoords({ lat: activeCity.lat, lng: activeCity.lng });
            setIsAddModalOpen(true);
          }}
          onToggleRoute={handleToggleRoute}
          activeRouteLocationId={activeRoute ? selectedLocation?.id : undefined}
          onOpenAIAnalyzer={() => {
            setAiTargetLocation(null);
            setIsAIModalOpen(true);
          }}
          aiMatchedIds={aiMatchedIds}
          onSetAiMatchedIds={setAiMatchedIds}
          onSelectGooglePlace={handleSelectGoogleSearchPlace}
        />
      )}

      {/* Main Content Area: Map, Community Hub, or Profile Hub */}
      <main className="flex-1 min-h-0 h-full relative overflow-hidden bg-slate-200">
        {activeView === 'profile' ? (
          <ProfileHubView
            currentUser={currentUser}
            onUpdateUser={setCurrentUser}
            locations={locations}
            savedPlaceIds={savedPlaceIds}
            onToggleSavePlace={handleToggleSavePlace}
            userVotes={getStoredUserVotes()}
            onSelectLocationOnMap={(loc) => {
              setSelectedLocation(loc);
              setActiveView('map');
            }}
          />
        ) : activeView === 'community' ? (
          <CommunityView
            locations={locations}
            currentUser={currentUser}
            userVotesCount={Object.keys(getStoredUserVotes()).length}
            onSelectLocationOnMap={(loc) => {
              setSelectedLocation(loc);
              setActiveView('map');
            }}
          />
        ) : (
          <>
            <MapView
              locations={filteredLocations}
              totalLocationsCount={locations.length}
              selectedLocation={selectedLocation}
              onSelectLocation={(loc) => {
                setSelectedLocation(loc);
                if (typeof window !== 'undefined' && window.innerWidth >= 768) {
                  setIsPlacesPanelOpen(true);
                }
              }}
              onOpenDetails={(loc) => {
                setSelectedLocation(loc);
                setIsDetailDrawerOpen(true);
              }}
              onRatePlace={handleOpenRateSheet}
              onSelectGooglePoi={handleSelectGooglePoi}
              isAddingLocation={isAddingLocation}
              newPinCoords={newPinCoords}
              onNewPinCoordsChange={(coords) => {
                setNewPinCoords(coords);
                if (isAddingLocation) {
                  setIsAddModalOpen(true);
                }
              }}
              activeCity={activeCity}
              activeRoute={activeRoute}
              isRoutingLoading={isRoutingLoading}
              onToggleRoutePreview={handleToggleRoute}
              onClearRoute={() => setActiveRoute(null)}
              userCoords={userCoords}
              onUserCoordsChange={setUserCoords}
              nearbyRadiusKm={nearbyRadiusKm}
              onNearbyRadiusChange={setNearbyRadiusKm}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              selectedCategory={selectedCategory}
              onCategoryChange={setSelectedCategory}
              onOpenAIAnalyzer={() => {
                setAiTargetLocation(null);
                setIsAIModalOpen(true);
              }}
              onRunAIScan={(loc) => {
                setAiTargetLocation(loc);
                setIsAIModalOpen(true);
              }}
              onNavigateTab={(tab) => {
                if (tab === 'community' || tab === 'profile' || tab === 'map') {
                  setActiveView(tab);
                }
              }}
              onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
            />
          </>
        )}

        {/* Full Details Slide-out Drawer */}
        {isDetailDrawerOpen && (
          <LocationDetailDrawer
            location={selectedLocation}
            currentUser={currentUser}
            isSaved={selectedLocation ? savedPlaceIds.includes(selectedLocation.id) : false}
            onToggleSave={handleToggleSavePlace}
            onClose={() => setIsDetailDrawerOpen(false)}
            onVoteTag={handleVoteTag}
            onAddOrUpdateReview={handleAddOrUpdateReview}
            onVoteReview={handleVoteReview}
            onQuarantineReview={handleQuarantineReview}
            onClaimOwner={handleClaimOwner}
            onOwnerReply={handleOwnerReply}
            onModerateReview={handleModerateReview}
            onRunAIScanOnPin={(loc) => {
              setAiTargetLocation(loc);
              setIsAIModalOpen(true);
            }}
          />
        )}

        {/* Compact Click-to-Rate Sheet (zero manual address typing) */}
        <RatePlaceSheet
          target={ratePlaceTarget}
          onClose={() => setRatePlaceTarget(null)}
          onSubmit={handleRatePlace}
        />

        {/* Add Location Modal (Mindanao Place Picker + Custom Place toggle) */}
        <AddLocationModal
          isOpen={isAddModalOpen}
          onClose={() => {
            setIsAddModalOpen(false);
            setIsAddingLocation(false);
            setAiNewPinData(null);
          }}
          initialCoords={newPinCoords}
          initialName={aiNewPinData?.name}
          initialAddress={aiNewPinData?.address}
          initialCategory={aiNewPinData?.category}
          initialTags={aiNewPinData?.tags}
          initialPhotoUrl={aiNewPinData?.photoUrl}
          initialAiSummary={aiNewPinData?.summary}
          initialAiBarriers={aiNewPinData?.barriers}
          currentUserName={currentUser.name}
          onSaveLocation={handleSaveLocation}
        />

        {/* AI Storefront Analyzer Modal */}
        <AIStorefrontModal
          isOpen={isAIModalOpen}
          onClose={() => setIsAIModalOpen(false)}
          targetLocation={aiTargetLocation}
          locations={locations}
          onApplyTagsToLocation={handleApplyTagsToLocation}
          onStartNewPinFromAnalysis={handleStartNewPinFromAnalysis}
        />

        {/* How TanAW Works Quick Guide Modal */}
        <Modal
          isOpen={isHowItWorksOpen}
          onClose={() => setIsHowItWorksOpen(false)}
          title="Welcome to TanAW"
          subtitle="Crowdsourced Accessibility Mapping & Gemini AI Storefront Scanner"
          maxWidthClassName="max-w-lg"
          footer={
            <button
              type="button"
              onClick={() => setIsHowItWorksOpen(false)}
              className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-bold cursor-pointer"
            >
              Got it, start exploring
            </button>
          }
        >
          <div className="space-y-4 text-xs sm:text-sm text-slate-700">
            <p className="leading-relaxed">
              <strong>TanAW</strong> helps people with disabilities, seniors, and families navigate Cagayan de Oro and Mindanao with confidence. Here is how to use it in 3 steps:
            </p>

            <div className="space-y-3">
              <div className="p-3.5 rounded-2xl bg-emerald-50/80 border border-emerald-200 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-bold text-slate-900">1. Check Pin Colors &amp; Verified Tags</h3>
                  <p className="text-xs text-slate-600 mt-0.5">
                    <strong className="text-emerald-700">Green pins (4.0★+)</strong> have community-verified ramps, elevators, or accessible entrances.{' '}
                    <strong className="text-amber-700">Amber pins</strong> have partial access, and{' '}
                    <strong className="text-rose-700">Red pins</strong> have reported physical barriers.
                  </p>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-indigo-50/80 border border-indigo-200 flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-bold text-slate-900">2. Auto-Tag Storefront Photos with AI</h3>
                  <p className="text-xs text-slate-600 mt-0.5">
                    When pinning or reviewing a place, upload a storefront photo to let Gemini Vision automatically detect ramps, door width, and step barriers.
                  </p>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-amber-50/80 border border-amber-200 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-bold text-slate-900">3. Vote Confirm or Dispute &amp; Earn Vouchers</h3>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Open any venue’s details drawer to confirm accurate accessibility tags, report barriers, and earn points redeemable for partner vouchers.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Modal>
      </main>

      {/* Mobile-First Bottom Navigation Bar (5 clear destinations with active indicator & 48px+ touch targets) */}
      <nav
        aria-label="Mobile Primary Navigation"
        className="md:hidden h-16 bg-white border-t border-slate-200 z-[650] grid grid-cols-5 items-center px-1.5 shrink-0 select-none shadow-[0_-4px_20px_rgba(15,23,42,0.06)]"
      >
        <button
          type="button"
          aria-current={activeView === 'map' && !isPlacesPanelOpen ? 'page' : undefined}
          onClick={() => {
            setActiveView('map');
            setIsPlacesPanelOpen(false);
            setIsMobileMenuOpen(false);
          }}
          className={`h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold cursor-pointer transition-all ${
            activeView === 'map' && !isPlacesPanelOpen
              ? 'text-teal-800 bg-teal-50/80'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <MapPin className="w-5 h-5" />
          <span>Map</span>
        </button>

        <button
          type="button"
          aria-current={activeView === 'map' && isPlacesPanelOpen ? 'page' : undefined}
          onClick={() => {
            setActiveView('map');
            setIsPlacesPanelOpen(!isPlacesPanelOpen);
            setIsMobileMenuOpen(false);
          }}
          className={`h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold cursor-pointer transition-all ${
            activeView === 'map' && isPlacesPanelOpen
              ? 'text-teal-800 bg-teal-50/80'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <List className="w-5 h-5" />
          <span>Places ({filteredLocations.length})</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveView('map');
            setIsAddingLocation(true);
            setNewPinCoords({ lat: activeCity.lat, lng: activeCity.lng });
            setIsAddModalOpen(true);
            setIsPlacesPanelOpen(false);
            setIsMobileMenuOpen(false);
          }}
          className="h-11 mx-1 rounded-2xl bg-teal-700 hover:bg-teal-800 text-white flex flex-col items-center justify-center gap-0.5 text-[10px] font-extrabold shadow-md active:scale-95 transition-all cursor-pointer"
          aria-label="Pin a new accessible place"
        >
          <Plus className="w-4 h-4" />
          <span>Pin Place</span>
        </button>

        <button
          type="button"
          aria-current={activeView === 'community' ? 'page' : undefined}
          onClick={() => {
            setActiveView('community');
            setIsPlacesPanelOpen(false);
            setIsMobileMenuOpen(false);
          }}
          className={`h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold cursor-pointer transition-all ${
            activeView === 'community'
              ? 'text-teal-800 bg-teal-50/80'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <Users className="w-5 h-5" />
          <span>Community</span>
        </button>

        <button
          type="button"
          aria-current={activeView === 'profile' ? 'page' : undefined}
          onClick={() => {
            setActiveView('profile');
            setIsPlacesPanelOpen(false);
            setIsMobileMenuOpen(false);
          }}
          className={`h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold cursor-pointer transition-all ${
            activeView === 'profile'
              ? 'text-teal-800 bg-teal-50/80'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <User className="w-5 h-5" />
          <span>Profile</span>
        </button>
      </nav>
    </div>
  );
}

export default function App() {
  return (
    <A11yProvider>
      <AccessMapApp />
    </A11yProvider>
  );
}
