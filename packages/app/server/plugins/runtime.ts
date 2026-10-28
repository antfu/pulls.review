import process from 'node:process'
import { defineNitroPlugin } from 'nitropack/runtime'
import { getRuntime } from '../utils/runtime'

export default defineNitroPlugin((nitro) => {
  const runtime = getRuntime()
  if (process.env.ANALYSIS_RUNNER_ENABLED !== 'false')
    runtime.runner.start()
  nitro.hooks.hook('close', async () => {
    await runtime.runner.stop()
    runtime.storage.close()
  })
})
