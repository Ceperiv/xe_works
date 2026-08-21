import { lookup } from 'dns/promises';
import { isIP } from 'net';
import { ScraperError } from '../errors/scraper-error';

const METADATA_IPV4 = new Set(['169.254.169.254', '100.100.100.200']);
const BLOCKED_HOSTNAMES = ['localhost', 'metadata.google.internal'];
const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.localdomain', '.lan', '.home'];

export const validateOutboundUrl = async (rawUrl: string): Promise<URL> => {
  let parsed: URL;

  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new ScraperError('InvalidUrl', `Invalid outbound URL: ${rawUrl}`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ScraperError('SsrfBlocked', 'Only http/https outbound requests are allowed', {
      url: rawUrl,
      protocol: parsed.protocol,
    });
  }

  const hostname = parsed.hostname.trim().toLowerCase();

  if (!hostname) {
    throw new ScraperError('InvalidUrl', `Outbound URL has no hostname: ${rawUrl}`);
  }

  if (BLOCKED_HOSTNAMES.includes(hostname) || BLOCKED_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
    throw new ScraperError('SsrfBlocked', 'Blocked local/internal hostname', {
      url: rawUrl,
      hostname,
    });
  }

  if (!hostname.includes('.') && isIP(hostname) === 0) {
    throw new ScraperError('SsrfBlocked', 'Blocked bare internal hostname', {
      url: rawUrl,
      hostname,
    });
  }

  const ipVersion = isIP(hostname);

  if (ipVersion !== 0) {
    ensureSafeAddress(hostname, ipVersion, rawUrl);
    return parsed;
  }

  try {
    const addresses = await lookup(hostname, { all: true, verbatim: true });

    for (const address of addresses) {
      ensureSafeAddress(address.address, address.family, rawUrl);
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;

    if (code !== 'ENOTFOUND' && code !== 'EAI_AGAIN') {
      throw new ScraperError('NetworkError', 'Failed to resolve outbound hostname', {
        url: rawUrl,
        hostname,
        code,
      });
    }
  }

  return parsed;
};

const ensureSafeAddress = (address: string, family: number, rawUrl: string): void => {
  if (family === 4 && isBlockedIpv4(address)) {
    throw new ScraperError('SsrfBlocked', 'Blocked private or metadata IPv4 address', {
      url: rawUrl,
      address,
    });
  }

  if (family === 6 && isBlockedIpv6(address)) {
    throw new ScraperError('SsrfBlocked', 'Blocked private or link-local IPv6 address', {
      url: rawUrl,
      address,
    });
  }
};

const isBlockedIpv4 = (address: string): boolean => {
  if (METADATA_IPV4.has(address) || address === '0.0.0.0') {
    return true;
  }

  const octets = address.split('.').map((part) => Number.parseInt(part, 10));

  if (octets.length !== 4 || octets.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return true;
  }

  const [a, b] = octets;

  return (
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
};

const isBlockedIpv6 = (address: string): boolean => {
  const normalized = address.toLowerCase();
  const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);

  if (mappedIpv4?.[1] && isBlockedIpv4(mappedIpv4[1])) {
    return true;
  }

  return (
    normalized === '::1' ||
    normalized === '::' ||
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb') ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd')
  );
};

export const parseRetryAfterHeader = (headers: Headers): number | null => {
  const retryAfter = headers.get('retry-after');

  if (!retryAfter) {
    return null;
  }

  const seconds = Number.parseInt(retryAfter, 10);

  if (!Number.isNaN(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  const date = Date.parse(retryAfter);

  if (!Number.isNaN(date)) {
    return Math.max(0, date - Date.now());
  }

  return null;
};
