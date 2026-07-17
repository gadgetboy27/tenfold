"use client";

/**
 * Logo builder — placeholder.
 *
 * This is the scaffold entry point the real UI grows into. It only renders when
 * the server page (app/(dashboard)/[workspace]/logo/page.tsx) has already passed
 * the FEATURE_LOGO_BUILDER gate, so nothing here needs to re-check the flag.
 *
 * See LOGO_PRODUCTION.md for the build plan and the overlay-vs-separate decision.
 */
export function LogoBuilder() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16 text-center">
      <h1 className="font-serif text-3xl font-bold">Logo builder</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Scaffold in place — dark-launched behind a flag. Build the real thing
        here. See LOGO_PRODUCTION.md.
      </p>
    </div>
  );
}
