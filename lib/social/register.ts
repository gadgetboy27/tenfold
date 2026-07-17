/**
 * Side-effect import that populates the provider registry.
 *
 * Providers register themselves at module load, so any route that resolves one
 * by id must import this first — otherwise the registry is empty and every
 * lookup 404s depending on which modules happened to be bundled.
 *
 * Facebook and Instagram are absent on purpose: they predate the registry and
 * their connect flow does Meta-specific work (enumerating Pages, exchanging
 * for long-lived Page tokens) that doesn't fit the generic shape. They keep
 * their own routes in lib/social/meta.ts.
 */
import "@/lib/social/reddit";
