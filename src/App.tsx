import { Bell, PhoneIncoming, PhoneOff, Video, X } from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Avatar } from './components/Avatar';
import { EmailVerificationBanner } from './components/EmailVerificationBanner';
import { HomePage } from './components/HomePage';
import { Navbar } from './components/Navbar';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useDataSaver } from './context/DataSaverContext';
import { isFirebaseConfigured } from './lib/firebase';
import {
  subscribeMatchCalls,
  updateCallSession,
} from './services/datingService';
import type { CallSession, ViewRoute } from './types/app';

const loadAuthView = () =>
  import('./components/AuthView').then((m) => ({ default: m.AuthView }));
const loadDiscoverView = () =>
  import('./components/DiscoverView').then((m) => ({ default: m.DiscoverView }));
const loadMatchesView = () =>
  import('./components/MatchesAndChatView').then((m) => ({
    default: m.MatchesAndChatView,
  }));
const loadProfileView = () =>
  import('./components/ProfileView').then((m) => ({ default: m.ProfileView }));

const AuthView = lazy(loadAuthView);
const DiscoverView = lazy(loadDiscoverView);
const MatchesAndChatView = lazy(loadMatchesView);
const ProfileView = lazy(loadProfileView);
const PremiumView = lazy(() =>
  import('./components/PremiumView').then((m) => ({ default: m.PremiumView }))
);
const SafetyView = lazy(() =>
  import('./components/SafetyView').then((m) => ({ default: m.SafetyView }))
);
const InstallGuideView = lazy(() =>
  import('./components/InstallGuideView').then((m) => ({
    default: m.InstallGuideView,
  }))
);
const AdminDashboardView = lazy(() =>
  import('./components/AdminDashboardView').then((m) => ({
    default: m.AdminDashboardView,
  }))
);
const VideoCallModal = lazy(() =>
  import('./components/VideoCallModal').then((m) => ({
    default: m.VideoCallModal,
  }))
);

const LAST_ROUTE_KEY = 'fyl_last_route';
const RESTORABLE_ROUTES: ViewRoute[] = [
  'home',
  'discover',
  'matches',
  'profile',
  'premium',
  'safety',
  'install',
  'admin',
];
const ALL_PATH_ROUTES: ViewRoute[] = [...RESTORABLE_ROUTES, 'auth'];

function routeFromPathname(pathname: string): ViewRoute | null {
  const clean = pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
  if (!clean) return null;
  if (clean === 'membership' || clean === 'plans') return 'premium';
  if (clean === 'install-app' || clean === 'download') return 'install';
  if (ALL_PATH_ROUTES.includes(clean as ViewRoute)) {
    return clean as ViewRoute;
  }
  return null;
}

function getInitialRoute(): ViewRoute {
  if (typeof window !== 'undefined') {
    const pathRoute = routeFromPathname(window.location.pathname);
    if (pathRoute) return pathRoute;
  }
  try {
    const saved = localStorage.getItem(LAST_ROUTE_KEY) as ViewRoute | null;
    if (saved && RESTORABLE_ROUTES.includes(saved)) {
      return saved;
    }
  } catch {
    // Ignore storage restrictions
  }
  return 'home';
}

function RouteLoadingFallback({ label = 'Loading...' }: { label?: string }) {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 text-center">
      <div className="w-7 h-7 rounded-full border-2 border-purple-700 border-t-transparent animate-spin mx-auto mb-2.5" />
      <p className="text-sm text-purple-950/65">{label}</p>
    </div>
  );
}

