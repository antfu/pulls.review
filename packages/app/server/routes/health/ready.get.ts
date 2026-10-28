import { createError, defineEventHandler } from 'h3'
import { getRuntime } from '../../utils/runtime'

export default defineEventHandler(() => {
  if (!getRuntime().runner.isHealthy())
    throw createError({ statusCode: 503, statusMessage: 'Analysis runner unavailable' })
  getRuntime().storage.sqlite.prepare('SELECT 1').get()
  return { ok: true }
})
