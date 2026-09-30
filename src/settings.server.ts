type Setting =
  | 'DATABASE_URL'
  | 'GITHUB_TOKEN'
  | 'NEON_AUTH_BASE_URL'
  | 'NEON_AUTH_COOKIE_SECRET'
  | 'MOCK_ANALYTICS_URL'
  | 'MOCK_ANALYTICS_READ_KEY'
  | 'MOCK_SOCIAL_URL'
  | 'MOCK_SOCIAL_READ_KEY'
  | 'HF_TOKEN'
  | 'CRON_SECRET'

// Settings come from the environment and stay on the server.
export function findSetting(name: Setting): string | undefined {
  return process.env[name] || undefined
}

export function getSetting(name: Setting): string {
  const value = findSetting(name)
  if (!value) throw new Error(`${name} is not set.`)
  return value
}
