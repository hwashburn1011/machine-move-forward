import type { ExpeditionId } from './story';

export type RouteId =
  | 'foundry-direct'
  | 'foundry-detour'
  | 'orchard-caretaker'
  | 'orchard-cold-vault'
  | 'meridian-quiet-line'
  | 'meridian-cordon-gap';
export interface RouteDefinition {
  id: RouteId;
  destinationId: ExpeditionId;
  distanceM: number;
  scriptedVehicle: 'gunboat' | 'skiff' | null;
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
export const ORCHARD_ROUTES: readonly RouteDefinition[] = [
  {
    id: 'orchard-caretaker',
    destinationId: 'glass-orchard',
    distanceM: 900,
    scriptedVehicle: 'skiff',
    scriptedVehicleRemainingM: 420,
  },
  {
    id: 'orchard-cold-vault',
    destinationId: 'glass-orchard',
    distanceM: 1100,
    scriptedVehicle: 'gunboat',
    scriptedVehicleRemainingM: 500,
  },
];
export const MERIDIAN_ROUTES: readonly RouteDefinition[] = [
  {
    id: 'meridian-quiet-line',
    destinationId: 'last-garden-meridian',
    distanceM: 1250,
    scriptedVehicle: 'skiff',
    scriptedVehicleRemainingM: 520,
  },
  {
    id: 'meridian-cordon-gap',
    destinationId: 'last-garden-meridian',
    distanceM: 1050,
    scriptedVehicle: 'gunboat',
    scriptedVehicleRemainingM: 620,
  },
];
const ALL_ROUTES: readonly RouteDefinition[] = [
  ...FOUNDRY_ROUTES,
  ...ORCHARD_ROUTES,
  ...MERIDIAN_ROUTES,
];
export function routeDefinition(id: string): RouteDefinition | undefined {
  return ALL_ROUTES.find((route) => route.id === id);
}
export function routeDefinitionsFor(destinationId: ExpeditionId): readonly RouteDefinition[] {
  return ALL_ROUTES.filter((route) => route.destinationId === destinationId);
}
export function routeCards(
  currentDistance: number,
  burnPerMetre: number,
  speedMps: number,
  destinationId: ExpeditionId = 'relay-foundry',
): readonly RouteCardData[] {
  void currentDistance;
  const burn = Number.isFinite(burnPerMetre) && burnPerMetre >= 0 ? burnPerMetre : 0;
  const speed = Number.isFinite(speedMps) && speedMps > 0 ? speedMps : 0;
  void speed;
  return routeDefinitionsFor(destinationId).map((route) => ({
    id: route.id,
    distanceM: route.distanceM,
    estimatedFuel: Math.ceil(route.distanceM * burn),
    hazard: route.scriptedVehicle
      ? `One scripted ${route.scriptedVehicle} at ${route.scriptedVehicleRemainingM} m remaining`
      : 'No scripted gunboat; ordinary threats may still occur',
  }));
}
export function validateRoutes(routes: readonly RouteDefinition[] = ALL_ROUTES): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const route of routes) {
    if (ids.has(route.id)) errors.push(`duplicate route ${route.id}`);
    ids.add(route.id);
    if (!['relay-foundry', 'glass-orchard', 'last-garden-meridian'].includes(route.destinationId))
      errors.push(`unknown destination ${route.destinationId}`);
    if (!(Number.isFinite(route.distanceM) && route.distanceM > 0))
      errors.push(`invalid distance ${route.id}`);
    const expectedDestination = route.id.startsWith('foundry-')
      ? 'relay-foundry'
      : route.id.startsWith('orchard-')
        ? 'glass-orchard'
        : route.id.startsWith('meridian-')
          ? 'last-garden-meridian'
          : null;
    if (expectedDestination && route.destinationId !== expectedDestination)
      errors.push(`destination mismatch ${route.id}`);
    if (
      (route.scriptedVehicle === 'gunboat' || route.scriptedVehicle === 'skiff') &&
      !(
        route.scriptedVehicleRemainingM !== null &&
        Number.isFinite(route.scriptedVehicleRemainingM) &&
        route.scriptedVehicleRemainingM > 220 &&
        route.scriptedVehicleRemainingM < route.distanceM
      )
    )
      errors.push(`${route.scriptedVehicle} threshold invalid ${route.id}`);
    if (route.scriptedVehicle === null && route.scriptedVehicleRemainingM !== null)
      errors.push(`unexpected threshold ${route.id}`);
  }
  return errors;
}
