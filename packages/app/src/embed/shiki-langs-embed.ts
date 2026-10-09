import { createBundledHighlighter } from '@shikijs/core'
import { createJavaScriptRegexEngine } from '@shikijs/engine-javascript'

export const bundledLanguagesBase = {
  'typescript': () => import('@shikijs/langs/typescript'),
  'javascript': () => import('@shikijs/langs/javascript'),
  'jsx': () => import('@shikijs/langs/jsx'),
  'tsx': () => import('@shikijs/langs/tsx'),
  'vue': () => import('@shikijs/langs/vue'),
  'vue-html': () => import('@shikijs/langs/vue-html'),
  'glimmer-js': () => import('@shikijs/langs/glimmer-js'),
  'glimmer-ts': () => import('@shikijs/langs/glimmer-ts'),
  'handlebars': () => import('@shikijs/langs/handlebars'),
  'json': () => import('@shikijs/langs/json'),
  'jsonc': () => import('@shikijs/langs/jsonc'),
  'yaml': () => import('@shikijs/langs/yaml'),
  'toml': () => import('@shikijs/langs/toml'),
  'markdown': () => import('@shikijs/langs/markdown'),
  'mdx': () => import('@shikijs/langs/mdx'),
  'css': () => import('@shikijs/langs/css'),
  'scss': () => import('@shikijs/langs/scss'),
  'less': () => import('@shikijs/langs/less'),
  'html': () => import('@shikijs/langs/html'),
  'xml': () => import('@shikijs/langs/xml'),
  'python': () => import('@shikijs/langs/python'),
  'go': () => import('@shikijs/langs/go'),
  'rust': () => import('@shikijs/langs/rust'),
  'java': () => import('@shikijs/langs/java'),
  'kotlin': () => import('@shikijs/langs/kotlin'),
  'c': () => import('@shikijs/langs/c'),
  'cpp': () => import('@shikijs/langs/cpp'),
  'csharp': () => import('@shikijs/langs/csharp'),
  'ruby': () => import('@shikijs/langs/ruby'),
  'php': () => import('@shikijs/langs/php'),
  'swift': () => import('@shikijs/langs/swift'),
  'shellscript': () => import('@shikijs/langs/shellscript'),
  'sql': () => import('@shikijs/langs/sql'),
  'docker': () => import('@shikijs/langs/docker'),
  'make': () => import('@shikijs/langs/make'),
  'graphql': () => import('@shikijs/langs/graphql'),
  'diff': () => import('@shikijs/langs/diff'),
  'ini': () => import('@shikijs/langs/ini'),
  'perl': () => import('@shikijs/langs/perl'),
  'lua': () => import('@shikijs/langs/lua'),
  'r': () => import('@shikijs/langs/r'),
  'scala': () => import('@shikijs/langs/scala'),
  'elixir': () => import('@shikijs/langs/elixir'),
  'haskell': () => import('@shikijs/langs/haskell'),
  'clojure': () => import('@shikijs/langs/clojure'),
  'groovy': () => import('@shikijs/langs/groovy'),
  'objective-c': () => import('@shikijs/langs/objective-c'),
  'objective-cpp': () => import('@shikijs/langs/objective-cpp'),
  'proto': () => import('@shikijs/langs/proto'),
  'terraform': () => import('@shikijs/langs/terraform'),
  'nginx': () => import('@shikijs/langs/nginx'),
}

export const bundledLanguagesAlias = {
  'ts': bundledLanguagesBase.typescript,
  'cts': bundledLanguagesBase.typescript,
  'mts': bundledLanguagesBase.typescript,
  'js': bundledLanguagesBase.javascript,
  'cjs': bundledLanguagesBase.javascript,
  'mjs': bundledLanguagesBase.javascript,
  'gjs': bundledLanguagesBase['glimmer-js'],
  'gts': bundledLanguagesBase['glimmer-ts'],
  'hbs': bundledLanguagesBase.handlebars,
  'yml': bundledLanguagesBase.yaml,
  'md': bundledLanguagesBase.markdown,
  'py': bundledLanguagesBase.python,
  'rs': bundledLanguagesBase.rust,
  'kt': bundledLanguagesBase.kotlin,
  'kts': bundledLanguagesBase.kotlin,
  'c++': bundledLanguagesBase.cpp,
  'c#': bundledLanguagesBase.csharp,
  'cs': bundledLanguagesBase.csharp,
  'rb': bundledLanguagesBase.ruby,
  'bash': bundledLanguagesBase.shellscript,
  'sh': bundledLanguagesBase.shellscript,
  'shell': bundledLanguagesBase.shellscript,
  'zsh': bundledLanguagesBase.shellscript,
  'dockerfile': bundledLanguagesBase.docker,
  'makefile': bundledLanguagesBase.make,
  'gql': bundledLanguagesBase.graphql,
  'properties': bundledLanguagesBase.ini,
  'hs': bundledLanguagesBase.haskell,
  'clj': bundledLanguagesBase.clojure,
  'objc': bundledLanguagesBase['objective-c'],
  'protobuf': bundledLanguagesBase.proto,
  'tf': bundledLanguagesBase.terraform,
  'tfvars': bundledLanguagesBase.terraform,
}

export const bundledLanguages = { ...bundledLanguagesBase, ...bundledLanguagesAlias }

export const bundledThemes = {}

export function createOnigurumaEngine() {
  throw new Error('Oniguruma engine is not available in this build.')
}

export * from '@shikijs/core'

export { createJavaScriptRegexEngine } from '@shikijs/engine-javascript'

export const createHighlighter = createBundledHighlighter({
  langs: bundledLanguages,
  themes: bundledThemes,
  engine: () => createJavaScriptRegexEngine(),
})
