import * as THREE from 'three';
import { isUpperBodyTrack, reloadClipForWeapon } from './WeaponPresentation';

type Transform = 'position' | 'quaternion' | 'scale';
interface Channel {
  bone: THREE.Object3D;
  property: Transform;
  sample: THREE.Interpolant;
  previous: number[];
  applied: boolean;
}
/** An upper-body override evaluated after locomotion, using the weapon clock. */
export class ReloadPresentation {
  private readonly clips = new Map<string, { duration: number; channels: Channel[] }>();
  private active: { duration: number; channels: Channel[] } | undefined;
  private progress = 0;
  private readonly rotation = new THREE.Quaternion();
  private readonly vector = new THREE.Vector3();
  constructor(root: THREE.Object3D, clips: readonly THREE.AnimationClip[]) {
    for (const clip of clips) {
      if (!['reload_rifle', 'reload_shotgun'].includes(clip.name)) continue;
      const channels: Channel[] = [];
      for (const track of clip.tracks) {
        if (!isUpperBodyTrack(track.name)) continue;
        const parsed = THREE.PropertyBinding.parseTrackName(track.name);
        const bone = root.getObjectByName(parsed.nodeName);
        const property = parsed.propertyName as Transform;
        if (!bone || !['position', 'quaternion', 'scale'].includes(property)) continue;
        channels.push({
          bone,
          property,
          sample: track.InterpolantFactoryMethodLinear(),
          previous: new Array(property === 'quaternion' ? 4 : 3).fill(0),
          applied: false,
        });
      }
      this.clips.set(clip.name, { duration: clip.duration, channels });
    }
  }
  setState(weaponId: string | null, reloading: boolean, progress: number): void {
    const name = reloadClipForWeapon(weaponId);
    this.active = reloading && name ? this.clips.get(name) : undefined;
    this.progress = THREE.MathUtils.clamp(progress, 0, 1);
  }
  resetApplied(): void {
    for (const clip of this.clips.values())
      for (const channel of clip.channels) {
        if (!channel.applied) continue;
        channel.bone[channel.property].fromArray(channel.previous);
        channel.applied = false;
      }
  }
  apply(): void {
    if (!this.active) return;
    const weight =
      THREE.MathUtils.smoothstep(this.progress, 0, 0.08) *
      (1 - THREE.MathUtils.smoothstep(this.progress, 0.92, 1));
    for (const channel of this.active.channels) {
      const transform = channel.bone[channel.property];
      transform.toArray(channel.previous);
      channel.applied = true;
      const value = channel.sample.evaluate(this.progress * this.active.duration);
      if (channel.property === 'quaternion')
        channel.bone.quaternion.slerp(this.rotation.fromArray(value), weight);
      else channel.bone[channel.property].lerp(this.vector.fromArray(value), weight);
    }
  }
}
