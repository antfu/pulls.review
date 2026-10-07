import { presetAnthonyDesign } from '@antfu/design/unocss'
import {
  defineConfig,
  presetAttributify,
  presetIcons,
  presetTypography,
  presetWind3,
  transformerDirectives,
  transformerVariantGroup,
} from 'unocss'

/** Applies `utilities` to every `selector` descendant (`_` stands for a space). */
function descendant(selector: string, utilities: string) {
  return utilities.split(' ').map(utility => `[&_${selector}]:${utility}`).join(' ')
}

const MARKDOWN_BLOCK = ':is(p,ul,ol,pre,blockquote,table,hr,h1,h2,h3,h4)'

/** Rendered chat Markdown, whose elements the template can't put classes on. */
const chatMarkdown = [
  'text-sm leading-relaxed break-words',
  descendant(`${MARKDOWN_BLOCK}+${MARKDOWN_BLOCK}`, 'mt-2.5'),
  descendant(':is(h1,h2,h3,h4)', 'font-semibold'),
  descendant(':is(h1,h2)', 'text-base'),
  descendant(':is(h3,h4)', 'text-sm'),
  descendant('*+:is(h1,h2,h3,h4)', 'mt-4'),
  descendant(':is(ul,ol)', 'pl-5'),
  descendant('ul', 'list-disc'),
  descendant('ol', 'list-decimal'),
  descendant('li+li', 'mt-1'),
  descendant(':not(pre)>code', 'text-[0.85em] px-1 py-0.5 rounded bg-code'),
  descendant('pre', 'text-xs leading-relaxed p-3 border border-base rounded-md bg-code max-w-full overflow-x-auto'),
  descendant('pre_code', 'whitespace-pre'),
  descendant('blockquote', 'pl-3 border-l-2 border-base op-fade'),
  descendant('table', 'text-xs block max-w-full overflow-x-auto border-collapse'),
  descendant(':is(th,td)', 'px-2 py-1 border border-base text-left'),
  descendant('a', 'underline underline-offset-2'),
  descendant('a:hover', 'op-80'),
  descendant('hr', 'border-base'),
].join(' ')

export function createUnoConfig() {
  return defineConfig({
    theme: {
      colors: {
        // Landing-page accent trio. Two stops each: the brighter one reads on
        // the dark surface, the deeper one keeps contrast on white.
        accent: {
          orange: { 400: '#f57a4f', 600: '#d9552a' },
          teal: { 400: '#5fc2a4', 600: '#1f8f72' },
          magenta: { 400: '#c65fbf', 600: '#9c3a95' },
        },
      },
    },
    shortcuts: [
      ['btn', 'px-4 py-1 rounded inline-block bg-teal-600 text-white cursor-pointer hover:bg-teal-700 disabled:cursor-default disabled:bg-gray-600 disabled:opacity-50'],
      ['icon-btn', 'inline-block cursor-pointer select-none opacity-75 transition duration-200 ease-in-out hover:opacity-100 hover:text-teal-600'],
      {
        'color-accent-orange': 'color-accent-orange-600 dark:color-accent-orange-400',
        'color-accent-teal': 'color-accent-teal-600 dark:color-accent-teal-400',
        'color-accent-magenta': 'color-accent-magenta-600 dark:color-accent-magenta-400',
      },
      { 'chat-markdown': chatMarkdown },
      { 'description-markdown': chatMarkdown },
      // Overrides
      {
        'bg-active': 'bg-[#8881]',
        'op-mute': 'op50',
      },
      // Named z-index layers used by @antfu/design's overlay components (OverlayModal, etc.)
      // The preset ships no z-index scale and blocks plain `z-<number>` on purpose.
      {
        'z-file-diff-header': 'z-[10]',
        'z-nav': 'z-[30]',
        'z-dropdown': 'z-[40]',
        'z-tooltip': 'z-[45]',
        'z-toast': 'z-[50]',

        'z-drawer-backdrop': 'z-[80]',
        'z-drawer-content': 'z-[90]',

        'z-modal': 'z-[100]',
        'z-modal-backdrop': 'z-[101]',
        'z-modal-content': 'z-[102]',
      },
    ],
    presets: [
      presetAnthonyDesign(),
      presetWind3(),
      presetAttributify(),
      presetIcons({
        scale: 1.2,
      }),
      presetTypography(),
    ],
    transformers: [
      transformerDirectives(),
      transformerVariantGroup(),
    ],
  })
}

export default createUnoConfig()
