import { defineEventHandler, toWebRequest } from 'h3'
import { getRuntime } from '../../utils/runtime'

export default defineEventHandler((event) => {
  const auth = getRuntime().env.AUTH
  if (!auth)
    return Response.json({ error: 'GitHub App OAuth is not configured on this host.' }, { status: 503 })
  const request = toWebRequest(event)
  const url = new URL(request.url)
  // Compatibility with callback URLs registered before Better Auth.
  if (url.pathname === '/api/auth/callback') {
    url.pathname = '/api/auth/callback/github'
    return auth.handler(new Request(url, request))
  }
  return auth.handler(request)
})
