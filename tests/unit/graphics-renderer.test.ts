import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { prepareAuthoredModel } from '@/art/DefenseModels';
import type { LoadedModel } from '@/art/ModelLoader';
import { getQualitySettings } from '@/core/renderer/QualitySettings';
import { applyHeightFog } from '@/art/Fog';
import { Sky } from '@/art/Sky';

describe('graphics renderer contracts', () => {
  it('blends fog before tone mapping in the direct and composer shader paths', () => {
    const material = new THREE.MeshStandardMaterial();
    applyHeightFog(material);
    const shader = {
      uniforms: {},
      vertexShader: '#include <common>\n#include <project_vertex>',
      fragmentShader: '#include <common>\n#include <opaque_fragment>\n#include <tonemapping_fragment>\n#include <colorspace_fragment>',
    };
    material.onBeforeCompile(shader as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
    expect(shader.fragmentShader.indexOf('float fogFactor')).toBeLessThan(shader.fragmentShader.indexOf('#include <tonemapping_fragment>'));
    material.dispose();
  });

  it('starts the time-of-day curve at the actual initial sun direction', () => {
    let actual = new THREE.Vector3();
    Sky.prototype.setTimeOfDay.call({ setSunDirection: (dir: THREE.Vector3) => { actual = dir.normalize(); } } as Sky, 0.5);
    expect(actual.distanceTo(new THREE.Vector3(.78, .5, .37).normalize())).toBeLessThan(1e-8);
  });
  it('preserves authored material maps and scalar intent', () => {
    const scene = new THREE.Group();
    const authoredMap = new THREE.Texture();
    const authoredNormal = new THREE.Texture();
    const material = new THREE.MeshStandardMaterial({
      name: 'Paint',
      map: authoredMap,
      normalMap: authoredNormal,
      normalScale: new THREE.Vector2(0.73, 0.61),
      roughness: 0.31,
      metalness: 0.67,
    });
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(), material));

    prepareAuthoredModel({ scene, clips: [] } satisfies LoadedModel);

    expect(material.map).toBe(authoredMap);
    expect(material.normalMap).toBe(authoredNormal);
    expect(material.normalScale.x).toBeCloseTo(0.73);
    expect(material.normalScale.y).toBeCloseTo(0.61);
    expect(material.roughness).toBeCloseTo(0.31);
    expect(material.metalness).toBeCloseTo(0.67);

    material.dispose();
    authoredMap.dispose();
    authoredNormal.dispose();
  });

  it('uses the fallback wear maps only for missing slots', () => {
    const scene = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ name: 'Steel' });
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(), material));

    prepareAuthoredModel({ scene, clips: [] } satisfies LoadedModel);

    expect(material.map).toBeTruthy();
    expect(material.normalMap).toBeTruthy();
    expect(material.normalScale.x).toBeCloseTo(0.22);
    expect(material.normalScale.y).toBeCloseTo(0.22);
    material.dispose();
  });

  it('keeps High at the native 1080p pixel ratio and leaves shimmer to Ultra', () => {
    const high = getQualitySettings('high');
    const ultra = getQualitySettings('ultra');
    expect(high.maxPixelRatio).toBe(1);
    expect(high.gtao).toBe(true);
    expect(high.heatShimmer).toBe(false);
    expect(ultra.heatShimmer).toBe(true);
  });
});
