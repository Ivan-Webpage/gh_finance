export function resolveApiBaseUrl(rawUrl: string, githubPagesApiUrl?: string): string {
  const normalized = (rawUrl || '').trim().replace(/\/$/, '');

  if (typeof window !== 'undefined') {
    const currentHost = (window.location.hostname || '').toLowerCase();
    const isGithubPagesHost = currentHost.endsWith('github.io');
    const wantsSameOriginApi = !/^https?:\/\//i.test(normalized);

    if (isGithubPagesHost && wantsSameOriginApi) {
      const ghApi = (githubPagesApiUrl || '').trim().replace(/\/$/, '');
      if (ghApi && /^https?:\/\//i.test(ghApi)) {
        return ghApi;
      }
    }
  }

  if (!normalized) {
    return '/api';
  }

  if (typeof window === 'undefined') {
    return normalized;
  }

  if (!/^https?:\/\//i.test(normalized)) {
    return normalized;
  }

  try {
    const configuredUrl = new URL(normalized);
    const currentHost = window.location.hostname;

    const isLocalHost = (host: string): boolean => {
      const hostName = (host || '').toLowerCase();
      return hostName === 'localhost' || hostName === '127.0.0.1' || hostName === '0.0.0.0';
    };

    const configuredIsLocal = isLocalHost(configuredUrl.hostname);
    const currentIsLocal = isLocalHost(currentHost);

    if (configuredIsLocal && !currentIsLocal) {
      return '/api';
    }

    if (window.location.protocol === 'https:' && configuredUrl.protocol === 'http:') {
      return '/api';
    }

    return normalized;
  } catch {
    return normalized;
  }
}
