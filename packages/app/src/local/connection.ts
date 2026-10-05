import type { DevframeScopedClientRpc } from 'devframe/client'
import { LOCAL_BASE_PATH, LOCAL_DEVFRAME_ID } from '@pulls.review/core/local-rpc'
import { connectDevframe } from 'devframe/client'

export type LocalRpc = DevframeScopedClientRpc<typeof LOCAL_DEVFRAME_ID>

/** The `pulls.review` server this `PR_LOCAL` build was served by (see `packages/cli`). */
export async function connectLocal() {
  // An explicit base: on a deep route `document.baseURI` is not the mount path.
  const client = await connectDevframe({ baseURL: LOCAL_BASE_PATH })
  return { client, rpc: client.scope(LOCAL_DEVFRAME_ID).rpc }
}
