PR title: feat: add antislop option

PR link: https://github.com/antfu/eslint-config/pull/861

---DESCRIPTION---
## Description

Adds an opt-in, experimental `antislop` factory option to guard against low-value code patterns commonly introduced by AI agents, inspired by [this writeup on keeping AI-authored code clean](https://zenn.dev/singularity/articles/clean-code-ci-for-ai-era).

- Enables all rules from [`eslint-plugin-slop`](https://github.com/antfu/eslint-plugin-slop) v0.1.1 (including the new `no-jargon` and `prefer-jsdoc`; the plugin ships no preset, so the set is maintained here).
- Enables an in-house maintained subset of [`eslint-plugin-sonarjs`](https://github.com/SonarSource/SonarJS) focused on redundant and duplicated code (e.g. `no-identical-functions`, `no-duplicated-branches`, `no-commented-code`, `cognitive-complexity`), deliberately excluding security/AWS/test/regex rules that overlap with existing configs, and type-aware rules so it works without `tsconfigPath`.
- Turns `ts/no-explicit-any` on (`error`) when TypeScript is enabled; the antislop config is composed after the TypeScript config so the override takes effect.
- The option accepts an object to toggle each plugin: `sonarjs?: boolean` and `slop?: boolean | OptionsSlop` — passing an object enables `eslint-plugin-slop` and is forwarded to it via `settings.slop` (e.g. inspection mode).
- Marked `@experimental`: the enabled rule set is maintained in-house and may change in any release without following semver.
- Both plugins are optional peer dependencies, installed on demand via the usual `ensurePackages` prompt.
- Supports `antislop: { overrides: {...} }` like other integrations.
- README documents the option and recommends pairing it with [`jscpd`](https://github.com/kucherenko/jscpd) and [`knip`](https://knip.dev), since linters only see one file at a time.

Note: 7 factory snapshots were already stale on `main` (from the earlier pnpm blank-lines feature) and got regenerated together with the new `antfu/antislop/rules` entries.

---
This PR was created with the help of an agent.

---MANIFEST--- (18 files, +863/-2)
package.json  M  +10/-0
pnpm-lock.yaml  M  +73/-0  [generated]
pnpm-workspace.yaml  M  +3/-0  @@ minimumReleaseAgeExcludePrune: true / @@ catalogs:
README.md  M  +44/-0  @@ Running `npx eslint` should prompt you to install the required dependencies, oth
src/
  config-presets.ts  M  +2/-0  @@ import type { OptionsConfig } from './types' / @@ export const CONFIG_PRESET_FULL_ON: OptionsConfig = {
  factory.ts  M  +13/-0  @@ import { findUpSync } from 'find-up-simple' / @@ export function antfu(
  types.ts  M  +52/-0  @@ export interface OptionsE18e extends OptionsOverrides { / @@ export interface OptionsConfig extends OptionsComponentExts, OptionsProjectType
src/configs/
  antislop.ts  A  +87/-0
  index.ts  M  +1/-0
test/__snapshots__/api/@antfu/eslint-config/
  index.snapshot.d.ts  M  +433/-2  @@ export interface OptionsConfig extends OptionsComponentExts, OptionsProjectType / @@ export interface OptionsMarkdown extends OptionsOverrides { / @@ export interface OptionsReact extends OptionsOverrides {}
  index.snapshot.js  M  +1/-0
test/__snapshots__/factory/
  default.snap.js  M  +15/-0
  full-on.snap.js  M  +54/-0
  in-editor.snap.js  M  +15/-0
  javascript-vue.snap.js  M  +15/-0
  less-opinionated.snap.js  M  +15/-0
  lib.snap.js  M  +15/-0
  pnpm-without-jsonc.snap.js  M  +15/-0

---DIFFS--- (all diffs included; you may submit directly)
### README.md [modified, +44/-0]
@@ -814,6 +814,50 @@ Running `npx eslint` should prompt you to install the required dependencies, oth
 npm i -D @angular-eslint/eslint-plugin @angular-eslint/eslint-plugin-template @angular-eslint/template-parser
 ```
 
+#### Anti-Slop
+
+> [!WARNING]
+> Experimental: the enabled rule set is maintained in-house and may change in any release without following semver.
+
+To guard against low-value code patterns commonly introduced by AI agents, you can explicitly turn on the anti-slop rules:
+
+```js
+// eslint.config.js
+import antfu from '@antfu/eslint-config'
+
+export default antfu({
+  antislop: true,
+})
+```
+
+This enables [`eslint-plugin-slop`](https://github.com/antfu/eslint-plugin-slop) and a curated, in-house maintained subset of [`eslint-plugin-sonarjs`](https://github.com/SonarSource/SonarJS) rules focusing on redundant and duplicated code. It also disallows explicit `any` when TypeScript is enabled (inspired by [this writeup on keeping AI-authored code clean](https://zenn.dev/singularity/articles/clean-code-ci-for-ai-era)).
+
+You can toggle each plugin and pass options to `eslint-plugin-slop`:
+
+```js
+// eslint.config.js
+import antfu from '@antfu/eslint-config'
+
+export default antfu({
+  antislop: {
+    sonarjs: false,
+    // an object enables `eslint-plugin-slop` and is forwarded to it
+    // via `settings.slop`, for example to only inspect recently changed code
+    slop: {
+      inspection: { mode: 'recent-changes', tracebackCommits: 5 },
+    },
+  },
+})
+```
+
+Running `npx eslint` should prompt you to install the required dependencies, otherwise, you can install them manually:
+
+```bash
+npm i -D eslint-plugin-slop eslint-plugin-sonarjs
+```
+
+Since linters only see one file at a time, we recommend pairing this option with [`jscpd`](https://github.com/kucherenko/jscpd) to detect copy-paste duplication across files, and [`knip`](https://knip.dev) to find unused files, dependencies, and exports.
+
 ### Optional Rules
 
 This config also provides some optional plugins/rules for extended usage.

### package.json [modified, +10/-0]
@@ -58,7 +58,9 @@
     "eslint-plugin-format": ">=0.1.0",
     "eslint-plugin-jsx-a11y": ">=6.10.2",
     "eslint-plugin-react-refresh": "^0.5.0",
+    "eslint-plugin-slop": ">=0.1.1",
     "eslint-plugin-solid": "^0.17.0",
+    "eslint-plugin-sonarjs": ">=4.0.0",
     "eslint-plugin-svelte": ">=2.35.1",
     "eslint-plugin-vuejs-accessibility": "^2.4.1",
     "prettier-plugin-astro": "^0.14.0",
@@ -105,9 +107,15 @@
     "eslint-plugin-react-refresh": {
       "optional": true
     },
+    "eslint-plugin-slop": {
+      "optional": true
+    },
     "eslint-plugin-solid": {
       "optional": true
     },
+    "eslint-plugin-sonarjs": {
+      "optional": true
+    },
     "eslint-plugin-svelte": {
       "optional": true
     },
@@ -185,7 +193,9 @@
     "eslint-plugin-format": "catalog:peer",
     "eslint-plugin-jsx-a11y": "catalog:peer",
     "eslint-plugin-react-refresh": "catalog:peer",
+    "eslint-plugin-slop": "catalog:peer",
     "eslint-plugin-solid": "catalog:peer",
+    "eslint-plugin-sonarjs": "catalog:peer",
     "eslint-plugin-svelte": "catalog:peer",
     "eslint-plugin-vuejs-accessibility": "catalog:peer",
     "eslint-typegen": "catalog:dev",

### pnpm-lock.yaml [modified, +73/-0]
(generated file, diff omitted to save tokens)

### pnpm-workspace.yaml [modified, +3/-0]
@@ -4,6 +4,7 @@ minimumReleaseAgeExcludePrune: true
 minimumReleaseAgeExclude:
   - eslint-plugin-pnpm@1.9.1
   - pnpm-workspace-yaml@1.9.1
+  - eslint-plugin-slop@0.1.1
 
 trustPolicy: no-downgrade
 trustPolicyExclude:
@@ -75,7 +76,9 @@ catalogs:
     eslint-plugin-format: ^2.0.1
     eslint-plugin-jsx-a11y: ^6.10.2
     eslint-plugin-react-refresh: ^0.5.5
+    eslint-plugin-slop: ^0.1.1
     eslint-plugin-solid: ^0.17.0
+    eslint-plugin-sonarjs: ^4.2.0
     eslint-plugin-svelte: ^3.23.0
     eslint-plugin-vuejs-accessibility: ^2.6.0
     prettier-plugin-astro: ^0.14.1

### src/config-presets.ts [modified, +2/-0]
@@ -3,6 +3,7 @@ import type { OptionsConfig } from './types'
 // @keep-sorted
 export const CONFIG_PRESET_FULL_ON: OptionsConfig = {
   angular: true,
+  antislop: true,
   astro: true,
   formatters: true,
   gitignore: true,
@@ -40,6 +41,7 @@ export const CONFIG_PRESET_FULL_ON: OptionsConfig = {
 
 export const CONFIG_PRESET_FULL_OFF: OptionsConfig = {
   angular: false,
+  antislop: false,
   astro: false,
   formatters: false,
   gitignore: false,

### src/configs/antislop.ts [added, +87/-0]
@@ -0,0 +1,87 @@
+import type { OptionsAntislop, OptionsHasTypeScript, TypedFlatConfigItem } from '../types'
+
+import { ensurePackages, interopDefault } from '../utils'
+
+export async function antislop(
+  options: OptionsAntislop & OptionsHasTypeScript = {},
+): Promise<TypedFlatConfigItem[]> {
+  const {
+    overrides = {},
+    slop = true,
+    sonarjs = true,
+    typescript = false,
+  } = options
+
+  await ensurePackages([
+    ...slop ? ['eslint-plugin-slop'] : [],
+    ...sonarjs ? ['eslint-plugin-sonarjs'] : [],
+  ])
+
+  const [
+    pluginSlop,
+    pluginSonarjs,
+  ] = await Promise.all([
+    slop ? interopDefault(import('eslint-plugin-slop')) : undefined,
+    sonarjs ? interopDefault(import('eslint-plugin-sonarjs')) : undefined,
+  ])
+
+  return [
+    {
+      name: 'antfu/antislop/rules',
+      plugins: {
+        ...slop ? { slop: pluginSlop } : {},
+        ...sonarjs ? { sonarjs: pluginSonarjs } : {},
+      },
+      ...typeof slop === 'object'
+        ? { settings: { slop } }
+        : {},
+      rules: {
+        ...slop
+          ? {
+              'slop/max-comment-length': 'error',
+              'slop/no-chained-type-assertions': 'error',
+              'slop/no-em-dash': 'error',
+              'slop/no-jargon': 'error',
+              'slop/no-trivial-functions': 'error',
+              'slop/no-trivial-type-aliases': 'error',
+              'slop/prefer-jsdoc': 'error',
+            } as const
+          : {},
+
+        // Curated subset of SonarJS focusing on redundant and duplicated code,
+        // picked to complement the rest of the config without requiring type information
+        ...sonarjs
+          ? {
+              'sonarjs/cognitive-complexity': 'error',
+              'sonarjs/no-all-duplicated-branches': 'error',
+              'sonarjs/no-collapsible-if': 'error',
+              'sonarjs/no-commented-code': 'error',
+              'sonarjs/no-dead-store': 'error',
+              'sonarjs/no-duplicated-branches': 'error',
+              'sonarjs/no-element-overwrite': 'error',
+              'sonarjs/no-empty-collection': 'error',
+              'sonarjs/no-gratuitous-expressions': 'error',
+              'sonarjs/no-identical-conditions': 'error',
+              'sonarjs/no-identical-expressions': 'error',
+              'sonarjs/no-identical-functions': 'error',
+              'sonarjs/no-invariant-returns': 'error',
+              'sonarjs/no-inverted-boolean-check': 'error',
+              'sonarjs/no-redundant-boolean': 'error',
+              'sonarjs/no-redundant-jump': 'error',
+              'sonarjs/no-unused-collection': 'error',
+              'sonarjs/no-use-of-empty-return-value': 'error',
+              'sonarjs/prefer-single-boolean-return': 'error',
+            } as const
+          : {},
+
+        // `any` silently erases type safety, the typescript config leaves it off by default
+        // but agents reach for it whenever typings get inconvenient
+        ...typescript
+          ? { 'ts/no-explicit-any': 'error' as const }
+          : {},
+
+        ...overrides,
+      },
+    },
+  ]
+}

### src/configs/index.ts [modified, +1/-0]
@@ -1,4 +1,5 @@
 export * from './angular'
+export * from './antislop'
 export * from './astro'
 export * from './command'
 export * from './comments'

### src/factory.ts [modified, +13/-0]
@@ -7,6 +7,7 @@ import { findUpSync } from 'find-up-simple'
 import { isPackageExists } from 'local-pkg'
 import {
   angular,
+  antislop,
   astro,
   command,
   comments,
@@ -88,6 +89,7 @@ export function antfu(
 ): FlatConfigComposer<TypedFlatConfigItem, ConfigNames> {
   const {
     angular: enableAngular = false,
+    antislop: enableAntislop = false,
     astro: enableAstro = false,
     autoRenamePlugins = true,
     componentExts = [],
@@ -231,6 +233,17 @@ export function antfu(
     )
   }
 
+  // Registered after the TypeScript config so its `ts/no-explicit-any` override takes effect
+  if (enableAntislop) {
+    configs.push(
+      antislop({
+        ...resolveSubOptions(options, 'antislop'),
+        overrides: getOverrides(options, 'antislop'),
+        typescript: !!enableTypeScript,
+      }),
+    )
+  }
+
   if (stylisticOptions) {
     configs.push(
       stylistic({

### src/types.ts [modified, +52/-0]
@@ -195,6 +195,37 @@ export interface OptionsE18e extends OptionsOverrides {
   performanceImprovements?: boolean
 }
 
+export interface OptionsSlop {
+  cwd?: string
+  inspection?: 'full' | 'uncommitted' | 'recent-changes' | {
+    mode: 'full' | 'uncommitted'
+  } | {
+    mode: 'recent-changes'
+    tracebackCommits?: number
+  }
+}
+
+export interface OptionsAntislop extends OptionsOverrides {
+  /**
+   * Enable rules from `eslint-plugin-slop`.
+   *
+   * Passing an object enables the rules and forwards it to the plugin
+   * via `settings.slop`, controlling the working directory and inspection mode.
+   *
+   * @see https://github.com/antfu/eslint-plugin-slop
+   * @default true
+   */
+  slop?: boolean | OptionsSlop
+
+  /**
+   * Enable the curated subset of rules from `eslint-plugin-sonarjs`.
+   *
+   * @see https://github.com/SonarSource/SonarJS
+   * @default true
+   */
+  sonarjs?: boolean
+}
+
 export interface OptionsUnicorn extends OptionsOverrides {
   /**
    * Include all rules recommended by `eslint-plugin-unicorn`, instead of only ones picked by Anthony.
@@ -499,6 +530,27 @@ export interface OptionsConfig extends OptionsComponentExts, OptionsProjectType
    */
   angular?: boolean | OptionsOverrides
 
+  /**
+   * Enable anti-slop rules, guarding against low-value code patterns
+   * commonly introduced by AI agents.
+   *
+   * Enables [eslint-plugin-slop](https://github.com/antfu/eslint-plugin-slop) and
+   * a curated subset of [eslint-plugin-sonarjs](https://github.com/SonarSource/SonarJS).
+   *
+   * We also recommend pairing this with [jscpd](https://github.com/kucherenko/jscpd)
+   * and [knip](https://github.com/webpro-nl/knip) to catch copy-paste duplication
+   * and unused files, dependencies, and exports.
+   *
+   * Requires installing:
+   * - `eslint-plugin-slop`
+   * - `eslint-plugin-sonarjs`
+   *
+   * @experimental The enabled rule set is maintained in-house and may change
+   * in any release without following semver.
+   * @default false
+   */
+  antislop?: boolean | OptionsAntislop
+
   /**
    * Enable linting for **code snippets** in Markdown and the markdown content itself.
    *

### test/__snapshots__/api/@antfu/eslint-config/index.snapshot.d.ts [modified, +433/-2]
@@ -2,6 +2,10 @@
  * Generated by tsnapi — public API snapshot of `@antfu/eslint-config`
  */
 // #region Interfaces
+export interface OptionsAntislop extends OptionsOverrides {
+  slop?: boolean | OptionsSlop;
+  sonarjs?: boolean;
+}
 export interface OptionsComponentExts {
   componentExts?: string[];
 }
@@ -25,6 +29,7 @@ export interface OptionsConfig extends OptionsComponentExts, OptionsProjectType
   toml?: boolean | OptionsOverrides;
   astro?: boolean | OptionsOverrides;
   angular?: boolean | OptionsOverrides;
+  antislop?: boolean | OptionsAntislop;
   markdown?: boolean | OptionsMarkdown;
   stylistic?: boolean | (StylisticConfig & OptionsOverrides);
   regexp?: boolean | (OptionsRegExp & OptionsOverrides);
@@ -90,7 +95,7 @@ export interface OptionsMarkdown extends OptionsOverrides {
 export interface OptionsOverrides {
   overrides?: TypedFlatConfigItem['rules'];
 }
-export interface OptionsPnpm extends OptionsIsInEditor {
+export interface OptionsPnpm extends OptionsIsInEditor, OptionsStylistic {
   catalogs?: boolean;
   json?: boolean;
   yaml?: boolean;
@@ -103,6 +108,15 @@ export interface OptionsReact extends OptionsOverrides {}
 export interface OptionsRegExp {
   level?: 'error' | 'warn';
 }
+export interface OptionsSlop {
+  cwd?: string;
+  inspection?: 'full' | 'uncommitted' | 'recent-changes' | {
+    mode: 'full' | 'uncommitted';
+  } | {
+    mode: 'recent-changes';
+    tracebackCommits?: number;
+  };
+}
 export interface OptionsStylistic {
   stylistic?: boolean | StylisticConfig;
 }
@@ -864,6 +878,7 @@ export interface RuleOptions {
   'pnpm/json-enforce-catalog'?: Linter.RuleEntry<PnpmJsonEnforceCatalog>;
   'pnpm/json-prefer-workspace-settings'?: Linter.RuleEntry<PnpmJsonPreferWorkspaceSettings>;
   'pnpm/json-valid-catalog'?: Linter.RuleEntry<PnpmJsonValidCatalog>;
+  'pnpm/yaml-blank-lines'?: Linter.RuleEntry<[]>;
   'pnpm/yaml-enforce-settings'?: Linter.RuleEntry<PnpmYamlEnforceSettings>;
   'pnpm/yaml-no-anonymous-catalog'?: Linter.RuleEntry<[]>;
   'pnpm/yaml-no-duplicate-catalog-item'?: Linter.RuleEntry<PnpmYamlNoDuplicateCatalogItem>;
@@ -1118,6 +1133,13 @@ export interface RuleOptions {
   'semi'?: Linter.RuleEntry<Semi>;
   'semi-spacing'?: Linter.RuleEntry<SemiSpacing>;
   'semi-style'?: Linter.RuleEntry<SemiStyle>;
+  'slop/max-comment-length'?: Linter.RuleEntry<SlopMaxCommentLength>;
+  'slop/no-chained-type-assertions'?: Linter.RuleEntry<SlopNoChainedTypeAssertions>;
+  'slop/no-em-dash'?: Linter.RuleEntry<SlopNoEmDash>;
+  'slop/no-jargon'?: Linter.RuleEntry<SlopNoJargon>;
+  'slop/no-trivial-functions'?: Linter.RuleEntry<SlopNoTrivialFunctions>;
+  'slop/no-trivial-type-aliases'?: Linter.RuleEntry<SlopNoTrivialTypeAliases>;
+  'slop/prefer-jsdoc'?: Linter.RuleEntry<SlopPreferJsdoc>;
   'solid/components-return-once'?: Linter.RuleEntry<[]>;
   'solid/event-handlers'?: Linter.RuleEntry<SolidEventHandlers>;
   'solid/imports'?: Linter.RuleEntry<[]>;
@@ -1149,6 +1171,285 @@ export interface RuleOptions {
   'solid/self-closing-comp'?: Linter.RuleEntry<SolidSelfClosingComp>;
   'solid/style-prop'?: Linter.RuleEntry<SolidStyleProp>;
   'solid/valid-use-server'?: Linter.RuleEntry<SolidValidUseServer>;
+  'sonarjs/anchor-precedence'?: Linter.RuleEntry<[]>;
+  'sonarjs/argument-type'?: Linter.RuleEntry<[]>;
+  'sonarjs/arguments-order'?: Linter.RuleEntry<[]>;
+  'sonarjs/arguments-usage'?: Linter.RuleEntry<[]>;
+  'sonarjs/array-callback-without-return'?: Linter.RuleEntry<[]>;
+  'sonarjs/array-constructor'?: Linter.RuleEntry<[]>;
+  'sonarjs/arrow-function-convention'?: Linter.RuleEntry<SonarjsArrowFunctionConvention>;
+  'sonarjs/assertions-in-test-cases'?: Linter.RuleEntry<[]>;
+  'sonarjs/assertions-in-tests'?: Linter.RuleEntry<[]>;
+  'sonarjs/async-test-assertions'?: Linter.RuleEntry<[]>;
+  'sonarjs/aws-apigateway-public-api'?: Linter.RuleEntry<[]>;
+  'sonarjs/aws-ec2-rds-dms-public'?: Linter.RuleEntry<[]>;
+  'sonarjs/aws-ec2-unencrypted-ebs-volume'?: Linter.RuleEntry<[]>;
+  'sonarjs/aws-efs-unencrypted'?: Linter.RuleEntry<[]>;
+  'sonarjs/aws-iam-all-privileges'?: Linter.RuleEntry<[]>;
+  'sonarjs/aws-iam-all-resources-accessible'?: Linter.RuleEntry<[]>;
+  'sonarjs/aws-iam-privilege-escalation'?: Linter.RuleEntry<[]>;
+  'sonarjs/aws-iam-public-access'?: Linter.RuleEntry<[]>;
+  'sonarjs/aws-opensearchservice-domain'?: Linter.RuleEntry<[]>;
+  'sonarjs/aws-rds-unencrypted-databases'?: Linter.RuleEntry<[]>;
+  'sonarjs/aws-restricted-ip-admin-access'?: Linter.RuleEntry<[]>;
+  'sonarjs/aws-s3-bucket-granted-access'?: Linter.RuleEntry<[]>;
+  'sonarjs/aws-s3-bucket-insecure-http'?: Linter.RuleEntry<[]>;
+  'sonarjs/aws-s3-bucket-public-access'?: Linter.RuleEntry<[]>;
+  'sonarjs/aws-s3-bucket-versioning'?: Linter.RuleEntry<[]>;
+  'sonarjs/aws-sagemaker-unencrypted-notebook'?: Linter.RuleEntry<[]>;
+  'sonarjs/aws-sns-unencrypted-topics'?: Linter.RuleEntry<[]>;
+  'sonarjs/aws-sqs-unencrypted-queue'?: Linter.RuleEntry<[]>;
+  'sonarjs/bitwise-operators'?: Linter.RuleEntry<[]>;
+  'sonarjs/block-scoped-var'?: Linter.RuleEntry<[]>;
+  'sonarjs/bool-param-default'?: Linter.RuleEntry<[]>;
+  'sonarjs/call-argument-line'?: Linter.RuleEntry<[]>;
+  'sonarjs/chai-determinate-assertion'?: Linter.RuleEntry<[]>;
+  'sonarjs/class-name'?: Linter.RuleEntry<SonarjsClassName>;
+  'sonarjs/class-prototype'?: Linter.RuleEntry<[]>;
+  'sonarjs/code-eval'?: Linter.RuleEntry<[]>;
+  'sonarjs/cognitive-complexity'?: Linter.RuleEntry<SonarjsCognitiveComplexity>;
+  'sonarjs/comma-or-logical-or-case'?: Linter.RuleEntry<[]>;
+  'sonarjs/comment-regex'?: Linter.RuleEntry<SonarjsCommentRegex>;
+  'sonarjs/concise-regex'?: Linter.RuleEntry<[]>;
+  'sonarjs/conditional-indentation'?: Linter.RuleEntry<[]>;
+  'sonarjs/confidential-information-logging'?: Linter.RuleEntry<[]>;
+  'sonarjs/constructor-for-side-effects'?: Linter.RuleEntry<[]>;
+  'sonarjs/content-length'?: Linter.RuleEntry<SonarjsContentLength>;
+  'sonarjs/content-security-policy'?: Linter.RuleEntry<[]>;
+  'sonarjs/cookie-no-httponly'?: Linter.RuleEntry<[]>;
+  'sonarjs/cors'?: Linter.RuleEntry<[]>;
+  'sonarjs/csrf'?: Linter.RuleEntry<[]>;
+  'sonarjs/cyclomatic-complexity'?: Linter.RuleEntry<SonarjsCyclomaticComplexity>;
+  'sonarjs/declarations-in-global-scope'?: Linter.RuleEntry<[]>;
+  'sonarjs/deprecation'?: Linter.RuleEntry<[]>;
+  'sonarjs/destructuring-assignment-syntax'?: Linter.RuleEntry<[]>;
+  'sonarjs/different-types-comparison'?: Linter.RuleEntry<[]>;
+  'sonarjs/disabled-auto-escaping'?: Linter.RuleEntry<[]>;
+  'sonarjs/disabled-resource-integrity'?: Linter.RuleEntry<[]>;
+  'sonarjs/disabled-timeout'?: Linter.RuleEntry<[]>;
+  'sonarjs/dompurify-unsafe-config'?: Linter.RuleEntry<[]>;
+  'sonarjs/duplicates-in-character-class'?: Linter.RuleEntry<[]>;
+  'sonarjs/dynamically-constructed-templates'?: Linter.RuleEntry<[]>;
+  'sonarjs/elseif-without-else'?: Linter.RuleEntry<[]>;
+  'sonarjs/empty-string-repetition'?: Linter.RuleEntry<[]>;
+  'sonarjs/encryption-secure-mode'?: Linter.RuleEntry<[]>;
+  'sonarjs/existing-groups'?: Linter.RuleEntry<[]>;
+  'sonarjs/explicit-test-skip'?: Linter.RuleEntry<[]>;
+  'sonarjs/expression-complexity'?: Linter.RuleEntry<SonarjsExpressionComplexity>;
+  'sonarjs/file-header'?: Linter.RuleEntry<SonarjsFileHeader>;
+  'sonarjs/file-name-differ-from-class'?: Linter.RuleEntry<[]>;
+  'sonarjs/file-permissions'?: Linter.RuleEntry<[]>;
+  'sonarjs/file-uploads'?: Linter.RuleEntry<[]>;
+  'sonarjs/fixme-tag'?: Linter.RuleEntry<[]>;
+  'sonarjs/for-in'?: Linter.RuleEntry<[]>;
+  'sonarjs/for-loop-increment-sign'?: Linter.RuleEntry<[]>;
+  'sonarjs/frame-ancestors'?: Linter.RuleEntry<[]>;
+  'sonarjs/function-inside-loop'?: Linter.RuleEntry<[]>;
+  'sonarjs/function-name'?: Linter.RuleEntry<SonarjsFunctionName>;
+  'sonarjs/function-return-type'?: Linter.RuleEntry<[]>;
+  'sonarjs/future-reserved-words'?: Linter.RuleEntry<[]>;
+  'sonarjs/generator-without-yield'?: Linter.RuleEntry<[]>;
+  'sonarjs/hardcoded-secret-signatures'?: Linter.RuleEntry<[]>;
+  'sonarjs/hashing'?: Linter.RuleEntry<[]>;
+  'sonarjs/hidden-files'?: Linter.RuleEntry<[]>;
+  'sonarjs/hooks-before-test-cases'?: Linter.RuleEntry<[]>;
+  'sonarjs/in-operator-type-error'?: Linter.RuleEntry<[]>;
+  'sonarjs/inconsistent-function-call'?: Linter.RuleEntry<[]>;
+  'sonarjs/index-of-compare-to-positive-number'?: Linter.RuleEntry<[]>;
+  'sonarjs/insecure-cookie'?: Linter.RuleEntry<[]>;
+  'sonarjs/insecure-jwt-token'?: Linter.RuleEntry<[]>;
+  'sonarjs/inverted-assertion-arguments'?: Linter.RuleEntry<[]>;
+  'sonarjs/jsx-no-leaked-render'?: Linter.RuleEntry<[]>;
+  'sonarjs/label-position'?: Linter.RuleEntry<[]>;
+  'sonarjs/link-with-target-blank'?: Linter.RuleEntry<[]>;
+  'sonarjs/max-lines'?: Linter.RuleEntry<SonarjsMaxLines>;
+  'sonarjs/max-lines-per-function'?: Linter.RuleEntry<SonarjsMaxLinesPerFunction>;
+  'sonarjs/max-switch-cases'?: Linter.RuleEntry<SonarjsMaxSwitchCases>;
+  'sonarjs/max-union-size'?: Linter.RuleEntry<SonarjsMaxUnionSize>;
+  'sonarjs/memoize-cache-key'?: Linter.RuleEntry<[]>;
+  'sonarjs/misplaced-loop-counter'?: Linter.RuleEntry<[]>;
+  'sonarjs/nested-control-flow'?: Linter.RuleEntry<SonarjsNestedControlFlow>;
+  'sonarjs/new-operator-misuse'?: Linter.RuleEntry<SonarjsNewOperatorMisuse>;
+  'sonarjs/no-all-duplicated-branches'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-alphabetical-sort'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-angular-bypass-sanitization'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-array-delete'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-associative-arrays'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-async-constructor'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-built-in-override'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-case-label-in-switch'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-clear-text-protocols'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-code-after-done'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-collapsible-if'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-collection-size-mischeck'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-commented-code'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-control-regex'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-dead-store'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-debug-commands-in-ui-tests'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-default-utility-imports'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-delete-var'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-duplicate-in-composite'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-duplicate-string'?: Linter.RuleEntry<SonarjsNoDuplicateString>;
+  'sonarjs/no-duplicate-test-title'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-duplicated-branches'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-element-overwrite'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-empty-after-reluctant'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-empty-alternatives'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-empty-character-class'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-empty-collection'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-empty-group'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-empty-test-file'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-empty-test-title'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-equals-in-for-termination'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-exclusive-tests'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-extra-arguments'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-fallthrough'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-fixed-wait-in-tests'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-floating-point-equality'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-for-in-iterable'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-forced-browser-interaction'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-function-declaration-in-block'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-global-this'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-globals-shadowing'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-gratuitous-expressions'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-hardcoded-ip'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-hardcoded-passwords'?: Linter.RuleEntry<SonarjsNoHardcodedPasswords>;
+  'sonarjs/no-hardcoded-secrets'?: Linter.RuleEntry<SonarjsNoHardcodedSecrets>;
+  'sonarjs/no-hook-setter-in-body'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-identical-conditions'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-identical-expressions'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-identical-functions'?: Linter.RuleEntry<SonarjsNoIdenticalFunctions>;
+  'sonarjs/no-ignored-exceptions'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-ignored-return'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-implicit-dependencies'?: Linter.RuleEntry<SonarjsNoImplicitDependencies>;
+  'sonarjs/no-implicit-global'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-in-misuse'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-incompatible-assertion-types'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-incomplete-assertions'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-inconsistent-returns'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-incorrect-string-concat'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-internal-api-use'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-interpolation-in-inline-snapshots'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-intrusive-permissions'?: Linter.RuleEntry<SonarjsNoIntrusivePermissions>;
+  'sonarjs/no-invalid-regexp'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-invariant-returns'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-inverted-boolean-check'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-ip-forward'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-labels'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-literal-call'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-mime-sniff'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-misleading-array-reverse'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-misleading-character-class'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-mixed-completion-style'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-mixed-content'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-nested-assignment'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-nested-conditional'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-nested-functions'?: Linter.RuleEntry<SonarjsNoNestedFunctions>;
+  'sonarjs/no-nested-incdec'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-nested-switch'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-nested-template-literals'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-os-command-from-path'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-parameter-reassignment'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-primitive-wrappers'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-redundant-assignments'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-redundant-boolean'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-redundant-jump'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-redundant-optional'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-redundant-parentheses'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-reference-error'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-referrer-policy'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-regex-spaces'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-require-or-define'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-return-type-any'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-same-argument-assert'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-same-line-conditional'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-selector-parameter'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-session-cookies-on-static-assets'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-skipped-tests'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-small-switch'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-sonar-comments'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-tab'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-table-as-layout'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-trivial-assertions'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-try-promise'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-undefined-argument'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-undefined-assignment'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-unenclosed-multiline-block'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-uniq-key'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-unsafe-unzip'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-unthrown-error'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-unused-collection'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-unused-function-argument'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-unused-vars'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-use-of-empty-return-value'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-useless-catch'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-useless-increment'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-useless-intersection'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-useless-react-setstate'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-variable-usage-before-declaration'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-weak-cipher'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-weak-keys'?: Linter.RuleEntry<[]>;
+  'sonarjs/no-wildcard-import'?: Linter.RuleEntry<[]>;
+  'sonarjs/non-existent-operator'?: Linter.RuleEntry<[]>;
+  'sonarjs/non-number-in-arithmetic-expression'?: Linter.RuleEntry<[]>;
+  'sonarjs/null-dereference'?: Linter.RuleEntry<[]>;
+  'sonarjs/object-alt-content'?: Linter.RuleEntry<[]>;
+  'sonarjs/operation-returning-nan'?: Linter.RuleEntry<[]>;
+  'sonarjs/os-command'?: Linter.RuleEntry<[]>;
+  'sonarjs/parameterized-tests'?: Linter.RuleEntry<[]>;
+  'sonarjs/post-message'?: Linter.RuleEntry<[]>;
+  'sonarjs/prefer-default-last'?: Linter.RuleEntry<[]>;
+  'sonarjs/prefer-immediate-return'?: Linter.RuleEntry<[]>;
+  'sonarjs/prefer-native-lodash-alternative'?: Linter.RuleEntry<[]>;
+  'sonarjs/prefer-object-literal'?: Linter.RuleEntry<[]>;
+  'sonarjs/prefer-promise-shorthand'?: Linter.RuleEntry<[]>;
+  'sonarjs/prefer-read-only-props'?: Linter.RuleEntry<[]>;
+  'sonarjs/prefer-regexp-exec'?: Linter.RuleEntry<[]>;
+  'sonarjs/prefer-single-boolean-return'?: Linter.RuleEntry<[]>;
+  'sonarjs/prefer-specific-assertions'?: Linter.RuleEntry<[]>;
+  'sonarjs/prefer-type-guard'?: Linter.RuleEntry<[]>;
+  'sonarjs/prefer-while'?: Linter.RuleEntry<[]>;
+  'sonarjs/production-debug'?: Linter.RuleEntry<[]>;
+  'sonarjs/pseudo-random'?: Linter.RuleEntry<[]>;
+  'sonarjs/public-static-readonly'?: Linter.RuleEntry<[]>;
+  'sonarjs/publicly-writable-directories'?: Linter.RuleEntry<[]>;
+  'sonarjs/reduce-initial-value'?: Linter.RuleEntry<[]>;
+  'sonarjs/redundant-type-aliases'?: Linter.RuleEntry<[]>;
+  'sonarjs/regex-complexity'?: Linter.RuleEntry<SonarjsRegexComplexity>;
+  'sonarjs/review-blockchain-mnemonic'?: Linter.RuleEntry<[]>;
+  'sonarjs/session-regeneration'?: Linter.RuleEntry<[]>;
+  'sonarjs/shorthand-property-grouping'?: Linter.RuleEntry<[]>;
+  'sonarjs/single-char-in-character-classes'?: Linter.RuleEntry<[]>;
+  'sonarjs/single-character-alternation'?: Linter.RuleEntry<[]>;
+  'sonarjs/slow-regex'?: Linter.RuleEntry<[]>;
+  'sonarjs/sql-queries'?: Linter.RuleEntry<[]>;
+  'sonarjs/stable-tests'?: Linter.RuleEntry<[]>;
+  'sonarjs/stateful-regex'?: Linter.RuleEntry<[]>;
+  'sonarjs/strict-transport-security'?: Linter.RuleEntry<[]>;
+  'sonarjs/strings-comparison'?: Linter.RuleEntry<[]>;
+  'sonarjs/super-linear-regex'?: Linter.RuleEntry<[]>;
+  'sonarjs/synchronous-suite-callback'?: Linter.RuleEntry<[]>;
+  'sonarjs/table-header'?: Linter.RuleEntry<[]>;
+  'sonarjs/table-header-reference'?: Linter.RuleEntry<[]>;
+  'sonarjs/test-check-exception'?: Linter.RuleEntry<[]>;
+  'sonarjs/todo-tag'?: Linter.RuleEntry<[]>;
+  'sonarjs/too-many-break-or-continue-in-loop'?: Linter.RuleEntry<[]>;
+  'sonarjs/unicode-aware-regex'?: Linter.RuleEntry<[]>;
+  'sonarjs/unused-import'?: Linter.RuleEntry<[]>;
+  'sonarjs/unused-named-groups'?: Linter.RuleEntry<[]>;
+  'sonarjs/unverified-certificate'?: Linter.RuleEntry<[]>;
+  'sonarjs/unverified-hostname'?: Linter.RuleEntry<[]>;
+  'sonarjs/updated-const-var'?: Linter.RuleEntry<[]>;
+  'sonarjs/updated-loop-counter'?: Linter.RuleEntry<[]>;
+  'sonarjs/use-type-alias'?: Linter.RuleEntry<[]>;
+  'sonarjs/useless-string-operation'?: Linter.RuleEntry<[]>;
+  'sonarjs/values-not-convertible-to-numbers'?: Linter.RuleEntry<[]>;
+  'sonarjs/variable-name'?: Linter.RuleEntry<SonarjsVariableName>;
+  'sonarjs/void-use'?: Linter.RuleEntry<[]>;
+  'sonarjs/weak-ssl'?: Linter.RuleEntry<[]>;
+  'sonarjs/web-sql-database'?: Linter.RuleEntry<[]>;
+  'sonarjs/x-powered-by'?: Linter.RuleEntry<[]>;
+  'sonarjs/xml-parser-xxe'?: Linter.RuleEntry<[]>;
   'sort-imports'?: Linter.RuleEntry<SortImports>;
   'sort-keys'?: Linter.RuleEntry<SortKeys>;
   'sort-vars'?: Linter.RuleEntry<SortVars>;
@@ -2261,7 +2562,7 @@ export interface StylisticOptions extends StylisticConfig, OptionsOverrides {
 
 // #region Types
 export type Awaitable<T> = T | Promise<T>;
-export type ConfigNames = 'antfu/gitignore' | 'antfu/ignores' | 'antfu/javascript/setup' | 'antfu/javascript/rules' | 'antfu/eslint-comments/rules' | 'antfu/command/rules' | 'antfu/perfectionist/setup' | 'antfu/node/setup' | 'antfu/node/rules' | 'antfu/jsdoc/setup' | 'antfu/jsdoc/rules' | 'antfu/imports/rules' | 'antfu/e18e/rules' | 'antfu/unicorn/setup' | 'antfu/unicorn/rules' | 'antfu/jsx/setup' | 'antfu/typescript/setup' | 'antfu/typescript/parser' | 'antfu/typescript/type-aware-parser' | 'antfu/typescript/rules' | 'antfu/typescript/rules-type-aware' | 'antfu/typescript/erasable-syntax-only' | 'antfu/stylistic/rules' | 'antfu/regexp/rules' | 'antfu/test/setup' | 'antfu/test/rules' | 'antfu/vue/setup' | 'antfu/vue/rules' | 'antfu/react/setup' | 'antfu/react/rules' | 'antfu/react/typescript' | 'antfu/react/type-aware-rules' | 'antfu/nextjs/setup' | 'antfu/nextjs/rules' | 'antfu/solid/setup' | 'antfu/solid/rules' | 'antfu/svelte/setup' | 'antfu/svelte/rules' | 'antfu/unocss' | 'antfu/astro/setup' | 'antfu/astro/rules' | 'antfu/angular/setup' | 'antfu/angular/rules/ts' | 'antfu/angular/rules/template' | 'antfu/jsonc/setup' | 'antfu/jsonc/rules' | 'antfu/sort/package-json' | 'antfu/sort/tsconfig-json' | 'antfu/pnpm/package-json' | 'antfu/pnpm/pnpm-workspace-yaml' | 'antfu/pnpm/pnpm-workspace-yaml-sort' | 'antfu/yaml/setup' | 'antfu/yaml/rules' | 'antfu/toml/setup' | 'antfu/toml/rules' | 'antfu/markdown/setup' | 'antfu/markdown/processor' | 'antfu/markdown/parser' | 'antfu/markdown/rules' | 'antfu/markdown/disables/code' | 'antfu/formatter/setup' | 'antfu/formatter/css' | 'antfu/formatter/scss' | 'antfu/formatter/less' | 'antfu/formatter/html' | 'antfu/formatter/xml' | 'antfu/formatter/svg' | 'antfu/formatter/markdown' | 'antfu/formatter/astro' | 'antfu/formatter/astro/disables' | 'antfu/formatter/graphql' | 'antfu/disables/scripts' | 'antfu/disables/cli' | 'antfu/disables/bin' | 'antfu/disables/dts' | 'antfu/disables/cjs' | 'antfu/disables/config-files';
+export type ConfigNames = 'antfu/gitignore' | 'antfu/ignores' | 'antfu/javascript/setup' | 'antfu/javascript/rules' | 'antfu/eslint-comments/rules' | 'antfu/command/rules' | 'antfu/perfectionist/setup' | 'antfu/node/setup' | 'antfu/node/rules' | 'antfu/jsdoc/setup' | 'antfu/jsdoc/rules' | 'antfu/imports/rules' | 'antfu/e18e/rules' | 'antfu/unicorn/setup' | 'antfu/unicorn/rules' | 'antfu/jsx/setup' | 'antfu/typescript/setup' | 'antfu/typescript/parser' | 'antfu/typescript/type-aware-parser' | 'antfu/typescript/rules' | 'antfu/typescript/rules-type-aware' | 'antfu/typescript/erasable-syntax-only' | 'antfu/antislop/rules' | 'antfu/stylistic/rules' | 'antfu/regexp/rules' | 'antfu/test/setup' | 'antfu/test/rules' | 'antfu/vue/setup' | 'antfu/vue/rules' | 'antfu/react/setup' | 'antfu/react/rules' | 'antfu/react/typescript' | 'antfu/react/type-aware-rules' | 'antfu/nextjs/setup' | 'antfu/nextjs/rules' | 'antfu/solid/setup' | 'antfu/solid/rules' | 'antfu/svelte/setup' | 'antfu/svelte/rules' | 'antfu/unocss' | 'antfu/astro/setup' | 'antfu/astro/rules' | 'antfu/angular/setup' | 'antfu/angular/rules/ts' | 'antfu/angular/rules/template' | 'antfu/jsonc/setup' | 'antfu/jsonc/rules' | 'antfu/sort/package-json' | 'antfu/sort/tsconfig-json' | 'antfu/pnpm/package-json' | 'antfu/pnpm/pnpm-workspace-yaml' | 'antfu/pnpm/pnpm-workspace-yaml-stylistic' | 'antfu/pnpm/pnpm-workspace-yaml-sort' | 'antfu/yaml/setup' | 'antfu/yaml/rules' | 'antfu/toml/setup' | 'antfu/toml/rules' | 'antfu/markdown/setup' | 'antfu/markdown/processor' | 'antfu/markdown/parser' | 'antfu/markdown/rules' | 'antfu/markdown/disables/code' | 'antfu/formatter/setup' | 'antfu/formatter/css' | 'antfu/formatter/scss' | 'antfu/formatter/less' | 'antfu/formatter/html' | 'antfu/formatter/xml' | 'antfu/formatter/svg' | 'antfu/formatter/markdown' | 'antfu/formatter/astro' | 'antfu/formatter/astro/disables' | 'antfu/formatter/graphql' | 'antfu/disables/scripts' | 'antfu/disables/cli' | 'antfu/disables/bin' | 'antfu/disables/dts' | 'antfu/disables/cjs' | 'antfu/disables/config-files';
 export type OptionsTypescript = (OptionsTypeScriptWithTypes & OptionsOverrides & OptionsTypeScriptErasableOnly) | (OptionsTypeScriptParserOptions & OptionsOverrides & OptionsTypeScriptErasableOnly);
 export type ResolvedOptions<T> = T extends boolean ? never : NonNullable<T>;
 export type Rules = Record<string, Linter.RuleEntry<any> | undefined> & RuleOptions;
@@ -2274,6 +2575,7 @@ export type TypedFlatConfigItem = Omit<ConfigWithExtends, 'plugins' | 'rules'> &
 // #region Functions
 export declare function angular(_?: OptionsOverrides): Promise<TypedFlatConfigItem[]>;
 export declare function antfu(_?: OptionsConfig & Omit<TypedFlatConfigItem, 'files' | 'ignores'>, ..._: Awaitable<TypedFlatConfigItem | TypedFlatConfigItem[] | FlatConfigComposer<any, any> | Linter.Config[]>[]): FlatConfigComposer<TypedFlatConfigItem, ConfigNames>;
+export declare function antislop(_?: OptionsAntislop & OptionsHasTypeScript): Promise<TypedFlatConfigItem[]>;
 export declare function astro(_?: OptionsOverrides & OptionsStylistic & OptionsFiles): Promise<TypedFlatConfigItem[]>;
 export declare function combine(..._: Awaitable<TypedFlatConfigItem | TypedFlatConfigItem[]>[]): Promise<TypedFlatConfigItem[]>;
 export declare function command(): Promise<TypedFlatConfigItem[]>;
@@ -8124,6 +8426,62 @@ type SemiSpacing = [] | [{
   after?: boolean;
 }];
 type SemiStyle = [] | [("last" | "first")];
+type SlopMaxCommentLength = [] | [{
+  cwd?: string;
+  inspection?: (("full" | "uncommitted" | "recent-changes") | {
+    mode: ("full" | "uncommitted" | "recent-changes");
+    tracebackCommits?: number;
+  });
+  ignoreJSDoc?: boolean;
+  maximumWords?: number;
+}];
+type SlopNoChainedTypeAssertions = [] | [{
+  cwd?: string;
+  inspection?: (("full" | "uncommitted" | "recent-changes") | {
+    mode: ("full" | "uncommitted" | "recent-changes");
+    tracebackCommits?: number;
+  });
+}];
+type SlopNoEmDash = [] | [{
+  cwd?: string;
+  inspection?: (("full" | "uncommitted" | "recent-changes") | {
+    mode: ("full" | "uncommitted" | "recent-changes");
+    tracebackCommits?: number;
+  });
+}];
+type SlopNoJargon = [] | [{
+  cwd?: string;
+  inspection?: (("full" | "uncommitted" | "recent-changes") | {
+    mode: ("full" | "uncommitted" | "recent-changes");
+    tracebackCommits?: number;
+  });
+  allow?: string[];
+  extraWords?: string[];
+  ignoreJSDoc?: boolean;
+  words?: string[];
+}];
+type SlopNoTrivialFunctions = [] | [{
+  cwd?: string;
+  inspection?: (("full" | "uncommitted" | "recent-changes") | {
+    mode: ("full" | "uncommitted" | "recent-changes");
+    tracebackCommits?: number;
+  });
+  minimumReferences?: number;
+}];
+type SlopNoTrivialTypeAliases = [] | [{
+  cwd?: string;
+  inspection?: (("full" | "uncommitted" | "recent-changes") | {
+    mode: ("full" | "uncommitted" | "recent-changes");
+    tracebackCommits?: number;
+  });
+}];
+type SlopPreferJsdoc = [] | [{
+  cwd?: string;
+  inspection?: (("full" | "uncommitted" | "recent-changes") | {
+    mode: ("full" | "uncommitted" | "recent-changes");
+    tracebackCommits?: number;
+  });
+}];
 type SolidEventHandlers = [] | [{
   ignoreCase?: boolean;
   warnOnSpread?: boolean;
@@ -8159,6 +8517,79 @@ type SolidStyleProp = [] | [{
 type SolidValidUseServer = [] | [{
   clientWrappers?: string[];
 }];
+type SonarjsArrowFunctionConvention = [] | [{
+  requireParameterParentheses?: boolean;
+  requireBodyBraces?: boolean;
+}];
+type SonarjsClassName = [] | [{
+  format?: string;
+}];
+type SonarjsCognitiveComplexity = [] | [(number | "silence-issues")] | [(number | "silence-issues"), "silence-issues"];
+type SonarjsCommentRegex = [] | [{
+  regularExpression?: string;
+  message?: string;
+  flags?: string;
+}];
+type SonarjsContentLength = [] | [{
+  fileUploadSizeLimit?: number;
+  standardSizeLimit?: number;
+}];
+type SonarjsCyclomaticComplexity = [] | [{
+  threshold?: number;
+}];
+type SonarjsExpressionComplexity = [] | [{
+  max?: number;
+}];
+type SonarjsFileHeader = [] | [{
+  headerFormat?: string;
+  isRegularExpression?: boolean;
+}];
+type SonarjsFunctionName = [] | [{
+  format?: string;
+}];
+type SonarjsMaxLines = [] | [{
+  maximum?: number;
+}];
+type SonarjsMaxLinesPerFunction = [] | [{
+  maximum?: number;
+}];
+type SonarjsMaxSwitchCases = [] | [number];
+type SonarjsMaxUnionSize = [] | [{
+  threshold?: number;
+}];
+type SonarjsNestedControlFlow = [] | [{
+  maximumNestingLevel?: number;
+}];
+type SonarjsNewOperatorMisuse = [] | [{
+  considerJSDoc?: boolean;
+}];
+type SonarjsNoDuplicateString = [] | [{
+  threshold?: number;
+  ignoreStrings?: string;
+}];
+type SonarjsNoHardcodedPasswords = [] | [{
+  passwordWords?: string[];
+}];
+type SonarjsNoHardcodedSecrets = [] | [{
+  secretWords?: string;
+  randomnessSensibility?: number;
+}];
+type SonarjsNoIdenticalFunctions = [] | [number];
+type SonarjsNoImplicitDependencies = [] | [{
+  whitelist?: string[];
+}];
+type SonarjsNoIntrusivePermissions = [] | [{
+  permissions?: string[];
+}];
+type SonarjsNoNestedFunctions = [] | [{
+  threshold?: number;
+}];
+type SonarjsRegexComplexity = [] | [{
+  threshold?: number;
+}];
+type SonarjsVariableName = [] | [{
+  format?: string;
+}];
 type SortImports = [] | [{
   ignoreCase?: boolean;
   memberSyntaxSortOrder?: [("none" | "all" | "multiple" | "single"), ("none" | "all" | "multiple" | "single"), ("none" | "all" | "multiple" | "single"), ("none" | "all" | "multiple" | "single")];

### test/__snapshots__/api/@antfu/eslint-config/index.snapshot.js [modified, +1/-0]
@@ -4,6 +4,7 @@
 // #region Functions
 export async function angular(_) {}
 export function antfu(_, ..._) {}
+export async function antislop(_) {}
 export async function astro(_) {}
 export async function combine(..._) {}
 export async function command() {}

### test/__snapshots__/factory/default.snap.js [modified, +15/-0]
@@ -893,6 +893,21 @@
       "pnpm/yaml-no-unused-catalog-item",
     ],
   },
+  {
+    "files": [
+      "pnpm-workspace.yaml",
+    ],
+    "languageOptions": {
+      "parser": "yaml-eslint-parser",
+    },
+    "name": "antfu/pnpm/pnpm-workspace-yaml-stylistic",
+    "plugins": [
+      "pnpm",
+    ],
+    "rules": [
+      "pnpm/yaml-blank-lines",
+    ],
+  },
   {
     "files": [
       "pnpm-workspace.yaml",

### test/__snapshots__/factory/full-on.snap.js [modified, +54/-0]
@@ -515,6 +515,45 @@
       "erasable-syntax-only/parameter-properties",
     ],
   },
+  {
+    "ignores": [
+      "**/*.md",
+    ],
+    "name": "antfu/antislop/rules",
+    "plugins": [
+      "slop",
+      "sonarjs",
+    ],
+    "rules": [
+      "slop/max-comment-length",
+      "slop/no-chained-type-assertions",
+      "slop/no-em-dash",
+      "slop/no-jargon",
+      "slop/no-trivial-functions",
+      "slop/no-trivial-type-aliases",
+      "slop/prefer-jsdoc",
+      "sonarjs/cognitive-complexity",
+      "sonarjs/no-all-duplicated-branches",
+      "sonarjs/no-collapsible-if",
+      "sonarjs/no-commented-code",
+      "sonarjs/no-dead-store",
+      "sonarjs/no-duplicated-branches",
+      "sonarjs/no-element-overwrite",
+      "sonarjs/no-empty-collection",
+      "sonarjs/no-gratuitous-expressions",
+      "sonarjs/no-identical-conditions",
+      "sonarjs/no-identical-expressions",
+      "sonarjs/no-identical-functions",
+      "sonarjs/no-invariant-returns",
+      "sonarjs/no-inverted-boolean-check",
+      "sonarjs/no-redundant-boolean",
+      "sonarjs/no-redundant-jump",
+      "sonarjs/no-unused-collection",
+      "sonarjs/no-use-of-empty-return-value",
+      "sonarjs/prefer-single-boolean-return",
+      "ts/no-explicit-any",
+    ],
+  },
   {
     "ignores": [
       "**/*.md",
@@ -1409,6 +1448,21 @@
       "pnpm/yaml-no-unused-catalog-item",
     ],
   },
+  {
+    "files": [
+      "pnpm-workspace.yaml",
+    ],
+    "languageOptions": {
+      "parser": "yaml-eslint-parser",
+    },
+    "name": "antfu/pnpm/pnpm-workspace-yaml-stylistic",
+    "plugins": [
+      "pnpm",
+    ],
+    "rules": [
+      "pnpm/yaml-blank-lines",
+    ],
+  },
   {
     "files": [
       "pnpm-workspace.yaml",

### test/__snapshots__/factory/in-editor.snap.js [modified, +15/-0]
@@ -893,6 +893,21 @@
       "pnpm/yaml-no-unused-catalog-item",
     ],
   },
+  {
+    "files": [
+      "pnpm-workspace.yaml",
+    ],
+    "languageOptions": {
+      "parser": "yaml-eslint-parser",
+    },
+    "name": "antfu/pnpm/pnpm-workspace-yaml-stylistic",
+    "plugins": [
+      "pnpm",
+    ],
+    "rules": [
+      "pnpm/yaml-blank-lines",
+    ],
+  },
   {
     "files": [
       "pnpm-workspace.yaml",

### test/__snapshots__/factory/javascript-vue.snap.js [modified, +15/-0]
@@ -796,6 +796,21 @@
       "pnpm/yaml-no-unused-catalog-item",
     ],
   },
+  {
+    "files": [
+      "pnpm-workspace.yaml",
+    ],
+    "languageOptions": {
+      "parser": "yaml-eslint-parser",
+    },
+    "name": "antfu/pnpm/pnpm-workspace-yaml-stylistic",
+    "plugins": [
+      "pnpm",
+    ],
+    "rules": [
+      "pnpm/yaml-blank-lines",
+    ],
+  },
   {
     "files": [
       "pnpm-workspace.yaml",

### test/__snapshots__/factory/less-opinionated.snap.js [modified, +15/-0]
@@ -891,6 +891,21 @@
       "pnpm/yaml-no-unused-catalog-item",
     ],
   },
+  {
+    "files": [
+      "pnpm-workspace.yaml",
+    ],
+    "languageOptions": {
+      "parser": "yaml-eslint-parser",
+    },
+    "name": "antfu/pnpm/pnpm-workspace-yaml-stylistic",
+    "plugins": [
+      "pnpm",
+    ],
+    "rules": [
+      "pnpm/yaml-blank-lines",
+    ],
+  },
   {
     "files": [
       "pnpm-workspace.yaml",

### test/__snapshots__/factory/lib.snap.js [modified, +15/-0]
@@ -894,6 +894,21 @@
       "pnpm/yaml-no-unused-catalog-item",
     ],
   },
+  {
+    "files": [
+      "pnpm-workspace.yaml",
+    ],
+    "languageOptions": {
+      "parser": "yaml-eslint-parser",
+    },
+    "name": "antfu/pnpm/pnpm-workspace-yaml-stylistic",
+    "plugins": [
+      "pnpm",
+    ],
+    "rules": [
+      "pnpm/yaml-blank-lines",
+    ],
+  },
   {
     "files": [
       "pnpm-workspace.yaml",

### test/__snapshots__/factory/pnpm-without-jsonc.snap.js [modified, +15/-0]
@@ -804,6 +804,21 @@
       "pnpm/yaml-no-unused-catalog-item",
     ],
   },
+  {
+    "files": [
+      "pnpm-workspace.yaml",
+    ],
+    "languageOptions": {
+      "parser": "yaml-eslint-parser",
+    },
+    "name": "antfu/pnpm/pnpm-workspace-yaml-stylistic",
+    "plugins": [
+      "pnpm",
+    ],
+    "rules": [
+      "pnpm/yaml-blank-lines",
+    ],
+  },
   {
     "files": [
       "pnpm-workspace.yaml",