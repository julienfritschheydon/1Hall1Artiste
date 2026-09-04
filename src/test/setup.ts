// Setup global pour Vitest.
// jsdom n'expose pas toujours un localStorage fonctionnel (origine opaque) ;
// on installe un polyfill mémoire simple, réinitialisé avant chaque test.
import { afterEach, beforeEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
// Matchers DOM (toBeInTheDocument, toBeDisabled…) pour les tests de composants.
import "@testing-library/jest-dom/vitest";

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

// sessionStorage suit la même logique : la session admin s'y appuie.
const session = new MemoryStorage();
vi.stubGlobal("sessionStorage", session);

beforeEach(() => {
  memory.clear();
  session.clear();
});

// Démonte les composants rendus entre deux tests : sans ça, les requêtes par texte
// trouvent plusieurs occurrences et les tests se polluent entre eux.
afterEach(() => {
  cleanup();
});
