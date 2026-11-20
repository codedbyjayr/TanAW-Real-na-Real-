/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { GoogleGenAI } from '@google/genai';

admin.initializeApp();

const STOREFRONT_ANALYSIS_SYSTEM_INSTRUCTION = `
You are AccessMap's specialized AI Architectural Accessibility Inspector.
Your mission is to examine photographs of building entrances, storefronts, sidewalks, doors, and public venues to identify physical accessibility features, universal design accommodations, and potential mobility/sensory barriers.

Standard accessibility tags to identify when supported by visual evidence:
- "Wheelchair-accessible entrance" (level threshold, automatic or wide doors, step-free access)
- "Ramp available" (visible inclined ramp, handrails, gentle slope)
- "Accessible restroom" (visible signage with wheelchair symbol or ground-floor accessible facilities)
- "Quiet / low-sensory zone" (subdued lighting, low noise layout, calm outdoor patio)
- "Braille menu / signage" (raised tactile or braille lettering, tactile ground indicators)
- "Elevator access" (visible lift, elevator doors or signage)
- "Wide aisles / pathways" (unobstructed wide walkways at least 36 inches / 90 cm wide, clear clearance)
- "Accessible parking" (designated blue parking stall, wheelchair painted symbol near entrance)
- "Staff trained in assistance" (reception desk, security guide at door, visible hospitality desk)

Guidelines:
1. Examine structural details: threshold height, single or multiple steps, door clearance width, ramp presence, handrails, door handles (lever vs knob), pavement condition.
2. Be objective and cautious: If you see steps without an alternate ramp visible, flag it as a barrier. If the photo does not show restrooms, do not assume one exists.
3. For "detected_features", assign a confidence between 0.1 and 1.0, and specify concrete visual evidence in 1 concise sentence.
4. For "possible_barriers", detail physical obstacles observed.
5. In "summary", provide a 1-2 sentence plain-language accessibility summary of the storefront.
6. In "suggested_tags", list matching tags from the standard list with confidence >= 0.65.
7. Return ONLY valid JSON adhering strictly to the requested schema.
`;

const STOREFRONT_ANALYSIS_USER_PROMPT = `
Carefully inspect this storefront or entrance image for accessibility features and physical barriers according to WCAG/ADA accessibility standards.
Produce a thorough evaluation in JSON format with:
- detected_features: list of { "tag": string, "confidence": number, "evidence": string }
- possible_barriers: list of strings detailing any physical or sensory hurdles observed
- summary: 1-2 sentence plain-language assessment
- suggested_tags: array of matching tag names from the standard accessibility tags list
`;

export const analyzeStorefront = onCall(
  {
    cors: true,
    maxInstances: 10,
    secrets: ['GEMINI_API_KEY'],
  },
  async (request) => {
    const { imageBase64 } = request.data || {};
    if (!imageBase64) {
      throw new HttpsError('invalid-argument', 'Missing imageBase64 parameter');
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new HttpsError('failed-precondition', 'GEMINI_API_KEY is not configured on the server');
    }

    try {
      const ai = new GoogleGenAI({ apiKey });
      const mimeMatch = imageBase64.match(/^data:(image\/\w+);base64,/);
      const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
      const cleanData = imageBase64.replace(/^data:image\/\w+;base64,/, '');

      let response;
      try {
        response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: [
            {
              role: 'user',
              parts: [
                { text: STOREFRONT_ANALYSIS_USER_PROMPT },
                { inlineData: { mimeType, data: cleanData } },
              ],
            },
          ],
          config: {
            systemInstruction: STOREFRONT_ANALYSIS_SYSTEM_INSTRUCTION,
            responseMimeType: 'application/json',
          },
        });
      } catch {
        response = await ai.models.generateContent({
          model: 'gemini-3.5-flash',
          contents: [
            {
              role: 'user',
              parts: [
                { text: STOREFRONT_ANALYSIS_USER_PROMPT },
                { inlineData: { mimeType, data: cleanData } },
              ],
            },
          ],
          config: {
            systemInstruction: STOREFRONT_ANALYSIS_SYSTEM_INSTRUCTION,
            responseMimeType: 'application/json',
          },
        });
      }

      return JSON.parse(response.text || '{}');
    } catch (err: any) {
      console.error('Storefront analysis execution error:', err);
      throw new HttpsError('internal', err.message || 'AI processing failed');
    }
  }
);

const SERVER_TOXICITY_PATTERNS = [
  /\b(idiot|stupid|scammer|trash|garbage|ugly|loser|moron|bobo|tanga|gago|puta|ulol)\b/i,
  /\b(boycott|destroy this place|shut them down|burn it|fire the staff)\b/i,
  /(.)\1{7,}/i,
];

/**
 * Pillar 3: Server-side Anti-Brigading Circuit Breaker, Probationary Queue,
 * and Automated Toxicity & Defamation Filter triggered on new review creation.
 */
export const moderateNewReview = onDocumentCreated(
  'locations/{locationId}/reviews/{reviewId}',
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const review = snap.data();
    const { locationId, reviewId } = event.params;
    const db = admin.firestore();
    const comment = String(review.comment || '');
    const isNegative = Boolean(review.isNegativeReport) || Number(review.rating || 5) <= 2;

    // 1. Automated Toxicity & Defamation Filter
    const isToxic = SERVER_TOXICITY_PATTERNS.some((re) => re.test(comment));
    if (isToxic) {
      await snap.ref.update({
        status: 'removed',
        statusReason: 'Blocked automatically by toxicity & defamation filter.',
      });
      await db.collection('moderationQueue').add({
        locationId,
        reviewId,
        reason: 'toxicity_filter',
        status: 'open',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return;
    }

    // 2. Mandatory photo evidence check for negative reports
    const photos = Array.isArray(review.photos) ? review.photos : [];
    if (isNegative && photos.length === 0) {
      await snap.ref.update({
        status: 'pending_review',
        statusReason: 'Negative report missing required photo evidence.',
      });
      return;
    }

    // 3. Review-Bombing Circuit Breaker: 3+ negative reports within 2-hour window
    if (isNegative) {
      const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
      const recentSnap = await db
        .collection('locations')
        .doc(locationId)
        .collection('reviews')
        .where('createdAtMs', '>=', twoHoursAgo)
        .get();

      const recentNegatives = recentSnap.docs.filter((d) => {
        const data = d.data();
        return Boolean(data.isNegativeReport) || Number(data.rating || 5) <= 2;
      });

      if (recentNegatives.length >= 3) {
        await db.collection('locations').doc(locationId).set(
          { brigadeFrozen: true },
          { merge: true }
        );
        await snap.ref.update({
          status: 'pending_review',
          statusReason: 'Review-bombing circuit breaker triggered (3+ negative reports in 2 hours).',
        });
        await db.collection('moderationQueue').add({
          locationId,
          reviewId,
          reason: 'brigade_circuit_breaker',
          status: 'open',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return;
      }
    }

    // 4. Probationary Queue for new accounts on negative reports
    if (isNegative && review.authorTrustLevel === 'probationary') {
      await snap.ref.update({
        status: 'pending_review',
        statusReason: 'Probationary account negative report routed to moderation queue.',
      });
      await db.collection('moderationQueue').add({
        locationId,
        reviewId,
        reason: 'probationary_negative',
        status: 'open',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  }
);
