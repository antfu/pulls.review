PR title: fix(hub-ui): initialize dock page scripts before activation

PR link: https://github.com/devframes/devframe/pull/387

---DESCRIPTION---
## Background (Why)

An iframe dock's page script can register commands used by notifications before the user opens its panel. The reference hub UI waits for activation, leaving those commands unavailable until then.

## Changes (What)

Add optional `eager: true` to the existing `ClientScriptEntry` descriptor, defaulting to lazy initialization as discussed in review. Both the reference hub UI and the headless runtime wait for RPC trust before eager initialization. Activation shares pending setup, and failed setup remains retryable. Cache setup per RPC connection and import descriptor; action clicks still execute each time.

Keep the existing script fields: `clientScript` on iframe docks, `action` on action docks, and `renderer` on custom-render docks. The common dock base and JSON-render API are unchanged.

## Verification (Testing)

53 focused tests pass across the headless runtime, renderer fixtures, and reference UI context/script suites. Coverage includes opt-in eager initialization, default lazy behavior, trust gating, separate RPC connections, concurrent activation and setup failure/retry. Scoped hub/hub-ui type checks and changed-file lint pass.

The rebuilt assets at `51d41004` were checked in the in-app Chromium browser before the subsequent trust-race correction. Embedded iframe setup remained lazy unless opted in; eager setup ran before panel activation, stayed deduplicated on activation, and registered a working page-local command. A standalone page initialized its own script instance and its command remained functional after closing the embedded page.

Commit `91291de9` adds six regression cases for trust revocation during dynamic import and while iframe setup completes. Both runtimes recheck trust before invocation/activation, and interrupted setup remains retryable after re-authentication. All 53 focused tests, changed-file lint and both package type checks pass. CI is running on this revision. The previous revision failed two Node 22 `plugin-code-server` declaration snapshots; that failure is retained pending the new run. The PR remains draft.



