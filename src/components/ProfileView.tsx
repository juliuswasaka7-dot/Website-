import {
  Camera,
  CheckCircle2,
  Crown,
  Film,
  Images,
  Lock,
  LogOut,
  Plus,
  ShieldAlert,
  Sparkles,
  Trash2,
  UserCheck,
  X,
  Zap,
} from 'lucide-react';
import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { useDataSaver } from '../context/DataSaverContext';
import {
  fetchPrivateAlbum,
  fetchSingleProfile,
  savePrivateAlbumPhotos,
  unblockMember,
  updateMyCompatibilityQuiz,
  updateMyPrivateSettings,
  updateMyPublicProfile,
  updateMyVideoIntro,
} from '../services/datingService';
import {
  uploadPrivateAlbumPhoto,
  uploadProfilePhoto,
  uploadVideoIntro,
} from '../services/storageService';
import {
  COMPATIBILITY_QUESTIONS,
  FEATURED_COUNTRIES,
  POPULAR_INTERESTS,
  type GenderOption,
  type IntentionOption,
  type ViewRoute,
  type VisibilityOption,
} from '../types/app';
import { Avatar } from './Avatar';
import { MemberBadges } from './MemberBadges';
import { InstallAppButton } from './InstallAppButton';

interface ProfileViewProps {
  onNavigate: (route: ViewRoute) => void;
}