function AppShell() {
  const {
    user,
    authReady,
    profileStatus,
    profileError,
    retryProfileLoad,
    isAdmin,
    matches,
    totalUnreadMessages,
    incomingCalls,
  } = useAuth();
  const { dataSaver } = useDataSaver();
  const [route, setRoute] = useState<ViewRoute>(getInitialRoute);
  const [authInitialMode, setAuthInitialMode] = useState<'login' | 'register'>(
    'login'
  );
  const [liveToast, setLiveToast] = useState<string | null>(null);
  const [openChatMatchId, setOpenChatMatchId] = useState<string | null>(null);
  const [globalActiveCall, setGlobalActiveCall] = useState<{
    matchId: string;
    callId: string;
    partnerName: string;
    partnerPhoto: string;
    initialSession: CallSession;
  } | null>(null);
  const [globalMatchCalls, setGlobalMatchCalls] = useState<CallSession[]>([]);
  const prevCountsRef = useRef<{ matches: number; unread: number } | null>(null);

  const navigate = (
    nextRoute: ViewRoute,
    initialAuthMode?: 'login' | 'register'
  ) => {
    if (initialAuthMode) setAuthInitialMode(initialAuthMode);
    setRoute(nextRoute);
    if (nextRoute !== 'auth') {
      try {
        localStorage.setItem(LAST_ROUTE_KEY, nextRoute);
      } catch {
        // Ignore storage restrictions
      }
    }
    if (typeof window !== 'undefined') {
      const targetPath = nextRoute === 'home' ? '/' : `/${nextRoute}`;
      if (window.location.pathname !== targetPath) {
        try {
          window.history.pushState({ route: nextRoute }, '', targetPath);
        } catch {
          // Ignore restricted history API in sandboxed previews
        }
      }
    }
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  // Sync browser Back/Forward buttons for SPA routing
  useEffect(() => {
    const onPopState = () => {
      const pathRoute = routeFromPathname(window.location.pathname);
      setRoute(pathRoute || 'home');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Real-time in-app notifications when a new match or new message arrives outside Matches & Chat
  useEffect(() => {
    if (!user) {
      prevCountsRef.current = null;
      setLiveToast(null);
      return;
    }
    const prev = prevCountsRef.current;
    if (!prev) {
      prevCountsRef.current = {
        matches: matches.length,
        unread: totalUnreadMessages,
      };
      return;
    }

    if (route !== 'matches') {
      if (matches.length > prev.matches) {
        setLiveToast('You have a new mutual match! Tap to say hello.');
      } else if (totalUnreadMessages > prev.unread) {
        setLiveToast('New private message received! Tap to reply.');
      }
    }
    prevCountsRef.current = {
      matches: matches.length,
      unread: totalUnreadMessages,
    };
  }, [user, matches.length, totalUnreadMessages, route]);

  // Redirect ONLY when Firestore explicitly confirmed the signed-in user has no profile yet
  useEffect(() => {
    if (
      authReady &&
      user &&
      profileStatus === 'missing' &&
      (route === 'discover' || route === 'matches' || route === 'profile')
    ) {
      setRoute('auth');
    }
  }, [authReady, user, profileStatus, route]);

  // Navigate directly to Home when already signed in with a loaded profile on Auth
  useEffect(() => {
    if (authReady && user && profileStatus === 'loaded' && route === 'auth') {
      navigate('home');
    }
  }, [authReady, user, profileStatus, route]);

  // Prevent ordinary members from accessing admin route
  useEffect(() => {
    if (route === 'admin' && authReady && !isAdmin) {
      setRoute('home');
    }
  }, [route, authReady, isAdmin]);

  // Gently prefetch core member route chunks during browser idle time (unless Data Saver is ON)
  useEffect(() => {
    if (!authReady || dataSaver) return;
    const prefetch = () => {
      if (user) {
        void loadDiscoverView();
        void loadMatchesView();
        void loadProfileView();
      } else {
        void loadAuthView();
      }
    };

    const win = window as Window & {
      requestIdleCallback?: (cb: () => void) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (typeof win.requestIdleCallback === 'function') {
      const id = win.requestIdleCallback(prefetch);
      return () => {
        win.cancelIdleCallback?.(id);
      };
    }
    const timer = globalThis.setTimeout(prefetch, 1500);
    return () => globalThis.clearTimeout(timer);
  }, [authReady, user, dataSaver]);

  // Keep live signaling stream synced while answering an incoming call globally
  useEffect(() => {
    if (!globalActiveCall) {
      setGlobalMatchCalls([]);
      return;
    }
    return subscribeMatchCalls(
      globalActiveCall.matchId,
      setGlobalMatchCalls,
      () => {
        // Ignore transient call stream errors while active
      }
    );
  }, [globalActiveCall]);

  // Clear global call if user logs out
  useEffect(() => {
    if (!user) {
      setGlobalActiveCall(null);
      setOpenChatMatchId(null);
    }
  }, [user]);

  const topGlobalIncoming = useMemo(() => {
    if (!user || globalActiveCall || incomingCalls.length === 0) return null;
    const candidate = incomingCalls[0];
    if (route === 'matches' && openChatMatchId === candidate.matchId) {
      return null;
    }
    const match = matches.find((m) => m.id === candidate.matchId);
    const isCallerA = match ? candidate.call.callerUid === match.uidA : true;
    const partnerName = match
      ? isCallerA
        ? match.userAName
        : match.userBName
      : 'Match';
    const partnerPhoto = match
      ? isCallerA
        ? match.userAPhoto
        : match.userBPhoto
      : '';
    return {
      matchId: candidate.matchId,
      call: candidate.call,
      partnerName,
      partnerPhoto,
    };
  }, [user, globalActiveCall, incomingCalls, route, openChatMatchId, matches]);

  const liveGlobalCallSession = useMemo(() => {
    if (!globalActiveCall) return null;
    return (
      globalMatchCalls.find((c) => c.id === globalActiveCall.callId) ||
      globalActiveCall.initialSession
    );
  }, [globalActiveCall, globalMatchCalls]);

  if (!isFirebaseConfigured) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-[#FAF7FC]">
        <div className="max-w-lg bg-white rounded-2xl border border-purple-950/15 p-8 space-y-4">
          <h1 className="text-2xl font-bold text-[#2E1065]">
            Firebase Configuration Required
          </h1>
          <p className="text-sm text-purple-950/80 leading-relaxed">
            To run FIND YOUR LOVE with real authentication, profiles, matching, and chat, connect your Firebase project in{' '}
            <code className="font-mono text-xs bg-purple-50 px-1.5 py-0.5 rounded">
              firebase-applet-config.json
            </code>
            .
          </p>
        </div>
      </div>
    );
  }

  const requiresAuthHydration =
    route === 'discover' ||
    route === 'matches' ||
    route === 'profile' ||
    route === 'admin' ||
    route === 'auth';

  const isWaitingForProfileOnProtectedRoute =
    Boolean(user) &&
    (profileStatus === 'idle' || profileStatus === 'loading') &&
    (route === 'discover' ||
      route === 'matches' ||
      route === 'profile' ||
      route === 'auth');

  const isProfileConnectionErrorOnProtectedRoute =
    Boolean(user) &&
    profileStatus === 'error' &&
    (route === 'discover' ||
      route === 'matches' ||
      route === 'profile' ||
      route === 'auth');

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF7FC] text-[#1E102E]">
      <Navbar currentRoute={route} onNavigate={(r) => navigate(r)} />
      <EmailVerificationBanner />

      {topGlobalIncoming && (
        <div
          role="alertdialog"
          aria-label={`Incoming video call from ${topGlobalIncoming.partnerName}`}
          className="fixed top-16 sm:top-20 right-3 left-3 sm:left-auto sm:w-96 z-50 bg-emerald-950 text-white rounded-2xl p-3.5 shadow-xl border border-emerald-400/35 flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative shrink-0">
              <Avatar
                src={topGlobalIncoming.partnerPhoto}
                name={topGlobalIncoming.partnerName}
                size="md"
              />
              <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-emerald-500 border-2 border-emerald-950 flex items-center justify-center">
                <Video className="w-2.5 h-2.5 text-white" />
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-300 flex items-center gap-1">
                <PhoneIncoming className="w-3 h-3 animate-pulse" />
                Incoming Video Call
              </p>
              <p className="text-sm font-bold text-white truncate">
                {topGlobalIncoming.partnerName}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() =>
                void updateCallSession(
                  topGlobalIncoming.matchId,
                  topGlobalIncoming.call.id,
                  { status: 'declined' }
                )
              }
              aria-label="Decline video call"
              className="min-h-[40px] px-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold inline-flex items-center gap-1 transition-colors"
            >
              <PhoneOff className="w-3.5 h-3.5" />
              Decline
            </button>
            <button
              type="button"
              onClick={() =>
                setGlobalActiveCall({
                  matchId: topGlobalIncoming.matchId,
                  callId: topGlobalIncoming.call.id,
                  partnerName: topGlobalIncoming.partnerName,
                  partnerPhoto: topGlobalIncoming.partnerPhoto,
                  initialSession: topGlobalIncoming.call,
                })
              }
              aria-label="Accept video call"
              className="min-h-[40px] px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-bold inline-flex items-center gap-1 transition-colors"
            >
              <Video className="w-3.5 h-3.5" />
              Accept
            </button>
          </div>
        </div>
      )}

      {liveToast && (
        <div
          role="status"
          className="fixed bottom-16 md:bottom-6 right-4 left-4 sm:left-auto sm:max-w-sm z-40 bg-[#2E1065] text-white rounded-2xl px-4 py-3 shadow-lg flex items-center justify-between gap-3 border border-white/15"
        >
          <button
            type="button"
            onClick={() => {
              setLiveToast(null);
              navigate('matches');
            }}
            className="flex items-center gap-2.5 text-left text-xs sm:text-sm font-semibold flex-1"
          >
            <Bell className="w-4 h-4 text-pink-300 shrink-0" />
            <span>{liveToast}</span>
          </button>
          <button
            type="button"
            onClick={() => setLiveToast(null)}
            aria-label="Dismiss notification"
            className="p-1 text-purple-200 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <main className="flex-1">
        {!authReady && requiresAuthHydration ? (
          <RouteLoadingFallback label="Restoring your session..." />
        ) : isWaitingForProfileOnProtectedRoute ? (
          <RouteLoadingFallback label="Loading your member profile..." />
        ) : isProfileConnectionErrorOnProtectedRoute ? (
          <div className="max-w-lg mx-auto px-4 py-12">
            <div className="bg-white rounded-2xl border border-purple-950/15 p-6 text-center space-y-3">
              <h1 className="text-xl font-bold text-[#2E1065]">
                Connection Interrupted
              </h1>
              <p className="text-sm text-purple-950/75">
                {profileError ||
                  'You are still signed in, but we could not load your profile right now.'}
              </p>
              <button
                type="button"
                onClick={retryProfileLoad}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-[#2E1065] text-white text-sm font-semibold"
              >
                Retry Loading Profile
              </button>
            </div>
          </div>
        ) : (
          <Suspense fallback={<RouteLoadingFallback />}>
            {route === 'home' && <HomePage onNavigate={navigate} />}
            {route === 'auth' && (
              <AuthView
                initialMode={authInitialMode}
                onSuccess={() => navigate('home')}
              />
            )}
            {route === 'discover' && <DiscoverView onNavigate={navigate} />}
            {route === 'matches' && (
              <MatchesAndChatView
                onNavigate={navigate}
                onActiveMatchChange={setOpenChatMatchId}
              />
            )}
            {route === 'profile' && <ProfileView onNavigate={navigate} />}
            {route === 'premium' && <PremiumView onNavigate={navigate} />}
            {route === 'safety' && <SafetyView onNavigate={navigate} />}
            {route === 'install' && <InstallGuideView onNavigate={navigate} />}
            {route === 'admin' && isAdmin && <AdminDashboardView />}
          </Suspense>
        )}
      </main>

      {globalActiveCall && user && (
        <Suspense fallback={null}>
          <VideoCallModal
            matchId={globalActiveCall.matchId}
            myUid={user.uid}
            partnerName={globalActiveCall.partnerName}
            partnerPhoto={globalActiveCall.partnerPhoto}
            mode="incoming"
            callId={globalActiveCall.callId}
            callSession={liveGlobalCallSession}
            onClose={() => {
              setGlobalActiveCall(null);
            }}
          />
        </Suspense>
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}
