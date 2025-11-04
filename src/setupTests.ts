import '@testing-library/jest-dom/vitest'

class ClipboardMock {
  #data = ''

  async writeText(value: string) {
    this.#data = value
  }

  async readText() {
    return this.#data
  }
}

if (typeof navigator !== 'undefined' && !navigator.clipboard) {
  Object.assign(navigator, { clipboard: new ClipboardMock() })
}
