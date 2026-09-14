import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { EnemyTactics } from '@/enemies/EnemyTactics';

describe('enemy tactical controllers', () => {
  it('commits one Revenant lunge and strike then recovers', () => {
    const t = new EnemyTactics('revenant');
    t.update(0, { lungeDirection: new THREE.Vector3(1, 0, 0) });
    expect(t.snapshot().phase).toBe('telegraph');
    t.update(0.55);
    expect(t.snapshot().phase).toBe('lunge');
    const strike = t.update(0.38);
    expect(strike.strike).toBe(true);
    expect(t.update(0.1).strike).toBe(false);
    expect(t.snapshot().phase).toBe('recovery');
    t.update(0.75);
    expect(t.snapshot().phase).toBe('idle');
  });
  it('opens and closes Bastion vent on fixed time', () => {
    const t = new EnemyTactics('bastion');
    t.beginBastionVent();
    expect(t.snapshot().ventOpen).toBe(true);
    t.update(1.8);
    expect(t.snapshot().ventOpen).toBe(false);
  });
  it('destroys Sovereign drone without regeneration and exposes mission target', () => {
    const t = new EnemyTactics('sovereign');
    t.setMissionTarget(new THREE.Vector3(2, 3, 4), 'sabotage', 'engine');
    expect(t.damageDrone(35)).toBe(35);
    expect(t.snapshot().droneAlive).toBe(false);
    t.update(10);
    expect(t.snapshot().droneAlive).toBe(false);
    expect(t.snapshot().missionMode).toBe('sabotage');
    expect(t.snapshot().subsystemId).toBe('engine');
  });
});
