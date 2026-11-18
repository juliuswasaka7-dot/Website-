import {
  ArrowLeft,
  Camera,
  Check,
  CheckCheck,
  Clock,
  Crown,
  FileText,
  Flag,
  Images,
  Lock,
  MapPin,
  MessageCircle,
  MessageCircleHeart,
  Mic,
  Moon,
  Paperclip,
  Phone,
  PhoneIncoming,
  Search,
  Send,
  ShieldBan,
  Smile,
  Square,
  Sun,
  Trash2,
  UserX,
  Users,
  Video,
  X,
} from 'lucide-react';
import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import { useAuth } from '../context/AuthContext';
import { useDataSaver } from '../context/DataSaverContext';
import {
  blockMember,
  createVideoCallSession,
  deleteChatMessage,
  fetchPrivateAlbum,
  fetchSingleProfile,
  getOrCreateDirectConversation,
  markMatchConversationRead,
  sendChatMessage,
  setTypingStatus,
  subscribeAllChatMembers,
  subscribeAllPresence,
  subscribeMatchCalls,
  subscribeMatchMessages,
  subscribeMyProfile,
  subscribePartnerPresences,
  subscribePartnerTyping,
  subscribeUserPresence,
  unmatchMember,
  updateCallSession,
} from '../services/datingService';
import {
  uploadChatAttachment,
  uploadVideoMessage,
  uploadVoiceMessage,
} from '../services/storageService';
import {
  FREE_DAILY_MESSAGES_LIMIT,
  getTodayUtcDateString,
  type CallSession,
  type ChatMessage,
  type MatchRecord,
  type PresenceStatus,
  type PublicProfile,
  type TypingStatus,
  type ViewRoute,
} from '../types/app';
import { Avatar } from './Avatar';
import { CallPermissionModal } from './CallPermissionModal';
import { MemberBadges } from './MemberBadges';
import { MemberProfileModal } from './MemberProfileModal';
import { ReportModal } from './ReportModal';
import { VideoMessageRecorder } from './VideoMessageRecorder';
import { formatAudioClock, VoiceNotePlayer } from './VoiceNotePlayer';
import {
  requestCallMediaStream,
  stopMediaStream,
  type CallMediaType,
  type MediaRequestFailure,
} from '../services/mediaPermissionService';

const VideoCallModal = lazy(() =>
  import('./VideoCallModal').then((m) => ({ default: m.VideoCallModal }))
);

interface MatchesAndChatViewProps {
  onNavigate: (route: ViewRoute) => void;
  initialMatchId?: string | null;
  onClearInitialMatch?: () => void;
  onActiveMatchChange?: (matchId: string | null) => void;
}

const CHAT_DARK_MODE_KEY = 'fyl_chat_dark_mode';
const MAX_VOICE_SECONDS = 45;
const MAX_VOICE_DIRECT_BYTES = 330 * 1024;

const QUICK_EMOJIS = [
  '❤️',
  '😊',
  '😍',
  '🥰',
  '😂',
  '🙏',
  '✨',
  '🌹',
  '👋',
  '🤗',
  '😘',
  '💕',
  '🔥',
  '🎉',
  '☕',
  '🌍',
  '🇺🇬',
  '🇸🇦',
  '👍',
  '🙌',
  '💯',
  '😌',
  '😁',
  '💫',
];

function getInitialDarkMode(): boolean {
  try {
    const saved = localStorage.getItem(CHAT_DARK_MODE_KEY);
    if (saved === 'true') return true;
    if (saved === 'false') return false;
  } catch {
    // Ignore storage issues
  }
  if (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function'
  ) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  return false;
}

function getDateMillis(ts: unknown): number | null {
  if (!ts) return null;
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts !== 'object') return null;
  if (
    'toMillis' in ts &&
    typeof (ts as { toMillis: () => number }).toMillis === 'function'
  ) {
    return (ts as { toMillis: () => number }).toMillis();
  }
  if (
    'toDate' in ts &&
    typeof (ts as { toDate: () => Date }).toDate === 'function'
  ) {
    return (ts as { toDate: () => Date }).toDate().getTime();
  }
  return null;
}

function formatTimestamp(ts: unknown): string {
  const ms = getDateMillis(ts);
  if (!ms) return 'Now';
  return new Date(ms).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateHeading(ts: unknown): string {
  const ms = getDateMillis(ts);
  if (!ms) return 'Today';
  const d = new Date(ms);
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime();
  const startOfTarget = new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate()
  ).getTime();
  const diffDays = Math.round((startOfToday - startOfTarget) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

function formatPresenceLabel(
  presence: PresenceStatus | null | undefined,
  nowMs: number
): { online: boolean; label: string } {
  if (!presence) {
    return { online: false, label: 'Offline' };
  }
  const lastMs = getDateMillis(presence.lastSeen);
  const isFreshOnline =
    presence.isOnline && lastMs !== null && nowMs - lastMs < 45_000;
  if (isFreshOnline) {
    return { online: true, label: 'Online' };
  }
  if (!lastMs) {
    return { online: false, label: 'Offline' };
  }
  const diffSec = Math.max(0, Math.floor((nowMs - lastMs) / 1000));
  if (diffSec < 60) {
    return { online: false, label: 'Last seen just now' };
  }
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return {
      online: false,
      label: `Last seen ${diffMin} ${diffMin === 1 ? 'minute' : 'minutes'} ago`,
    };
  }
  const now = new Date(nowMs);
  const target = new Date(lastMs);
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime();
  const startOfTarget = new Date(
    target.getFullYear(),
    target.getMonth(),
    target.getDate()
  ).getTime();
  const diffDays = Math.round((startOfToday - startOfTarget) / 86_400_000);

  if (diffDays === 1) {
    return { online: false, label: 'Last seen yesterday' };
  }

  const diffHr = Math.floor(diffMin / 60);
  if (diffDays === 0 && diffHr < 24) {
    return {
      online: false,
      label: `Last seen ${diffHr} ${diffHr === 1 ? 'hour' : 'hours'} ago`,
    };
  }

  return {
    online: false,
    label: `Last seen ${target.toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      year: target.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    })}`,
  };
}

function pickSupportedAudioMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) {
    return undefined;
  }
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

function mapMicError(err: unknown): string {
  const name = (err as { name?: string })?.name || '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'Microphone access is required to record voice notes. Enable microphone in your browser site settings and retry.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No microphone was found on this device.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'Your microphone is busy in another app. Close other recording apps and try again.';
  }
  return err instanceof Error
    ? err.message
    : 'Unable to record voice message. Please try again.';
}

