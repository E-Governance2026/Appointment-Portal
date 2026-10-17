import '@testing-library/jest-dom'

// jsdom does not implement IntersectionObserver or matchMedia; stub both so
// components that use them (landing section highlighting, reduced-motion checks)
// can render in tests.
if (typeof globalThis.IntersectionObserver === 'undefined') {
  class IO {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return [] }
    root = null
    rootMargin = ''
    thresholds = []
  }
  // @ts-expect-error assigning a test stub
  globalThis.IntersectionObserver = IO
}

if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() { return false },
  }) as MediaQueryList
}
