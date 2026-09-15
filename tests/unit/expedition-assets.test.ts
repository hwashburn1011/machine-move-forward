import { describe, expect, it } from 'vitest';
import { Game } from '@/game/Game';
import { CAMPAIGN_MODEL_IDS, CRITICAL_MODEL_IDS } from '@/art/DefenseModels';
import { STORY_EXPEDITIONS } from '@/data/story';

const expeditionAssetIds = (
  Game.prototype as unknown as { expeditionAssetIds(id: string): string[] }
).expeditionAssetIds;

const registered = new Set<string>([...CRITICAL_MODEL_IDS, ...CAMPAIGN_MODEL_IDS]);

describe('campaign expedition asset preparation', () => {
  it('maps Wreck One to its registered authored model', () => {
    expect(expeditionAssetIds.call({}, 'wreck-one')).toContain('expedition-wreck');
    expect(expeditionAssetIds.call({}, 'wreck-one')).not.toContain('relay-wreck');
  });

  it('requests only registered authored assets for every campaign chapter', () => {
    for (const chapter of STORY_EXPEDITIONS) {
      const ids = expeditionAssetIds.call({}, chapter.id);
      expect(ids, chapter.id).not.toHaveLength(0);
      for (const id of ids) expect(registered.has(id), `${chapter.id}: ${id}`).toBe(true);
    }
  });
});
