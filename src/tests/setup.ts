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

if (typeof window !== 'undefined' && !window.BroadcastChannel) {
  const channels: Record<string, Set<(ev: MessageEvent) => void>> = {}
  class MockBroadcastChannel {
    name: string
    onmessage: ((ev: MessageEvent) => void) | null = null
    private listener: (ev: MessageEvent) => void

    constructor(name: string) {
      this.name = name
      if (!channels[name]) channels[name] = new Set()
      this.listener = (ev: MessageEvent) => {
        if (this.onmessage) this.onmessage(ev)
      }
      channels[name].add(this.listener)
    }

    postMessage(data: any) {
      const listeners = channels[this.name]
      if (listeners) {
        listeners.forEach(fn => {
          if (fn !== this.listener) {
            fn(new MessageEvent('message', { data }))
          }
        })
      }
    }

    close() {
      channels[this.name]?.delete(this.listener)
    }
  }
  // @ts-expect-error test mock
  window.BroadcastChannel = MockBroadcastChannel
}
