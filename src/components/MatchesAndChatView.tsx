import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCheck,
  Clock,
  Crown,
  FileText,
  Flag,
  Heart,
  Images,
  Lock,
  MessageCircleHeart,
  Mic,
  Moon,
  Paperclip,
  PhoneIncoming,
  Send,
  ShieldBan,
  Smile,
  Square,
  Sun,
  Trash2,
  UserX,
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
  markMatchConversationRead,
  sendChatMessage,
  setTypingStatus,
  subscribeMatchCalls,
  subscribeMatchMessages,
  subscribeMyProfile,
  subscribePartnerTyping,
  subscribeUserPresence,
  unmatchMember,
  updateCallSession,
} from '../services/datingService';
import {
  uploadChatAttachment,
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
import { MemberBadges } from './MemberBadges';
import { ReportModal } from './ReportModal';
import { formatAudioClock, VoiceNotePlayer } from './VoiceNotePlayer';

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
  if (!ts || typeof ts !== 'object') return null;
  if ('toMillis' in ts && typeof (ts as { toMillis: () => number }).toMillis === 'function') {
    return (ts as { toMillis: () => number }).toMillis();
  }
  if ('toDate' in ts && typeof (ts as { toDate: () => Date }).toDate === 'function') {
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
  presence: PresenceStatus | null,
  nowMs: number
): { online: boolean; label: string } {
  if (!presence) {
    return { online: false, label: 'Private Mutual Match Chat' };
  }
  const lastMs = getDateMillis(presence.lastSeen);
  const isFreshOnline =
    presence.isOnline && lastMs !== null && nowMs - lastMs < 135_000;
  if (isFreshOnline) {
    return { online: true, label: 'Online' };
  }
  if (!lastMs) {
    return { online: false, label: 'Offline' };
  }
  const diffSec = Math.max(0, Math.floor((nowMs - lastMs) / 1000));
  if (diffSec < 60) return { online: false, label: 'Last seen just now' };
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return { online: false, label: `Last seen ${diffMin}m ago` };
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) {
    return {
      online: false,
      label: `Last seen today at ${new Date(lastMs).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })}`,
    };
  }
  return {
    online: false,
    label: `Last seen ${new Date(lastMs).toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
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
    return 'Microphone permission denied. Enable microphone access in your browser site settings to record voice notes.';
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
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(
    initialMatchId || null
  );
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

  // Live partner profiles, online presence & typing state
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
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceChunksRef = useRef<BlobPart[]>([]);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const voiceTimerRef = useRef<number | undefined>(undefined);
  const voiceSecondsRef = useRef(0);
  const voiceCancelledRef = useRef(false);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);

  // Typing debounce refs
  const lastTypingEmitRef = useRef<number>(0);
  const typingClearTimerRef = useRef<number | undefined>(undefined);

  // Video calling state
  const [matchCalls, setMatchCalls] = useState<CallSession[]>([]);
  const [activeCallModal, setActiveCallModal] = useState<{
    mode: 'outgoing' | 'incoming';
    callId: string;
  } | null>(null);

  // Private Photo Album viewer state (Premium)
  const [albumViewerOpen, setAlbumViewerOpen] = useState(false);
  const [albumLoading, setAlbumLoading] = useState(false);
  const [partnerAlbumPhotos, setPartnerAlbumPhotos] = useState<string[]>([]);

  const [reportMatch, setReportMatch] = useState<{
    uid: string;
    name: string;
    contextId: string;
  } | null>(null);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const isPremium = profile?.membershipTier === 'premium';

  // Sync deep-linked initialMatchId (e.g. answering an incoming call notification)
  useEffect(() => {
    if (initialMatchId) {
      setSelectedMatchId(initialMatchId);
      onClearInitialMatch?.();
    }
  }, [initialMatchId, onClearInitialMatch]);

  // Notify AppShell which chat is currently open to avoid duplicate incoming call alerts
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
        // Ignore storage restrictions
      }
      return next;
    });
  };

  // Refresh clock every 20s to keep "Last seen" and typing timeout fresh
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 20_000);
    return () => window.clearInterval(id);
  }, []);

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

  const activeMatch: MatchRecord | null = useMemo(() => {
    if (!selectedMatchId) return null;
    return visibleMatches.find((m) => m.id === selectedMatchId) || null;
  }, [visibleMatches, selectedMatchId]);

  const activeOtherUid =
    activeMatch && user
      ? activeMatch.uidA === user.uid
        ? activeMatch.uidB
        : activeMatch.uidA
      : null;

  // Fetch partner public profiles lightly for match list badges
  useEffect(() => {
    if (!user || visibleMatches.length === 0) return;
    let cancelled = false;
    const otherUids = visibleMatches
      .map((m) => (m.uidA === user.uid ? m.uidB : m.uidA))
      .slice(0, 25);

    Promise.all(
      otherUids.map(async (uid) => {
        const p = await fetchSingleProfile(uid).catch(() => null);
        return p ? ([uid, p] as const) : null;
      })
    ).then((entries) => {
      if (cancelled) return;
      const map: Record<string, PublicProfile> = {};
      entries.forEach((e) => {
        if (e) map[e[0]] = e[1];
      });
      setPartnerProfiles((prev) => ({ ...prev, ...map }));
    });

    return () => {
      cancelled = true;
    };
  }, [user, visibleMatches]);

  // Subscribe live to active partner profile, presence, and typing indicator
  useEffect(() => {
    if (!activeOtherUid || !activeMatch) {
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
      activeMatch.id,
      activeOtherUid,
      setPartnerTyping
    );

    return () => {
      unsubProfile();
      unsubPresence();
      unsubTyping();
    };
  }, [activeOtherUid, activeMatch]);

  // Subscribe messages for open chat
  useEffect(() => {
    if (!activeMatch || !user || !user.emailVerified) {
      setMessages([]);
      return;
    }
    setMessagesLoading(true);
    setMessagesError(null);
    const unsub = subscribeMatchMessages(
      activeMatch.id,
      (msgs, maybeMore) => {
        setMessages(msgs);
        setHasMoreMessages(maybeMore);
        setMessagesLoading(false);
        markMatchConversationRead(activeMatch, user.uid, msgs).catch(() => {});
      },
      (err) => {
        setMessagesError(err.message || 'Could not load conversation.');
        setMessagesLoading(false);
      },
      messageLimit
    );
    return unsub;
  }, [activeMatch, user, messageLimit, messageRetryNonce]);

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

  // Cleanup recording stream, preview objectURL, and typing timer on chat switch/unmount
  useEffect(() => {
    return () => {
      if (voiceTimerRef.current) window.clearInterval(voiceTimerRef.current);
      if (typingClearTimerRef.current) {
        window.clearTimeout(typingClearTimerRef.current);
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
  }, [selectedMatchId]);

  if (!user) {
    return (
      <div className={darkMode ? 'dark' : ''}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 pb-24">
          <div className="bg-white dark:bg-[#190F29] rounded-2xl border border-purple-950/10 dark:border-white/10 p-8 text-center">
            <MessageCircleHeart className="w-10 h-10 text-pink-600 mx-auto mb-3" />
            <h1 className="text-2xl font-bold text-[#2E1065] dark:text-white mb-2">
              Sign In to View Matches & Chat
            </h1>
            <p className="text-sm text-purple-950/75 dark:text-purple-200/80 mb-6">
              Private messaging is protected and only available between mutually matched members.
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

  if (!user.emailVerified) {
    return (
      <div className={darkMode ? 'dark' : ''}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 pb-24">
          <div className="bg-white dark:bg-[#190F29] rounded-2xl border border-purple-950/10 dark:border-white/10 p-8 text-center">
            <Lock className="w-10 h-10 text-purple-700 dark:text-purple-300 mx-auto mb-3" />
            <h1 className="text-2xl font-bold text-[#2E1065] dark:text-white mb-2">
              Verify Your Email to Enable Messaging
            </h1>
            <p className="text-sm text-purple-950/75 dark:text-purple-200/80 max-w-md mx-auto mb-4">
              To protect our community against spam and fake accounts, please click the verification link sent to your email address, then click Refresh above.
            </p>
            <p className="text-xs text-purple-950/60 dark:text-purple-300/60 tabular-nums">
              Current mutual matches: {visibleMatches.length}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const getOtherParticipant = (m: MatchRecord) => {
    const isMyA = m.uidA === user.uid;
    const uid = isMyA ? m.uidB : m.uidA;
    const live =
      (uid === activeOtherUid ? activePartnerLive : null) ||
      partnerProfiles[uid] ||
      null;
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
      return updatedMs !== null && Date.now() - updatedMs < 6000;
    })();

  const presenceInfo = formatPresenceLabel(partnerPresence, nowMs);

  const emitTypingChange = (typing: boolean) => {
    if (!activeMatch || !user) return;
    if (typingClearTimerRef.current) {
      window.clearTimeout(typingClearTimerRef.current);
      typingClearTimerRef.current = undefined;
    }

    if (!typing) {
      lastTypingEmitRef.current = 0;
      void setTypingStatus(activeMatch.id, user.uid, false);
      return;
    }

    const now = Date.now();
    if (now - lastTypingEmitRef.current > 2400) {
      lastTypingEmitRef.current = now;
      void setTypingStatus(activeMatch.id, user.uid, true);
    }
    typingClearTimerRef.current = window.setTimeout(() => {
      lastTypingEmitRef.current = 0;
      void setTypingStatus(activeMatch.id, user.uid, false);
    }, 3500);
  };

  const handleDraftChange = (nextValue: string) => {
    setDraft(nextValue);
    emitTypingChange(nextValue.trim().length > 0);
  };

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeMatch || !draft.trim() || sending) return;
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
    setFeedback(null);
    setEmojiOpen(false);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      voiceStreamRef.current = stream;

      const mimeType = pickSupportedAudioMime();
      const recorderOptions: MediaRecorderOptions = {
        audioBitsPerSecond: 24000,
        ...(mimeType ? { mimeType } : {}),
      };
      const recorder = new MediaRecorder(stream, recorderOptions);
      mediaRecorderRef.current = recorder;
      voiceChunksRef.current = [];
      voiceSecondsRef.current = 0;
      voiceCancelledRef.current = false;
      setVoiceSeconds(0);
      setRecordingVoice(true);

      recorder.ondataavailable = (evt) => {
        if (evt.data.size > 0) voiceChunksRef.current.push(evt.data);
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

      recorder.start(250);
      voiceTimerRef.current = window.setInterval(() => {
        setVoiceSeconds((s) => {
          const next = s + 1;
          voiceSecondsRef.current = next;
          if (next >= 60) {
            stopVoiceRecording(false);
            return 60;
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

  const handleAttachmentSelected = async (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !activeMatch || uploadingAttachment) return;
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

  const handleStartVideoCall = () => {
    if (!activeMatch) return;
    if (profile?.accountStatus === 'suspended') {
      setFeedback('Your account is suspended and cannot place video calls.');
      return;
    }
    setActiveCallModal({ mode: 'outgoing', callId: '' });
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
      setSelectedMatchId(null);
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
      setSelectedMatchId(null);
      setFeedback('Unmatched successfully.');
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Could not unmatch.');
    }
  };

  return (
    <div className={darkMode ? 'dark' : ''}>
      <div className="max-w-7xl mx-auto px-2 sm:px-6 py-3 sm:py-6 pb-24 md:pb-8">
        <div className="bg-white dark:bg-[#140B24] rounded-2xl border border-purple-950/10 dark:border-white/10 overflow-hidden grid grid-cols-1 md:grid-cols-12 min-h-[75dvh] md:h-[calc(100vh-140px)] shadow-sm">
          {/* Left Sidebar: Matches List */}
          <aside
            className={`md:col-span-4 border-r border-purple-950/10 dark:border-white/10 flex flex-col bg-white dark:bg-[#140B24] ${
              activeMatch ? 'hidden md:flex' : 'flex'
            }`}
          >
            <div className="p-4 border-b border-purple-950/10 dark:border-white/10 flex items-center justify-between gap-2">
              <h1 className="text-lg font-bold text-[#2E1065] dark:text-white">
                Mutual Matches ({visibleMatches.length})
              </h1>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleDarkMode}
                  aria-label={
                    darkMode ? 'Switch chat to light mode' : 'Switch chat to dark mode'
                  }
                  title={darkMode ? 'Light mode' : 'Dark mode'}
                  className="min-h-[38px] min-w-[38px] rounded-lg border border-purple-950/15 dark:border-white/15 flex items-center justify-center text-[#2E1065] dark:text-amber-300 hover:bg-purple-50 dark:hover:bg-white/10"
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
                  className="text-xs font-semibold text-pink-600 dark:text-pink-400 hover:underline px-1.5 py-1"
                >
                  Discover
                </button>
              </div>
            </div>

            {feedback && (
              <div className="m-3 p-2.5 rounded-lg bg-purple-50 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-800 text-xs text-[#2E1065] dark:text-purple-100 flex items-center justify-between gap-2">
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

            {visibleMatches.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                <Heart className="w-10 h-10 text-pink-400 mb-3" />
                <h2 className="text-base font-bold text-[#2E1065] dark:text-white mb-1">
                  No Matches Yet
                </h2>
                <p className="text-xs text-purple-950/70 dark:text-purple-200/75 max-w-xs mb-4">
                  A match is created only when you and another member both tap Like on each other.
                </p>
                <button
                  type="button"
                  onClick={() => onNavigate('discover')}
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-[#2E1065] dark:bg-pink-600 text-white text-xs font-semibold"
                >
                  Browse Members
                </button>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto divide-y divide-purple-950/10 dark:divide-white/10">
                {visibleMatches.map((m) => {
                  const other = getOtherParticipant(m);
                  const selected = activeMatch?.id === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setSelectedMatchId(m.id);
                        setMessageLimit(30);
                        setFeedback(null);
                        setConfirmDeleteId(null);
                        setEmojiOpen(false);
                      }}
                      className={`w-full p-4 flex items-center gap-3 text-left transition-colors min-h-[68px] ${
                        selected
                          ? 'bg-purple-50 dark:bg-purple-900/35'
                          : 'hover:bg-purple-50/50 dark:hover:bg-white/5'
                      }`}
                    >
                      <Avatar
                        src={other.photo}
                        name={other.name}
                        size="md"
                        blueVerified={other.blueVerified}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1 min-w-0">
                            <span className="font-semibold text-sm text-[#2E1065] dark:text-white truncate">
                              {other.name}
                            </span>
                            <MemberBadges
                              blueVerified={other.blueVerified}
                              membershipTier={other.membershipTier}
                              size="xs"
                            />
                          </div>
                          <span className="text-[11px] text-purple-950/50 dark:text-purple-200/55 tabular-nums shrink-0">
                            {formatTimestamp(m.lastMessageAt)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-0.5">
                          <p className="text-xs text-purple-950/65 dark:text-purple-200/70 truncate">
                            {m.lastMessageText || 'Say hello to start chatting'}
                          </p>
                          {other.unread > 0 && (
                            <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-pink-600 text-white text-[11px] font-bold flex items-center justify-center tabular-nums shrink-0">
                              {other.unread}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </aside>

          {/* Right Pane: Real-time Chat */}
          <section
            className={`md:col-span-8 flex flex-col bg-[#FAF7FC] dark:bg-[#0D0617] ${
              activeMatch ? 'flex' : 'hidden md:flex'
            }`}
          >
            {!activeMatch ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-purple-950/60 dark:text-purple-200/70">
                <MessageCircleHeart className="w-10 h-10 text-purple-300 dark:text-purple-500 mb-3" />
                <p className="text-sm font-medium">
                  Select a match to open your private real-time conversation.
                </p>
              </div>
            ) : (
              (() => {
                const other = getOtherParticipant(activeMatch);
                const myName = profile?.firstName || 'You';
                const myPhoto = profile?.photoUrl || '';

                return (
                  <>
                    {/* Chat Header */}
                    <div className="px-3 sm:px-4 py-3 border-b border-purple-950/10 dark:border-white/10 flex items-center justify-between gap-2 bg-white dark:bg-[#190F29]">
                      <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                        <button
                          type="button"
                          onClick={() => {
                            emitTypingChange(false);
                            setSelectedMatchId(null);
                          }}
                          aria-label="Back to matches"
                          className="md:hidden min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-purple-50 dark:hover:bg-white/10 text-[#2E1065] dark:text-white shrink-0"
                        >
                          <ArrowLeft className="w-5 h-5" />
                        </button>
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
                              className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-[#190F29]"
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
                            className={`text-[11px] truncate ${
                              partnerIsTyping
                                ? 'text-pink-600 dark:text-pink-400 font-semibold'
                                : presenceInfo.online
                                  ? 'text-emerald-700 dark:text-emerald-400 font-medium'
                                  : 'text-purple-950/60 dark:text-purple-200/65'
                            }`}
                          >
                            {partnerIsTyping
                              ? `${other.name} is typing...`
                              : presenceInfo.label}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={toggleDarkMode}
                          aria-label={
                            darkMode ? 'Light mode' : 'Dark mode'
                          }
                          title={darkMode ? 'Light mode' : 'Dark mode'}
                          className="hidden md:flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg text-purple-950/65 dark:text-amber-300 hover:bg-purple-50 dark:hover:bg-white/10"
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
                          onClick={handleStartVideoCall}
                          title="Start 1-on-1 Video Call"
                          aria-label="Start video call"
                          className="min-h-[40px] min-w-[40px] px-2.5 flex items-center justify-center gap-1.5 rounded-lg bg-purple-100/80 dark:bg-purple-800/50 text-[#2E1065] dark:text-white hover:bg-purple-200 dark:hover:bg-purple-700/60 font-semibold text-xs"
                        >
                          <Video className="w-4 h-4" />
                          <span className="hidden lg:inline">Call</span>
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
                          title="Unmatch"
                          aria-label="Unmatch"
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

                    {/* Incoming Video Call Banner inside Chat */}
                    {incomingRingingCall && !activeCallModal && (
                      <div className="bg-emerald-950 text-white px-4 py-2.5 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold">
                          <PhoneIncoming className="w-4 h-4 text-emerald-300 shrink-0" />
                          <span>Incoming Video Call from {other.name}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              setActiveCallModal({
                                mode: 'incoming',
                                callId: incomingRingingCall.id,
                              })
                            }
                            className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-[#25D366] text-[#052E16] text-xs font-bold"
                          >
                            Accept
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

                    {/* Anti-scam reminder */}
                    <div className="bg-amber-50/90 dark:bg-amber-950/35 border-b border-amber-200/70 dark:border-amber-800/40 px-4 py-2 text-[11px] text-amber-950 dark:text-amber-100/90 flex items-center gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400 shrink-0" />
                      <span>
                        Safety reminder: Never send money, mobile money, or financial details to anyone you meet online.
                      </span>
                    </div>

                    {/* Feedback Banner inside active chat on mobile too */}
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

                    {/* Messages Feed */}
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
                            You matched with {other.name}! Send a warm, respectful greeting.
                          </p>
                        </div>
                      ) : (
                        messages.map((msg, idx) => {
                          const mine = msg.senderUid === user.uid;
                          const prevMsg = idx > 0 ? messages[idx - 1] : null;
                          const prevDateLabel = prevMsg
                            ? formatDateHeading(prevMsg.createdAt)
                            : null;
                          const currDateLabel = formatDateHeading(
                            msg.createdAt
                          );
                          const showDateDivider = currDateLabel !== prevDateLabel;

                          const senderDisplayName = mine
                            ? myName
                            : msg.senderName || other.name;
                          const senderAvatarSrc = mine
                            ? myPhoto
                            : msg.senderPhoto || other.photo;

                          const isAudio =
                            msg.messageType === 'audio' && Boolean(msg.audioUrl);
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
                                  className={`max-w-[80%] sm:max-w-[68%] flex flex-col ${
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
                                            <>
                                              <CheckCheck className="w-3.5 h-3.5 text-sky-300" />
                                              <span className="text-sky-200">
                                                Read
                                              </span>
                                            </>
                                          ) : (
                                            <>
                                              <Check className="w-3.5 h-3.5" />
                                              <span>Delivered</span>
                                            </>
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
                        <div className="flex items-center gap-2 text-xs text-purple-950/65 dark:text-purple-200/70 pl-1">
                          <Avatar
                            src={other.photo}
                            name={other.name}
                            size="sm"
                          />
                          <span className="bg-white dark:bg-[#1E1333] border border-purple-950/10 dark:border-white/10 rounded-2xl px-3 py-1.5 italic">
                            {other.name} is typing...
                          </span>
                        </div>
                      )}

                      <div ref={bottomRef} />
                    </div>

                    {/* Daily Message Quota Strip */}
                    <div className="px-4 py-1.5 bg-purple-50/90 dark:bg-[#190F29] border-t border-purple-950/10 dark:border-white/10 flex items-center justify-between text-[11px] text-purple-950/75 dark:text-purple-200/80">
                      {isPremium ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-amber-800 dark:text-amber-300">
                          <Crown className="w-3 h-3 text-amber-600 dark:text-amber-300" />
                          <span>Unlimited Messaging · Voice, Media & Video</span>
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

                    {/* Upload Progress Bar */}
                    {uploadProgress !== null && (
                      <div className="px-4 py-1.5 bg-purple-50 dark:bg-[#1E1333] border-t border-purple-950/10 dark:border-white/10 text-xs text-[#2E1065] dark:text-purple-100 flex items-center justify-between">
                        <span>
                          {uploadingVoice
                            ? 'Sending voice note...'
                            : 'Uploading attachment...'}
                        </span>
                        <span className="font-semibold tabular-nums">
                          {uploadProgress}%
                        </span>
                      </div>
                    )}

                    {/* Voice Note Recording / Preview / Standard Composer */}
                    {recordingVoice ? (
                      <div className="p-3 bg-white dark:bg-[#190F29] border-t border-purple-950/10 dark:border-white/10 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 text-sm font-semibold text-red-600 dark:text-red-400">
                          <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-pulse" />
                          <span>Recording</span>
                          <span className="tabular-nums">
                            {formatAudioClock(voiceSeconds)} / 1:00
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
                            <span>Preview</span>
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
                            aria-label="Discard voice note"
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
                          disabled={uploadingVoice || uploadingAttachment}
                          onClick={() => attachmentInputRef.current?.click()}
                          title="Attach photo or file"
                          aria-label="Attach photo or file"
                          className="min-h-[44px] min-w-[44px] rounded-xl bg-purple-50 dark:bg-white/10 hover:bg-purple-100 dark:hover:bg-white/15 text-[#2E1065] dark:text-purple-100 flex items-center justify-center shrink-0 transition-colors disabled:opacity-50"
                        >
                          <Paperclip className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          disabled={uploadingVoice || uploadingAttachment}
                          onClick={() => void handleStartVoiceRecord()}
                          title="Record voice note"
                          aria-label="Record voice note"
                          className="min-h-[44px] min-w-[44px] rounded-xl bg-purple-50 dark:bg-white/10 hover:bg-purple-100 dark:hover:bg-white/15 text-[#2E1065] dark:text-purple-100 flex items-center justify-center shrink-0 transition-colors disabled:opacity-50"
                        >
                          <Mic className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => setEmojiOpen((o) => !o)}
                          title="Insert emoji"
                          aria-label="Insert emoji"
                          className={`min-h-[44px] min-w-[40px] rounded-xl flex items-center justify-center shrink-0 transition-colors ${
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
                          className="flex-1 min-w-0 min-h-[44px] rounded-xl border border-purple-950/20 dark:border-white/15 bg-white dark:bg-[#24163B] text-[#1E102E] dark:text-white placeholder:text-purple-950/45 dark:placeholder:text-purple-200/45 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-700"
                        />

                        <button
                          type="submit"
                          disabled={
                            sending ||
                            uploadingVoice ||
                            uploadingAttachment ||
                            !draft.trim()
                          }
                          aria-label="Send message"
                          className="min-h-[44px] min-w-[44px] px-3 sm:px-4 rounded-xl bg-gradient-to-r from-[#6B21A8] to-[#DB2777] hover:from-[#581C87] hover:to-[#BE185D] disabled:opacity-50 text-white font-semibold text-sm inline-flex items-center justify-center gap-1.5 transition-colors shrink-0"
                        >
                          <Send className="w-4 h-4" />
                          <span className="hidden sm:inline">Send</span>
                        </button>
                      </form>
                    )}
                  </>
                );
              })()
            )}
          </section>
        </div>

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

        {/* Lazy-Loaded 1-on-1 Video Call Modal */}
        {activeCallModal && activeMatch && (
          <Suspense fallback={null}>
            <VideoCallModal
              matchId={activeMatch.id}
              myUid={user.uid}
              partnerName={getOtherParticipant(activeMatch).name}
              partnerPhoto={getOtherParticipant(activeMatch).photo}
              mode={activeCallModal.mode}
              callId={activeCallModal.callId}
              callSession={currentModalCallSession}
              onCreatedOutgoing={async (offerSdp) => {
                const other = getOtherParticipant(activeMatch);
                const newId = await createVideoCallSession(
                  activeMatch.id,
                  user.uid,
                  other.uid,
                  offerSdp
                );
                setActiveCallModal({ mode: 'outgoing', callId: newId });
                return newId;
              }}
              onClose={() => setActiveCallModal(null)}
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
      </div>
    </div>
  );
}
