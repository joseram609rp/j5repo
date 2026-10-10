import { expect, it } from 'vitest';
import { ApiError } from './api';
import { loginErrorMessage } from './login-error';
it('distinguishes Origin, credentials, service availability, rate limits and network errors', () => {
  expect(loginErrorMessage(new ApiError(403, 'ORIGIN_REJECTED'))).toContain('http://localhost:5173');
  expect(loginErrorMessage(new ApiError(401, 'INVALID_CREDENTIALS'))).toContain('incorrectos');
  expect(loginErrorMessage(new ApiError(503, 'SQL_UNAVAILABLE'))).toContain('no están disponibles');
  expect(loginErrorMessage(new ApiError(429, 'LOGIN_RATE_LIMIT'))).toContain('Demasiados intentos');
  expect(loginErrorMessage(new TypeError('fetch failed'))).toContain('backend');
});
