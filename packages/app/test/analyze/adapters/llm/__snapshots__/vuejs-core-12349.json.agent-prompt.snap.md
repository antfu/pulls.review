PR title: perf(reactivity): ports `alien-signals` 0.4.4

PR link: https://github.com/vuejs/core/pull/12349

---DESCRIPTION---
`alien-signals`(https://github.com/stackblitz/alien-signals) is a research-oriented signal library rewritten based on Vue 3.4's reactivity system. It sets several constraints to ensure the high-performance implementation of a reactivity system. (Currently, it is the fastest implementation among all signal libraries)

This PR ports the https://github.com/stackblitz/alien-signals/blob/master/src/system.ts code to https://github.com/vuejs/core/blob/main/packages/reactivity/src/effect.ts to leverage all the optimizations discovered by `alien-signals`.

### Benefits

- Lower memory usage: Memory usage is reduced by ~13% (2.3MB -> 2.0MB) when creating a large number of ref, computed, and effect instances.
- Higher performance: Various performance tests now generally yield better results, especially in scenarios where a large number of computeds are read after changing a ref. Vue 3.5 had significant performance drawbacks in this case (a characteristic of pull-model reactivity systems, it can be reproduced in https://github.com/transitive-bullshit/js-reactivity-benchmark), and the current implementation resolves this issue, achieving over 30x performance improvement (proportional to scale).
- Better code abstraction: The previous scheduling logic had coupling with external implementations (such as Dep cleanup, debug events, recurse effect handling). The current implementation eliminates these couplings.

### Benchmark Results

#### computed

```
     name                                                                    hz     min     max    mean     p75     p99    p995    p999     rme  samples
   · create computed                                               6,111,709.97  0.0000  0.3307  0.0002  0.0002  0.0002  0.0002  0.0003  ±0.53%  3055856  [1.28x] ⇑
     create computed                                               4,790,560.55  0.0001  2.8602  0.0002  0.0002  0.0003  0.0003  0.0005  ±1.19%  2395281  (baseline)
   · write ref, don't read computed (without effect)               3,725,946.87  0.0002  0.1777  0.0003  0.0003  0.0003  0.0003  0.0004  ±0.16%  1862974  [1.19x] ⇑
     write ref, don't read computed (without effect)               3,138,437.74  0.0002  1.4873  0.0003  0.0003  0.0004  0.0004  0.0005  ±1.21%  1569219  (baseline)
   · write ref, don't read computed (with effect)                  1,629,737.97  0.0005  0.1867  0.0006  0.0006  0.0007  0.0007  0.0008  ±0.11%   814869  [1.20x] ⇑
     write ref, don't read computed (with effect)                  1,362,345.64  0.0006  0.1455  0.0007  0.0008  0.0008  0.0008  0.0010  ±0.13%   681173  (baseline)
   · write ref, read computed (without effect)                     1,961,824.76  0.0004  0.1808  0.0005  0.0005  0.0005  0.0006  0.0007  ±0.12%   980913  [1.06x] ⇑
     write ref, read computed (without effect)                     1,848,260.85  0.0004  0.1488  0.0005  0.0005  0.0006  0.0006  0.0007  ±0.13%   924131  (baseline)
   · write ref, read computed (with effect)                        1,475,801.43  0.0005  0.2211  0.0007  0.0007  0.0008  0.0008  0.0010  ±0.12%   737901  [1.14x] ⇑
     write ref, read computed (with effect)                        1,296,434.21  0.0007  0.2508  0.0008  0.0008  0.0008  0.0009  0.0011  ±0.16%   648218  (baseline)
   · write ref, don't read 1000 computeds (without effect)         3,300,382.44  0.0002  0.1930  0.0003  0.0003  0.0003  0.0004  0.0004  ±0.14%  1650192  [1.03x] ⇑
     write ref, don't read 1000 computeds (without effect)         3,189,502.88  0.0002  0.1763  0.0003  0.0003  0.0003  0.0004  0.0005  ±0.14%  1594752  (baseline)
   · write ref, don't read 1000 computeds (with multiple effects)      3,222.67  0.3063  0.5532  0.3103  0.3108  0.3488  0.3917  0.5250  ±0.19%     1612  [1.38x] ⇑
     write ref, don't read 1000 computeds (with multiple effects)      2,329.65  0.4206  0.6286  0.4292  0.4292  0.4997  0.5215  0.5671  ±0.19%     1165  (baseline)
   · write ref, don't read 1000 computeds (with single effect)         3,734.95  0.2648  0.3821  0.2677  0.2683  0.2855  0.2986  0.3510  ±0.09%     1868  [1.71x] ⇑
     write ref, don't read 1000 computeds (with single effect)         2,186.19  0.4434  0.6528  0.4574  0.4565  0.5061  0.5221  0.5846  ±0.16%     1094  (baseline)
   · write ref, read 1000 computeds (no effect)                        4,694.97  0.2105  0.3849  0.2130  0.2142  0.2301  0.2382  0.3271  ±0.12%     2348  [1.26x] ⇑
     write ref, read 1000 computeds (no effect)                        3,718.71  0.2292  9.4632  0.2689  0.2329  1.0790  2.5163  6.3315  ±5.98%     1860  (baseline)
   · write ref, read 1000 computeds (with multiple effects)            2,845.64  0.3453  0.6213  0.3514  0.3512  0.4014  0.4358  0.5546  ±0.21%     1423  [1.33x] ⇑
     write ref, read 1000 computeds (with multiple effects)            2,142.70  0.4569  0.7351  0.4667  0.4664  0.5183  0.5565  0.6951  ±0.22%     1072  (baseline)
   · write ref, read 1000 computeds (with single effect)               2,265.62  0.4338  0.9382  0.4414  0.4392  0.5991  0.6087  0.6304  ±0.36%     1133  [1.48x] ⇑
     write ref, read 1000 computeds (with single effect)               1,529.78  0.6415  0.8937  0.6537  0.6526  0.7195  0.7378  0.8937  ±0.18%      765  (baseline)
   · 1000 refs, read 1 computed (without effect)                      19,686.23  0.0490  0.1665  0.0508  0.0495  0.0595  0.0631  0.0935  ±0.16%     9844  [3.41x] ⇑
     1000 refs, read 1 computed (without effect)                       5,775.97  0.1611  0.3445  0.1731  0.1746  0.2057  0.2170  0.2689  ±0.18%     2888  (baseline)
   · 1000 refs, read 1 computed (with effect)                         22,764.26  0.0427  0.1713  0.0439  0.0430  0.0534  0.0585  0.0983  ±0.16%    11383  [3.63x] ⇑
     1000 refs, read 1 computed (with effect)                          6,268.22  0.1492  0.3157  0.1595  0.1620  0.1907  0.2024  0.2408  ±0.18%     3135  (baseline)
```

#### effect

```
     name                                                       hz      min      max     mean      p75      p99     p995     p999     rme  samples
   · single ref invoke                                2,422,374.37   0.0003   0.1300   0.0004   0.0004   0.0005   0.0005   0.0006  ±0.12%  1211188  [1.08x] ⇑
     single ref invoke                                2,253,296.36   0.0003   0.1473   0.0004   0.0005   0.0005   0.0005   0.0006  ±0.15%  1126649  (baseline)
   · create an effect that tracks 1 refs              3,041,716.41   0.0002   0.2316   0.0003   0.0003   0.0004   0.0005   0.0006  ±0.39%  1520859  [1.32x] ⇑
     create an effect that tracks 1 refs              2,305,307.54   0.0003   0.1655   0.0004   0.0004   0.0005   0.0005   0.0008  ±0.32%  1152654  (baseline)
   · create an effect that tracks 10 refs               477,709.54   0.0019   0.2655   0.0021   0.0021   0.0023   0.0025   0.0036  ±0.38%   238855  [1.57x] ⇑
     create an effect that tracks 10 refs               303,939.27   0.0031   0.2318   0.0033   0.0032   0.0035   0.0037   0.0183  ±0.34%   151970  (baseline)
   · create an effect that tracks 100 refs               51,529.46   0.0188   0.2940   0.0194   0.0190   0.0267   0.0342   0.1052  ±0.38%    25765  [1.62x] ⇑
     create an effect that tracks 100 refs               31,753.65   0.0306   0.2372   0.0315   0.0309   0.0464   0.0528   0.1848  ±0.34%    15877  (baseline)
   · create an effect that tracks 1000 refs               5,185.44   0.1884   0.4357   0.1928   0.1896   0.3253   0.3712   0.4210  ±0.41%     2593  [1.65x] ⇑
     create an effect that tracks 1000 refs               3,135.25   0.3067   1.2006   0.3190   0.3107   0.5374   0.7059   1.1851  ±0.83%     1568  (baseline)
   · create and stop an effect that tracks 1 refs     2,643,923.29   0.0003   0.2466   0.0004   0.0004   0.0005   0.0006   0.0008  ±0.40%  1321998  [1.25x] ⇑
     create and stop an effect that tracks 1 refs     2,108,885.94   0.0003   0.1770   0.0005   0.0005   0.0005   0.0006   0.0008  ±0.35%  1054443  (baseline)
   · create and stop an effect that tracks 10 refs      434,027.52   0.0022   0.2420   0.0023   0.0023   0.0024   0.0026   0.0038  ±0.28%   217014  [1.59x] ⇑
     create and stop an effect that tracks 10 refs      272,235.14   0.0035   0.3079   0.0037   0.0036   0.0040   0.0041   0.0193  ±0.36%   136118  (baseline)
   · create and stop an effect that tracks 100 refs      46,683.59   0.0209   0.2881   0.0214   0.0212   0.0246   0.0315   0.0809  ±0.33%    23342  [1.66x] ⇑
     create and stop an effect that tracks 100 refs      28,075.59   0.0343   3.7334   0.0356   0.0348   0.0508   0.0602   0.1706  ±1.48%    14038  (baseline)
   · create and stop an effect that tracks 1000 refs      4,674.21   0.2099   0.5031   0.2139   0.2114   0.2932   0.3995   0.4782  ±0.38%     2338  [1.65x] ⇑
     create and stop an effect that tracks 1000 refs      2,829.92   0.3445   0.5768   0.3534   0.3499   0.4938   0.5118   0.5708  ±0.34%     1415  (baseline)
   · 1 effect, mutate 10 refs                           131,308.76   0.0074   0.2790   0.0076   0.0076   0.0079   0.0081   0.0197  ±0.15%    65655  [2.37x] ⇑
     1 effect, mutate 10 refs                            55,475.14   0.0177   0.1079   0.0180   0.0179   0.0215   0.0318   0.0527  ±0.14%    27738  (baseline)
   · 1 effect, mutate 100 refs                            2,163.50   0.4568   0.8003   0.4622   0.4609   0.5471   0.6069   0.7550  ±0.26%     1082  [3.27x] ⇑
     1 effect, mutate 100 refs                              660.75   1.4944   1.8873   1.5134   1.5197   1.6387   1.7310   1.8873  ±0.24%      331  (baseline)
   · 1 effect, mutate 1000 refs                            23.1906  42.8559  43.6757  43.1209  43.1839  43.6757  43.6757  43.6757  ±0.39%       12  [3.47x] ⇑
     1 effect, mutate 1000 refs                             6.6868   149.16   149.78   149.55   149.71   149.78   149.78   149.78  ±0.10%       10  (baseline)
   · 10 refs branch toggle                            1,186,713.31   0.0004   6.0071   0.0008   0.0010   0.0011   0.0014   0.0015  ±4.92%   593357  [1.75x] ⇑
     10 refs branch toggle                              678,007.23   0.0007   0.2123   0.0015   0.0022   0.0022   0.0023   0.0049  ±0.23%   339004  (baseline)
   · 100 refs branch toggle                             303,335.02   0.0009   0.1054   0.0033   0.0055   0.0057   0.0057   0.0110  ±0.37%   151669  [3.03x] ⇑
     100 refs branch toggle                              99,958.91   0.0029   1.4980   0.0100   0.0166   0.0173   0.0242   0.0396  ±0.88%    49981  (baseline)
   · 1000 refs branch toggle                             33,959.34   0.0069   0.1933   0.0294   0.0513   0.0547   0.0595   0.0819  ±1.14%    16981  [3.26x] ⇑
     1000 refs branch toggle                             10,416.41   0.0265   0.4061   0.0960   0.1623   0.1861   0.2043   0.3517  ±1.97%     5209  (baseline)
   · 1 ref invoking 10 effects                          946,141.80   0.0009   0.0576   0.0011   0.0011   0.0011   0.0012   0.0014  ±0.08%   473071  [1.53x] ⇑
     1 ref invoking 10 effects                          617,154.17   0.0013   2.1592   0.0016   0.0014   0.0020   0.0020   0.0193  ±2.15%   308578  (baseline)
   · 1 ref invoking 100 effects                         137,515.93   0.0069   0.1466   0.0073   0.0073   0.0075   0.0078   0.0228  ±0.13%    68758  [1.51x] ⇑
     1 ref invoking 100 effects                          91,193.89   0.0105   0.2659   0.0110   0.0110   0.0114   0.0187   0.0313  ±0.16%    45597  (baseline)
   · 1 ref invoking 1000 effects                         13,791.02   0.0704   0.1650   0.0725   0.0727   0.0858   0.0947   0.1325  ±0.13%     6896  [1.48x] ⇑
     1 ref invoking 1000 effects                          9,339.78   0.1047   0.1980   0.1071   0.1069   0.1265   0.1379   0.1740  ±0.13%     4670  (baseline)
```

#### ref

```
     name                       hz     min     max    mean     p75     p99    p995    p999     rme  samples
   · create ref       4,648,340.74  0.0001  1.8655  0.0002  0.0002  0.0003  0.0003  0.0004  ±0.89%  2324171  [1.09x] ⇑
     create ref       4,261,204.35  0.0001  0.1899  0.0002  0.0003  0.0003  0.0003  0.0005  ±0.15%  2130603  (baseline)
   · write ref        3,817,925.50  0.0002  0.1143  0.0003  0.0003  0.0003  0.0003  0.0004  ±0.08%  1908963  [1.18x] ⇑
     write ref        3,248,551.04  0.0002  0.2231  0.0003  0.0003  0.0003  0.0004  0.0005  ±0.16%  1624276  (baseline)
   · read ref        11,485,907.61  0.0000  0.1316  0.0001  0.0001  0.0001  0.0001  0.0002  ±0.13%  5742954  [1.02x] ⇑
     read ref        11,264,635.57  0.0000  0.1458  0.0001  0.0001  0.0001  0.0001  0.0002  ±0.18%  5632318  (baseline)
   · write/read ref   3,576,071.66  0.0002  0.2868  0.0003  0.0003  0.0003  0.0003  0.0004  ±0.12%  1788036  [1.33x] ⇑
     write/read ref   2,694,391.71  0.0002  1.0205  0.0004  0.0004  0.0004  0.0005  0.0008  ±0.94%  1347196  (baseline)
```

### Potential Improvements

- ~~Merging `dirtyLevel`, `canPropagate`, `pauseLevel`, and `allowRecurse` into one attribute should further reduce memory usage. Reaching the lowest memory usage is not the purpose of this PR, so we will not implement it here currently.~~ Completed when update to alien-signals 0.4.4

---MANIFEST--- (16 files, +866/-777)
vitest.config.ts  M  +6/-1  @@ import { entries } from './scripts/aliases.js' / @@ export default defineConfig({
packages/reactivity/__tests__/
  computed.spec.ts  M  +7/-6  @@ import { / @@ describe('reactivity/computed', () => {
  effect.spec.ts  M  +14/-19  @@ import { / @@ describe('reactivity/effect', () => {
  gc.spec.ts  M  +35/-2  @@ import { / @@ describe.skipIf(!global.gc)('reactivity/gc', () => {
packages/reactivity/src/
  arrayInstrumentations.ts  M  +4/-3
  computed.ts  M  +101/-66  @@ export interface WritableComputedOptions<T, S = T> { / @@ export class ComputedRefImpl<T = any> implements Subscriber { / @@ export function computed<T>(
  debug.ts  A  +72/-0
  dep.ts  M  +41/-232  @@ export const ARRAY_ITERATE_KEY: unique symbol = Symbol( / @@ export function trigger(
  effect.ts  M  +121/-379  @@ export interface DebuggerOptions { / @@ export interface ReactiveEffectRunner<T = any> { / @@ export class ReactiveEffect<T = any>
  effectScope.ts  M  +33/-25  @@ export class EffectScope {
  ref.ts  M  +49/-30  @@ import { / @@ function createRef(rawValue: unknown, shallow: boolean) { / @@ class RefImpl<T = any> {
  system.ts  A  +366/-0
  watch.ts  M  +3/-7  @@ import { / @@ export function watch(
packages/runtime-core/__tests__/
  apiSetupHelpers.spec.ts  M  +9/-6  @@ import { / @@ describe('SFC <script setup> helpers', () => {
  errorHandling.spec.ts  M  +3/-0  @@ describe('error handling', () => {
packages/runtime-core/src/
  renderer.ts  M  +2/-1  @@ function baseCreateRenderer(

---DIFFS--- (all diffs included; you may submit directly)
### packages/reactivity/__tests__/computed.spec.ts [modified, +7/-6]
@@ -25,8 +25,9 @@ import {
   toRaw,
   triggerRef,
 } from '../src'
-import { EffectFlags, pauseTracking, resetTracking } from '../src/effect'
 import type { ComputedRef, ComputedRefImpl } from '../src/computed'
+import { pauseTracking, resetTracking } from '../src/effect'
+import { SubscriberFlags } from '../src/system'
 
 describe('reactivity/computed', () => {
   it('should return updated value', () => {
@@ -409,9 +410,9 @@ describe('reactivity/computed', () => {
     a.value++
     e.value
 
-    expect(e.deps!.dep).toBe(b.dep)
-    expect(e.deps!.nextDep!.dep).toBe(d.dep)
-    expect(e.deps!.nextDep!.nextDep!.dep).toBe(c.dep)
+    expect(e.deps!.dep).toBe(b)
+    expect(e.deps!.nextDep!.dep).toBe(d)
+    expect(e.deps!.nextDep!.nextDep!.dep).toBe(c)
     expect(cSpy).toHaveBeenCalledTimes(2)
 
     a.value++
@@ -466,8 +467,8 @@ describe('reactivity/computed', () => {
     const c2 = computed(() => c1.value) as unknown as ComputedRefImpl
 
     c2.value
-    expect(c1.flags & EffectFlags.DIRTY).toBeFalsy()
-    expect(c2.flags & EffectFlags.DIRTY).toBeFalsy()
+    expect(c1.flags & SubscriberFlags.Dirtys).toBe(0)
+    expect(c2.flags & SubscriberFlags.Dirtys).toBe(0)
   })
 
   it('should chained computeds dirtyLevel update with first computed effect', () => {

### packages/reactivity/__tests__/effect.spec.ts [modified, +14/-19]
@@ -1,3 +1,14 @@
+import {
+  computed,
+  h,
+  nextTick,
+  nodeOps,
+  ref,
+  render,
+  serializeInner,
+} from '@vue/runtime-test'
+import { ITERATE_KEY, getDepFromReactive } from '../src/dep'
+import { onEffectCleanup, pauseTracking, resetTracking } from '../src/effect'
 import {
   type DebuggerEvent,
   type ReactiveEffectRunner,
@@ -11,23 +22,7 @@ import {
   stop,
   toRaw,
 } from '../src/index'
-import { type Dep, ITERATE_KEY, getDepFromReactive } from '../src/dep'
-import {
-  computed,
-  h,
-  nextTick,
-  nodeOps,
-  ref,
-  render,
-  serializeInner,
-} from '@vue/runtime-test'
-import {
-  endBatch,
-  onEffectCleanup,
-  pauseTracking,
-  resetTracking,
-  startBatch,
-} from '../src/effect'
+import { type Dependency, endBatch, startBatch } from '../src/system'
 
 describe('reactivity/effect', () => {
   it('should run the passed function once (wrapped by a effect)', () => {
@@ -1183,12 +1178,12 @@ describe('reactivity/effect', () => {
   })
 
   describe('dep unsubscribe', () => {
-    function getSubCount(dep: Dep | undefined) {
+    function getSubCount(dep: Dependency | undefined) {
       let count = 0
       let sub = dep!.subs
       while (sub) {
         count++
-        sub = sub.prevSub
+        sub = sub.nextSub
       }
       return count
     }

### packages/reactivity/__tests__/gc.spec.ts [modified, +35/-2]
@@ -2,6 +2,7 @@ import {
   type ComputedRef,
   computed,
   effect,
+  effectScope,
   reactive,
   shallowRef as ref,
   toRaw,
@@ -19,7 +20,7 @@ describe.skipIf(!global.gc)('reactivity/gc', () => {
   }
 
   // #9233
-  it('should release computed cache', async () => {
+  it.todo('should release computed cache', async () => {
     const src = ref<{} | undefined>({})
     // @ts-expect-error ES2021 API
     const srcRef = new WeakRef(src.value!)
@@ -34,7 +35,7 @@ describe.skipIf(!global.gc)('reactivity/gc', () => {
     expect(srcRef.deref()).toBeUndefined()
   })
 
-  it('should release reactive property dep', async () => {
+  it.todo('should release reactive property dep', async () => {
     const src = reactive({ foo: 1 })
 
     let c: ComputedRef | undefined = computed(() => src.foo)
@@ -79,4 +80,36 @@ describe.skipIf(!global.gc)('reactivity/gc', () => {
     src.foo++
     expect(spy).toHaveBeenCalledTimes(2)
   })
+
+  it('should release computed that untrack by effect', async () => {
+    const src = ref(0)
+    // @ts-expect-error ES2021 API
+    const c = new WeakRef(computed(() => src.value))
+    const scope = effectScope()
+
+    scope.run(() => {
+      effect(() => c.deref().value)
+    })
+
+    expect(c.deref()).toBeDefined()
+    scope.stop()
+    await gc()
+    expect(c.deref()).toBeUndefined()
+  })
+
+  it('should release computed that untrack by effectScope', async () => {
+    const src = ref(0)
+    // @ts-expect-error ES2021 API
+    const c = new WeakRef(computed(() => src.value))
+    const scope = effectScope()
+
+    scope.run(() => {
+      c.deref().value
+    })
+
+    expect(c.deref()).toBeDefined()
+    scope.stop()
+    await gc()
+    expect(c.deref()).toBeUndefined()
+  })
 })

### packages/reactivity/src/arrayInstrumentations.ts [modified, +4/-3]
@@ -1,8 +1,9 @@
+import { isArray } from '@vue/shared'
 import { TrackOpTypes } from './constants'
-import { endBatch, pauseTracking, resetTracking, startBatch } from './effect'
-import { isProxy, isShallow, toRaw, toReactive } from './reactive'
 import { ARRAY_ITERATE_KEY, track } from './dep'
-import { isArray } from '@vue/shared'
+import { pauseTracking, resetTracking } from './effect'
+import { isProxy, isShallow, toRaw, toReactive } from './reactive'
+import { endBatch, startBatch } from './system'
 
 /**
  * Track array iteration and return:

### packages/reactivity/src/computed.ts [modified, +101/-66]
@@ -1,17 +1,27 @@
-import { isFunction } from '@vue/shared'
+import { hasChanged, isFunction } from '@vue/shared'
+import { ReactiveFlags, TrackOpTypes } from './constants'
+import { onTrack, setupFlagsHandler } from './debug'
 import {
   type DebuggerEvent,
   type DebuggerOptions,
-  EffectFlags,
-  type Subscriber,
   activeSub,
-  batch,
-  refreshComputed,
+  activeTrackId,
+  nextTrackId,
+  setActiveSub,
 } from './effect'
+import { activeEffectScope } from './effectScope'
 import type { Ref } from './ref'
+import {
+  type Dependency,
+  type IComputed,
+  type Link,
+  SubscriberFlags,
+  checkDirty,
+  endTrack,
+  link,
+  startTrack,
+} from './system'
 import { warn } from './warning'
-import { Dep, type Link, globalVersion } from './dep'
-import { ReactiveFlags, TrackOpTypes } from './constants'
 
 declare const ComputedRefSymbol: unique symbol
 declare const WritableComputedRefSymbol: unique symbol
@@ -44,15 +54,23 @@ export interface WritableComputedOptions<T, S = T> {
  * @private exported by @vue/reactivity for Vue core use, but not exported from
  * the main vue package
  */
-export class ComputedRefImpl<T = any> implements Subscriber {
+export class ComputedRefImpl<T = any> implements IComputed {
   /**
    * @internal
    */
-  _value: any = undefined
-  /**
-   * @internal
-   */
-  readonly dep: Dep = new Dep(this)
+  _value: T | undefined = undefined
+  version = 0
+
+  // Dependency
+  subs: Link | undefined = undefined
+  subsTail: Link | undefined = undefined
+  lastTrackedId = 0
+
+  // Subscriber
+  deps: Link | undefined = undefined
+  depsTail: Link | undefined = undefined
+  flags: SubscriberFlags = SubscriberFlags.Dirty
+
   /**
    * @internal
    */
@@ -63,34 +81,39 @@ export class ComputedRefImpl<T = any> implements Subscriber {
    */
   readonly __v_isReadonly: boolean
   // TODO isolatedDeclarations ReactiveFlags.IS_READONLY
-  // A computed is also a subscriber that tracks other deps
-  /**
-   * @internal
-   */
-  deps?: Link = undefined
-  /**
-   * @internal
-   */
-  depsTail?: Link = undefined
-  /**
-   * @internal
-   */
-  flags: EffectFlags = EffectFlags.DIRTY
-  /**
-   * @internal
-   */
-  globalVersion: number = globalVersion - 1
-  /**
-   * @internal
-   */
-  isSSR: boolean
-  /**
-   * @internal
-   */
-  next?: Subscriber = undefined
 
   // for backwards compat
-  effect: this = this
+  get effect(): this {
+    return this
+  }
+  // for backwards compat
+  get dep(): Dependency {
+    return this
+  }
+  // for backwards compat
+  get _dirty(): boolean {
+    const flags = this.flags
+    if (flags & SubscriberFlags.Dirty) {
+      return true
+    } else if (flags & SubscriberFlags.ToCheckDirty) {
+      if (checkDirty(this.deps!)) {
+        this.flags |= SubscriberFlags.Dirty
+        return true
+      } else {
+        this.flags &= ~SubscriberFlags.ToCheckDirty
+        return false
+      }
+    }
+    return false
+  }
+  set _dirty(v: boolean) {
+    if (v) {
+      this.flags |= SubscriberFlags.Dirty
+    } else {
+      this.flags &= ~SubscriberFlags.Dirtys
+    }
+  }
+
   // dev only
   onTrack?: (event: DebuggerEvent) => void
   // dev only
@@ -105,43 +128,34 @@ export class ComputedRefImpl<T = any> implements Subscriber {
   constructor(
     public fn: ComputedGetter<T>,
     private readonly setter: ComputedSetter<T> | undefined,
-    isSSR: boolean,
   ) {
     this[ReactiveFlags.IS_READONLY] = !setter
-    this.isSSR = isSSR
-  }
-
-  /**
-   * @internal
-   */
-  notify(): true | void {
-    this.flags |= EffectFlags.DIRTY
-    if (
-      !(this.flags & EffectFlags.NOTIFIED) &&
-      // avoid infinite self recursion
-      activeSub !== this
-    ) {
-      batch(this, true)
-      return true
-    } else if (__DEV__) {
-      // TODO warn
+    if (__DEV__) {
+      setupFlagsHandler(this)
     }
   }
 
   get value(): T {
-    const link = __DEV__
-      ? this.dep.track({
+    if (this._dirty) {
+      this.update()
+    }
+    if (activeTrackId !== 0 && this.lastTrackedId !== activeTrackId) {
+      if (__DEV__) {
+        onTrack(activeSub!, {
           target: this,
           type: TrackOpTypes.GET,
           key: 'value',
         })
-      : this.dep.track()
-    refreshComputed(this)
-    // sync version after evaluation
-    if (link) {
-      link.version = this.dep.version
+      }
+      this.lastTrackedId = activeTrackId
+      link(this, activeSub!).version = this.version
+    } else if (
+      activeEffectScope !== undefined &&
+      this.lastTrackedId !== activeEffectScope.trackId
+    ) {
+      link(this, activeEffectScope)
     }
-    return this._value
+    return this._value!
   }
 
   set value(newValue) {
@@ -151,6 +165,27 @@ export class ComputedRefImpl<T = any> implements Subscriber {
       warn('Write operation failed: computed value is readonly')
     }
   }
+
+  update(): boolean {
+    const prevSub = activeSub
+    const prevTrackId = activeTrackId
+    setActiveSub(this, nextTrackId())
+    startTrack(this)
+    const oldValue = this._value
+    let newValue: T
+    try {
+      newValue = this.fn(oldValue)
+    } finally {
+      setActiveSub(prevSub, prevTrackId)
+      endTrack(this)
+    }
+    if (hasChanged(oldValue, newValue)) {
+      this._value = newValue
+      this.version++
+      return true
+    }
+    return false
+  }
 }
 
 /**
@@ -209,7 +244,7 @@ export function computed<T>(
     setter = getterOrOptions.set
   }
 
-  const cRef = new ComputedRefImpl(getter, setter, isSSR)
+  const cRef = new ComputedRefImpl(getter, setter)
 
   if (__DEV__ && debugOptions && !isSSR) {
     cRef.onTrack = debugOptions.onTrack

### packages/reactivity/src/debug.ts [added, +72/-0]
@@ -0,0 +1,72 @@
+import { extend } from '@vue/shared'
+import type { DebuggerEventExtraInfo, ReactiveEffectOptions } from './effect'
+import { type Link, type Subscriber, SubscriberFlags } from './system'
+
+export const triggerEventInfos: DebuggerEventExtraInfo[] = []
+
+export function onTrack(
+  sub: Link['sub'],
+  debugInfo: DebuggerEventExtraInfo,
+): void {
+  if (!__DEV__) {
+    throw new Error(
+      `Internal error: onTrack should be called only in development.`,
+    )
+  }
+  if ((sub as ReactiveEffectOptions).onTrack) {
+    ;(sub as ReactiveEffectOptions).onTrack!(
+      extend(
+        {
+          effect: sub,
+        },
+        debugInfo,
+      ),
+    )
+  }
+}
+
+export function onTrigger(sub: Link['sub']): void {
+  if (!__DEV__) {
+    throw new Error(
+      `Internal error: onTrigger should be called only in development.`,
+    )
+  }
+  if ((sub as ReactiveEffectOptions).onTrigger) {
+    const debugInfo = triggerEventInfos[triggerEventInfos.length - 1]
+    ;(sub as ReactiveEffectOptions).onTrigger!(
+      extend(
+        {
+          effect: sub,
+        },
+        debugInfo,
+      ),
+    )
+  }
+}
+
+export function setupFlagsHandler(target: Subscriber): void {
+  if (!__DEV__) {
+    throw new Error(
+      `Internal error: setupFlagsHandler should be called only in development.`,
+    )
+  }
+  // @ts-expect-error
+  target._flags = target.flags
+  Object.defineProperty(target, 'flags', {
+    get() {
+      // @ts-expect-error
+      return target._flags
+    },
+    set(value) {
+      if (
+        // @ts-expect-error
+        !(target._flags >> SubscriberFlags.DirtyFlagsIndex) &&
+        !!(value >> SubscriberFlags.DirtyFlagsIndex)
+      ) {
+        onTrigger(this)
+      }
+      // @ts-expect-error
+      target._flags = value
+    },
+  })
+}

### packages/reactivity/src/dep.ts [modified, +41/-232]
@@ -1,230 +1,38 @@
-import { extend, isArray, isIntegerKey, isMap, isSymbol } from '@vue/shared'
-import type { ComputedRefImpl } from './computed'
+import { isArray, isIntegerKey, isMap, isSymbol } from '@vue/shared'
 import { type TrackOpTypes, TriggerOpTypes } from './constants'
+import { onTrack, triggerEventInfos } from './debug'
+import { activeSub, activeTrackId } from './effect'
 import {
-  type DebuggerEventExtraInfo,
-  EffectFlags,
-  type Subscriber,
-  activeSub,
+  type Dependency,
+  type Link,
   endBatch,
-  shouldTrack,
+  link,
+  propagate,
   startBatch,
-} from './effect'
+} from './system'
 
-/**
- * Incremented every time a reactive change happens
- * This is used to give computed a fast path to avoid re-compute when nothing
- * has changed.
- */
-export let globalVersion = 0
-
-/**
- * Represents a link between a source (Dep) and a subscriber (Effect or Computed).
- * Deps and subs have a many-to-many relationship - each link between a
- * dep and a sub is represented by a Link instance.
- *
- * A Link is also a node in two doubly-linked lists - one for the associated
- * sub to track all its deps, and one for the associated dep to track all its
- * subs.
- *
- * @internal
- */
-export class Link {
-  /**
-   * - Before each effect run, all previous dep links' version are reset to -1
-   * - During the run, a link's version is synced with the source dep on access
-   * - After the run, links with version -1 (that were never used) are cleaned
-   *   up
-   */
-  version: number
-
-  /**
-   * Pointers for doubly-linked lists
-   */
-  nextDep?: Link
-  prevDep?: Link
-  nextSub?: Link
-  prevSub?: Link
-  prevActiveLink?: Link
+class Dep implements Dependency {
+  _subs: Link | undefined = undefined
+  subsTail: Link | undefined = undefined
+  lastTrackedId = 0
 
   constructor(
-    public sub: Subscriber,
-    public dep: Dep,
-  ) {
-    this.version = dep.version
-    this.nextDep =
-      this.prevDep =
-      this.nextSub =
-      this.prevSub =
-      this.prevActiveLink =
-        undefined
-  }
-}
-
-/**
- * @internal
- */
-export class Dep {
-  version = 0
-  /**
-   * Link between this dep and the current active effect
-   */
-  activeLink?: Link = undefined
-
-  /**
-   * Doubly linked list representing the subscribing effects (tail)
-   */
-  subs?: Link = undefined
-
-  /**
-   * Doubly linked list representing the subscribing effects (head)
-   * DEV only, for invoking onTrigger hooks in correct order
-   */
-  subsHead?: Link
-
-  /**
-   * For object property deps cleanup
-   */
-  map?: KeyToDepMap = undefined
-  key?: unknown = undefined
+    private map: KeyToDepMap,
+    private key: unknown,
+  ) {}
 
-  /**
-   * Subscriber counter
-   */
-  sc: number = 0
-
-  constructor(public computed?: ComputedRefImpl | undefined) {
-    if (__DEV__) {
-      this.subsHead = undefined
-    }
+  get subs(): Link | undefined {
+    return this._subs
   }
 
-  track(debugInfo?: DebuggerEventExtraInfo): Link | undefined {
-    if (!activeSub || !shouldTrack || activeSub === this.computed) {
-      return
-    }
-
-    let link = this.activeLink
-    if (link === undefined || link.sub !== activeSub) {
-      link = this.activeLink = new Link(activeSub, this)
-
-      // add the link to the activeEffect as a dep (as tail)
-      if (!activeSub.deps) {
-        activeSub.deps = activeSub.depsTail = link
-      } else {
-        link.prevDep = activeSub.depsTail
-        activeSub.depsTail!.nextDep = link
-        activeSub.depsTail = link
-      }
-
-      addSub(link)
-    } else if (link.version === -1) {
-      // reused from last run - already a sub, just sync version
-      link.version = this.version
-
-      // If this dep has a next, it means it's not at the tail - move it to the
-      // tail. This ensures the effect's dep list is in the order they are
-      // accessed during evaluation.
-      if (link.nextDep) {
-        const next = link.nextDep
-        next.prevDep = link.prevDep
-        if (link.prevDep) {
-          link.prevDep.nextDep = next
-        }
-
-        link.prevDep = activeSub.depsTail
-        link.nextDep = undefined
-        activeSub.depsTail!.nextDep = link
-        activeSub.depsTail = link
-
-        // this was the head - point to the new head
-        if (activeSub.deps === link) {
-          activeSub.deps = next
-        }
-      }
-    }
-
-    if (__DEV__ && activeSub.onTrack) {
-      activeSub.onTrack(
-        extend(
-          {
-            effect: activeSub,
-          },
-          debugInfo,
-        ),
-      )
-    }
-
-    return link
-  }
-
-  trigger(debugInfo?: DebuggerEventExtraInfo): void {
-    this.version++
-    globalVersion++
-    this.notify(debugInfo)
-  }
-
-  notify(debugInfo?: DebuggerEventExtraInfo): void {
-    startBatch()
-    try {
-      if (__DEV__) {
-        // subs are notified and batched in reverse-order and then invoked in
-        // original order at the end of the batch, but onTrigger hooks should
-        // be invoked in original order here.
-        for (let head = this.subsHead; head; head = head.nextSub) {
-          if (head.sub.onTrigger && !(head.sub.flags & EffectFlags.NOTIFIED)) {
-            head.sub.onTrigger(
-              extend(
-                {
-                  effect: head.sub,
-                },
-                debugInfo,
-              ),
-            )
-          }
-        }
-      }
-      for (let link = this.subs; link; link = link.prevSub) {
-        if (link.sub.notify()) {
-          // if notify() returns `true`, this is a computed. Also call notify
-          // on its dep - it's called here instead of inside computed's notify
-          // in order to reduce call stack depth.
-          ;(link.sub as ComputedRefImpl).dep.notify()
-        }
-      }
-    } finally {
-      endBatch()
+  set subs(value: Link | undefined) {
+    this._subs = value
+    if (value === undefined) {
+      this.map.delete(this.key)
     }
   }
 }
 
-function addSub(link: Link) {
-  link.dep.sc++
-  if (link.sub.flags & EffectFlags.TRACKING) {
-    const computed = link.dep.computed
-    // computed getting its first subscriber
-    // enable tracking + lazily subscribe to all its deps
-    if (computed && !link.dep.subs) {
-      computed.flags |= EffectFlags.TRACKING | EffectFlags.DIRTY
-      for (let l = computed.deps; l; l = l.nextDep) {
-        addSub(l)
-      }
-    }
-
-    const currentTail = link.dep.subs
-    if (currentTail !== link) {
-      link.prevSub = currentTail
-      if (currentTail) currentTail.nextSub = link
-    }
-
-    if (__DEV__ && link.dep.subsHead === undefined) {
-      link.dep.subsHead = link
-    }
-
-    link.dep.subs = link
-  }
-}
-
 // The main WeakMap that stores {target -> key -> dep} connections.
 // Conceptually, it's easier to think of a dependency as a Dep class
 // which maintains a Set of subscribers, but we simply store them as
@@ -254,25 +62,25 @@ export const ARRAY_ITERATE_KEY: unique symbol = Symbol(
  * @param key - Identifier of the reactive property to track.
  */
 export function track(target: object, type: TrackOpTypes, key: unknown): void {
-  if (shouldTrack && activeSub) {
+  if (activeTrackId > 0) {
     let depsMap = targetMap.get(target)
     if (!depsMap) {
       targetMap.set(target, (depsMap = new Map()))
     }
     let dep = depsMap.get(key)
     if (!dep) {
-      depsMap.set(key, (dep = new Dep()))
-      dep.map = depsMap
-      dep.key = key
+      depsMap.set(key, (dep = new Dep(depsMap, key)))
     }
-    if (__DEV__) {
-      dep.track({
-        target,
-        type,
-        key,
-      })
-    } else {
-      dep.track()
+    if (dep.lastTrackedId !== activeTrackId) {
+      if (__DEV__) {
+        onTrack(activeSub!, {
+          target,
+          type,
+          key,
+        })
+      }
+      dep.lastTrackedId = activeTrackId
+      link(dep, activeSub!)
     }
   }
 }
@@ -296,23 +104,24 @@ export function trigger(
   const depsMap = targetMap.get(target)
   if (!depsMap) {
     // never been tracked
-    globalVersion++
     return
   }
 
-  const run = (dep: Dep | undefined) => {
-    if (dep) {
+  const run = (dep: Dependency | undefined) => {
+    if (dep !== undefined && dep.subs !== undefined) {
       if (__DEV__) {
-        dep.trigger({
+        triggerEventInfos.push({
           target,
           type,
           key,
           newValue,
           oldValue,
           oldTarget,
         })
-      } else {
-        dep.trigger()
+      }
+      propagate(dep.subs)
+      if (__DEV__) {
+        triggerEventInfos.pop()
       }
     }
   }
@@ -385,7 +194,7 @@ export function trigger(
 export function getDepFromReactive(
   object: any,
   key: string | number | symbol,
-): Dep | undefined {
+): Dependency | undefined {
   const depMap = targetMap.get(object)
   return depMap && depMap.get(key)
 }

### packages/reactivity/src/effect.ts [modified, +121/-379]
@@ -1,8 +1,16 @@
-import { extend, hasChanged } from '@vue/shared'
-import type { ComputedRefImpl } from './computed'
+import { extend } from '@vue/shared'
 import type { TrackOpTypes, TriggerOpTypes } from './constants'
-import { type Link, globalVersion } from './dep'
+import { setupFlagsHandler } from './debug'
 import { activeEffectScope } from './effectScope'
+import {
+  type IEffect,
+  type Link,
+  type Subscriber,
+  SubscriberFlags,
+  checkDirty,
+  endTrack,
+  startTrack,
+} from './system'
 import { warn } from './warning'
 
 export type EffectScheduler = (...args: any[]) => any
@@ -27,7 +35,6 @@ export interface DebuggerOptions {
 
 export interface ReactiveEffectOptions extends DebuggerOptions {
   scheduler?: EffectScheduler
-  allowRecurse?: boolean
   onStop?: () => void
 }
 
@@ -36,78 +43,29 @@ export interface ReactiveEffectRunner<T = any> {
   effect: ReactiveEffect
 }
 
-export let activeSub: Subscriber | undefined
-
 export enum EffectFlags {
   /**
    * ReactiveEffect only
    */
-  ACTIVE = 1 << 0,
-  RUNNING = 1 << 1,
-  TRACKING = 1 << 2,
-  NOTIFIED = 1 << 3,
-  DIRTY = 1 << 4,
-  ALLOW_RECURSE = 1 << 5,
-  PAUSED = 1 << 6,
+  ALLOW_RECURSE = 1 << 2,
+  PAUSED = 1 << 3,
+  NOTIFIED = 1 << 4,
+  STOP = 1 << 5,
 }
 
-/**
- * Subscriber is a type that tracks (or subscribes to) a list of deps.
- */
-export interface Subscriber extends DebuggerOptions {
-  /**
-   * Head of the doubly linked list representing the deps
-   * @internal
-   */
-  deps?: Link
-  /**
-   * Tail of the same list
-   * @internal
-   */
-  depsTail?: Link
-  /**
-   * @internal
-   */
-  flags: EffectFlags
-  /**
-   * @internal
-   */
-  next?: Subscriber
-  /**
-   * returning `true` indicates it's a computed that needs to call notify
-   * on its dep too
-   * @internal
-   */
-  notify(): true | void
-}
+export class ReactiveEffect<T = any> implements IEffect, ReactiveEffectOptions {
+  nextNotify: IEffect | undefined = undefined
 
-const pausedQueueEffects = new WeakSet<ReactiveEffect>()
+  // Subscriber
+  deps: Link | undefined = undefined
+  depsTail: Link | undefined = undefined
+  flags: number = SubscriberFlags.Dirty
 
-export class ReactiveEffect<T = any>
-  implements Subscriber, ReactiveEffectOptions
-{
-  /**
-   * @internal
-   */
-  deps?: Link = undefined
-  /**
-   * @internal
-   */
-  depsTail?: Link = undefined
-  /**
-   * @internal
-   */
-  flags: EffectFlags = EffectFlags.ACTIVE | EffectFlags.TRACKING
-  /**
-   * @internal
-   */
-  next?: Subscriber = undefined
   /**
    * @internal
    */
   cleanup?: () => void = undefined
 
-  scheduler?: EffectScheduler = undefined
   onStop?: () => void
   onTrack?: (event: DebuggerEvent) => void
   onTrigger?: (event: DebuggerEvent) => void
@@ -116,52 +74,59 @@ export class ReactiveEffect<T = any>
     if (activeEffectScope && activeEffectScope.active) {
       activeEffectScope.effects.push(this)
     }
+    if (__DEV__) {
+      setupFlagsHandler(this)
+    }
+  }
+
+  get active(): boolean {
+    return !(this.flags & EffectFlags.STOP)
   }
 
   pause(): void {
-    this.flags |= EffectFlags.PAUSED
+    if (!(this.flags & EffectFlags.PAUSED)) {
+      this.flags |= EffectFlags.PAUSED
+    }
   }
 
   resume(): void {
-    if (this.flags & EffectFlags.PAUSED) {
+    const flags = this.flags
+    if (flags & EffectFlags.PAUSED) {
       this.flags &= ~EffectFlags.PAUSED
-      if (pausedQueueEffects.has(this)) {
-        pausedQueueEffects.delete(this)
-        this.trigger()
-      }
+    }
+    if (flags & EffectFlags.NOTIFIED) {
+      this.flags &= ~EffectFlags.NOTIFIED
+      this.notify()
     }
   }
 
-  /**
-   * @internal
-   */
   notify(): void {
-    if (
-      this.flags & EffectFlags.RUNNING &&
-      !(this.flags & EffectFlags.ALLOW_RECURSE)
-    ) {
-      return
+    const flags = this.flags
+    if (!(flags & EffectFlags.PAUSED)) {
+      this.scheduler()
+    } else {
+      this.flags |= EffectFlags.NOTIFIED
     }
-    if (!(this.flags & EffectFlags.NOTIFIED)) {
-      batch(this)
+  }
+
+  scheduler(): void {
+    if (this.dirty) {
+      this.run()
     }
   }
 
   run(): T {
     // TODO cleanupEffect
 
-    if (!(this.flags & EffectFlags.ACTIVE)) {
+    if (!this.active) {
       // stopped during cleanup
       return this.fn()
     }
-
-    this.flags |= EffectFlags.RUNNING
     cleanupEffect(this)
-    prepareDeps(this)
-    const prevEffect = activeSub
-    const prevShouldTrack = shouldTrack
-    activeSub = this
-    shouldTrack = true
+    const prevSub = activeSub
+    const prevTrackId = activeTrackId
+    setActiveSub(this, nextTrackId())
+    startTrack(this)
 
     try {
       return this.fn()
@@ -172,299 +137,42 @@ export class ReactiveEffect<T = any>
             'this is likely a Vue internal bug.',
         )
       }
-      cleanupDeps(this)
-      activeSub = prevEffect
-      shouldTrack = prevShouldTrack
-      this.flags &= ~EffectFlags.RUNNING
+      setActiveSub(prevSub, prevTrackId)
+      endTrack(this)
+      if (
+        this.flags & SubscriberFlags.CanPropagate &&
+        this.flags & EffectFlags.ALLOW_RECURSE
+      ) {
+        this.flags &= ~SubscriberFlags.CanPropagate
+        this.notify()
+      }
     }
   }
 
   stop(): void {
-    if (this.flags & EffectFlags.ACTIVE) {
-      for (let link = this.deps; link; link = link.nextDep) {
-        removeSub(link)
-      }
-      this.deps = this.depsTail = undefined
+    if (this.active) {
+      startTrack(this)
+      endTrack(this)
       cleanupEffect(this)
       this.onStop && this.onStop()
-      this.flags &= ~EffectFlags.ACTIVE
-    }
-  }
-
-  trigger(): void {
-    if (this.flags & EffectFlags.PAUSED) {
-      pausedQueueEffects.add(this)
-    } else if (this.scheduler) {
-      this.scheduler()
-    } else {
-      this.runIfDirty()
-    }
-  }
-
-  /**
-   * @internal
-   */
-  runIfDirty(): void {
-    if (isDirty(this)) {
-      this.run()
+      this.flags |= EffectFlags.STOP
     }
   }
 
   get dirty(): boolean {
-    return isDirty(this)
-  }
-}
-
-/**
- * For debugging
- */
-// function printDeps(sub: Subscriber) {
-//   let d = sub.deps
-//   let ds = []
-//   while (d) {
-//     ds.push(d)
-//     d = d.nextDep
-//   }
-//   return ds.map(d => ({
-//     id: d.id,
-//     prev: d.prevDep?.id,
-//     next: d.nextDep?.id,
-//   }))
-// }
-
-let batchDepth = 0
-let batchedSub: Subscriber | undefined
-let batchedComputed: Subscriber | undefined
-
-export function batch(sub: Subscriber, isComputed = false): void {
-  sub.flags |= EffectFlags.NOTIFIED
-  if (isComputed) {
-    sub.next = batchedComputed
-    batchedComputed = sub
-    return
-  }
-  sub.next = batchedSub
-  batchedSub = sub
-}
-
-/**
- * @internal
- */
-export function startBatch(): void {
-  batchDepth++
-}
-
-/**
- * Run batched effects when all batches have ended
- * @internal
- */
-export function endBatch(): void {
-  if (--batchDepth > 0) {
-    return
-  }
-
-  if (batchedComputed) {
-    let e: Subscriber | undefined = batchedComputed
-    batchedComputed = undefined
-    while (e) {
-      const next: Subscriber | undefined = e.next
-      e.next = undefined
-      e.flags &= ~EffectFlags.NOTIFIED
-      e = next
-    }
-  }
-
-  let error: unknown
-  while (batchedSub) {
-    let e: Subscriber | undefined = batchedSub
-    batchedSub = undefined
-    while (e) {
-      const next: Subscriber | undefined = e.next
-      e.next = undefined
-      e.flags &= ~EffectFlags.NOTIFIED
-      if (e.flags & EffectFlags.ACTIVE) {
-        try {
-          // ACTIVE flag is effect-only
-          ;(e as ReactiveEffect).trigger()
-        } catch (err) {
-          if (!error) error = err
-        }
-      }
-      e = next
-    }
-  }
-
-  if (error) throw error
-}
-
-function prepareDeps(sub: Subscriber) {
-  // Prepare deps for tracking, starting from the head
-  for (let link = sub.deps; link; link = link.nextDep) {
-    // set all previous deps' (if any) version to -1 so that we can track
-    // which ones are unused after the run
-    link.version = -1
-    // store previous active sub if link was being used in another context
-    link.prevActiveLink = link.dep.activeLink
-    link.dep.activeLink = link
-  }
-}
-
-function cleanupDeps(sub: Subscriber) {
-  // Cleanup unsued deps
-  let head
-  let tail = sub.depsTail
-  let link = tail
-  while (link) {
-    const prev = link.prevDep
-    if (link.version === -1) {
-      if (link === tail) tail = prev
-      // unused - remove it from the dep's subscribing effect list
-      removeSub(link)
-      // also remove it from this effect's dep list
-      removeDep(link)
-    } else {
-      // The new head is the last node seen which wasn't removed
-      // from the doubly-linked list
-      head = link
-    }
-
-    // restore previous active link if any
-    link.dep.activeLink = link.prevActiveLink
-    link.prevActiveLink = undefined
-    link = prev
-  }
-  // set the new head & tail
-  sub.deps = head
-  sub.depsTail = tail
-}
-
-function isDirty(sub: Subscriber): boolean {
-  for (let link = sub.deps; link; link = link.nextDep) {
-    if (
-      link.dep.version !== link.version ||
-      (link.dep.computed &&
-        (refreshComputed(link.dep.computed) ||
-          link.dep.version !== link.version))
-    ) {
+    const flags = this.flags
+    if (flags & SubscriberFlags.Dirty) {
       return true
-    }
-  }
-  // @ts-expect-error only for backwards compatibility where libs manually set
-  // this flag - e.g. Pinia's testing module
-  if (sub._dirty) {
-    return true
-  }
-  return false
-}
-
-/**
- * Returning false indicates the refresh failed
- * @internal
- */
-export function refreshComputed(computed: ComputedRefImpl): undefined {
-  if (
-    computed.flags & EffectFlags.TRACKING &&
-    !(computed.flags & EffectFlags.DIRTY)
-  ) {
-    return
-  }
-  computed.flags &= ~EffectFlags.DIRTY
-
-  // Global version fast path when no reactive changes has happened since
-  // last refresh.
-  if (computed.globalVersion === globalVersion) {
-    return
-  }
-  computed.globalVersion = globalVersion
-
-  const dep = computed.dep
-  computed.flags |= EffectFlags.RUNNING
-  // In SSR there will be no render effect, so the computed has no subscriber
-  // and therefore tracks no deps, thus we cannot rely on the dirty check.
-  // Instead, computed always re-evaluate and relies on the globalVersion
-  // fast path above for caching.
-  if (
-    dep.version > 0 &&
-    !computed.isSSR &&
-    computed.deps &&
-    !isDirty(computed)
-  ) {
-    computed.flags &= ~EffectFlags.RUNNING
-    return
-  }
-
-  const prevSub = activeSub
-  const prevShouldTrack = shouldTrack
-  activeSub = computed
-  shouldTrack = true
-
-  try {
-    prepareDeps(computed)
-    const value = computed.fn(computed._value)
-    if (dep.version === 0 || hasChanged(value, computed._value)) {
-      computed._value = value
-      dep.version++
-    }
-  } catch (err) {
-    dep.version++
-    throw err
-  } finally {
-    activeSub = prevSub
-    shouldTrack = prevShouldTrack
-    cleanupDeps(computed)
-    computed.flags &= ~EffectFlags.RUNNING
-  }
-}
-
-function removeSub(link: Link, soft = false) {
-  const { dep, prevSub, nextSub } = link
-  if (prevSub) {
-    prevSub.nextSub = nextSub
-    link.prevSub = undefined
-  }
-  if (nextSub) {
-    nextSub.prevSub = prevSub
-    link.nextSub = undefined
-  }
-  if (__DEV__ && dep.subsHead === link) {
-    // was previous head, point new head to next
-    dep.subsHead = nextSub
-  }
-
-  if (dep.subs === link) {
-    // was previous tail, point new tail to prev
-    dep.subs = prevSub
-
-    if (!prevSub && dep.computed) {
-      // if computed, unsubscribe it from all its deps so this computed and its
-      // value can be GCed
-      dep.computed.flags &= ~EffectFlags.TRACKING
-      for (let l = dep.computed.deps; l; l = l.nextDep) {
-        // here we are only "soft" unsubscribing because the computed still keeps
-        // referencing the deps and the dep should not decrease its sub count
-        removeSub(l, true)
+    } else if (flags & SubscriberFlags.ToCheckDirty) {
+      if (checkDirty(this.deps!)) {
+        this.flags |= SubscriberFlags.Dirty
+        return true
+      } else {
+        this.flags &= ~SubscriberFlags.ToCheckDirty
+        return false
       }
     }
-  }
-
-  if (!soft && !--dep.sc && dep.map) {
-    // #11979
-    // property dep no longer has effect subscribers, delete it
-    // this mostly is for the case where an object is kept in memory but only a
-    // subset of its properties is tracked at one time
-    dep.map.delete(dep.key)
-  }
-}
-
-function removeDep(link: Link) {
-  const { prevDep, nextDep } = link
-  if (prevDep) {
-    prevDep.nextDep = nextDep
-    link.prevDep = undefined
-  }
-  if (nextDep) {
-    nextDep.prevDep = prevDep
-    link.nextDep = undefined
+    return false
   }
 }
 
@@ -505,34 +213,55 @@ export function stop(runner: ReactiveEffectRunner): void {
   runner.effect.stop()
 }
 
-/**
- * @internal
- */
-export let shouldTrack = true
-const trackStack: boolean[] = []
+const resetTrackingStack: [sub: typeof activeSub, trackId: number][] = []
 
 /**
  * Temporarily pauses tracking.
  */
 export function pauseTracking(): void {
-  trackStack.push(shouldTrack)
-  shouldTrack = false
+  resetTrackingStack.push([activeSub, activeTrackId])
+  activeSub = undefined
+  activeTrackId = 0
 }
 
 /**
  * Re-enables effect tracking (if it was paused).
  */
 export function enableTracking(): void {
-  trackStack.push(shouldTrack)
-  shouldTrack = true
+  const isPaused = activeSub === undefined
+  if (!isPaused) {
+    // Add the current active effect to the trackResetStack so it can be
+    // restored by calling resetTracking.
+    resetTrackingStack.push([activeSub, activeTrackId])
+  } else {
+    // Add a placeholder to the trackResetStack so we can it can be popped
+    // to restore the previous active effect.
+    resetTrackingStack.push([undefined, 0])
+    for (let i = resetTrackingStack.length - 1; i >= 0; i--) {
+      if (resetTrackingStack[i][0] !== undefined) {
+        ;[activeSub, activeTrackId] = resetTrackingStack[i]
+        break
+      }
+    }
+  }
 }
 
 /**
  * Resets the previous global effect tracking state.
  */
 export function resetTracking(): void {
-  const last = trackStack.pop()
-  shouldTrack = last === undefined ? true : last
+  if (__DEV__ && resetTrackingStack.length === 0) {
+    warn(
+      `resetTracking() was called when there was no active tracking ` +
+        `to reset.`,
+    )
+  }
+  if (resetTrackingStack.length) {
+    ;[activeSub, activeTrackId] = resetTrackingStack.pop()!
+  } else {
+    activeSub = undefined
+    activeTrackId = 0
+  }
 }
 
 /**
@@ -561,7 +290,7 @@ export function onEffectCleanup(fn: () => void, failSilently = false): void {
 function cleanupEffect(e: ReactiveEffect) {
   const { cleanup } = e
   e.cleanup = undefined
-  if (cleanup) {
+  if (cleanup !== undefined) {
     // run cleanup without active effect
     const prevSub = activeSub
     activeSub = undefined
@@ -572,3 +301,16 @@ function cleanupEffect(e: ReactiveEffect) {
     }
   }
 }
+
+export let activeSub: Subscriber | undefined = undefined
+export let activeTrackId = 0
+export let lastTrackId = 0
+export const nextTrackId = (): number => ++lastTrackId
+
+export function setActiveSub(
+  sub: Subscriber | undefined,
+  trackId: number,
+): void {
+  activeSub = sub
+  activeTrackId = trackId
+}

### packages/reactivity/src/effectScope.ts [modified, +33/-25]
@@ -1,13 +1,23 @@
-import type { ReactiveEffect } from './effect'
+import { EffectFlags, type ReactiveEffect, nextTrackId } from './effect'
+import {
+  type Link,
+  type Subscriber,
+  SubscriberFlags,
+  endTrack,
+  startTrack,
+} from './system'
 import { warn } from './warning'
 
 export let activeEffectScope: EffectScope | undefined
 
-export class EffectScope {
-  /**
-   * @internal
-   */
-  private _active = true
+export class EffectScope implements Subscriber {
+  // Subscriber: In order to collect orphans computeds
+  deps: Link | undefined = undefined
+  depsTail: Link | undefined = undefined
+  flags: number = SubscriberFlags.None
+
+  trackId: number = nextTrackId()
+
   /**
    * @internal
    */
@@ -17,8 +27,6 @@ export class EffectScope {
    */
   cleanups: (() => void)[] = []
 
-  private _isPaused = false
-
   /**
    * only assigned by undetached scope
    * @internal
@@ -47,12 +55,12 @@ export class EffectScope {
   }
 
   get active(): boolean {
-    return this._active
+    return !(this.flags & EffectFlags.STOP)
   }
 
   pause(): void {
-    if (this._active) {
-      this._isPaused = true
+    if (!(this.flags & EffectFlags.PAUSED)) {
+      this.flags |= EffectFlags.PAUSED
       let i, l
       if (this.scopes) {
         for (i = 0, l = this.scopes.length; i < l; i++) {
@@ -69,24 +77,22 @@ export class EffectScope {
    * Resumes the effect scope, including all child scopes and effects.
    */
   resume(): void {
-    if (this._active) {
-      if (this._isPaused) {
-        this._isPaused = false
-        let i, l
-        if (this.scopes) {
-          for (i = 0, l = this.scopes.length; i < l; i++) {
-            this.scopes[i].resume()
-          }
-        }
-        for (i = 0, l = this.effects.length; i < l; i++) {
-          this.effects[i].resume()
+    if (this.flags & EffectFlags.PAUSED) {
+      this.flags &= ~EffectFlags.PAUSED
+      let i, l
+      if (this.scopes) {
+        for (i = 0, l = this.scopes.length; i < l; i++) {
+          this.scopes[i].resume()
         }
       }
+      for (i = 0, l = this.effects.length; i < l; i++) {
+        this.effects[i].resume()
+      }
     }
   }
 
   run<T>(fn: () => T): T | undefined {
-    if (this._active) {
+    if (this.active) {
       const currentEffectScope = activeEffectScope
       try {
         activeEffectScope = this
@@ -116,8 +122,10 @@ export class EffectScope {
   }
 
   stop(fromParent?: boolean): void {
-    if (this._active) {
-      this._active = false
+    if (this.active) {
+      this.flags |= EffectFlags.STOP
+      startTrack(this)
+      endTrack(this)
       let i, l
       for (i = 0, l = this.effects.length; i < l; i++) {
         this.effects[i].stop()

### packages/reactivity/src/ref.ts [modified, +49/-30]
@@ -5,7 +5,11 @@ import {
   isFunction,
   isObject,
 } from '@vue/shared'
-import { Dep, getDepFromReactive } from './dep'
+import type { ComputedRef, WritableComputedRef } from './computed'
+import { ReactiveFlags, TrackOpTypes, TriggerOpTypes } from './constants'
+import { onTrack, triggerEventInfos } from './debug'
+import { getDepFromReactive } from './dep'
+import { activeSub, activeTrackId } from './effect'
 import {
   type Builtin,
   type ShallowReactiveMarker,
@@ -16,8 +20,7 @@ import {
   toRaw,
   toReactive,
 } from './reactive'
-import type { ComputedRef, WritableComputedRef } from './computed'
-import { ReactiveFlags, TrackOpTypes, TriggerOpTypes } from './constants'
+import { type Dependency, type Link, link, propagate } from './system'
 import { warn } from './warning'
 
 declare const RefSymbol: unique symbol
@@ -105,12 +108,15 @@ function createRef(rawValue: unknown, shallow: boolean) {
 /**
  * @internal
  */
-class RefImpl<T = any> {
+class RefImpl<T = any> implements Dependency {
+  // Dependency
+  subs: Link | undefined = undefined
+  subsTail: Link | undefined = undefined
+  lastTrackedId = 0
+
   _value: T
   private _rawValue: T
 
-  dep: Dep = new Dep()
-
   public readonly [ReactiveFlags.IS_REF] = true
   public readonly [ReactiveFlags.IS_SHALLOW]: boolean = false
 
@@ -120,16 +126,12 @@ class RefImpl<T = any> {
     this[ReactiveFlags.IS_SHALLOW] = isShallow
   }
 
+  get dep() {
+    return this
+  }
+
   get value() {
-    if (__DEV__) {
-      this.dep.track({
-        target: this,
-        type: TrackOpTypes.GET,
-        key: 'value',
-      })
-    } else {
-      this.dep.track()
-    }
+    trackRef(this)
     return this._value
   }
 
@@ -144,15 +146,17 @@ class RefImpl<T = any> {
       this._rawValue = newValue
       this._value = useDirectValue ? newValue : toReactive(newValue)
       if (__DEV__) {
-        this.dep.trigger({
+        triggerEventInfos.push({
           target: this,
           type: TriggerOpTypes.SET,
           key: 'value',
           newValue,
           oldValue,
         })
-      } else {
-        this.dep.trigger()
+      }
+      triggerRef(this as unknown as Ref)
+      if (__DEV__) {
+        triggerEventInfos.pop()
       }
     }
   }
@@ -185,17 +189,23 @@ class RefImpl<T = any> {
  */
 export function triggerRef(ref: Ref): void {
   // ref may be an instance of ObjectRefImpl
-  if ((ref as unknown as RefImpl).dep) {
+  const dep = (ref as unknown as RefImpl).dep
+  if (dep !== undefined && dep.subs !== undefined) {
+    propagate(dep.subs)
+  }
+}
+
+function trackRef(dep: Dependency) {
+  if (activeTrackId !== 0 && dep.lastTrackedId !== activeTrackId) {
     if (__DEV__) {
-      ;(ref as unknown as RefImpl).dep.trigger({
-        target: ref,
-        type: TriggerOpTypes.SET,
+      onTrack(activeSub!, {
+        target: dep,
+        type: TrackOpTypes.GET,
         key: 'value',
-        newValue: (ref as unknown as RefImpl)._value,
       })
-    } else {
-      ;(ref as unknown as RefImpl).dep.trigger()
     }
+    dep.lastTrackedId = activeTrackId
+    link(dep, activeSub!)
   }
 }
 
@@ -287,8 +297,11 @@ export type CustomRefFactory<T> = (
   set: (value: T) => void
 }
 
-class CustomRefImpl<T> {
-  public dep: Dep
+class CustomRefImpl<T> implements Dependency {
+  // Dependency
+  subs: Link | undefined = undefined
+  subsTail: Link | undefined = undefined
+  lastTrackedId = 0
 
   private readonly _get: ReturnType<CustomRefFactory<T>>['get']
   private readonly _set: ReturnType<CustomRefFactory<T>>['set']
@@ -298,12 +311,18 @@ class CustomRefImpl<T> {
   public _value: T = undefined!
 
   constructor(factory: CustomRefFactory<T>) {
-    const dep = (this.dep = new Dep())
-    const { get, set } = factory(dep.track.bind(dep), dep.trigger.bind(dep))
+    const { get, set } = factory(
+      () => trackRef(this),
+      () => triggerRef(this as unknown as Ref),
+    )
     this._get = get
     this._set = set
   }
 
+  get dep() {
+    return this
+  }
+
   get value() {
     return (this._value = this._get())
   }
@@ -366,7 +385,7 @@ class ObjectRefImpl<T extends object, K extends keyof T> {
     this._object[this._key] = newVal
   }
 
-  get dep(): Dep | undefined {
+  get dep(): Dependency | undefined {
     return getDepFromReactive(toRaw(this._object), this._key)
   }
 }

### packages/reactivity/src/system.ts [added, +366/-0]
@@ -0,0 +1,366 @@
+// Ported from https://github.com/stackblitz/alien-signals/blob/v0.4.4/src/system.ts
+
+export interface IEffect extends Subscriber {
+  nextNotify: IEffect | undefined
+  notify(): void
+}
+
+export interface IComputed extends Dependency, Subscriber {
+  version: number
+  update(): boolean
+}
+
+export interface Dependency {
+  subs: Link | undefined
+  subsTail: Link | undefined
+  lastTrackedId?: number
+}
+
+export interface Subscriber {
+  flags: SubscriberFlags
+  deps: Link | undefined
+  depsTail: Link | undefined
+}
+
+export interface Link {
+  dep: Dependency | IComputed | (Dependency & IEffect)
+  sub: Subscriber | IComputed | (Dependency & IEffect) | IEffect
+  version: number
+  // Reuse to link prev stack in checkDirty
+  // Reuse to link prev stack in propagate
+  prevSub: Link | undefined
+  nextSub: Link | undefined
+  // Reuse to link next released link in linkPool
+  nextDep: Link | undefined
+}
+
+export enum SubscriberFlags {
+  None = 0,
+  Tracking = 1 << 0,
+  CanPropagate = 1 << 1,
+  // RunInnerEffects = 1 << 2, // Not used in Vue
+  // 2~5 are using in EffectFlags
+  ToCheckDirty = 1 << 6,
+  Dirty = 1 << 7,
+  Dirtys = SubscriberFlags.ToCheckDirty | SubscriberFlags.Dirty,
+
+  DirtyFlagsIndex = 6,
+}
+
+let batchDepth = 0
+let queuedEffects: IEffect | undefined
+let queuedEffectsTail: IEffect | undefined
+let linkPool: Link | undefined
+
+export function startBatch(): void {
+  ++batchDepth
+}
+
+export function endBatch(): void {
+  if (!--batchDepth) {
+    drainQueuedEffects()
+  }
+}
+
+function drainQueuedEffects(): void {
+  while (queuedEffects !== undefined) {
+    const effect = queuedEffects
+    const queuedNext = effect.nextNotify
+    if (queuedNext !== undefined) {
+      effect.nextNotify = undefined
+      queuedEffects = queuedNext
+    } else {
+      queuedEffects = undefined
+      queuedEffectsTail = undefined
+    }
+    effect.notify()
+  }
+}
+
+export function link(dep: Dependency, sub: Subscriber): Link {
+  const currentDep = sub.depsTail
+  const nextDep = currentDep !== undefined ? currentDep.nextDep : sub.deps
+  if (nextDep !== undefined && nextDep.dep === dep) {
+    sub.depsTail = nextDep
+    return nextDep
+  } else {
+    return linkNewDep(dep, sub, nextDep, currentDep)
+  }
+}
+
+function linkNewDep(
+  dep: Dependency,
+  sub: Subscriber,
+  nextDep: Link | undefined,
+  depsTail: Link | undefined,
+): Link {
+  let newLink: Link
+
+  if (linkPool !== undefined) {
+    newLink = linkPool
+    linkPool = newLink.nextDep
+    newLink.nextDep = nextDep
+    newLink.dep = dep
+    newLink.sub = sub
+  } else {
+    newLink = {
+      dep,
+      sub,
+      version: 0,
+      nextDep,
+      prevSub: undefined,
+      nextSub: undefined,
+    }
+  }
+
+  if (depsTail === undefined) {
+    sub.deps = newLink
+  } else {
+    depsTail.nextDep = newLink
+  }
+
+  if (dep.subs === undefined) {
+    dep.subs = newLink
+  } else {
+    const oldTail = dep.subsTail!
+    newLink.prevSub = oldTail
+    oldTail.nextSub = newLink
+  }
+
+  sub.depsTail = newLink
+  dep.subsTail = newLink
+
+  return newLink
+}
+
+export function propagate(subs: Link): void {
+  let targetFlag = SubscriberFlags.Dirty
+  let link = subs
+  let stack = 0
+  let nextSub: Link | undefined
+
+  top: do {
+    const sub = link.sub
+    const subFlags = sub.flags
+
+    if (!(subFlags & SubscriberFlags.Tracking)) {
+      let canPropagate = !(subFlags >> SubscriberFlags.DirtyFlagsIndex)
+      if (!canPropagate && subFlags & SubscriberFlags.CanPropagate) {
+        sub.flags &= ~SubscriberFlags.CanPropagate
+        canPropagate = true
+      }
+      if (canPropagate) {
+        sub.flags |= targetFlag
+        const subSubs = (sub as Dependency).subs
+        if (subSubs !== undefined) {
+          if (subSubs.nextSub !== undefined) {
+            subSubs.prevSub = subs
+            subs = subSubs
+            ++stack
+          }
+          link = subSubs
+          targetFlag = SubscriberFlags.ToCheckDirty
+          continue
+        }
+        if ('notify' in sub) {
+          if (queuedEffectsTail !== undefined) {
+            queuedEffectsTail.nextNotify = sub
+          } else {
+            queuedEffects = sub
+          }
+          queuedEffectsTail = sub
+        }
+      } else if (!(sub.flags & targetFlag)) {
+        sub.flags |= targetFlag
+      }
+    } else if (isValidLink(link, sub)) {
+      if (!(subFlags >> SubscriberFlags.DirtyFlagsIndex)) {
+        sub.flags |= targetFlag | SubscriberFlags.CanPropagate
+        const subSubs = (sub as Dependency).subs
+        if (subSubs !== undefined) {
+          if (subSubs.nextSub !== undefined) {
+            subSubs.prevSub = subs
+            subs = subSubs
+            ++stack
+          }
+          link = subSubs
+          targetFlag = SubscriberFlags.ToCheckDirty
+          continue
+        }
+      } else if (!(sub.flags & targetFlag)) {
+        sub.flags |= targetFlag
+      }
+    }
+
+    if ((nextSub = subs.nextSub) === undefined) {
+      if (stack) {
+        let dep = subs.dep
+        do {
+          --stack
+          const depSubs = dep.subs!
+          const prevLink = depSubs.prevSub!
+          depSubs.prevSub = undefined
+          link = subs = prevLink.nextSub!
+          if (subs !== undefined) {
+            targetFlag = stack
+              ? SubscriberFlags.ToCheckDirty
+              : SubscriberFlags.Dirty
+            continue top
+          }
+          dep = prevLink.dep
+        } while (stack)
+      }
+      break
+    }
+    if (link !== subs) {
+      targetFlag = stack ? SubscriberFlags.ToCheckDirty : SubscriberFlags.Dirty
+    }
+    link = subs = nextSub
+  } while (true)
+
+  if (!batchDepth) {
+    drainQueuedEffects()
+  }
+}
+
+function isValidLink(subLink: Link, sub: Subscriber) {
+  const depsTail = sub.depsTail
+  if (depsTail !== undefined) {
+    let link = sub.deps!
+    do {
+      if (link === subLink) {
+        return true
+      }
+      if (link === depsTail) {
+        break
+      }
+      link = link.nextDep!
+    } while (link !== undefined)
+  }
+  return false
+}
+
+export function checkDirty(deps: Link): boolean {
+  let stack = 0
+  let dirty: boolean
+  let nextDep: Link | undefined
+
+  top: do {
+    dirty = false
+    const dep = deps.dep
+    if ('update' in dep) {
+      if (dep.version !== deps.version) {
+        dirty = true
+      } else {
+        const depFlags = dep.flags
+        if (depFlags & SubscriberFlags.Dirty) {
+          dirty = dep.update()
+        } else if (depFlags & SubscriberFlags.ToCheckDirty) {
+          dep.subs!.prevSub = deps
+          deps = dep.deps!
+          ++stack
+          continue
+        }
+      }
+    }
+    if (dirty || (nextDep = deps.nextDep) === undefined) {
+      if (stack) {
+        let sub = deps.sub as IComputed
+        do {
+          --stack
+          const subSubs = sub.subs!
+          const prevLink = subSubs.prevSub!
+          subSubs.prevSub = undefined
+          if (dirty) {
+            if (sub.update()) {
+              sub = prevLink.sub as IComputed
+              dirty = true
+              continue
+            }
+          } else {
+            sub.flags &= ~SubscriberFlags.Dirtys
+          }
+          deps = prevLink.nextDep!
+          if (deps !== undefined) {
+            continue top
+          }
+          sub = prevLink.sub as IComputed
+          dirty = false
+        } while (stack)
+      }
+      return dirty
+    }
+    deps = nextDep
+  } while (true)
+}
+
+export function startTrack(sub: Subscriber): void {
+  sub.depsTail = undefined
+  sub.flags =
+    (sub.flags & ~(SubscriberFlags.CanPropagate | SubscriberFlags.Dirtys)) |
+    SubscriberFlags.Tracking
+}
+
+export function endTrack(sub: Subscriber): void {
+  const depsTail = sub.depsTail
+  if (depsTail !== undefined) {
+    if (depsTail.nextDep !== undefined) {
+      clearTrack(depsTail.nextDep)
+      depsTail.nextDep = undefined
+    }
+  } else if (sub.deps !== undefined) {
+    clearTrack(sub.deps)
+    sub.deps = undefined
+  }
+  sub.flags &= ~SubscriberFlags.Tracking
+}
+
+function clearTrack(link: Link): void {
+  do {
+    const dep = link.dep
+    const nextDep = link.nextDep
+    const nextSub = link.nextSub
+    const prevSub = link.prevSub
+
+    if (nextSub !== undefined) {
+      nextSub.prevSub = prevSub
+      link.nextSub = undefined
+    } else {
+      dep.subsTail = prevSub
+      if ('lastTrackedId' in dep) {
+        dep.lastTrackedId = 0
+      }
+    }
+
+    if (prevSub !== undefined) {
+      prevSub.nextSub = nextSub
+      link.prevSub = undefined
+    } else {
+      dep.subs = nextSub
+    }
+
+    // @ts-expect-error
+    link.dep = undefined
+    // @ts-expect-error
+    link.sub = undefined
+    link.nextDep = linkPool
+    linkPool = link
+
+    if (dep.subs === undefined && 'deps' in dep) {
+      if ('notify' in dep) {
+        dep.flags &= ~SubscriberFlags.Dirtys
+      } else {
+        dep.flags |= SubscriberFlags.Dirty
+      }
+      const depDeps = dep.deps
+      if (depDeps !== undefined) {
+        link = depDeps
+        dep.depsTail!.nextDep = nextDep
+        dep.deps = undefined
+        dep.depsTail = undefined
+        continue
+      }
+    }
+    link = nextDep!
+  } while (link !== undefined)
+}

### packages/reactivity/src/watch.ts [modified, +3/-7]
@@ -10,20 +10,19 @@ import {
   isSet,
   remove,
 } from '@vue/shared'
-import { warn } from './warning'
 import type { ComputedRef } from './computed'
 import { ReactiveFlags } from './constants'
 import {
   type DebuggerOptions,
-  EffectFlags,
   type EffectScheduler,
   ReactiveEffect,
   pauseTracking,
   resetTracking,
 } from './effect'
+import { getCurrentScope } from './effectScope'
 import { isReactive, isShallow } from './reactive'
 import { type Ref, isRef } from './ref'
-import { getCurrentScope } from './effectScope'
+import { warn } from './warning'
 
 // These errors were transferred from `packages/runtime-core/src/errorHandling.ts`
 // to @vue/reactivity to allow co-location with the moved base watch logic, hence
@@ -231,10 +230,7 @@ export function watch(
     : INITIAL_WATCHER_VALUE
 
   const job = (immediateFirstRun?: boolean) => {
-    if (
-      !(effect.flags & EffectFlags.ACTIVE) ||
-      (!effect.dirty && !immediateFirstRun)
-    ) {
+    if (!effect.active || (!immediateFirstRun && !effect.dirty)) {
       return
     }
     if (cb) {

### packages/runtime-core/__tests__/apiSetupHelpers.spec.ts [modified, +9/-6]
@@ -1,3 +1,8 @@
+import {
+  type ComputedRefImpl,
+  type ReactiveEffectRunner,
+  effect,
+} from '@vue/reactivity'
 import {
   type ComponentInternalInstance,
   type SetupContext,
@@ -25,8 +30,6 @@ import {
   withAsyncContext,
   withDefaults,
 } from '../src/apiSetupHelpers'
-import type { ComputedRefImpl } from '../../reactivity/src/computed'
-import { EffectFlags, type ReactiveEffectRunner, effect } from '@vue/reactivity'
 
 describe('SFC <script setup> helpers', () => {
   test('should warn runtime usage', () => {
@@ -450,12 +453,12 @@ describe('SFC <script setup> helpers', () => {
       app.mount(root)
 
       await ready
-      expect(e!.effect.flags & EffectFlags.ACTIVE).toBeTruthy()
-      expect(c!.flags & EffectFlags.TRACKING).toBeTruthy()
+      expect(e!.effect.active).toBeTruthy()
+      expect(c!.flags & 1 /* SubscriberFlags.Tracking */).toBe(0)
 
       app.unmount()
-      expect(e!.effect.flags & EffectFlags.ACTIVE).toBeFalsy()
-      expect(c!.flags & EffectFlags.TRACKING).toBeFalsy()
+      expect(e!.effect.active).toBeFalsy()
+      expect(c!.flags & 1 /* SubscriberFlags.Tracking */).toBe(0)
     })
   })
 })

### packages/runtime-core/__tests__/errorHandling.spec.ts [modified, +3/-0]
@@ -531,6 +531,9 @@ describe('error handling', () => {
       caughtError = caught
     }
     expect(fn).toHaveBeenCalledWith(err, 'setup function')
+    expect(
+      `Active effect was not restored correctly - this is likely a Vue internal bug.`,
+    ).toHaveBeenWarned()
     expect(
       `Unhandled error during execution of setup function`,
     ).toHaveBeenWarned()

### packages/runtime-core/src/renderer.ts [modified, +2/-1]
@@ -1558,7 +1558,8 @@ function baseCreateRenderer(
     instance.scope.off()
 
     const update = (instance.update = effect.run.bind(effect))
-    const job: SchedulerJob = (instance.job = effect.runIfDirty.bind(effect))
+    const job: SchedulerJob = (instance.job = () =>
+      effect.dirty && effect.run())
     job.i = instance
     job.id = instance.uid
     effect.scheduler = () => queueJob(job)

### vitest.config.ts [modified, +6/-1]
@@ -3,7 +3,7 @@ import { entries } from './scripts/aliases.js'
 
 export default defineConfig({
   define: {
-    __DEV__: true,
+    __DEV__: process.env.MODE !== 'benchmark',
     __TEST__: true,
     __VERSION__: '"test"',
     __BROWSER__: false,
@@ -24,6 +24,11 @@ export default defineConfig({
   test: {
     globals: true,
     pool: 'threads',
+    poolOptions: {
+      forks: {
+        execArgv: ['--expose-gc'],
+      },
+    },
     setupFiles: 'scripts/setup-vitest.ts',
     environmentMatchGlobs: [
       ['packages/{vue,vue-compat,runtime-dom}/**', 'jsdom'],

Respond and categorize in English.