export type ScraperErrorCode =
  | 'Permanent'
  | 'Temporary'
  | 'RateLimited'
  | 'NotFound'
  | 'InvalidDomain'
  | 'Timeout'
  | 'NetworkError';

export class ScraperError extends Error {
  constructor(
    public readonly code: ScraperErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const isRetryableErrorCode = (code: ScraperErrorCode): boolean =>
  code === 'Temporary' ||
  code === 'RateLimited' ||
  code === 'Timeout' ||
  code === 'NetworkError';
