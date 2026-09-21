import { DECK_HEIGHT, DECK_SURFACE_Y } from '@/game/constants';
import type { LegDefinition } from './gait';
import { NOMAD_LEG_GAME_ANCHORS, nomadLegGameHip } from './nomad-leg-contract';

/**
 * The parts of the machine that can be broken (handoff section 15).
 *
 * Five, and no more, because each one has to earn a distinct failure the
 * player can feel. Data only, like every other file here.
 */
export type SubsystemId =
  'engine' | 'leg-front-left' | 'leg-front-right' | 'leg-rear-left' | 'leg-rear-right';

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface SubsystemDefinition {
  id: SubsystemId;
  name: string;
  maxHealth: number;
  armor: number;
  /**
   * The box a shot or a swing has to land in, in machine space.
   */
  hitbox: { half: Vec3; center: Vec3 };
  /**
   * Where the player stands to repair it. DELIBERATELY NOT the hitbox.
   *
   * The v3 leg hips sit below the lowest floor at x = +/-8.9375, y = 7.997
   * and below its plane. There is nowhere to stand at one. Each leg is serviced
   * from an access panel on the nearest deck cell inboard of its hip, and the
   * engine — which stands on the deck — is the one case where the two nearly
   * coincide. That coincidence is exactly why a single field would have looked
   * correct until the first leg was damaged.
   */
  repairAt: Vec3;
  /** Scrap for a full repair from zero. Charged pro rata. */
  repairScrap: number;
}

const leg = (id: SubsystemId, name: string, hip: Vec3): SubsystemDefinition => ({
  id,
  name,
  maxHealth: 180,
  armor: 3,
  hitbox: { half: { x: 0.7, y: 1.0, z: 0.7 }, center: hip },
  repairAt: {
    x: Math.sign(hip.x) * NOMAD_LEG_GAME_ANCHORS.repairAbs.x,
    y: DECK_HEIGHT,
    z: hip.z,
  },
  repairScrap: 45,
});

export const SUBSYSTEMS: Record<SubsystemId, SubsystemDefinition> = {
  engine: {
    id: 'engine',
    name: 'Engine',
    // Tougher than a leg: it is the stop condition, and a machine that halts
    // to the first raider that reaches it would be miserable rather than tense.
    maxHealth: 320,
    armor: 4,
    // Matches the v3 runtime-owned `engine` box in IronNomadGeometry:
    // size [2.8, 1.8, 2.6], centred aft at z = 9.
    hitbox: {
      half: { x: 1.4, y: 0.9, z: 1.3 },
      center: { x: 0, y: DECK_SURFACE_Y + 0.9, z: 9 },
    },
    // Just forward of its front face, so the player stands on open deck.
    repairAt: { x: 0, y: DECK_HEIGHT, z: 7.4 },
    repairScrap: 80,
  },
  'leg-front-left': leg('leg-front-left', 'Port Foreleg', nomadLegGameHip(-1, -1)),
  'leg-front-right': leg('leg-front-right', 'Starboard Foreleg', nomadLegGameHip(1, -1)),
  'leg-rear-left': leg('leg-rear-left', 'Port Hindleg', nomadLegGameHip(-1, 1)),
  'leg-rear-right': leg('leg-rear-right', 'Starboard Hindleg', nomadLegGameHip(1, 1)),
};

/** The subsystem that owns each leg of the gait. */
export const LEG_SUBSYSTEM: Record<LegDefinition['id'], SubsystemId> = {
  'front-left': 'leg-front-left',
  'front-right': 'leg-front-right',
  'rear-left': 'leg-rear-left',
  'rear-right': 'leg-rear-right',
};
