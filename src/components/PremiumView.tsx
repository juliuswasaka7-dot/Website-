import { Check, Crown, Lock, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getPremiumWhatsAppEnquiryUrl } from '../lib/whatsapp';
import {
  FREE_DAILY_LIKES_LIMIT,
  FREE_DAILY_MESSAGES_LIMIT,
  PREMIUM_DAILY_LIKES_LIMIT,
  type ViewRoute,
} from '../types/app';
import { GoldPremiumBadge } from './MemberBadges';

interface PremiumViewProps {
  onNavigate: (route: ViewRoute) => void;
}

function WhatsAppIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="M12.031 2c-5.516 0-9.969 4.453-9.969 9.969 0 1.766.469 3.484 1.344 5l-1.406 5.156 5.281-1.375c1.469.797 3.109 1.219 4.75 1.219 5.516 0 9.969-4.453 9.969-9.969S17.547 2 12.031 2zm5.813 14.125c-.25.703-1.438 1.344-2 1.422-.516.078-1.172.109-1.891-.125-.438-.141-.984-.328-1.688-.641-2.969-1.281-4.906-4.281-5.047-4.469-.141-.188-1.203-1.594-1.203-3.047s.766-2.156 1.031-2.453c.266-.297.578-.375.766-.375.188 0 .391.016.563.016.172 0 .406-.063.641.484.234.563.797 1.938.859 2.078.078.141.125.313.031.5-.094.188-.141.313-.281.469-.141.156-.297.359-.422.484-.141.141-.297.297-.125.594.172.297.766 1.266 1.641 2.047 1.125 1 2.078 1.313 2.375 1.453.297.141.469.125.641-.078.172-.203.734-.859.938-1.156.203-.297.391-.25.656-.141.266.109 1.688.797 1.984.938.297.141.484.219.563.344.078.125.078.719-.172 1.422z" />
    </svg>
  );
}

const FREE_BENEFITS = [
  'Create an account and join the community',
  'Set up your personal profile with bio and interests',
  'Browse real registered members across Uganda, Jeddah & globally',
  `Basic matching (up to ${FREE_DAILY_LIKES_LIMIT} daily likes)`,
  `Real-time chat, voice notes & video calls (up to ${FREE_DAILY_MESSAGES_LIMIT} messages per day)`,
  'Basic compatibility quiz (3 core relationship questions)',
  'View public profile photos',
  'Receive real-time match and message notifications',
];

const PREMIUM_BENEFITS = [
  `Unlimited messaging (no daily message cap, plus ${PREMIUM_DAILY_LIKES_LIMIT} daily likes)`,
  'Advanced compatibility matching (full 6-dimension breakdown & compatibility sorting)',
  'Unlimited voice messages & 1-on-1 video calling with mutual matches',
  'Video introductions showcased on your profile',
  'Private photo albums shared exclusively with matched Premium members',
  'Country-to-country matching (Uganda ↔ Saudi Arabia & cross-border filters)',
  'Priority profile visibility at the top of Discover',
  'Gold Premium badge displayed next to your name',
  'Advanced search filters (city search, precise age range & Matches-Only visibility)',
];

