import { describe, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { navigationArrowSourceCases } from './helpers/navigation-arrow-source-contract.mjs'

const card = readFileSync(new URL('../src/components/navigation/NavigationCard.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/styles/pages/navigation.css', import.meta.url), 'utf8')

describe('P05 scoped arrow source preservation', () => {
  for (const [name, check] of navigationArrowSourceCases({ card, css })) it(name, check)
})
