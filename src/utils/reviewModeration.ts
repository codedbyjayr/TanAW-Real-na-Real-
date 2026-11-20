/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ChecklistStatus,
  EnforcementStatus,
  LocationPin,
  ModerationQueueItem,
  ReportReason,
  Review,
  ReviewModerationStatus,
  StructuredChecklist,
  UserTrustLevel,
} from '../types/accessibility';
import { AuthUser, calculateDistanceKm } from './storage';

const MODERATION_QUEUE_KEY = 'tanaw_moderation_queue_v1';
const USER_TRUST_KEY = 'tanaw_user_trust_v1';
const REVIEW_VOTES_KEY = 'tanaw_review_votes_v1';

export const CHECKLIST_ITEMS: Array<{
  key: keyof StructuredChecklist;
  label: string;
  shortLabel: string;
}> = [
  { key: 'stepFreeEntrance', label: 'Step-free entrance', shortLabel: 'Step-free' },
  { key: 'wheelchairRamp', label: 'Wheelchair ramp', shortLabel: 'Ramp' },
  { key: 'accessibleRestroom', label: 'Accessible restroom', shortLabel: 'Restroom' },
  { key: 'tactilePaving', label: 'Tactile paving / signage', shortLabel: 'Tactile' },
  { key: 'wideDoorways', label: 'Wide doorways (≥90cm)', shortLabel: 'Wide doors' },
];

export const REPORT_REASONS: Array<{ value: ReportReason; label: string }> = [
  { value: 'fake_experience', label: 'Fake experience / never visited' },
  { value: 'harassment', label: 'Harassment or personal attack' },
  { value: 'spam', label: 'Spam or repeated manipulation' },
  { value: 'misleading_information', label: 'Misleading / outdated info' },
  { value: 'malicious_intent', label: 'Malicious intent / review bombing' },
];

export interface UserTrustRecord {
  trustLevel: UserTrustLevel;
  approvedReports: number;
  enforcement: EnforcementStatus;
  warningsCount: number;
  recentSubmissionsMs: number[];
}

// Layer 1: Automated Toxicity & Defamation Filter (client pre-check + mirrored in Cloud Function)
const BLOCKED_PATTERNS = [
  /\b(idiot|stupid|scammer|trash|garbage|ugly|loser|moron|bobo|tanga|gago|puta|ulol)\b/i,
  /\b(boycott|destroy this place|shut them down|burn it|fire the staff|worst people)\b/i,
  /(.)\1{7,}/i, // spam repeated characters
];

export function checkToxicityAndDefamation(text: string): {
  blocked: boolean;
  reason?: string;
} {
  const clean = text.trim();
  if (!clean) return { blocked: false };

  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(clean)) {
      return {
        blocked: true,
        reason:
          'Blocked by Automated Toxicity & Defamation Filter: Please stick to factual physical accessibility details without slurs, personal attacks, or spam.',
      };
    }
  }
  return { blocked: false };
}

export function isNegativeChecklistOrRating(
  checklist: StructuredChecklist,
  rating: number
): boolean {
  const values = Object.values(checklist) as ChecklistStatus[];
  return values.some((v) => v === 'no') || rating <= 2;
}

export function computeChecklistRating(checklist: StructuredChecklist): number {
  const values = Object.values(checklist) as ChecklistStatus[];
  const sum = values.reduce((acc, v) => acc + (v === 'yes' ? 5 : v === 'partial' ? 3 : 1), 0);
  return Math.round((sum / values.length) * 10) / 10;
}

export function getUserTrustRecord(userId: string): UserTrustRecord {
  try {
    const raw = localStorage.getItem(`${USER_TRUST_KEY}_${userId}`);
    if (raw) return JSON.parse(raw) as UserTrustRecord;
  } catch {
    // fallback
  }
  return {
    trustLevel: 'probationary',
    approvedReports: 0,
    enforcement: 'active',
    warningsCount: 0,
    recentSubmissionsMs: [],
  };
}

export function saveUserTrustRecord(userId: string, record: UserTrustRecord): void {
  try {
    localStorage.setItem(`${USER_TRUST_KEY}_${userId}`, JSON.stringify(record));
  } catch {
    // ignore
  }
}

export function checkProximityMeters(
  userLat: number,
  userLng: number,
  pinLat: number,
  pinLng: number
): { distanceMeters: number; onSiteVerified: boolean } {
  const km = calculateDistanceKm(userLat, userLng, pinLat, pinLng);
  const distanceMeters = Math.round(km * 1000);
  return {
    distanceMeters,
    onSiteVerified: distanceMeters <= 200,
  };
}

/**
 * Layer 1 + Pillar 2 + Pillar 3: Evaluates a submission before publishing.
 * Enforces: No anonymous posting, enforcement status, mandatory photo for negative claims,
 * toxicity filter, probationary queue, and 2-hour review-bombing circuit breaker.
 */
