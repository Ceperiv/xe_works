import { classifyHttpFailure, shouldRetryHttpError } from '../src/common/http/http-error-classifier';

describe('http error classifier', () => {
  it('maps status codes to scraper errors', () => {
    expect(classifyHttpFailure(undefined, 404).code).toBe('NotFound');
    expect(classifyHttpFailure(undefined, 429).code).toBe('RateLimited');
    expect(classifyHttpFailure(undefined, 503).code).toBe('Temporary');
  });

  it('maps network errors', () => {
    expect(classifyHttpFailure({ code: 'ENOTFOUND', message: 'dns' }).code).toBe('NetworkError');
    expect(classifyHttpFailure({ name: 'AbortError', message: 'timeout' }).code).toBe('Timeout');
  });

  it('marks retryable and permanent failures correctly', () => {
    expect(shouldRetryHttpError('Temporary')).toBe(true);
    expect(shouldRetryHttpError('RateLimited')).toBe(true);
    expect(shouldRetryHttpError('Timeout')).toBe(true);
    expect(shouldRetryHttpError('NetworkError')).toBe(true);
    expect(shouldRetryHttpError('NotFound', 404)).toBe(false);
  });
});