export function ProfileView({ onNavigate }: ProfileViewProps) {
  const {
    user,
    profile,
    profileStatus,
    retryProfileLoad,
    privateProfile,
    myBlockDocs,
    logout,
    deleteMyAccount,
    resendVerificationEmail,
    refreshVerificationState,
  } = useAuth();
  const { dataSaver, toggleDataSaver } = useDataSaver();

  const [firstName, setFirstName] = useState(profile?.firstName || '');
  const [fullName, setFullName] = useState(privateProfile?.fullName || '');
  const [gender, setGender] = useState<GenderOption>(
    profile?.gender || 'woman'
  );
  const [country, setCountry] = useState(profile?.country || 'Uganda');
  const [city, setCity] = useState(profile?.city || '');
  const [intention, setIntention] = useState<IntentionOption>(
    profile?.intention || 'both'
  );
  const [interests, setInterests] = useState<string[]>(profile?.interests || []);
  const [bio, setBio] = useState(profile?.bio || '');
  const [visibility, setVisibility] = useState<VisibilityOption>(
    profile?.visibility || 'public'
  );
  const [showAge, setShowAge] = useState(privateProfile?.showAge ?? true);
  const [allowFriendshipRequests, setAllowFriendshipRequests] = useState(
    privateProfile?.allowFriendshipRequests ?? true
  );
  const [photoUrl, setPhotoUrl] = useState(profile?.photoUrl || '');

  // Compatibility quiz answers (6 slots matching COMPATIBILITY_QUESTIONS)
  const [quizAnswers, setQuizAnswers] = useState<string[]>(() => {
    const base = profile?.compatibilityAnswers || [];
    return COMPATIBILITY_QUESTIONS.map((_, i) => base[i] || '');
  });
  const [savingQuiz, setSavingQuiz] = useState(false);

  // Premium Media Studio state
  const [videoUploadProgress, setVideoUploadProgress] = useState<number | null>(null);
  const [albumPhotos, setAlbumPhotos] = useState<string[]>([]);
  const [albumLoaded, setAlbumLoaded] = useState(false);
  const [albumUploadProgress, setAlbumUploadProgress] = useState<number | null>(null);

  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [blockedNames, setBlockedNames] = useState<Record<string, string>>({});
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleteInput, setDeleteInput] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (profile) {
      setFirstName(profile.firstName);
      setGender(profile.gender);
      setCountry(profile.country);
      setCity(profile.city);
      setIntention(profile.intention);
      setInterests(profile.interests);
      setBio(profile.bio);
      setVisibility(profile.visibility);
      setPhotoUrl(profile.photoUrl);
      const base = profile.compatibilityAnswers || [];
      setQuizAnswers(COMPATIBILITY_QUESTIONS.map((_, i) => base[i] || ''));
    }
  }, [profile]);

  useEffect(() => {
    if (privateProfile) {
      setFullName(privateProfile.fullName);
      setShowAge(privateProfile.showAge);
      setAllowFriendshipRequests(privateProfile.allowFriendshipRequests);
    }
  }, [privateProfile]);

  useEffect(() => {
    if (!user || !profile || profile.membershipTier !== 'premium' || albumLoaded) {
      return;
    }
    fetchPrivateAlbum(user.uid)
      .then((album) => {
        setAlbumPhotos(album?.photos || []);
        setAlbumLoaded(true);
      })
      .catch(() => {
        setAlbumLoaded(true);
      });
  }, [user, profile, albumLoaded]);

  useEffect(() => {
    if (myBlockDocs.length === 0) {
      setBlockedNames({});
      return;
    }
    Promise.all(
      myBlockDocs.map(async (b) => {
        const p = await fetchSingleProfile(b.blockedUid).catch(() => null);
        return [b.blockedUid, p?.firstName || 'Member'] as const;
      })
    ).then((entries) => {
      setBlockedNames(Object.fromEntries(entries));
    });
  }, [myBlockDocs]);

  if (!user || !profile) {
    if (user && (profileStatus === 'loading' || profileStatus === 'idle')) {
      return (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 text-center">
          <div className="w-8 h-8 rounded-full border-2 border-purple-700 border-t-transparent animate-spin mx-auto mb-3" />
          <p className="text-sm text-purple-950/65">Loading your profile...</p>
        </div>
      );
    }
    if (user && profileStatus === 'error') {
      return (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 pb-24">
          <div className="bg-white rounded-2xl border border-purple-950/10 p-8 text-center">
            <h1 className="text-xl font-bold text-[#2E1065] mb-2">
              Connection Interrupted
            </h1>
            <p className="text-sm text-purple-950/75 mb-6">
              You are still signed in, but we could not load your profile details right now.
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
            {user ? 'Complete Your Profile' : 'Sign In to Manage Your Profile'}
          </h1>
          <p className="text-sm text-purple-950/75 mb-6">
            Access your profile settings, photo uploads, and privacy controls.
          </p>
          <button
            type="button"
            onClick={() => onNavigate('auth')}
            className="min-h-[46px] px-6 py-2.5 rounded-xl bg-[#2E1065] text-white font-semibold text-sm"
          >
            {user ? 'Finish Registration' : 'Login or Create Account'}
          </button>
        </div>
      </div>
    );
  }

  const isPremium = profile.membershipTier === 'premium';
  const isBlueVerified = Boolean(profile.blueVerified);

  const handlePhotoSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setSaveMessage(null);
    setUploadProgress(0);
    try {
      const url = await uploadProfilePhoto(
        user.uid,
        file,
        setUploadProgress,
        dataSaver
      );
      setPhotoUrl(url);
      await updateMyPublicProfile(user.uid, {
        firstName: firstName || profile.firstName,
        age: profile.age,
        gender,
        country,
        city,
        photoUrl: url,
        intention,
        interests,
        bio,
        visibility,
        emailVerified: user.emailVerified,
      });
      setSaveMessage('Profile photo updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Photo upload failed.');
    } finally {
      setUploadProgress(null);
    }
  };

  const handleVideoIntroSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !isPremium) return;
    setError(null);
    setSaveMessage(null);
    setVideoUploadProgress(0);
    try {
      const url = await uploadVideoIntro(user.uid, file, setVideoUploadProgress);
      await updateMyVideoIntro(user.uid, url);
      setSaveMessage('Video introduction uploaded to your profile.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Video upload failed.');
    } finally {
      setVideoUploadProgress(null);
      e.target.value = '';
    }
  };

  const handleRemoveVideoIntro = async () => {
    if (!isPremium) return;
    setError(null);
    try {
      await updateMyVideoIntro(user.uid, '');
      setSaveMessage('Video introduction removed.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove video.');
    }
  };

  const handleAddPrivateAlbumPhoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !isPremium) return;
    if (albumPhotos.length >= 4) {
      setError('Private photo album supports up to 4 photos.');
      return;
    }
    setError(null);
    setSaveMessage(null);
    setAlbumUploadProgress(0);
    try {
      const url = await uploadPrivateAlbumPhoto(
        user.uid,
        file,
        setAlbumUploadProgress,
        dataSaver
      );
      const next = [...albumPhotos, url].slice(0, 4);
      await savePrivateAlbumPhotos(user.uid, next);
      setAlbumPhotos(next);
      setSaveMessage('Private photo added to your album.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Private photo upload failed.');
    } finally {
      setAlbumUploadProgress(null);
      e.target.value = '';
    }
  };

  const handleDeleteAlbumPhoto = async (idx: number) => {
    if (!isPremium) return;
    setError(null);
    const next = albumPhotos.filter((_, i) => i !== idx);
    try {
      await savePrivateAlbumPhotos(user.uid, next);
      setAlbumPhotos(next);
      setSaveMessage('Private photo removed.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update album.');
    }
  };

  const handleSaveQuiz = async () => {
    setSavingQuiz(true);
    setError(null);
    setSaveMessage(null);
    try {
      // Free members save first 3 core answers; Premium members save all 6
      const sanitized = quizAnswers.map((ans, idx) =>
        !isPremium && COMPATIBILITY_QUESTIONS[idx].premiumOnly ? '' : ans
      );
      await updateMyCompatibilityQuiz(user.uid, sanitized);
      setSaveMessage(
        isPremium
          ? 'Full 6-dimension compatibility profile saved.'
          : 'Basic compatibility quiz answers saved.'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save quiz answers.');
    } finally {
      setSavingQuiz(false);
    }
  };

  const toggleInterest = (item: string) => {
    setInterests((prev) => {
      if (prev.includes(item)) return prev.filter((i) => i !== item);
      if (prev.length >= 10) return prev;
      return [...prev, item];
    });
  };

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaveMessage(null);

    if (visibility === 'matches_only' && !isPremium) {
      setError(
        'Matches-Only visibility is a Premium benefit and remains locked until confirmed by an administrator.'
      );
      return;
    }

    setSaving(true);
    try {
      await updateMyPublicProfile(user.uid, {
        firstName,
        age: profile.age,
        gender,
        country,
        city,
        photoUrl,
        intention,
        interests,
        bio,
        visibility,
        emailVerified: user.emailVerified,
      });
      if (privateProfile) {
        await updateMyPrivateSettings(user.uid, {
          fullName: fullName || privateProfile.fullName,
          showAge,
          allowFriendshipRequests,
        });
      }
      setSaveMessage('Your profile and privacy settings were saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteInput.trim().toUpperCase() !== 'DELETE') return;
    setDeleting(true);
    setError(null);
    try {
      await deleteMyAccount();
      onNavigate('home');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Account deletion failed.');
      setConfirmDeleteOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 pb-24 md:pb-16 space-y-6">
      {/* Summary Header */}
      <section className="bg-white rounded-2xl border border-purple-950/10 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
        <div className="flex items-center gap-4">
          <Avatar
            src={photoUrl}
            name={firstName || profile.firstName}
            size="lg"
            blueVerified={isBlueVerified}
          />
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-[#2E1065]">
                {profile.firstName}, <span className="tabular-nums">{profile.age}</span>
              </h1>
              <MemberBadges
                blueVerified={isBlueVerified}
                membershipTier={profile.membershipTier}
              />
            </div>
            <p className="text-sm text-purple-950/70">
              {profile.city} · {profile.country}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium">
              <span
                className={
                  user.emailVerified ? 'text-emerald-700' : 'text-amber-700'
                }
              >
                {user.emailVerified ? 'Email Verified' : 'Email Pending Verification'}
              </span>
              <span aria-hidden="true">·</span>
              <span
                className={
                  isPremium ? 'text-amber-700 font-semibold' : 'text-purple-950/65'
                }
              >
                {isPremium ? 'Confirmed Premium' : 'Free Membership'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <InstallAppButton
            variant="subtle"
            hideWhenStandalone
            onOpenGuide={() => onNavigate('install')}
          />
          {!isPremium && (
            <button
              type="button"
              onClick={() => onNavigate('premium')}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-gradient-to-r from-[#6B21A8] to-[#DB2777] text-white text-sm font-semibold inline-flex items-center gap-1.5"
            >
              <Crown className="w-4 h-4" />
              <span>View Membership</span>
            </button>
          )}
          <button
            type="button"
            onClick={async () => {
              await logout();
              onNavigate('home');
            }}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-purple-950/20 hover:bg-purple-50 text-sm font-semibold text-[#2E1065] inline-flex items-center gap-1.5"
          >
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </button>
        </div>
      </section>

      {error && (
        <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-xl p-3">
          {error}
        </p>
      )}
      {saveMessage && (
        <p className="text-sm text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{saveMessage}</span>
        </p>
      )}

      {/* Verification Quick Action */}
      {!user.emailVerified && (
        <section className="bg-amber-50 rounded-2xl border border-amber-200 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <UserCheck className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <h2 className="text-sm font-bold text-amber-950">
                Email Verification Required for Messaging
              </h2>
              <p className="text-xs text-amber-900 mt-0.5">
                Check your inbox ({privateProfile?.email || user.email}) for your verification link.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <button
              type="button"
              onClick={() =>
                resendVerificationEmail().then(() =>
                  setSaveMessage('Verification email sent.')
                )
              }
              className="min-h-[40px] px-3.5 py-1.5 rounded-lg bg-white border border-amber-300 text-xs font-semibold text-amber-950"
            >
              Resend Link
            </button>
            <button
              type="button"
              onClick={() => refreshVerificationState()}
              className="min-h-[40px] px-3.5 py-1.5 rounded-lg bg-amber-900 text-white text-xs font-semibold"
            >
              Refresh Status
            </button>
          </div>
        </section>
      )}

      {/* Edit Profile & Photo Form */}
      <form
        onSubmit={handleSaveProfile}
        className="bg-white rounded-2xl border border-purple-950/10 p-6 space-y-5"
      >
        <h2 className="text-xl font-bold text-[#2E1065]">
          Edit Profile & Privacy
        </h2>

        {/* Photo Upload */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 pb-5 border-b border-purple-950/10">
          <Avatar
            src={photoUrl}
            name={firstName || profile.firstName}
            size="lg"
            blueVerified={isBlueVerified}
          />
          <div className="flex-1">
            <label
              htmlFor="profile-photo-upload"
              className="inline-flex items-center gap-2 min-h-[42px] px-4 py-2 rounded-xl border border-purple-950/20 hover:bg-purple-50 text-sm font-semibold text-[#2E1065] cursor-pointer"
            >
              <Camera className="w-4 h-4" />
              <span>Change Profile Photo</span>
              <input
                id="profile-photo-upload"
                type="file"
                accept="image/*"
                onChange={handlePhotoSelect}
                className="sr-only"
              />
            </label>
            {uploadProgress !== null && (
              <p className="text-xs font-medium text-purple-700 mt-1.5 tabular-nums">
                Uploading photo: {uploadProgress}%
              </p>
            )}
            <p className="text-xs text-purple-950/60 mt-1.5">
              Photos are automatically resized and compressed for fast mobile loading.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="prof-first-name"
              className="block text-sm font-semibold text-[#2E1065] mb-1.5"
            >
              Public First Name
            </label>
            <input
              id="prof-first-name"
              type="text"
              required
              maxLength={50}
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-purple-950/20 px-3.5 text-sm"
            />
          </div>
          <div>
            <label
              htmlFor="prof-full-name"
              className="block text-sm font-semibold text-[#2E1065] mb-1.5"
            >
              Private Full Name (Only visible to you & admin)
            </label>
            <input
              id="prof-full-name"
              type="text"
              maxLength={100}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-purple-950/20 px-3.5 text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label
              htmlFor="prof-country"
              className="block text-sm font-semibold text-[#2E1065] mb-1.5"
            >
              Country
            </label>
            <input
              id="prof-country"
              type="text"
              required
              maxLength={80}
              list="country-suggestions"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-purple-950/20 px-3.5 text-sm"
            />
            <datalist id="country-suggestions">
              {FEATURED_COUNTRIES.filter((c) => c !== 'Other').map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>

          <div>
            <label
              htmlFor="prof-city"
              className="block text-sm font-semibold text-[#2E1065] mb-1.5"
            >
              City
            </label>
            <input
              id="prof-city"
              type="text"
              required
              maxLength={80}
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-purple-950/20 px-3.5 text-sm"
            />
          </div>

          <div>
            <label
              htmlFor="prof-intention"
              className="block text-sm font-semibold text-[#2E1065] mb-1.5"
            >
              Intention
            </label>
            <select
              id="prof-intention"
              value={intention}
              onChange={(e) => setIntention(e.target.value as IntentionOption)}
              className="w-full min-h-[44px] rounded-xl border border-purple-950/20 px-3.5 text-sm bg-white"
            >
              <option value="dating">Dating & Love</option>
              <option value="friendship">Friendship</option>
              <option value="both">Both</option>
            </select>
          </div>
        </div>

        <div>
          <label
            htmlFor="prof-bio"
            className="block text-sm font-semibold text-[#2E1065] mb-1.5"
          >
            Biography
          </label>
          <textarea
            id="prof-bio"
            rows={3}
            maxLength={600}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            className="w-full rounded-xl border border-purple-950/20 px-3.5 py-2.5 text-sm"
          />
        </div>

        <div>
          <span className="block text-sm font-semibold text-[#2E1065] mb-2">
            Interests ({interests.length}/10)
          </span>
          <div className="flex flex-wrap gap-2">
            {POPULAR_INTERESTS.map((item) => {
              const selected = interests.includes(item);
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => toggleInterest(item)}
                  className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                    selected
                      ? 'bg-[#6B21A8] text-white border-[#6B21A8]'
                      : 'bg-white text-purple-950/80 border-purple-950/15 hover:border-purple-400'
                  }`}
                >
                  {item}
                </button>
              );
            })}
          </div>
        </div>

        {/* Visibility & Privacy Controls */}
        <div className="pt-4 border-t border-purple-950/10 space-y-4">
          <div>
            <label
              htmlFor="prof-visibility"
              className="block text-sm font-semibold text-[#2E1065] mb-1.5"
            >
              Profile Visibility
            </label>
            <select
              id="prof-visibility"
              value={visibility}
              onChange={(e) =>
                setVisibility(e.target.value as VisibilityOption)
              }
              className="w-full min-h-[44px] rounded-xl border border-purple-950/20 px-3.5 text-sm bg-white"
            >
              <option value="public">Public Discovery (Visible to registered members)</option>
              <option value="matches_only" disabled={!isPremium}>
                Matches Only {isPremium ? '(Active Premium Control)' : '(Locked — Confirmed Premium Only)'}
              </option>
              <option value="hidden">Hidden (Pause my profile from discovery)</option>
            </select>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-purple-50/70 border border-purple-950/10">
            <div className="flex items-center gap-3">
              <Zap className="w-5 h-5 text-purple-700 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-[#2E1065]">
                  Mobile Data Saver Mode
                </p>
                <p className="text-xs text-purple-950/70">
                  Reduces image downloads, compresses uploads tighter, and pauses animations on Android mobile connections.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={toggleDataSaver}
              className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-semibold shrink-0 transition-colors ${
                dataSaver
                  ? 'bg-[#2E1065] text-white'
                  : 'bg-white border border-purple-950/20 text-[#2E1065]'
              }`}
            >
              {dataSaver ? 'Data Saver: ON' : 'Data Saver: OFF'}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="min-h-[48px] px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#6B21A8] to-[#DB2777] hover:from-[#581C87] hover:to-[#BE185D] disabled:opacity-60 text-white font-semibold text-sm transition-colors"
        >
          {saving ? 'Saving Changes...' : 'Save Profile Changes'}
        </button>
      </form>

      {/* Compatibility Quiz (Basic 3 for Free, Full 6 for Premium) */}
      <section className="bg-white rounded-2xl border border-purple-950/10 p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold text-[#2E1065] flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-pink-600" />
              <span>Compatibility Quiz</span>
            </h2>
            <p className="text-xs text-purple-950/65 mt-0.5">
              {isPremium
                ? 'Premium unlocked: Answer all 6 dimensions for advanced compatibility matching.'
                : 'Free members can answer the 3 core compatibility questions. Upgrade to Premium for all 6 dimensions.'}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {COMPATIBILITY_QUESTIONS.map((q, idx) => {
            const locked = q.premiumOnly && !isPremium;
            return (
              <div
                key={q.id}
                className={`p-4 rounded-xl border ${
                  locked
                    ? 'bg-purple-50/40 border-purple-950/10 opacity-80'
                    : 'bg-white border-purple-950/15'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-bold uppercase tracking-wide text-purple-800">
                    {q.dimension}
                  </span>
                  {locked && (
                    <button
                      type="button"
                      onClick={() => onNavigate('premium')}
                      className="text-[11px] font-semibold text-pink-600 inline-flex items-center gap-1"
                    >
                      <Lock className="w-3 h-3" />
                      <span>Premium Only</span>
                    </button>
                  )}
                </div>
                <p className="text-sm font-semibold text-[#2E1065] mb-2.5">
                  {q.question}
                </p>
                <div className="flex flex-wrap gap-2">
                  {q.options.map((opt) => {
                    const active = quizAnswers[idx] === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        disabled={locked}
                        onClick={() =>
                          setQuizAnswers((prev) =>
                            prev.map((val, i) => (i === idx ? opt.value : val))
                          )
                        }
                        className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                          active
                            ? 'bg-[#2E1065] text-white border-[#2E1065]'
                            : 'bg-white text-purple-950/80 border-purple-950/15 hover:border-purple-400 disabled:hover:border-purple-950/15'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          disabled={savingQuiz}
          onClick={handleSaveQuiz}
          className="min-h-[44px] px-5 py-2 rounded-xl bg-[#2E1065] hover:bg-[#4C1D95] disabled:opacity-60 text-white text-sm font-semibold"
        >
          {savingQuiz ? 'Saving Quiz...' : 'Save Compatibility Answers'}
        </button>
      </section>

      {/* Premium Studio: Video Introduction & Private Photo Album */}
      <section className="bg-white rounded-2xl border border-purple-950/10 p-6 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-[#2E1065] flex items-center gap-2">
              <Crown className="w-5 h-5 text-amber-500" />
              <span>Video Introduction & Private Photo Album</span>
            </h2>
            <p className="text-xs text-purple-950/65 mt-0.5">
              Share a short video intro on your discovery card and up to 4 private photos exclusively for matched Premium members.
            </p>
          </div>
          {!isPremium && (
            <button
              type="button"
              onClick={() => onNavigate('premium')}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-gradient-to-r from-[#6B21A8] to-[#DB2777] text-white text-xs font-semibold shrink-0 inline-flex items-center gap-1.5"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Unlock Premium</span>
            </button>
          )}
        </div>

        {!isPremium ? (
          <div className="rounded-xl bg-purple-50/70 border border-purple-950/10 p-5 text-sm text-purple-950/80 flex items-center gap-3">
            <Lock className="w-5 h-5 text-purple-700 shrink-0" />
            <span>
              Video Introductions and Private Photo Albums are reserved for Confirmed Premium members. Contact us on the Membership page to upgrade.
            </span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Video Intro Manager */}
            <div className="rounded-xl border border-purple-950/15 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-[#2E1065] flex items-center gap-2">
                  <Film className="w-4 h-4 text-pink-600" />
                  <span>Video Introduction</span>
                </h3>
                {profile.videoIntroUrl && (
                  <button
                    type="button"
                    onClick={handleRemoveVideoIntro}
                    className="text-xs font-semibold text-red-700 hover:underline"
                  >
                    Remove
                  </button>
                )}
              </div>

              {profile.videoIntroUrl ? (
                <video
                  controls
                  preload="none"
                  playsInline
                  src={profile.videoIntroUrl}
                  className="w-full max-h-52 rounded-lg bg-black"
                />
              ) : (
                <p className="text-xs text-purple-950/65">
                  No video intro uploaded yet (max 10 MB MP4/WebM).
                </p>
              )}

              <label
                htmlFor="video-intro-upload"
                className="inline-flex items-center gap-2 min-h-[40px] px-3.5 py-2 rounded-xl border border-purple-950/20 hover:bg-purple-50 text-xs font-semibold text-[#2E1065] cursor-pointer"
              >
                <Film className="w-4 h-4" />
                <span>
                  {profile.videoIntroUrl ? 'Replace Video Intro' : 'Upload Video Intro'}
                </span>
                <input
                  id="video-intro-upload"
                  type="file"
                  accept="video/mp4,video/webm,video/*"
                  onChange={handleVideoIntroSelect}
                  className="sr-only"
                />
              </label>
              {videoUploadProgress !== null && (
                <p className="text-xs font-medium text-purple-700 tabular-nums">
                  Uploading video: {videoUploadProgress}%
                </p>
              )}
            </div>

            {/* Private Photo Album Manager */}
            <div className="rounded-xl border border-purple-950/15 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-[#2E1065] flex items-center gap-2">
                  <Images className="w-4 h-4 text-pink-600" />
                  <span>Private Photo Album ({albumPhotos.length}/4)</span>
                </h3>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {albumPhotos.map((url, idx) => (
                  <div
                    key={url}
                    className="relative aspect-square rounded-lg overflow-hidden bg-purple-100"
                  >
                    <img
                      src={url}
                      alt={`Private album ${idx + 1}`}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => handleDeleteAlbumPhoto(idx)}
                      aria-label={`Remove private photo ${idx + 1}`}
                      className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/70 text-white flex items-center justify-center"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                {albumPhotos.length < 4 && (
                  <label
                    htmlFor="private-album-upload"
                    className="aspect-square rounded-lg border-2 border-dashed border-purple-300 hover:border-purple-500 flex flex-col items-center justify-center text-xs font-semibold text-purple-800 cursor-pointer gap-1"
                  >
                    <Plus className="w-5 h-5" />
                    <span>Add Photo</span>
                    <input
                      id="private-album-upload"
                      type="file"
                      accept="image/*"
                      onChange={handleAddPrivateAlbumPhoto}
                      className="sr-only"
                    />
                  </label>
                )}
              </div>
              {albumUploadProgress !== null && (
                <p className="text-xs font-medium text-purple-700 tabular-nums">
                  Uploading private photo: {albumUploadProgress}%
                </p>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Blocked Members */}
      <section className="bg-white rounded-2xl border border-purple-950/10 p-6">
        <h2 className="text-lg font-bold text-[#2E1065] mb-3">
          Blocked Members ({myBlockDocs.length})
        </h2>
        {myBlockDocs.length === 0 ? (
          <p className="text-sm text-purple-950/65">
            You have not blocked any members.
          </p>
        ) : (
          <div className="divide-y divide-purple-950/10">
            {myBlockDocs.map((b) => (
              <div
                key={b.id}
                className="py-3 flex items-center justify-between gap-4"
              >
                <span className="text-sm font-medium text-[#2E1065]">
                  {blockedNames[b.blockedUid] || 'Member'}
                </span>
                <button
                  type="button"
                  onClick={() => unblockMember(b.id)}
                  className="min-h-[40px] px-3 py-1.5 rounded-lg border border-purple-950/20 text-xs font-semibold text-[#2E1065] hover:bg-purple-50"
                >
                  Unblock
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Account Deletion */}
      <section className="bg-white rounded-2xl border border-red-200 p-6">
        <div className="flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-red-700 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h2 className="text-lg font-bold text-red-950">Delete Account</h2>
            <p className="text-sm text-red-900/80 mt-1">
              Permanently remove your profile, private details, and login account. This action cannot be undone.
            </p>
            {!confirmDeleteOpen ? (
              <button
                type="button"
                onClick={() => setConfirmDeleteOpen(true)}
                className="mt-4 min-h-[44px] px-4 py-2 rounded-xl border border-red-300 text-red-800 hover:bg-red-50 text-sm font-semibold inline-flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete My Account</span>
              </button>
            ) : (
              <div className="mt-4 p-4 rounded-xl bg-red-50 border border-red-200 space-y-3">
                <p className="text-xs font-semibold text-red-950">
                  Type DELETE below to confirm permanent account removal:
                </p>
                <input
                  type="text"
                  value={deleteInput}
                  onChange={(e) => setDeleteInput(e.target.value)}
                  placeholder="Type DELETE"
                  className="w-full max-w-xs min-h-[42px] rounded-lg border border-red-300 px-3 text-sm bg-white"
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={
                      deleting || deleteInput.trim().toUpperCase() !== 'DELETE'
                    }
                    onClick={handleDeleteAccount}
                    className="min-h-[42px] px-4 py-2 rounded-lg bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white text-xs font-semibold"
                  >
                    {deleting ? 'Deleting...' : 'Confirm Permanent Deletion'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmDeleteOpen(false);
                      setDeleteInput('');
                    }}
                    className="min-h-[42px] px-4 py-2 rounded-lg border border-red-300 text-xs font-semibold text-red-900 bg-white"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
