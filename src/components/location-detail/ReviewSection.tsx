/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import {
  ChecklistStatus,
  ClaimedOwnerInfo,
  LocationPin,
  ModerationQueueItem,
  OwnerResponse,
  ReportReason,
  Review,
  StructuredChecklist,
} from '../../types/accessibility';
import { AuthUser } from '../../utils/storage';
import { hasPermission } from '../../utils/rbac';
import {
  CHECKLIST_ITEMS,
  REPORT_REASONS,
  applyModeratorDecision,
  checkProximityMeters,
  computeChecklistRating,
  enqueueModerationItem,
  evaluateReviewSubmission,
  getModerationQueue,
  getStoredReviewVotes,
  getUserTrustRecord,
  isNegativeChecklistOrRating,
  saveStoredReviewVote,
  updateModerationItem,
} from '../../utils/reviewModeration';
import { StarRating } from '../ui/StarRating';
import {
  MessageSquare,
  PlusCircle,
  Calendar,
  Send,
  Camera,
  MapPin,
  ShieldCheck,
  AlertTriangle,
  ThumbsUp,
  Flag,
  Building2,
  Scale,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  Edit3,
  Clock,
} from 'lucide-react';

interface ReviewSectionProps {
  location: LocationPin;
  currentUser: AuthUser;
  onAddOrUpdateReview: (
    pinId: string,
    review: Omit<Review, 'id' | 'date'>,
    existingReviewId?: string,
    triggersCircuitBreaker?: boolean
  ) => void;
  onVoteReview: (pinId: string, reviewId: string, vote: 'confirm' | 'inaccurate') => void;
  onQuarantineReview: (pinId: string, reviewId: string, reason: string) => void;
  onClaimOwner: (pinId: string, ownerInfo: ClaimedOwnerInfo) => void;
  onOwnerReply: (pinId: string, reviewId: string, response: OwnerResponse) => void;
  onModerateReview: (
    pinId: string,
    reviewId: string,
    newStatus: 'published' | 'removed'
  ) => void;
  onAnnounce: (msg: string) => void;
}

const DEFAULT_CHECKLIST: StructuredChecklist = {
  stepFreeEntrance: 'yes',
  wheelchairRamp: 'yes',
  accessibleRestroom: 'partial',
  tactilePaving: 'partial',
  wideDoorways: 'yes',
};

