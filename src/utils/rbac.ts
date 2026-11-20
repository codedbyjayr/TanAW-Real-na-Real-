/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthUser } from './storage';

export type RbacRole =
  | 'guest'
  | 'contributor'
  | 'pwd_advocate'
  | 'business_owner'
  | 'moderator'
  | 'admin';

export type Permission =
  | 'view_map'
  | 'submit_report'
  | 'vote_tags'
  | 'pin_place'
  | 'report_abuse'
  | 'submit_appeal'
  | 'claim_listing'
  | 'post_owner_reply'
  | 'moderate_queue'
  | 'warn_suspend_user'
  | 'ban_user'
  | 'reset_seed_data'
  | 'manage_roles';

const ROLE_PERMISSIONS: Record<RbacRole, Permission[]> = {
  guest: ['view_map'],
  contributor: [
    'view_map',
    'submit_report',
    'vote_tags',
    'pin_place',
    'report_abuse',
    'submit_appeal',
  ],
  pwd_advocate: [
    'view_map',
    'submit_report',
    'vote_tags',
    'pin_place',
    'report_abuse',
    'submit_appeal',
  ],
  business_owner: [
    'view_map',
    'submit_report',
    'vote_tags',
    'pin_place',
    'report_abuse',
    'submit_appeal',
    'claim_listing',
    'post_owner_reply',
  ],
  moderator: [
    'view_map',
    'submit_report',
    'vote_tags',
    'pin_place',
    'report_abuse',
    'submit_appeal',
    'moderate_queue',
    'warn_suspend_user',
  ],
  admin: [
    'view_map',
    'submit_report',
    'vote_tags',
    'pin_place',
    'report_abuse',
    'submit_appeal',
    'claim_listing',
    'post_owner_reply',
    'moderate_queue',
    'warn_suspend_user',
    'ban_user',
    'reset_seed_data',
    'manage_roles',
  ],
};

export const ROLE_META: Record<
  RbacRole,
  { label: string; badgeClass: string; summary: string }
> = {
  guest: {
    label: 'Guest (Read-Only)',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-300',
    summary: 'Browse map and accessibility reports. Sign in to contribute.',
  },
  contributor: {
    label: 'Community Mapper',
    badgeClass: 'bg-sky-50 text-sky-900 border-sky-200',
    summary: 'Pin places, submit structured reports, vote on tags (1× weight), and flag abuse.',
  },
  pwd_advocate: {
    label: 'PWD / Caregiver Advocate',
    badgeClass: 'bg-emerald-50 text-emerald-900 border-emerald-200',
    summary: 'Full contributor access with 2× verification vote weight on accessibility tags.',
  },
  business_owner: {
    label: 'Verified Business Owner',
    badgeClass: 'bg-teal-50 text-teal-900 border-teal-200',
    summary: 'Claim establishment listings, upload facility photos, and pin official responses.',
  },
  moderator: {
    label: 'Community Moderator',
    badgeClass: 'bg-amber-50 text-amber-900 border-amber-300',
    summary: 'Review quarantined reports, approve probationary users, and issue warnings/suspensions.',
  },
  admin: {
    label: 'Platform Admin',
    badgeClass: 'bg-slate-900 text-white border-slate-900',
    summary: 'Full platform governance including permanent bans, seed resets, and role management.',
  },
};

export function resolveRbacRole(user: AuthUser | null | undefined): RbacRole {
  if (!user || !user.email || user.email === 'guest@tanaw.app' || user.name === 'Guest Explorer') {
    return 'guest';
  }
  switch (user.role) {
    case 'Admin':
      return 'admin';
    case 'Moderator':
      return 'moderator';
    case 'Business Owner':
      return 'business_owner';
    case 'PWD Member / Advocate':
    case 'Caregiver / Family':
      return 'pwd_advocate';
    default:
      return 'contributor';
  }
}

export function hasPermission(
  user: AuthUser | null | undefined,
  permission: Permission
): boolean {
  const role = resolveRbacRole(user);
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function getRolePermissions(user: AuthUser | null | undefined): Permission[] {
  return ROLE_PERMISSIONS[resolveRbacRole(user)];
}

export function getVoteWeight(user: AuthUser | null | undefined): number {
  const role = resolveRbacRole(user);
  if (role === 'guest') return 0;
  if (role === 'pwd_advocate' || role === 'moderator' || role === 'admin') return 2;
  return 1;
}
