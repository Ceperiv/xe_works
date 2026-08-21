import { ReliableHttpClient } from '../src/common/http/reliable-http.client';

describe('ReliableHttpClient retry logic', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('retries temporary failures and eventually succeeds', async () => {
    const fetchMock = jest
      .fn()
      .mockRejectedValueOnce({ code: 'ECONNRESET', message: 'temporary' })
      .mockResolvedValueOnce(
        new Response('ok', {
          status: 200,
          headers: {
            'content-type': 'text/plain',
          },
        }),
      );

    global.fetch = fetchMock as typeof fetch;

    const client = new ReliableHttpClient(
      {
        http: {
          timeoutMs: 1000,
          maxResponseSize: 1024,
          retryLimit: 2,
          retryBaseDelayMs: 1,
          redirectLimit: 3,
        },
      } as never,
      { warn: jest.fn(), log: jest.fn(), error: jest.fn(), debug: jest.fn() } as never,
      { increment: jest.fn() } as never,
    );

    const response = await client.get({ url: 'https://example.com/app-ads.txt' });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
