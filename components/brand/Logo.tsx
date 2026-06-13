import { cn } from "@/lib/utils";

interface LogoProps {
  /** Pixel size of the square mark. */
  size?: number;
  /** Show the "tenfold" wordmark next to the mark. */
  withWordmark?: boolean;
  className?: string;
}

/**
 * Tenfold brand mark — an "amplification burst": one origin radiating tenfold,
 * echoing the product (one prompt → many creative outputs). Uses the brand
 * violet gradient. Pair with the serif wordmark for the full lockup.
 */
export function Logo({
  size = 28,
  withWordmark = false,
  className,
}: LogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 512 512"
        fill="none"
        role="img"
        aria-label="Tenfold"
      >
        <defs>
          <linearGradient
            id="tf-logo-grad"
            x1="96"
            y1="64"
            x2="416"
            y2="448"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#9D7CFF" />
            <stop offset="1" stopColor="#6438F5" />
          </linearGradient>
        </defs>
        <g fill="url(#tf-logo-grad)">
          <rect x="236" y="40" width="40" height="216" rx="20" />
          <rect
            x="236"
            y="150"
            width="40"
            height="106"
            rx="20"
            transform="rotate(60 256 256)"
          />
          <rect
            x="236"
            y="40"
            width="40"
            height="216"
            rx="20"
            transform="rotate(120 256 256)"
          />
          <rect
            x="236"
            y="150"
            width="40"
            height="106"
            rx="20"
            transform="rotate(180 256 256)"
          />
          <rect
            x="236"
            y="40"
            width="40"
            height="216"
            rx="20"
            transform="rotate(240 256 256)"
          />
          <rect
            x="236"
            y="150"
            width="40"
            height="106"
            rx="20"
            transform="rotate(300 256 256)"
          />
          <circle cx="256" cy="256" r="34" />
        </g>
      </svg>
      {withWordmark && (
        <span className="font-serif font-bold text-foreground tracking-tight">
          tenfold
        </span>
      )}
    </span>
  );
}
