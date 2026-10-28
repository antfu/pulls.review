import type { Auth } from '@pulls.review/server/auth'
import { inferAdditionalFields } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/vue'

export const authClient = createAuthClient({
  plugins: [inferAdditionalFields<Auth>()],
})
