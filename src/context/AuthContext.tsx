import {
  createUserWithEmailAndPassword,
  deleteUser,
  GoogleAuthProvider,
  onIdTokenChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  auth,
  db,
  ensureLocalPersistence,
  isFirebaseConfigured,
} from '../lib/firebase';
import {
  createInitialUserProfiles,
  deleteMemberFirestoreData,
  subscribeBlocks,
  subscribeGlobalIncomingCalls,
  subscribeMyMatches,
  subscribeMyPrivateProfile,
  subscribeMyProfile,
  syncEmailVerificationStatus,
  updateMyPresence,
  type IncomingCallEvent,
  type RegistrationPayload,
} from '../services/datingService';
import {
  ADMIN_EMAIL,
  type BlockRecord,
  type MatchRecord,
  type PresencePrivacy,
  type PrivateProfile,
  type PublicProfile,
} from '../types/app';

const AUTH_TIMEOUT_MS = 18000;

function withTimeout<T>(
  promise: Promise<T>,
  ms = AUTH_TIMEOUT_MS,
  timeoutMessage = 'Connection is taking longer than expected. Please check your internet and try again.'
): Promise<T> {
  let timerId: number | undefined;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timerId = window.setTimeout(() => {
        const err = new Error(timeoutMessage) as Error & { code?: string };
        err.code = 'auth/timeout';
        reject(err);
      }, ms);
    }),
  ]).finally(() => {
    if (timerId !== undefined) window.clearTimeout(timerId);
  });
}

export type ProfileStatus = 'idle' | 'loading' | 'loaded' | 'missing' | 'error';

interface AuthContextValue {
  user: User | null;
  authReady: boolean;
  profile: PublicProfile | null;
  privateProfile: PrivateProfile | null;
  profileLoading: boolean;
  profileStatus: ProfileStatus;
  profileError: string | null;
  retryProfileLoad: () => void;
  isAdmin: boolean;
  matches: MatchRecord[];
  blockedIds: Set<string>;
  myBlockDocs: BlockRecord[];
  totalUnreadMessages: number;
  incomingCalls: IncomingCallEvent[];
  authProviderSetupHint: string | null;
  clearAuthProviderSetupHint: () => void;
  registerWithEmail: (
    email: string,
    password: string,
    profileData: Omit<RegistrationPayload, 'uid' | 'email' | 'emailVerified'>
  ) => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<{ needsProfileSetup: boolean }>;
  completeOAuthProfile: (
    profileData: Omit<RegistrationPayload, 'uid' | 'email' | 'emailVerified'>
  ) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  resendVerificationEmail: () => Promise<void>;
  refreshVerificationState: () => Promise<boolean>;
  logout: () => Promise<void>;
  deleteMyAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [privateProfile, setPrivateProfile] = useState<PrivateProfile | null>(null);
  const [profileStatus, setProfileStatus] = useState<ProfileStatus>('idle');
  const [profileError, setProfileError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());
  const [myBlockDocs, setMyBlockDocs] = useState<BlockRecord[]>([]);
  const [incomingCalls, setIncomingCalls] = useState<IncomingCallEvent[]>([]);
  const [authProviderSetupHint, setAuthProviderSetupHint] = useState<string | null>(
    null
  );

  const lastVerifiedSyncUid = useRef<string | null>(null);
  const profileStatusRef = useRef<ProfileStatus>('idle');
  profileStatusRef.current = profileStatus;
  const authInFlightRef = useRef(false);
  const userUid = user?.uid ?? null;
  const onlinePrivacy: PresencePrivacy =
    privateProfile?.onlineStatusPrivacy || 'everyone';
  const onlinePrivacyRef = useRef<PresencePrivacy>(onlinePrivacy);
  onlinePrivacyRef.current = onlinePrivacy;
  const isMarkedOnlineRef = useRef(false);

  const checkAdminRole = useCallback(async (u: User) => {
    if (!u.emailVerified) {
      setIsAdmin(false);
      return;
    }
    if (u.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
      setIsAdmin(true);
      return;
    }
    try {
      const snap = await getDoc(doc(db, 'admins', u.uid));
      setIsAdmin(snap.exists());
    } catch {
      // Preserve existing admin state if offline
    }
  }, []);

