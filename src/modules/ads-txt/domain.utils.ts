import { createHash } from 'crypto';
import { ScraperError } from '../../common/errors/scraper-error';

export const normalizeDomain = (value: string): string => {
  const trimmed = value.trim().toLowerCase();

  if (!trimmed) {
    throw new ScraperError('InvalidDomain', 'Domain is empty');
  }

  const withoutProtocol = trimmed.replace(/^[a-z]+:\/\//, '');
  const withoutPath = withoutProtocol.split('/')[0]?.split('?')[0] ?? '';
  const withoutPort = withoutPath.split(':')[0] ?? '';
  const normalized = withoutPort.replace(/^\.+|\.+$/g, '');

  if (!normalized || !normalized.includes('.') || normalized.includes(' ')) {
    throw new ScraperError('InvalidDomain', `Invalid domain: ${value}`);
  }

  return normalized;
};

export const buildAdsTxtUrl = (domain: string): string => {
  const normalizedDomain = normalizeDomain(domain);
  const url = new URL(`https://${normalizedDomain}`);
  url.pathname = '/app-ads.txt';
  url.search = '';
  url.hash = '';
  return url.toString();
};

export const computeContentHash = (content: string): string =>
  createHash('sha256').update(content).digest('hex');

export const hasContentChanged = (
  previousHash: string | null | undefined,
  nextContent: string,
): boolean => previousHash !== computeContentHash(nextContent);
