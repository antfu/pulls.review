import type { DevframeScopedClientRpc } from 'devframe/client'
import { LOCAL_DEVFRAME_ID } from '@pulls.review/core/local-rpc'
import { connectDevframe } from 'devframe/client'

export type LocalRpc = DevframeScopedClientRpc<typeof LOCAL_DEVFRAME_ID>

/** The `pulls.review` server this `PR_LOCAL` build was served by (see `packages/cli`). */
export async function connectLocal() {
  // Found relative to `document.baseURI`, the mount path the page's `<base>` names.
  const client = await connectDevframe()
  return { client, rpc: client.scope(LOCAL_DEVFRAME_ID).rpc }
}
