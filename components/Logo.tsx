export function LogoMark({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 40" fill="none" role="img" aria-label="Apex Ops logo" className={className}>
      <rect width="36" height="36" rx="8" fill="#1E40AF" />
      <path d="M18 8L27 24H9L18 8Z" stroke="#60A5FA" strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx="18" cy="20" r="2.5" fill="#FFFFFF" />
      <path d="M12 28H24" stroke="#93C5FD" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ className = 'h-9 w-auto' }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 40" fill="none" role="img" aria-label="Apex Ops logo" className={className}>
      <rect width="36" height="36" rx="8" fill="#1E40AF" />
      <path d="M18 8L27 24H9L18 8Z" stroke="#60A5FA" strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx="18" cy="20" r="2.5" fill="#FFFFFF" />
      <path d="M12 28H24" stroke="#93C5FD" strokeWidth="2" strokeLinecap="round" />
      <text x="44" y="23" fontFamily="system-ui, sans-serif" fontWeight="700" fontSize="15" fill="#0F172A" letterSpacing="-0.02em">
        APEX<tspan fill="#2563EB">OPS</tspan>
      </text>
      <text x="44" y="32" fontFamily="system-ui, sans-serif" fontWeight="600" fontSize="8.5" fill="#64748B" letterSpacing="0.08em">
        FACILITY &amp; ASSETS
      </text>
    </svg>
  );
}
