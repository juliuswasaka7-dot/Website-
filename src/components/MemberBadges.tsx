import { BadgeCheck, Crown } from 'lucide-react';
import type { MembershipTier } from '../types/app';

export function BlueTickBadge({
  size = 'sm',
  showLabel = false,
}: {
  size?: 'xs' | 'sm' | 'md';
  showLabel?: boolean;
}) {
  const iconSize =
    size === 'xs' ? 'w-3.5 h-3.5' : size === 'md' ? 'w-5 h-5' : 'w-4 h-4';

  return (
    <span
      title="Verified by Administrator"
      aria-label="Verified member"
      className={`inline-flex items-center gap-1 shrink-0 ${
        showLabel
          ? 'px-2 py-0.5 rounded-full bg-sky-50 border border-sky-200 text-sky-700 text-[11px] font-semibold'
          : 'text-[#1D9BF0]'
      }`}
    >
      <BadgeCheck className={`${iconSize} fill-[#1D9BF0] text-white`} />
      {showLabel && <span>Verified</span>}
    </span>
  );
}

export function GoldPremiumBadge({
  size = 'sm',
}: {
  size?: 'xs' | 'sm';
}) {
  return (
    <span
      title="Confirmed Premium Member"
      aria-label="Premium Member"
      className={`inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-100 to-yellow-100 border border-amber-300 text-amber-900 font-bold shrink-0 ${
        size === 'xs' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-0.5 text-[11px]'
      }`}
    >
      <Crown className="w-3 h-3 text-amber-600 fill-amber-400" />
      <span>Premium</span>
    </span>
  );
}

export function MemberBadges({
  blueVerified,
  membershipTier,
  size = 'sm',
}: {
  blueVerified?: boolean;
  membershipTier?: MembershipTier;
  size?: 'xs' | 'sm';
}) {
  if (!blueVerified && membershipTier !== 'premium') return null;

  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap align-middle">
      {blueVerified && <BlueTickBadge size={size === 'xs' ? 'xs' : 'sm'} />}
      {membershipTier === 'premium' && <GoldPremiumBadge size={size} />}
    </span>
  );
}
