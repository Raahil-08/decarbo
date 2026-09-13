interface DecarboLogoProps {
  size?: number;
  className?: string;
  withGlow?: boolean;
}

export function DecarboLogo({ size = 32, className = "", withGlow = true }: DecarboLogoProps) {
  return (
    <div
      className={`relative inline-flex items-center justify-center shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      {withGlow && (
        <div
          className="absolute inset-0 rounded-full bg-leaf/20 blur-md pointer-events-none -z-10 animate-pulse-glow"
          style={{ transform: "scale(1.2)" }}
        />
      )}
      <svg
        width={size}
        height={size}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full drop-shadow-sm"
      >
        <defs>
          <linearGradient id="decarbo-leaf-grad" x1="4" y1="4" x2="36" y2="36" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#3A9B6F" />
            <stop offset="100%" stopColor="#2D7A57" />
          </linearGradient>
          <linearGradient id="decarbo-brass-grad" x1="36" y1="4" x2="4" y2="36" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#C6923B" />
            <stop offset="100%" stopColor="#A97A2B" />
          </linearGradient>
          <radialGradient id="decarbo-core-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#3A9B6F" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#3A9B6F" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Ambient Core Glow */}
        <circle cx="20" cy="20" r="14" fill="url(#decarbo-core-glow)" />

        {/* Outer Hexagonal Carbon Lattice Ring */}
        <path
          d="M20 3.5L34.29 11.75V28.25L20 36.5L5.71 28.25V11.75L20 3.5Z"
          stroke="url(#decarbo-leaf-grad)"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="opacity-90"
        />

        {/* Minimalist Inner 'D' + Leaf Path */}
        <path
          d="M14 11V29M14 11H20.5C25.19 11 29 15.03 29 20C29 24.97 25.19 29 20.5 29H14"
          stroke="#F7F8FA"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Intersecting Decarbonisation Leaf Sweep */}
        <path
          d="M14 20C18.5 15 25.5 14 27.5 17C29.5 20 25.5 25.5 20 27"
          stroke="url(#decarbo-brass-grad)"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Precision Lattice Vertex Nodes */}
        <circle cx="20" cy="3.5" r="1.75" fill="#3A9B6F" />
        <circle cx="34.29" cy="11.75" r="1.75" fill="#A97A2B" />
        <circle cx="34.29" cy="28.25" r="1.75" fill="#3A9B6F" />
        <circle cx="20" cy="36.5" r="1.75" fill="#A97A2B" />
        <circle cx="5.71" cy="28.25" r="1.75" fill="#3A9B6F" />
        <circle cx="5.71" cy="11.75" r="1.75" fill="#A97A2B" />

        {/* Center Quantum Pulse Node */}
        <circle cx="20" cy="20" r="2" fill="#3A9B6F" />
      </svg>
    </div>
  );
}
