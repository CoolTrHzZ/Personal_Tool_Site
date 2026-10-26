// @vitest-environment node
// The same named cases are reusable by an external Node-only evidence runner.
// This normal tests/**/*.test.js entry does not claim native DOM/browser coverage.
import { describe, it } from 'vitest'
import { staticHtmlFeedbackCases } from './helpers/static-html-feedback-cases.js'

describe('static HTML feedback (whole inline scripts, synthetic VM surfaces)', () => {
  for (const { name, run } of staticHtmlFeedbackCases) it(name, () => run())
})