export const ReviewSection: React.FC<ReviewSectionProps> = ({
  location,
  currentUser,
  onAddOrUpdateReview,
  onVoteReview,
  onQuarantineReview,
  onClaimOwner,
  onOwnerReply,
  onModerateReview,
  onAnnounce,
}) => {
  const existingUserReview = useMemo(
    () =>
      location.reviews.find(
        (r) =>
          (r.authorId && r.authorId === currentUser.id) ||
          r.authorName.toLowerCase() === currentUser.name.toLowerCase()
      ),
    [location.reviews, currentUser.id, currentUser.name]
  );

  const trustRecord = getUserTrustRecord(currentUser.id);
  const storedReviewVotes = getStoredReviewVotes();
  const canModerate = hasPermission(currentUser, 'moderate_queue');
  const canBan = hasPermission(currentUser, 'ban_user');
  const canClaimListing = hasPermission(currentUser, 'claim_listing');
  const canSubmitReport = hasPermission(currentUser, 'submit_report');
  const isClaimedByCurrentUser =
    canClaimListing && location.claimedOwner?.ownerId === currentUser.id;

  // Report Form State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [checklist, setChecklist] = useState<StructuredChecklist>(
    existingUserReview?.checklist || DEFAULT_CHECKLIST
  );
  const [comment, setComment] = useState(existingUserReview?.comment || '');
  const [photos, setPhotos] = useState<string[]>(existingUserReview?.photos || []);
  const [gpsStatus, setGpsStatus] = useState<{
    checking: boolean;
    onSiteVerified: boolean;
    distanceMeters?: number;
    note?: string;
  }>({
    checking: false,
    onSiteVerified: Boolean(existingUserReview?.onSiteVerified),
    distanceMeters: existingUserReview?.distanceMeters,
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [formNotice, setFormNotice] = useState<string | null>(null);

  // Layer 2: Community Report / Quarantine Modal State
  const [reportingReviewId, setReportingReviewId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState<ReportReason>('misleading_information');
  const [reportExplanation, setReportExplanation] = useState('');

  // Pillar 5: Verified Business Owner Claim & Reply State
  const [showClaimForm, setShowClaimForm] = useState(false);
  const [claimMethod, setClaimMethod] = useState<ClaimedOwnerInfo['verifiedVia']>('Business Permit');
  const [replyingReviewId, setReplyingReviewId] = useState<string | null>(null);
  const [ownerReplyText, setOwnerReplyText] = useState('');
  const [ownerReplyPhotos, setOwnerReplyPhotos] = useState<string[]>([]);

  // Layer 3 & 4: Human Moderation & Appeals Drawer Toggle
  const [showModQueue, setShowModQueue] = useState(false);
  const [modQueue, setModQueue] = useState<ModerationQueueItem[]>(() => getModerationQueue());
  const [appealingItemId, setAppealingItemId] = useState<string | null>(null);
  const [appealText, setAppealText] = useState('');
  const [expandedCollapsedIds, setExpandedCollapsedIds] = useState<Record<string, boolean>>({});

  const computedRating = computeChecklistRating(checklist);
  const requiresPhotoEvidence = isNegativeChecklistOrRating(checklist, computedRating);

  const handlePhotoUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setter((prev) => [reader.result as string, ...prev].slice(0, 3));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleVerifyGps = () => {
    if (!navigator.geolocation) {
      setGpsStatus({
        checking: false,
        onSiteVerified: false,
        note: 'Browser geolocation not supported.',
      });
      return;
    }
    setGpsStatus({ checking: true, onSiteVerified: false });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const res = checkProximityMeters(
          pos.coords.latitude,
          pos.coords.longitude,
          location.lat,
          location.lng
        );
        setGpsStatus({
          checking: false,
          onSiteVerified: res.onSiteVerified,
          distanceMeters: res.distanceMeters,
          note: res.onSiteVerified
            ? `On-Site Verified (${res.distanceMeters}m from pin — higher ranking weight)`
            : `Remote submission (${res.distanceMeters}m away — within 200m required for On-Site badge)`,
        });
        onAnnounce(res.onSiteVerified ? 'Location On-Site Verified.' : 'Recorded as remote check.');
      },
      () => {
        setGpsStatus({
          checking: false,
          onSiteVerified: false,
          note: 'Location permission denied. Submitting as remote report.',
        });
      },
      { timeout: 6000 }
    );
  };

  const handleReportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormNotice(null);

    const guard = evaluateReviewSubmission({
      pin: location,
      user: currentUser,
      checklist,
      comment,
      photos,
      rating: computedRating,
      existingReviewId: existingUserReview?.id,
    });

    if (!guard.allowed) {
      setFormError(guard.error || 'Submission blocked.');
      onAnnounce(guard.error || 'Submission blocked.');
      return;
    }

    const reviewPayload: Omit<Review, 'id' | 'date'> = {
      authorId: currentUser.id,
      authorName: currentUser.name,
      authorTrustLevel: guard.trustLevel,
      rating: computedRating,
      comment: comment.trim() || 'Submitted structured accessibility checklist.',
      createdAtMs: Date.now(),
      photos,
      checklist,
      isNegativeReport: guard.isNegative,
      onSiteVerified: gpsStatus.onSiteVerified,
      distanceMeters: gpsStatus.distanceMeters,
      status: guard.status,
      statusReason: guard.statusReason,
      confirmations: existingUserReview?.confirmations ?? 0,
      inaccurateFlags: existingUserReview?.inaccurateFlags ?? 0,
      ownerResponse: existingUserReview?.ownerResponse,
    };

    onAddOrUpdateReview(
      location.id,
      reviewPayload,
      existingUserReview?.id,
      guard.triggersCircuitBreaker
    );

    if (guard.status === 'pending_review') {
      enqueueModerationItem({
        pinId: location.id,
        pinName: location.name,
        reviewId: existingUserReview?.id || `rev-pending-${Date.now()}`,
        reviewAuthorId: currentUser.id,
        reviewAuthorName: currentUser.name,
        reviewComment: reviewPayload.comment,
        reviewPhotos: photos,
        reportedBy: 'Automated Safety Guard',
        reason: guard.triggersCircuitBreaker
          ? 'brigade_circuit_breaker'
          : 'probationary_negative',
        explanation: guard.statusReason || 'Queued for human verification.',
      });
      setModQueue(getModerationQueue());
      setFormNotice(
        guard.statusReason || 'Report queued for human verification before public publishing.'
      );
    } else {
      setFormNotice(
        existingUserReview
          ? 'Your accessibility report has been updated.'
          : 'Structured accessibility report published!'
      );
    }

    setIsFormOpen(false);
    onAnnounce(
      guard.status === 'pending_review'
        ? 'Report routed to verification queue.'
        : 'Accessibility report published.'
    );
  };

  const handleQuarantineSubmit = (rev: Review) => {
    if (!reportExplanation.trim()) return;
    onQuarantineReview(location.id, rev.id, `Flagged for ${reportReason}: ${reportExplanation}`);
    enqueueModerationItem({
      pinId: location.id,
      pinName: location.name,
      reviewId: rev.id,
      reviewAuthorId: rev.authorId || rev.authorName,
      reviewAuthorName: rev.authorName,
      reviewComment: rev.comment,
      reviewPhotos: rev.photos,
      reportedBy: currentUser.name,
      reason: reportReason,
      explanation: reportExplanation.trim(),
      isOwnerDispute: isClaimedByCurrentUser,
    });
    setModQueue(getModerationQueue());
    setReportingReviewId(null);
    setReportExplanation('');
    onAnnounce('Report quarantined as Under Review and sent to human moderators.');
  };

  const handleOwnerReplySubmit = (reviewId: string) => {
    if (!ownerReplyText.trim()) return;
    onOwnerReply(location.id, reviewId, {
      ownerName: location.claimedOwner?.ownerName || currentUser.name,
      message: ownerReplyText.trim(),
      date: new Date().toISOString().split('T')[0],
      officialPhotos: ownerReplyPhotos,
    });
    setReplyingReviewId(null);
    setOwnerReplyText('');
    setOwnerReplyPhotos([]);
    onAnnounce('Pinned Official Owner Response published.');
  };

  // Sort reviews: On-Site Verified & higher community confirmations rank first; collapsed/disputed at bottom
  const sortedReviews = useMemo(() => {
    return [...location.reviews].sort((a, b) => {
      const aScore =
        (a.onSiteVerified ? 10 : 0) + (a.confirmations || 0) * 2 - (a.inaccurateFlags || 0) * 3;
      const bScore =
        (b.onSiteVerified ? 10 : 0) + (b.confirmations || 0) * 2 - (b.inaccurateFlags || 0) * 3;
      return bScore - aScore;
    });
  }, [location.reviews]);

  const pinModQueue = modQueue.filter((item) => item.pinId === location.id);
  const openQueueCount = pinModQueue.filter((i) => i.status === 'open' || i.status === 'appealed').length;

  // Strong community consensus: >= 3 positive confirmations on tags or reviews
  const positiveConfirmationsTotal = location.tags.reduce(
    (sum, t) => sum + Math.max(0, t.confirmations),
    0
  );

  return (
    <div className="space-y-4 pt-3 border-t border-slate-200">
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-slate-700" />
          <h3 className="text-sm font-bold text-slate-900">
            Verified Reports ({sortedReviews.filter((r) => (r.status ?? 'published') === 'published').length})
          </h3>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setModQueue(getModerationQueue());
              setShowModQueue(!showModQueue);
            }}
            className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold border flex items-center gap-1 cursor-pointer transition-colors ${
              showModQueue
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
            title="Human Moderation Queue & Appeals"
          >
            <Scale className="w-3.5 h-3.5" />
            <span>Moderation</span>
            {openQueueCount > 0 && (
              <span className="px-1.5 rounded-full bg-amber-500 text-white text-[10px]">
                {openQueueCount}
              </span>
            )}
          </button>

          {!isFormOpen && canSubmitReport && (
            <button
              type="button"
              onClick={() => {
                setFormError(null);
                setIsFormOpen(true);
              }}
              className="px-3 py-1.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold flex items-center gap-1 cursor-pointer shadow-2xs"
            >
              {existingUserReview ? (
                <>
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Edit My Report</span>
                </>
              ) : (
                <>
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Submit Report</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Status Notice Banner */}
      {formNotice && (
        <div
          role="status"
          className="p-3 rounded-xl bg-teal-50 border border-teal-200 text-xs text-teal-950 font-medium flex items-center justify-between gap-2"
        >
          <span>{formNotice}</span>
          <button
            type="button"
            onClick={() => setFormNotice(null)}
            className="text-teal-700 font-bold text-xs cursor-pointer"
          >
            OK
          </button>
        </div>
      )}

      {/* Pillar 5: Verified Business Owner Claim Strip */}
      <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
        {location.claimedOwner ? (
          <div className="flex items-center gap-2 text-teal-900">
            <Building2 className="w-4 h-4 text-teal-700 shrink-0" />
            <span>
              <strong>{location.claimedOwner.ownerName}</strong> · Verified via{' '}
              {location.claimedOwner.verifiedVia}
            </span>
          </div>
        ) : canClaimListing ? (
          <>
            <span className="text-slate-600">Verified Business Owner? Claim to post official responses.</span>
            <button
              type="button"
              onClick={() => setShowClaimForm(!showClaimForm)}
              className="text-teal-700 font-bold hover:underline cursor-pointer"
            >
              Claim Listing
            </button>
          </>
        ) : (
          <span className="text-slate-500 text-[11px]">
            Establishment claiming is restricted to verified <strong>Business Owner</strong> accounts.
          </span>
        )}

        {showClaimForm && !location.claimedOwner && (
          <div className="w-full pt-2 mt-2 border-t border-slate-200 flex flex-wrap items-center gap-2">
            <select
              value={claimMethod}
              onChange={(e) => setClaimMethod(e.target.value as ClaimedOwnerInfo['verifiedVia'])}
              className="flex-1 min-w-[160px] px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
            >
              <option value="Business Permit">Verify via Business Permit</option>
              <option value="Official Social Media">Verify via Official Social Media</option>
              <option value="On-Site Verification">Verify via On-Site Check</option>
            </select>
            <button
              type="button"
              onClick={() => {
                onClaimOwner(location.id, {
                  ownerId: currentUser.id,
                  ownerName: currentUser.name,
                  verifiedVia: claimMethod,
                  verifiedAt: new Date().toISOString().split('T')[0],
                });
                setShowClaimForm(false);
                onAnnounce(`Claimed ${location.name} as Verified Business Owner.`);
              }}
              className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold cursor-pointer"
            >
              Verify Owner
            </button>
          </div>
        )}
      </div>

      {/* Layer 3 & 4: Human Moderation Queue & Fair Enforcement / Appeals Panel */}
      {showModQueue && (
        <div className="p-3.5 rounded-2xl bg-slate-900 text-slate-100 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Scale className="w-4 h-4 text-amber-400" />
              <h4 className="text-xs font-extrabold uppercase tracking-wider">
                Human Verification Queue &amp; Appeals ({pinModQueue.length})
              </h4>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
              Your Trust: {trustRecord.trustLevel.replace('_', ' ')}
            </span>
          </div>

          {pinModQueue.length === 0 ? (
            <p className="text-xs text-slate-400">
              No quarantined or pending reports for this establishment.
            </p>
          ) : (
            <div className="space-y-2.5">
              {pinModQueue.map((item) => (
                <div
                  key={item.id}
                  className="p-3 rounded-xl bg-slate-800/90 border border-slate-700 space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-white">{item.reviewAuthorName}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold uppercase">
                      {item.status} · {item.reason.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <p className="text-slate-300 text-[11px]">“{item.reviewComment}”</p>
                  <p className="text-[10px] text-slate-400">
                    Reported by {item.reportedBy}: {item.explanation}
                  </p>
                  {item.reviewPhotos && item.reviewPhotos.length > 0 && (
                    <img
                      src={item.reviewPhotos[0]}
                      alt="Submitted barrier evidence"
                      className="h-20 rounded-lg object-cover border border-slate-600"
                    />
                  )}
                  {item.appealNote && (
                    <div className="p-2 rounded-lg bg-sky-950/60 border border-sky-700 text-[11px] text-sky-200">
                      <strong>User Appeal:</strong> {item.appealNote}
                    </div>
                  )}

                  {/* Layer 3 & 4 Actions: RBAC-gated to Moderators & Admins; Contributors can only Appeal their own removed items */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {canModerate && (item.status === 'open' || item.status === 'appealed') && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            applyModeratorDecision(item, 'approve', 'none');
                            onModerateReview(location.id, item.reviewId, 'published');
                            setModQueue(getModerationQueue());
                            onAnnounce('Report approved and contributor upgraded to Verified Contributor.');
                          }}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Approve &amp; Verify User</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            applyModeratorDecision(item, 'remove', 'warning');
                            onModerateReview(location.id, item.reviewId, 'removed');
                            setModQueue(getModerationQueue());
                            onAnnounce('Report removed with warning issued.');
                          }}
                          className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-bold cursor-pointer"
                        >
                          Remove + Warn
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            applyModeratorDecision(item, 'remove', 'suspended_7d');
                            onModerateReview(location.id, item.reviewId, 'removed');
                            setModQueue(getModerationQueue());
                            onAnnounce('Report removed and account temporarily suspended.');
                          }}
                          className="px-2.5 py-1 rounded-lg bg-rose-700 hover:bg-rose-600 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <XCircle className="w-3 h-3" />
                          <span>Suspend</span>
                        </button>
                        {canBan && (
                          <button
                            type="button"
                            onClick={() => {
                              applyModeratorDecision(item, 'remove', 'banned');
                              onModerateReview(location.id, item.reviewId, 'removed');
                              setModQueue(getModerationQueue());
                              onAnnounce('Report removed and account permanently banned.');
                            }}
                            className="px-2.5 py-1 rounded-lg bg-black hover:bg-slate-950 text-rose-300 border border-rose-700 text-[11px] font-bold cursor-pointer"
                          >
                            Permanent Ban
                          </button>
                        )}
                      </>
                    )}

                    {!canModerate && item.status === 'open' && (
                      <span className="text-[10px] text-slate-400">
                        Awaiting Moderator / Admin review
                      </span>
                    )}

                    {item.status === 'removed' && (
                      <button
                        type="button"
                        onClick={() => setAppealingItemId(item.id)}
                        className="px-2.5 py-1 rounded-lg bg-sky-700 hover:bg-sky-600 text-white text-[11px] font-bold cursor-pointer"
                      >
                        Submit Appeal
                      </button>
                    )}
                  </div>

                  {appealingItemId === item.id && (
                    <div className="pt-2 flex gap-1.5">
                      <input
                        type="text"
                        value={appealText}
                        onChange={(e) => setAppealText(e.target.value)}
                        placeholder="Provide context for your appeal..."
                        className="flex-1 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-600 text-white text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (!appealText.trim()) return;
                          setModQueue(
                            updateModerationItem(item.id, {
                              status: 'appealed',
                              appealNote: appealText.trim(),
                            })
                          );
                          setAppealingItemId(null);
                          setAppealText('');
                          onAnnounce('Appeal submitted for human moderator review.');
                        }}
                        className="px-2.5 py-1 rounded-lg bg-sky-500 text-white text-xs font-bold cursor-pointer"
                      >
                        Send
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Pillar 1 & 2: Structured Checklist + Mandatory Photo Evidence + GPS Proximity Form */}
      {isFormOpen && (
        <form
          onSubmit={handleReportSubmit}
          className="p-4 bg-white rounded-2xl border-2 border-slate-900 shadow-sm space-y-3.5"
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-900">
                {existingUserReview ? 'Edit Your Accessibility Report' : 'Structured Accessibility Checklist'}
              </h4>
              <p className="text-[11px] text-slate-500">
                Posting as <strong>{currentUser.name}</strong> ({trustRecord.trustLevel.replace('_', ' ')})
              </p>
            </div>
            <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-800 text-xs font-extrabold">
              Score: {computedRating.toFixed(1)}★
            </span>
          </div>

          {/* Structured Factual Checklist (Yes / Partial / No) */}
          <div className="space-y-2">
            {CHECKLIST_ITEMS.map(({ key, label }) => {
              const val = checklist[key];
              return (
                <div
                  key={key}
                  className="flex items-center justify-between gap-2 p-2 rounded-xl bg-slate-50 border border-slate-200/80"
                >
                  <span className="text-xs font-semibold text-slate-800">{label}</span>
                  <div className="flex items-center gap-1" role="group" aria-label={label}>
                    {(['yes', 'partial', 'no'] as ChecklistStatus[]).map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        aria-pressed={val === opt}
                        onClick={() => setChecklist({ ...checklist, [key]: opt })}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold capitalize transition-all cursor-pointer ${
                          val === opt
                            ? opt === 'yes'
                              ? 'bg-emerald-700 text-white'
                              : opt === 'partial'
                              ? 'bg-amber-600 text-white'
                              : 'bg-rose-700 text-white'
                            : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pillar 1: GPS Proximity Verification ("On-Site Verified") */}
          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs min-w-0">
              <MapPin
                className={`w-4 h-4 shrink-0 ${
                  gpsStatus.onSiteVerified ? 'text-emerald-700' : 'text-slate-500'
                }`}
              />
              <span className="text-slate-700 text-[11px] truncate">
                {gpsStatus.note || 'Verify GPS within 200m for On-Site Verified badge'}
              </span>
            </div>
            <button
              type="button"
              onClick={handleVerifyGps}
              disabled={gpsStatus.checking}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer shrink-0 ${
                gpsStatus.onSiteVerified
                  ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                  : 'bg-white border border-slate-300 text-slate-800 hover:bg-slate-100'
              }`}
            >
              {gpsStatus.checking
                ? 'Checking...'
                : gpsStatus.onSiteVerified
                ? '✓ On-Site Verified'
                : 'Verify On-Site'}
            </button>
          </div>

          {/* Pillar 1: Mandatory Photo Evidence for Negative Claims */}
          <div
            className={`p-3 rounded-xl border space-y-2 ${
              requiresPhotoEvidence && photos.length === 0
                ? 'bg-rose-50/80 border-rose-300'
                : 'bg-slate-50 border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5 text-teal-700" />
                <span>
                  Photo Evidence{' '}
                  {requiresPhotoEvidence ? (
                    <span className="text-rose-700">(Required for “No” / Barrier claim)</span>
                  ) : (
                    <span className="text-slate-400 font-normal">(Optional)</span>
                  )}
                </span>
              </span>
              <label className="px-2.5 py-1 rounded-lg bg-slate-900 text-white text-[11px] font-bold cursor-pointer">
                Upload Photo
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => handlePhotoUpload(e, setPhotos)}
                  className="hidden"
                />
              </label>
            </div>
            {photos.length > 0 && (
              <div className="flex gap-2">
                {photos.map((src, i) => (
                  <img
                    key={i}
                    src={src}
                    alt={`Uploaded evidence ${i + 1}`}
                    className="w-16 h-16 rounded-lg object-cover border border-slate-300"
                  />
                ))}
              </div>
            )}
          </div>

          {/* Concise Factual Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Factual Accessibility Notes (Filtered for Harassment/Defamation)
            </label>
            <textarea
              rows={2}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Describe physical ramp slope, step height, doorway clearance, or restroom grab bars..."
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs sm:text-sm bg-white"
            />
          </div>

          {formError && (
            <div
              role="alert"
              className="p-2.5 rounded-xl bg-rose-50 border border-rose-300 text-rose-900 text-xs font-semibold flex items-start gap-2"
            >
              <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{existingUserReview ? 'Update Report' : 'Submit Verified Report'}</span>
            </button>
          </div>
        </form>
      )}

      {/* Existing Reports List */}
      <div className="space-y-3">
        {sortedReviews.length === 0 ? (
          <p className="text-xs text-slate-400 italic py-2">
            No accessibility reports yet. Submit the first structured checklist above!
          </p>
        ) : (
          sortedReviews.map((rev) => {
            const status = rev.status ?? 'published';
            if (status === 'removed') return null;

            // Pillar 5: Quarantined / Pending Review state hidden from public view
            if (status === 'under_review' || status === 'pending_review') {
              return (
                <div
                  key={rev.id}
                  className="p-3 rounded-xl bg-amber-50/70 border border-amber-200 text-xs text-amber-950 flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-700 shrink-0" />
                    <div>
                      <span className="font-bold">
                        {status === 'under_review'
                          ? 'Report Under Review (Quarantined)'
                          : 'Report Pending Verification'}
                      </span>
                      <p className="text-[11px] text-amber-900">
                        Hidden from public view while moderators verify photo evidence.
                      </p>
                    </div>
                  </div>
                </div>
              );
            }

            // Pillar 4: Auto-collapse isolated unverified negative claim when 3+ verified contributors confirm accessibility
            const isAutoCollapsed =
              (rev.isNegativeReport || rev.rating <= 2) &&
              !rev.onSiteVerified &&
              (positiveConfirmationsTotal >= 3 || (rev.inaccurateFlags || 0) >= 2) &&
              !expandedCollapsedIds[rev.id];

            if (isAutoCollapsed) {
              return (
                <div
                  key={rev.id}
                  className="p-3 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-between gap-2 text-xs text-slate-600"
                >
                  <span>
                    Isolated negative report by <strong>{rev.authorName}</strong> collapsed by community consensus.
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedCollapsedIds((prev) => ({ ...prev, [rev.id]: true }))
                    }
                    className="text-slate-800 font-bold flex items-center gap-0.5 cursor-pointer shrink-0"
                  >
                    <span>Show</span>
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            }

            const userVote = storedReviewVotes[rev.id];

            return (
              <div
                key={rev.id}
                className="p-3.5 bg-white rounded-2xl border border-slate-200 space-y-2.5 shadow-2xs"
              >
                {/* Report Header + On-Site Verified Badge */}
                <div className="flex items-start justify-between gap-2 text-xs">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-bold text-slate-900">{rev.authorName}</span>
                    {rev.onSiteVerified && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 text-[10px] font-extrabold border border-emerald-300">
                        <ShieldCheck className="w-3 h-3" />
                        On-Site Verified
                      </span>
                    )}
                    {rev.authorTrustLevel === 'verified_contributor' && (
                      <span className="px-1.5 py-0.5 rounded-full bg-sky-50 text-sky-800 text-[10px] font-bold border border-sky-200">
                        Verified Contributor
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-slate-400 text-[11px] shrink-0">
                    <Calendar className="w-3 h-3" />
                    <span>{rev.date}</span>
                  </div>
                </div>

                {/* Structured Checklist Badges */}
                {rev.checklist ? (
                  <div className="flex flex-wrap gap-1">
                    {CHECKLIST_ITEMS.map(({ key, shortLabel }) => {
                      const val = rev.checklist![key];
                      return (
                        <span
                          key={key}
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                            val === 'yes'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : val === 'partial'
                              ? 'bg-amber-50 text-amber-800 border-amber-200'
                              : 'bg-rose-50 text-rose-800 border-rose-200'
                          }`}
                        >
                          {shortLabel}: {val.toUpperCase()}
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-amber-500">
                    <StarRating value={rev.rating} size="sm" showLabel labelSuffix="★" />
                  </div>
                )}

                <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">{rev.comment}</p>

                {/* Evidence Photos */}
                {rev.photos && rev.photos.length > 0 && (
                  <div className="flex gap-2">
                    {rev.photos.map((src, idx) => (
                      <img
                        key={idx}
                        src={src}
                        alt={`Accessibility evidence ${idx + 1}`}
                        className="w-20 h-16 rounded-lg object-cover border border-slate-200"
                      />
                    ))}
                  </div>
                )}

                {/* Pillar 5: Pinned Official Owner Response */}
                {rev.ownerResponse && (
                  <div className="p-3 rounded-xl bg-teal-50/80 border border-teal-200 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-bold text-teal-900">
                      <span className="inline-flex items-center gap-1">
                        <Building2 className="w-3.5 h-3.5" />
                        Official Owner Response · {rev.ownerResponse.ownerName}
                      </span>
                      <span className="text-teal-700 font-normal">{rev.ownerResponse.date}</span>
                    </div>
                    <p className="text-xs text-teal-950">{rev.ownerResponse.message}</p>
                    {rev.ownerResponse.officialPhotos && rev.ownerResponse.officialPhotos.length > 0 && (
                      <div className="flex gap-2 pt-1">
                        {rev.ownerResponse.officialPhotos.map((src, i) => (
                          <img
                            key={i}
                            src={src}
                            alt="Official owner facility photo"
                            className="w-16 h-14 rounded-lg object-cover border border-teal-300"
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Pillar 4 & Layer 2: "Still Accurate?" Voting + Quarantine Flag + Owner Reply */}
                <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        saveStoredReviewVote(rev.id, userVote === 'confirm' ? null : 'confirm');
                        onVoteReview(location.id, rev.id, 'confirm');
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 border cursor-pointer transition-colors ${
                        userVote === 'confirm'
                          ? 'bg-emerald-700 text-white border-emerald-700'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-emerald-50'
                      }`}
                    >
                      <ThumbsUp className="w-3 h-3" />
                      <span>Confirm ({rev.confirmations || 0})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        saveStoredReviewVote(
                          rev.id,
                          userVote === 'inaccurate' ? null : 'inaccurate'
                        );
                        onVoteReview(location.id, rev.id, 'inaccurate');
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 border cursor-pointer transition-colors ${
                        userVote === 'inaccurate'
                          ? 'bg-amber-600 text-white border-amber-600'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-amber-50'
                      }`}
                    >
                      <span>Flag Inaccurate ({rev.inaccurateFlags || 0})</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    {isClaimedByCurrentUser && !rev.ownerResponse && (
                      <button
                        type="button"
                        onClick={() =>
                          setReplyingReviewId(replyingReviewId === rev.id ? null : rev.id)
                        }
                        className="text-[11px] font-bold text-teal-700 hover:underline cursor-pointer"
                      >
                        Official Reply
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() =>
                        setReportingReviewId(reportingReviewId === rev.id ? null : rev.id)
                      }
                      className="text-[11px] font-semibold text-rose-600 hover:text-rose-800 flex items-center gap-1 cursor-pointer"
                      title="Report False Info or Harassment — immediately quarantines comment for moderation"
                    >
                      <Flag className="w-3 h-3" />
                      <span>Report</span>
                    </button>
                  </div>
                </div>

                {/* Layer 2: Quarantine Report Form */}
                {reportingReviewId === rev.id && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 space-y-2 text-xs">
                    <div className="font-bold text-rose-900">
                      Report False Info / Harassment (Quarantines immediately)
                    </div>
                    <select
                      value={reportReason}
                      onChange={(e) => setReportReason(e.target.value as ReportReason)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-rose-300 bg-white text-xs"
                    >
                      {REPORT_REASONS.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={reportExplanation}
                      onChange={(e) => setReportExplanation(e.target.value)}
                      placeholder="Briefly explain why this report is false, harassing, or misleading..."
                      className="w-full px-2.5 py-1.5 rounded-lg border border-rose-300 bg-white text-xs"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setReportingReviewId(null)}
                        className="text-slate-600 text-xs cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleQuarantineSubmit(rev)}
                        className="px-3 py-1 rounded-lg bg-rose-700 text-white text-xs font-bold cursor-pointer"
                      >
                        Quarantine &amp; Send to Moderators
                      </button>
                    </div>
                  </div>
                )}

                {/* Pillar 5: Verified Owner Official Reply Form */}
                {replyingReviewId === rev.id && (
                  <div className="p-3 rounded-xl bg-teal-50 border border-teal-200 space-y-2 text-xs">
                    <div className="font-bold text-teal-900">Post Pinned Official Owner Response</div>
                    <textarea
                      rows={2}
                      value={ownerReplyText}
                      onChange={(e) => setOwnerReplyText(e.target.value)}
                      placeholder="Share accessibility updates, ramp upgrades, or clarify entrance details..."
                      className="w-full px-2.5 py-1.5 rounded-lg border border-teal-300 bg-white text-xs"
                    />
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-[11px] font-bold text-teal-800 underline cursor-pointer">
                        + Attach Official Facility Photo
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handlePhotoUpload(e, setOwnerReplyPhotos)}
                          className="hidden"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => handleOwnerReplySubmit(rev.id)}
                        className="px-3 py-1 rounded-lg bg-teal-700 text-white text-xs font-bold cursor-pointer"
                      >
                        Pin Official Response
                      </button>
                    </div>
                  </div>
                )}

                {expandedCollapsedIds[rev.id] && (
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedCollapsedIds((prev) => ({ ...prev, [rev.id]: false }))
                    }
                    className="text-[11px] text-slate-400 hover:text-slate-700 flex items-center gap-0.5 cursor-pointer"
                  >
                    <ChevronUp className="w-3 h-3" />
                    <span>Collapse</span>
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
