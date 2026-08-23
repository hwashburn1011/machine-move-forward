import * as THREE from 'three';

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
export type TexturedSlot = 'hull' | 'rusted-steel' | 'deck-plate' | 'build-plate';

export const TEXTURED_SLOTS: readonly TexturedSlot[] = [
  'hull',
  'rusted-steel',
  'deck-plate',
  'build-plate',
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
): Promise<TextureSets> {
  const loader = new THREE.TextureLoader();

  const load = (url: string, isColor: boolean): Promise<THREE.Texture> =>
    new Promise((resolve, reject) => {
      loader.load(url, (texture) => resolve(configure(texture, isColor)), undefined, reject);
    });

  const results = await Promise.all(
    slots.map(async (slot): Promise<[TexturedSlot, TextureSet] | null> => {
      try {
        const [map, normalMap, armMap] = await Promise.all([
          load(`${BASE}/${slot}/diffuse.jpg`, true),
          load(`${BASE}/${slot}/normal.jpg`, false),
          load(`${BASE}/${slot}/arm.jpg`, false),
        ]);
        return [slot, { map, normalMap, armMap }];
      } catch {
        // Deliberately swallowed: a missing texture is a cosmetic loss, and
        // the caller has a working procedural path for exactly this case.
        return null;
      }
    }),
  );

  const sets: TextureSets = {};
  for (const entry of results) {
    if (entry) sets[entry[0]] = entry[1];
  }
  return sets;
}

/** Free every GPU texture in a set collection. */
export function disposeTextureSets(sets: TextureSets): void {
  for (const set of Object.values(sets)) {
    set.map.dispose();
    set.normalMap.dispose();
    set.armMap.dispose();
  }
}
