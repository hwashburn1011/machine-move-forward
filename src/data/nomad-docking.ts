import profile from './iron-nomad.json';

/** Put the gangway's near edge at the Nomad gate, outside the expanded hull. */
export function nomadDockRoot(gangwayLocalX: number, gangwayHalfWidth = 0.5): number {
  return profile.walkable.upper.halfWidth - gangwayLocalX + gangwayHalfWidth;
}

export const OPTIONAL_DOCK_ROOT_X = nomadDockRoot(-6.5);