export function evaluateReviewSubmission(params: {
  pin: LocationPin;
  user: AuthUser;
  checklist: StructuredChecklist;
  comment: string;
  photos: string[];
  rating: number;
  existingReviewId?: string;
}): {
  allowed: boolean;
  error?: string;
  status: ReviewModerationStatus;
  statusReason?: string;
  isNegative: boolean;
  triggersCircuitBreaker: boolean;
  trustLevel: UserTrustLevel;
} {
  const { pin, user, checklist, comment, photos, rating, existingReviewId } = params;
  const trust = getUserTrustRecord(user.id);

  // 1. Layer 4 enforcement check
  if (trust.enforcement === 'banned') {
    return {
      allowed: false,
      error: 'This account is permanently banned due to repeated policy violations. Submit an appeal in the Moderation tab.',
      status: 'removed',
      isNegative: false,
      triggersCircuitBreaker: false,
      trustLevel: trust.trustLevel,
    };
  }
  if (trust.enforcement === 'suspended') {
    return {
      allowed: false,
      error: 'This account is temporarily suspended from posting new reports.',
      status: 'removed',
      isNegative: false,
      triggersCircuitBreaker: false,
      trustLevel: trust.trustLevel,
    };
  }

  // 2. Pillar 2: No anonymous/guest posting
  if (!user.email || user.email === 'guest@tanaw.app' || user.name === 'Guest Explorer') {
    return {
      allowed: false,
      error: 'Authenticated account required. Please sign in with your verified email or Google account to submit reports.',
      status: 'pending_review',
      isNegative: false,
      triggersCircuitBreaker: false,
      trustLevel: trust.trustLevel,
    };
  }

  // 3. Layer 1: Submission rate limit for probationary accounts (max 3 per hour)
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;
  const recentCount = trust.recentSubmissionsMs.filter((ts) => ts >= oneHourAgo).length;
  if (!existingReviewId && trust.trustLevel === 'probationary' && recentCount >= 3) {
    return {
      allowed: false,
      error: 'New accounts are limited to 3 reports per hour to prevent spam. Please try again shortly.',
      status: 'pending_review',
      isNegative: false,
      triggersCircuitBreaker: false,
      trustLevel: trust.trustLevel,
    };
  }

  // 4. Pillar 3: Automated Toxicity & Defamation Filter
  const toxicity = checkToxicityAndDefamation(comment);
  if (toxicity.blocked) {
    return {
      allowed: false,
      error: toxicity.reason,
      status: 'removed',
      isNegative: true,
      triggersCircuitBreaker: false,
      trustLevel: trust.trustLevel,
    };
  }

  // 5. Pillar 1: Mandatory Photo Evidence for Negative Claims
  const isNegative = isNegativeChecklistOrRating(checklist, rating);
  if (isNegative && photos.length === 0) {
    return {
      allowed: false,
      error:
        'Photo evidence is required when marking a feature as Inaccessible ("No") or leaving a negative report. Upload a real photo of the physical barrier.',
      status: 'pending_review',
      isNegative: true,
      triggersCircuitBreaker: false,
      trustLevel: trust.trustLevel,
    };
  }

  // 6. Pillar 3: Review-Bombing Circuit Breaker (3+ negative reports within 2-hour window)
  const twoHoursAgo = now - 2 * 60 * 60 * 1000;
  const recentNegativeCount = pin.reviews.filter(
    (r) =>
      r.id !== existingReviewId &&
      (r.isNegativeReport || r.rating <= 2) &&
      (r.createdAtMs ? r.createdAtMs >= twoHoursAgo : false)
  ).length;
  const triggersCircuitBreaker =
    Boolean(pin.brigadeFrozen) || (isNegative && recentNegativeCount >= 2);

  if (triggersCircuitBreaker) {
    return {
      allowed: true,
      status: 'pending_review',
      statusReason:
        'Anti-Brigading Circuit Breaker active: 3+ negative reports within 2 hours. Routed to human moderation queue.',
      isNegative,
      triggersCircuitBreaker: true,
      trustLevel: trust.trustLevel,
    };
  }

  // 7. Pillar 2: Probationary Queue for New Accounts on first 1-2 negative reports
  if (isNegative && trust.trustLevel === 'probationary' && trust.approvedReports < 1) {
    return {
      allowed: true,
      status: 'pending_review',
      statusReason:
        'Probationary account: Your first negative report is queued for quick community/moderator approval. Once approved, your account upgrades to Verified Contributor.',
      isNegative,
      triggersCircuitBreaker: false,
      trustLevel: trust.trustLevel,
    };
  }

  // Record submission timestamp
  saveUserTrustRecord(user.id, {
    ...trust,
    recentSubmissionsMs: [...trust.recentSubmissionsMs.filter((t) => t >= oneHourAgo), now],
  });

  return {
    allowed: true,
    status: 'published',
    isNegative,
    triggersCircuitBreaker: false,
    trustLevel: trust.trustLevel,
  };
}

