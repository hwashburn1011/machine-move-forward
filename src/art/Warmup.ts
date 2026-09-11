import * as THREE from 'three';

/** Compile later encounters and upload their shared textures during the boot screen. */
export async function warmAuthoredGraphics(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  assets: readonly THREE.Object3D[],
  previewCamera?: THREE.Camera,
): Promise<void> {
  const textures = new Set<THREE.Texture>();
  for (const root of [scene, ...assets])
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        const standard = material as THREE.MeshStandardMaterial;
        for (const texture of [
          standard.map,
          standard.normalMap,
          standard.roughnessMap,
          standard.metalnessMap,
          standard.emissiveMap,
          standard.aoMap,
        ]) {
          if (!texture || textures.has(texture)) continue;
          textures.add(texture);
          texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
          renderer.initTexture(texture);
        }
      }
    });
  // Match the composer's scene-linear target when generating shader variants.
  const target = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    colorSpace: THREE.LinearSRGBColorSpace,
  });
  const previous = renderer.getRenderTarget();
  renderer.setRenderTarget(target);
  try {
    await renderer.compileAsync(scene, camera);
    for (const asset of assets) await renderer.compileAsync(asset, camera, scene);
    // compileAsync does not exercise shadow/depth programs or upload posed
    // skinning buffers. Draw the staged encounter offscreen while loading.
    if (previewCamera) renderer.render(scene, previewCamera);
  } finally {
    renderer.setRenderTarget(previous);
    target.dispose();
  }
}
