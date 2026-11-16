import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  limitToLast,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  calculateAgeFromDob,
  FREE_DAILY_LIKES_LIMIT,
  FREE_DAILY_MESSAGES_LIMIT,
  getTodayUtcDateString,
  PREMIUM_DAILY_LIKES_LIMIT,
  type AccountStatus,
  type BlockRecord,
  type CallSession,
  type ChatMessage,
  type CommunityStats,
  type FreeMembershipRecord,
  type GenderOption,
  type IntentionOption,
  type LikeRecord,
  type MatchRecord,
  type MembershipTier,
  type PremiumMembershipRecord,
  type PresenceStatus,
  type PrivateAlbum,
  type PrivateProfile,
  type PublicProfile,
  type ReportCategory,
  type SafetyReport,
  type TypingStatus,
  type VisibilityOption,
} from '../types/app';
import { deleteChatMediaFile } from './storageService';

export interface RegistrationPayload {
  uid: string;
  fullName: string;
  email: string;
  dateOfBirth: string;
  gender: GenderOption;
  country: string;
  city: string;
  photoUrl: string;
  intention: IntentionOption;
  interests: string[];
  bio: string;
  emailVerified: boolean;
}

async function incrementCommunityStatsInBackground(
  country: string,
  city: string
): Promise<void> {
  try {
    const statsRef = doc(db, 'stats', 'community');
    const statsSnap = await getDoc(statsRef);
    const isUganda = country.trim().toLowerCase() === 'uganda';
    const isJeddah = city.trim().toLowerCase() === 'jeddah';

    if (!statsSnap.exists()) {
      await setDoc(statsRef, {
        totalMembers: 1,
        ugandaMembers: isUganda ? 1 : 0,
        jeddahMembers: isJeddah ? 1 : 0,
        otherMembers: !isUganda && !isJeddah ? 1 : 0,
        totalMatches: 0,
        updatedAt: serverTimestamp(),
      });
    } else {
      const current = statsSnap.data();
      await updateDoc(statsRef, {
        totalMembers: (current.totalMembers || 0) + 1,
        ugandaMembers: (current.ugandaMembers || 0) + (isUganda ? 1 : 0),
        jeddahMembers: (current.jeddahMembers || 0) + (isJeddah ? 1 : 0),
        otherMembers:
          (current.otherMembers || 0) + (!isUganda && !isJeddah ? 1 : 0),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    // Non-fatal if stats update contends; admin can sync stats
    console.warn('Community stats increment skipped:', err);
  }
}

export async function createInitialUserProfiles(
  payload: RegistrationPayload,
  options?: { skipExistenceCheck?: boolean }
): Promise<void> {
  const age = calculateAgeFromDob(payload.dateOfBirth);
  if (age < 18) {
    throw new Error('You must be at least 18 years old to join FIND YOUR LOVE.');
  }

  const firstName = payload.fullName.trim().split(/\s+/)[0].slice(0, 50) || 'Member';
  const today = getTodayUtcDateString();

  const publicProfileData = {
    uid: payload.uid,
    firstName,
    age,
    gender: payload.gender,
    country: payload.country.trim().slice(0, 80),
    city: payload.city.trim().slice(0, 80),
    photoUrl: payload.photoUrl.slice(0, 1500),
    intention: payload.intention,
    interests: payload.interests.slice(0, 10),
    bio: payload.bio.trim().slice(0, 600),
    emailVerified: payload.emailVerified,
    blueVerified: false,
    visibility: 'public' as VisibilityOption,
    membershipTier: 'free' as MembershipTier,
    accountStatus: 'active' as AccountStatus,
    dailyLikesCount: 0,
    dailyLikesDate: today,
    dailyMessagesCount: 0,
    dailyMessagesDate: today,
    videoIntroUrl: '',
    privateAlbumCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const privateProfileData = {
    uid: payload.uid,
    fullName: payload.fullName.trim().slice(0, 100),
    email: payload.email.trim().slice(0, 150),
    dateOfBirth: payload.dateOfBirth,
    showAge: true,
    allowFriendshipRequests: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const freeMembershipData = {
    uid: payload.uid,
    tier: 'free' as const,
    status: 'active' as const,
    dailyLikesLimit: FREE_DAILY_LIKES_LIMIT,
    dailyMessagesLimit: FREE_DAILY_MESSAGES_LIMIT,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    if (!options?.skipExistenceCheck) {
      const existingSnap = await getDoc(doc(db, 'profiles', payload.uid));
      if (existingSnap.exists()) {
        return;
      }
    }

    const batch = writeBatch(db);
    batch.set(doc(db, 'profiles', payload.uid), publicProfileData);
    batch.set(doc(db, 'privateProfiles', payload.uid), privateProfileData);
    batch.set(doc(db, 'freeMemberships', payload.uid), freeMembershipData);
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `profiles/${payload.uid}`);
  }

  // Increment community stats asynchronously without blocking registration completion
  void incrementCommunityStatsInBackground(payload.country, payload.city);
}

export async function syncEmailVerificationStatus(
  uid: string,
  emailVerified: boolean
): Promise<void> {
  try {
    const profileRef = doc(db, 'profiles', uid);
    const snap = await getDoc(profileRef);
    if (snap.exists() && snap.data().emailVerified !== emailVerified) {
      await updateDoc(profileRef, {
        emailVerified,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `profiles/${uid}`);
  }
}

export function subscribeMyProfile(
  uid: string,
  onData: (profile: PublicProfile | null) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = `profiles/${uid}`;
  return onSnapshot(
    doc(db, 'profiles', uid),
    (snapshot) => {
      onData(snapshot.exists() ? (snapshot.data() as PublicProfile) : null);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}

export function subscribeMyPrivateProfile(
  uid: string,
  onData: (profile: PrivateProfile | null) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = `privateProfiles/${uid}`;
  return onSnapshot(
    doc(db, 'privateProfiles', uid),
    (snapshot) => {
      onData(snapshot.exists() ? (snapshot.data() as PrivateProfile) : null);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}

export function subscribeCommunityStats(
  onData: (stats: CommunityStats | null) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, 'stats', 'community'),
    (snapshot) => {
      onData(snapshot.exists() ? (snapshot.data() as CommunityStats) : null);
    },
    () => {
      onData(null);
    }
  );
}

export async function fetchDiscoverProfilesPage(
  pageSize: number,
  cursorDoc: QueryDocumentSnapshot<DocumentData> | null
): Promise<{
  profiles: PublicProfile[];
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}> {
  const path = 'profiles';
  try {
    const baseConstraints = [
      where('accountStatus', '==', 'active'),
      where('visibility', '==', 'public'),
      limit(pageSize),
    ];
    const q = cursorDoc
      ? query(
          collection(db, 'profiles'),
          where('accountStatus', '==', 'active'),
          where('visibility', '==', 'public'),
          startAfter(cursorDoc),
          limit(pageSize)
        )
      : query(collection(db, 'profiles'), ...baseConstraints);

    const snap = await getDocs(q);
    const profiles = snap.docs.map((d) => d.data() as PublicProfile);
    const lastDoc =
      snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
    return {
      profiles,
      lastDoc,
      hasMore: snap.docs.length === pageSize,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export function subscribeMyLikes(
  uid: string,
  onData: (likesByTarget: Record<string, LikeRecord>) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = 'likes';
  const q = query(collection(db, 'likes'), where('fromUid', '==', uid));
  return onSnapshot(
    q,
    (snapshot) => {
      const map: Record<string, LikeRecord> = {};
      snapshot.docs.forEach((d) => {
        const data = d.data() as LikeRecord;
        map[data.toUid] = data;
      });
      onData(map);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}

export function subscribeMyMatches(
  uid: string,
  onData: (matches: MatchRecord[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = 'matches';
  const q = query(
    collection(db, 'matches'),
    where('participants', 'array-contains', uid)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const list = snapshot.docs
        .map((d) => ({ ...(d.data() as Omit<MatchRecord, 'id'>), id: d.id }))
        .filter((m) => m.status === 'active');
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}

export function subscribeMatchMessages(
  matchId: string,
  onData: (messages: ChatMessage[], hasMore: boolean) => void,
  onError: (err: Error) => void,
  messageLimit = 30
): Unsubscribe {
  const path = `matches/${matchId}/messages`;
  const q = query(
    collection(db, 'matches', matchId, 'messages'),
    orderBy('createdAt', 'asc'),
    limitToLast(messageLimit)
  );
  return onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snapshot) => {
      const msgs = snapshot.docs.map((d) => ({
        ...(d.data() as Omit<ChatMessage, 'id'>),
        id: d.id,
        pending: d.metadata.hasPendingWrites,
      }));
      onData(msgs, snapshot.docs.length >= messageLimit);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}

export function subscribeBlocks(
  uid: string,
  onData: (blockedIds: Set<string>, myBlockDocs: BlockRecord[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  let byMe: BlockRecord[] = [];
  let againstMe: BlockRecord[] = [];

  const emit = () => {
    const ids = new Set<string>();
    byMe.forEach((b) => ids.add(b.blockedUid));
    againstMe.forEach((b) => ids.add(b.blockerUid));
    onData(ids, byMe);
  };

  const unsub1 = onSnapshot(
    query(collection(db, 'blocks'), where('blockerUid', '==', uid)),
    (snap) => {
      byMe = snap.docs.map((d) => ({
        ...(d.data() as Omit<BlockRecord, 'id'>),
        id: d.id,
      }));
      emit();
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'blocks');
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );

  const unsub2 = onSnapshot(
    query(collection(db, 'blocks'), where('blockedUid', '==', uid)),
    (snap) => {
      againstMe = snap.docs.map((d) => ({
        ...(d.data() as Omit<BlockRecord, 'id'>),
        id: d.id,
      }));
      emit();
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'blocks');
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );

  return () => {
    unsub1();
    unsub2();
  };
}

export async function recordDiscoveryAction(
  myProfile: PublicProfile,
  targetProfile: PublicProfile,
  action: 'like' | 'pass'
): Promise<{ matched: boolean; matchId?: string }> {
  const myUid = myProfile.uid;
  const targetUid = targetProfile.uid;
  const likeDocId = `${myUid}_${targetUid}`;

  if (action === 'pass') {
    try {
      await setDoc(doc(db, 'likes', likeDocId), {
        fromUid: myUid,
        toUid: targetUid,
        action: 'pass',
        createdAt: serverTimestamp(),
      });
      return { matched: false };
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `likes/${likeDocId}`);
    }
  }

  // Enforce daily likes quota
  const today = getTodayUtcDateString();
  const usedToday =
    myProfile.dailyLikesDate === today ? myProfile.dailyLikesCount : 0;
  const limitForTier =
    myProfile.membershipTier === 'premium'
      ? PREMIUM_DAILY_LIKES_LIMIT
      : FREE_DAILY_LIKES_LIMIT;

  if (usedToday >= limitForTier) {
    throw new Error(
      myProfile.membershipTier === 'premium'
        ? `You have reached today's Premium limit of ${PREMIUM_DAILY_LIKES_LIMIT} likes.`
        : `Free members can send up to ${FREE_DAILY_LIKES_LIMIT} likes per day. Check Premium Membership for up to ${PREMIUM_DAILY_LIKES_LIMIT} daily likes.`
    );
  }

  // Check if target already liked current user
  const reverseLikeId = `${targetUid}_${myUid}`;
  let reverseLiked = false;
  try {
    const reverseSnap = await getDoc(doc(db, 'likes', reverseLikeId));
    reverseLiked = reverseSnap.exists() && reverseSnap.data().action === 'like';
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `likes/${reverseLikeId}`);
  }

  const batch = writeBatch(db);
  batch.set(doc(db, 'likes', likeDocId), {
    fromUid: myUid,
    toUid: targetUid,
    action: 'like',
    createdAt: serverTimestamp(),
  });
  batch.update(doc(db, 'profiles', myUid), {
    dailyLikesCount: usedToday + 1,
    dailyLikesDate: today,
    updatedAt: serverTimestamp(),
  });

  let createdMatchId: string | undefined;

  if (reverseLiked) {
    const [uidA, uidB] =
      myUid < targetUid ? [myUid, targetUid] : [targetUid, myUid];
    const matchId = `${uidA}_${uidB}`;
    const isMyA = myUid === uidA;

    const existingMatchSnap = await getDoc(doc(db, 'matches', matchId));
    if (!existingMatchSnap.exists()) {
      createdMatchId = matchId;
      batch.set(doc(db, 'matches', matchId), {
        participants: [uidA, uidB],
        uidA,
        uidB,
        userAName: isMyA ? myProfile.firstName : targetProfile.firstName,
        userAPhoto: isMyA ? myProfile.photoUrl : targetProfile.photoUrl,
        userBName: isMyA ? targetProfile.firstName : myProfile.firstName,
        userBPhoto: isMyA ? targetProfile.photoUrl : myProfile.photoUrl,
        lastMessageText: '',
        lastMessageAt: serverTimestamp(),
        lastSenderUid: '',
        unreadByUidA: 0,
        unreadByUidB: 0,
        status: 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `likes/${likeDocId}`);
  }

  if (createdMatchId) {
    try {
      const statsRef = doc(db, 'stats', 'community');
      const statsSnap = await getDoc(statsRef);
      if (statsSnap.exists()) {
        await updateDoc(statsRef, {
          totalMatches: (statsSnap.data().totalMatches || 0) + 1,
          updatedAt: serverTimestamp(),
        });
      }
    } catch {
      // Non-fatal stats increment
    }
    return { matched: true, matchId: createdMatchId };
  }

  return { matched: false };
}

export interface SendMessageOptions {
  messageType?: 'text' | 'audio' | 'image' | 'file';
  audioUrl?: string;
  audioDurationSec?: number;
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentMime?: string;
  storagePath?: string;
}

export async function sendChatMessage(
  match: MatchRecord,
  senderUid: string,
  text: string,
  myProfile?: PublicProfile | null,
  options?: SendMessageOptions
): Promise<void> {
  const messageType = options?.messageType || 'text';
  const audioUrl = (options?.audioUrl || '').slice(0, 1500);
  const attachmentUrl = (options?.attachmentUrl || '').slice(0, 1500);
  const cleanText = text.trim().slice(0, 2000);

  if (messageType === 'text' && !cleanText) return;
  if (messageType === 'audio' && !audioUrl) return;
  if ((messageType === 'image' || messageType === 'file') && !attachmentUrl) return;

  const today = getTodayUtcDateString();
  const isFreeUser = !myProfile || myProfile.membershipTier !== 'premium';
  const usedMessagesToday =
    myProfile && myProfile.dailyMessagesDate === today
      ? myProfile.dailyMessagesCount || 0
      : 0;

  if (isFreeUser && usedMessagesToday >= FREE_DAILY_MESSAGES_LIMIT) {
    throw new Error(
      `Free members can send up to ${FREE_DAILY_MESSAGES_LIMIT} messages per day. Upgrade to Premium Membership for unlimited messaging.`
    );
  }

  const isSenderA = match.uidA === senderUid;
  const msgPath = `matches/${match.id}/messages`;
  const summaryPreview =
    messageType === 'audio'
      ? 'Voice message'
      : messageType === 'image'
        ? 'Photo'
        : messageType === 'file'
          ? `File: ${(options?.attachmentName || 'Attachment').slice(0, 80)}`
          : cleanText.slice(0, 500);

  const fallbackText =
    cleanText ||
    (messageType === 'audio'
      ? 'Voice message'
      : messageType === 'image'
        ? 'Photo'
        : options?.attachmentName || 'Attachment');

  const senderName = myProfile?.firstName?.trim().slice(0, 60);
  const senderPhoto = myProfile?.photoUrl?.slice(0, 1500);

  try {
    const batch = writeBatch(db);
    const newMsgRef = doc(collection(db, 'matches', match.id, 'messages'));
    batch.set(newMsgRef, {
      senderUid,
      ...(senderName ? { senderName } : {}),
      ...(senderPhoto !== undefined ? { senderPhoto } : {}),
      text: fallbackText,
      messageType,
      ...(audioUrl ? { audioUrl } : {}),
      ...(typeof options?.audioDurationSec === 'number'
        ? {
            audioDurationSec: Math.max(
              0,
              Math.min(180, Math.round(options.audioDurationSec))
            ),
          }
        : {}),
      ...(attachmentUrl ? { attachmentUrl } : {}),
      ...(options?.attachmentName
        ? { attachmentName: options.attachmentName.slice(0, 200) }
        : {}),
      ...(options?.attachmentMime
        ? { attachmentMime: options.attachmentMime.slice(0, 100) }
        : {}),
      ...(options?.storagePath
        ? { storagePath: options.storagePath.slice(0, 300) }
        : {}),
      readByRecipient: false,
      createdAt: serverTimestamp(),
    });

    batch.update(doc(db, 'matches', match.id), {
      lastMessageText: summaryPreview,
      lastMessageAt: serverTimestamp(),
      lastSenderUid: senderUid,
      unreadByUidA: isSenderA ? match.unreadByUidA : match.unreadByUidA + 1,
      unreadByUidB: isSenderA ? match.unreadByUidB + 1 : match.unreadByUidB,
      updatedAt: serverTimestamp(),
    });

    if (myProfile && isFreeUser) {
      batch.update(doc(db, 'profiles', senderUid), {
        dailyMessagesCount: usedMessagesToday + 1,
        dailyMessagesDate: today,
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, msgPath);
  }
}

export async function deleteChatMessage(
  match: MatchRecord,
  message: ChatMessage,
  myUid: string,
  previousMessage?: ChatMessage | null
): Promise<void> {
  if (message.senderUid !== myUid) {
    throw new Error('You can only delete your own messages.');
  }
  const msgPath = `matches/${match.id}/messages/${message.id}`;
  try {
    await deleteDoc(doc(db, 'matches', match.id, 'messages', message.id));
    if (previousMessage !== undefined) {
      const nextPreview = previousMessage
        ? previousMessage.messageType === 'audio'
          ? 'Voice message'
          : previousMessage.messageType === 'image'
            ? 'Photo'
            : previousMessage.messageType === 'file'
              ? `File: ${(previousMessage.attachmentName || 'Attachment').slice(0, 80)}`
              : previousMessage.text.slice(0, 500)
        : 'Message deleted';
      await updateDoc(doc(db, 'matches', match.id), {
        lastMessageText: nextPreview,
        updatedAt: serverTimestamp(),
      }).catch(() => {});
    }
    if (message.storagePath) {
      void deleteChatMediaFile(message.storagePath);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, msgPath);
  }
}

export async function markMatchConversationRead(
  match: MatchRecord,
  readerUid: string,
  unreadMessages: ChatMessage[]
): Promise<void> {
  const isReaderA = match.uidA === readerUid;
  const myUnread = isReaderA ? match.unreadByUidA : match.unreadByUidB;

  const toMark = unreadMessages.filter(
    (m) => m.senderUid !== readerUid && !m.readByRecipient
  );

  if (myUnread === 0 && toMark.length === 0) return;

  try {
    const batch = writeBatch(db);
    if (myUnread > 0) {
      batch.update(doc(db, 'matches', match.id), {
        unreadByUidA: isReaderA ? 0 : match.unreadByUidA,
        unreadByUidB: isReaderA ? match.unreadByUidB : 0,
        updatedAt: serverTimestamp(),
      });
    }
    toMark.slice(0, 50).forEach((m) => {
      batch.update(doc(db, 'matches', match.id, 'messages', m.id), {
        readByRecipient: true,
        readAt: serverTimestamp(),
      });
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `matches/${match.id}`);
  }
}

export async function updateMyPresence(
  uid: string,
  isOnline: boolean
): Promise<void> {
  try {
    await setDoc(doc(db, 'presence', uid), {
      uid,
      isOnline,
      lastSeen: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Non-fatal if offline or connection interrupted
  }
}

export function subscribeUserPresence(
  uid: string,
  onData: (status: PresenceStatus | null) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, 'presence', uid),
    (snap) => {
      onData(snap.exists() ? (snap.data() as PresenceStatus) : null);
    },
    () => {
      onData(null);
    }
  );
}

export async function setTypingStatus(
  matchId: string,
  uid: string,
  isTyping: boolean
): Promise<void> {
  try {
    await setDoc(doc(db, 'matches', matchId, 'typing', uid), {
      uid,
      isTyping,
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Ignore ephemeral typing errors
  }
}

export function subscribePartnerTyping(
  matchId: string,
  partnerUid: string,
  onData: (status: TypingStatus | null) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, 'matches', matchId, 'typing', partnerUid),
    (snap) => {
      onData(snap.exists() ? (snap.data() as TypingStatus) : null);
    },
    () => {
      onData(null);
    }
  );
}

export interface IncomingCallEvent {
  matchId: string;
  call: CallSession;
}

export function subscribeGlobalIncomingCalls(
  matches: MatchRecord[],
  myUid: string,
  onCalls: (calls: IncomingCallEvent[]) => void
): Unsubscribe {
  if (!myUid || matches.length === 0) {
    onCalls([]);
    return () => {};
  }

  const topMatches = matches.slice(0, 15);
  const byMatch = new Map<string, IncomingCallEvent[]>();

  const emitAll = () => {
    const merged: IncomingCallEvent[] = [];
    const cutoffMs = Date.now() - 120_000;
    byMatch.forEach((events) => {
      events.forEach((ev) => {
        const createdMs =
          (ev.call.createdAt as { toMillis?: () => number })?.toMillis?.() ||
          Date.now();
        if (createdMs >= cutoffMs) {
          merged.push(ev);
        }
      });
    });
    merged.sort((a, b) => {
      const ta =
        (a.call.createdAt as { toMillis?: () => number })?.toMillis?.() || 0;
      const tb =
        (b.call.createdAt as { toMillis?: () => number })?.toMillis?.() || 0;
      return tb - ta;
    });
    onCalls(merged);
  };

  const unsubs = topMatches.map((m) => {
    const q = query(
      collection(db, 'matches', m.id, 'calls'),
      where('status', '==', 'ringing'),
      limit(3)
    );
    return onSnapshot(
      q,
      (snap) => {
        const list: IncomingCallEvent[] = snap.docs
          .map((d) => ({
            matchId: m.id,
            call: {
              ...(d.data() as Omit<CallSession, 'id'>),
              id: d.id,
            },
          }))
          .filter((item) => item.call.calleeUid === myUid);
        byMatch.set(m.id, list);
        emitAll();
      },
      () => {}
    );
  });

  return () => {
    unsubs.forEach((u) => u());
  };
}

export async function updateMyPublicProfile(
  uid: string,
  updates: {
    firstName: string;
    age: number;
    gender: GenderOption;
    country: string;
    city: string;
    photoUrl: string;
    intention: IntentionOption;
    interests: string[];
    bio: string;
    visibility: VisibilityOption;
    emailVerified: boolean;
    compatibilityAnswers?: string[];
  }
): Promise<void> {
  try {
    await updateDoc(doc(db, 'profiles', uid), {
      ...updates,
      firstName: updates.firstName.trim().slice(0, 50),
      country: updates.country.trim().slice(0, 80),
      city: updates.city.trim().slice(0, 80),
      photoUrl: updates.photoUrl.slice(0, 1500),
      interests: updates.interests.slice(0, 10),
      bio: updates.bio.trim().slice(0, 600),
      ...(updates.compatibilityAnswers
        ? { compatibilityAnswers: updates.compatibilityAnswers.slice(0, 6) }
        : {}),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `profiles/${uid}`);
  }
}

export async function updateMyCompatibilityQuiz(
  uid: string,
  answers: string[]
): Promise<void> {
  try {
    await updateDoc(doc(db, 'profiles', uid), {
      compatibilityAnswers: answers.slice(0, 6),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `profiles/${uid}`);
  }
}

export async function updateMyVideoIntro(
  uid: string,
  videoIntroUrl: string
): Promise<void> {
  try {
    await updateDoc(doc(db, 'profiles', uid), {
      videoIntroUrl: videoIntroUrl.slice(0, 1500),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `profiles/${uid}`);
  }
}

export async function fetchPrivateAlbum(uid: string): Promise<PrivateAlbum | null> {
  try {
    const snap = await getDoc(doc(db, 'privateAlbums', uid));
    return snap.exists() ? (snap.data() as PrivateAlbum) : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `privateAlbums/${uid}`);
  }
}

export async function savePrivateAlbumPhotos(
  uid: string,
  photos: string[]
): Promise<void> {
  const cleanPhotos = photos.slice(0, 4).map((u) => u.slice(0, 1500));
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'privateAlbums', uid), {
      uid,
      photos: cleanPhotos,
      updatedAt: serverTimestamp(),
    });
    batch.update(doc(db, 'profiles', uid), {
      privateAlbumCount: cleanPhotos.length,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `privateAlbums/${uid}`);
  }
}

export async function createVideoCallSession(
  matchId: string,
  callerUid: string,
  calleeUid: string,
  offerSdp: string
): Promise<string> {
  try {
    const ref = await addDoc(collection(db, 'matches', matchId, 'calls'), {
      callerUid,
      calleeUid,
      status: 'ringing',
      offerSdp: offerSdp.slice(0, 16000),
      answerSdp: '',
      callerCandidates: [],
      calleeCandidates: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `matches/${matchId}/calls`);
  }
}

export function subscribeMatchCalls(
  matchId: string,
  onData: (calls: CallSession[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = `matches/${matchId}/calls`;
  return onSnapshot(
    query(
      collection(db, 'matches', matchId, 'calls'),
      orderBy('createdAt', 'desc'),
      limit(5)
    ),
    (snap) => {
      onData(
        snap.docs.map((d) => ({
          ...(d.data() as Omit<CallSession, 'id'>),
          id: d.id,
        }))
      );
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}

export async function updateCallSession(
  matchId: string,
  callId: string,
  updates: Partial<
    Pick<
      CallSession,
      'status' | 'answerSdp' | 'callerCandidates' | 'calleeCandidates'
    >
  >
): Promise<void> {
  try {
    await updateDoc(doc(db, 'matches', matchId, 'calls', callId), {
      ...updates,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `matches/${matchId}/calls/${callId}`
    );
  }
}

export async function updateMyPrivateSettings(
  uid: string,
  updates: {
    fullName: string;
    showAge: boolean;
    allowFriendshipRequests: boolean;
  }
): Promise<void> {
  try {
    await updateDoc(doc(db, 'privateProfiles', uid), {
      fullName: updates.fullName.trim().slice(0, 100),
      showAge: updates.showAge,
      allowFriendshipRequests: updates.allowFriendshipRequests,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `privateProfiles/${uid}`);
  }
}

export async function blockMember(
  blockerUid: string,
  blockedUid: string,
  activeMatchId?: string
): Promise<void> {
  const blockId = `${blockerUid}_${blockedUid}`;
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'blocks', blockId), {
      blockerUid,
      blockedUid,
      createdAt: serverTimestamp(),
    });
    if (activeMatchId) {
      batch.update(doc(db, 'matches', activeMatchId), {
        status: 'unmatched',
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `blocks/${blockId}`);
  }
}

export async function unblockMember(blockId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'blocks', blockId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `blocks/${blockId}`);
  }
}

export async function unmatchMember(matchId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'matches', matchId), {
      status: 'unmatched',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `matches/${matchId}`);
  }
}

export async function submitSafetyReport(payload: {
  reporterUid: string;
  reportedUid: string;
  category: ReportCategory;
  contextType: 'profile' | 'message' | 'photo';
  contextId: string;
  details: string;
}): Promise<void> {
  try {
    await addDoc(collection(db, 'reports'), {
      reporterUid: payload.reporterUid,
      reportedUid: payload.reportedUid,
      category: payload.category,
      contextType: payload.contextType,
      contextId: payload.contextId.slice(0, 200),
      details: payload.details.trim().slice(0, 1000),
      status: 'open',
      adminNote: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'reports');
  }
}

export async function deleteMemberFirestoreData(uid: string): Promise<void> {
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'profiles', uid));
    batch.delete(doc(db, 'privateProfiles', uid));
    batch.delete(doc(db, 'freeMemberships', uid));
    batch.delete(doc(db, 'premiumMemberships', uid));
    batch.delete(doc(db, 'privateAlbums', uid));
    batch.delete(doc(db, 'presence', uid));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `profiles/${uid}`);
  }
}

export async function fetchSingleProfile(
  uid: string
): Promise<PublicProfile | null> {
  try {
    const snap = await getDoc(doc(db, 'profiles', uid));
    return snap.exists() ? (snap.data() as PublicProfile) : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `profiles/${uid}`);
  }
}

// ==================== ADMIN FUNCTIONS ====================

export function adminSubscribeAllProfiles(
  onData: (profiles: PublicProfile[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'profiles'), limit(500)),
    (snap) => {
      onData(snap.docs.map((d) => d.data() as PublicProfile));
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'profiles');
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}

export function adminSubscribeAllReports(
  onData: (reports: SafetyReport[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'reports'), orderBy('createdAt', 'desc'), limit(200)),
    (snap) => {
      onData(
        snap.docs.map((d) => ({
          ...(d.data() as Omit<SafetyReport, 'id'>),
          id: d.id,
        }))
      );
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'reports');
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}

export async function adminUpdateMemberAccountStatus(
  targetUid: string,
  accountStatus: AccountStatus
): Promise<void> {
  try {
    await updateDoc(doc(db, 'profiles', targetUid), {
      accountStatus,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `profiles/${targetUid}`);
  }
}

export async function adminSetBlueTick(
  targetUid: string,
  blueVerified: boolean
): Promise<void> {
  try {
    await updateDoc(doc(db, 'profiles', targetUid), {
      blueVerified,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `profiles/${targetUid}`);
  }
}

export async function adminUpdateMembershipTier(
  targetUid: string,
  membershipTier: MembershipTier,
  adminUid: string
): Promise<void> {
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'profiles', targetUid), {
      membershipTier,
      updatedAt: serverTimestamp(),
    });

    if (membershipTier === 'premium') {
      batch.set(doc(db, 'premiumMemberships', targetUid), {
        uid: targetUid,
        tier: 'premium',
        status: 'active',
        grantedByAdminUid: adminUid,
        dailyLikesLimit: PREMIUM_DAILY_LIKES_LIMIT,
        dailyMessagesLimit: -1,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.delete(doc(db, 'freeMemberships', targetUid));
    } else {
      batch.delete(doc(db, 'premiumMemberships', targetUid));
      batch.set(doc(db, 'freeMemberships', targetUid), {
        uid: targetUid,
        tier: 'free',
        status: 'active',
        dailyLikesLimit: FREE_DAILY_LIKES_LIMIT,
        dailyMessagesLimit: FREE_DAILY_MESSAGES_LIMIT,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `profiles/${targetUid}`);
  }
}

export function adminSubscribeFreeMemberships(
  onData: (records: FreeMembershipRecord[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'freeMemberships'), limit(500)),
    (snap) => {
      onData(snap.docs.map((d) => d.data() as FreeMembershipRecord));
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'freeMemberships');
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}

export function adminSubscribePremiumMemberships(
  onData: (records: PremiumMembershipRecord[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'premiumMemberships'), limit(500)),
    (snap) => {
      onData(snap.docs.map((d) => d.data() as PremiumMembershipRecord));
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'premiumMemberships');
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}

export async function adminModerateProfileContent(
  targetUid: string,
  updates: { photoUrl?: string; bio?: string }
): Promise<void> {
  try {
    await updateDoc(doc(db, 'profiles', targetUid), {
      ...updates,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `profiles/${targetUid}`);
  }
}

export async function adminUpdateReportStatus(
  reportId: string,
  status: 'open' | 'reviewed' | 'resolved',
  adminNote: string
): Promise<void> {
  try {
    await updateDoc(doc(db, 'reports', reportId), {
      status,
      adminNote: adminNote.trim().slice(0, 500),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `reports/${reportId}`);
  }
}

export async function adminSyncCommunityStats(): Promise<void> {
  try {
    const [profilesSnap, matchesSnap] = await Promise.all([
      getDocs(collection(db, 'profiles')),
      getDocs(collection(db, 'matches')),
    ]);

    let ugandaMembers = 0;
    let jeddahMembers = 0;
    let otherMembers = 0;
    let totalMembers = 0;

    profilesSnap.docs.forEach((d) => {
      const p = d.data() as PublicProfile;
      if (p.accountStatus !== 'active') return;
      totalMembers++;
      const isUg = p.country.trim().toLowerCase() === 'uganda';
      const isJeddah = p.city.trim().toLowerCase() === 'jeddah';
      if (isUg) ugandaMembers++;
      else if (isJeddah) jeddahMembers++;
      else otherMembers++;
    });

    const totalMatches = matchesSnap.docs.filter(
      (d) => d.data().status === 'active'
    ).length;

    await setDoc(doc(db, 'stats', 'community'), {
      totalMembers,
      ugandaMembers,
      jeddahMembers,
      otherMembers,
      totalMatches,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'stats/community');
  }
}
