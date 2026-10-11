import { describe, expect, it } from 'vitest';
import { parseEnvironment } from './env';

describe('environment configuration', () => {
  it.each([
    ['http://127.0.0.1:8080', 'http://127.0.0.1:8080'],
    [' https://api.example.com/ ', 'https://api.example.com'],
    ['https://api.example.com/api/v1/', 'https://api.example.com/api/v1'],
  ])('normalizes the API base URL given %s', (input, expected) => {
    const result = parseEnvironment({ VITE_API_BASE_URL: input });
    expect(result.apiBaseUrl).toBe(expected);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it.each([undefined, null, '', '   ', 8080])(
    'rejects missing or non-string configuration given %s',
    (input) => {
      expect(() => parseEnvironment({ VITE_API_BASE_URL: input })).toThrow(
        'is required',
      );
    },
  );

  it.each(['not-a-url', '/api/v1', 'https://'])(
    'rejects malformed URL %s',
    (input) => {
      expect(() => parseEnvironment({ VITE_API_BASE_URL: input })).toThrow(
        'absolute HTTP or HTTPS URL',
      );
    },
  );

  it.each(['ftp://example.com', 'javascript:alert(1)'])(
    'rejects unsupported protocol %s',
    (input) => {
      expect(() => parseEnvironment({ VITE_API_BASE_URL: input })).toThrow(
        'must use HTTP or HTTPS',
      );
    },
  );

  it.each([
    'https://user@example.com',
    'https://user:private-password@example.com',
    'https://example.com?token=private-token',
    'https://example.com#fragment',
  ])('rejects unsafe base URL without echoing its contents', (input) => {
    expect(() => parseEnvironment({ VITE_API_BASE_URL: input })).toThrow(
      'VITE_API_BASE_URL must not contain credentials, a query or a fragment.',
    );
    try {
      parseEnvironment({ VITE_API_BASE_URL: input });
    } catch (error) {
      expect((error as Error).message).not.toContain(input);
    }
  });
});
