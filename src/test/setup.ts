// Setup global pour Vitest.
// jsdom n'expose pas toujours un localStorage fonctionnel (origine opaque) ;
// on installe un polyfill mémoire simple, réinitialisé avant chaque test.
import { beforeEach, vi } from "vitest";

class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

const memory = new MemoryStorage();
vi.stubGlobal("localStorage", memory);

beforeEach(() => {
  memory.clear();
});
