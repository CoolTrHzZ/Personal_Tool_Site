import { describe, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { navigationArrowSourceCases } from './helpers/navigation-arrow-source-contract.mjs'

const card = readFileSync(resolve('src/components/navigation/NavigationCard.tsx'), 'utf8')
const css = readFileSync(resolve('src/styles/pages/navigation.css'), 'utf8')

describe('P05 scoped arrow source preservation', () => {
  for (const [name, check] of navigationArrowSourceCases({ card, css })) it(name, check)
})
