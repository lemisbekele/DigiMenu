import "@testing-library/jest-dom/vitest"
import "../i18n"

// Polyfill matchMedia for ThemeContext (jsdom doesn't implement it)
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })
}

function createMemoryStorage() {
  const store = new Map()
  return {
    get length() {
      return store.size
    },
    clear() {
      store.clear()
    },
    getItem(key) {
      return store.has(String(key)) ? store.get(String(key)) : null
    },
    key(index) {
      return [...store.keys()][index] ?? null
    },
    removeItem(key) {
      store.delete(String(key))
    },
    setItem(key, value) {
      store.set(String(key), String(value))
    },
  }
}

// Node 25+ enables an experimental Web Storage global that shadows the jsdom
// implementation (or leaves it undefined), so replace it with a working shim.
for (const name of ["localStorage", "sessionStorage"]) {
  const current = globalThis[name]
  if (typeof current?.clear !== "function" || typeof current?.getItem !== "function") {
    const storage = createMemoryStorage()
    Object.defineProperty(globalThis, name, { value: storage, configurable: true, writable: true })
    if (typeof window !== "undefined") {
      Object.defineProperty(window, name, { value: storage, configurable: true, writable: true })
    }
  }
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

window.scrollTo = () => {}