export function MatchesAndChatView({
  onNavigate,
  initialMatchId,
  onClearInitialMatch,
  onActiveMatchChange,
}: MatchesAndChatViewProps) {
  const { user, profile, matches, blockedIds } = useAuth();
  const { dataSaver } = useDataSaver();
  const [darkMode, setDarkMode] = useState<boolean>(getInitialDarkMode);

  // Screen mode: null = CHAT HOME (All Members), non-null = INDIVIDUAL CONVERSATION SCREEN
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(
    initialMatchId || null
  );
  const [optimisticMatch, setOptimisticMatch] = useState<MatchRecord | null>(
    null
  );

  // Chat Home directory state (ALL registered users + live presence + search)
  const [allMembers, setAllMembers] = useState<PublicProfile[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [presenceMap, setPresenceMap] = useState<Record<string, PresenceStatus>>(
    {}
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [homeFilter, setHomeFilter] = useState<'all' | 'chats' | 'online'>(
    'all'
  );
  const [startingChatUid, setStartingChatUid] = useState<string | null>(null);

  // Individual conversation messages & media state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageLimit, setMessageLimit] = useState(30);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [messageRetryNonce, setMessageRetryNonce] = useState(0);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingMsgId, setDeletingMsgId] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  // Live partner profiles, online presence & typing state for active chat
  const [partnerProfiles, setPartnerProfiles] = useState<
    Record<string, PublicProfile>
  >({});
  const [activePartnerLive, setActivePartnerLive] =
    useState<PublicProfile | null>(null);
  const [partnerPresence, setPartnerPresence] =
    useState<PresenceStatus | null>(null);
  const [partnerTyping, setPartnerTyping] = useState<TypingStatus | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Voice recording & preview state
  const [recordingVoice, setRecordingVoice] = useState(false);
  const [voiceSeconds, setVoiceSeconds] = useState(0);
  const [voicePreview, setVoicePreview] = useState<{
    blob: Blob;
    url: string;
    durationSec: number;
  } | null>(null);
  const [uploadingVoice, setUploadingVoice] = useState(false);

  // Video message recording & upload state
  const [videoRecorderOpen, setVideoRecorderOpen] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);

  // Upload progress & attachment state
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceChunksRef = useRef<BlobPart[]>([]);
  const voiceBytesRef = useRef(0);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const voiceTimerRef = useRef<number | undefined>(undefined);
  const voiceSecondsRef = useRef(0);
  const voiceCancelledRef = useRef(false);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);

  // Typing debounce refs
  const lastTypingEmitRef = useRef<number>(0);
  const typingClearTimerRef = useRef<number | undefined>(undefined);
  const isCurrentlyTypingRef = useRef<boolean>(false);

  // 1-on-1 Live WebRTC Voice & Video Calling state
  const [matchCalls, setMatchCalls] = useState<CallSession[]>([]);
  const [activeCallModal, setActiveCallModal] = useState<{
    mode: 'outgoing' | 'incoming';
    callType: CallMediaType;
    callId: string;
    stream: MediaStream;
  } | null>(null);
  const activeCallStreamRef = useRef<MediaStream | null>(null);
  activeCallStreamRef.current = activeCallModal?.stream ?? null;
  const [requestingCallMedia, setRequestingCallMedia] = useState(false);
  const [pendingCallPermission, setPendingCallPermission] = useState<{
    mode: 'outgoing' | 'incoming';
    callType: CallMediaType;
    callId: string;
    partnerName: string;
    failure: MediaRequestFailure;
  } | null>(null);

  useEffect(() => {
    return () => {
      stopMediaStream(activeCallStreamRef.current);
    };
  }, []);

  // Private Photo Album viewer state (Premium)
  const [albumViewerOpen, setAlbumViewerOpen] = useState(false);
  const [albumLoading, setAlbumLoading] = useState(false);
  const [partnerAlbumPhotos, setPartnerAlbumPhotos] = useState<string[]>([]);

  const [reportMatch, setReportMatch] = useState<{
    uid: string;
    name: string;
    contextId: string;
  } | null>(null);
  const [inspectPartner, setInspectPartner] = useState<PublicProfile | null>(
    null
  );

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const isPremium = profile?.membershipTier === 'premium';

  // Sync deep-linked initialMatchId
  useEffect(() => {
    if (initialMatchId) {
      setSelectedMatchId(initialMatchId);
      onClearInitialMatch?.();
    }
  }, [initialMatchId, onClearInitialMatch]);

  // Notify AppShell which chat is currently open
  useEffect(() => {
    onActiveMatchChange?.(selectedMatchId);
    return () => {
      onActiveMatchChange?.(null);
    };
  }, [selectedMatchId, onActiveMatchChange]);

  const toggleDarkMode = () => {
    setDarkMode((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(CHAT_DARK_MODE_KEY, String(next));
      } catch {
        // Ignore storage issues
      }
      return next;
    });
  };

  // Refresh clock every 15s to keep "Online / Last seen" accurate, and every 2s while partner is typing
  useEffect(() => {
    const intervalMs = partnerTyping?.isTyping ? 2000 : 15_000;
    const id = window.setInterval(() => setNowMs(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [partnerTyping?.isTyping]);

  // Subscribe in real time to ALL registered public members & live public presence map
  useEffect(() => {
    if (!user) {
      setAllMembers([]);
      setPresenceMap({});
      setMembersLoading(false);
      return;
    }

    setMembersLoading(true);
    setMembersError(null);

    const unsubMembers = subscribeAllChatMembers(
      user.uid,
      (list) => {
        setAllMembers(list);
        setMembersLoading(false);
      },
      (err) => {
        setMembersError(
          err.message || 'Could not load registered members right now.'
        );
        setMembersLoading(false);
      }
    );

    const unsubPresence = subscribeAllPresence((publicMap) => {
      setPresenceMap((prev) => {
        const next: Record<string, PresenceStatus> = {};
        Object.entries(prev).forEach(([uid, status]) => {
          if (status?.privacyMode === 'matches_only') {
            next[uid] = status;
          }
        });
        Object.entries(publicMap).forEach(([uid, status]) => {
          next[uid] = status;
        });
        return next;
      });
    });

    return () => {
      unsubMembers();
      unsubPresence();
    };
  }, [user]);

  const visibleMatches = useMemo(() => {
    if (!user) return [];
    return matches
      .filter((m) => {
        const otherUid = m.uidA === user.uid ? m.uidB : m.uidA;
        return !blockedIds.has(otherUid);
      })
      .sort((a, b) => {
        const ta = getDateMillis(a.lastMessageAt) || 0;
        const tb = getDateMillis(b.lastMessageAt) || 0;
        return tb - ta;
      });
  }, [matches, user, blockedIds]);

  const matchByOtherUid = useMemo(() => {
    const map: Record<string, MatchRecord> = {};
    if (!user) return map;
    visibleMatches.forEach((m) => {
      const otherUid = m.uidA === user.uid ? m.uidB : m.uidA;
      map[otherUid] = m;
    });
    return map;
  }, [visibleMatches, user]);

  // Subscribe to authorized partner presence docs (including matches_only privacy)
  const partnerUidKey = useMemo(
    () =>
      Object.keys(matchByOtherUid)
        .sort()
        .slice(0, 40)
        .join(','),
    [matchByOtherUid]
  );

  useEffect(() => {
    if (!user || !partnerUidKey) return;
    const uids = partnerUidKey.split(',').filter(Boolean);
    return subscribePartnerPresences(uids, (uid, status) => {
      setPresenceMap((prev) => {
        if (!status) {
          if (!(uid in prev)) return prev;
          const copy = { ...prev };
          delete copy[uid];
          return copy;
        }
        return { ...prev, [uid]: status };
      });
    });
  }, [user, partnerUidKey]);

  // Keep optimisticMatch cleared once real snapshot arrives in matches
  useEffect(() => {
    if (
      optimisticMatch &&
      visibleMatches.some((m) => m.id === optimisticMatch.id)
    ) {
      setOptimisticMatch(null);
    }
  }, [visibleMatches, optimisticMatch]);

  const activeMatch: MatchRecord | null = useMemo(() => {
    if (!selectedMatchId) return null;
    const fromStream = visibleMatches.find((m) => m.id === selectedMatchId);
    if (fromStream) return fromStream;
    if (optimisticMatch && optimisticMatch.id === selectedMatchId) {
      return optimisticMatch;
    }
    return null;
  }, [visibleMatches, selectedMatchId, optimisticMatch]);

  const activeOtherUid =
    activeMatch && user
      ? activeMatch.uidA === user.uid
        ? activeMatch.uidB
        : activeMatch.uidA
      : null;

  // Hydrate any conversation partner profiles that might have matches_only visibility
  useEffect(() => {
    if (!user || visibleMatches.length === 0) return;
    let cancelled = false;
    const knownUids = new Set(allMembers.map((m) => m.uid));
    const missingUids = visibleMatches
      .map((m) => (m.uidA === user.uid ? m.uidB : m.uidA))
      .filter((uid) => !knownUids.has(uid) && !partnerProfiles[uid])
      .slice(0, 25);

    if (missingUids.length === 0) return;

    Promise.all(
      missingUids.map(async (uid) => {
        const p = await fetchSingleProfile(uid).catch(() => null);
        return p ? ([uid, p] as const) : null;
      })
    ).then((entries) => {
      if (cancelled) return;
      const map: Record<string, PublicProfile> = {};
      entries.forEach((e) => {
        if (e) map[e[0]] = e[1];
      });
      if (Object.keys(map).length > 0) {
        setPartnerProfiles((prev) => ({ ...prev, ...map }));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [user, visibleMatches, allMembers, partnerProfiles]);

  const activeMatchId = activeMatch?.id ?? null;
  const activeMatchRef = useRef<MatchRecord | null>(activeMatch);
  activeMatchRef.current = activeMatch;
  const [isPageVisible, setIsPageVisible] = useState<boolean>(() =>
    typeof document === 'undefined' ? true : document.visibilityState === 'visible'
  );
  const readReceiptInFlightRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const syncVisibility = () => {
      setIsPageVisible(document.visibilityState === 'visible');
    };
    document.addEventListener('visibilitychange', syncVisibility);
    window.addEventListener('focus', syncVisibility);
    return () => {
      document.removeEventListener('visibilitychange', syncVisibility);
      window.removeEventListener('focus', syncVisibility);
    };
  }, []);

  // Subscribe live to active partner profile, presence, and typing indicator
  useEffect(() => {
    if (!activeOtherUid || !activeMatchId) {
      setActivePartnerLive(null);
      setPartnerPresence(null);
      setPartnerTyping(null);
      return;
    }

    const unsubProfile = subscribeMyProfile(
      activeOtherUid,
      (p) => {
        setActivePartnerLive(p);
        if (p) {
          setPartnerProfiles((prev) => ({ ...prev, [activeOtherUid]: p }));
        }
      },
      () => {}
    );

    const unsubPresence = subscribeUserPresence(
      activeOtherUid,
      setPartnerPresence
    );

    const unsubTyping = subscribePartnerTyping(
      activeMatchId,
      activeOtherUid,
      setPartnerTyping
    );

    return () => {
      unsubProfile();
      unsubPresence();
      unsubTyping();
    };
  }, [activeOtherUid, activeMatchId]);

  // Subscribe messages for open individual conversation
  useEffect(() => {
    if (!activeMatchId || !user || !user.emailVerified) {
      setMessages([]);
      return;
    }
    setMessagesLoading(true);
    setMessagesError(null);
    const unsub = subscribeMatchMessages(
      activeMatchId,
      (msgs, maybeMore) => {
        setMessages(msgs);
        setHasMoreMessages(maybeMore);
        setMessagesLoading(false);
      },
      (err) => {
        setMessagesError(err.message || 'Could not load conversation.');
        setMessagesLoading(false);
      },
      messageLimit
    );
    return unsub;
  }, [activeMatchId, user, messageLimit, messageRetryNonce]);

  // Mark messages as readByRecipient: true when recipient opens and sees the conversation
  useEffect(() => {
    const currentMatch = activeMatchRef.current;
    if (!currentMatch || !user || !user.emailVerified || !isPageVisible) return;

    const myUnread =
      currentMatch.uidA === user.uid
        ? currentMatch.unreadByUidA
        : currentMatch.unreadByUidB;
    const unreadIncomingIds = messages
      .filter((m) => m.senderUid !== user.uid && m.readByRecipient !== true && !m.pending)
      .map((m) => m.id);

    if (unreadIncomingIds.length === 0 && !(myUnread > 0 && currentMatch.status === 'active')) {
      return;
    }

    const signature = `${currentMatch.id}:${myUnread}:${unreadIncomingIds.join(',')}`;
    if (readReceiptInFlightRef.current === signature) return;
    readReceiptInFlightRef.current = signature;

    markMatchConversationRead(currentMatch, user.uid, messages)
      .catch(() => {})
      .finally(() => {
        if (readReceiptInFlightRef.current === signature) {
          readReceiptInFlightRef.current = null;
        }
      });
  }, [activeMatch, messages, user, isPageVisible]);

  // Subscribe WebRTC call signaling docs for active chat
  useEffect(() => {
    if (!activeMatch || !user || !user.emailVerified) {
      setMatchCalls([]);
      return;
    }
    const unsub = subscribeMatchCalls(
      activeMatch.id,
      (calls) => setMatchCalls(calls),
      () => {}
    );
    return unsub;
  }, [activeMatch, user]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: dataSaver ? 'auto' : 'smooth',
    });
  }, [messages.length, dataSaver]);

  // Cleanup recording stream, preview objectURL, video recorder, and typing status on chat switch/unmount
  useEffect(() => {
    const currentMatchId = selectedMatchId;
    const currentUserUid = user?.uid;
    const currentOtherUid = activeOtherUid;
    setVideoRecorderOpen(false);
    setEmojiOpen(false);
    setConfirmDeleteId(null);
    return () => {
      if (voiceTimerRef.current) window.clearInterval(voiceTimerRef.current);
      if (typingClearTimerRef.current) {
        window.clearTimeout(typingClearTimerRef.current);
        typingClearTimerRef.current = undefined;
      }
      if (
        isCurrentlyTypingRef.current &&
        currentMatchId &&
        currentUserUid &&
        currentOtherUid
      ) {
        isCurrentlyTypingRef.current = false;
        lastTypingEmitRef.current = 0;
        void setTypingStatus(currentMatchId, currentUserUid, currentOtherUid, false);
      }
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== 'inactive'
      ) {
        voiceCancelledRef.current = true;
        mediaRecorderRef.current.stop();
      }
      voiceStreamRef.current?.getTracks().forEach((t) => t.stop());
      voiceStreamRef.current = null;
      setVoicePreview((prev) => {
        if (prev?.url) URL.revokeObjectURL(prev.url);
        return null;
      });
    };
  }, [selectedMatchId, user?.uid, activeOtherUid]);

  // Combined directory list: ALL registered public members + any match-only partners
  const directoryMembers = useMemo(() => {
    if (!user) return [];
    const byUid = new Map<string, PublicProfile>();
    allMembers.forEach((m) => {
      if (m.uid !== user.uid && !blockedIds.has(m.uid)) {
        byUid.set(m.uid, m);
      }
    });
    Object.values(partnerProfiles).forEach((m) => {
      if (
        m.uid !== user.uid &&
        m.accountStatus === 'active' &&
        !blockedIds.has(m.uid) &&
        !byUid.has(m.uid)
      ) {
        byUid.set(m.uid, m);
      }
    });

    const list = Array.from(byUid.values());

    // Sort: unread messages first -> recent conversations -> online members -> alphabetical
    list.sort((a, b) => {
      const ma = matchByOtherUid[a.uid];
      const mb = matchByOtherUid[b.uid];
      const unreadA = ma
        ? ma.uidA === user.uid
          ? ma.unreadByUidA
          : ma.unreadByUidB
        : 0;
      const unreadB = mb
        ? mb.uidA === user.uid
          ? mb.unreadByUidA
          : mb.unreadByUidB
        : 0;
      if (unreadA !== unreadB) return unreadB - unreadA;

      const lastA = ma?.lastMessageText ? getDateMillis(ma.lastMessageAt) || 0 : 0;
      const lastB = mb?.lastMessageText ? getDateMillis(mb.lastMessageAt) || 0 : 0;
      if (lastA !== lastB) return lastB - lastA;

      const onlineA = formatPresenceLabel(presenceMap[a.uid], nowMs).online ? 1 : 0;
      const onlineB = formatPresenceLabel(presenceMap[b.uid], nowMs).online ? 1 : 0;
      if (onlineA !== onlineB) return onlineB - onlineA;

      return a.firstName.localeCompare(b.firstName);
    });

    return list;
  }, [user, allMembers, partnerProfiles, blockedIds, matchByOtherUid, presenceMap, nowMs]);

  const filteredDirectory = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return directoryMembers.filter((member) => {
      const match = matchByOtherUid[member.uid];
      const presence = formatPresenceLabel(presenceMap[member.uid], nowMs);

      if (homeFilter === 'chats' && !match) return false;
      if (homeFilter === 'online' && !presence.online) return false;

      if (!q) return true;
      const hay = `${member.firstName} ${member.city} ${member.country} ${member.bio}`.toLowerCase();
      return hay.includes(q);
    });
  }, [directoryMembers, matchByOtherUid, presenceMap, nowMs, homeFilter, searchQuery]);

  const onlineCount = useMemo(
    () =>
      directoryMembers.filter(
        (m) => formatPresenceLabel(presenceMap[m.uid], nowMs).online
      ).length,
    [directoryMembers, presenceMap, nowMs]
  );

  const chatsCount = useMemo(
    () => directoryMembers.filter((m) => Boolean(matchByOtherUid[m.uid])).length,
    [directoryMembers, matchByOtherUid]
  );

  if (!user) {
    return (
      <div className={darkMode ? 'dark' : ''}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 pb-24">
          <div className="bg-white dark:bg-[#190F29] rounded-2xl border border-purple-950/10 dark:border-white/10 p-8 text-center">
            <MessageCircleHeart className="w-10 h-10 text-pink-600 mx-auto mb-3" />
            <h1 className="text-2xl font-bold text-[#2E1065] dark:text-white mb-2">
              Sign In to Open Chat
            </h1>
            <p className="text-sm text-purple-950/75 dark:text-purple-200/80 mb-6">
              Sign in to view all registered members, see who is online, and exchange real-time text, voice, and video messages.
            </p>
            <button
              type="button"
              onClick={() => onNavigate('auth')}
              className="min-h-[46px] px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#6B21A8] to-[#DB2777] text-white font-semibold text-sm"
            >
              Login or Create Account
            </button>
          </div>
        </div>
      </div>
    );
  }

  const getOtherParticipant = (m: MatchRecord) => {
    const isMyA = m.uidA === user.uid;
    const uid = isMyA ? m.uidB : m.uidA;
    const fromDirectory = directoryMembers.find((d) => d.uid === uid) || null;
    const live =
      (uid === activeOtherUid ? activePartnerLive : null) ||
      partnerProfiles[uid] ||
      fromDirectory;
    return {
      uid,
      name: live?.firstName || (isMyA ? m.userBName : m.userAName),
      photo: live?.photoUrl ?? (isMyA ? m.userBPhoto : m.userAPhoto),
      unread: isMyA ? m.unreadByUidA : m.unreadByUidB,
      blueVerified: Boolean(live?.blueVerified),
      membershipTier: live?.membershipTier || 'free',
      privateAlbumCount: live?.privateAlbumCount || 0,
    };
  };

  const handleOpenConversationWithMember = async (target: PublicProfile) => {
    if (startingChatUid) return;
    setFeedback(null);

    if (!user.emailVerified) {
      setFeedback(
        'Please verify your email using the banner above (click Refresh after verifying) before opening a private conversation.'
      );
      return;
    }

    if (profile?.accountStatus === 'suspended') {
      setFeedback('Your account is suspended and cannot start conversations.');
      return;
    }

    const existing = matchByOtherUid[target.uid];
    if (existing) {
      setPartnerProfiles((prev) => ({ ...prev, [target.uid]: target }));
      setMessageLimit(30);
      setSelectedMatchId(existing.id);
      return;
    }

    const effectiveMyProfile: PublicProfile = profile || {
      uid: user.uid,
      firstName: user.displayName?.split(' ')[0] || 'Member',
      age: 18,
      gender: 'prefer-not-to-say',
      country: 'Uganda',
      city: 'Kampala',
      photoUrl: '',
      intention: 'both',
      interests: [],
      bio: '',
      emailVerified: user.emailVerified,
      visibility: 'public',
      membershipTier: 'free',
      accountStatus: 'active',
      dailyLikesCount: 0,
      dailyLikesDate: getTodayUtcDateString(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    setStartingChatUid(target.uid);
    try {
      const conv = await getOrCreateDirectConversation(
        effectiveMyProfile,
        target
      );
      setPartnerProfiles((prev) => ({ ...prev, [target.uid]: target }));
      setOptimisticMatch(conv);
      setMessageLimit(30);
      setSelectedMatchId(conv.id);
    } catch (err) {
      setFeedback(
        err instanceof Error
          ? err.message
          : 'Could not open conversation right now. Please try again.'
      );
    } finally {
      setStartingChatUid(null);
    }
  };

  const handleBackToChatHome = () => {
    emitTypingChange(false);
    stopVoiceRecording(true);
    discardVoicePreview();
    setVideoRecorderOpen(false);
    setEmojiOpen(false);
    setConfirmDeleteId(null);
    setSelectedMatchId(null);
    setOptimisticMatch(null);
    setFeedback(null);
  };

  const today = getTodayUtcDateString();
  const usedMessagesToday =
    profile && profile.dailyMessagesDate === today
      ? profile.dailyMessagesCount || 0
      : 0;

  const incomingRingingCall = matchCalls.find(
    (c) =>
      c.status === 'ringing' &&
      c.calleeUid === user.uid &&
      (() => {
        const ms = getDateMillis(c.createdAt);
        return !ms || nowMs - ms < 120_000;
      })()
  );
  const currentModalCallSession = activeCallModal
    ? matchCalls.find((c) => c.id === activeCallModal.callId) || null
    : null;

  const partnerIsTyping =
    Boolean(partnerTyping?.isTyping) &&
    (() => {
      const updatedMs = getDateMillis(partnerTyping?.updatedAt);
      return updatedMs !== null && nowMs - updatedMs < 6000;
    })();

  const activePresenceSource =
    partnerPresence ||
    (activeOtherUid ? presenceMap[activeOtherUid] : null) ||
    null;
  const presenceInfo = formatPresenceLabel(activePresenceSource, nowMs);

  const emitTypingChange = (typing: boolean) => {
    if (!activeMatch || !user || !activeOtherUid) return;
    if (typingClearTimerRef.current) {
      window.clearTimeout(typingClearTimerRef.current);
      typingClearTimerRef.current = undefined;
    }

    if (!typing) {
      lastTypingEmitRef.current = 0;
      if (isCurrentlyTypingRef.current) {
        isCurrentlyTypingRef.current = false;
        void setTypingStatus(activeMatch.id, user.uid, activeOtherUid, false);
      }
      return;
    }

    const now = Date.now();
    if (!isCurrentlyTypingRef.current || now - lastTypingEmitRef.current > 2400) {
      isCurrentlyTypingRef.current = true;
      lastTypingEmitRef.current = now;
      void setTypingStatus(activeMatch.id, user.uid, activeOtherUid, true);
    }
    typingClearTimerRef.current = window.setTimeout(() => {
      lastTypingEmitRef.current = 0;
      if (isCurrentlyTypingRef.current) {
        isCurrentlyTypingRef.current = false;
        void setTypingStatus(activeMatch.id, user.uid, activeOtherUid, false);
      }
    }, 3000);
  };

  const handleDraftChange = (nextValue: string) => {
    setDraft(nextValue);
    emitTypingChange(nextValue.trim().length > 0);
  };

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeMatch || !draft.trim() || sending) return;
    if (!user.emailVerified) {
      setFeedback('Verify your email first to send messages.');
      return;
    }
    if (profile?.accountStatus === 'suspended') {
      setFeedback('Your account is suspended and cannot send messages.');
      return;
    }
    const text = draft.trim();
    setSending(true);
    setFeedback(null);
    setEmojiOpen(false);
    emitTypingChange(false);
    try {
      await sendChatMessage(activeMatch, user.uid, text, profile);
      setDraft('');
    } catch (err) {
      setFeedback(
        err instanceof Error
          ? err.message
          : 'Message failed to send. Please check your connection and retry.'
      );
    } finally {
      setSending(false);
    }
  };

  const handleDeleteOwnMessage = async (msg: ChatMessage, idx: number) => {
    if (!activeMatch || msg.senderUid !== user.uid || deletingMsgId) return;
    setDeletingMsgId(msg.id);
    setFeedback(null);
    const isLatest = idx === messages.length - 1;
    const prevMsg = isLatest ? messages[idx - 1] || null : undefined;
    try {
      await deleteChatMessage(activeMatch, msg, user.uid, prevMsg);
      setConfirmDeleteId(null);
    } catch (err) {
      setFeedback(
        err instanceof Error ? err.message : 'Could not delete message.'
      );
    } finally {
      setDeletingMsgId(null);
    }
  };

  const stopVoiceRecording = (cancel: boolean) => {
    voiceCancelledRef.current = cancel;
    if (voiceTimerRef.current) {
      window.clearInterval(voiceTimerRef.current);
      voiceTimerRef.current = undefined;
    }
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== 'inactive'
    ) {
      mediaRecorderRef.current.stop();
    }
    setRecordingVoice(false);
  };

  const discardVoicePreview = () => {
    if (voicePreview?.url) {
      URL.revokeObjectURL(voicePreview.url);
    }
    setVoicePreview(null);
  };

  const handleStartVoiceRecord = async () => {
    if (!activeMatch || recordingVoice || uploadingVoice) return;
    if (!user.emailVerified) {
      setFeedback('Verify your email first to send voice messages.');
      return;
    }
    if (profile?.accountStatus === 'suspended') {
      setFeedback('Your account is suspended and cannot send voice messages.');
      return;
    }
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      setFeedback('Voice recording is not supported in this browser.');
      return;
    }

    discardVoicePreview();
    setVideoRecorderOpen(false);
    setFeedback(null);
    setEmojiOpen(false);

    try {
      const mediaResult = await requestCallMediaStream('audio');
      if (!mediaResult.ok) {
        setFeedback(mediaResult.message);
        return;
      }
      const stream = mediaResult.stream;
      voiceStreamRef.current = stream;

      const mimeType = pickSupportedAudioMime();
      const recorderOptions: MediaRecorderOptions = {
        audioBitsPerSecond: 16000,
        ...(mimeType ? { mimeType } : {}),
      };
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, recorderOptions);
      } catch {
        recorder = new MediaRecorder(stream);
      }

      mediaRecorderRef.current = recorder;
      voiceChunksRef.current = [];
      voiceBytesRef.current = 0;
      voiceSecondsRef.current = 0;
      voiceCancelledRef.current = false;
      setVoiceSeconds(0);
      setRecordingVoice(true);

      recorder.ondataavailable = (evt) => {
        if (evt.data.size > 0) {
          voiceChunksRef.current.push(evt.data);
          voiceBytesRef.current += evt.data.size;
          if (voiceBytesRef.current >= MAX_VOICE_DIRECT_BYTES) {
            stopVoiceRecording(false);
          }
        }
      };

      recorder.onerror = () => {
        stream.getTracks().forEach((t) => t.stop());
        voiceStreamRef.current = null;
        setRecordingVoice(false);
        setFeedback('Voice recording interrupted. Please try again.');
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        voiceStreamRef.current = null;
        const durationSec = Math.max(1, voiceSecondsRef.current);
        const chunks = [...voiceChunksRef.current];
        voiceChunksRef.current = [];

        if (voiceCancelledRef.current) {
          return;
        }

        const blob = new Blob(chunks, {
          type: recorder.mimeType || mimeType || 'audio/webm',
        });
        if (blob.size < 400) {
          setFeedback('Recording was too short. Hold or speak a little longer.');
          return;
        }

        const previewUrl = URL.createObjectURL(blob);
        setVoicePreview({
          blob,
          url: previewUrl,
          durationSec,
        });
      };

      recorder.start(300);
      voiceTimerRef.current = window.setInterval(() => {
        setVoiceSeconds((s) => {
          const next = s + 1;
          voiceSecondsRef.current = next;
          if (next >= MAX_VOICE_SECONDS) {
            stopVoiceRecording(false);
            return MAX_VOICE_SECONDS;
          }
          return next;
        });
      }, 1000);
    } catch (err) {
      setFeedback(mapMicError(err));
      setRecordingVoice(false);
    }
  };

  const handleSendVoicePreview = async () => {
    if (!activeMatch || !voicePreview || uploadingVoice) return;
    setUploadingVoice(true);
    setUploadProgress(0);
    setFeedback(null);
    try {
      const { url, storagePath } = await uploadVoiceMessage(
        activeMatch.id,
        user.uid,
        voicePreview.blob,
        setUploadProgress
      );
      await sendChatMessage(activeMatch, user.uid, 'Voice message', profile, {
        messageType: 'audio',
        audioUrl: url,
        audioDurationSec: voicePreview.durationSec,
        storagePath,
      });
      discardVoicePreview();
    } catch (err) {
      setFeedback(
        err instanceof Error
          ? err.message
          : 'Voice message failed to send. You can retry or discard it.'
      );
    } finally {
      setUploadingVoice(false);
      setUploadProgress(null);
    }
  };

  const handleOpenVideoRecorder = () => {
    if (!activeMatch || uploadingVideo || uploadingVoice) return;
    if (!user.emailVerified) {
      setFeedback('Verify your email first to send video messages.');
      return;
    }
    if (profile?.accountStatus === 'suspended') {
      setFeedback('Your account is suspended and cannot send video messages.');
      return;
    }
    stopVoiceRecording(true);
    discardVoicePreview();
    setEmojiOpen(false);
    setFeedback(null);
    setVideoRecorderOpen(true);
  };

  const handleSendRecordedVideo = async (blob: Blob, durationSec: number) => {
    if (!activeMatch || uploadingVideo) return;
    setUploadingVideo(true);
    setUploadProgress(0);
    setFeedback(null);
    try {
      const { url, storagePath } = await uploadVideoMessage(
        activeMatch.id,
        user.uid,
        blob,
        setUploadProgress
      );
      await sendChatMessage(activeMatch, user.uid, 'Video message', profile, {
        messageType: 'video',
        videoUrl: url,
        videoDurationSec: durationSec,
        storagePath,
      });
      setVideoRecorderOpen(false);
    } finally {
      setUploadingVideo(false);
      setUploadProgress(null);
    }
  };

  const handleAttachmentSelected = async (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !activeMatch || uploadingAttachment) return;
    if (!user.emailVerified) {
      setFeedback('Verify your email first to send attachments.');
      return;
    }
    if (profile?.accountStatus === 'suspended') {
      setFeedback('Your account is suspended and cannot send attachments.');
      return;
    }

    setUploadingAttachment(true);
    setUploadProgress(0);
    setFeedback(null);
    setEmojiOpen(false);

    try {
      const uploaded = await uploadChatAttachment(
        activeMatch.id,
        user.uid,
        file,
        dataSaver,
        setUploadProgress
      );
      await sendChatMessage(
        activeMatch,
        user.uid,
        uploaded.messageType === 'image' ? 'Photo' : uploaded.attachmentName,
        profile,
        {
          messageType: uploaded.messageType,
          attachmentUrl: uploaded.url,
          attachmentName: uploaded.attachmentName,
          attachmentMime: uploaded.attachmentMime,
          storagePath: uploaded.storagePath,
        }
      );
    } catch (err) {
      setFeedback(
        err instanceof Error
          ? err.message
          : 'Failed to send attachment. Please try again.'
      );
    } finally {
      setUploadingAttachment(false);
      setUploadProgress(null);
    }
  };

  const handleStartCall = async (requestedType: CallMediaType) => {
    if (!activeMatch || requestingCallMedia) return;
    if (!user.emailVerified) {
      setFeedback(
        `Verify your email first to place live ${requestedType === 'audio' ? 'voice' : 'video'} calls.`
      );
      return;
    }
    if (profile?.accountStatus === 'suspended') {
      setFeedback(
        `Your account is suspended and cannot place ${requestedType === 'audio' ? 'voice' : 'video'} calls.`
      );
      return;
    }
    const partner = getOtherParticipant(activeMatch);
    setFeedback(null);
    setRequestingCallMedia(true);
    const result = await requestCallMediaStream(requestedType);
    setRequestingCallMedia(false);

    if (!result.ok) {
      setPendingCallPermission({
        mode: 'outgoing',
        callType: requestedType,
        callId: '',
        partnerName: partner.name,
        failure: result,
      });
      return;
    }

    setPendingCallPermission(null);
    setActiveCallModal({
      mode: 'outgoing',
      callType: requestedType,
      callId: '',
      stream: result.stream,
    });
  };

  const handleAcceptIncomingCall = async (incomingCall: CallSession) => {
    if (!activeMatch || requestingCallMedia) return;
    const requestedType: CallMediaType =
      incomingCall.callType === 'audio' ? 'audio' : 'video';
    const partner = getOtherParticipant(activeMatch);
    setFeedback(null);
    setRequestingCallMedia(true);
    const result = await requestCallMediaStream(requestedType);
    setRequestingCallMedia(false);

    if (!result.ok) {
      setPendingCallPermission({
        mode: 'incoming',
        callType: requestedType,
        callId: incomingCall.id,
        partnerName: partner.name,
        failure: result,
      });
      return;
    }

    setPendingCallPermission(null);
    setActiveCallModal({
      mode: 'incoming',
      callType: requestedType,
      callId: incomingCall.id,
      stream: result.stream,
    });
  };

  const handleEnablePendingCallPermissions = async () => {
    if (!pendingCallPermission || requestingCallMedia) return;
    setRequestingCallMedia(true);
    const result = await requestCallMediaStream(pendingCallPermission.callType);
    setRequestingCallMedia(false);

    if (!result.ok) {
      setPendingCallPermission((prev) =>
        prev ? { ...prev, failure: result } : null
      );
      return;
    }

    const { mode, callType, callId } = pendingCallPermission;
    setPendingCallPermission(null);
    setActiveCallModal({
      mode,
      callType,
      callId,
      stream: result.stream,
    });
  };

  const closeActiveCallModal = () => {
    stopMediaStream(activeCallModal?.stream);
    setActiveCallModal(null);
  };

  const handleOpenPrivateAlbum = async (otherUid: string) => {
    if (!isPremium) {
      setFeedback(
        'Viewing Private Photo Albums is a Premium Membership feature.'
      );
      return;
    }
    setAlbumViewerOpen(true);
    setAlbumLoading(true);
    try {
      const album = await fetchPrivateAlbum(otherUid);
      setPartnerAlbumPhotos(album?.photos || []);
    } catch (err) {
      setFeedback(
        err instanceof Error ? err.message : 'Could not load private album.'
      );
      setAlbumViewerOpen(false);
    } finally {
      setAlbumLoading(false);
    }
  };

  const handleBlockActive = async () => {
    if (!activeMatch) return;
    const other = getOtherParticipant(activeMatch);
    try {
      await blockMember(user.uid, other.uid, activeMatch.id);
      handleBackToChatHome();
      setFeedback(`${other.name} has been blocked.`);
    } catch (err) {
      setFeedback(
        err instanceof Error ? err.message : 'Could not block user.'
      );
    }
  };

  const handleUnmatchActive = async () => {
    if (!activeMatch) return;
    try {
      await unmatchMember(activeMatch.id);
      handleBackToChatHome();
      setFeedback('Conversation archived.');
    } catch (err) {
      setFeedback(
        err instanceof Error ? err.message : 'Could not close conversation.'
      );
    }
  };

  return (
    <div className={darkMode ? 'dark' : ''}>
      <div className="max-w-5xl mx-auto px-2 sm:px-6 py-2 sm:py-6 pb-20 md:pb-8">
        {!activeMatch ? (
          /* ================= SCREEN 1: CHAT HOME (ALL REGISTERED MEMBERS) ================= */
          <div className="bg-white dark:bg-[#140B24] rounded-2xl border border-purple-950/10 dark:border-white/10 overflow-hidden shadow-sm">
            {/* Chat Home Header */}
            <div className="p-4 sm:p-5 border-b border-purple-950/10 dark:border-white/10 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold text-[#2E1065] dark:text-white flex items-center gap-2">
                    <Users className="w-5 h-5 text-pink-600 dark:text-pink-400" />
                    <span>Chat · All Members ({directoryMembers.length})</span>
                  </h1>
                  <p className="text-xs sm:text-sm text-purple-950/65 dark:text-purple-200/70 mt-0.5">
                    Tap any registered member or press Message to open a private conversation.
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={toggleDarkMode}
                    aria-label={
                      darkMode ? 'Switch chat to light mode' : 'Switch chat to dark mode'
                    }
                    title={darkMode ? 'Light mode' : 'Dark mode'}
                    className="min-h-[40px] min-w-[40px] rounded-xl border border-purple-950/15 dark:border-white/15 flex items-center justify-center text-[#2E1065] dark:text-amber-300 hover:bg-purple-50 dark:hover:bg-white/10"
                  >
                    {darkMode ? (
                      <Sun className="w-4 h-4" />
                    ) : (
                      <Moon className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('discover')}
                    className="min-h-[40px] px-3 rounded-xl border border-purple-950/15 dark:border-white/15 text-xs font-semibold text-pink-600 dark:text-pink-400 hover:bg-purple-50 dark:hover:bg-white/10"
                  >
                    Discover
                  </button>
                </div>
              </div>

              {/* Search Bar */}
              <div className="relative">
                <Search className="w-4 h-4 text-purple-950/45 dark:text-purple-200/50 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search all registered members by name, city, or country..."
                  aria-label="Search registered members"
                  className="w-full min-h-[44px] pl-10 pr-10 rounded-xl border border-purple-950/15 dark:border-white/15 bg-[#FAF7FC] dark:bg-[#1E1333] text-sm text-[#1E102E] dark:text-white placeholder:text-purple-950/45 dark:placeholder:text-purple-200/45 focus:outline-none focus:ring-2 focus:ring-purple-700"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="Clear search"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-purple-950/50 dark:text-purple-200/60 hover:text-[#2E1065] dark:hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Filter Tabs */}
              <div className="flex flex-wrap items-center gap-2">
                {(
                  [
                    {
                      id: 'all',
                      label: `All Members (${directoryMembers.length})`,
                    },
                    { id: 'chats', label: `Recent Chats (${chatsCount})` },
                    { id: 'online', label: `Online Now (${onlineCount})` },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setHomeFilter(tab.id)}
                    className={`min-h-[36px] px-3.5 py-1 rounded-xl text-xs font-semibold transition-colors ${
                      homeFilter === tab.id
                        ? 'bg-[#2E1065] dark:bg-pink-600 text-white'
                        : 'bg-purple-50 dark:bg-white/10 text-[#2E1065] dark:text-purple-100 hover:bg-purple-100 dark:hover:bg-white/15'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Verification / Action Feedback Banners */}
            {!user.emailVerified && (
              <div className="mx-4 mt-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-950 dark:text-amber-100 flex items-center gap-2.5">
                <Lock className="w-4 h-4 text-amber-700 dark:text-amber-300 shrink-0" />
                <span>
                  Verify your email using the banner at the top (then tap Refresh) to send messages to members.
                </span>
              </div>
            )}

            {feedback && (
              <div className="mx-4 mt-4 p-3 rounded-xl bg-purple-50 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-800 text-xs text-[#2E1065] dark:text-purple-100 flex items-center justify-between gap-2">
                <span>{feedback}</span>
                <button
                  type="button"
                  onClick={() => setFeedback(null)}
                  aria-label="Dismiss"
                  className="shrink-0 p-1"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Members Directory List */}
            {membersLoading ? (
              <div className="p-10 text-center space-y-2.5">
                <div className="w-7 h-7 rounded-full border-2 border-purple-700 dark:border-purple-400 border-t-transparent animate-spin mx-auto" />
                <p className="text-sm text-purple-950/65 dark:text-purple-200/70">
                  Loading registered members...
                </p>
              </div>
            ) : membersError ? (
              <div className="p-10 text-center space-y-2">
                <p className="text-sm text-red-700 dark:text-red-300">
                  {membersError}
                </p>
              </div>
            ) : filteredDirectory.length === 0 ? (
              <div className="p-10 text-center space-y-3">
                <Users className="w-10 h-10 text-purple-300 dark:text-purple-500 mx-auto" />
                <h2 className="text-base font-bold text-[#2E1065] dark:text-white">
                  {searchQuery
                    ? 'No members match your search'
                    : homeFilter === 'online'
                      ? 'No members are online right now'
                      : homeFilter === 'chats'
                        ? 'No conversations started yet'
                        : 'No other registered members found yet'}
                </h2>
                <p className="text-xs text-purple-950/65 dark:text-purple-200/70 max-w-sm mx-auto">
                  {searchQuery
                    ? 'Try searching another name, city, or country.'
                    : 'Every registered member on FIND YOUR LOVE appears here automatically.'}
                </p>
                {(searchQuery || homeFilter !== 'all') && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setHomeFilter('all');
                    }}
                    className="min-h-[40px] px-4 py-1.5 rounded-xl bg-[#2E1065] dark:bg-pink-600 text-white text-xs font-semibold"
                  >
                    Show All Members
                  </button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-purple-950/10 dark:divide-white/10">
                {filteredDirectory.map((member) => {
                  const existingMatch = matchByOtherUid[member.uid];
                  const unread = existingMatch
                    ? existingMatch.uidA === user.uid
                      ? existingMatch.unreadByUidA
                      : existingMatch.unreadByUidB
                    : 0;
                  const pStatus = formatPresenceLabel(
                    presenceMap[member.uid],
                    nowMs
                  );
                  const opening = startingChatUid === member.uid;

                  return (
                    <div
                      key={member.uid}
                      onClick={() => void handleOpenConversationWithMember(member)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          void handleOpenConversationWithMember(member);
                        }
                      }}
                      className="w-full p-3.5 sm:p-4 flex items-center gap-3 sm:gap-4 hover:bg-purple-50/70 dark:hover:bg-white/5 transition-colors cursor-pointer"
                    >
                      <div className="relative shrink-0">
                        <Avatar
                          src={member.photoUrl}
                          name={member.firstName}
                          size="md"
                          blueVerified={Boolean(member.blueVerified)}
                        />
                        {pStatus.online && (
                          <span
                            title="Online"
                            aria-label="Online"
                            className="absolute bottom-0 right-0 w-3 h-3 rounded-full ring-2 ring-white dark:ring-[#140B24] bg-emerald-500"
                          />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-sm sm:text-base text-[#2E1065] dark:text-white truncate">
                            {member.firstName}
                          </span>
                          <MemberBadges
                            blueVerified={member.blueVerified}
                            membershipTier={member.membershipTier}
                            size="xs"
                          />
                          {unread > 0 && (
                            <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-pink-600 text-white text-[11px] font-bold inline-flex items-center justify-center tabular-nums">
                              {unread}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 mt-0.5 text-xs flex-wrap">
                          <span
                            className={`inline-flex items-center gap-1.5 font-medium ${
                              pStatus.online
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : 'text-purple-950/60 dark:text-purple-200/65'
                            }`}
                          >
                            {pStatus.online && (
                              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                            )}
                            <span>{pStatus.label}</span>
                          </span>
                          <span className="text-purple-950/35 dark:text-purple-200/35">
                            ·
                          </span>
                          <span className="text-purple-950/65 dark:text-purple-200/70 inline-flex items-center gap-1 truncate">
                            <MapPin className="w-3 h-3 text-pink-500 shrink-0" />
                            <span>
                              {member.city}, {member.country}
                            </span>
                          </span>
                        </div>

                        <p className="text-xs text-purple-950/65 dark:text-purple-200/70 truncate mt-1">
                          {existingMatch?.lastMessageText
                            ? existingMatch.lastMessageText
                            : member.bio || 'Tap Message to start a conversation'}
                        </p>
                      </div>

                      <button
                        type="button"
                        disabled={opening}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleOpenConversationWithMember(member);
                        }}
                        className="min-h-[42px] px-3.5 sm:px-4 rounded-xl bg-gradient-to-r from-[#6B21A8] to-[#DB2777] hover:from-[#581C87] hover:to-[#BE185D] disabled:opacity-60 text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 shrink-0 transition-colors"
                      >
                        <MessageCircle className="w-4 h-4 shrink-0" />
                        <span>{opening ? 'Opening...' : 'Message'}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* ================= SCREEN 2: INDIVIDUAL CONVERSATION SCREEN ================= */
          <div className="bg-white dark:bg-[#140B24] rounded-2xl border border-purple-950/10 dark:border-white/10 overflow-hidden flex flex-col min-h-[74dvh] h-[calc(100dvh-124px)] md:h-[calc(100vh-140px)] shadow-sm">
            {(() => {
              const other = getOtherParticipant(activeMatch);
              const myName = profile?.firstName || 'You';
              const myPhoto = profile?.photoUrl || '';
              const composerBusy =
                uploadingVoice || uploadingVideo || uploadingAttachment;

              return (
                <>
                  {/* Individual Conversation Header */}
                  <div className="px-3 sm:px-4 py-3 border-b border-purple-950/10 dark:border-white/10 flex items-center justify-between gap-2 bg-white dark:bg-[#190F29]">
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                      <button
                        type="button"
                        onClick={handleBackToChatHome}
                        aria-label="Back to Chat Home"
                        className="min-h-[42px] px-2.5 sm:px-3 flex items-center justify-center gap-1 rounded-xl hover:bg-purple-50 dark:hover:bg-white/10 text-[#2E1065] dark:text-white text-xs sm:text-sm font-semibold shrink-0 border border-purple-950/10 dark:border-white/15"
                      >
                        <ArrowLeft className="w-4 h-4" />
                        <span>Back</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const partnerProfile =
                            (activeOtherUid === other.uid
                              ? activePartnerLive
                              : null) ||
                            partnerProfiles[other.uid] ||
                            directoryMembers.find((m) => m.uid === other.uid);
                          if (partnerProfile) {
                            setInspectPartner(partnerProfile);
                          }
                        }}
                        title="View recipient profile & cover"
                        className="flex items-center gap-2.5 min-w-0 text-left rounded-xl hover:bg-purple-50/70 dark:hover:bg-white/5 px-1.5 py-1 transition-colors"
                      >
                        <div className="relative shrink-0">
                          <Avatar
                            src={other.photo}
                            name={other.name}
                            size="sm"
                            blueVerified={other.blueVerified}
                          />
                          {presenceInfo.online && (
                            <span
                              title="Online"
                              aria-label="Online"
                              className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ring-2 ring-white dark:ring-[#190F29] bg-emerald-500"
                            />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h2 className="font-bold text-sm sm:text-base text-[#2E1065] dark:text-white truncate">
                              {other.name}
                            </h2>
                            <MemberBadges
                              blueVerified={other.blueVerified}
                              membershipTier={other.membershipTier}
                              size="xs"
                            />
                          </div>
                          <p
                            className={`text-[11px] truncate flex items-center gap-1.5 ${
                              partnerIsTyping
                                ? 'text-pink-600 dark:text-pink-400 font-semibold'
                                : presenceInfo.online
                                  ? 'text-emerald-700 dark:text-emerald-400 font-medium'
                                  : 'text-purple-950/60 dark:text-purple-200/65'
                            }`}
                          >
                            {!partnerIsTyping && presenceInfo.online && (
                              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                            )}
                            <span className="truncate">
                              {partnerIsTyping
                                ? `${other.name} is typing...`
                                : presenceInfo.label}
                            </span>
                          </p>
                        </div>
                      </button>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={toggleDarkMode}
                        aria-label={darkMode ? 'Light mode' : 'Dark mode'}
                        title={darkMode ? 'Light mode' : 'Dark mode'}
                        className="hidden sm:flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg text-purple-950/65 dark:text-amber-300 hover:bg-purple-50 dark:hover:bg-white/10"
                      >
                        {darkMode ? (
                          <Sun className="w-4 h-4" />
                        ) : (
                          <Moon className="w-4 h-4" />
                        )}
                      </button>
                      {other.privateAlbumCount > 0 && (
                        <button
                          type="button"
                          onClick={() => handleOpenPrivateAlbum(other.uid)}
                          title="Private Photo Album (Premium)"
                          aria-label="View private photo album"
                          className="min-h-[40px] px-2 flex items-center justify-center gap-1 rounded-lg text-xs font-semibold text-[#6B21A8] dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-white/10"
                        >
                          <Images className="w-4 h-4" />
                          <span className="hidden sm:inline">Album</span>
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={requestingCallMedia}
                        onClick={() => void handleStartCall('audio')}
                        title="Start 1-on-1 Live Voice Call"
                        aria-label="Start 1-on-1 live voice call"
                        className="min-h-[40px] min-w-[40px] px-2.5 flex items-center justify-center gap-1.5 rounded-lg bg-purple-100/80 dark:bg-purple-800/50 text-[#2E1065] dark:text-white hover:bg-purple-200 dark:hover:bg-purple-700/60 disabled:opacity-55 font-semibold text-xs"
                      >
                        <Phone className="w-4 h-4" />
                        <span className="hidden lg:inline">Voice</span>
                      </button>
                      <button
                        type="button"
                        disabled={requestingCallMedia}
                        onClick={() => void handleStartCall('video')}
                        title="Start 1-on-1 Live Video Call"
                        aria-label="Start 1-on-1 live video call"
                        className="min-h-[40px] min-w-[40px] px-2.5 flex items-center justify-center gap-1.5 rounded-lg bg-purple-100/80 dark:bg-purple-800/50 text-[#2E1065] dark:text-white hover:bg-purple-200 dark:hover:bg-purple-700/60 disabled:opacity-55 font-semibold text-xs"
                      >
                        <Video className="w-4 h-4" />
                        <span className="hidden lg:inline">Video</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setReportMatch({
                            uid: other.uid,
                            name: other.name,
                            contextId: activeMatch.id,
                          })
                        }
                        title="Report conversation"
                        aria-label="Report conversation"
                        className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-purple-950/55 dark:text-purple-200/70 hover:text-pink-700 hover:bg-pink-50 dark:hover:bg-white/10"
                      >
                        <Flag className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={handleUnmatchActive}
                        title="Close chat"
                        aria-label="Close chat"
                        className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-purple-950/55 dark:text-purple-200/70 hover:text-purple-900 hover:bg-purple-50 dark:hover:bg-white/10"
                      >
                        <UserX className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={handleBlockActive}
                        title="Block user"
                        aria-label="Block user"
                        className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-purple-950/55 dark:text-purple-200/70 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
                      >
                        <ShieldBan className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Incoming Voice / Video Call Banner */}
                  {incomingRingingCall && !activeCallModal && (
                    <div className="bg-emerald-950 text-white px-4 py-2.5 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold">
                        <PhoneIncoming className="w-4 h-4 text-emerald-300 shrink-0" />
                        <span>
                          Incoming{' '}
                          {incomingRingingCall.callType === 'audio'
                            ? 'Voice'
                            : 'Video'}{' '}
                          Call from {other.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          disabled={requestingCallMedia}
                          onClick={() =>
                            void handleAcceptIncomingCall(incomingRingingCall)
                          }
                          className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-[#25D366] text-[#052E16] text-xs font-bold disabled:opacity-60"
                        >
                          {requestingCallMedia ? 'Connecting...' : 'Accept'}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            updateCallSession(
                              activeMatch.id,
                              incomingRingingCall.id,
                              { status: 'declined' }
                            ).catch(() => {})
                          }
                          className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold"
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Error / Feedback Banner inside active conversation */}
                  {feedback && (
                    <div className="mx-3 mt-2 p-2.5 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800/60 text-xs text-red-900 dark:text-red-100 flex items-center justify-between gap-2">
                      <span>{feedback}</span>
                      <button
                        type="button"
                        onClick={() => setFeedback(null)}
                        aria-label="Dismiss alert"
                        className="shrink-0 p-1"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  {/* Messages History Feed */}
                  <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 bg-[#FAF7FC] dark:bg-[#0D0617]">
                    {hasMoreMessages && (
                      <div className="text-center pb-2">
                        <button
                          type="button"
                          onClick={() => setMessageLimit((l) => l + 30)}
                          className="text-xs font-semibold text-[#6B21A8] dark:text-purple-300 hover:underline py-1.5 px-3"
                        >
                          Load earlier messages
                        </button>
                      </div>
                    )}

                    {messagesLoading ? (
                      <div className="py-10 text-center space-y-2">
                        <div className="w-6 h-6 rounded-full border-2 border-purple-700 dark:border-purple-400 border-t-transparent animate-spin mx-auto" />
                        <p className="text-xs text-purple-950/60 dark:text-purple-200/60">
                          Loading conversation...
                        </p>
                      </div>
                    ) : messagesError ? (
                      <div className="text-center py-8 space-y-2">
                        <p className="text-xs text-red-700 dark:text-red-300">
                          {messagesError}
                        </p>
                        <button
                          type="button"
                          onClick={() => setMessageRetryNonce((n) => n + 1)}
                          className="text-xs font-semibold text-[#2E1065] dark:text-white underline"
                        >
                          Retry
                        </button>
                      </div>
                    ) : messages.length === 0 ? (
                      <div className="text-center py-12">
                        <p className="text-sm text-purple-950/65 dark:text-purple-200/70">
                          Say hello to {other.name}! Send a text, voice note, or video message below.
                        </p>
                      </div>
                    ) : (
                      messages.map((msg, idx) => {
                        const mine = msg.senderUid === user.uid;
                        const prevMsg = idx > 0 ? messages[idx - 1] : null;
                        const prevDateLabel = prevMsg
                          ? formatDateHeading(prevMsg.createdAt)
                          : null;
                        const currDateLabel = formatDateHeading(msg.createdAt);
                        const showDateDivider = currDateLabel !== prevDateLabel;

                        const senderDisplayName = mine
                          ? myName
                          : other.name || msg.senderName || 'Member';
                        const senderAvatarSrc = mine ? myPhoto : other.photo;

                        const isAudio =
                          msg.messageType === 'audio' && Boolean(msg.audioUrl);
                        const isVideo =
                          msg.messageType === 'video' && Boolean(msg.videoUrl);
                        const isImage =
                          msg.messageType === 'image' &&
                          Boolean(msg.attachmentUrl);
                        const isFile =
                          msg.messageType === 'file' &&
                          Boolean(msg.attachmentUrl);

                        return (
                          <div key={msg.id} className="space-y-2">
                            {showDateDivider && (
                              <div className="flex justify-center my-2">
                                <span className="text-[11px] font-medium text-purple-950/55 dark:text-purple-200/60 px-2.5 py-0.5 rounded-full bg-purple-100/70 dark:bg-white/10">
                                  {currDateLabel}
                                </span>
                              </div>
                            )}

                            <div
                              className={`flex items-end gap-2 ${
                                mine ? 'justify-end' : 'justify-start'
                              }`}
                            >
                              {!mine && (
                                <Avatar
                                  src={senderAvatarSrc}
                                  name={senderDisplayName}
                                  size="sm"
                                />
                              )}

                              <div
                                className={`max-w-[82%] sm:max-w-[70%] flex flex-col ${
                                  mine ? 'items-end' : 'items-start'
                                }`}
                              >
                                <span className="text-[11px] font-medium text-purple-950/55 dark:text-purple-200/60 mb-0.5 px-1">
                                  {senderDisplayName}
                                </span>

                                <div
                                  className={`rounded-2xl px-3.5 py-2.5 text-sm shadow-xs ${
                                    mine
                                      ? 'bg-[#2E1065] dark:bg-[#5B21B6] text-white rounded-br-sm'
                                      : 'bg-white dark:bg-[#1E1333] border border-purple-950/10 dark:border-white/10 text-[#1E102E] dark:text-purple-50 rounded-bl-sm'
                                  }`}
                                >
                                  {isAudio && msg.audioUrl ? (
                                    <VoiceNotePlayer
                                      src={msg.audioUrl}
                                      initialDurationSec={
                                        msg.audioDurationSec || 0
                                      }
                                      variant={mine ? 'mine' : 'partner'}
                                    />
                                  ) : isVideo && msg.videoUrl ? (
                                    <div className="space-y-1.5">
                                      <video
                                        controls
                                        playsInline
                                        preload="metadata"
                                        src={msg.videoUrl}
                                        className="w-full max-w-[260px] max-h-[260px] rounded-xl bg-black"
                                      />
                                      <div
                                        className={`text-[10px] flex items-center gap-1 ${
                                          mine
                                            ? 'text-purple-200/85'
                                            : 'text-purple-950/65 dark:text-purple-200/75'
                                        }`}
                                      >
                                        <Camera className="w-3 h-3" />
                                        <span>
                                          Video message
                                          {msg.videoDurationSec
                                            ? ` · ${formatAudioClock(msg.videoDurationSec)}`
                                            : ''}
                                        </span>
                                      </div>
                                    </div>
                                  ) : isImage && msg.attachmentUrl ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setLightboxImage(
                                          msg.attachmentUrl || null
                                        )
                                      }
                                      className="block rounded-xl overflow-hidden focus:outline-none focus:ring-2 focus:ring-pink-500"
                                    >
                                      <img
                                        src={msg.attachmentUrl}
                                        alt={msg.attachmentName || 'Shared photo'}
                                        loading="lazy"
                                        className="max-w-[240px] max-h-[260px] object-cover rounded-xl bg-purple-950/10"
                                      />
                                    </button>
                                  ) : isFile && msg.attachmentUrl ? (
                                    <a
                                      href={msg.attachmentUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className={`flex items-center gap-2.5 p-2 rounded-xl border ${
                                        mine
                                          ? 'border-white/20 bg-white/10 hover:bg-white/15 text-white'
                                          : 'border-purple-950/15 dark:border-white/15 bg-purple-50 dark:bg-white/5 hover:bg-purple-100 dark:hover:bg-white/10 text-[#2E1065] dark:text-purple-100'
                                      }`}
                                    >
                                      <FileText className="w-5 h-5 shrink-0" />
                                      <span className="text-xs font-semibold truncate max-w-[190px]">
                                        {msg.attachmentName || 'Document'}
                                      </span>
                                    </a>
                                  ) : (
                                    <p className="whitespace-pre-wrap break-words leading-relaxed">
                                      {msg.text}
                                    </p>
                                  )}

                                  <div
                                    className={`text-[10px] mt-1 tabular-nums flex items-center justify-end gap-1.5 ${
                                      mine
                                        ? 'text-purple-200/85'
                                        : 'text-purple-950/50 dark:text-purple-200/55'
                                    }`}
                                  >
                                    <span>{formatTimestamp(msg.createdAt)}</span>
                                    {mine && (
                                      <span className="inline-flex items-center gap-0.5">
                                        {msg.pending ? (
                                          <>
                                            <Clock className="w-3 h-3" />
                                            <span>Sending</span>
                                          </>
                                        ) : msg.readByRecipient ? (
                                          <span
                                            className="inline-flex items-center gap-0.5 text-sky-200 font-medium"
                                            aria-label="Seen"
                                            title={
                                              msg.readAt
                                                ? `Seen ${formatTimestamp(msg.readAt)}`
                                                : 'Seen'
                                            }
                                          >
                                            <CheckCheck className="w-3.5 h-3.5 text-sky-300" />
                                            <span>Seen</span>
                                          </span>
                                        ) : (
                                          <span
                                            className="inline-flex items-center gap-0.5"
                                            aria-label="Sent"
                                          >
                                            <Check className="w-3.5 h-3.5" />
                                            <span>Delivered</span>
                                          </span>
                                        )}
                                      </span>
                                    )}
                                    {mine && !msg.pending && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setConfirmDeleteId((curr) =>
                                            curr === msg.id ? null : msg.id
                                          )
                                        }
                                        aria-label="Delete message"
                                        title="Delete message"
                                        className="ml-1 p-0.5 rounded hover:bg-white/15 text-purple-200/75 hover:text-white"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>
                                </div>

                                {mine && confirmDeleteId === msg.id && (
                                  <div className="mt-1 flex items-center gap-1.5 bg-white dark:bg-[#1E1333] border border-purple-950/15 dark:border-white/15 rounded-lg px-2 py-1 text-[11px] shadow-sm">
                                    <span className="text-purple-950/80 dark:text-purple-100">
                                      Delete message?
                                    </span>
                                    <button
                                      type="button"
                                      disabled={deletingMsgId === msg.id}
                                      onClick={() =>
                                        void handleDeleteOwnMessage(msg, idx)
                                      }
                                      className="font-bold text-red-600 dark:text-red-400 hover:underline px-1"
                                    >
                                      {deletingMsgId === msg.id
                                        ? 'Deleting...'
                                        : 'Delete'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteId(null)}
                                      className="text-purple-950/60 dark:text-purple-200/70 hover:underline px-1"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                )}
                              </div>

                              {mine && (
                                <Avatar
                                  src={senderAvatarSrc}
                                  name={senderDisplayName}
                                  size="sm"
                                />
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}

                    {partnerIsTyping && (
                      <div
                        role="status"
                        aria-live="polite"
                        className="flex items-center gap-2 text-xs text-purple-950/75 dark:text-purple-200/80 pl-1"
                      >
                        <Avatar
                          src={other.photo}
                          name={other.name}
                          size="sm"
                        />
                        <div className="bg-white dark:bg-[#1E1333] border border-purple-950/10 dark:border-white/10 rounded-2xl px-3.5 py-2 inline-flex items-center gap-2 shadow-xs">
                          <span className="italic font-medium">
                            {other.name} is typing
                          </span>
                          <span
                            aria-hidden="true"
                            className="inline-flex items-center gap-0.5"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-pink-500 animate-bounce [animation-delay:0ms]" />
                            <span className="w-1.5 h-1.5 rounded-full bg-pink-500 animate-bounce [animation-delay:150ms]" />
                            <span className="w-1.5 h-1.5 rounded-full bg-pink-500 animate-bounce [animation-delay:300ms]" />
                          </span>
                        </div>
                      </div>
                    )}

                    <div ref={bottomRef} />
                  </div>

                  {/* Daily Message Quota Strip */}
                  <div className="px-4 py-1.5 bg-purple-50/90 dark:bg-[#190F29] border-t border-purple-950/10 dark:border-white/10 flex items-center justify-between text-[11px] text-purple-950/75 dark:text-purple-200/80">
                    {isPremium ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-amber-800 dark:text-amber-300">
                        <Crown className="w-3 h-3 text-amber-600 dark:text-amber-300" />
                        <span>Unlimited Messaging · Text, Voice & Video</span>
                      </span>
                    ) : (
                      <>
                        <span className="tabular-nums">
                          Free daily messages:{' '}
                          <strong>{usedMessagesToday}</strong> /{' '}
                          {FREE_DAILY_MESSAGES_LIMIT}
                        </span>
                        <button
                          type="button"
                          onClick={() => onNavigate('premium')}
                          className="font-semibold text-pink-600 dark:text-pink-400 hover:underline"
                        >
                          Upgrade for Unlimited
                        </button>
                      </>
                    )}
                  </div>

                  {/* Emoji Picker Popover */}
                  {emojiOpen && (
                    <div className="px-3 py-2 bg-white dark:bg-[#1E1333] border-t border-purple-950/10 dark:border-white/10 flex flex-wrap gap-1.5">
                      {QUICK_EMOJIS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => handleDraftChange(`${draft}${emoji}`)}
                          className="w-9 h-9 rounded-lg hover:bg-purple-50 dark:hover:bg-white/10 text-lg flex items-center justify-center"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Upload Progress Bar (non-video or voice/attachment) */}
                  {uploadProgress !== null && !videoRecorderOpen && (
                    <div className="px-4 py-1.5 bg-purple-50 dark:bg-[#1E1333] border-t border-purple-950/10 dark:border-white/10 text-xs text-[#2E1065] dark:text-purple-100 flex items-center justify-between">
                      <span>
                        {uploadingVoice
                          ? 'Sending voice message...'
                          : 'Uploading attachment...'}
                      </span>
                      <span className="font-semibold tabular-nums">
                        {uploadProgress}%
                      </span>
                    </div>
                  )}

                  {/* Bottom Conversation Controls: ONLY rendered inside Individual Conversation Screen */}
                  {videoRecorderOpen ? (
                    <VideoMessageRecorder
                      sending={uploadingVideo}
                      uploadProgress={uploadProgress}
                      onCancel={() => setVideoRecorderOpen(false)}
                      onSendVideo={handleSendRecordedVideo}
                    />
                  ) : recordingVoice ? (
                    <div className="p-3 bg-white dark:bg-[#190F29] border-t border-purple-950/10 dark:border-white/10 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 text-sm font-semibold text-red-600 dark:text-red-400">
                        <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-pulse" />
                        <span>Recording Voice</span>
                        <span className="tabular-nums">
                          {formatAudioClock(voiceSeconds)} /{' '}
                          {formatAudioClock(MAX_VOICE_SECONDS)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => stopVoiceRecording(true)}
                          className="min-h-[42px] px-3 rounded-xl border border-purple-950/20 dark:border-white/20 text-xs font-semibold text-purple-950 dark:text-purple-100 hover:bg-purple-50 dark:hover:bg-white/10"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => stopVoiceRecording(false)}
                          className="min-h-[42px] px-3.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                        >
                          <Square className="w-3.5 h-3.5 fill-current" />
                          <span>Stop & Preview</span>
                        </button>
                      </div>
                    </div>
                  ) : voicePreview ? (
                    <div className="p-3 bg-white dark:bg-[#190F29] border-t border-purple-950/10 dark:border-white/10 flex flex-wrap items-center justify-between gap-3">
                      <VoiceNotePlayer
                        src={voicePreview.url}
                        initialDurationSec={voicePreview.durationSec}
                        variant="preview"
                      />
                      <div className="flex items-center gap-2 ml-auto">
                        <button
                          type="button"
                          disabled={uploadingVoice}
                          onClick={discardVoicePreview}
                          aria-label="Discard voice message"
                          className="min-h-[42px] px-3 rounded-xl border border-purple-950/20 dark:border-white/20 text-xs font-semibold text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 inline-flex items-center gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Cancel</span>
                        </button>
                        <button
                          type="button"
                          disabled={uploadingVoice}
                          onClick={() => void handleSendVoicePreview()}
                          className="min-h-[42px] px-4 rounded-xl bg-gradient-to-r from-[#6B21A8] to-[#DB2777] text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-60"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>
                            {uploadingVoice ? 'Sending...' : 'Send Voice'}
                          </span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <form
                      onSubmit={handleSend}
                      className="p-2.5 sm:p-3 bg-white dark:bg-[#190F29] border-t border-purple-950/10 dark:border-white/10 flex items-center gap-1.5 sm:gap-2"
                    >
                      <input
                        ref={attachmentInputRef}
                        type="file"
                        accept="image/*,.pdf,.txt"
                        onChange={handleAttachmentSelected}
                        className="hidden"
                      />
                      <button
                        type="button"
                        disabled={composerBusy}
                        onClick={() => attachmentInputRef.current?.click()}
                        title="Attach photo or file"
                        aria-label="Attach photo or file"
                        className="min-h-[42px] min-w-[38px] sm:min-w-[42px] rounded-xl bg-purple-50 dark:bg-white/10 hover:bg-purple-100 dark:hover:bg-white/15 text-[#2E1065] dark:text-purple-100 flex items-center justify-center shrink-0 transition-colors disabled:opacity-50"
                      >
                        <Paperclip className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        disabled={composerBusy}
                        onClick={() => void handleStartVoiceRecord()}
                        title="Record voice message"
                        aria-label="Record voice message"
                        className="min-h-[42px] min-w-[38px] sm:min-w-[42px] rounded-xl bg-purple-50 dark:bg-white/10 hover:bg-purple-100 dark:hover:bg-white/15 text-[#2E1065] dark:text-purple-100 flex items-center justify-center shrink-0 transition-colors disabled:opacity-50"
                      >
                        <Mic className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        disabled={composerBusy}
                        onClick={handleOpenVideoRecorder}
                        title="Record video message"
                        aria-label="Record video message"
                        className="min-h-[42px] min-w-[38px] sm:min-w-[42px] rounded-xl bg-purple-50 dark:bg-white/10 hover:bg-purple-100 dark:hover:bg-white/15 text-[#2E1065] dark:text-purple-100 flex items-center justify-center shrink-0 transition-colors disabled:opacity-50"
                      >
                        <Camera className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => setEmojiOpen((o) => !o)}
                        title="Insert emoji"
                        aria-label="Insert emoji"
                        className={`min-h-[42px] min-w-[38px] sm:min-w-[42px] rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                          emojiOpen
                            ? 'bg-purple-200 dark:bg-purple-700 text-[#2E1065] dark:text-white'
                            : 'bg-purple-50 dark:bg-white/10 hover:bg-purple-100 dark:hover:bg-white/15 text-[#2E1065] dark:text-purple-100'
                        }`}
                      >
                        <Smile className="w-4 h-4" />
                      </button>

                      <input
                        type="text"
                        maxLength={2000}
                        value={draft}
                        onChange={(e) => handleDraftChange(e.target.value)}
                        onBlur={() => emitTypingChange(false)}
                        placeholder={
                          uploadingAttachment
                            ? 'Uploading attachment...'
                            : `Message ${other.name}...`
                        }
                        className="flex-1 min-w-0 min-h-[42px] rounded-xl border border-purple-950/20 dark:border-white/15 bg-white dark:bg-[#24163B] text-[#1E102E] dark:text-white placeholder:text-purple-950/45 dark:placeholder:text-purple-200/45 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-700"
                      />

                      <button
                        type="submit"
                        disabled={sending || composerBusy || !draft.trim()}
                        aria-label="Send message"
                        className="min-h-[42px] min-w-[42px] px-3 sm:px-4 rounded-xl bg-gradient-to-r from-[#6B21A8] to-[#DB2777] hover:from-[#581C87] hover:to-[#BE185D] disabled:opacity-50 text-white font-semibold text-sm inline-flex items-center justify-center gap-1.5 transition-colors shrink-0"
                      >
                        <Send className="w-4 h-4" />
                        <span className="hidden sm:inline">Send</span>
                      </button>
                    </form>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {/* Image Lightbox Modal */}
        {lightboxImage && (
          <div
            role="dialog"
            aria-modal="true"
            onClick={() => setLightboxImage(null)}
            className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          >
            <button
              type="button"
              onClick={() => setLightboxImage(null)}
              aria-label="Close image preview"
              className="absolute top-4 right-4 min-h-[44px] min-w-[44px] rounded-full bg-white/15 text-white flex items-center justify-center"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={lightboxImage}
              alt="Full size chat attachment"
              className="max-w-full max-h-[85dvh] rounded-xl object-contain"
            />
          </div>
        )}

        {/* Private Photo Album Viewer Modal (Premium) */}
        {albumViewerOpen && activeMatch && (
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-50 bg-[#1A0A26]/80 flex items-center justify-center p-4"
          >
            <div className="bg-white dark:bg-[#190F29] rounded-3xl max-w-lg w-full p-5 space-y-4 border border-purple-950/15 dark:border-white/10 shadow-xl">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-[#2E1065] dark:text-white flex items-center gap-2">
                  <Images className="w-5 h-5 text-pink-600 dark:text-pink-400" />
                  <span>Private Photo Album</span>
                </h2>
                <button
                  type="button"
                  onClick={() => setAlbumViewerOpen(false)}
                  aria-label="Close private album"
                  className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-purple-950/60 dark:text-purple-200 hover:bg-purple-50 dark:hover:bg-white/10"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {albumLoading ? (
                <p className="py-8 text-center text-sm text-purple-950/65 dark:text-purple-200/70">
                  Loading private photos...
                </p>
              ) : partnerAlbumPhotos.length === 0 ? (
                <p className="py-8 text-center text-sm text-purple-950/65 dark:text-purple-200/70">
                  No private photos shared right now.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {partnerAlbumPhotos.map((url, idx) => (
                    <img
                      key={url}
                      src={url}
                      alt={`Private photo ${idx + 1}`}
                      loading="lazy"
                      className="w-full aspect-square object-cover rounded-xl bg-purple-100"
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Call Permission Request / Enable Permissions Dialog */}
        {pendingCallPermission && (
          <CallPermissionModal
            failure={pendingCallPermission.failure}
            partnerName={pendingCallPermission.partnerName}
            retrying={requestingCallMedia}
            onEnablePermissions={() => void handleEnablePendingCallPermissions()}
            onClose={() => setPendingCallPermission(null)}
          />
        )}

        {/* Lazy-Loaded 1-on-1 Live Voice / Video Call Modal */}
        {activeCallModal && activeMatch && (
          <Suspense fallback={null}>
            <VideoCallModal
              matchId={activeMatch.id}
              myUid={user.uid}
              partnerName={getOtherParticipant(activeMatch).name}
              partnerPhoto={getOtherParticipant(activeMatch).photo}
              mode={activeCallModal.mode}
              callType={activeCallModal.callType}
              callId={activeCallModal.callId}
              callSession={currentModalCallSession}
              initialStream={activeCallModal.stream}
              onCreatedOutgoing={async (offerSdp, callType) => {
                const other = getOtherParticipant(activeMatch);
                const newId = await createVideoCallSession(
                  activeMatch.id,
                  user.uid,
                  other.uid,
                  offerSdp,
                  callType
                );
                setActiveCallModal((prev) =>
                  prev ? { ...prev, callId: newId } : null
                );
                return newId;
              }}
              onClose={closeActiveCallModal}
            />
          </Suspense>
        )}

        {reportMatch && (
          <ReportModal
            reporterUid={user.uid}
            reportedUid={reportMatch.uid}
            reportedName={reportMatch.name}
            contextType="message"
            contextId={reportMatch.contextId}
            onClose={() => setReportMatch(null)}
            onSubmitted={() => {
              setReportMatch(null);
              setFeedback('Report submitted to moderation.');
            }}
          />
        )}

        {inspectPartner && (
          <MemberProfileModal
            member={inspectPartner}
            onClose={() => setInspectPartner(null)}
            onReport={() => {
              const uid = inspectPartner.uid;
              const name = inspectPartner.firstName;
              setInspectPartner(null);
              if (activeMatch) {
                setReportMatch({ uid, name, contextId: activeMatch.id });
              }
            }}
            onBlock={() => {
              setInspectPartner(null);
              void handleBlockActive();
            }}
          />
        )}
      </div>
    </div>
  );
}
