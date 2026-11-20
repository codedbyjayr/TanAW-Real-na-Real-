/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { CategoryType } from '../types/accessibility';
import { STANDARD_ACCESSIBILITY_TAGS } from '../prompts/storefrontPrompt';
import { StarRating } from './ui/StarRating';
import { getTagIcon } from '../utils/tagHelpers';
import { useA11y } from '../context/A11yContext';
import { X, Star, MapPin, Send, Check } from 'lucide-react';

export interface RatePlaceTarget {
  existingPinId?: string;
  googlePlaceId?: string;
  source: 'google' | 'custom';
  name: string;
  address: string;
  category: CategoryType;
  lat: number;
  lng: number;
}

export interface RatePlaceSubmission {
  target: RatePlaceTarget;
  rating: number;
  selectedTags: string[];
  tagRatings: Record<string, number>;
  note: string;
}

interface RatePlaceSheetProps {
  target: RatePlaceTarget | null;
  onClose: () => void;
  onSubmit: (submission: RatePlaceSubmission) => void;
}

export const RatePlaceSheet: React.FC<RatePlaceSheetProps> = ({
  target,
  onClose,
  onSubmit,
}) => {
  const { announce } = useA11y();
  const [rating, setRating] = useState<number>(0);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagRatings, setTagRatings] = useState<Record<string, number>>({});
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!target) return null;

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => {
      if (prev.includes(tag)) {
        const nextRatings = { ...tagRatings };
        delete nextRatings[tag];
        setTagRatings(nextRatings);
        return prev.filter((t) => t !== tag);
      }
      return [...prev, tag];
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (rating < 1 || rating > 5) {
      setError('Please select an overall rating from 1 to 5 stars.');
      announce('Please select an overall rating from 1 to 5 stars.');
      return;
    }

    onSubmit({
      target,
      rating,
      selectedTags,
      tagRatings,
      note: note.trim(),
    });

    setRating(0);
    setSelectedTags([]);
    setTagRatings({});
    setNote('');
    setError(null);
    onClose();
  };

  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/45 backdrop-blur-[1px] z-[1050]"
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Rate ${target.name}`}
        className="fixed inset-x-0 bottom-0 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 w-full sm:max-w-md max-h-[88vh] bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 z-[1060] flex flex-col overflow-hidden animate-slide-up"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-teal-700">
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              <span>{target.category}</span>
            </div>
            <h2 className="text-base sm:text-lg font-extrabold text-slate-900 truncate mt-0.5">
              {target.name}
            </h2>
            <p className="text-xs text-slate-500 truncate mt-0.5">{target.address}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full text-slate-400 hover:text-slate-800 hover:bg-slate-100 grid place-items-center cursor-pointer shrink-0"
            aria-label="Close rating sheet"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* 1. Required Overall Rating */}
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
            <label className="block text-xs font-bold text-slate-800">
              Overall Accessibility Rating <span className="text-rose-600">*</span>
            </label>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Overall rating">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    role="radio"
                    aria-checked={rating === star}
                    aria-label={`${star} out of 5 stars`}
                    onClick={() => {
                      setRating(star);
                      setError(null);
                    }}
                    className="p-1 cursor-pointer hover:scale-110 active:scale-95 transition-transform"
                  >
                    <Star
                      className={`w-7 h-7 ${
                        rating >= star
                          ? 'fill-amber-400 text-amber-400'
                          : 'text-slate-300 hover:text-amber-300'
                      }`}
                    />
                  </button>
                ))}
              </div>
              <span className="text-xs font-extrabold text-slate-700">
                {rating > 0 ? `${rating} / 5 ★` : 'Tap stars'}
              </span>
            </div>
          </div>

          {/* 2. Accessibility Tags with Optional Per-Tag Stars */}
          <div className="space-y-2">
            <span className="block text-xs font-bold text-slate-800">
              Accessibility Features Observed <span className="text-slate-400 font-normal">(Optional)</span>
            </span>
            <div className="flex flex-wrap gap-1.5">
              {STANDARD_ACCESSIBILITY_TAGS.map((tag) => {
                const isSelected = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => toggleTag(tag)}
                    className={`px-2.5 py-1 rounded-xl text-[11px] font-semibold flex items-center gap-1 border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-teal-700 text-white border-teal-700'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {getTagIcon(tag)}
                    <span>{tag}</span>
                    {isSelected && <Check className="w-3 h-3" />}
                  </button>
                );
              })}
            </div>

            {selectedTags.length > 0 && (
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Optional Per-Feature Rating
                </span>
                {selectedTags.map((tag) => (
                  <div key={tag} className="flex items-center justify-between text-xs gap-2">
                    <span className="truncate text-slate-700 font-medium">{tag}</span>
                    <StarRating
                      value={tagRatings[tag] || rating || 5}
                      onChange={(val) => setTagRatings((prev) => ({ ...prev, [tag]: val }))}
                      size="sm"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 3. Optional Short Note */}
          <div>
            <label htmlFor="rate-place-note" className="block text-xs font-bold text-slate-800 mb-1">
              Short Note <span className="text-slate-400 font-normal">(Optional)</span>
            </label>
            <textarea
              id="rate-place-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Wide automatic door at main entrance, smooth ramp from parking..."
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-xs sm:text-sm text-slate-900 focus:outline-2 focus:outline-teal-600"
            />
          </div>

          {error && (
            <p role="alert" className="text-xs font-bold text-rose-600">
              {error}
            </p>
          )}

          {/* Submit */}
          <div className="pt-1 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs sm:text-sm font-bold flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Submit Rating</span>
            </button>
          </div>
        </form>
      </div>
    </>
  );
};
