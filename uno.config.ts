import type { Preset } from 'unocss'
import { presetAnthonyDesign } from '@antfu/design/unocss'
import {
  defineConfig,
  presetAttributify,
  presetIcons,
  presetTypography,
  presetWind4,
  transformerDirectives,
  transformerVariantGroup,
} from 'unocss'

export interface CreateUnoConfigOptions {
  /**
   * The base utility preset layered under `@antfu/design`. Defaults to
   * {@link presetWind4} for the main app. The GitHub-embed build (see
   * `scripts/build-embed-css.ts`) passes `presetWind3()` instead: Wind4
   * registers its theme + `--un-*` custom properties via
   * `@property { inherits: false }` and keeps them in a document `:root {}`
   * block, neither of which reaches a shadow tree, so its
   * `color-mix(var(--colors-*))` utilities resolve to nothing there. Wind3
   * bakes the same semantic utilities to concrete `rgb()` + `.dark` variants,
   * which are self-contained inside a shadow root.
   */
  base?: Preset<any> | Preset<any>[]
}

export function createUnoConfig(options: CreateUnoConfigOptions = {}) {
  const base = options.base ?? presetWind4()
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
      // Named z-index layers used by @antfu/design's overlay components (OverlayModal, etc.)
      // The preset ships no z-index scale and blocks plain `z-<number>` on purpose.
      {
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
      ...(Array.isArray(base) ? base : [base]),
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