// Moderation Queue Helpers (Layers 2, 3, 4)
export function getModerationQueue(): ModerationQueueItem[] {
  try {
    const raw = localStorage.getItem(MODERATION_QUEUE_KEY);
    return raw ? (JSON.parse(raw) as ModerationQueueItem[]) : [];
  } catch {
    return [];
  }
}

export function saveModerationQueue(items: ModerationQueueItem[]): void {
  try {
    localStorage.setItem(MODERATION_QUEUE_KEY, JSON.stringify(items));
  } catch {
    // ignore
  }
}

export function enqueueModerationItem(
  item: Omit<ModerationQueueItem, 'id' | 'createdAt' | 'status'>
): ModerationQueueItem {
  const newItem: ModerationQueueItem = {
    ...item,
    id: `mod-${Date.now()}`,
    createdAt: new Date().toISOString(),
    status: 'open',
  };
  const current = getModerationQueue();
  saveModerationQueue([newItem, ...current]);
  return newItem;
}

export function updateModerationItem(
  id: string,
  patch: Partial<ModerationQueueItem>
): ModerationQueueItem[] {
  const next = getModerationQueue().map((item) =>
    item.id === id ? { ...item, ...patch } : item
  );
  saveModerationQueue(next);
  return next;
}

export function applyModeratorDecision(
  item: ModerationQueueItem,
  decision: 'approve' | 'remove',
  enforcement: 'none' | 'warning' | 'suspended_7d' | 'banned' = 'none'
): void {
  updateModerationItem(item.id, {
    status: decision === 'approve' ? 'approved' : 'removed',
    enforcementApplied: enforcement,
  });

  const trust = getUserTrustRecord(item.reviewAuthorId);
  if (decision === 'approve') {
    const nextApproved = trust.approvedReports + 1;
    saveUserTrustRecord(item.reviewAuthorId, {
      ...trust,
      approvedReports: nextApproved,
      trustLevel: nextApproved >= 1 ? 'verified_contributor' : trust.trustLevel,
    });
  } else {
    let nextEnforcement: EnforcementStatus = trust.enforcement;
    let nextWarnings = trust.warningsCount;
    if (enforcement === 'warning') {
      nextWarnings += 1;
      nextEnforcement = 'warned';
    } else if (enforcement === 'suspended_7d') {
      nextEnforcement = 'suspended';
    } else if (enforcement === 'banned') {
      nextEnforcement = 'banned';
    }
    saveUserTrustRecord(item.reviewAuthorId, {
      ...trust,
      enforcement: nextEnforcement,
      warningsCount: nextWarnings,
    });
  }
}

// Review confirmation votes ("Still Accurate?" / "Flag Inaccurate")
export function getStoredReviewVotes(): Record<string, 'confirm' | 'inaccurate'> {
  try {
    const raw = localStorage.getItem(REVIEW_VOTES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveStoredReviewVote(
  reviewId: string,
  vote: 'confirm' | 'inaccurate' | null
): void {
  const votes = getStoredReviewVotes();
  if (!vote) delete votes[reviewId];
  else votes[reviewId] = vote;
  try {
    localStorage.setItem(REVIEW_VOTES_KEY, JSON.stringify(votes));
  } catch {
    // ignore
  }
}

/**
 * Pillar 4: Aggregates establishment verification summary so one isolated bad comment
 * cannot distort the establishment's overall reputation.
 */
export function getEstablishmentSummary(location: LocationPin): {
  verifiedContributorsCount: number;
  lastConfirmedLabel: string;
  consensusLabel: string;
  isStrongConsensus: boolean;
} {
  const tagConfirmations = location.tags.reduce(
    (sum, t) => sum + Math.max(0, t.confirmations - t.disputes),
    0
  );
  const publishedPositive = location.reviews.filter(
    (r) => (r.status ?? 'published') === 'published' && r.rating >= 4
  ).length;

  const verifiedContributorsCount = Math.max(
    publishedPositive,
    Math.min(12, Math.ceil(tagConfirmations / 2))
  );

  const lastDate = location.reviews[0]?.date || location.updatedAt?.split('T')[0] || 'Recently';
  const isStrongConsensus =
    location.averageRating >= 4.0 && verifiedContributorsCount >= 2;

  const consensusLabel = isStrongConsensus
    ? `Verified Accessible by ${verifiedContributorsCount} contributors`
    : location.averageRating >= 3.0
    ? `Partially Accessible • ${verifiedContributorsCount} community checks`
    : `Needs Accessibility Audit`;

  return {
    verifiedContributorsCount,
    lastConfirmedLabel: `Last confirmed ${lastDate}`,
    consensusLabel,
    isStrongConsensus,
  };
}
