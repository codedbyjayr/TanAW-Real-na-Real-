/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { LocationPin, CategoryType } from '../types/accessibility';
import { STANDARD_ACCESSIBILITY_TAGS } from '../prompts/storefrontPrompt';
import {
  CityPreset,
  MINDANAO_CITY_PRESETS,
} from '../utils/routingAndSpatial';
import {
  DiscoveredEstablishment,
  searchMindanaoPlacesByText,
} from '../utils/mindanaoPlaces';
import { PRESET_QUERIES, queryAIAgent, AIAgentResponse } from '../utils/aiAgent';
import { LocationCard } from './LocationCard';
import { getTagIcon } from '../utils/tagHelpers';
import { useA11y } from '../context/A11yContext';
import {
  RotateCcw,
  Search,
  X,
  SlidersHorizontal,
  Check,
  Map as MapIcon,
  MapPin,
  ChevronDown,
  Sparkles,
  Camera,
  Bot,
} from 'lucide-react';

export type PlacesTab = 'all' | 'verified' | 'barriers';

export interface PlacesPanelProps {
  locations: LocationPin[];
  totalLocationsCount?: number;
  selectedLocation: LocationPin | null;
  savedPlaceIds?: string[];
  onToggleSavePlace?: (locationId: string) => void;
  onSelectLocation: (loc: LocationPin) => void;
  onOpenDetails: (loc: LocationPin) => void;
  onRunAIScan?: (loc: LocationPin) => void;
  activeTab: PlacesTab;
  onTabChange: (tab: PlacesTab) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  selectedCategory: CategoryType | 'All';
  onCategoryChange: (cat: CategoryType | 'All') => void;
  selectedTags: string[];
  onToggleTag: (tag: string) => void;
  onClearTags: () => void;
  activeA11yFilters?: string[];
  onToggleA11yFilter?: (filterId: string) => void;
  onClearFilters?: () => void;
  userCoords: { lat: number; lng: number } | null;
  onResetData: () => void;
  isOpen: boolean;
  onCloseMobile?: () => void;
  activeCity: CityPreset;
  onSelectCityPreset: (preset: CityPreset) => void;
  onOpenAddModal?: () => void;
  onToggleRoute?: (loc: LocationPin) => void;
  activeRouteLocationId?: string;
  onOpenAIAnalyzer?: () => void;
  aiMatchedIds?: string[];
  onSetAiMatchedIds?: (ids: string[]) => void;
  onSelectGooglePlace?: (est: DiscoveredEstablishment) => void;
}

const CATEGORIES: (CategoryType | 'All')[] = [
  'All',
  'Shopping',
  'Dining & Cafe',
  'Healthcare',
  'Education',
  'Public Space',
];

