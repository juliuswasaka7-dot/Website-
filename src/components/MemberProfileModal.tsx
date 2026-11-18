import {
  Film,
  Flag,
  Heart,
  Image as ImageIcon,
  MapPin,
  ShieldBan,
  Sparkles,
  X,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useDataSaver } from '../context/DataSaverContext';
import type { PublicProfile } from '../types/app';
import { Avatar } from './Avatar';
import { MemberBadges } from './MemberBadges';

interface MemberProfileModalProps {
  member: PublicProfile;
  matchScore?: number;
  onClose: () => void;
  onLike?: () => void;
  onPass?: () => void;
  onReport?: () => void;
  onBlock?: () => void;
  actionBusy?: boolean;
  extraActions?: ReactNode;
}

export function MemberProfileModal({
  member,
  matchScore,
  onClose,
  onLike,
  onPass,
  onReport,
  onBlock,
  actionBusy = false,
  extraActions,
}: MemberProfileModalProps) {
  const { dataSaver } = useDataSaver();
  const [coverFailed, setCoverFailed] = useState(false);
  const [manualCoverLoaded, setManualCoverLoaded] = useState(false);

  useEffect(() => {
    setCoverFailed(false);
    setManualCoverLoaded(false);
  }, [member.coverUrl]);

  const hasCover = Boolean(member.coverUrl) && !coverFailed;
  const deferCover = hasCover && dataSaver && !manualCoverLoaded;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${member.firstName} Full Profile`}
      onClick={onClose}
      className="fixed inset-0 z-50 bg-[#1A0A26]/75 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-3xl max-w-xl w-full overflow-hidden border border-purple-950/15 shadow-xl my-auto max-h-[92dvh] flex flex-col"
      >
        <div className="overflow-y-auto flex-1">
          {/* Profile Cover Hero Banner */}
          <div className="relative h-36 sm:h-48 w-full bg-gradient-to-br from-[#2E1065] via-[#6B21A8] to-[#DB2777] overflow-hidden">
            {deferCover ? (
              <div className="w-full h-full flex flex-col items-center justify-center text-white bg-purple-950/60 p-4">
                <button
                  type="button"
                  onClick={() => setManualCoverLoaded(true)}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-xs font-semibold text-white inline-flex items-center gap-1.5"
                >
                  <ImageIcon className="w-4 h-4" />
                  <span>Load Cover Photo</span>
                </button>
              </div>
            ) : hasCover ? (
              <img
                src={member.coverUrl}
                alt={`${member.firstName} profile cover`}
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                onError={() => setCoverFailed(true)}
                className="w-full h-full object-cover"
              />
            ) : (
              <div
                aria-hidden="true"
                className="w-full h-full opacity-35 bg-[radial-gradient(circle_at_20%_25%,#ffffff40,transparent_45%),radial-gradient(circle_at_80%_75%,#f472b660,transparent_50%)]"
              />
            )}

            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/45 to-transparent" />

            {typeof matchScore === 'number' && (
              <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-black/60 text-white text-xs font-bold tabular-nums inline-flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-pink-300" />
                <span>{matchScore}% Match</span>
              </span>
            )}

            <button
              type="button"
              onClick={onClose}
              aria-label="Close member profile"
              className="absolute top-3 right-3 min-h-[40px] min-w-[40px] rounded-full bg-black/55 hover:bg-black/75 text-white flex items-center justify-center"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Profile Info Overlapping Avatar */}
          <div className="px-5 sm:px-6 pb-6">
            <div className="-mt-12 sm:-mt-14 flex items-end justify-between gap-3 mb-4 relative z-10">
              <div className="p-1.5 rounded-2xl bg-white shadow-md">
                <Avatar
                  src={member.photoUrl}
                  name={member.firstName}
                  size="xl"
                  blueVerified={Boolean(member.blueVerified)}
                />
              </div>

              {(onReport || onBlock) && (
                <div className="flex items-center gap-1.5 pt-14">
                  {onReport && (
                    <button
                      type="button"
                      onClick={onReport}
                      title="Report member"
                      aria-label={`Report ${member.firstName}`}
                      className="min-h-[40px] min-w-[40px] rounded-xl border border-purple-950/15 flex items-center justify-center text-purple-950/60 hover:text-pink-700 hover:bg-pink-50"
                    >
                      <Flag className="w-4 h-4" />
                    </button>
                  )}
                  {onBlock && (
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={onBlock}
                      title="Block member"
                      aria-label={`Block ${member.firstName}`}
                      className="min-h-[40px] min-w-[40px] rounded-xl border border-purple-950/15 flex items-center justify-center text-purple-950/60 hover:text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      <ShieldBan className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-2xl font-bold text-[#2E1065]">
                    {member.firstName},{' '}
                    <span className="tabular-nums">{member.age}</span>
                  </h2>
                  <MemberBadges
                    blueVerified={member.blueVerified}
                    membershipTier={member.membershipTier}
                  />
                </div>
                <p className="text-sm text-purple-950/75 mt-1 flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-pink-600 shrink-0" />
                  <span>
                    {member.city}, {member.country}
                  </span>
                </p>
                <p className="text-xs font-semibold text-purple-800 mt-1.5">
                  {member.intention === 'dating'
                    ? 'Looking for Dating & Love'
                    : member.intention === 'friendship'
                      ? 'Looking for Friendship'
                      : 'Open to Friendship & Dating'}
                  {member.emailVerified ? ' · Verified Email' : ''}
                </p>
              </div>

              {member.bio && (
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wide text-purple-950/55 mb-1">
                    About {member.firstName}
                  </h3>
                  <p className="text-sm text-purple-950/85 leading-relaxed whitespace-pre-line">
                    {member.bio}
                  </p>
                </div>
              )}

              {member.interests.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wide text-purple-950/55 mb-2">
                    Interests
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {member.interests.map((item) => (
                      <span
                        key={item}
                        className="px-3 py-1 rounded-lg bg-purple-50 text-xs font-semibold text-[#2E1065]"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {member.videoIntroUrl && (
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wide text-purple-950/55 mb-1.5 flex items-center gap-1.5">
                    <Film className="w-3.5 h-3.5 text-pink-600" />
                    <span>Video Introduction</span>
                  </h3>
                  <video
                    controls
                    preload="none"
                    playsInline
                    src={member.videoIntroUrl}
                    className="w-full max-h-60 rounded-2xl bg-black"
                  />
                </div>
              )}

              {extraActions}
            </div>
          </div>
        </div>

        {(onPass || onLike) && (
          <div className="px-5 py-3.5 border-t border-purple-950/10 bg-purple-50/50 grid grid-cols-2 gap-3 shrink-0">
            {onPass && (
              <button
                type="button"
                disabled={actionBusy}
                onClick={onPass}
                className="min-h-[46px] rounded-xl border border-purple-950/20 bg-white hover:bg-purple-50 disabled:opacity-50 text-[#2E1065] text-sm font-semibold inline-flex items-center justify-center gap-1.5"
              >
                <X className="w-4 h-4" />
                <span>Pass</span>
              </button>
            )}
            {onLike && (
              <button
                type="button"
                disabled={actionBusy}
                onClick={onLike}
                className="min-h-[46px] rounded-xl bg-gradient-to-r from-[#6B21A8] to-[#DB2777] hover:from-[#581C87] hover:to-[#BE185D] disabled:opacity-50 text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5"
              >
                <Heart className="w-4 h-4" />
                <span>{actionBusy ? 'Saving...' : 'Like'}</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
