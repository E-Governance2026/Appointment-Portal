import 'vitest'
import type { AxeMatchers } from 'vitest-axe/matchers'

// Teach TypeScript about the vitest-axe custom matcher we extend onto expect().
declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Assertion<T = any> extends AxeMatchers {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface AsymmetricMatchersContaining extends AxeMatchers {}
}
