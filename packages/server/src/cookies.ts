import { parse, serialize } from 'cookie-es'

export function parseCookies(header: string | null) {
  return parse(header ?? '')
}

/** Cookies used only for GitHub App manifest registration. Auth owns its cookies. */
export function cookieHeader(name: string, value: string, options: { maxAge: number, secure: boolean }) {
  return serialize(name, value, { path: '/', sameSite: 'lax', httpOnly: true, ...options })
}
