/**
 * Which logo project this browser had open, per workspace.
 *
 * `LogoStudio` kept `projectId` in component state alone, so leaving Logo &
 * brand for any reason — the Compositor, Billing, a refresh — put you back on
 * the project LIST. Nothing was lost, but re-finding your place was a manual
 * step every time, which mid-edit reads as the app forgetting.
 *
 * Same shape and same reasoning as Studio's `tf_last_section_<campaign>`: a
 * cursor position is personal to one browser, not workspace state worth a
 * column and a migration. Keyed by workspace so two workspaces in two tabs
 * don't drag each other around.
 *
 * Every accessor is wrapped: Safari private mode and "block site data" throw on
 * localStorage rather than returning null, and a thrown error here would take
 * down the whole Logo Studio to save a convenience.
 */

const KEY = (workspace: string) => `tf_logo_open_${workspace}`;

export function rememberOpenLogo(workspace: string, projectId: string): void {
  if (!workspace) return;
  try {
    localStorage.setItem(KEY(workspace), projectId);
  } catch {
    /* storage unavailable — restoring is a convenience, never a requirement */
  }
}

export function recallOpenLogo(workspace: string): string | null {
  if (!workspace) return null;
  try {
    return localStorage.getItem(KEY(workspace));
  } catch {
    return null;
  }
}

export function forgetOpenLogo(workspace: string): void {
  if (!workspace) return;
  try {
    localStorage.removeItem(KEY(workspace));
  } catch {
    /* ignore */
  }
}
