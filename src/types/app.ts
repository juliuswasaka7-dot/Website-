export type ViewRoute =
  | 'home'
  | 'auth'
  | 'discover'
  | 'matches'
  | 'profile'
  | 'premium'
  | 'safety'
  | 'install'
  | 'admin';

export type GenderOption = 'woman' | 'man' | 'non-binary' | 'prefer-not-to-say';
export type IntentionOption = 'dating' | 'friendship' | 'both';
export type VisibilityOption = 'public' | 'matches_only' | 'hidden';
export type MembershipTier = 'free' | 'premium';
export type AccountStatus = 'active' | 'suspended';

export interface PublicProfile {
  uid: string;
  firstName: string;
  age: number;
  gender: GenderOption;
  country: string;
  city: string;
  photoUrl: string;
  coverUrl?: string;
  intention: IntentionOption;
  interests: string[];
  bio: string;
  emailVerified: boolean;
  blueVerified?: boolean;
  visibility: VisibilityOption;
  membershipTier: MembershipTier;
  accountStatus: AccountStatus;
  dailyLikesCount: number;
  dailyLikesDate: string;
  dailyMessagesCount?: number;
  dailyMessagesDate?: string;
  compatibilityAnswers?: string[];
  videoIntroUrl?: string;
  privateAlbumCount?: number;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface FreeMembershipRecord {
  uid: string;
  tier: 'free';
  status: 'active';
  dailyLikesLimit: number;
  dailyMessagesLimit: number;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface PremiumMembershipRecord {
  uid: string;
  tier: 'premium';
  status: 'active';
  grantedByAdminUid: string;
  dailyLikesLimit: number;
  dailyMessagesLimit: number;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface PrivateAlbum {
  uid: string;
  photos: string[];
  updatedAt: unknown;
}

export type PresencePrivacy = 'everyone' | 'matches_only' | 'nobody';

export interface PrivateProfile {
  uid: string;
  fullName: string;
  email: string;
  dateOfBirth: string;
  showAge: boolean;
  allowFriendshipRequests: boolean;
  onlineStatusPrivacy?: PresencePrivacy;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface LikeRecord {
  fromUid: string;
  toUid: string;
  action: 'like' | 'pass';
  createdAt: unknown;
}

export interface MatchRecord {
  id: string;
  participants: [string, string];
  uidA: string;
  uidB: string;
  userAName: string;
  userAPhoto: string;
  userBName: string;
  userBPhoto: string;
  lastMessageText: string;
  lastMessageAt: unknown;
  lastSenderUid: string;
  unreadByUidA: number;
  unreadByUidB: number;
  status: 'active' | 'unmatched';
  createdAt: unknown;
  updatedAt: unknown;
}

export interface ChatMessage {
  id: string;
  senderUid: string;
  senderName?: string;
  senderPhoto?: string;
  text: string;
  messageType?: 'text' | 'audio' | 'video' | 'image' | 'file';
  audioUrl?: string;
  audioDurationSec?: number;
  videoUrl?: string;
  videoDurationSec?: number;
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentMime?: string;
  storagePath?: string;
  readByRecipient: boolean;
  readAt?: unknown;
  createdAt: unknown;
  pending?: boolean;
}

export interface PresenceStatus {
  uid: string;
  isOnline: boolean;
  privacyMode?: PresencePrivacy;
  lastSeen: unknown;
  updatedAt: unknown;
}

export interface TypingStatus {
  matchId?: string;
  uid: string;
  recipientUid?: string;
  isTyping: boolean;
  updatedAt: unknown;
}

export interface CallSession {
  id: string;
  callerUid: string;
  calleeUid: string;
  callType?: 'video' | 'audio';
  status: 'ringing' | 'active' | 'ended' | 'declined' | 'missed';
  offerSdp: string;
  answerSdp: string;
  callerCandidates: string[];
  calleeCandidates: string[];
  createdAt: unknown;
  updatedAt: unknown;
}

export interface BlockRecord {
  id: string;
  blockerUid: string;
  blockedUid: string;
  createdAt: unknown;
}

export type ReportCategory =
  | 'scam_money'
  | 'inappropriate_photo'
  | 'harassment'
  | 'fake_profile'
  | 'underage'
  | 'other';

export interface SafetyReport {
  id: string;
  reporterUid: string;
  reportedUid: string;
  category: ReportCategory;
  contextType: 'profile' | 'message' | 'photo';
  contextId: string;
  details: string;
  status: 'open' | 'reviewed' | 'resolved';
  adminNote: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface CommunityStats {
  totalMembers: number;
  ugandaMembers: number;
  jeddahMembers: number;
  otherMembers: number;
  totalMatches: number;
  updatedAt: unknown;
}

export const FREE_DAILY_LIKES_LIMIT = 10;
export const PREMIUM_DAILY_LIKES_LIMIT = 100;
export const FREE_DAILY_MESSAGES_LIMIT = 25;

export const ADMIN_EMAIL = 'julius.wa.saka7@gmail.com';

export interface CompatibilityQuestion {
  id: string;
  dimension: string;
  question: string;
  premiumOnly: boolean;
  options: { value: string; label: string }[];
}

export const COMPATIBILITY_QUESTIONS: CompatibilityQuestion[] = [
  {
    id: 'goal',
    dimension: 'Relationship Goal',
    question: 'What kind of bond matters most to you right now?',
    premiumOnly: false,
    options: [
      { value: 'marriage', label: 'Long-term marriage & family' },
      { value: 'serious', label: 'Committed relationship' },
      { value: 'friendship', label: 'Supportive friendship first' },
    ],
  },
  {
    id: 'lifestyle',
    dimension: 'Weekend Rhythm',
    question: 'How do you enjoy spending your free time?',
    premiumOnly: false,
    options: [
      { value: 'home', label: 'Quiet tea, cooking & home time' },
      { value: 'social', label: 'Community, cafe & gatherings' },
      { value: 'travel', label: 'Exploring new cities & travel' },
    ],
  },
  {
    id: 'communication',
    dimension: 'Communication',
    question: 'What communication style makes you feel closest?',
    premiumOnly: false,
    options: [
      { value: 'daily', label: 'Warm daily check-ins' },
      { value: 'voice_video', label: 'Voice notes & video calls' },
      { value: 'thoughtful', label: 'Calm, thoughtful messages' },
    ],
  },
  {
    id: 'distance',
    dimension: 'Cross-Border Readiness',
    question: 'How do you feel about connecting across Uganda, Jeddah, or abroad?',
    premiumOnly: true,
    options: [
      { value: 'relocate', label: 'Open to relocating for love' },
      { value: 'visit', label: 'Happy to travel & visit first' },
      { value: 'local', label: 'Prefer connecting nearby first' },
    ],
  },
  {
    id: 'values',
    dimension: 'Shared Values',
    question: 'What anchors a strong household or friendship?',
    premiumOnly: true,
    options: [
      { value: 'faith', label: 'Faith, respect & gratitude' },
      { value: 'ambition', label: 'Shared goals & growth' },
      { value: 'kindness', label: 'Kindness, loyalty & humor' },
    ],
  },
  {
    id: 'family',
    dimension: 'Family & Future',
    question: 'How important is family involvement to your journey?',
    premiumOnly: true,
    options: [
      { value: 'central', label: 'Family is at the center' },
      { value: 'balanced', label: 'Respectful balance of both' },
      { value: 'independent', label: 'Independent partnership' },
    ],
  },
];

export function calculateCompatibility(
  myAnswers: string[] = [],
  theirAnswers: string[] = [],
  myInterests: string[] = [],
  theirInterests: string[] = []
): {
  score: number;
  breakdown: { dimension: string; matched: boolean }[];
} {
  const breakdown: { dimension: string; matched: boolean }[] = [];
  let points = 0;
  let maxPoints = 0;

  COMPATIBILITY_QUESTIONS.forEach((q, idx) => {
    const mine = myAnswers[idx];
    const theirs = theirAnswers[idx];
    if (mine && theirs) {
      maxPoints += 15;
      const matched = mine === theirs;
      if (matched) points += 15;
      else points += 6;
      breakdown.push({ dimension: q.dimension, matched });
    }
  });

  const sharedInterests = myInterests.filter((i) => theirInterests.includes(i));
  if (myInterests.length > 0 && theirInterests.length > 0) {
    maxPoints += 25;
    points += Math.min(25, sharedInterests.length * 8 + 5);
    breakdown.push({
      dimension: 'Shared Interests',
      matched: sharedInterests.length > 0,
    });
  }

  if (maxPoints === 0) {
    return { score: 72, breakdown };
  }

  const rawPct = Math.round((points / maxPoints) * 100);
  const clamped = Math.max(45, Math.min(99, rawPct));
  return { score: clamped, breakdown };
}

export const POPULAR_INTERESTS = [
  'Coffee & Tea',
  'Travel & Culture',
  'Cooking',
  'Faith & Values',
  'Music & Arts',
  'Fitness & Walking',
  'Reading',
  'Entrepreneurship',
  'Photography',
  'Family Life',
  'Volunteering',
  'Cinema',
  'Language Exchange',
  'Nature & Lakes',
] as const;

export const FEATURED_COUNTRIES = [
  'Uganda',
  'Saudi Arabia',
  'Kenya',
  'Tanzania',
  'United Arab Emirates',
  'United Kingdom',
  'United States',
  'Canada',
  'Qatar',
  'South Africa',
  'Rwanda',
  'Germany',
  'Other',
] as const;

export const CITY_SUGGESTIONS: Record<string, string[]> = {
  Uganda: ['Kampala', 'Entebbe', 'Jinja', 'Mbarara', 'Gulu', 'Mbale'],
  'Saudi Arabia': ['Jeddah', 'Riyadh', 'Dammam', 'Mecca', 'Medina', 'Khobar'],
};

export function calculateAgeFromDob(dob: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return 0;
  const [y, m, d] = dob.split('-').map(Number);
  const today = new Date();
  let age = today.getFullYear() - y;
  const monthDiff = today.getMonth() + 1 - m;
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < d)) {
    age--;
  }
  return age;
}

export function getTodayUtcDateString(): string {
  return new Date().toISOString().slice(0, 10);
}
