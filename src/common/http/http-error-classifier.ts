import { ScraperError, ScraperErrorCode } from '../errors/scraper-error';

const timeoutCodes = new Set(['ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'ABORT_ERR']);
const networkCodes = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'EHOSTUNREACH',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNABORTED',
]);

export const classifyHttpFailure = (
  input: unknown,
  responseStatus?: number,
): ScraperError => {
  if (responseStatus === 404) {
    return new ScraperError('NotFound', 'Resource not found', { responseStatus });
  }

  if (responseStatus === 429) {
    return new ScraperError('RateLimited', 'Upstream rate limited request', { responseStatus });
  }

  if (responseStatus && responseStatus >= 500) {
    return new ScraperError('Temporary', 'Upstream temporary failure', { responseStatus });
  }

  if (input instanceof ScraperError) {
    return input;
  }

  const error = input as NodeJS.ErrnoException & { name?: string; message?: string };

  if (error?.name === 'AbortError' || timeoutCodes.has(error?.code ?? '')) {
    return new ScraperError('Timeout', error?.message ?? 'HTTP timeout');
  }

  if (networkCodes.has(error?.code ?? '')) {
    return new ScraperError('NetworkError', error?.message ?? 'Network error', {
      code: error?.code,
    });
  }

  return new ScraperError('Temporary', error?.message ?? 'Unknown HTTP failure');
};

export const shouldRetryHttpError = (code: ScraperErrorCode, status?: number): boolean => {
  if (status === 404) {
    return false;
  }

  return code === 'Temporary' || code === 'RateLimited' || code === 'Timeout' || code === 'NetworkError';
};
