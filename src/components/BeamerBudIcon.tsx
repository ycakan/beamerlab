import type { SVGProps } from "react";

export default function BeamerBudIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 64 64" role="img" aria-label="BeamerBud" {...props}>
      <defs>
        <linearGradient id="beamerbud-face" x1="14" x2="50" y1="12" y2="54">
          <stop stopColor="#34d399" />
          <stop offset="0.55" stopColor="#0f766e" />
          <stop offset="1" stopColor="#0f172a" />
        </linearGradient>
        <linearGradient id="beamerbud-visor" x1="18" x2="48" y1="27" y2="34">
          <stop stopColor="#67e8f9" />
          <stop offset="1" stopColor="#38bdf8" />
        </linearGradient>
      </defs>
      <path
        d="M46 24c7 0 12 5 12 12 0 9-7 16-16 16H30c-12 0-22-9-22-21 0-7 3-14 8-18l7 6a22 22 0 0 1 14-1l7-6c2 3 3 7 2 12Z"
        fill="url(#beamerbud-face)"
      />
      <path
        d="M49 30c6 1 10 5 10 11 0 7-5 12-13 12h-6c5-4 8-10 9-23Z"
        fill="#164e63"
        opacity="0.75"
      />
      <path
        d="M14 22c-2-5-1-10 3-14l8 10M39 18l8-10c4 4 5 9 3 14"
        fill="none"
        stroke="#99f6e4"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3"
      />
      <rect x="16" y="25" width="31" height="12" rx="6" fill="#082f49" />
      <rect
        className="beamerbud-visor"
        x="19"
        y="28"
        width="25"
        height="6"
        rx="3"
        fill="url(#beamerbud-visor)"
      />
      <path d="M26 42h12v7H26z" fill="#f8fafc" />
      <path d="M32 42v7" stroke="#0f172a" strokeWidth="1.5" />
      <path
        className="beamerbud-tail"
        d="M13 42c-5 0-8-3-8-7 0-5 4-8 9-7"
        fill="none"
        stroke="#38bdf8"
        strokeLinecap="round"
        strokeWidth="4"
      />
      <path
        className="beamerbud-signal"
        d="M20 47h-5m32-7h5M34 17v-5m-5 5v-3"
        stroke="#67e8f9"
        strokeLinecap="round"
        strokeWidth="2"
      />
      <circle cx="48" cy="40" r="2" fill="#67e8f9" />
      <circle cx="16" cy="42" r="2" fill="#67e8f9" />
    </svg>
  );
}
