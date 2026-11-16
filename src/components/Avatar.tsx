import { BadgeCheck, Image as ImageIcon, User } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useDataSaver } from '../context/DataSaverContext';

interface AvatarProps {
  src?: string | null;
  name: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'card';
  respectDataSaver?: boolean;
  blueVerified?: boolean;
  className?: string;
}

export function Avatar({
  src,
  name,
  size = 'md',
  respectDataSaver = false,
  blueVerified = false,
  className = '',
}: AvatarProps) {
  const { dataSaver } = useDataSaver();
  const [failed, setFailed] = useState(false);
  const [manualLoaded, setManualLoaded] = useState(false);

  useEffect(() => {
    setFailed(false);
    setManualLoaded(false);
  }, [src]);

  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');

  const sizeClass =
    size === 'sm'
      ? 'w-9 h-9 text-xs rounded-full'
      : size === 'md'
        ? 'w-12 h-12 text-sm rounded-full'
        : size === 'lg'
          ? 'w-20 h-20 text-xl rounded-2xl'
          : size === 'xl'
            ? 'w-28 h-28 text-2xl rounded-2xl'
            : 'w-full h-full rounded-none';

  const shouldDeferForDataSaver =
    respectDataSaver && dataSaver && Boolean(src) && !manualLoaded;

  const badgeOverlay = blueVerified ? (
    <span
      title="Verified by Administrator"
      aria-label="Verified profile picture"
      className={`pointer-events-none absolute z-10 inline-flex items-center justify-center rounded-full bg-white shadow-sm ${
        size === 'card'
          ? 'bottom-2.5 right-2.5 p-0.5'
          : size === 'sm'
            ? '-bottom-0.5 -right-0.5'
            : '-bottom-1 -right-1 p-0.5'
      }`}
    >
      <BadgeCheck
        className={`fill-[#1D9BF0] text-white ${
          size === 'card'
            ? 'w-6 h-6'
            : size === 'sm'
              ? 'w-4 h-4'
              : 'w-4 h-4'
        }`}
      />
    </span>
  ) : null;

  let content;
  if (shouldDeferForDataSaver) {
    content = (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-purple-950 via-purple-900 to-pink-900 text-white p-4 text-center ${sizeClass} ${className}`}
      >
        <ImageIcon className="w-6 h-6 text-pink-200 mb-2" />
        <p className="text-xs font-medium text-purple-100 mb-2">
          Data Saver active
        </p>
        <button
          type="button"
          onClick={() => setManualLoaded(true)}
          className="min-h-[40px] px-4 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-xs font-semibold text-white transition-colors"
        >
          Load photo
        </button>
      </div>
    );
  } else if (!src || failed) {
    content = (
      <div
        aria-label={name}
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-purple-900 via-purple-800 to-pink-700 text-white font-semibold select-none ${sizeClass} ${className}`}
      >
        {initials ? (
          <span>{initials}</span>
        ) : (
          <User className="w-1/2 h-1/2 opacity-80" />
        )}
      </div>
    );
  } else {
    content = (
      <img
        src={src}
        alt={`${name} profile photo`}
        referrerPolicy="no-referrer"
        loading="lazy"
        decoding="async"
        fetchPriority={size === 'card' ? 'low' : 'auto'}
        onError={() => setFailed(true)}
        className={`object-cover bg-purple-950/10 ${sizeClass} ${className}`}
      />
    );
  }

  if (!blueVerified) {
    return content;
  }

  return (
    <div
      className={`relative shrink-0 ${
        size === 'card' ? 'w-full h-full' : 'inline-block'
      }`}
    >
      {content}
      {badgeOverlay}
    </div>
  );
}
