const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export async function apiCall(path: string, options?: RequestInit, token?: string, workspaceSlug?: string) {
  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(workspaceSlug ? { 'x-workspace-slug': workspaceSlug } : {}),
      ...(options?.headers || {}),
    },
  });
}