export const PlacesPanel: React.FC<PlacesPanelProps> = ({
  locations,
  selectedLocation,
  savedPlaceIds = [],
  onToggleSavePlace,
  onSelectLocation,
  onOpenDetails,
  onRunAIScan,
  activeTab,
  onTabChange,
  searchQuery,
  onSearchChange,
  selectedCategory,
  onCategoryChange,
  selectedTags,
  onToggleTag,
  onClearTags,
  onClearFilters,
  userCoords,
  onResetData,
  isOpen,
  onCloseMobile,
  activeCity,
  onSelectCityPreset,
  onToggleRoute,
  activeRouteLocationId,
  onOpenAIAnalyzer,
  onSetAiMatchedIds,
  onSelectGooglePlace,
}) => {
  const { announce } = useA11y();
  const [showFilters, setShowFilters] = useState(false);
  const [showCityPicker, setShowCityPicker] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [aiAgentResponse, setAiAgentResponse] = useState<AIAgentResponse | null>(null);
  const [googleResults, setGoogleResults] = useState<DiscoveredEstablishment[]>([]);

  useEffect(() => {
    const q = searchQuery.trim();
    if (!isOpen || !onSelectGooglePlace || q.length < 2) {
      setGoogleResults([]);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const results = await searchMindanaoPlacesByText(q, 5);
        if (!cancelled) setGoogleResults(results);
      } catch {
        if (!cancelled) setGoogleResults([]);
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [searchQuery, isOpen, onSelectGooglePlace]);

  if (!isOpen) return null;

  const handleAskAI = (promptText: string) => {
    announce(`Asking AI Agent: ${promptText}`);
    const res = queryAIAgent(promptText, locations, activeCity);
    setAiAgentResponse(res);
    if (onSetAiMatchedIds) {
      onSetAiMatchedIds(res.matchedLocationIds);
    }
    if (res.suggestedCity) {
      onSelectCityPreset(res.suggestedCity);
    }
    announce(`AI Agent found ${res.matchedLocationIds.length} matching places`);
  };

  const handleClearAIQuery = () => {
    setAiAgentResponse(null);
    if (onSetAiMatchedIds) {
      onSetAiMatchedIds([]);
    }
  };

  const activeFilterCount =
    selectedTags.length +
    (selectedCategory !== 'All' ? 1 : 0) +
    (activeTab !== 'all' ? 1 : 0);

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    activeFilterCount > 0 ||
    aiAgentResponse !== null;

  return (
    <aside
      aria-label="Accessible places directory and filters"
      className="fixed inset-x-0 top-0 bottom-16 z-[600] md:static md:inset-auto md:z-30 flex w-full md:w-[360px] lg:w-[385px] bg-slate-50 border-r border-slate-200 flex-col md:h-full shrink-0 select-none shadow-xl md:shadow-none overflow-hidden"
    >
      {/* LEVEL 1: Clean Top Header (Region Selector + Filter Drawer Toggle) */}
      <div className="relative z-40 px-3.5 py-2.5 border-b border-slate-200 bg-white flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {onCloseMobile && (
            <button
              type="button"
              onClick={onCloseMobile}
              className="md:hidden min-w-10 min-h-10 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 active:scale-95 transition-all grid place-items-center cursor-pointer"
              title="Return to map"
              aria-label="Return to map"
            >
              <MapIcon className="w-4 h-4" />
            </button>
          )}

          {/* Region Dropdown Pill */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowCityPicker(!showCityPicker)}
              className="min-h-10 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-900 text-xs sm:text-sm font-bold border border-slate-200/90 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-teal-600"
              title="Switch Mindanao city or region"
              aria-expanded={showCityPicker}
              aria-haspopup="listbox"
            >
              <MapPin className="w-4 h-4 text-teal-700 shrink-0" />
              <span className="truncate max-w-[145px]">{activeCity.name}</span>
              <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900">
                {locations.length}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            </button>

            {showCityPicker && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowCityPicker(false)}
                  aria-hidden="true"
                />
                <div
                  role="listbox"
                  aria-label="Select Mindanao Region"
                  className="absolute top-12 left-0 w-60 bg-white rounded-2xl shadow-2xl border border-slate-200 p-1.5 z-50 space-y-0.5"
                >
                  <span className="block px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Mindanao Region
                  </span>
                  {MINDANAO_CITY_PRESETS.map((city) => {
                    const isSelected = activeCity.id === city.id;
                    return (
                      <button
                        key={city.id}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => {
                          onSelectCityPreset(city);
                          setShowCityPicker(false);
                          announce(`Selected ${city.name}`);
                        }}
                        className={`w-full px-3 py-2 rounded-xl text-xs font-medium flex items-center justify-between text-left transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-teal-50 text-teal-950 font-bold'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span>{city.name}</span>
                        {isSelected && <Check className="w-4 h-4 text-teal-700" />}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right Actions: AI Assistant Toggle + Accessibility Tag Filter Toggle */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setShowAiPanel(!showAiPanel)}
            aria-pressed={showAiPanel || Boolean(aiAgentResponse)}
            className={`min-h-10 px-3 rounded-xl border flex items-center gap-1.5 text-xs font-bold transition-all cursor-pointer active:scale-95 ${
              showAiPanel || aiAgentResponse
                ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs'
                : 'border-indigo-200 bg-indigo-50/70 hover:bg-indigo-100/80 text-indigo-900'
            }`}
            title="Toggle TanAW AI Assistant & Photo Scanner"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI</span>
          </button>

          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            aria-expanded={showFilters}
            className={`min-h-10 px-3 rounded-xl border flex items-center gap-1.5 text-xs font-bold transition-all cursor-pointer active:scale-95 ${
              selectedTags.length > 0 || showFilters
                ? 'bg-slate-900 border-slate-900 text-white'
                : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white'
            }`}
            title="Filter by specific accessibility features"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Filters</span>
            {selectedTags.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-teal-500 text-white text-[10px]">
                {selectedTags.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* LEVEL 2: Search Input + Single Clean Filter Strip */}
      <div className="relative z-10 px-3.5 py-2.5 bg-white border-b border-slate-200/80 space-y-2.5 shrink-0">
        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search places, streets, or ramps..."
            aria-label="Search accessible places"
            className="w-full min-h-10 pl-10 pr-9 py-2 bg-slate-100/80 hover:bg-slate-100 focus:bg-white rounded-xl border border-slate-200/90 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-2 focus:outline-teal-600 transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1 rounded-lg cursor-pointer"
              aria-label="Clear search query"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Live Mindanao Google Places Results */}
        {googleResults.length > 0 && onSelectGooglePlace && (
          <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-2 space-y-1">
            <div className="flex items-center justify-between px-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-sky-800">
                Mindanao Establishments
              </span>
              <span className="text-[10px] font-semibold text-slate-500">
                Powered by Google
              </span>
            </div>
            <div className="space-y-1">
              {googleResults.map((est) => (
                <button
                  key={est.googlePlaceId}
                  type="button"
                  onClick={() => {
                    onSelectGooglePlace(est);
                    setGoogleResults([]);
                    if (onCloseMobile && window.innerWidth < 768) {
                      onCloseMobile();
                    }
                  }}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-white hover:bg-sky-100/60 border border-sky-100 text-left flex items-center justify-between gap-2 transition-colors cursor-pointer"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 truncate">{est.name}</p>
                    <p className="text-[11px] text-slate-500 truncate">{est.address}</p>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-teal-50 text-teal-800 text-[10px] font-bold shrink-0">
                    Rate
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Single Horizontal Filter Strip: Verification Status + Venue Categories */}
        <div
          role="toolbar"
          aria-label="Quick venue filters"
          className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5"
        >
          <button
            type="button"
            aria-pressed={activeTab === 'all' && selectedCategory === 'All'}
            onClick={() => {
              onTabChange('all');
              onCategoryChange('All');
            }}
            className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border transition-all cursor-pointer shrink-0 ${
              activeTab === 'all' && selectedCategory === 'All'
                ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            All Places
          </button>

          <button
            type="button"
            aria-pressed={activeTab === 'verified'}
            onClick={() => onTabChange(activeTab === 'verified' ? 'all' : 'verified')}
            className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border transition-all cursor-pointer shrink-0 ${
              activeTab === 'verified'
                ? 'bg-emerald-700 text-white border-emerald-700 shadow-2xs'
                : 'bg-emerald-50/70 text-emerald-900 border-emerald-200 hover:bg-emerald-100/70'
            }`}
          >
            ★ Verified (4★+)
          </button>

          <button
            type="button"
            aria-pressed={activeTab === 'barriers'}
            onClick={() => onTabChange(activeTab === 'barriers' ? 'all' : 'barriers')}
            className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border transition-all cursor-pointer shrink-0 ${
              activeTab === 'barriers'
                ? 'bg-rose-700 text-white border-rose-700 shadow-2xs'
                : 'bg-rose-50/70 text-rose-900 border-rose-200 hover:bg-rose-100/70'
            }`}
          >
            Barriers
          </button>

          <span className="h-4 w-px bg-slate-200 mx-0.5 shrink-0" aria-hidden="true" />

          {CATEGORIES.filter((c) => c !== 'All').map((cat) => {
            const isSelected = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                aria-pressed={isSelected}
                onClick={() => onCategoryChange(isSelected ? 'All' : cat)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border transition-all cursor-pointer shrink-0 ${
                  isSelected
                    ? 'bg-teal-800 text-white border-teal-800 shadow-2xs'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>

        {/* Collapsible AI Assistant Drawer (Opens when user taps "AI" button) */}
        {(showAiPanel || aiAgentResponse) && (
          <div className="pt-2 border-t border-slate-100">
            <div className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-3 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Bot className="w-4 h-4 text-indigo-700 shrink-0" />
                  <span className="text-xs font-bold text-slate-900 truncate">
                    Ask TanAW AI or Scan a Storefront
                  </span>
                </div>
                {onOpenAIAnalyzer && (
                  <button
                    type="button"
                    onClick={onOpenAIAnalyzer}
                    className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer shadow-2xs shrink-0"
                  >
                    <Camera className="w-3 h-3 text-amber-200" />
                    <span>Scan Photo</span>
                  </button>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5">
                {PRESET_QUERIES.map((q) => (
                  <button
                    key={q.label}
                    type="button"
                    onClick={() => handleAskAI(q.prompt)}
                    className="px-2.5 py-1 rounded-lg bg-white hover:bg-indigo-100/70 border border-indigo-200 text-[11px] font-semibold text-indigo-950 transition-colors cursor-pointer"
                  >
                    {q.label}
                  </button>
                ))}
              </div>

              {aiAgentResponse && (
                <div className="p-2.5 rounded-xl bg-white border border-indigo-200 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">
                      AI Recommendation
                    </span>
                    <button
                      type="button"
                      onClick={handleClearAIQuery}
                      className="text-[11px] text-rose-600 font-bold hover:underline cursor-pointer"
                    >
                      Clear
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-700 leading-relaxed">
                    {aiAgentResponse.answer}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Collapsible Accessibility Feature Tags Drawer (Opens when user taps "Filters") */}
        {showFilters && (
          <div className="pt-2.5 border-t border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Accessibility Features
              </span>
              <div className="flex items-center gap-3">
                {selectedTags.length > 0 && (
                  <button
                    type="button"
                    onClick={onClearTags}
                    className="text-[11px] text-rose-600 font-bold hover:underline cursor-pointer"
                  >
                    Clear tags ({selectedTags.length})
                  </button>
                )}
                <button
                  type="button"
                  onClick={onResetData}
                  className="text-[11px] text-slate-500 hover:text-slate-800 font-semibold flex items-center gap-1 cursor-pointer"
                  title="Reset database to default Mindanao seed locations"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset Seed Data</span>
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
              {STANDARD_ACCESSIBILITY_TAGS.map((tag) => {
                const isSelected = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => onToggleTag(tag)}
                    className={`px-2.5 py-1 rounded-xl text-[11px] font-semibold flex items-center gap-1.5 border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {getTagIcon(tag)}
                    <span className="truncate max-w-[160px]">{tag}</span>
                    {isSelected && <Check className="w-3 h-3" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* LEVEL 3: Venue Cards List (75%+ of panel height) */}
      <div className="relative z-0 flex-1 overflow-y-auto p-3.5 space-y-2.5">
        {hasActiveFilters && onClearFilters && (
          <div className="flex items-center justify-between text-xs text-slate-600 px-1 pb-0.5">
            <span>
              Showing <b className="text-slate-900">{locations.length}</b> matching places
            </span>
            <button
              type="button"
              onClick={() => {
                onClearFilters();
                handleClearAIQuery();
              }}
              className="text-xs text-teal-700 hover:text-teal-900 font-bold hover:underline cursor-pointer"
            >
              Clear all filters
            </button>
          </div>
        )}

        {locations.length === 0 ? (
          <div className="p-8 text-center bg-white rounded-2xl border border-dashed border-slate-300 space-y-2">
            <p className="text-sm font-bold text-slate-800">No matching places found</p>
            <p className="text-xs text-slate-500">
              Try clearing your active filters or switching to another Mindanao city.
            </p>
            {hasActiveFilters && onClearFilters && (
              <button
                type="button"
                onClick={() => {
                  onClearFilters();
                  handleClearAIQuery();
                }}
                className="mt-2 px-3.5 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-bold cursor-pointer"
              >
                Reset Filters
              </button>
            )}
          </div>
        ) : (
          locations.map((loc) => (
            <LocationCard
              key={loc.id}
              location={loc}
              isSelected={selectedLocation?.id === loc.id}
              isSaved={savedPlaceIds.includes(loc.id)}
              onToggleSave={onToggleSavePlace}
              onSelect={(selected) => {
                onSelectLocation(selected);
                if (onCloseMobile && window.innerWidth < 768) {
                  onCloseMobile();
                }
              }}
              onOpenDetails={onOpenDetails}
              onRunAIScan={onRunAIScan}
              onToggleRoute={onToggleRoute}
              isRouteActive={activeRouteLocationId === loc.id}
              userCoords={userCoords}
            />
          ))
        )}
      </div>
    </aside>
  );
};
