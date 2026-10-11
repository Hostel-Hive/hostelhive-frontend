export interface AppEnvironment {
  readonly apiBaseUrl: string;
}

export function parseEnvironment(
  values: Record<string, unknown>,
): AppEnvironment {
  const rawUrl = values.VITE_API_BASE_URL;

  if (typeof rawUrl !== 'string' || rawUrl.trim() === '') {
    throw new Error(
      'VITE_API_BASE_URL is required. Configure it in web/.env.local.',
    );
  }

  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new Error('VITE_API_BASE_URL must be an absolute HTTP or HTTPS URL.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('VITE_API_BASE_URL must use HTTP or HTTPS.');
  }

  if (url.username || url.password || url.search || url.hash) {
    throw new Error(
      'VITE_API_BASE_URL must not contain credentials, a query or a fragment.',
    );
  }

  return Object.freeze({ apiBaseUrl: url.href.replace(/\/+$/, '') });
}
