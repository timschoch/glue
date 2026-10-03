// Carbon tokens only in the design system: a raw colour or a raw size fails.

// A border width that Carbon's style map does not name: anything but 1px to 3px.
const UNNAMED_BORDER_WIDTH = /\b(?![123]px\b)\d+(\.\d+)?px\b/

/** @type {import('stylelint').Config} */
export default {
  customSyntax: 'postcss-scss',
  rules: {
    'color-no-hex': true,
    'color-named': 'never',
    'function-disallowed-list': [
      'rgb',
      'rgba',
      'hsl',
      'hsla',
      'hwb',
      'lab',
      'lch',
      'oklab',
      'oklch',
      'color',
      'color-mix',
    ],
    'unit-disallowed-list': [
      ['px', 'rem', 'em'],
      { ignoreProperties: { px: [/^border/] } },
    ],
    'declaration-property-value-disallowed-list': {
      '/^border/': [UNNAMED_BORDER_WIDTH],
    },
    // Type comes from a Carbon type token, with `type-style`.
    'property-disallowed-list': [
      'font',
      'font-family',
      'font-size',
      'font-weight',
      'letter-spacing',
      'line-height',
    ],
  },
}
