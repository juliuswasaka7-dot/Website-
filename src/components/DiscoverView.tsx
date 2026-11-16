import type { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import {
  AlertCircle,
  Check,
  Crown,
  Film,
  Flag,
  Globe2,
  Heart,
  MapPin,
  MessageCircleHeart,
  RefreshCw,
  ShieldBan,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useDataSaver } from '../context/DataSaverContext';
import {
  blockMember,
  fetchDiscoverProfilesPage,
  recordDiscoveryAction,
  subscribeMyLikes,
} from '../services/datingService';
import {
  calculateCompatibility,
  FEATURED_COUNTRIES,
  FREE_DAILY_LIKES_LIMIT,
  getTodayUtcDateString,
  POPULAR_INTERESTS,
  PREMIUM_DAILY_LIKES_LIMIT,
  type IntentionOption,
  type LikeRecord,
  type PublicProfile,
  type ViewRoute,
} from '../types/app';
import { Avatar } from './Avatar';
import { MemberBadges } from './MemberBadges';
import { ReportModal } from './ReportModal';
import { InstallAppButton } from './InstallAppButton';

interface DiscoverViewProps {
  onNavigate: (route: ViewRoute) => void;
}

const CACHE_TTL_MS = 30 * 1000;
let discoverCache: {
  uid: string;
  ts: number;
  profiles: PublicProfile[];
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
} | null = null;

export function DiscoverView({ onNavigate }: DiscoverViewProps) {
  const { user, profile, profileStatus, retryProfileLoad, blockedIds } = useAuth();
  const { dataSaver } = useDataSaver();
  const pageSize = dataSaver ? 6 : 10;

  const validCache =
    user &&
    discoverCache &&
    discoverCache.uid === user.uid &&
    Date.now() - discoverCache.ts < CACHE_TTL_MS
      ? discoverCache
      : null;

  const [profiles, setProfiles] = useState<PublicProfile[]>(
    () => validCache?.profiles || []
  );
  const [cursorDoc, setCursorDoc] =
    useState<QueryDocumentSnapshot<DocumentData> | null>(
      () => validCache?.lastDoc || null
    );
  const [hasMore, setHasMore] = useState(() => validCache?.hasMore || false);
  const [loading, setLoading] = useState(() => !validCache);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [myLikes, setMyLikes] = useState<Record<string, LikeRecord>>({});
  const [actionBusyUid, setActionBusyUid] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [newMatchProfile, setNewMatchProfile] = useState<PublicProfile | null>(
    null
  );
  const [reportTarget, setReportTarget] = useState<PublicProfile | null>(null);
  const [videoIntroTarget, setVideoIntroTarget] = useState<PublicProfile | null>(
    null
  );
  const [expandedCompatUid, setExpandedCompatUid] = useState<string | null>(null);

  // Filters
  const [showFilters, setShowFilters] = useState(false);
  const [communityTab, setCommunityTab] = useState<'all' | 'uganda' | 'jeddah'>(
    'all'
  );
  const [countryFilter, setCountryFilter] = useState<string>('all');
  const [countryPairFilter, setCountryPairFilter] = useState<
    'all' | 'cross_border' | 'uganda_saudi'
  >('all');
  const [cityFilter, setCityFilter] = useState<string>('');
  const [intentionFilter, setIntentionFilter] = useState<
    'all' | IntentionOption
  >('all');
  const [minAge, setMinAge] = useState<number>(18);
  const [maxAge, setMaxAge] = useState<number>(80);
  const [selectedInterest, setSelectedInterest] = useState<string>('all');
  const [sortMode, setSortMode] = useState<'priority' | 'compatibility'>('priority');

  const isPremium = profile?.membershipTier === 'premium';

  const loadFirstPage = useCallback(
    async (forceRefresh = false) => {
      if (!user) {
        setLoading(false);
        return;
      }
      if (
        !forceRefresh &&
        discoverCache &&
        discoverCache.uid === user.uid &&
        Date.now() - discoverCache.ts < CACHE_TTL_MS
      ) {
        setProfiles(discoverCache.profiles);
        setCursorDoc(discoverCache.lastDoc);
        setHasMore(discoverCache.hasMore);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const res = await fetchDiscoverProfilesPage(pageSize, null);
        setProfiles(res.profiles);
        setCursorDoc(res.lastDoc);
        setHasMore(res.hasMore);
        discoverCache = {
          uid: user.uid,
          ts: Date.now(),
          profiles: res.profiles,
          lastDoc: res.lastDoc,
          hasMore: res.hasMore,
        };
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Could not load members. Check your internet connection.'
        );
      } finally {
        setLoading(false);
      }
    },
    [user, pageSize]
  );

  const loadNextPage = async () => {
    if (!user || !cursorDoc || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetchDiscoverProfilesPage(pageSize, cursorDoc);
      setProfiles((prev) => {
        const seen = new Set(prev.map((p) => p.uid));
        const merged = [...prev];
        res.profiles.forEach((p) => {
          if (!seen.has(p.uid)) merged.push(p);
        });
        if (discoverCache && discoverCache.uid === user.uid) {
          discoverCache = {
            ...discoverCache,
            profiles: merged,
            lastDoc: res.lastDoc,
            hasMore: res.hasMore,
          };
        }
        return merged;
      });
      setCursorDoc(res.lastDoc);
      setHasMore(res.hasMore);
    } catch (err) {
      setActionFeedback(
        err instanceof Error ? err.message : 'Failed to load more members.'
      );
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    void loadFirstPage(false);
  }, [loadFirstPage]);

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeMyLikes(
      user.uid,
      (map) => setMyLikes(map),
      () => {}
    );
    return unsub;
  }, [user]);

  const filteredWithScores = useMemo(() => {
    const myCountry = profile?.country.trim().toLowerCase() || '';

    const list = profiles
      .filter((p) => {
        if (user && p.uid === user.uid) return false;
        if (blockedIds.has(p.uid)) return false;
        if (myLikes[p.uid]) return false;

        if (communityTab === 'uganda' && p.country.toLowerCase() !== 'uganda') {
          return false;
        }
        if (communityTab === 'jeddah' && p.city.toLowerCase() !== 'jeddah') {
          return false;
        }
        if (
          countryFilter !== 'all' &&
          p.country.toLowerCase() !== countryFilter.toLowerCase()
        ) {
          return false;
        }
        if (isPremium && countryPairFilter === 'cross_border') {
          if (p.country.trim().toLowerCase() === myCountry) return false;
        }
        if (isPremium && countryPairFilter === 'uganda_saudi') {
          const c = p.country.trim().toLowerCase();
          if (c !== 'uganda' && c !== 'saudi arabia') return false;
        }
        if (
          isPremium &&
          cityFilter.trim() &&
          !p.city.toLowerCase().includes(cityFilter.trim().toLowerCase())
        ) {
          return false;
        }
        if (intentionFilter !== 'all' && p.intention !== intentionFilter) {
          return false;
        }
        if (isPremium && (p.age < minAge || p.age > maxAge)) {
          return false;
        }
        if (
          selectedInterest !== 'all' &&
          !p.interests.includes(selectedInterest)
        ) {
          return false;
        }
        return true;
      })
      .map((member) => ({
        member,
        compat: calculateCompatibility(
          profile?.compatibilityAnswers,
          member.compatibilityAnswers,
          profile?.interests,
          member.interests
        ),
      }));

    // Priority profile visibility: Confirmed Premium members rank first in Discover
    list.sort((a, b) => {
      if (isPremium && sortMode === 'compatibility') {
        if (b.compat.score !== a.compat.score) {
          return b.compat.score - a.compat.score;
        }
      }
      const aPrem = a.member.membershipTier === 'premium' ? 1 : 0;
      const bPrem = b.member.membershipTier === 'premium' ? 1 : 0;
      if (bPrem !== aPrem) return bPrem - aPrem;
      const aBlue = a.member.blueVerified ? 1 : 0;
      const bBlue = b.member.blueVerified ? 1 : 0;
      if (bBlue !== aBlue) return bBlue - aBlue;
      return b.compat.score - a.compat.score;
    });

    return list;
  }, [
    profiles,
    user,
    profile?.country,
    profile?.compatibilityAnswers,
    profile?.interests,
    blockedIds,
    myLikes,
    communityTab,
    countryFilter,
    countryPairFilter,
    cityFilter,
    intentionFilter,
    minAge,
    maxAge,
    selectedInterest,
    isPremium,
    sortMode,
  ]);

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 pb-24">
        <div className="bg-white rounded-2xl border border-purple-950/10 p-8 text-center">
          <Heart className="w-10 h-10 text-pink-600 mx-auto mb-3" />
          <h1 className="text-2xl font-bold text-[#2E1065] mb-2">
            Sign in to Discover Real Members
          </h1>
          <p className="text-sm text-purple-950/75 max-w-md mx-auto mb-6">
            Member profiles are protected so only registered adults (18+) in our community can browse, filter, and connect.
          </p>
          <button
            type="button"
            onClick={() => onNavigate('auth')}
            className="min-h-[46px] px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#6B21A8] to-[#DB2777] text-white font-semibold text-sm"
          >
            Create Account or Login
          </button>
        </div>
      </div>
    );
  }

  if (!profile) {
    if (profileStatus === 'loading' || profileStatus === 'idle') {
      return (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 text-center">
          <div className="w-8 h-8 rounded-full border-2 border-purple-700 border-t-transparent animate-spin mx-auto mb-3" />
          <p className="text-sm text-purple-950/65">Loading your profile...</p>
        </div>
      );
    }
    if (profileStatus === 'error') {
      return (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 pb-24">
          <div className="bg-white rounded-2xl border border-purple-950/10 p-8 text-center">
            <AlertCircle className="w-9 h-9 text-amber-600 mx-auto mb-3" />
            <h1 className="text-xl font-bold text-[#2E1065] mb-2">
              Connection Interrupted
            </h1>
            <p className="text-sm text-purple-950/75 mb-6">
              You are still signed in, but we could not load your profile yet.
            </p>
            <button
              type="button"
              onClick={retryProfileLoad}
              className="min-h-[46px] px-6 py-2.5 rounded-xl bg-[#2E1065] text-white font-semibold text-sm"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 pb-24">
        <div className="bg-white rounded-2xl border border-purple-950/10 p-8 text-center">
          <h1 className="text-2xl font-bold text-[#2E1065] mb-2">
            Complete Your Profile First
          </h1>
          <p className="text-sm text-purple-950/75 mb-6">
            Add your age (18+), city, and interests before browsing other members.
          </p>
          <button
            type="button"
            onClick={() => onNavigate('auth')}
            className="min-h-[46px] px-6 py-2.5 rounded-xl bg-[#2E1065] text-white font-semibold text-sm"
          >
            Complete Profile
          </button>
        </div>
      </div>
    );
  }

  if (profile.accountStatus === 'suspended') {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 pb-24">
        <div className="bg-red-50 rounded-2xl border border-red-200 p-8 text-center">
          <AlertCircle className="w-10 h-10 text-red-700 mx-auto mb-3" />
          <h1 className="text-xl font-bold text-red-900 mb-2">
            Account Currently Suspended
          </h1>
          <p className="text-sm text-red-800 max-w-md mx-auto">
            Your account has been suspended by moderation for violating community guidelines. Discovery and messaging are disabled.
          </p>
        </div>
      </div>
    );
  }

  const today = getTodayUtcDateString();
  const usedLikesToday =
    profile.dailyLikesDate === today ? profile.dailyLikesCount : 0;
  const maxLikesToday = isPremium
    ? PREMIUM_DAILY_LIKES_LIMIT
    : FREE_DAILY_LIKES_LIMIT;

  const handleLikeOrPass = async (
    target: PublicProfile,
    action: 'like' | 'pass'
  ) => {
    if (!user.emailVerified) {
      setActionFeedback(
        'Please verify your email address first before liking or passing profiles.'
      );
      return;
    }
    setActionBusyUid(target.uid);
    setActionFeedback(null);
    try {
      const result = await recordDiscoveryAction(profile, target, action);
      if (result.matched) {
        setNewMatchProfile(target);
      }
    } catch (err) {
      setActionFeedback(
        err instanceof Error ? err.message : 'Action failed. Please try again.'
      );
    } finally {
      setActionBusyUid(null);
    }
  };

  const handleBlock = async (target: PublicProfile) => {
    if (!user.emailVerified) {
      setActionFeedback('Please verify your email first.');
      return;
    }
    setActionBusyUid(target.uid);
    try {
      await blockMember(user.uid, target.uid);
      setActionFeedback(`${target.firstName} has been blocked and hidden.`);
    } catch (err) {
      setActionFeedback(
        err instanceof Error ? err.message : 'Could not block member.'
      );
    } finally {
      setActionBusyUid(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 pb-24 md:pb-16">
      {/* Header & Daily Quota */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#2E1065]">
            Discover Real Members
          </h1>
          <p className="text-sm text-purple-950/70 mt-1">
            Daily likes used today:{' '}
            <span className="font-semibold text-[#2E1065] tabular-nums">
              {usedLikesToday} / {maxLikesToday}
            </span>{' '}
            ·{' '}
            <span className="font-medium">
              {isPremium ? 'Confirmed Premium' : 'Free Membership'}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <InstallAppButton
            variant="surface"
            hideWhenStandalone
            onOpenGuide={() => onNavigate('install')}
          />
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-purple-950/20 bg-white hover:bg-purple-50 text-sm font-semibold text-[#2E1065] inline-flex items-center gap-2"
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>{showFilters ? 'Hide Filters' : 'Filters'}</span>
          </button>
          <button
            type="button"
            onClick={() => void loadFirstPage(true)}
            disabled={loading}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-purple-950/20 bg-white hover:bg-purple-50 text-sm font-semibold text-[#2E1065] inline-flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Featured Community Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              { id: 'all', label: 'All Communities' },
              { id: 'uganda', label: 'Uganda 🇺🇬' },
              { id: 'jeddah', label: 'Jeddah 🇸🇦' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setCommunityTab(tab.id)}
              className={`min-h-[42px] px-4 py-2 rounded-xl text-sm font-semibold transition-colors whitespace-nowrap ${
                communityTab === tab.id
                  ? 'bg-[#2E1065] text-white'
                  : 'bg-white border border-purple-950/15 text-purple-950/80 hover:border-purple-400'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {isPremium && (
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-purple-950/65 font-medium">Sort:</span>
            <button
              type="button"
              onClick={() => setSortMode('priority')}
              className={`min-h-[36px] px-3 py-1 rounded-lg font-semibold ${
                sortMode === 'priority'
                  ? 'bg-[#2E1065] text-white'
                  : 'bg-white border border-purple-950/15 text-[#2E1065]'
              }`}
            >
              Priority Visibility
            </button>
            <button
              type="button"
              onClick={() => setSortMode('compatibility')}
              className={`min-h-[36px] px-3 py-1 rounded-lg font-semibold ${
                sortMode === 'compatibility'
                  ? 'bg-[#2E1065] text-white'
                  : 'bg-white border border-purple-950/15 text-[#2E1065]'
              }`}
            >
              Compatibility %
            </button>
          </div>
        )}
      </div>

      {/* Filter Drawer */}
      {showFilters && (
        <div className="bg-white rounded-2xl border border-purple-950/10 p-5 mb-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <label
                htmlFor="filter-country"
                className="block text-xs font-semibold text-[#2E1065] mb-1"
              >
                Country
              </label>
              <select
                id="filter-country"
                value={countryFilter}
                onChange={(e) => setCountryFilter(e.target.value)}
                className="w-full min-h-[42px] rounded-xl border border-purple-950/20 px-3 text-sm bg-white"
              >
                <option value="all">All Countries</option>
                {FEATURED_COUNTRIES.filter((c) => c !== 'Other').map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="filter-intention"
                className="block text-xs font-semibold text-[#2E1065] mb-1"
              >
                Looking For
              </label>
              <select
                id="filter-intention"
                value={intentionFilter}
                onChange={(e) =>
                  setIntentionFilter(e.target.value as 'all' | IntentionOption)
                }
                className="w-full min-h-[42px] rounded-xl border border-purple-950/20 px-3 text-sm bg-white"
              >
                <option value="all">Dating & Friendship</option>
                <option value="dating">Dating & Love</option>
                <option value="friendship">Friendship</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="filter-interest"
                className="block text-xs font-semibold text-[#2E1065] mb-1"
              >
                Shared Interest
              </label>
              <select
                id="filter-interest"
                value={selectedInterest}
                onChange={(e) => setSelectedInterest(e.target.value)}
                className="w-full min-h-[42px] rounded-xl border border-purple-950/20 px-3 text-sm bg-white"
              >
                <option value="all">Any Interest</option>
                {POPULAR_INTERESTS.map((i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
            </div>

            {/* Premium Country-to-Country Matching */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label
                  htmlFor="filter-crossborder"
                  className="text-xs font-semibold text-[#2E1065] flex items-center gap-1"
                >
                  <Globe2 className="w-3.5 h-3.5 text-purple-700" />
                  <span>Country-to-Country</span>
                </label>
                {!isPremium && (
                  <button
                    type="button"
                    onClick={() => onNavigate('premium')}
                    className="text-[11px] font-semibold text-pink-600 inline-flex items-center gap-1"
                  >
                    <Crown className="w-3 h-3" />
                    <span>Unlock</span>
                  </button>
                )}
              </div>
              <select
                id="filter-crossborder"
                disabled={!isPremium}
                value={countryPairFilter}
                onChange={(e) =>
                  setCountryPairFilter(
                    e.target.value as 'all' | 'cross_border' | 'uganda_saudi'
                  )
                }
                className="w-full min-h-[42px] rounded-xl border border-purple-950/20 px-3 text-sm bg-white disabled:bg-purple-50 disabled:text-purple-950/50"
              >
                <option value="all">All Matches</option>
                <option value="cross_border">Outside My Country</option>
                <option value="uganda_saudi">Uganda ↔ Saudi Arabia</option>
              </select>
            </div>

            {/* Premium Advanced City Search */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label
                  htmlFor="filter-city"
                  className="text-xs font-semibold text-[#2E1065]"
                >
                  City Search (Premium)
                </label>
                {!isPremium && (
                  <button
                    type="button"
                    onClick={() => onNavigate('premium')}
                    className="text-[11px] font-semibold text-pink-600 inline-flex items-center gap-1"
                  >
                    <Crown className="w-3 h-3" />
                    <span>Unlock</span>
                  </button>
                )}
              </div>
              <input
                id="filter-city"
                type="text"
                disabled={!isPremium}
                value={cityFilter}
                onChange={(e) => setCityFilter(e.target.value)}
                placeholder={
                  isPremium ? 'e.g. Kampala or Jeddah' : 'Locked until Premium'
                }
                className="w-full min-h-[42px] rounded-xl border border-purple-950/20 px-3 text-sm disabled:bg-purple-50 disabled:text-purple-950/50"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-purple-950/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-semibold text-[#2E1065]">
                Age Range (Premium):
              </span>
              <input
                type="number"
                min={18}
                max={maxAge}
                disabled={!isPremium}
                value={minAge}
                onChange={(e) =>
                  setMinAge(Math.max(18, Number(e.target.value) || 18))
                }
                aria-label="Minimum age"
                className="w-20 min-h-[40px] rounded-lg border border-purple-950/20 px-2.5 text-sm tabular-nums disabled:bg-purple-50"
              />
              <span className="text-xs text-purple-950/60">to</span>
              <input
                type="number"
                min={minAge}
                max={99}
                disabled={!isPremium}
                value={maxAge}
                onChange={(e) =>
                  setMaxAge(Math.min(99, Number(e.target.value) || 80))
                }
                aria-label="Maximum age"
                className="w-20 min-h-[40px] rounded-lg border border-purple-950/20 px-2.5 text-sm tabular-nums disabled:bg-purple-50"
              />
            </div>

            <button
              type="button"
              onClick={() => {
                setCommunityTab('all');
                setCountryFilter('all');
                setCountryPairFilter('all');
                setCityFilter('');
                setIntentionFilter('all');
                setSelectedInterest('all');
                setMinAge(18);
                setMaxAge(80);
              }}
              className="text-xs font-semibold text-pink-600 hover:text-pink-700 self-start sm:self-auto"
            >
              Reset All Filters
            </button>
          </div>
        </div>
      )}

      {actionFeedback && (
        <div
          role="status"
          className="mb-5 rounded-xl bg-purple-50 border border-purple-200 px-4 py-3 text-sm text-[#2E1065] flex items-center justify-between gap-3"
        >
          <span>{actionFeedback}</span>
          <button
            type="button"
            onClick={() => setActionFeedback(null)}
            aria-label="Dismiss notice"
            className="text-purple-950/60 hover:text-purple-950"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Loading / Error / Empty / Member Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className={`bg-white rounded-2xl border border-purple-950/10 overflow-hidden ${
                dataSaver ? '' : 'animate-pulse'
              }`}
            >
              <div className="aspect-[4/3] bg-purple-100" />
              <div className="p-5 space-y-3">
                <div className="h-5 w-1/2 bg-purple-100 rounded" />
                <div className="h-4 w-3/4 bg-purple-50 rounded" />
                <div className="h-10 bg-purple-50 rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="bg-white rounded-2xl border border-red-200 p-8 text-center">
          <AlertCircle className="w-9 h-9 text-red-600 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-[#2E1065] mb-1">
            Unable to Load Members
          </h2>
          <p className="text-sm text-purple-950/75 mb-5">{error}</p>
          <button
            type="button"
            onClick={() => void loadFirstPage(true)}
            className="min-h-[44px] px-5 py-2 rounded-xl bg-[#2E1065] text-white text-sm font-semibold"
          >
            Retry Connection
          </button>
        </div>
      ) : filteredWithScores.length === 0 ? (
        <div className="bg-white rounded-2xl border border-purple-950/10 p-10 text-center">
          <Heart className="w-10 h-10 text-pink-500/70 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-[#2E1065] mb-2">
            No More Members Matching These Filters Right Now
          </h2>
          <p className="text-sm text-purple-950/70 max-w-md mx-auto mb-6">
            FIND YOUR LOVE only displays real registered members—never fake accounts. Check back soon or broaden your filters.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {hasMore && (
              <button
                type="button"
                onClick={loadNextPage}
                disabled={loadingMore}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-[#2E1065] text-white text-sm font-semibold"
              >
                {loadingMore ? 'Loading...' : 'Load More Members'}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setCommunityTab('all');
                setCountryFilter('all');
                setCountryPairFilter('all');
                setIntentionFilter('all');
                setSelectedInterest('all');
              }}
              className="min-h-[44px] px-5 py-2 rounded-xl border border-purple-950/20 text-sm font-semibold text-[#2E1065]"
            >
              Show All Communities
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredWithScores.map(({ member, compat }) => {
              const busy = actionBusyUid === member.uid;
              const isCompatOpen = expandedCompatUid === member.uid;
              return (
                <article
                  key={member.uid}
                  className="cv-auto bg-white rounded-2xl border border-purple-950/10 overflow-hidden flex flex-col justify-between"
                >
                  <div>
                    <div className="aspect-[4/3] bg-purple-950 relative overflow-hidden">
                      <Avatar
                        src={member.photoUrl}
                        name={member.firstName}
                        size="card"
                        respectDataSaver
                        blueVerified={Boolean(member.blueVerified)}
                      />
                      <span className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-full bg-black/65 text-white text-[11px] font-bold tabular-nums inline-flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-pink-300" />
                        <span>{compat.score}% Match</span>
                      </span>
                    </div>

                    <div className="p-5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h2 className="text-xl font-bold text-[#2E1065]">
                              {member.firstName},{' '}
                              <span className="tabular-nums">{member.age}</span>
                            </h2>
                            <MemberBadges
                              blueVerified={member.blueVerified}
                              membershipTier={member.membershipTier}
                              size="xs"
                            />
                          </div>
                          <p className="text-xs font-medium text-purple-950/65 mt-0.5 flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-pink-600 shrink-0" />
                            <span>
                              {member.city} · {member.country}
                            </span>
                          </p>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => setReportTarget(member)}
                            title="Report member"
                            aria-label={`Report ${member.firstName}`}
                            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-purple-950/45 hover:text-pink-700 hover:bg-pink-50"
                          >
                            <Flag className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleBlock(member)}
                            title="Block member"
                            aria-label={`Block ${member.firstName}`}
                            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-purple-950/45 hover:text-red-700 hover:bg-red-50"
                          >
                            <ShieldBan className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <p className="text-xs font-semibold text-purple-800 mt-3">
                        {member.intention === 'dating'
                          ? 'Looking for Dating & Love'
                          : member.intention === 'friendship'
                            ? 'Looking for Friendship'
                            : 'Open to Friendship & Dating'}
                        {member.emailVerified ? ' · Verified Email' : ''}
                      </p>

                      {member.bio && (
                        <p className="text-sm text-purple-950/80 mt-2.5 line-clamp-3 leading-relaxed">
                          {member.bio}
                        </p>
                      )}

                      <div className="flex flex-wrap gap-2 mt-3">
                        {member.videoIntroUrl && (
                          <button
                            type="button"
                            onClick={() => setVideoIntroTarget(member)}
                            className="min-h-[34px] px-2.5 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 text-xs font-semibold text-[#2E1065] inline-flex items-center gap-1.5"
                          >
                            <Film className="w-3.5 h-3.5 text-pink-600" />
                            <span>Watch Video Intro</span>
                          </button>
                        )}
                        {compat.breakdown.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              if (!isPremium) {
                                onNavigate('premium');
                                return;
                              }
                              setExpandedCompatUid(
                                isCompatOpen ? null : member.uid
                              );
                            }}
                            className="min-h-[34px] px-2.5 py-1 rounded-lg bg-pink-50 hover:bg-pink-100 text-xs font-semibold text-pink-800 inline-flex items-center gap-1"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>
                              {isPremium
                                ? isCompatOpen
                                  ? 'Hide Breakdown'
                                  : 'Compatibility Details'
                                : 'Advanced Compatibility (Premium)'}
                            </span>
                          </button>
                        )}
                      </div>

                      {isPremium && isCompatOpen && compat.breakdown.length > 0 && (
                        <div className="mt-2.5 p-2.5 rounded-xl bg-purple-50/80 border border-purple-950/10 space-y-1 text-[11px]">
                          {compat.breakdown.map((b) => (
                            <div
                              key={b.dimension}
                              className="flex items-center justify-between text-[#2E1065]"
                            >
                              <span>{b.dimension}</span>
                              <span
                                className={`font-semibold inline-flex items-center gap-1 ${
                                  b.matched
                                    ? 'text-emerald-700'
                                    : 'text-purple-950/55'
                                }`}
                              >
                                {b.matched ? (
                                  <>
                                    <Check className="w-3 h-3" />
                                    <span>Aligned</span>
                                  </>
                                ) : (
                                  <span>Different</span>
                                )}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {member.interests.length > 0 && (
                        <p className="text-xs text-purple-950/65 mt-3 pt-3 border-t border-purple-950/10">
                          {member.interests.slice(0, 5).join(' · ')}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="px-5 pb-5 grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleLikeOrPass(member, 'pass')}
                      className="min-h-[46px] rounded-xl border border-purple-950/20 hover:bg-purple-50 disabled:opacity-50 text-[#2E1065] text-sm font-semibold inline-flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <X className="w-4 h-4" />
                      <span>Pass</span>
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleLikeOrPass(member, 'like')}
                      className="min-h-[46px] rounded-xl bg-gradient-to-r from-[#6B21A8] to-[#DB2777] hover:from-[#581C87] hover:to-[#BE185D] disabled:opacity-50 text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Heart className="w-4 h-4" />
                      <span>{busy ? 'Saving...' : 'Like'}</span>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          {hasMore && (
            <div className="mt-8 text-center">
              <button
                type="button"
                onClick={loadNextPage}
                disabled={loadingMore}
                className="min-h-[46px] px-6 py-2.5 rounded-xl border border-purple-950/20 bg-white hover:bg-purple-50 text-sm font-semibold text-[#2E1065]"
              >
                {loadingMore ? 'Loading more members...' : 'Load More Members'}
              </button>
            </div>
          )}
        </>
      )}

      {/* Video Intro Tap-to-Play Modal */}
      {videoIntroTarget && videoIntroTarget.videoIntroUrl && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-[#1A0A26]/80 flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-3xl max-w-lg w-full p-5 space-y-3 border border-purple-950/15 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-[#2E1065]">
                  {videoIntroTarget.firstName}&apos;s Video Intro
                </h2>
                <MemberBadges
                  blueVerified={videoIntroTarget.blueVerified}
                  membershipTier={videoIntroTarget.membershipTier}
                  size="xs"
                />
              </div>
              <button
                type="button"
                onClick={() => setVideoIntroTarget(null)}
                aria-label="Close video intro"
                className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-purple-950/60 hover:bg-purple-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <video
              controls
              preload="metadata"
              playsInline
              src={videoIntroTarget.videoIntroUrl}
              className="w-full max-h-[65vh] rounded-2xl bg-black"
            />
          </div>
        </div>
      )}

      {/* Mutual Match Celebration Modal */}
      {newMatchProfile && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-[#1A0A26]/75 flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 text-center border border-purple-950/10 shadow-xl">
            <div className="w-16 h-16 rounded-full bg-pink-100 text-pink-600 flex items-center justify-center mx-auto mb-4">
              <Heart className="w-8 h-8 fill-pink-600" />
            </div>
            <h2 className="text-2xl font-bold text-[#2E1065]">
              It&apos;s a Mutual Match!
            </h2>
            <p className="text-sm text-purple-950/75 mt-2 mb-6">
              You and <span className="font-semibold">{newMatchProfile.firstName}</span> liked each other. Say hello and start a genuine conversation.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => {
                  setNewMatchProfile(null);
                  onNavigate('matches');
                }}
                className="flex-1 min-h-[46px] px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#6B21A8] to-[#DB2777] text-white text-sm font-semibold inline-flex items-center justify-center gap-2"
              >
                <MessageCircleHeart className="w-4 h-4" />
                <span>Send a Message</span>
              </button>
              <button
                type="button"
                onClick={() => setNewMatchProfile(null)}
                className="min-h-[46px] px-5 py-2.5 rounded-xl border border-purple-950/20 text-sm font-semibold text-[#2E1065]"
              >
                Keep Discovering
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Report Modal */}
      {reportTarget && (
        <ReportModal
          reporterUid={user.uid}
          reportedUid={reportTarget.uid}
          reportedName={reportTarget.firstName}
          contextType="profile"
          contextId={reportTarget.uid}
          onClose={() => setReportTarget(null)}
          onSubmitted={() => {
            setReportTarget(null);
            setActionFeedback(
              'Thank you. Your safety report has been received by our moderation team.'
            );
          }}
        />
      )}
    </div>
  );
}
