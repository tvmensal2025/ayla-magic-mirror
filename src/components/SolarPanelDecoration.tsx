const SolarPanelSVG = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Panel frame */}
    <rect x="10" y="10" width="180" height="180" rx="8" stroke="currentColor" strokeWidth="3" fill="currentColor" fillOpacity="0.05" />
    {/* Grid lines horizontal */}
    <line x1="10" y1="70" x2="190" y2="70" stroke="currentColor" strokeWidth="1.5" />
    <line x1="10" y1="130" x2="190" y2="130" stroke="currentColor" strokeWidth="1.5" />
    {/* Grid lines vertical */}
    <line x1="70" y1="10" x2="70" y2="190" stroke="currentColor" strokeWidth="1.5" />
    <line x1="130" y1="10" x2="130" y2="190" stroke="currentColor" strokeWidth="1.5" />
    {/* Cell highlights */}
    <rect x="12" y="12" width="56" height="56" rx="2" fill="currentColor" fillOpacity="0.08" />
    <rect x="72" y="12" width="56" height="56" rx="2" fill="currentColor" fillOpacity="0.12" />
    <rect x="132" y="12" width="56" height="56" rx="2" fill="currentColor" fillOpacity="0.06" />
    <rect x="12" y="72" width="56" height="56" rx="2" fill="currentColor" fillOpacity="0.1" />
    <rect x="72" y="72" width="56" height="56" rx="2" fill="currentColor" fillOpacity="0.15" />
    <rect x="132" y="72" width="56" height="56" rx="2" fill="currentColor" fillOpacity="0.08" />
    <rect x="12" y="132" width="56" height="56" rx="2" fill="currentColor" fillOpacity="0.06" />
    <rect x="72" y="132" width="56" height="56" rx="2" fill="currentColor" fillOpacity="0.1" />
    <rect x="132" y="132" width="56" height="56" rx="2" fill="currentColor" fillOpacity="0.12" />
    {/* Diagonal shine lines */}
    <line x1="20" y1="20" x2="60" y2="60" stroke="currentColor" strokeWidth="0.5" strokeOpacity="0.3" />
    <line x1="80" y1="20" x2="120" y2="60" stroke="currentColor" strokeWidth="0.5" strokeOpacity="0.3" />
    <line x1="140" y1="80" x2="180" y2="120" stroke="currentColor" strokeWidth="0.5" strokeOpacity="0.3" />
  </svg>
);

const SunRaysSVG = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 300 300" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="150" cy="150" r="40" fill="currentColor" fillOpacity="0.1" />
    <circle cx="150" cy="150" r="60" stroke="currentColor" strokeWidth="1" strokeOpacity="0.08" />
    <circle cx="150" cy="150" r="90" stroke="currentColor" strokeWidth="0.8" strokeOpacity="0.05" />
    <circle cx="150" cy="150" r="130" stroke="currentColor" strokeWidth="0.5" strokeOpacity="0.03" />
    {/* Rays */}
    {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((angle) => (
      <line
        key={angle}
        x1={150 + 50 * Math.cos((angle * Math.PI) / 180)}
        y1={150 + 50 * Math.sin((angle * Math.PI) / 180)}
        x2={150 + 140 * Math.cos((angle * Math.PI) / 180)}
        y2={150 + 140 * Math.sin((angle * Math.PI) / 180)}
        stroke="currentColor"
        strokeWidth="1"
        strokeOpacity="0.06"
      />
    ))}
  </svg>
);

export { SolarPanelSVG, SunRaysSVG };
