import { CURRENT_SAVE_VERSION, type SaveGameV1 } from '../SaveSchema';

export class SaveMigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaveMigrationError';
  }
}

/**
 * Bring any stored save up to the current schema.
 *
 * Only one version exists today, so this chain does nothing yet. It exists
 * anyway because adding it after saves are in the wild means writing the same
 * code with no way to test it against the format it has to read.
 */
export function migrate(raw: unknown): SaveGameV1 {
  if (typeof raw !== 'object' || raw === null) {
    throw new SaveMigrationError('Save data is not an object');
  }

  const record = raw as Record<string, unknown>;
  const version = record.version;

  if (typeof version !== 'number' || !Number.isInteger(version)) {
    throw new SaveMigrationError('Save data has no valid version field');
  }
  if (version < 1) {
    throw new SaveMigrationError(`Unknown save version ${version}`);
  }
  if (version > CURRENT_SAVE_VERSION) {
    throw new SaveMigrationError(
      `Save was written by a newer version of the game (save v${version}, ` +
        `this build reads up to v${CURRENT_SAVE_VERSION})`,
    );
  }

  // Never mutate the caller's object: it may be the live in-memory save.
  const save = structuredClone(record) as unknown as SaveGameV1;

  // Defaults for optional fields, so an older save missing a field still loads.
  save.progression ??= { unlocks: [] };
  save.progression.unlocks ??= [];
  save.machine ??= {
    structures: [],
    devices: [],
    fuel: 100,
    coreHealth: 100,
    navigationTier: 0,
  };
  save.world ??= { chunkIndex: 0, threatDirector: null };
  save.savedAt ??= 0;

  return save;
}
