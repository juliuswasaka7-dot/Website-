import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  Crown,
  Eye,
  Film,
  Images,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserX,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  adminModerateProfileContent,
  adminSetBlueTick,
  adminSubscribeAllProfiles,
  adminSubscribeAllReports,
  adminSubscribeFreeMemberships,
  adminSubscribePremiumMemberships,
  adminSyncCommunityStats,
  adminUpdateMemberAccountStatus,
  adminUpdateMembershipTier,
  adminUpdateReportStatus,
} from '../services/datingService';
import type {
  FreeMembershipRecord,
  PremiumMembershipRecord,
  PublicProfile,
  SafetyReport,
} from '../types/app';
import { Avatar } from './Avatar';
import { BlueTickBadge, GoldPremiumBadge, MemberBadges } from './MemberBadges';

type AdminTab = 'verification' | 'memberships' | 'reports';

export function AdminDashboardView() {
  const { user, isAdmin } = useAuth();
  const [members, setMembers] = useState<PublicProfile[]>([]);
  const [freeRecords, setFreeRecords] = useState<FreeMembershipRecord[]>([]);
  const [premiumRecords, setPremiumRecords] = useState<PremiumMembershipRecord[]>([]);
  const [reports, setReports] = useState<SafetyReport[]>([]);
  const [tab, setTab] = useState<AdminTab>('verification');
  const [search, setSearch] = useState('');
  const [membershipFilter, setMembershipFilter] = useState<'all' | 'free' | 'premium'>('all');
  const [verificationFilter, setVerificationFilter] = useState<'all' | 'verified' | 'unverified'>('all');
  const [selectedMemberUid, setSelectedMemberUid] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncingStats, setSyncingStats] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    const unsubMembers = adminSubscribeAllProfiles(
      (list) => setMembers(list),
      (err) => setError(err.message)
    );
    const unsubFree = adminSubscribeFreeMemberships(
      (list) => setFreeRecords(list),
      () => {}
    );
    const unsubPremium = adminSubscribePremiumMemberships(
      (list) => setPremiumRecords(list),
      () => {}
    );
    const unsubReports = adminSubscribeAllReports(
      (list) => setReports(list),
      (err) => setError(err.message)
    );
    return () => {
      unsubMembers();
      unsubFree();
      unsubPremium();
      unsubReports();
    };
  }, [isAdmin]);

  const selectedMember = useMemo(
    () => members.find((m) => m.uid === selectedMemberUid) || null,
    [members, selectedMemberUid]
  );

  if (!isAdmin || !user) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 pb-24">
        <div className="bg-red-50 rounded-2xl border border-red-200 p-8 text-center">
          <ShieldAlert className="w-10 h-10 text-red-700 mx-auto mb-3" />
          <h1 className="text-xl font-bold text-red-950">
            Administrator Access Required
          </h1>
          <p className="text-sm text-red-800 mt-1">
            This moderation workspace is restricted to verified administrators only.
          </p>
        </div>
      </div>
    );
  }

  const filteredMembers = members.filter((m) => {
    if (tab === 'verification') {
      if (verificationFilter === 'verified' && !m.blueVerified) return false;
      if (verificationFilter === 'unverified' && m.blueVerified) return false;
    }
    if (tab === 'memberships') {
      if (membershipFilter === 'free' && m.membershipTier === 'premium') return false;
      if (membershipFilter === 'premium' && m.membershipTier !== 'premium') return false;
    }
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      m.firstName.toLowerCase().includes(q) ||
      m.country.toLowerCase().includes(q) ||
      m.city.toLowerCase().includes(q) ||
      m.uid.toLowerCase().includes(q)
    );
  });

  const openReportsCount = reports.filter((r) => r.status === 'open').length;
  const blueVerifiedCount = members.filter((m) => Boolean(m.blueVerified)).length;
  const premiumMembersCount = members.filter(
    (m) => m.membershipTier === 'premium'
  ).length;
  const freeMembersCount = members.length - premiumMembersCount;

  const handleSetBlueTick = async (m: PublicProfile, verified: boolean) => {
    setBusyId(m.uid);
    setNotice(null);
    setError(null);
    try {
      await adminSetBlueTick(m.uid, verified);
      setNotice(
        verified
          ? `Blue Tick granted to ${m.firstName}. It is now visible across the website.`
          : `Blue Tick removed from ${m.firstName}.`
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not update Blue Tick status.'
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleSetMembership = async (
    m: PublicProfile,
    nextTier: 'free' | 'premium'
  ) => {
    setBusyId(m.uid);
    setNotice(null);
    setError(null);
    try {
      await adminUpdateMembershipTier(m.uid, nextTier, user.uid);
      setNotice(
        nextTier === 'premium'
          ? `${m.firstName} upgraded to Confirmed Premium Membership.`
          : `${m.firstName} downgraded to Free Membership.`
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not update membership tier.'
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleSuspend = async (m: PublicProfile) => {
    const next = m.accountStatus === 'active' ? 'suspended' : 'active';
    setBusyId(m.uid);
    setNotice(null);
    setError(null);
    try {
      await adminUpdateMemberAccountStatus(m.uid, next);
      setNotice(
        `${m.firstName}'s account is now ${next === 'active' ? 'active' : 'suspended'}.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Status update failed.');
    } finally {
      setBusyId(null);
    }
  };

  const handleRemovePhoto = async (m: PublicProfile) => {
    setBusyId(m.uid);
    setNotice(null);
    setError(null);
    try {
      await adminModerateProfileContent(m.uid, { photoUrl: '' });
      setNotice(`Removed profile photo for ${m.firstName}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Photo moderation failed.');
    } finally {
      setBusyId(null);
    }
  };

  const handleResolveReport = async (
    report: SafetyReport,
    status: 'reviewed' | 'resolved'
  ) => {
    setBusyId(report.id);
    setError(null);
    try {
      await adminUpdateReportStatus(
        report.id,
        status,
        `Updated to ${status} by administrator`
      );
      setNotice(`Report marked as ${status}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Report update failed.');
    } finally {
      setBusyId(null);
    }
  };

  const handleSyncStats = async () => {
    setSyncingStats(true);
    try {
      await adminSyncCommunityStats();
      setNotice('Homepage community statistics synced with live database.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Stats sync failed.');
    } finally {
      setSyncingStats(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 pb-24 md:pb-16 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-pink-600 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4" />
            <span>Administrator Control Console</span>
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#2E1065] mt-1">
            FIND YOUR LOVE — Admin Dashboard
          </h1>
        </div>
        <button
          type="button"
          disabled={syncingStats}
          onClick={handleSyncStats}
          className="min-h-[44px] px-4 py-2 rounded-xl border border-purple-950/20 bg-white hover:bg-purple-50 text-sm font-semibold text-[#2E1065] inline-flex items-center gap-2 self-start"
        >
          <RefreshCw className={`w-4 h-4 ${syncingStats ? 'animate-spin' : ''}`} />
          <span>Sync Community Stats</span>
        </button>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        <div className="bg-white rounded-2xl border border-purple-950/10 p-4 sm:p-5">
          <p className="text-xs text-purple-950/60 font-medium">
            Total Members
          </p>
          <p className="text-2xl font-bold text-[#2E1065] tabular-nums mt-1">
            {members.length}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-sky-200 p-4 sm:p-5">
          <p className="text-xs text-sky-900/75 font-medium">
            Blue Tick Verified
          </p>
          <p className="text-2xl font-bold text-[#1D9BF0] tabular-nums mt-1">
            {blueVerifiedCount}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-amber-200 p-4 sm:p-5">
          <p className="text-xs text-amber-900/75 font-medium">
            Premium Accounts
          </p>
          <p className="text-2xl font-bold text-amber-700 tabular-nums mt-1">
            {premiumMembersCount}
          </p>
          <p className="text-[11px] text-purple-950/50 tabular-nums">
            DB records: {premiumRecords.length}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-purple-950/10 p-4 sm:p-5">
          <p className="text-xs text-purple-950/60 font-medium">
            Free Accounts
          </p>
          <p className="text-2xl font-bold text-[#2E1065] tabular-nums mt-1">
            {freeMembersCount}
          </p>
          <p className="text-[11px] text-purple-950/50 tabular-nums">
            DB records: {freeRecords.length}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-purple-950/10 p-4 sm:p-5 col-span-2 lg:col-span-1">
          <p className="text-xs text-purple-950/60 font-medium">
            Open Safety Reports
          </p>
          <p className="text-2xl font-bold text-red-700 tabular-nums mt-1">
            {openReportsCount}
          </p>
        </div>
      </div>

      {notice && (
        <p
          role="status"
          className="text-sm text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-2"
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{notice}</span>
        </p>
      )}
      {error && (
        <p className="text-sm text-red-900 bg-red-50 border border-red-200 rounded-xl p-3">
          {error}
        </p>
      )}

      {/* Primary Section Tabs */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setTab('verification')}
          className={`min-h-[42px] px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2 ${
            tab === 'verification'
              ? 'bg-[#2E1065] text-white'
              : 'bg-white border border-purple-950/15 text-[#2E1065]'
          }`}
        >
          <BadgeCheck className="w-4 h-4" />
          <span>Verification Management ({blueVerifiedCount})</span>
        </button>
        <button
          type="button"
          onClick={() => setTab('memberships')}
          className={`min-h-[42px] px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2 ${
            tab === 'memberships'
              ? 'bg-[#2E1065] text-white'
              : 'bg-white border border-purple-950/15 text-[#2E1065]'
          }`}
        >
          <Crown className="w-4 h-4" />
          <span>Membership Management ({premiumMembersCount} Premium)</span>
        </button>
        <button
          type="button"
          onClick={() => setTab('reports')}
          className={`min-h-[42px] px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2 ${
            tab === 'reports'
              ? 'bg-[#2E1065] text-white'
              : 'bg-white border border-purple-950/15 text-[#2E1065]'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          <span>Safety Reports ({reports.length})</span>
        </button>
      </div>

      {tab === 'verification' && (
        <section className="bg-white rounded-2xl border border-purple-950/10 p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-purple-950/10">
            <div>
              <h2 className="text-lg font-bold text-[#2E1065]">
                Verification Management
              </h2>
              <p className="text-xs text-purple-950/65 mt-0.5">
                Inspect any member&apos;s profile and grant or remove their official Blue Tick badge. Changes update instantly across the website.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'verified', label: 'Blue Verified' },
                  { id: 'unverified', label: 'Not Verified' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setVerificationFilter(f.id)}
                  className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-semibold ${
                    verificationFilter === f.id
                      ? 'bg-[#1D9BF0] text-white'
                      : 'bg-purple-50 text-[#2E1065] hover:bg-purple-100'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by first name, country, city, or user ID..."
            className="w-full max-w-md min-h-[44px] rounded-xl border border-purple-950/20 px-3.5 text-sm"
          />

          <div className="divide-y divide-purple-950/10">
            {filteredMembers.map((m) => {
              const busy = busyId === m.uid;
              const isBlue = Boolean(m.blueVerified);
              return (
                <div
                  key={m.uid}
                  className="py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <Avatar
                      src={m.photoUrl}
                      name={m.firstName}
                      size="md"
                      blueVerified={isBlue}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="font-bold text-sm text-[#2E1065] truncate">
                          {m.firstName}, <span className="tabular-nums">{m.age}</span> ·{' '}
                          {m.city}, {m.country}
                        </p>
                        <MemberBadges
                          blueVerified={isBlue}
                          membershipTier={m.membershipTier}
                          size="xs"
                        />
                      </div>
                      <p className="text-xs text-purple-950/65 mt-0.5">
                        Verification:{' '}
                        <strong className={isBlue ? 'text-[#1D9BF0]' : 'text-purple-950/70'}>
                          {isBlue ? 'Blue Tick Active' : 'Not Blue Verified'}
                        </strong>{' '}
                        · Account: <strong>{m.accountStatus}</strong> ·{' '}
                        {m.emailVerified ? 'Email Confirmed' : 'Email Pending'}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setSelectedMemberUid(m.uid)}
                      className="min-h-[40px] px-3 py-1.5 rounded-lg border border-purple-950/20 bg-white hover:bg-purple-50 text-xs font-semibold text-[#2E1065] inline-flex items-center gap-1.5"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>View Profile</span>
                    </button>

                    <button
                      type="button"
                      disabled={busy || isBlue}
                      onClick={() => handleSetBlueTick(m, true)}
                      className="min-h-[40px] px-3.5 py-1.5 rounded-lg bg-[#1D9BF0] hover:bg-[#1A8CD8] disabled:opacity-45 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                    >
                      <BadgeCheck className="w-3.5 h-3.5" />
                      <span>Give Blue Tick</span>
                    </button>

                    <button
                      type="button"
                      disabled={busy || !isBlue}
                      onClick={() => handleSetBlueTick(m, false)}
                      className="min-h-[40px] px-3.5 py-1.5 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 disabled:opacity-45 text-red-800 text-xs font-semibold inline-flex items-center gap-1.5"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Remove Blue Tick</span>
                    </button>
                  </div>
                </div>
              );
            })}
            {filteredMembers.length === 0 && (
              <p className="py-8 text-center text-sm text-purple-950/60">
                No members match that search or filter.
              </p>
            )}
          </div>
        </section>
      )}

      {tab === 'memberships' && (
        <section className="bg-white rounded-2xl border border-purple-950/10 p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-purple-950/10">
            <div>
              <h2 className="text-lg font-bold text-[#2E1065]">
                Membership Management
              </h2>
              <p className="text-xs text-purple-950/65 mt-0.5">
                Free and Premium memberships are stored in separate collections. Upgrade or downgrade accounts here with immediate effect.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { id: 'all', label: 'All Members' },
                  { id: 'free', label: `Free (${freeMembersCount})` },
                  { id: 'premium', label: `Premium (${premiumMembersCount})` },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setMembershipFilter(f.id)}
                  className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-semibold ${
                    membershipFilter === f.id
                      ? 'bg-[#2E1065] text-white'
                      : 'bg-purple-50 text-[#2E1065] hover:bg-purple-100'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by first name, country, city, or user ID..."
            className="w-full max-w-md min-h-[44px] rounded-xl border border-purple-950/20 px-3.5 text-sm"
          />

          <div className="divide-y divide-purple-950/10">
            {filteredMembers.map((m) => {
              const busy = busyId === m.uid;
              const isPremium = m.membershipTier === 'premium';
              return (
                <div
                  key={m.uid}
                  className="py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <Avatar
                      src={m.photoUrl}
                      name={m.firstName}
                      size="md"
                      blueVerified={Boolean(m.blueVerified)}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="font-bold text-sm text-[#2E1065] truncate">
                          {m.firstName}, <span className="tabular-nums">{m.age}</span> ·{' '}
                          {m.city}, {m.country}
                        </p>
                        {m.blueVerified && <BlueTickBadge size="xs" />}
                        {isPremium && <GoldPremiumBadge size="xs" />}
                      </div>
                      <p className="text-xs text-purple-950/65 mt-0.5">
                        Membership Status:{' '}
                        <strong
                          className={
                            isPremium ? 'text-amber-700' : 'text-purple-950'
                          }
                        >
                          {isPremium ? 'Premium Member (Gold Badge)' : 'Free Member'}
                        </strong>{' '}
                        · Account:{' '}
                        <strong
                          className={
                            m.accountStatus === 'active'
                              ? 'text-emerald-700'
                              : 'text-red-700'
                          }
                        >
                          {m.accountStatus}
                        </strong>
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setSelectedMemberUid(m.uid)}
                      className="min-h-[40px] px-3 py-1.5 rounded-lg border border-purple-950/20 bg-white hover:bg-purple-50 text-xs font-semibold text-[#2E1065] inline-flex items-center gap-1.5"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>View Profile</span>
                    </button>

                    {isPremium ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleSetMembership(m, 'free')}
                        className="min-h-[40px] px-3 py-1.5 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-950 text-xs font-semibold inline-flex items-center gap-1.5"
                      >
                        <Crown className="w-3.5 h-3.5" />
                        <span>Downgrade to Free</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleSetMembership(m, 'premium')}
                        className="min-h-[40px] px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-[#2E1065] text-xs font-bold inline-flex items-center gap-1.5"
                      >
                        <Crown className="w-3.5 h-3.5" />
                        <span>Upgrade to Premium</span>
                      </button>
                    )}

                    {m.photoUrl && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleRemovePhoto(m)}
                        className="min-h-[40px] px-3 py-1.5 rounded-lg border border-purple-950/20 hover:bg-purple-50 text-xs font-semibold text-[#2E1065] inline-flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Remove Photo</span>
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleToggleSuspend(m)}
                      className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 ${
                        m.accountStatus === 'active'
                          ? 'bg-red-50 border border-red-200 text-red-800 hover:bg-red-100'
                          : 'bg-emerald-50 border border-emerald-200 text-emerald-800 hover:bg-emerald-100'
                      }`}
                    >
                      {m.accountStatus === 'active' ? (
                        <>
                          <UserX className="w-3.5 h-3.5" />
                          <span>Suspend</span>
                        </>
                      ) : (
                        <>
                          <UserCheck className="w-3.5 h-3.5" />
                          <span>Restore</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
            {filteredMembers.length === 0 && (
              <p className="py-8 text-center text-sm text-purple-950/60">
                No members match that search.
              </p>
            )}
          </div>
        </section>
      )}

      {tab === 'reports' && (
        <section className="bg-white rounded-2xl border border-purple-950/10 p-5">
          {reports.length === 0 ? (
            <p className="py-8 text-center text-sm text-purple-950/60">
              No safety reports submitted yet.
            </p>
          ) : (
            <div className="divide-y divide-purple-950/10">
              {reports.map((r) => {
                const reportedMember = members.find(
                  (m) => m.uid === r.reportedUid
                );
                const busy = busyId === r.id;
                return (
                  <div
                    key={r.id}
                    className="py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs font-semibold">
                        <AlertTriangle className="w-4 h-4 text-amber-700" />
                        <span className="text-[#2E1065]">
                          {r.category} · {r.contextType}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span
                          className={
                            r.status === 'open'
                              ? 'text-red-700'
                              : r.status === 'reviewed'
                                ? 'text-amber-700'
                                : 'text-emerald-700'
                          }
                        >
                          {r.status}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-[#2E1065]">
                        Reported Member:{' '}
                        {reportedMember
                          ? `${reportedMember.firstName} (${reportedMember.city}, ${reportedMember.country})`
                          : r.reportedUid}
                      </p>
                      <p className="text-sm text-purple-950/80">{r.details}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {reportedMember && (
                        <button
                          type="button"
                          onClick={() => setSelectedMemberUid(reportedMember.uid)}
                          className="min-h-[40px] px-3 py-1.5 rounded-lg border border-purple-950/20 text-xs font-semibold text-[#2E1065]"
                        >
                          View Profile
                        </button>
                      )}
                      {reportedMember &&
                        reportedMember.accountStatus === 'active' && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleToggleSuspend(reportedMember)}
                            className="min-h-[40px] px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold"
                          >
                            Suspend Account
                          </button>
                        )}
                      {r.status !== 'reviewed' && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleResolveReport(r, 'reviewed')}
                          className="min-h-[40px] px-3 py-1.5 rounded-lg border border-purple-950/20 text-xs font-semibold text-[#2E1065]"
                        >
                          Mark Reviewed
                        </button>
                      )}
                      {r.status !== 'resolved' && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleResolveReport(r, 'resolved')}
                          className="min-h-[40px] px-3 py-1.5 rounded-lg bg-[#2E1065] text-white text-xs font-semibold"
                        >
                          Resolve
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Member Profile Viewer Modal (Admin Inspection) */}
      {selectedMember && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${selectedMember.firstName} Profile`}
          className="fixed inset-0 z-50 bg-[#1A0A26]/75 flex items-center justify-center p-4 overflow-y-auto"
        >
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 border border-purple-950/15 shadow-xl my-auto space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-4">
                <Avatar
                  src={selectedMember.photoUrl}
                  name={selectedMember.firstName}
                  size="lg"
                  blueVerified={Boolean(selectedMember.blueVerified)}
                />
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-xl font-bold text-[#2E1065]">
                      {selectedMember.firstName},{' '}
                      <span className="tabular-nums">{selectedMember.age}</span>
                    </h2>
                    <MemberBadges
                      blueVerified={selectedMember.blueVerified}
                      membershipTier={selectedMember.membershipTier}
                    />
                  </div>
                  <p className="text-sm text-purple-950/75 mt-0.5">
                    {selectedMember.city}, {selectedMember.country} ·{' '}
                    {selectedMember.gender}
                  </p>
                  <p className="text-xs text-purple-950/55 mt-0.5 font-mono">
                    ID: {selectedMember.uid}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedMemberUid(null)}
                aria-label="Close member profile"
                className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-purple-950/60 hover:bg-purple-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="rounded-xl bg-purple-50/80 p-3">
                <p className="text-purple-950/60">Blue Tick</p>
                <p className="font-bold text-[#2E1065] mt-0.5">
                  {selectedMember.blueVerified ? 'Verified' : 'Not Verified'}
                </p>
              </div>
              <div className="rounded-xl bg-purple-50/80 p-3">
                <p className="text-purple-950/60">Membership</p>
                <p className="font-bold text-[#2E1065] mt-0.5">
                  {selectedMember.membershipTier === 'premium'
                    ? 'Premium (Confirmed)'
                    : 'Free'}
                </p>
              </div>
              <div className="rounded-xl bg-purple-50/80 p-3">
                <p className="text-purple-950/60">Account</p>
                <p className="font-bold text-[#2E1065] mt-0.5 capitalize">
                  {selectedMember.accountStatus}
                </p>
              </div>
              <div className="rounded-xl bg-purple-50/80 p-3">
                <p className="text-purple-950/60">Visibility</p>
                <p className="font-bold text-[#2E1065] mt-0.5">
                  {selectedMember.visibility}
                </p>
              </div>
            </div>

            <div className="space-y-3 text-sm">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wide text-purple-950/55">
                  Intention & Bio
                </h3>
                <p className="text-xs font-semibold text-purple-800 mt-1">
                  Looking for: {selectedMember.intention}
                </p>
                <p className="text-purple-950/85 mt-1 leading-relaxed">
                  {selectedMember.bio || 'No biography written yet.'}
                </p>
              </div>

              {selectedMember.interests.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wide text-purple-950/55 mb-1.5">
                    Interests
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedMember.interests.map((item) => (
                      <span
                        key={item}
                        className="px-2.5 py-1 rounded-lg bg-purple-50 text-xs font-medium text-[#2E1065]"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-4 text-xs text-purple-950/70 pt-1">
                <span className="inline-flex items-center gap-1.5">
                  <Film className="w-3.5 h-3.5 text-purple-700" />
                  <span>
                    Video Intro:{' '}
                    {selectedMember.videoIntroUrl ? 'Uploaded' : 'None'}
                  </span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Images className="w-3.5 h-3.5 text-purple-700" />
                  <span>
                    Private Album Photos:{' '}
                    {selectedMember.privateAlbumCount || 0}
                  </span>
                </span>
              </div>

              {selectedMember.videoIntroUrl && (
                <video
                  controls
                  preload="none"
                  playsInline
                  src={selectedMember.videoIntroUrl}
                  className="w-full max-h-60 rounded-xl bg-black"
                />
              )}
            </div>

            {/* Admin Actions inside Profile Viewer */}
            <div className="pt-4 border-t border-purple-950/10 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busyId === selectedMember.uid || Boolean(selectedMember.blueVerified)}
                onClick={() => handleSetBlueTick(selectedMember, true)}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-[#1D9BF0] hover:bg-[#1A8CD8] disabled:opacity-45 text-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <BadgeCheck className="w-4 h-4" />
                <span>Give Blue Tick</span>
              </button>

              <button
                type="button"
                disabled={busyId === selectedMember.uid || !selectedMember.blueVerified}
                onClick={() => handleSetBlueTick(selectedMember, false)}
                className="min-h-[42px] px-4 py-2 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 disabled:opacity-45 text-red-800 text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <X className="w-4 h-4" />
                <span>Remove Blue Tick</span>
              </button>

              {selectedMember.membershipTier === 'premium' ? (
                <button
                  type="button"
                  disabled={busyId === selectedMember.uid}
                  onClick={() => handleSetMembership(selectedMember, 'free')}
                  className="min-h-[42px] px-4 py-2 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-950 text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <Crown className="w-4 h-4" />
                  <span>Downgrade to Free</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busyId === selectedMember.uid}
                  onClick={() => handleSetMembership(selectedMember, 'premium')}
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 text-[#2E1065] text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <Crown className="w-4 h-4" />
                  <span>Upgrade to Premium</span>
                </button>
              )}

              <button
                type="button"
                disabled={busyId === selectedMember.uid}
                onClick={() => handleToggleSuspend(selectedMember)}
                className="min-h-[42px] px-4 py-2 rounded-xl border border-purple-950/20 text-xs font-semibold text-[#2E1065]"
              >
                {selectedMember.accountStatus === 'active'
                  ? 'Suspend Account'
                  : 'Restore Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
