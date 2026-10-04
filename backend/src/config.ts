function positive(name: string, fallback: number, maximum: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value <= 0 || value > maximum) throw new Error('Invalid ' + name);
  return value;
}
export const config = {
  origin: process.env.APP_ORIGIN ?? 'http://localhost:5173',
  production: process.env.NODE_ENV === 'production' || Boolean(process.env.WEBSITE_INSTANCE_ID),
  idleMs: 7_200_000,
  sql: {
    server: process.env.SQL_SERVER, database: process.env.SQL_DATABASE,
    authMode: process.env.SQL_AUTH_MODE ?? 'sql',
    user: process.env.SQL_USER, password: process.env.SQL_PASSWORD,
    connectTimeoutMs: positive('SQL_CONNECT_TIMEOUT_MS', 5000, 5000),
    requestTimeoutMs: positive('SQL_REQUEST_TIMEOUT_MS', 5000, 5000),
    retryBudgetMs: positive('SQL_RETRY_BUDGET_MS', 28000, 28000)
  }
};