export function PremiumView({ onNavigate }: PremiumViewProps) {
  const { user, profile } = useAuth();
  const isPremium = profile?.membershipTier === 'premium';
  const whatsappEnquiryUrl = getPremiumWhatsAppEnquiryUrl();

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12 pb-24 md:pb-16">
      <div className="max-w-2xl mb-8">
        <p className="text-sm font-semibold text-pink-600 mb-2">
          Membership Plans
        </p>
        <h1 className="text-3xl sm:text-4xl font-bold text-[#2E1065] text-balance">
          Free Membership vs. Premium Membership
        </h1>
        <p className="text-purple-950/75 text-base mt-3 leading-relaxed">
          Free and Premium accounts are clearly separated. Start with a Free account anytime, or enquire privately to unlock full Premium features once confirmed by an administrator.
        </p>
      </div>

      {user && profile && (
        <div className="mb-8 bg-white rounded-2xl border border-purple-950/10 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {isPremium ? (
              <Crown className="w-6 h-6 text-amber-500 shrink-0" />
            ) : (
              <Lock className="w-6 h-6 text-purple-700 shrink-0" />
            )}
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-bold text-[#2E1065]">
                  Your Current Plan:{' '}
                  {isPremium ? 'Confirmed Premium Membership' : 'Free Membership'}
                </p>
                {isPremium && <GoldPremiumBadge size="xs" />}
              </div>
              <p className="text-xs text-purple-950/70 mt-0.5">
                {isPremium
                  ? 'Your Gold Premium badge and all Premium benefits are active and confirmed by an administrator.'
                  : 'Premium benefits remain locked until an administrator confirms your membership.'}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
        {/* FREE MEMBERSHIP CARD */}
        <article className="bg-white rounded-2xl border border-purple-950/15 p-6 sm:p-8 flex flex-col justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-purple-700">
              Standard Tier
            </p>
            <h2 className="text-2xl font-bold text-[#2E1065] mt-1">
              FREE MEMBERSHIP
            </h2>
            <p className="text-sm text-purple-950/70 mt-1">
              Everything you need to start meeting genuine people
            </p>
            <p className="text-3xl font-bold text-[#2E1065] tabular-nums mt-5 mb-6">
              $0{' '}
              <span className="text-sm font-normal text-purple-950/60">
                / always free
              </span>
            </p>

            <ul className="space-y-3 text-sm text-purple-950/85">
              {FREE_BENEFITS.map((benefit) => (
                <li key={benefit} className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-purple-700 shrink-0 mt-0.5" />
                  <span>{benefit}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-8 pt-6 border-t border-purple-950/10">
            {user ? (
              <button
                type="button"
                onClick={() => onNavigate('discover')}
                className="w-full min-h-[46px] rounded-xl border border-purple-950/20 hover:bg-purple-50 text-sm font-semibold text-[#2E1065]"
              >
                Continue with Free Membership
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onNavigate('auth')}
                className="w-full min-h-[46px] rounded-xl border border-purple-950/20 hover:bg-purple-50 text-sm font-semibold text-[#2E1065]"
              >
                Join Free Today
              </button>
            )}
          </div>
        </article>

        {/* PREMIUM MEMBERSHIP CARD */}
        <article className="bg-[#2E1065] text-white rounded-2xl p-6 sm:p-8 flex flex-col justify-between border-2 border-amber-400/50">
          <div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-wider text-amber-300">
                Full Access Tier
              </p>
              <GoldPremiumBadge size="xs" />
            </div>
            <h2 className="text-2xl font-bold flex items-center gap-2 mt-1">
              <Crown className="w-5 h-5 text-amber-300" />
              <span>PREMIUM MEMBERSHIP</span>
            </h2>
            <p className="text-sm text-purple-200 mt-1">
              Voice, video, private albums, priority visibility & cross-border tools
            </p>

            <p className="text-2xl font-bold text-amber-200 mt-5 mb-6">
              {isPremium ? 'Active on Your Account' : 'Admin-Confirmed Upgrade'}
            </p>

            <ul className="space-y-3 text-sm text-purple-100">
              {PREMIUM_BENEFITS.map((benefit) => (
                <li key={benefit} className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
                  <span>{benefit}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-8 pt-6 border-t border-white/15 space-y-3">
            {isPremium ? (
              <div className="rounded-xl bg-white/10 p-4 text-sm text-amber-100 flex items-center gap-2.5">
                <ShieldCheck className="w-5 h-5 text-amber-300 shrink-0" />
                <span>
                  Your Premium membership is confirmed and all benefits are unlocked.
                </span>
              </div>
            ) : (
              <>
                <a
                  href={whatsappEnquiryUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-[#25D366] hover:bg-[#1EBE5D] active:bg-[#128C7E] text-[#052E16] font-bold text-sm sm:text-base inline-flex items-center justify-center gap-2.5 transition-colors shadow-sm"
                >
                  <WhatsAppIcon />
                  <span>Contact Us on WhatsApp</span>
                </a>
                <p className="text-xs text-purple-200/85 leading-relaxed">
                  Opens WhatsApp with a pre-filled Premium membership enquiry for our administrator. Sending a WhatsApp message does not confirm payment—Premium benefits stay locked until verified and activated by an administrator.
                </p>
              </>
            )}
          </div>
        </article>
      </div>
    </div>
  );
}
