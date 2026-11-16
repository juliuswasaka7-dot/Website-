import {
  Check,
  Compass,
  Crown,
  Heart,
  Home,
  MessageCircleHeart,
  Share2,
  ShieldCheck,
  User as UserIcon,
  WifiOff,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useDataSaver } from '../context/DataSaverContext';
import { copyUrlToClipboard, getPublicWebsiteUrl } from '../lib/share';
import type { ViewRoute } from '../types/app';
import { BrandLogo } from './BrandLogo';
import { BlueTickBadge } from './MemberBadges';

interface NavbarProps {
  currentRoute: ViewRoute;
  onNavigate: (route: ViewRoute) => void;
}

export function Navbar({ currentRoute, onNavigate }: NavbarProps) {
  const { user, profile, isAdmin, totalUnreadMessages, matches } = useAuth();
  const { isOffline, dataSaver } = useDataSaver();
  const [shareToast, setShareToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  const showShareToast = (message: string) => {
    setShareToast(message);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setShareToast(null), 3500);
  };

  const handleShareApp = async () => {
    const publicUrl = getPublicWebsiteUrl();
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: 'FIND YOUR LOVE — Two Countries, One Heart',
          text: 'Join FIND YOUR LOVE — connecting adults 18+ across Uganda, Jeddah, and worldwide.',
          url: publicUrl,
        });
        showShareToast('App link shared!');
        return;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        // Fall through to clipboard copy if share is blocked in embedded views
      }
    }

    const copied = await copyUrlToClipboard(publicUrl);
    if (copied) {
      showShareToast('Link copied to clipboard!');
    } else {
      showShareToast(`Share link: ${publicUrl}`);
    }
  };

  const desktopLinks: { route: ViewRoute; label: string }[] = user
    ? [
        { route: 'discover', label: 'Discover' },
        {
          route: 'matches',
          label:
            totalUnreadMessages > 0
              ? `Messages (${totalUnreadMessages})`
              : matches.length > 0
                ? `Matches (${matches.length})`
                : 'Matches',
        },
        { route: 'premium', label: 'Membership' },
        { route: 'safety', label: 'Safety' },
        ...(isAdmin
          ? [{ route: 'admin' as ViewRoute, label: 'Admin' }]
          : [{ route: 'install' as ViewRoute, label: 'Install App' }]),
      ]
    : [
        { route: 'home', label: 'Home' },
        { route: 'discover', label: 'Discover' },
        { route: 'premium', label: 'Membership' },
        { route: 'safety', label: 'Safety' },
        { route: 'install', label: 'Install App' },
      ];

  const mobileTabs: {
    route: ViewRoute;
    label: string;
    icon: typeof Home;
    badge?: number;
  }[] = user
    ? [
        { route: 'discover', label: 'Discover', icon: Compass },
        {
          route: 'matches',
          label: 'Chat',
          icon: MessageCircleHeart,
          badge: totalUnreadMessages,
        },
        { route: 'premium', label: 'Plans', icon: Crown },
        {
          route: isAdmin ? 'admin' : 'safety',
          label: isAdmin ? 'Admin' : 'Safety',
          icon: ShieldCheck,
        },
        { route: 'profile', label: 'Profile', icon: UserIcon },
      ]
    : [
        { route: 'home', label: 'Home', icon: Home },
        { route: 'discover', label: 'Discover', icon: Compass },
        { route: 'premium', label: 'Plans', icon: Crown },
        { route: 'safety', label: 'Safety', icon: ShieldCheck },
        { route: 'auth', label: 'Login', icon: Heart },
      ];

  return (
    <>
      {isOffline && (
        <div
          role="status"
          className="bg-amber-950 text-amber-100 text-xs px-4 py-1.5 flex items-center justify-center gap-2"
        >
          <WifiOff className="w-3.5 h-3.5 shrink-0" />
          <span>You appear to be offline. Reconnect to load members and send messages.</span>
        </div>
      )}

      {/* Top Navigation Bar - Strict 3-Zone Contract */}
      <header className="sticky top-0 z-30 bg-white/95 border-b border-purple-950/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-[52px] md:h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single-line Brand Wordmark */}
          <button
            type="button"
            onClick={() => onNavigate('home')}
            className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-700 rounded-md whitespace-nowrap shrink-0"
          >
            <BrandLogo size="sm" />
          </button>

          {/* Zone 2: 4-5 Clean Single-Line Text Nav Links */}
          <nav
            aria-label="Primary Navigation"
            className="hidden md:flex items-center gap-6 text-sm font-medium text-purple-950/75"
          >
            {desktopLinks.map((item) => {
              const active = currentRoute === item.route;
              return (
                <button
                  key={item.route}
                  type="button"
                  onClick={() => onNavigate(item.route)}
                  className={`py-1.5 whitespace-nowrap shrink-0 transition-colors border-b-2 ${
                    active
                      ? 'text-purple-950 border-pink-600 font-semibold'
                      : 'border-transparent hover:text-purple-900 hover:border-purple-300'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Primary Action & Share App */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void handleShareApp()}
              aria-label="Share App"
              className="min-h-[38px] px-2.5 sm:px-3 py-1.5 rounded-lg border border-purple-950/20 bg-white hover:bg-purple-50 text-[#2E1065] text-xs font-semibold transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1.5"
            >
              <Share2 className="w-3.5 h-3.5 shrink-0" />
              <span>Share App</span>
            </button>
            {user ? (
              <button
                type="button"
                onClick={() => onNavigate('profile')}
                className="min-h-[38px] px-2.5 sm:px-3.5 py-1.5 rounded-lg bg-[#2E1065] hover:bg-[#4C1D95] text-white text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1.5"
              >
                <span className="max-w-[84px] sm:max-w-none truncate">
                  {profile?.firstName ? `${profile.firstName}'s Profile` : 'My Profile'}
                </span>
                {profile?.blueVerified && <BlueTickBadge size="xs" />}
                {profile?.membershipTier === 'premium' && (
                  <Crown
                    aria-label="Premium Member"
                    className="w-3.5 h-3.5 text-amber-300 fill-amber-300 shrink-0"
                  />
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onNavigate('auth')}
                className="min-h-[38px] px-3 sm:px-4 py-1.5 rounded-lg bg-gradient-to-r from-[#6B21A8] to-[#DB2777] hover:from-[#581C87] hover:to-[#BE185D] text-white text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0"
              >
                Create Account
              </button>
            )}
          </div>
        </div>
        {dataSaver && (
          <div className="md:hidden bg-purple-950 text-purple-100 text-[11px] px-4 py-0.5 text-center">
            Data Saver Active
          </div>
        )}
      </header>

      {shareToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-16 right-4 left-4 sm:left-auto sm:max-w-xs z-50 bg-[#2E1065] text-white rounded-xl px-4 py-2.5 shadow-lg border border-white/15 flex items-center gap-2 text-xs font-semibold"
        >
          <Check className="w-4 h-4 text-emerald-300 shrink-0" />
          <span className="truncate">{shareToast}</span>
        </div>
      )}

      {/* Mobile Bottom Tab Bar (Thumb-Zone Navigation) */}
      <nav
        aria-label="Mobile Bottom Navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 border-t border-purple-950/10 pb-safe"
      >
        <div className="grid grid-cols-5 h-[58px] items-center">
          {mobileTabs.map((tab) => {
            const Icon = tab.icon;
            const active = currentRoute === tab.route;
            return (
              <button
                key={tab.route}
                type="button"
                onClick={() => onNavigate(tab.route)}
                className={`relative flex flex-col items-center justify-center min-h-[44px] w-full transition-colors ${
                  active
                    ? 'text-[#7E22CE] font-semibold'
                    : 'text-purple-950/60 hover:text-purple-950'
                }`}
              >
                <span className="relative">
                  <Icon
                    className={`w-5 h-5 ${
                      active ? 'stroke-[2.3]' : 'stroke-[1.8]'
                    }`}
                  />
                  {typeof tab.badge === 'number' && tab.badge > 0 && (
                    <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-pink-600 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                      {tab.badge > 9 ? '9+' : tab.badge}
                    </span>
                  )}
                </span>
                <span className="text-[10px] leading-tight mt-0.5 whitespace-nowrap">
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