  // Hydrate persisted Firebase session before marking authReady
  useEffect(() => {
    if (!isFirebaseConfigured) {
      setAuthReady(true);
      return;
    }

    let cancelled = false;
    const readyFallbackTimer = window.setTimeout(() => {
      if (!cancelled) {
        setAuthReady(true);
      }
    }, 2500);

    if (typeof auth.authStateReady === 'function') {
      auth
        .authStateReady()
        .catch(() => {})
        .finally(() => {
          window.clearTimeout(readyFallbackTimer);
          if (!cancelled) {
            setUser(auth.currentUser);
            setAuthReady(true);
          }
        });
    } else {
      window.clearTimeout(readyFallbackTimer);
      setAuthReady(true);
    }

    const unsub = onIdTokenChanged(auth, (firebaseUser) => {
      if (cancelled) return;
      setUser(firebaseUser);
      setAuthReady(true);

      if (firebaseUser) {
        checkAdminRole(firebaseUser);
      } else {
        lastVerifiedSyncUid.current = null;
        setProfile(null);
        setPrivateProfile(null);
        setProfileStatus('idle');
        setProfileError(null);
        setIsAdmin(false);
        setMatches([]);
        setBlockedIds(new Set());
        setMyBlockDocs([]);
        setIncomingCalls([]);
      }
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [checkAdminRole]);

  // Automatically refresh ID tokens on reconnect, foregrounding, or long active sessions
  useEffect(() => {
    if (!userUid) return;

    const refreshTokenSafely = (forceRefresh: boolean) => {
      const current = auth.currentUser;
      if (!current) return;
      current.getIdToken(forceRefresh).catch(() => {
        // Never sign out on temporary network loss
      });
    };

    const handleOnline = () => {
      refreshTokenSafely(true);
      if (profileStatusRef.current === 'error') {
        setReloadNonce((n) => n + 1);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        refreshTokenSafely(false);
      }
    };

    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    const intervalId = window.setInterval(() => {
      if (navigator.onLine) refreshTokenSafely(true);
    }, 45 * 60 * 1000);

    return () => {
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearInterval(intervalId);
    };
  }, [userUid]);

  // Subscribe to profile and user collections keyed strictly by userUid (not User object reference)
  useEffect(() => {
    if (!userUid) return;

    setProfileStatus((prev) => (prev === 'loaded' ? 'loaded' : 'loading'));
    setProfileError(null);

    const unsubPub = subscribeMyProfile(
      userUid,
      (p) => {
        if (p) {
          setProfile(p);
          setProfileStatus('loaded');
          setProfileError(null);
          const current = auth.currentUser;
          if (
            current &&
            p.emailVerified !== current.emailVerified &&
            lastVerifiedSyncUid.current !== `${userUid}_${current.emailVerified}`
          ) {
            lastVerifiedSyncUid.current = `${userUid}_${current.emailVerified}`;
            current
              .getIdToken(true)
              .then(() => syncEmailVerificationStatus(userUid, current.emailVerified))
              .catch(() => {});
          }
        } else {
          setProfile(null);
          setProfileStatus('missing');
          setProfileError(null);
        }
      },
      (err) => {
        // Do NOT clear an already-loaded profile or mark it as 'missing' on network errors
        setProfileStatus((prev) => (prev === 'loaded' ? 'loaded' : 'error'));
        setProfileError(
          err.message ||
            'Unable to reach the server right now. Check your connection and retry.'
        );
      }
    );

    const unsubPriv = subscribeMyPrivateProfile(
      userUid,
      (priv) => setPrivateProfile(priv),
      () => {}
    );

    const unsubMatches = subscribeMyMatches(
      userUid,
      (list) => setMatches(list),
      () => {}
    );

    const unsubBlocks = subscribeBlocks(
      userUid,
      (ids, docs) => {
        setBlockedIds(ids);
        setMyBlockDocs(docs);
      },
      () => {}
    );

    return () => {
      unsubPub();
      unsubPriv();
      unsubMatches();
      unsubBlocks();
    };
  }, [userUid, reloadNonce]);

  // Real-time activity, connection, & privacy-aware presence lifecycle (Android 11+ & Desktop safe)
  useEffect(() => {
    if (!userUid) {
      isMarkedOnlineRef.current = false;
      return;
    }

    const HEARTBEAT_INTERVAL_MS = 20_000;
    const INACTIVITY_TIMEOUT_MS = 90_000;
    let lastActivityMs = Date.now();
    let lastWriteMs = 0;

    const sendPresence = (online: boolean, force = false) => {
      const now = Date.now();
      if (online) {
        if (!navigator.onLine || document.visibilityState !== 'visible') {
          return;
        }
        if (
          !force &&
          isMarkedOnlineRef.current &&
          now - lastWriteMs < HEARTBEAT_INTERVAL_MS - 1500
        ) {
          return;
        }
        isMarkedOnlineRef.current = true;
        lastWriteMs = now;
        void updateMyPresence(userUid, true, onlinePrivacyRef.current);
      } else {
        if (!force && !isMarkedOnlineRef.current) return;
        isMarkedOnlineRef.current = false;
        lastWriteMs = now;
        if (navigator.onLine) {
          void updateMyPresence(userUid, false, onlinePrivacyRef.current);
        }
      }
    };

    const handleUserActivity = () => {
      lastActivityMs = Date.now();
      if (
        document.visibilityState === 'visible' &&
        navigator.onLine &&
        !isMarkedOnlineRef.current
      ) {
        sendPresence(true, true);
      }
    };

    const handleVisibleOrOnline = () => {
      lastActivityMs = Date.now();
      if (document.visibilityState === 'visible' && navigator.onLine) {
        sendPresence(true, true);
      } else {
        sendPresence(false, true);
      }
    };

    const handleOfflineOrClosing = () => {
      sendPresence(false, true);
    };

    sendPresence(true, true);

    const activityEvents = [
      'pointerdown',
      'keydown',
      'touchstart',
      'scroll',
    ] as const;
    activityEvents.forEach((evt) => {
      window.addEventListener(evt, handleUserActivity, { passive: true });
    });
    window.addEventListener('focus', handleVisibleOrOnline);
    window.addEventListener('online', handleVisibleOrOnline);
    window.addEventListener('offline', handleOfflineOrClosing);
    window.addEventListener('pagehide', handleOfflineOrClosing);
    window.addEventListener('beforeunload', handleOfflineOrClosing);
    document.addEventListener('freeze', handleOfflineOrClosing);
    document.addEventListener('visibilitychange', handleVisibleOrOnline);

    const heartbeat = window.setInterval(() => {
      const now = Date.now();
      if (document.visibilityState !== 'visible' || !navigator.onLine) {
        sendPresence(false);
        return;
      }
      if (now - lastActivityMs >= INACTIVITY_TIMEOUT_MS) {
        sendPresence(false);
        return;
      }
      sendPresence(true, true);
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      window.clearInterval(heartbeat);
      activityEvents.forEach((evt) => {
        window.removeEventListener(evt, handleUserActivity);
      });
      window.removeEventListener('focus', handleVisibleOrOnline);
      window.removeEventListener('online', handleVisibleOrOnline);
      window.removeEventListener('offline', handleOfflineOrClosing);
      window.removeEventListener('pagehide', handleOfflineOrClosing);
      window.removeEventListener('beforeunload', handleOfflineOrClosing);
      document.removeEventListener('freeze', handleOfflineOrClosing);
      document.removeEventListener('visibilitychange', handleVisibleOrOnline);
      if (auth.currentUser?.uid === userUid && navigator.onLine) {
        isMarkedOnlineRef.current = false;
        void updateMyPresence(userUid, false, onlinePrivacyRef.current);
      }
    };
  }, [userUid]);

  // Immediately push updated privacyMode to presence/{uid} when user changes privacy settings
  useEffect(() => {
    if (!userUid || !privateProfile?.onlineStatusPrivacy) return;
    if (!navigator.onLine) return;
    const isCurrentlyActive =
      document.visibilityState === 'visible' && isMarkedOnlineRef.current;
    void updateMyPresence(
      userUid,
      isCurrentlyActive,
      privateProfile.onlineStatusPrivacy
    );
  }, [userUid, privateProfile?.onlineStatusPrivacy]);

  // Global real-time listener for incoming WebRTC video calls across matches
  useEffect(() => {
    if (!userUid || !user?.emailVerified || matches.length === 0) {
      setIncomingCalls([]);
      return;
    }
    const unblockedMatches = matches.filter((m) => {
      const otherUid = m.uidA === userUid ? m.uidB : m.uidA;
      return !blockedIds.has(otherUid);
    });
    return subscribeGlobalIncomingCalls(unblockedMatches, userUid, setIncomingCalls);
  }, [userUid, user?.emailVerified, matches, blockedIds]);

  const retryProfileLoad = useCallback(() => {
    if (!userUid) return;
    setProfileStatus('loading');
    setProfileError(null);
    setReloadNonce((n) => n + 1);
  }, [userUid]);

  const mapAuthError = (err: unknown): Error => {
    const code = (err as { code?: string }).code || '';
    if (code === 'auth/operation-not-allowed') {
      setAuthProviderSetupHint(
        'Email/Password sign-in is not yet enabled in your Firebase Console. Open Firebase Console -> Authentication -> Sign-in method -> Email/Password -> Enable, or sign in with Google below.'
      );
      return new Error(
        'Email/Password authentication needs to be enabled in Firebase Console first. You can also continue with Google right now.'
      );
    }
    if (code === 'auth/email-already-in-use') {
      return new Error('An account with this email address already exists. Please log in instead.');
    }
    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
      return new Error('Incorrect email address or password. Please check your details and try again.');
    }
    if (code === 'auth/weak-password') {
      return new Error('Please choose a stronger password with at least 6 characters.');
    }
    if (code === 'auth/too-many-requests') {
      return new Error('Too many attempts. Please wait a few minutes before trying again.');
    }
    if (code === 'auth/network-request-failed' || code === 'auth/timeout') {
      return new Error(
        code === 'auth/timeout'
          ? 'The request timed out on a slow connection. Please check your signal and retry.'
          : 'Network connection interrupted. Please check your internet and try again.'
      );
    }
    if (code === 'auth/popup-closed-by-user') {
      return new Error('Sign-in popup was closed before finishing.');
    }
    if (code === 'auth/popup-blocked') {
      return new Error('Pop-up was blocked by your browser. Please allow pop-ups or use Email & Password.');
    }
    return err instanceof Error ? err : new Error('Authentication failed. Please try again.');
  };

  const registerWithEmail = async (
    email: string,
    password: string,
    profileData: Omit<RegistrationPayload, 'uid' | 'email' | 'emailVerified'>
  ) => {
    if (authInFlightRef.current) return;
    authInFlightRef.current = true;
    try {
      void ensureLocalPersistence();
      const cred = await withTimeout(
        createUserWithEmailAndPassword(auth, email.trim(), password)
      );
      await withTimeout(
        createInitialUserProfiles(
          {
            ...profileData,
            uid: cred.user.uid,
            email: cred.user.email || email.trim(),
            emailVerified: cred.user.emailVerified,
          },
          { skipExistenceCheck: true }
        )
      );
      // Dispatch verification email in the background so registration finishes immediately
      void sendEmailVerification(cred.user).catch(() => {});
    } catch (err) {
      throw mapAuthError(err);
    } finally {
      authInFlightRef.current = false;
    }
  };

  const loginWithEmail = async (email: string, password: string) => {
    if (authInFlightRef.current) return;
    authInFlightRef.current = true;
    try {
      void ensureLocalPersistence();
      await withTimeout(
        signInWithEmailAndPassword(auth, email.trim(), password)
      );
    } catch (err) {
      throw mapAuthError(err);
    } finally {
      authInFlightRef.current = false;
    }
  };

  const loginWithGoogle = async (): Promise<{ needsProfileSetup: boolean }> => {
    if (authInFlightRef.current) {
      return { needsProfileSetup: false };
    }
    authInFlightRef.current = true;
    try {
      void ensureLocalPersistence();
      const provider = new GoogleAuthProvider();
      const cred = await signInWithPopup(auth, provider);
      try {
        const snap = await withTimeout(
          getDoc(doc(db, 'profiles', cred.user.uid)),
          8000
        );
        return { needsProfileSetup: !snap.exists() };
      } catch {
        // Do not wrongly send existing members to registration on transient Firestore read failure
        return { needsProfileSetup: false };
      }
    } catch (err) {
      throw mapAuthError(err);
    } finally {
      authInFlightRef.current = false;
    }
  };

  const completeOAuthProfile = async (
    profileData: Omit<RegistrationPayload, 'uid' | 'email' | 'emailVerified'>
  ) => {
    if (!auth.currentUser) {
      throw new Error('Your sign-in session is missing. Please sign in once to save your profile.');
    }
    await withTimeout(
      createInitialUserProfiles({
        ...profileData,
        uid: auth.currentUser.uid,
        email: auth.currentUser.email || '',
        emailVerified: auth.currentUser.emailVerified,
      })
    );
  };

  const requestPasswordReset = async (email: string) => {
    try {
      await withTimeout(sendPasswordResetEmail(auth, email.trim()));
    } catch (err) {
      throw mapAuthError(err);
    }
  };

  const resendVerificationEmail = async () => {
    if (!auth.currentUser) throw new Error('No signed-in user.');
    try {
      await withTimeout(sendEmailVerification(auth.currentUser));
    } catch (err) {
      throw mapAuthError(err);
    }
  };

  const refreshVerificationState = async (): Promise<boolean> => {
    if (!auth.currentUser) return false;
    try {
      await withTimeout(auth.currentUser.reload());
      await withTimeout(auth.currentUser.getIdToken(true));
      const updatedUser = auth.currentUser;
      setUser(updatedUser);
      await checkAdminRole(updatedUser);
      if (updatedUser.emailVerified) {
        await syncEmailVerificationStatus(updatedUser.uid, true);
      }
      return updatedUser.emailVerified;
    } catch (err) {
      throw mapAuthError(err);
    }
  };

  const logout = async () => {
    isMarkedOnlineRef.current = false;
    if (auth.currentUser) {
      await updateMyPresence(
        auth.currentUser.uid,
        false,
        onlinePrivacyRef.current
      ).catch(() => {});
    }
    try {
      localStorage.removeItem('fyl_last_route');
    } catch {
      // Ignore storage restrictions
    }
    await signOut(auth);
  };

  const deleteMyAccount = async () => {
    const current = auth.currentUser;
    if (!current) throw new Error('Not signed in.');
    await deleteMemberFirestoreData(current.uid);
    try {
      await deleteUser(current);
    } catch (err) {
      const code = (err as { code?: string }).code || '';
      if (code === 'auth/requires-recent-login') {
        throw new Error(
          'Your profile data has been deleted. For security, please log out and log back in once to permanently remove your login credential.'
        );
      }
      throw err;
    }
  };

  const totalUnreadMessages = matches.reduce((sum, m) => {
    if (!user) return sum;
    if (blockedIds.has(m.uidA === user.uid ? m.uidB : m.uidA)) return sum;
    return sum + (m.uidA === user.uid ? m.unreadByUidA : m.unreadByUidB);
  }, 0);

  const profileLoading = Boolean(userUid) && profileStatus === 'loading';

  return (
    <AuthContext.Provider
      value={{
        user,
        authReady,
        profile,
        privateProfile,
        profileLoading,
        profileStatus,
        profileError,
        retryProfileLoad,
        isAdmin,
        matches,
        blockedIds,
        myBlockDocs,
        totalUnreadMessages,
        incomingCalls,
        authProviderSetupHint,
        clearAuthProviderSetupHint: () => setAuthProviderSetupHint(null),
        registerWithEmail,
        loginWithEmail,
        loginWithGoogle,
        completeOAuthProfile,
        requestPasswordReset,
        resendVerificationEmail,
        refreshVerificationState,
        logout,
        deleteMyAccount,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
