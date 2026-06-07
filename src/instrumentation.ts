// Next.js 15 passes --localstorage-file to Node.js without a valid file path.
// This creates a localStorage global whose methods (getItem, setItem, etc.) are
// not functions. Firebase SDK detects the global and crashes during SSR.
// instrumentation.ts runs before any request is handled, so the patch is in place
// before Document.getInitialProps renders the React tree and imports Firebase.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const g = globalThis as Record<string, unknown>;
    const ls = g['localStorage'];

    if (ls !== undefined && typeof (ls as { getItem?: unknown }).getItem !== 'function') {
      const store: Record<string, string> = {};
      const fixed = {
        getItem: (key: string) => store[key] ?? null,
        setItem: (key: string, value: string) => { store[key] = String(value); },
        removeItem: (key: string) => { delete store[key]; },
        clear: () => { for (const k in store) delete store[k]; },
        key: (index: number) => Object.keys(store)[index] ?? null,
        get length() { return Object.keys(store).length; },
      };

      // Strategy 1: delete existing property and redefine
      try {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete (g as Record<string, unknown>)['localStorage'];
        Object.defineProperty(g, 'localStorage', { value: fixed, writable: true, configurable: true });
        return;
      } catch { /* try next strategy */ }

      // Strategy 2: overwrite with Object.defineProperty directly
      try {
        Object.defineProperty(g, 'localStorage', { value: fixed, writable: true, configurable: true });
        return;
      } catch { /* try next strategy */ }

      // Strategy 3: direct assignment
      try { g['localStorage'] = fixed; return; } catch { /* try next strategy */ }

      // Strategy 4: patch getItem/setItem on the prototype of the existing object
      const proto = Object.getPrototypeOf(ls as object) as Record<string, unknown>;
      for (const [key, val] of Object.entries(fixed)) {
        if (key === 'length') continue;
        try {
          Object.defineProperty(proto, key, { value: val, writable: true, configurable: true });
        } catch {
          try { proto[key] = val; } catch { /* ignore */ }
        }
      }
    }
  }
}
