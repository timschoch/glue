type Setting = 'DATABASE_URL' | 'NEON_AUTH_BASE_URL' | 'NEON_AUTH_COOKIE_SECRET'

// Settings come from the environment and stay on the server.
export function getSetting(name: Setting): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set.`)
  return value
}
