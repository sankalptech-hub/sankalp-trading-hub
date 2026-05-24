import { Link } from 'react-router-dom';

export const SphereLogoMark = ({ size = 44 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="ts-blue" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#60a5fa" />
        <stop offset="55%" stopColor="#3b82f6" />
        <stop offset="100%" stopColor="#1d4ed8" />
      </linearGradient>
      <linearGradient id="ts-blue-soft" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.85" />
        <stop offset="100%" stopColor="#1e40af" stopOpacity="0.85" />
      </linearGradient>
      <radialGradient id="ts-glow" cx="32" cy="32" r="30" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.35" />
        <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
      </radialGradient>
    </defs>
    <circle cx="32" cy="32" r="30" fill="url(#ts-glow)" />
    <circle cx="32" cy="32" r="22" stroke="url(#ts-blue-soft)" strokeWidth="1.5" fill="none" opacity="0.55" />
    <g>
      <line x1="20" y1="22" x2="20" y2="44" stroke="#00D68F" strokeWidth="1" />
      <line x1="27" y1="20" x2="27" y2="46" stroke="#00D68F" strokeWidth="1" />
      <line x1="34" y1="18" x2="34" y2="42" stroke="#FF5C5C" strokeWidth="1" />
      <line x1="41" y1="22" x2="41" y2="48" stroke="#00D68F" strokeWidth="1" />
      <line x1="46" y1="26" x2="46" y2="44" stroke="#00D68F" strokeWidth="1" />
      <rect x="17.5" y="28" width="5" height="10" rx="0.5" fill="#00D68F" />
      <rect x="24.5" y="24" width="5" height="14" rx="0.5" fill="#00D68F" />
      <rect x="31.5" y="22" width="5" height="14" rx="0.5" fill="#FF5C5C" />
      <rect x="38.5" y="26" width="5" height="16" rx="0.5" fill="#00D68F" />
      <rect x="43.5" y="30" width="5" height="10" rx="0.5" fill="#00D68F" />
    </g>
    <ellipse cx="32" cy="32" rx="26" ry="9" stroke="url(#ts-blue)" strokeWidth="2.5" fill="none" transform="rotate(-22 32 32)" />
    <path d="M9.5 27 Q 32 14 54.5 27" stroke="#93c5fd" strokeWidth="1.2" fill="none" opacity="0.85" strokeLinecap="round" />
  </svg>
);

export const TradeSphereLogo = ({ compact = false, size = 44 }: { compact?: boolean; size?: number }) => (
  <Link to="/" className="inline-flex items-center gap-3 group">
    <SphereLogoMark size={size} />
    {!compact && (
      <div className="flex flex-col leading-tight">
        <span className="text-[22px] font-extrabold tracking-tight">
          <span className="text-white">Trade</span>
          <span className="bg-gradient-to-br from-sky-400 via-blue-500 to-blue-700 bg-clip-text text-transparent">Sphere</span>
        </span>
        <span className="text-[10px] tracking-[0.18em] uppercase text-white/55 font-mono">
          Trade · Invest · Prosper
        </span>
      </div>
    )}
  </Link>
);

export default TradeSphereLogo;