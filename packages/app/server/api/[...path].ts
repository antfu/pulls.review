import process from 'node:process'
import { handleRequest } from '@pulls.review/server/index'
import { defineEventHandler, toWebRequest } from 'h3'
import { getRuntime } from '../utils/runtime'

export default defineEventHandler(async (event) => {
  const request = toWebRequest(event)
  // Use the configured origin for OAuth redirects/cookies behind a TLS proxy.
  // Forwarded host headers are never an authority for the public origin.
  const origin = process.env.PUBLIC_ORIGIN
  const url = new URL(request.url)
  const normalized = origin
    ? new Request(new URL(url.pathname + url.search, origin), request)
    : request
  return handleRequest(normalized, getRuntime().env)
})
