import {
  ArrowRight,
  Compass,
  Heart,
  MapPin,
  MessageCircleHeart,
  ShieldCheck,
  UserCheck,
  Zap,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import heroRomanceImg from '../assets/images/hero_couple_romance_1794751989112.jpg';
import jeddahImg from '../assets/images/jeddah_corniche_community_1794751990122.jpg';
import ugandaImg from '../assets/images/uganda_kampala_community_1794751989910.jpg';
import connectionImg from '../assets/images/friendship_coffee_connection_1794751991174.jpg';
import { useAuth } from '../context/AuthContext';
import { useDataSaver } from '../context/DataSaverContext';
import {
  fetchDiscoverProfilesPage,
  subscribeCommunityStats,
} from '../services/datingService';
import {
  POPULAR_INTERESTS,
  type CommunityStats,
  type PublicProfile,
  type ViewRoute,
} from '../types/app';
import { BrandLogo } from './BrandLogo';
import { InstallAppButton } from './InstallAppButton';

interface HomePageProps {
  onNavigate: (route: ViewRoute, initialAuthMode?: 'login' | 'register') => void;
}

const STATS_CACHE_KEY = 'fyl_community_stats_v1';
const INTERESTS_CACHE_KEY = 'fyl_interest_counts_v1';
const INTERESTS_TTL_MS = 5 * 60 * 1000;

function getCachedStats(): CommunityStats | null {
  try {
    const raw = localStorage.getItem(STATS_CACHE_KEY);
    return raw ? (JSON.parse(raw) as CommunityStats) : null;
  } catch {
    return null;
  }
}

function getCachedInterests(): Record<string, number> | null {
  try {
    const raw = sessionStorage.getItem(INTERESTS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      ts: number;
      counts: Record<string, number>;
    };
    if (Date.now() - parsed.ts < INTERESTS_TTL_MS) {
      return parsed.counts;
    }
  } catch {
    // Ignore storage issues
  }
  return null;
}

export function HomePage({ onNavigate }: HomePageProps) {
  const { user, profile } = useAuth();
  const { dataSaver, toggleDataSaver } = useDataSaver();
  const [stats, setStats] = useState<CommunityStats | null>(getCachedStats);
  const [interestCounts, setInterestCounts] = useState<Record<string, number>>(
    () => (user ? getCachedInterests() || {} : {})
  );
  const [heroImgFailed, setHeroImgFailed] = useState(false);

  useEffect(() => {
    const unsub = subscribeCommunityStats((s) => {
      if (s) {
        setStats(s);
        try {
          localStorage.setItem(STATS_CACHE_KEY, JSON.stringify(s));
        } catch {
          // Ignore quota errors
        }
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!user) {
      setInterestCounts({});
      return;
    }
    const cached = getCachedInterests();
    if (cached) {
      setInterestCounts(cached);
      return;
    }
    if (dataSaver) return;

    let active = true;
    const timer = window.setTimeout(() => {
      fetchDiscoverProfilesPage(20, null)
        .then(({ profiles }) => {
          if (!active) return;
          const counts: Record<string, number> = {};
          profiles.forEach((p: PublicProfile) => {
            p.interests?.forEach((interest) => {
              counts[interest] = (counts[interest] || 0) + 1;
            });
          });
          setInterestCounts(counts);
          try {
            sessionStorage.setItem(
              INTERESTS_CACHE_KEY,
              JSON.stringify({ ts: Date.now(), counts })
            );
          } catch {
            // Ignore storage issues
          }
        })
        .catch(() => {});
    }, 350);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [user, dataSaver]);

  const sortedInterests = Object.entries(interestCounts).sort(
    (a, b) => b[1] - a[1]
  );

  return (
    <div className="pb-20 md:pb-12">
      {/* Hero Section */}
      <section className="bg-gradient-to-b from-[#2B1040] via-[#3B135C] to-[#1A0A26] text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-16 lg:py-20 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-stretch">
          <div className="lg:col-span-6 flex flex-col justify-center">
            <p className="text-pink-300 text-sm font-medium tracking-wide mb-3">
              Two Countries, One Heart.
            </p>
            <h1 className="text-3xl sm:text-5xl lg:text-[3.4rem] font-bold leading-[1.12] tracking-tight text-balance mb-5">
              Your love story starts here.
            </h1>
            <p className="text-purple-100/90 text-base sm:text-lg leading-relaxed max-w-xl mb-8">
              An intentional dating and friendship community for adults aged 18 and above—connecting warm hearts across Uganda 🇺🇬, Jeddah, Saudi Arabia 🇸🇦, and around the world.
            </p>

            {user ? (
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => onNavigate('discover')}
                  className="min-h-[48px] px-6 py-3 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#9333EA] hover:from-[#BE185D] hover:to-[#7E22CE] text-white font-semibold text-sm sm:text-base inline-flex items-center gap-2 transition-colors whitespace-nowrap"
                >
                  <Compass className="w-5 h-5" />
                  <span>Discover Members</span>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('matches')}
                  className="min-h-[48px] px-6 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-sm sm:text-base inline-flex items-center gap-2 transition-colors whitespace-nowrap"
                >
                  <MessageCircleHeart className="w-5 h-5" />
                  <span>
                    {profile ? 'Matches & Chat' : 'Complete Profile'}
                  </span>
                </button>
                <InstallAppButton
                  variant="hero"
                  onOpenInApp={() => onNavigate('discover')}
                  onOpenGuide={() => onNavigate('install')}
                />
                <button
                  type="button"
                  onClick={() => onNavigate('install')}
                  className="min-h-[48px] px-4 py-3 rounded-xl border border-white/25 bg-white/5 hover:bg-white/15 text-purple-100 text-sm font-semibold transition-colors whitespace-nowrap"
                >
                  Install Guide
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => onNavigate('auth', 'register')}
                  className="min-h-[48px] px-6 py-3 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#9333EA] hover:from-[#BE185D] hover:to-[#7E22CE] text-white font-semibold text-sm sm:text-base inline-flex items-center gap-2 transition-colors whitespace-nowrap"
                >
                  <span>Create Account</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('auth', 'login')}
                  className="min-h-[48px] px-6 py-3 rounded-xl border border-white/30 bg-white/5 hover:bg-white/15 text-white font-semibold text-sm sm:text-base transition-colors whitespace-nowrap"
                >
                  Login
                </button>
                <InstallAppButton
                  variant="hero"
                  onOpenInApp={() => onNavigate('auth', 'register')}
                  onOpenGuide={() => onNavigate('install')}
                />
                <button
                  type="button"
                  onClick={() => onNavigate('install')}
                  className="min-h-[48px] px-4 py-3 rounded-xl border border-white/25 bg-white/5 hover:bg-white/15 text-purple-100 text-sm font-semibold transition-colors whitespace-nowrap"
                >
                  Install Guide
                </button>
              </div>
            )}

            <div className="mt-8 pt-6 border-t border-white/15 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs sm:text-sm text-purple-200">
              <span>Adults 18+ only</span>
              <span aria-hidden="true">·</span>
              <span>Email-verified messaging</span>
              <span aria-hidden="true">·</span>
              <span>Real members, zero fake profiles</span>
            </div>
          </div>

          <div className="lg:col-span-6 flex">
            <div className="relative w-full rounded-2xl overflow-hidden border border-white/15 bg-purple-950 min-h-[240px] sm:min-h-[340px]">
              {!heroImgFailed && !dataSaver ? (
                <img
                  src={heroRomanceImg}
                  alt="Couple sharing warm evening tea at twilight"
                  referrerPolicy="no-referrer"
                  fetchPriority="high"
                  decoding="async"
                  onError={() => setHeroImgFailed(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center bg-gradient-to-br from-purple-900 via-purple-950 to-pink-900">
                  <Heart className="w-12 h-12 text-pink-300 mb-3" />
                  <p className="font-editorial text-xl font-semibold text-white">
                    FIND YOUR LOVE
                  </p>
                  <p className="text-sm text-purple-200 mt-1">
                    {dataSaver
                      ? 'Hero photo paused while Data Saver is active.'
                      : 'Two Countries, One Heart.'}
                  </p>
                </div>
              )}
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-gradient-to-t from-[#1A0A26]/70 via-transparent to-transparent pointer-events-none"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Real Community Statistics */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 -mt-6 relative z-10">
        <div className="bg-white rounded-2xl border border-purple-950/10 shadow-sm p-5 sm:p-6 grid grid-cols-2 lg:grid-cols-4 gap-6">
          <div>
            <p className="text-xs font-medium text-purple-950/60">
              Registered Members
            </p>
            <p className="text-2xl sm:text-3xl font-bold text-[#2E1065] tabular-nums mt-1">
              {stats ? stats.totalMembers : 0}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-purple-950/60">
              Uganda Community 🇺🇬
            </p>
            <p className="text-2xl sm:text-3xl font-bold text-[#2E1065] tabular-nums mt-1">
              {stats ? stats.ugandaMembers : 0}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-purple-950/60">
              Jeddah Community 🇸🇦
            </p>
            <p className="text-2xl sm:text-3xl font-bold text-[#2E1065] tabular-nums mt-1">
              {stats ? stats.jeddahMembers : 0}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-purple-950/60">
              Mutual Matches Made
            </p>
            <p className="text-2xl sm:text-3xl font-bold text-pink-600 tabular-nums mt-1">
              {stats ? stats.totalMatches : 0}
            </p>
          </div>
        </div>
      </section>

      {/* Featured Communities: Uganda & Jeddah */}
      <section className="cv-auto max-w-7xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <div className="max-w-2xl mb-8">
          <p className="text-sm font-semibold text-pink-600 mb-2">
            Featured Communities
          </p>
          <h2 className="text-2xl sm:text-4xl font-bold text-[#2E1065] text-balance">
            Built for Uganda, Jeddah, and meaningful global connections
          </h2>
          <p className="text-purple-950/75 text-base mt-3 leading-relaxed">
            Whether you are looking for genuine friendship or lifelong romance, meet real adults across Kampala, Entebbe, Jinja, Jeddah, Riyadh, and beyond.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <article className="bg-white rounded-2xl border border-purple-950/10 overflow-hidden flex flex-col">
            <div className="aspect-[4/3] bg-purple-950 relative overflow-hidden">
              {!dataSaver ? (
                <img
                  src={ugandaImg}
                  alt="Kampala Uganda hills and Lake Victoria at golden hour"
                  referrerPolicy="no-referrer"
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-purple-200 text-sm p-6 text-center">
                  Kampala & Uganda Community 🇺🇬 (Image paused in Data Saver)
                </div>
              )}
            </div>
            <div className="p-6 flex-1 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 text-xs font-medium text-purple-950/60 mb-2">
                  <MapPin className="w-3.5 h-3.5 text-pink-600" />
                  <span>Kampala · Entebbe · Jinja · Mbarara</span>
                </div>
                <h3 className="text-xl font-bold text-[#2E1065] mb-2">
                  Uganda Community 🇺🇬
                </h3>
                <p className="text-sm text-purple-950/75 leading-relaxed">
                  Connect with thoughtful Ugandans at home and in the diaspora who value family, warmth, faith, and authentic companionship.
                </p>
              </div>
              <div className="mt-5 pt-4 border-t border-purple-950/10 flex items-center justify-between">
                <span className="text-sm font-semibold text-[#2E1065] tabular-nums">
                  {stats ? stats.ugandaMembers : 0} registered members
                </span>
                <button
                  type="button"
                  onClick={() => onNavigate(user ? 'discover' : 'auth', 'register')}
                  className="min-h-[40px] px-3 py-1.5 text-sm font-semibold text-pink-600 hover:text-pink-700 inline-flex items-center gap-1"
                >
                  <span>Explore</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </article>

          <article className="bg-white rounded-2xl border border-purple-950/10 overflow-hidden flex flex-col">
            <div className="aspect-[4/3] bg-purple-950 relative overflow-hidden">
              {!dataSaver ? (
                <img
                  src={jeddahImg}
                  alt="Jeddah Corniche waterfront at twilight in Saudi Arabia"
                  referrerPolicy="no-referrer"
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-purple-200 text-sm p-6 text-center">
                  Jeddah, Saudi Arabia Community 🇸🇦 (Image paused in Data Saver)
                </div>
              )}
            </div>
            <div className="p-6 flex-1 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 text-xs font-medium text-purple-950/60 mb-2">
                  <MapPin className="w-3.5 h-3.5 text-pink-600" />
                  <span>Jeddah · Red Sea Coast · Across Saudi Arabia</span>
                </div>
                <h3 className="text-xl font-bold text-[#2E1065] mb-2">
                  Jeddah Community 🇸🇦
                </h3>
                <p className="text-sm text-purple-950/75 leading-relaxed">
                  Meet respectful residents, professionals, and expats living in Jeddah who are open to genuine cross-cultural friendship and serious dating.
                </p>
              </div>
              <div className="mt-5 pt-4 border-t border-purple-950/10 flex items-center justify-between">
                <span className="text-sm font-semibold text-[#2E1065] tabular-nums">
                  {stats ? stats.jeddahMembers : 0} registered members
                </span>
                <button
                  type="button"
                  onClick={() => onNavigate(user ? 'discover' : 'auth', 'register')}
                  className="min-h-[40px] px-3 py-1.5 text-sm font-semibold text-pink-600 hover:text-pink-700 inline-flex items-center gap-1"
                >
                  <span>Explore</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </article>
        </div>
      </section>

      {/* How It Works */}
      <section className="cv-auto bg-white border-y border-purple-950/10 py-12 sm:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-6 space-y-6">
            <div>
              <p className="text-sm font-semibold text-pink-600 mb-2">
                How It Works
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold text-[#2E1065]">
                Simple, safe, and respectful from your first hello
              </h2>
            </div>

            <div className="space-y-5 divide-y divide-purple-950/10">
              <div className="pt-2">
                <h3 className="text-base font-bold text-[#2E1065]">
                  01. Register & Verify Your Email (18+)
                </h3>
                <p className="text-sm text-purple-950/75 mt-1 leading-relaxed">
                  Create your profile with your city, relationship intention (friendship or dating), and interests. Email verification is required before sending likes or messages.
                </p>
              </div>
              <div className="pt-5">
                <h3 className="text-base font-bold text-[#2E1065]">
                  02. Discover Real Members & Mutual Matches
                </h3>
                <p className="text-sm text-purple-950/75 mt-1 leading-relaxed">
                  Browse real profiles filtered by Uganda, Jeddah, country, age, and shared interests. A match is created only when both of you tap Like.
                </p>
              </div>
              <div className="pt-5">
                <h3 className="text-base font-bold text-[#2E1065]">
                  03. Private Real-Time Chat with Safety Controls
                </h3>
                <p className="text-sm text-purple-950/75 mt-1 leading-relaxed">
                  Message your mutual matches privately with timestamps, unread indicators, instant block/report tools, and zero public exposure of your email or address.
                </p>
              </div>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="aspect-[4/3] rounded-2xl overflow-hidden border border-purple-950/10 bg-purple-950">
              {!dataSaver ? (
                <img
                  src={connectionImg}
                  alt="Friends laughing together over coffee and tea"
                  referrerPolicy="no-referrer"
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-purple-100 text-sm p-6 text-center">
                  Genuine conversation & friendship (Image paused in Data Saver)
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Popular Interests (Real Data When Signed In, Honest Community Topics) */}
      <section className="cv-auto max-w-7xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
          <div>
            <p className="text-sm font-semibold text-pink-600 mb-1">
              Shared Interests
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-[#2E1065]">
              {sortedInterests.length > 0
                ? 'Most Popular Member Interests Right Now'
                : 'Interests Members Connect Over'}
            </h2>
          </div>
          {!user && (
            <p className="text-xs text-purple-950/60">
              Live member counts appear once you sign in
            </p>
          )}
        </div>

        {sortedInterests.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {sortedInterests.slice(0, 8).map(([interest, count]) => (
              <div
                key={interest}
                className="bg-white rounded-xl border border-purple-950/10 p-4 flex items-center justify-between gap-2"
              >
                <span className="text-sm font-semibold text-[#2E1065] truncate">
                  {interest}
                </span>
                <span className="text-xs font-medium text-pink-600 tabular-nums shrink-0">
                  {count} {count === 1 ? 'member' : 'members'}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-purple-950/10 p-6">
            <p className="text-sm text-purple-950/75 leading-relaxed">
              {POPULAR_INTERESTS.join(' · ')}
            </p>
            <div className="mt-4 pt-4 border-t border-purple-950/10 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-purple-950/60">
                No fake interest counts — create a profile to add yours to the live community.
              </span>
              <button
                type="button"
                onClick={() => onNavigate(user ? 'discover' : 'auth', 'register')}
                className="text-sm font-semibold text-[#6B21A8] hover:text-pink-600"
              >
                {user ? 'Go to Discover' : 'Join Free Today'}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Safety Promise Banner */}
      <section className="cv-auto max-w-7xl mx-auto px-4 sm:px-6 pb-10">
        <div className="bg-[#2E1065] text-white rounded-2xl p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-pink-300 text-sm font-semibold mb-2">
              <ShieldCheck className="w-5 h-5" />
              <span>Your Safety Comes First</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold mb-2">
              Never send money or financial details to anyone you meet online
            </h2>
            <p className="text-sm text-purple-100/85 leading-relaxed">
              FIND YOUR LOVE strictly prohibits romance scams, money requests, and underage accounts. Passwords, private emails, and exact dates of birth are never shared with other members.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('safety')}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-white text-[#2E1065] hover:bg-purple-50 text-sm font-semibold transition-colors whitespace-nowrap"
            >
              Read Safety Guide
            </button>
          </div>
        </div>
      </section>

      {/* Quiet Footer */}
      <footer className="border-t border-purple-950/10 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div>
            <BrandLogo size="sm" />
            <p className="text-xs text-purple-950/60 mt-2">
              Two Countries, One Heart · Adults 18+ · Uganda, Jeddah & Worldwide
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-sm text-purple-950/75">
            <button
              type="button"
              onClick={() => onNavigate('safety')}
              className="hover:text-[#2E1065] min-h-[40px]"
            >
              Safety & Privacy
            </button>
            <button
              type="button"
              onClick={() => onNavigate('premium')}
              className="hover:text-[#2E1065] min-h-[40px]"
            >
              Premium Plans
            </button>
            <button
              type="button"
              onClick={() => onNavigate('install')}
              className="hover:text-[#2E1065] min-h-[40px]"
            >
              Install App
            </button>
            <button
              type="button"
              onClick={toggleDataSaver}
              className="min-h-[40px] px-3 py-1.5 rounded-lg border border-purple-950/15 hover:bg-purple-50 text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <Zap className="w-3.5 h-3.5 text-purple-700" />
              <span>Data Saver: {dataSaver ? 'ON' : 'OFF'}</span>
            </button>
            {user && (
              <span className="inline-flex items-center gap-1 text-xs text-purple-950/60">
                <UserCheck className="w-3.5 h-3.5" />
                <span>Signed in</span>
              </span>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
