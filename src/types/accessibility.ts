/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { StandardAccessibilityTag } from '../prompts/storefrontPrompt';

export type CategoryType =
  | 'Shopping'
  | 'Dining & Cafe'
  | 'Healthcare'
  | 'Education'
  | 'Public Space'
  | 'Hotel & Lodging'
  | 'Service'
  | 'Other';

export interface LocationTag {
  name: string;
  rating: number; // 1-5 rating average for this tag
  ratingCount: number;
  confirmations: number;
  disputes: number;
  isAiSuggested?: boolean;
  userVoted?: 'confirm' | 'dispute';
}

export interface TagRatingInput {
  name: string;
  rating: number;
  isAiSuggested?: boolean;
}

export type ChecklistStatus = 'yes' | 'partial' | 'no';

export interface StructuredChecklist {
  stepFreeEntrance: ChecklistStatus;
  wheelchairRamp: ChecklistStatus;
  accessibleRestroom: ChecklistStatus;
  tactilePaving: ChecklistStatus;
  wideDoorways: ChecklistStatus;
}

export type ReviewModerationStatus =
  | 'published'
  | 'pending_review'
  | 'under_review'
  | 'removed';

export type ReportReason =
  | 'fake_experience'
  | 'harassment'
  | 'spam'
  | 'misleading_information'
  | 'malicious_intent';

export type UserTrustLevel =
  | 'probationary'
  | 'verified_contributor'
  | 'verified_owner'
  | 'moderator';

export type EnforcementStatus = 'active' | 'warned' | 'suspended' | 'banned';

export interface OwnerResponse {
  ownerName: string;
  message: string;
  date: string;
  officialPhotos?: string[];
}

export interface Review {
  id: string;
  authorId?: string;
  authorName: string;
  authorTrustLevel?: UserTrustLevel;
  rating: number; // 1-5 overall (computed from checklist or set)
  comment: string;
  date: string;
  createdAtMs?: number;
  tagRatings?: Record<string, number>;
  photos?: string[];
  checklist?: StructuredChecklist;
  isNegativeReport?: boolean;
  onSiteVerified?: boolean;
  distanceMeters?: number;
  status?: ReviewModerationStatus;
  statusReason?: string;
  confirmations?: number;
  inaccurateFlags?: number;
  userVote?: 'confirm' | 'inaccurate';
  ownerResponse?: OwnerResponse;
}

export interface ModerationQueueItem {
  id: string;
  pinId: string;
  pinName: string;
  reviewId: string;
  reviewAuthorId: string;
  reviewAuthorName: string;
  reviewComment: string;
  reviewPhotos?: string[];
  reportedBy: string;
  reason: ReportReason | 'probationary_negative' | 'brigade_circuit_breaker' | 'toxicity_filter';
  explanation: string;
  isOwnerDispute?: boolean;
  createdAt: string;
  status: 'open' | 'approved' | 'removed' | 'appealed';
  appealNote?: string;
  enforcementApplied?: 'none' | 'warning' | 'suspended_7d' | 'banned';
}

export interface ClaimedOwnerInfo {
  ownerId: string;
  ownerName: string;
  verifiedVia: 'Business Permit' | 'Official Social Media' | 'On-Site Verification';
  verifiedAt: string;
}

export interface LocationPin {
  id: string;
  googlePlaceId?: string;
  source?: 'google' | 'custom';
  name: string;
  category: CategoryType;
  address: string;
  lat: number;
  lng: number;
  averageRating: number; // 0 if unrated, otherwise 1.0 - 5.0
  totalReviews: number;
  tags: LocationTag[];
  photos: string[];
  reviews: Review[];
  description?: string;
  aiSummary?: string;
  aiBarriers?: string[];
  createdAt: string;
  updatedAt: string;
  pinCount?: number;
  isPinnedByMe?: boolean;
  brigadeFrozen?: boolean;
  claimedOwner?: ClaimedOwnerInfo;
}

export interface DetectedFeature {
  tag: string;
  confidence: number;
  evidence: string;
}

export interface StorefrontAnalysisResult {
  detected_features: DetectedFeature[];
  possible_barriers: string[];
  summary: string;
  suggested_tags: string[];
  imagePreviewUrl?: string;
  analysisDate?: string;
}
