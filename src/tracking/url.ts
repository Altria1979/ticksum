export interface PageIdentity {
  pageKey: string;
  url: string;
  hostname: string;
}

export function getPageIdentity(value: string | undefined): PageIdentity | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    // Preserve query parameters and hash routes: both can identify a document.
    url.username = '';
    url.password = '';
    return { pageKey: url.href, url: url.href, hostname: url.hostname.toLowerCase().replace(/\.$/, '') };
  } catch {
    return null;
  }
}

export function normalizeExcludedHost(value: string): string | null {
  const input = value.trim().toLowerCase().replace(/^\*\./, '');
  if (!input) return null;
  try {
    const url = new URL(input.includes('://') ? input : `https://${input}`);
    const host = url.hostname.replace(/\.$/, '');
    return (url.protocol === 'https:' || url.protocol === 'http:') && host && !host.includes('*') ? host : null;
  } catch {
    return null;
  }
}

export function isExcludedHost(hostname: string, excludedHosts: string[]): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return excludedHosts.some((excluded) => host === excluded || host.endsWith(`.${excluded}`));
}

export function hostPermissionPattern(url: string): string {
  const parsed = new URL(url);
  return `${parsed.protocol}//${parsed.hostname}/*`;
}
