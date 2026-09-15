import * as THREE from 'three';
import { ASSET_DEADLINE_MS } from './ModelLoader';

/**
 * Optional PBR texture sets for the machine's materials.
 *
 * The project generates every texture in code, and still does — this is an
 * enhancement layered on top, never a dependency. If a set is missing, fails
 * to decode, or was never requested, `Materials` falls back to the procedural
 * maps it has always used and the game is identical apart from the surface.
 *
 * That fallback is load-bearing rather than defensive: the browser harnesses
 * and the e2e suite boot with nothing to load, so they stay deterministic and
 * fast, and a texture that 404s in production costs a nicer-looking hull
 * rather than a black screen.
 */

/** Material slots that have a texture set on disk. */
export type TexturedSlot = 'hull' | 'rusted-steel' | 'deck-plate' | 'build-plate' | 'sand';

export const TEXTURED_SLOTS: readonly TexturedSlot[] = [
  'hull',
  'rusted-steel',
  'deck-plate',
  'build-plate',
  // The dunes. Sampled in world space by the terrain shader rather than bound
  // to a material slot, because a terrain chunk is 360m by 64m and its own UVs
  // would stretch a 1k tile into stripes.
  'sand',
];

export interface TextureSet {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  /**
   * Ambient occlusion, roughness and metalness packed into one image's red,
   * green and blue channels — the glTF convention, which Three reads natively
   * from a single texture bound to all three slots. One request and one upload
   * instead of three.
   */
  armMap: THREE.Texture;
}

export type TextureSets = Partial<Record<TexturedSlot, TextureSet>>;

/** Where the sets live, relative to the served root. */
const BASE = 'textures';

function configure(texture: THREE.Texture, isColor: boolean): THREE.Texture {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  // Colour needs decoding to linear for lighting maths; normal and packed
  // data maps are already linear and would be wrecked by the conversion.
  texture.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/**
 * Load every texture set, skipping any that fails.
 *
 * Never rejects. A partial result is a valid result: each slot falls back on
 * its own, so one bad file does not cost the other two their textures.
 */
export async function loadTextureSets(
  slots: readonly TexturedSlot[] = TEXTURED_SLOTS,
  deadlineMs = ASSET_DEADLINE_MS,
): Promise<TextureSets> {
  const loader = new THREE.TextureLoader();
  const boundedDeadline = Math.max(1, Number.isFinite(deadlineMs) ? deadlineMs : ASSET_DEADLINE_MS);
  const results = await Promise.all(
    [...new Set(slots)].map((slot) => loadSlot(loader, slot, boundedDeadline)),
  );

  const sets: TextureSets = {};
  for (const entry of results) {
    if (entry) sets[entry[0]] = entry[1];
  }
  return sets;
}

/** A material slot publishes all three maps or none of them. */
function loadSlot(
  loader: THREE.TextureLoader,
  slot: TexturedSlot,
  deadlineMs: number,
): Promise<[TexturedSlot, TextureSet] | null> {
  return new Promise((resolve) => {
    const owned: THREE.Texture[] = [];
    const disposed = new WeakSet<THREE.Texture>();
    const loaded = new Map<'map' | 'normalMap' | 'armMap', THREE.Texture>();
    let settled = false;

    const disposeOnce = (texture: THREE.Texture): void => {
      if (disposed.has(texture)) return;
      disposed.add(texture);
      texture.dispose();
    };
    const disposeOwned = (): void => {
      for (const texture of owned) disposeOnce(texture);
    };
    const fail = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      disposeOwned();
      resolve(null);
    };
    const complete = (
      key: 'map' | 'normalMap' | 'armMap',
      texture: THREE.Texture,
      isColor: boolean,
    ): void => {
      if (settled) {
        disposeOnce(texture);
        return;
      }
      loaded.set(key, configure(texture, isColor));
      if (loaded.size !== 3) return;
      settled = true;
      clearTimeout(timer);
      resolve([
        slot,
        {
          map: loaded.get('map')!,
          normalMap: loaded.get('normalMap')!,
          armMap: loaded.get('armMap')!,
        },
      ]);
    };
    const timer = setTimeout(fail, deadlineMs);
    const request = (key: 'map' | 'normalMap' | 'armMap', file: string, isColor: boolean): void => {
      let texture: THREE.Texture | undefined;
      try {
        texture = loader.load(
          `${BASE}/${slot}/${file}`,
          (value) => complete(key, value, isColor),
          undefined,
          fail,
        );
        owned.push(texture);
        // A controlled loader may fail synchronously before returning the
        // placeholder texture. The slot still owns and must release it.
        if (settled) disposeOnce(texture);
      } catch {
        if (texture) owned.push(texture);
        fail();
      }
    };
    request('map', 'diffuse.jpg', true);
    request('normalMap', 'normal.jpg', false);
    request('armMap', 'arm.jpg', false);
  });
}

/** Free every GPU texture in a set collection. */
export function disposeTextureSets(sets: TextureSets): void {
  for (const set of Object.values(sets)) {
    set.map.dispose();
    set.normalMap.dispose();
    set.armMap.dispose();
  }
}
