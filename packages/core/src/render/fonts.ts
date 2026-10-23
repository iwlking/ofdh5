export interface FontRegistry {
  register(id: string, data: Uint8Array, familyHint?: string): Promise<boolean>;
  family(id: string, familyHint?: string): string;
  has(id: string): boolean;
}

export function createFontRegistry(fallback = 'sans-serif'): FontRegistry {
  const families = new Map<string, string>();

  return {
    async register(id, data, familyHint) {
      if (families.has(id)) return true;
      const failFamily = familyHint ? `"${familyHint}", ${fallback}` : fallback;

      if (typeof FontFace === 'undefined' || typeof document === 'undefined' || !document.fonts) {
        families.set(id, failFamily);
        return false;
      }

      try {
        const family = `ofdh5-${id}`;
        const source = data.slice().buffer;
        const face = new FontFace(family, source);
        await face.load();
        document.fonts.add(face);
        families.set(id, `"${family}"`);
        return true;
      } catch {
        families.set(id, failFamily);
        return false;
      }
    },

    family(id, familyHint) {
      return families.get(id) ?? (familyHint ? `"${familyHint}", ${fallback}` : fallback);
    },

    has(id) {
      return families.has(id);
    },
  };
}
