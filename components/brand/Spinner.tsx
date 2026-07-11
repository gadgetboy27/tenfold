import { cn } from "@/lib/utils";
import { Logo } from "./Logo";

/**
 * Branded loading spinner — the tenfold "amplification burst" mark spinning.
 * Use in place of a generic loader while something is building/rendering.
 */
export function Spinner({
  size = 16,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <Logo size={size} className={cn("animate-spin [&>svg]:block", className)} />
  );
}
