import {
  buildAdsTxtUrl,
  computeContentHash,
  hasContentChanged,
  normalizeDomain,
} from '../src/modules/ads-txt/domain.utils';

describe('domain utils', () => {
  it('normalizes domains', () => {
    expect(normalizeDomain(' HTTPS://WWW.Example.com/path?q=1 ')).toBe('www.example.com');
  });

  it('builds app-ads.txt URL', () => {
    expect(buildAdsTxtUrl('Example.com')).toBe('https://example.com/app-ads.txt');
  });

  it('computes stable hash and detects changes', () => {
    const first = computeContentHash('hello');
    const second = computeContentHash('hello');
    const third = computeContentHash('world');

    expect(first).toBe(second);
    expect(first).not.toBe(third);
    expect(hasContentChanged(first, 'hello')).toBe(false);
    expect(hasContentChanged(first, 'world')).toBe(true);
  });
});
