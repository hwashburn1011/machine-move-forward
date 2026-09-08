import type { ExpeditionId } from './story';

export type RouteId = 'foundry-direct' | 'foundry-detour';
export interface RouteDefinition {
  id: RouteId;
  destinationId: ExpeditionId;
  distanceM: number;
  scriptedVehicle: 'gunboat' | null;
  scriptedVehicleRemainingM: number | null;
}
export interface RouteCardData {
  id: RouteId;
  distanceM: number;
  estimatedFuel: number;
  hazard: string;
}

export const FOUNDRY_ROUTES: readonly RouteDefinition[] = [
  {
    id: 'foundry-direct',
    destinationId: 'relay-foundry',
    distanceM: 750,
    scriptedVehicle: 'gunboat',
    scriptedVehicleRemainingM: 500,
  },
  {
    id: 'foundry-detour',
    destinationId: 'relay-foundry',
    distanceM: 1150,
    scriptedVehicle: null,
    scriptedVehicleRemainingM: null,
  },
];
export function routeDefinition(id: string): RouteDefinition | undefined {
  return FOUNDRY_ROUTES.find((route) => route.id === id);
}
export function routeCards(
  currentDistance: number,
  burnPerMetre: number,
  speedMps: number,
): readonly RouteCardData[] {
  void currentDistance;
  const burn = Number.isFinite(burnPerMetre) && burnPerMetre >= 0 ? burnPerMetre : 0;
  const speed = Number.isFinite(speedMps) && speedMps > 0 ? speedMps : 0;
  void speed;
  return FOUNDRY_ROUTES.map((route) => ({
    id: route.id,
    distanceM: route.distanceM,
    estimatedFuel: Math.ceil(route.distanceM * burn),
    hazard: route.scriptedVehicle
      ? `One scripted ${route.scriptedVehicle} at ${route.scriptedVehicleRemainingM} m remaining`
      : 'No scripted gunboat; ordinary threats may still occur',
  }));
}
export function validateRoutes(routes: readonly RouteDefinition[] = FOUNDRY_ROUTES): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const route of routes) {
    if (ids.has(route.id)) errors.push(`duplicate route ${route.id}`);
    ids.add(route.id);
    if (route.destinationId !== 'relay-foundry')
      errors.push(`unknown destination ${route.destinationId}`);
    if (!(Number.isFinite(route.distanceM) && route.distanceM > 0))
      errors.push(`invalid distance ${route.id}`);
    if (
      route.scriptedVehicle === 'gunboat' &&
      !(
        route.scriptedVehicleRemainingM !== null &&
        Number.isFinite(route.scriptedVehicleRemainingM) &&
        route.scriptedVehicleRemainingM > 220 &&
        route.scriptedVehicleRemainingM < route.distanceM
      )
    )
      errors.push(`gunboat threshold invalid ${route.id}`);
    if (route.scriptedVehicle === null && route.scriptedVehicleRemainingM !== null)
      errors.push(`unexpected threshold ${route.id}`);
  }
  return errors;
}
