import Link from "next/link";
import Image from "next/image";

export function Footer() {
  return (
    <footer className="border-t border-white/10 px-5 py-12">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 sm:flex-row">
        <div className="flex items-center gap-2">
          <Image
            src="/brand/tenfold-mark.svg"
            alt=""
            width={22}
            height={22}
            className="h-5 w-5"
          />
          <span className="font-serif font-bold">tenfold</span>
          <span className="ml-2 text-sm text-muted-foreground">
            © 2026 tenfold.nz
          </span>
        </div>
        <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
          <Link
            href="/#pipeline"
            className="transition-colors hover:text-foreground"
          >
            How it works
          </Link>
          <Link
            href="/#showcase"
            className="transition-colors hover:text-foreground"
          >
            Showcase
          </Link>
          <Link
            href="/about"
            className="transition-colors hover:text-foreground"
          >
            About
          </Link>
          <Link
            href="/terms"
            className="transition-colors hover:text-foreground"
          >
            Terms
          </Link>
          <Link
            href="/privacy"
            className="transition-colors hover:text-foreground"
          >
            Privacy
          </Link>
          <Link
            href="/login"
            className="transition-colors hover:text-foreground"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="text-foreground transition-colors hover:text-primary"
          >
            Start free
          </Link>
        </nav>
      </div>
    </footer>
  );
}
