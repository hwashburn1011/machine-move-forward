import { DECK_HEIGHT } from '@/game/constants';
import type { LegDefinition } from './gait';

/**
 * The parts of the machine that can be broken (handoff section 15).
 *
 * Five, and no more, because each one has to earn a distinct failure the
 * player can feel. Data only, like every other file here.
 */
export type SubsystemId =
  | 'engine'
  | 'leg-front-left'
  | 'leg-front-right'
  | 'leg-rear-left'
  | 'leg-rear-right';

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
   * The leg hips sit at x = +/-6.0, y = 3.1: outboard of a deck 10m wide and
   * below its plane. There is nowhere to stand at one. Each leg is serviced
   * from an access panel on the nearest deck cell inboard of its hip, and the
   * engine — which stands on the deck — is the one case where the two nearly
   * coincide. That coincidence is exactly why a single field would have looked
   * correct until the first leg was damaged.
   */
  repairAt: Vec3;
  /** Scrap for a full repair from zero. Charged pro rata. */
  repairScrap: number;
}

/** Deck edge, inboard of the hips at x = +/-6. */
const PANEL_X = 4.2;

const leg = (id: SubsystemId, name: string, hip: Vec3): SubsystemDefinition => ({
  id,
  name,
  maxHealth: 180,
  armor: 3,
  hitbox: { half: { x: 0.7, y: 1.0, z: 0.7 }, center: hip },
  repairAt: { x: Math.sign(hip.x) * PANEL_X, y: DECK_HEIGHT, z: hip.z },
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
    // Matches the existing named `engine` part in MachineGeometry:
    // size [2.8, 1.8, 2.6] at z = DECK_L/2 - 2 = 6.
    hitbox: {
      half: { x: 1.4, y: 0.9, z: 1.3 },
      center: { x: 0, y: DECK_HEIGHT + 0.99, z: 6 },
    },
    // Just forward of its front face, so the player stands on open deck.
    repairAt: { x: 0, y: DECK_HEIGHT, z: 4.4 },
    repairScrap: 80,
  },
  'leg-front-left': leg('leg-front-left', 'Port Foreleg', { x: -6, y: 3.1, z: -4.5 }),
  'leg-front-right': leg('leg-front-right', 'Starboard Foreleg', { x: 6, y: 3.1, z: -4.5 }),
  'leg-rear-left': leg('leg-rear-left', 'Port Hindleg', { x: -6, y: 3.1, z: 4.5 }),
  'leg-rear-right': leg('leg-rear-right', 'Starboard Hindleg', { x: 6, y: 3.1, z: 4.5 }),
};

/** The subsystem that owns each leg of the gait. */
export const LEG_SUBSYSTEM: Record<LegDefinition['id'], SubsystemId> = {
  'front-left': 'leg-front-left',
  'front-right': 'leg-front-right',
  'rear-left': 'leg-rear-left',
  'rear-right': 'leg-rear-right',
};
