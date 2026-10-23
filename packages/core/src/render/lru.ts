export class LruCache<K, V> {
  private readonly map = new Map<K, V>();

  constructor(private readonly limit: number, private readonly onEvict?: (value: V, key: K) => void) {}

  get(key: K): V | undefined {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key) as V;
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.limit) {
      const oldest = this.map.keys().next();
      if (oldest.done) break;
      const keyToEvict = oldest.value;
      const valueToEvict = this.map.get(keyToEvict) as V;
      this.map.delete(keyToEvict);
      this.onEvict?.(valueToEvict, keyToEvict);
    }
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  delete(key: K): void {
    if (!this.map.has(key)) return;
    const value = this.map.get(key) as V;
    this.map.delete(key);
    this.onEvict?.(value, key);
  }

  clear(): void {
    for (const key of [...this.map.keys()]) this.delete(key);
  }

  keys(): K[] {
    return [...this.map.keys()];
  }

  get size(): number {
    return this.map.size;
  }
}