---MANIFEST--- (15 files, +560/-75)
docs/content/1.guide/
  17.client-context.md  M  +4/-2  @@ A client-only dock can also carry `type: 'json-render'` with an inline [JSON-ren
docs/content/8.references/
  6.hub-api.md  M  +3/-1  @@ Which `ClientScriptEntry` field carries an entry's client script, and when it ru
examples/custom-hub-next/src/client/devframe/
  next-devframe-hub.ts  M  +3/-2  @@ export async function nextDevframeHub(
examples/custom-hub-vite/
  vite.config.ts  M  +4/-3  @@ export default defineConfig({
packages/devframe/src/types/
  devframe.ts  M  +5/-0  @@ export interface DevframeDockDefaults {
packages/hub-ui/src/client/state/
  client-script.integration.test.ts  M  +235/-4  @@ function createStubRpc() { / @@ afterEach(() => { / @@ describe('dock client scripts', () => {
  context.test.ts  M  +2/-1  @@ import { nextTick, ref } from 'vue'
  context.ts  M  +44/-11  @@ import { createDockEntryState, DEFAULT_DOCK_PANEL_STORE, DEFAULT_DOCK_SESSION_ST / @@ export async function createDocksContext(
  setup-script.ts  M  +35/-30  @@ async function _executeSetupScript(
packages/hub/src/client/
  host.ts  M  +71/-16  @@ import type { / @@ export async function createDevframeClientRuntime(
packages/hub/src/client/__tests__/
  host.test.ts  M  +144/-2  @@ function createStubRpc() { / @@ describe('createDevframeClientRuntime', () => {
  renderers.test.ts  M  +2/-0  @@ function createStubSharedState<T>(initial: T): StubSharedState<T> {
packages/hub/src/types/
  docks.ts  M  +6/-3  @@ export interface DevframeDockEntryBase { / @@ export interface DevframeViewIframe extends DevframeDockEntryBase {
tests/__snapshots__/tsnapi/@devframes/hub/
  index.snapshot.d.ts  M  +1/-0
tests/__snapshots__/tsnapi/devframe/
  index.snapshot.d.ts  M  +1/-0  @@ export interface DevframeDockDefaults {

---DIFFS--- (all diffs included; you may submit directly)
### docs/content/1.guide/17.client-context.md [modified, +4/-2]
@@ -67,14 +67,16 @@ A client-only dock can also carry `type: 'json-render'` with an inline [JSON-ren
 
 ## Dock client scripts
 
-A client script is a `ClientScriptEntry`: `{ importFrom, importName? }` (`importName` defaults `'default'`). The field varies by entry kind: an `action` entry's `action` runs when the dock button is activated, a `custom-render` entry's `renderer` renders its panel, and an `iframe` entry's optional `clientScript` runs alongside the iframe panel inside the host page ([Hub API reference](/references/hub-api#dock-client-script-fields)).
+A client script is a `ClientScriptEntry`: `{ importFrom, importName?, eager? }`. `importName` defaults to `'default'` and `eager` defaults to `false`. An `iframe` entry's optional `clientScript` runs inside the host page when the dock entry is first activated. An `action` entry runs its `action` on each activation, while a `custom-render` entry initializes its `renderer` after selection so it can mount into the panel.
+
+Set `eager: true` on an `iframe` `clientScript` or an `action` to initialize it as soon as the RPC connection is trusted, before opening a dock panel. This suits background subscriptions and page commands, such as an `action` that registers page commands or subscribes to `entry:activated` before its first click. A `custom-render` `renderer` needs its mounted panel, so it always initializes on activation. Both the reference hub UI and `createDevframeClientRuntime()` honor these settings ([Hub API reference](/references/hub-api#dock-client-script-fields)).
 
 The exported function (`DockClientScriptContext`) receives the client context and two dock-scoped extras:
 
 - **`current`** holds this entry's state: `entryMeta`, `isActive`, `domElements`, `events` (`entry:activated`, `entry:deactivated`, `entry:updated`, `dom:panel:mounted`, `dom:iframe:mounted`).
 - **`messages`**: an entry-scoped messages client (`category` defaults to the entry id; `info`/`warn`/`error`/`success`/`debug` shortcuts for `add()`).
 
-A failed import retries on the next dock update.
+Failed setup retries on the next activation, or on a dock update for eager scripts. Setup is cached per RPC connection, dock and import descriptor. Action clicks always execute again.
 
 ### Shipping a client script
 

### docs/content/8.references/6.hub-api.md [modified, +3/-1]
@@ -131,7 +131,9 @@ Which `ClientScriptEntry` field carries an entry's client script, and when it ru
 |---|---|---|
 | `action` | `action` | when the dock button is activated |
 | `custom-render` | `renderer` | to render the entry's panel |
-| `iframe` | `clientScript` (optional) | alongside the iframe panel, inside the host page |
+| `iframe` | `clientScript` (optional) | inside the host page on first activation |
+
+`ClientScriptEntry.eager` defaults to `false`. Set it to `true` on an `iframe` `clientScript` or an `action` to initialize it after RPC trust, before dock activation. A `custom-render` `renderer` needs its mounted panel, so it always initializes on activation regardless of `eager`. Setup is cached per RPC connection and dock; action clicks execute on every activation.
 
 ## Frame-nav messages
 

### examples/custom-hub-next/src/client/devframe/next-devframe-hub.ts [modified, +3/-2]
@@ -287,7 +287,8 @@ export async function nextDevframeHub(
 
       // The demo dock-client script - the same package the Vite reference
       // host loads via a bare specifier - mounted statically and attached as
-      // a momentary `action` dock by its served URL.
+      // a momentary `action` dock by its served URL. `eager: true` runs it on
+      // trust so it subscribes to `entry:activated` before the first click.
       if (demoDockClient) {
         await ctx.host.mountStatic(DEMO_CLIENT_MOUNT_BASE, demoDockClient.dir)
         ctx.docks.register({
@@ -296,7 +297,7 @@ export async function nextDevframeHub(
           title: 'Client Script Demo',
           icon: 'ph:plugs-connected-duotone',
           category: 'app',
-          action: { importFrom: demoDockClient.importFrom },
+          action: { importFrom: demoDockClient.importFrom, eager: true },
         })
       }
 

### examples/custom-hub-vite/vite.config.ts [modified, +4/-3]
@@ -176,15 +176,16 @@ export default defineConfig({
         // Bare-specifier client script demo: `importFrom` names the npm
         // package itself, imported through Vite's own module graph via the
         // host's `clientModuleResolution` (`'/@id/{specifier}'`). The Next
-        // reference host consumes the same package as a prebuilt
-        // self-contained bundle instead (see examples/demo-dock-client).
+        // host uses the same package as a prebuilt bundle (see
+        // examples/demo-dock-client). `eager: true` runs it on trust so it
+        // subscribes to `entry:activated` before the first click.
         context.docks.register({
           type: 'action',
           id: 'example:demo-client-script',
           title: 'Client Script Demo',
           icon: 'ph:plugs-connected-duotone',
           category: 'app',
-          action: { importFrom: 'demo-dock-client' },
+          action: { importFrom: 'demo-dock-client', eager: true },
         })
 
         // Witness the missing-renderer path: a dock type nothing covers, so

### packages/devframe/src/types/devframe.ts [modified, +5/-0]
@@ -329,6 +329,11 @@ export interface DevframeDockDefaults {
    * host wiring; a URL or bare specifier passes through untouched.
    */
   clientScript?: {
+    /**
+     * Initialize after RPC trust without waiting for dock activation.
+     * @default false
+     */
+    eager?: boolean
     /** An absolute filesystem path, a served URL, or a bare npm specifier. */
     importFrom: string
     /**

### packages/hub-ui/src/client/state/client-script.integration.test.ts [modified, +235/-4]
@@ -1,6 +1,7 @@
 import type { DevframeDockEntry } from '@devframes/hub'
 import type { DevframeRpcClient } from '@devframes/hub/client'
 import type { SharedState } from 'devframe/utils/shared-state'
+import { DEVFRAME_EVENTS } from 'devframe/constants'
 import { createEventEmitter } from 'devframe/utils/events'
 import { createSharedState } from 'devframe/utils/shared-state'
 import { afterEach, describe, expect, it, vi } from 'vitest'
@@ -42,7 +43,7 @@ function createStubRpc() {
 
 declare global {
   // eslint-disable-next-line vars-on-top -- test hook called by the dynamically imported client module
-  var __DEVFRAME_CLIENT_SCRIPT_ATTEMPT__: (() => void) | undefined
+  var __DEVFRAME_CLIENT_SCRIPT_ATTEMPT__: (() => void | Promise<void>) | undefined
 }
 
 afterEach(() => {
@@ -52,6 +53,7 @@ afterEach(() => {
 
 describe('dock client scripts', () => {
   it('retries setup on a later activation after it fails', async () => {
+    expect.assertions(3)
     vi.spyOn(console, 'error').mockImplementation(() => {})
     let attempts = 0
     globalThis.__DEVFRAME_CLIENT_SCRIPT_ATTEMPT__ = () => {
@@ -63,11 +65,10 @@ describe('dock client scripts', () => {
     const context = await createDocksContext('embedded', rpc)
     const entry = {
       id: 'retry-client-script',
-      type: 'iframe',
+      type: 'custom-render',
       title: 'Retry client script',
       icon: 'ph:play',
-      url: '/retry',
-      clientScript: {
+      renderer: {
         importFrom: 'data:text/javascript,export default () => globalThis.__DEVFRAME_CLIENT_SCRIPT_ATTEMPT__()',
       },
     } satisfies DevframeDockEntry
@@ -81,3 +82,233 @@ describe('dock client scripts', () => {
     expect(attempts).toBe(2)
   })
 })
+
+it('starts an eager iframe script before dock activation, once per RPC client', async () => {
+  expect.assertions(3)
+  let attempts = 0
+  globalThis.__DEVFRAME_CLIENT_SCRIPT_ATTEMPT__ = () => {
+    attempts++
+  }
+  const { rpc, sharedStates } = createStubRpc()
+  const context = await createDocksContext('embedded', rpc)
+  const clientScript = { eager: true, importFrom: 'data:text/javascript,export default () => globalThis.__DEVFRAME_CLIENT_SCRIPT_ATTEMPT__()' }
+  const entry = { id: 'background-iframe', type: 'iframe', title: 'Background page script', icon: 'ph:browser', url: '/fixture', clientScript } satisfies DevframeDockEntry
+  sharedStates.get('devframe:docks')!.push([entry])
+  await expect.poll(() => attempts).toBe(1)
+  expect(context.docks.selectedId).toBeNull()
+  await context.docks.switchEntry(entry.id)
+  expect(attempts).toBe(1)
+})
+
+it('waits for trust and keeps the same dock script bound separately to each RPC client', async () => {
+  expect.assertions(4)
+  let attempts = 0
+  globalThis.__DEVFRAME_CLIENT_SCRIPT_ATTEMPT__ = () => {
+    attempts++
+  }
+  const first = createStubRpc()
+  const second = createStubRpc()
+  Object.assign(first.rpc, { isTrusted: false })
+  await createDocksContext('embedded', first.rpc)
+  await createDocksContext('embedded', second.rpc)
+  const entry = {
+    id: 'per-rpc-page-script',
+    type: 'iframe',
+    title: 'Page commands',
+    icon: 'ph:browser',
+    url: '/fixture',
+    clientScript: { eager: true, importFrom: 'data:text/javascript,export default () => globalThis.__DEVFRAME_CLIENT_SCRIPT_ATTEMPT__()' },
+  } satisfies DevframeDockEntry
+  first.sharedStates.get('devframe:docks')!.push([entry])
+  await nextTick()
+  expect(attempts).toBe(0)
+  second.sharedStates.get('devframe:docks')!.push([entry])
+  await expect.poll(() => attempts).toBe(1)
+  Object.assign(first.rpc, { isTrusted: true })
+  first.rpc.events.emit(DEVFRAME_EVENTS.client.isTrustedUpdated, true)
+  await expect.poll(() => attempts).toBe(2)
+  first.sharedStates.get('devframe:docks')!.push([{ ...entry }])
+  second.sharedStates.get('devframe:docks')!.push([{ ...entry }])
+  await nextTick()
+  expect(attempts).toBe(2)
+})
+
+it('does not invoke action docks while initializing page scripts', async () => {
+  expect.assertions(2)
+  let attempts = 0
+  globalThis.__DEVFRAME_CLIENT_SCRIPT_ATTEMPT__ = () => {
+    attempts++
+  }
+  const { rpc, sharedStates } = createStubRpc()
+  const context = await createDocksContext('embedded', rpc)
+  const entry = {
+    id: 'explicit-action-script',
+    type: 'action',
+    title: 'Explicit action',
+    icon: 'ph:play',
+    action: { importFrom: 'data:text/javascript,export default () => globalThis.__DEVFRAME_CLIENT_SCRIPT_ATTEMPT__()' },
+  } satisfies DevframeDockEntry
+  sharedStates.get('devframe:docks')!.push([entry])
+  await nextTick()
+  expect(attempts).toBe(0)
+  await context.docks.switchEntry(entry.id)
+  expect(attempts).toBe(1)
+})
+
+it('keeps an eager custom-render renderer activation-gated so it mounts into its panel', async () => {
+  expect.assertions(2)
+  let attempts = 0
+  globalThis.__DEVFRAME_CLIENT_SCRIPT_ATTEMPT__ = () => {
+    attempts++
+  }
+  const { rpc, sharedStates } = createStubRpc()
+  const context = await createDocksContext('embedded', rpc)
+  const entry = {
+    id: 'eager-renderer',
+    type: 'custom-render',
+    title: 'Eager renderer',
+    icon: 'ph:play',
+    renderer: { eager: true, importFrom: 'data:text/javascript,export default () => globalThis.__DEVFRAME_CLIENT_SCRIPT_ATTEMPT__()' },
+  } satisfies DevframeDockEntry
+  sharedStates.get('devframe:docks')!.push([entry])
+  await nextTick()
+  // A renderer needs its mounted panel, so `eager` must not run it before activation.
+  expect(attempts).toBe(0)
+  await context.docks.switchEntry(entry.id)
+  expect(attempts).toBe(1)
+})
+
+it.each([undefined, false] as const)('keeps page setup lazy when eager is %s', async (eager) => {
+  expect.assertions(3)
+  const attempt = vi.fn()
+  globalThis.__DEVFRAME_CLIENT_SCRIPT_ATTEMPT__ = attempt
+  const { rpc, sharedStates } = createStubRpc()
+  const context = await createDocksContext('embedded', rpc)
+  const entry = {
+    id: 'lazy-page',
+    type: 'iframe',
+    title: 'Lazy page',
+    icon: 'ph:browser',
+    url: '/fixture',
+    clientScript: { eager, importFrom: 'data:text/javascript,export default () => globalThis.__DEVFRAME_CLIENT_SCRIPT_ATTEMPT__()' },
+  } satisfies DevframeDockEntry
+  sharedStates.get('devframe:docks')!.push([entry])
+  await nextTick()
+  expect(attempt).not.toHaveBeenCalled()
+  await context.docks.switchEntry(entry.id)
+  expect(attempt).toHaveBeenCalledOnce()
+  await context.docks.switchEntry(null)
+  await context.docks.switchEntry(entry.id)
+  expect(attempt).toHaveBeenCalledOnce()
+})
+
+it('awaits an eager page setup before activation and retries it after failure', async () => {
+  expect.assertions(5)
+  vi.spyOn(console, 'error').mockImplementation(() => {})
+  let complete!: () => void
+  let attempts = 0
+  globalThis.__DEVFRAME_CLIENT_SCRIPT_ATTEMPT__ = () => {
+    attempts++
+    if (attempts === 1)
+      throw new Error('page setup failed')
+    if (attempts === 2)
+      return new Promise<void>((resolve) => { complete = resolve })
+  }
+  const { rpc, sharedStates } = createStubRpc()
+  const context = await createDocksContext('embedded', rpc)
+  const script = { importFrom: 'data:text/javascript,export default () => globalThis.__DEVFRAME_CLIENT_SCRIPT_ATTEMPT__()' }
+  const entry = {
+    id: 'retry-page-before-activation',
+    type: 'iframe',
+    title: 'Retry page',
+    icon: 'ph:play',
+    url: '/fixture',
+    clientScript: { ...script, eager: true },
+  } satisfies DevframeDockEntry
+  sharedStates.get('devframe:docks')!.push([entry])
+  await expect.poll(() => attempts).toBe(1)
+  const activation = context.docks.switchEntry(entry.id)
+  await expect.poll(() => attempts).toBe(2)
+  expect(context.docks.selectedId).toBeNull()
+  complete()
+  await expect(activation).resolves.toBe(true)
+  expect(attempts).toBe(2)
+})
+
+it.each([false, true])('retries setup after trust is revoked during import (eager: %s)', async (eager) => {
+  expect.assertions(6)
+  const reportError = vi.spyOn(console, 'error').mockImplementation(() => {})
+  const { rpc, sharedStates: states } = createStubRpc()
+  const context = await createDocksContext('embedded', rpc)
+  const docks = context.docks
+  const fixture = globalThis as typeof globalThis & { __DF_IMPORT_GATE_UI__?: () => Promise<void>, __DF_IMPORT_SETUP_UI__?: () => void }
+  let releaseImport!: () => void
+  const importGate = new Promise<void>((resolve) => {
+    releaseImport = resolve
+  })
+  const importing = vi.fn(() => importGate)
+  const setup = vi.fn()
+  fixture.__DF_IMPORT_GATE_UI__ = importing
+  fixture.__DF_IMPORT_SETUP_UI__ = setup
+  const entry = {
+    id: `revoked-import-${eager}`,
+    type: 'iframe',
+    title: 'Revoked import',
+    icon: 'ph:browser',
+    url: '/fixture',
+    clientScript: {
+      eager,
+      importFrom: `data:text/javascript,await globalThis.__DF_IMPORT_GATE_UI__(); export default () => globalThis.__DF_IMPORT_SETUP_UI__(); // ${eager}`,
+    },
+  } satisfies DevframeDockEntry
+  try {
+    states.get('devframe:docks')!.push([entry])
+    const activation = docks.switchEntry(entry.id)
+    const rejected = expect(activation).rejects.toThrow('no longer trusted')
+    await expect.poll(() => importing.mock.calls.length).toBe(1)
+    Object.assign(rpc, { isTrusted: false })
+    rpc.events.emit(DEVFRAME_EVENTS.client.isTrustedUpdated, false)
+    releaseImport()
+    await rejected
+    expect(setup).not.toHaveBeenCalled()
+    expect(docks.selectedId).toBeNull()
+    Object.assign(rpc, { isTrusted: true })
+    rpc.events.emit(DEVFRAME_EVENTS.client.isTrustedUpdated, true)
+    await expect(docks.switchEntry(entry.id)).resolves.toBe(true)
+    expect(setup).toHaveBeenCalledOnce()
+  }
+  finally {
+    releaseImport()
+    delete fixture.__DF_IMPORT_GATE_UI__
+    delete fixture.__DF_IMPORT_SETUP_UI__
+    reportError.mockRestore()
+  }
+})
+
+it('does not activate an iframe when trust is lost while its setup completes', async () => {
+  expect.assertions(2)
+  const { rpc, sharedStates: states } = createStubRpc()
+  const context = await createDocksContext('embedded', rpc)
+  const docks = context.docks
+  const fixture = globalThis as typeof globalThis & { __DF_SETUP_REVOKE_UI__?: () => void }
+  fixture.__DF_SETUP_REVOKE_UI__ = () => {
+    Object.assign(rpc, { isTrusted: false })
+    rpc.events.emit(DEVFRAME_EVENTS.client.isTrustedUpdated, false)
+  }
+  const entry = {
+    id: 'revoked-during-setup',
+    type: 'iframe',
+    title: 'Revoked setup',
+    icon: 'ph:browser',
+    url: '/fixture',
+    clientScript: { importFrom: 'data:text/javascript,export default async () => globalThis.__DF_SETUP_REVOKE_UI__()' },
+  } satisfies DevframeDockEntry
+  try {
+    states.get('devframe:docks')!.push([entry])
+    await expect(docks.switchEntry(entry.id)).resolves.toBe(false)
+    expect(docks.selectedId).toBeNull()
+  }
+  finally {
+    delete fixture.__DF_SETUP_REVOKE_UI__
+  }
+})

### packages/hub-ui/src/client/state/context.test.ts [modified, +2/-1]
@@ -10,7 +10,8 @@ import { nextTick, ref } from 'vue'
 import { createDocksContext } from './context'
 import { executeSetupScript } from './setup-script'
 
-vi.mock('./setup-script', () => ({
+vi.mock('./setup-script', async importOriginal => ({
+  ...await importOriginal<typeof import('./setup-script')>(),
   executeSetupScript: vi.fn(async () => {}),
 }))
 

### packages/hub-ui/src/client/state/context.ts [modified, +44/-11]
@@ -17,7 +17,7 @@ import { createDockEntryState, DEFAULT_DOCK_PANEL_STORE, DEFAULT_DOCK_SESSION_ST
 import { createClientMessagesClient } from './messages-client'
 import { dockCommandId } from './palette'
 import { registerMainFrameDockActionHandler, triggerMainFrameDockAction, useIsDockPopupOpen } from './popup'
-import { executeSetupScript } from './setup-script'
+import { clientScriptOf, executeSetupScript } from './setup-script'
 
 const docksContextByRpc = new WeakMap<DevframeRpcClient, DocksContext>()
 export async function createDocksContext(
@@ -229,17 +229,39 @@ export async function createDocksContext(
     return null
   }
 
-  const runDockSetupScript = async (entry: DevframeDockEntry) => {
-    const hasScript = entry.type === 'action' || entry.type === 'custom-render' || (entry.type === 'iframe' && entry.clientScript)
-    if (!hasScript)
-      return
-    const messagesClient = createClientMessagesClient(rpc)
-    const scriptContext: DockClientScriptContext = reactive({
+  function scriptContext(entry: DevframeDockEntry): DockClientScriptContext {
+    return reactive({
       ...toRefs(docksContext) as any,
       current: dockEntryStateMap.get(entry.id)!,
-      messages: messagesClient,
+      messages: createClientMessagesClient(rpc),
     })
-    await executeSetupScript(entry, scriptContext)
+  }
+
+  async function runPageScript(entry: DevframeDockEntry): Promise<void> {
+    if (entry.type !== 'iframe' || !entry.clientScript)
+      return
+    await executeSetupScript(entry, scriptContext(entry))
+  }
+
+  async function runActivationScript(entry: DevframeDockEntry): Promise<void> {
+    if (entry.type === 'action' || entry.type === 'custom-render')
+      await executeSetupScript(entry, scriptContext(entry))
+  }
+
+  /** Only explicitly eager descriptors run before activation, after the RPC connection is trusted. */
+  function startPageScripts(): void {
+    if (!rpc.isTrusted)
+      return
+    for (const entry of entries.value) {
+      // A `custom-render` renderer needs its mounted panel, so it stays
+      // activation-gated; only panel-independent page and action scripts run eagerly.
+      if (entry.type !== 'iframe' && entry.type !== 'action')
+        continue
+      if (!clientScriptOf(entry)?.eager)
+        continue
+      /** Setup reports failures and allows the next activation or publication to retry. */
+      void executeSetupScript(entry, scriptContext(entry), true).catch(() => {})
+    }
   }
 
   // Remember selection redirects: a member tab as its frame's live tab, and a
@@ -286,11 +308,17 @@ export async function createDocksContext(
         return false
     }
 
+    if (!rpc.isTrusted)
+      return false
+    await runPageScript(entry)
+    if (!rpc.isTrusted)
+      return false
+
     initialRestorePending.value = false
     selectedDockId.value = entry.id
     sessionStore.value.open = true
 
-    await runDockSetupScript(entry)
+    await runActivationScript(entry)
     rememberEntrySelection(entry)
     return true
   }
@@ -372,8 +400,10 @@ export async function createDocksContext(
     name: HUB_EVENTS.broadcast.docksActivate satisfies keyof DevframeRpcClientFunctions,
     type: 'action',
     handler: (activation: { dockId: string, params?: Record<string, unknown> }) => {
+      // `switchEntry` rejects when a lazy client script fails so its cache entry
+      // stays retryable; the failure is already logged, so swallow it here.
       if (activation?.dockId)
-        switchEntry(activation.dockId)
+        void switchEntry(activation.dockId).catch(() => {})
     },
   })
 
@@ -707,6 +737,9 @@ export async function createDocksContext(
   )
   void restoreAfterInitialization()
 
+  watch(entries, startPageScripts, { immediate: true })
+  rpc.events.on(DEVFRAME_EVENTS.client.isTrustedUpdated, startPageScripts)
+
   docksContextByRpc.set(rpc, docksContext)
   return docksContext
 }

### packages/hub-ui/src/client/state/setup-script.ts [modified, +35/-30]
@@ -1,29 +1,22 @@
 import type { ClientScriptEntry, DevframeDockUserEntry } from '@devframes/hub'
-import type { DockClientScriptContext } from '@devframes/hub/client'
+import type { DevframeRpcClient, DockClientScriptContext } from '@devframes/hub/client'
 import { clientScriptFailureHint, resolveClientModuleSpecifier } from '@devframes/hub/client'
 
-/**
- * Resolve the {@link ClientScriptEntry} a dock entry carries: an `action`'s
- * `action`, a `custom-render`'s `renderer`, or an iframe's `clientScript`.
- */
-function clientScriptOf(entry: DevframeDockUserEntry): ClientScriptEntry | undefined {
-  switch (entry.type) {
-    case 'action':
-      return entry.action
-    case 'custom-render':
-      return entry.renderer
-    case 'iframe':
-      return entry.clientScript
-    default:
-      return undefined
-  }
+/** Resolve the existing script field for this dock kind. */
+export function clientScriptOf(entry: DevframeDockUserEntry): ClientScriptEntry | undefined {
+  if (entry.type === 'iframe')
+    return entry.clientScript
+  if (entry.type === 'action')
+    return entry.action
+  if (entry.type === 'custom-render')
+    return entry.renderer
 }
 
 async function _executeSetupScript(
   entry: DevframeDockUserEntry,
   context: DockClientScriptContext,
+  script: ClientScriptEntry | undefined,
 ): Promise<void> {
-  const script = clientScriptOf(entry)
   if (!script?.importFrom)
     throw new Error(`[@devframes/hub-ui] Dock entry "${entry.id}" carries no client script to run`)
   // A bare specifier resolves through the host-advertised template; URL
@@ -41,6 +34,9 @@ async function _executeSetupScript(
     const fn = mod[script.importName ?? 'default']
     if (typeof fn !== 'function')
       throw new Error(`[@devframes/hub-ui] "${specifier}" exports no callable "${script.importName ?? 'default'}"`)
+    /** Trust may change while the module is loading; rejection keeps setup retryable. */
+    if (!context.rpc.isTrusted)
+      throw new Error('[@devframes/hub-ui] RPC client is no longer trusted')
     await fn(context)
   }
   catch (error) {
@@ -53,23 +49,32 @@ async function _executeSetupScript(
     throw error
   }
 }
-const _setupPromises = new Map<string, Promise<void>>()
+const setupPromisesByRpc = new WeakMap<DevframeRpcClient, Map<string, Promise<void>>>()
+
+/** Cache setup per RPC connection and dock; explicit action clicks always run again. */
 export function executeSetupScript(
   entry: DevframeDockUserEntry,
   context: DockClientScriptContext,
+  cache = entry.type !== 'action',
 ): Promise<void> {
-  // Actions should re-execute on every click; only cache non-action scripts
-  if (entry.type !== 'action' && _setupPromises.has(entry.id))
-    return _setupPromises.get(entry.id)!
-  const promise = _executeSetupScript(entry, context)
-  if (entry.type !== 'action') {
-    _setupPromises.set(entry.id, promise)
-    promise.catch(() => {
-      // A failed setup must not poison this entry permanently. The caller still
-      // receives the rejection, while a later activation or update may retry.
-      if (_setupPromises.get(entry.id) === promise)
-        _setupPromises.delete(entry.id)
-    })
+  const script = clientScriptOf(entry)
+  let setupPromises = setupPromisesByRpc.get(context.rpc)
+  if (!setupPromises) {
+    setupPromises = new Map()
+    setupPromisesByRpc.set(context.rpc, setupPromises)
   }
+  const key = JSON.stringify([entry.id, script?.importFrom, script?.importName ?? 'default'])
+  const existing = setupPromises.get(key)
+  if (cache && existing)
+    return existing
+  const promise = _executeSetupScript(entry, context, script)
+  if (!cache)
+    return promise
+  setupPromises.set(key, promise)
+  void promise.catch(() => {
+    /** Failed setup can retry on activation or a later dock publication. */
+    if (setupPromises.get(key) === promise)
+      setupPromises.delete(key)
+  })
   return promise
 }

### packages/hub/src/client/__tests__/host.test.ts [modified, +144/-2]
@@ -1,6 +1,7 @@
 import type { DevframeRpcClient } from 'devframe/client'
 import type { SharedState } from 'devframe/utils/shared-state'
 import type { DevframeDockEntry, DevframeDockPanelState } from '../../types/docks'
+import { DEVFRAME_EVENTS } from 'devframe/constants'
 import { createEventEmitter } from 'devframe/utils/events'
 import { describe, expect, it, vi } from 'vitest'
 import { HUB_EVENTS } from '../../events'
@@ -38,6 +39,8 @@ function createStubRpc() {
   const states = new Map<string, StubSharedState<any>>()
   const definitions = new Map<string, { name: string, type: string, handler?: (...args: any[]) => any }>()
   const partial: DeepPartial<DevframeRpcClient> = {
+    isTrusted: true,
+    events: createEventEmitter<any>(),
     sharedState: {
       async get(key: string, options?: { initialValue?: any }) {
         if (!states.has(key))
@@ -301,7 +304,7 @@ describe('createDevframeClientRuntime', () => {
     const received: any[] = []
     ;(globalThis as any).__DF_TEST_CLIENT_DOCK__ = (ctx: any) => received.push(ctx)
     const dataUrl = `data:text/javascript,export default ctx => globalThis.__DF_TEST_CLIENT_DOCK__(ctx)`
-    host.context.docks.register(iframeEntry('local', { clientScript: { importFrom: dataUrl } }))
+    host.context.docks.register(iframeEntry('local', { clientScript: { eager: true, importFrom: dataUrl } }))
 
     await vi.waitFor(() => expect(received).toHaveLength(1))
     expect(received[0].current.entryMeta.id).toBe('local')
@@ -380,7 +383,7 @@ describe('createDevframeClientRuntime', () => {
     ;(globalThis as any).__DF_TEST_SCRIPT__ = (ctx: any) => received.push(ctx)
     const dataUrl = `data:text/javascript,export default ctx => globalThis.__DF_TEST_SCRIPT__(ctx)`
     states.get('devframe:docks')!.push([
-      iframeEntry('scripted', { clientScript: { importFrom: dataUrl } }),
+      iframeEntry('scripted', { clientScript: { eager: true, importFrom: dataUrl } }),
     ])
 
     await vi.waitFor(() => expect(received).toHaveLength(1))
@@ -421,3 +424,142 @@ describe('createDevframeClientRuntime', () => {
     }
   })
 })
+
+it('waits for trust for eager setup and activation for lazy setup in the headless runtime', async () => {
+  expect.assertions(5)
+  const { rpc, states } = createStubRpc()
+  Object.assign(rpc, { isTrusted: false })
+  const runtime = await createDevframeClientRuntime({ rpc })
+  const attempt = vi.fn()
+  const fixture = globalThis as typeof globalThis & { __DF_LAZY_TEST__?: () => void }
+  fixture.__DF_LAZY_TEST__ = attempt
+  const script = { importFrom: 'data:text/javascript,export default () => globalThis.__DF_LAZY_TEST__()' }
+  const eager = iframeEntry('eager', { clientScript: { ...script, eager: true } })
+  const lazy = iframeEntry('lazy', { clientScript: script })
+  try {
+    states.get('devframe:docks')!.push([eager, lazy])
+    expect(attempt).not.toHaveBeenCalled()
+    await expect(runtime.context.docks.switchEntry('lazy')).resolves.toBe(false)
+    Object.assign(rpc, { isTrusted: true })
+    rpc.events.emit(DEVFRAME_EVENTS.client.isTrustedUpdated, true)
+    await expect.poll(() => attempt.mock.calls.length).toBe(1)
+    await runtime.context.docks.switchEntry('lazy')
+    expect(attempt).toHaveBeenCalledTimes(2)
+    await runtime.context.docks.switchEntry(null)
+    await runtime.context.docks.switchEntry('lazy')
+    expect(attempt).toHaveBeenCalledTimes(2)
+  }
+  finally {
+    runtime.dispose()
+    delete fixture.__DF_LAZY_TEST__
+  }
+})
+
+it('keeps an eager custom-render renderer activation-gated in the headless runtime', async () => {
+  expect.assertions(2)
+  const { rpc, states } = createStubRpc()
+  const runtime = await createDevframeClientRuntime({ rpc })
+  const attempt = vi.fn()
+  const fixture = globalThis as typeof globalThis & { __DF_RENDERER_TEST__?: () => void }
+  fixture.__DF_RENDERER_TEST__ = attempt
+  const entry = {
+    id: 'eager-renderer',
+    title: 'Eager renderer',
+    icon: 'ph:cube',
+    type: 'custom-render',
+    renderer: { eager: true, importFrom: 'data:text/javascript,export default () => globalThis.__DF_RENDERER_TEST__()' },
+  } satisfies DevframeDockEntry
+  try {
+    states.get('devframe:docks')!.push([entry])
+    // Give any eager import a chance to resolve; a renderer needs its mounted
+    // panel, so `eager` must not run it before activation.
+    await new Promise(resolve => setTimeout(resolve, 10))
+    expect(attempt).not.toHaveBeenCalled()
+    await runtime.context.docks.switchEntry(entry.id)
+    expect(attempt).toHaveBeenCalledTimes(1)
+  }
+  finally {
+    runtime.dispose()
+    delete fixture.__DF_RENDERER_TEST__
+  }
+})
+
+it.each([false, true])('retries setup after trust is revoked during import (eager: %s)', async (eager) => {
+  expect.assertions(6)
+  const reportError = vi.spyOn(console, 'error').mockImplementation(() => {})
+  const { rpc, states } = createStubRpc()
+  const runtime = await createDevframeClientRuntime({ rpc })
+  const docks = runtime.context.docks
+  const fixture = globalThis as typeof globalThis & { __DF_IMPORT_GATE_HEADLESS__?: () => Promise<void>, __DF_IMPORT_SETUP_HEADLESS__?: () => void }
+  let releaseImport!: () => void
+  const importGate = new Promise<void>((resolve) => {
+    releaseImport = resolve
+  })
+  const importing = vi.fn(() => importGate)
+  const setup = vi.fn()
+  fixture.__DF_IMPORT_GATE_HEADLESS__ = importing
+  fixture.__DF_IMPORT_SETUP_HEADLESS__ = setup
+  const entry = {
+    id: `revoked-import-${eager}`,
+    type: 'iframe',
+    title: 'Revoked import',
+    icon: 'ph:browser',
+    url: '/fixture',
+    clientScript: {
+      eager,
+      importFrom: `data:text/javascript,await globalThis.__DF_IMPORT_GATE_HEADLESS__(); export default () => globalThis.__DF_IMPORT_SETUP_HEADLESS__(); // ${eager}`,
+    },
+  } satisfies DevframeDockEntry
+  try {
+    states.get('devframe:docks')!.push([entry])
+    const activation = docks.switchEntry(entry.id)
+    const rejected = expect(activation).rejects.toThrow('no longer trusted')
+    await expect.poll(() => importing.mock.calls.length).toBe(1)
+    Object.assign(rpc, { isTrusted: false })
+    rpc.events.emit(DEVFRAME_EVENTS.client.isTrustedUpdated, false)
+    releaseImport()
+    await rejected
+    expect(setup).not.toHaveBeenCalled()
+    expect(docks.selectedId).toBeNull()
+    Object.assign(rpc, { isTrusted: true })
+    rpc.events.emit(DEVFRAME_EVENTS.client.isTrustedUpdated, true)
+    await expect(docks.switchEntry(entry.id)).resolves.toBe(true)
+    expect(setup).toHaveBeenCalledOnce()
+  }
+  finally {
+    releaseImport()
+    delete fixture.__DF_IMPORT_GATE_HEADLESS__
+    delete fixture.__DF_IMPORT_SETUP_HEADLESS__
+    reportError.mockRestore()
+    runtime.dispose()
+  }
+})
+
+it('does not activate an iframe when trust is lost while its setup completes', async () => {
+  expect.assertions(2)
+  const { rpc, states } = createStubRpc()
+  const runtime = await createDevframeClientRuntime({ rpc })
+  const docks = runtime.context.docks
+  const fixture = globalThis as typeof globalThis & { __DF_SETUP_REVOKE_HEADLESS__?: () => void }
+  fixture.__DF_SETUP_REVOKE_HEADLESS__ = () => {
+    Object.assign(rpc, { isTrusted: false })
+    rpc.events.emit(DEVFRAME_EVENTS.client.isTrustedUpdated, false)
+  }
+  const entry = {
+    id: 'revoked-during-setup',
+    type: 'iframe',
+    title: 'Revoked setup',
+    icon: 'ph:browser',
+    url: '/fixture',
+    clientScript: { importFrom: 'data:text/javascript,export default async () => globalThis.__DF_SETUP_REVOKE_HEADLESS__()' },
+  } satisfies DevframeDockEntry
+  try {
+    states.get('devframe:docks')!.push([entry])
+    await expect(docks.switchEntry(entry.id)).resolves.toBe(false)
+    expect(docks.selectedId).toBeNull()
+  }
+  finally {
+    delete fixture.__DF_SETUP_REVOKE_HEADLESS__
+    runtime.dispose()
+  }
+})

### packages/hub/src/client/__tests__/renderers.test.ts [modified, +2/-0]
@@ -33,6 +33,8 @@ function createStubSharedState<T>(initial: T): StubSharedState<T> {
 function createStubRpc() {
   const states = new Map<string, StubSharedState<any>>()
   const partial: DeepPartial<DevframeRpcClient> = {
+    isTrusted: true,
+    events: createEventEmitter<any>(),
     sharedState: {
       async get(key: string, options?: { initialValue?: any }) {
         if (!states.has(key))

### packages/hub/src/client/host.ts [modified, +71/-16]
@@ -27,6 +27,7 @@ import type {
 } from './docks'
 import type { DockRenderer, DockRendererManifest, DockRenderersContext } from './renderers'
 import { connectDevframe } from 'devframe/client'
+import { DEVFRAME_EVENTS } from 'devframe/constants'
 import { createEventEmitter } from 'devframe/utils/events'
 import { clientScriptFailureHint, resolveClientModuleSpecifier } from '../client-modules'
 import { DEFAULT_CATEGORIES_ORDER, DEFAULT_STATE_USER_SETTINGS, DOCK_RENDERERS_STATE_KEY } from '../constants'
@@ -199,8 +200,10 @@ export async function createDevframeClientRuntime(
   // unknown ids. Chain onto any handler a co-consumer already registered on
   // this rpc client rather than replacing it.
   const activateHandler = (activation: { dockId?: string } | undefined): void => {
+    // `switchEntry` rejects when a lazy client script fails so its cache entry
+    // stays retryable; the failure is already logged, so swallow it here.
     if (activation?.dockId)
-      void switchEntry(activation.dockId)
+      void switchEntry(activation.dockId).catch(() => {})
   }
   const existingActivate = rpc.client.definitions.get(DOCKS_ACTIVATE_EVENT)
   if (existingActivate) {
@@ -235,15 +238,18 @@ export async function createDevframeClientRuntime(
   }
   setDevframeClientContext(context)
 
-  const loadedScripts = new Set<string>()
+  let disposed = false
+  const loadedScripts = new Map<string, Promise<void>>()
   if (loadScriptsEnabled) {
     loadClientScripts()
     disposers.push(docksState.on('updated', loadClientScripts))
+    disposers.push(rpc.events.on(DEVFRAME_EVENTS.client.isTrustedUpdated, loadClientScripts))
   }
 
   return {
     context,
     dispose() {
+      disposed = true
       for (const off of disposers.splice(0)) off()
       for (const disposeAdapter of frameNavAdapters.values()) disposeAdapter()
       frameNavAdapters.clear()
@@ -363,7 +369,9 @@ export async function createDevframeClientRuntime(
         return selectedId
       },
       set selectedId(id: string | null) {
-        void switchEntry(id)
+        // Setter can't surface a rejection; `switchEntry` already logs a failed
+        // client script and keeps its cache entry retryable.
+        void switchEntry(id).catch(() => {})
       },
       /**
        * A mirror of the session field, so a persisting host reads and writes the
@@ -417,13 +425,34 @@ export async function createDevframeClientRuntime(
     return ctx
   }
 
+  async function preparePageScript(entry: DevframeDockEntry): Promise<boolean> {
+    if (!rpc.isTrusted)
+      return false
+    if (entry.type === 'iframe' && entry.clientScript)
+      await setupClientScript(entry.id, entry.clientScript)
+    return !disposed && rpc.isTrusted && entryToStateMap.get(entry.id)?.entryMeta === entry
+  }
+
+  async function runActivationScript(entry: DevframeDockEntry): Promise<void> {
+    if (entry.type === 'action')
+      await setupClientScript(entry.id, entry.action, false)
+    else if (entry.type === 'custom-render')
+      await setupClientScript(entry.id, entry.renderer)
+  }
+
   async function switchEntry(id?: string | null): Promise<boolean> {
     const next = id ?? null
-    if (next === selectedId)
+    if (next === selectedId && entryToStateMap.get(next ?? '')?.entryMeta.type !== 'action')
       return false
     if (next !== null && !entryToStateMap.has(next))
       return false
 
+    const entry = entryToStateMap.get(next ?? '')?.entryMeta
+    if (entry && loadScriptsEnabled && !rpc.isTrusted)
+      return false
+    if (entry?.type === 'iframe' && entry.clientScript && loadScriptsEnabled && !await preparePageScript(entry))
+      return false
+
     const previous = selectedId
     selectedId = next
     // Mirror onto the session context so a persisting host and the when-clause
@@ -437,6 +466,8 @@ export async function createDevframeClientRuntime(
       entryToStateMap.get(previous)?.events.emit('entry:deactivated')
     if (next)
       entryToStateMap.get(next)?.events.emit('entry:activated')
+    if (entry && loadScriptsEnabled)
+      await runActivationScript(entry)
     return true
   }
 
@@ -524,20 +555,41 @@ export async function createDevframeClientRuntime(
 
   // ── client scripts ───────────────────────────────────────────────────────
 
-  function clientScriptOf(entry: DevframeDockEntry): ClientScriptEntry | undefined {
-    return (entry as any).action ?? (entry as any).renderer ?? (entry as any).clientScript
-  }
-
   function loadClientScripts(): void {
+    if (disposed || !rpc.isTrusted)
+      return
+    // A `custom-render` renderer needs its mounted panel, so it stays
+    // activation-gated; only panel-independent page and action scripts run eagerly.
     for (const entry of currentEntries()) {
-      const script = clientScriptOf(entry)
-      if (!script?.importFrom || loadedScripts.has(entry.id))
-        continue
-      loadedScripts.add(entry.id)
-      void runClientScript(entry.id, script)
+      if (entry.type === 'iframe')
+        startEagerScript(entry.id, entry.clientScript)
+      else if (entry.type === 'action')
+        startEagerScript(entry.id, entry.action)
     }
   }
 
+  function startEagerScript(entryId: string, script: ClientScriptEntry | undefined): void {
+    if (script?.eager)
+      void setupClientScript(entryId, script).catch(() => {})
+  }
+
+  /** Share eager and activation setup; explicit action invocations bypass the cache. */
+  function setupClientScript(entryId: string, script: ClientScriptEntry, cache = true): Promise<void> {
+    const key = JSON.stringify([entryId, script.importFrom, script.importName ?? 'default'])
+    const existing = loadedScripts.get(key)
+    if (cache && existing)
+      return existing
+    const promise = runClientScript(entryId, script)
+    if (!cache)
+      return promise
+    loadedScripts.set(key, promise)
+    void promise.catch(() => {
+      if (loadedScripts.get(key) === promise)
+        loadedScripts.delete(key)
+    })
+    return promise
+  }
+
   async function runClientScript(entryId: string, script: ClientScriptEntry): Promise<void> {
     // A bare specifier resolves through the explicit option, then the
     // host-advertised template; URL specifiers pass through untouched. (The
@@ -554,22 +606,25 @@ export async function createDevframeClientRuntime(
       const mod = await import(/* @vite-ignore */ /* webpackIgnore: true */ /* turbopackIgnore: true */ specifier)
       const fn = mod[script.importName ?? 'default']
       if (typeof fn !== 'function')
-        return
+        throw new Error(`[@devframes/hub] "${specifier}" exports no callable "${script.importName ?? 'default'}"`)
       const current = entryToStateMap.get(entryId)
-      if (!current)
+      if (!current || disposed)
         return
+      /** Reject instead of caching skipped setup so re-authentication can retry it. */
+      if (!rpc.isTrusted)
+        throw new Error('[@devframes/hub] RPC client is no longer trusted')
       // Scope the messages client to this entry: its messages default their
       // `category` to the entry id, so the feed can attribute and group them.
       const messages = createMessagesClient(rpc, { defaults: { category: entryId } })
       const scriptContext: DockClientScriptContext = { ...context, current, messages }
       await fn(scriptContext)
     }
     catch (error) {
-      loadedScripts.delete(entryId)
       console.error(
         `[@devframes/hub] failed to load client script for "${entryId}" from ${specifier}${clientScriptFailureHint(script.importFrom, specifier)}`,
         error,
       )
+      throw error
     }
   }
 }

### packages/hub/src/types/docks.ts [modified, +6/-3]
@@ -171,6 +171,11 @@ export interface DevframeDockEntryBase {
 }
 
 export interface ClientScriptEntry {
+  /**
+   * Initialize after trust without waiting for dock activation.
+   * @default false
+   */
+  eager?: boolean
   /**
    * What to import: either a **URL the host serves** (a self-contained ES
    * module, e.g. `/@fs/<abs path>` under Vite or a statically-mounted bundle
@@ -231,9 +236,7 @@ export interface DevframeViewIframe extends DevframeDockEntryBase {
    * share a `frameId` may live in one group, several groups, or none.
    */
   frameId?: string
-  /**
-   * Optional client script to import into the iframe
-   */
+  /** Optional page script, initialized on activation or after trust when `eager: true`. */
   clientScript?: ClientScriptEntry
   /**
    * Soft-navigation target within a shared frame. Set on a **member** dock

### tests/__snapshots__/tsnapi/@devframes/hub/index.snapshot.d.ts [modified, +1/-0]
@@ -3,6 +3,7 @@
  */
 // #region Interfaces
 export interface ClientScriptEntry {
+  eager?: boolean;
   importFrom: string;
   importName?: string;
 }

### tests/__snapshots__/tsnapi/devframe/index.snapshot.d.ts [modified, +1/-0]
@@ -171,6 +171,7 @@ export interface DevframeDockDefaults {
   badge?: string;
   groupId?: string;
   clientScript?: {
+    eager?: boolean;
     importFrom: string;
     importName?: string;
   };

Respond and categorize in English.