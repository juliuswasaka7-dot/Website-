export function BrandLogo({
  size = 'md',
  light = false,
}: {
  size?: 'sm' | 'md' | 'lg';
  light?: boolean;
}) {
  const iconSize = size === 'sm' ? 22 : size === 'lg' ? 32 : 26;
  const textClass =
    size === 'sm'
      ? 'text-base font-bold tracking-tight'
      : size === 'lg'
        ? 'text-2xl font-bold tracking-tight'
        : 'text-lg font-bold tracking-tight';

  return (
    <span className="inline-flex items-center gap-2.5 whitespace-nowrap shrink-0">
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 32 32"
        fill="none"
        aria-hidden="true"
        className="shrink-0"
      >
        <defs>
          <linearGradient id="fylHeartGrad" x1="2" y1="4" x2="30" y2="28" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#9333EA" />
            <stop offset="100%" stopColor="#EC4899" />
          </linearGradient>
        </defs>
        <path
          d="M16 28.2C15.5 28.2 15 28 14.6 27.6C7.8 21.8 3.5 17.5 3.5 11.7C3.5 7.4 6.8 4.2 10.9 4.2C13.2 4.2 15.1 5.3 16 6.8C16.9 5.3 18.8 4.2 21.1 4.2C25.2 4.2 28.5 7.4 28.5 11.7C28.5 17.5 24.2 21.8 17.4 27.6C17 28 16.5 28.2 16 28.2Z"
          fill="url(#fylHeartGrad)"
        />
        <path
          d="M11.5 13.5C13 11.5 19 11.5 20.5 13.5"
          stroke="#FFFFFF"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
      <span
        className={`${textClass} font-editorial ${
          light ? 'text-white' : 'text-[#2E1065]'
        }`}
      >
        FIND YOUR LOVE
      </span>
    </span>
  );
}
