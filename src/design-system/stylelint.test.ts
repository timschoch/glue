import stylelint from 'stylelint'
import { describe, expect, it } from 'vitest'

// The names of the rules that a declaration breaks in a design-system stylesheet.
async function brokenRules(declaration: string): Promise<Array<string>> {
  const { results } = await stylelint.lint({
    code: `.sample {\n  ${declaration};\n}\n`,
    codeFilename: 'src/design-system/sample.module.scss',
  })
  return results.flatMap(({ warnings }) => warnings.map(({ rule }) => rule))
}

describe('stylelint in the design system', () => {
  it.each([
    ['color: #161616', 'color-no-hex'],
    ['color: black', 'color-named'],
    ['color: rgb(22 22 22)', 'function-disallowed-list'],
  ])('fails on the raw colour in "%s"', async (declaration, rule) => {
    expect(await brokenRules(declaration)).toEqual([rule])
  })

  it.each([
    ['padding: 16px', 'unit-disallowed-list'],
    ['padding: 1rem', 'unit-disallowed-list'],
    ['inline-size: 20em', 'unit-disallowed-list'],
    [
      'border: 4px solid $border-subtle-01',
      'declaration-property-value-disallowed-list',
    ],
    ['font-size: $spacing-05', 'property-disallowed-list'],
    ['font-weight: 600', 'property-disallowed-list'],
  ])('fails on the raw size in "%s"', async (declaration, rule) => {
    expect(await brokenRules(declaration)).toEqual([rule])
  })

  it.each([
    'color: $text-primary',
    'padding: $spacing-05 $spacing-05 0',
    'inline-size: $spacing-13 * 2',
    'inline-size: 100%',
    'border: 1px solid $border-subtle-01',
    'border-inline-start: 3px solid $border-interactive',
  ])('passes the tokens and the border widths in "%s"', async (declaration) => {
    expect(await brokenRules(declaration)).toEqual([])
  })
})
