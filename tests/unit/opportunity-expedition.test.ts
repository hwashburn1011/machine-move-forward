import { describe, expect, it } from 'vitest';
import {
  DESERT_OPPORTUNITIES,
  desertDestinationDefinition,
  desertOpportunityForContact,
} from '@/data/opportunities';
import { expeditionDefinition, projectExpedition } from '@/navigation/OpportunityExpedition';
import { RouteChart, type RouteContact } from '@/navigation/RouteChart';

const contact = (state: RouteContact['state'] = 'docked'): RouteContact => ({
  id: 'route-contact-1',
  slot: 1,
  kind: 'water-cache',
  atDistanceM: 700,
  worldX: 50,
  confidence: 1,
  hazard: 'calm',
  detectedAtM: 250,
  expiresAtM: 880,
  state,
  rewards: [{ type: 'item', itemId: 'water', remaining: 4 }],
});

describe('desert opportunity operations', () => {
  it('publishes three compact layouts with distinct task anchors and usable Destination definitions', () => {
    const ids = Object.keys(DESERT_OPPORTUNITIES) as (keyof typeof DESERT_OPPORTUNITIES)[];
    expect(ids).toHaveLength(3);
    const anchors = new Set<string>();
    for (const id of ids) {
      const entry = DESERT_OPPORTUNITIES[id];
      expect(entry.colliders.find((box) => box.id === 'floor')?.half).toEqual({
        x: 6,
        y: 0.12,
        z: 5,
      });
      expect(entry.interactions.service.id).not.toBe(entry.interactions.retrieval.id);
      anchors.add(entry.interactions.service.id);
      anchors.add(entry.interactions.retrieval.id);
      const destination = desertDestinationDefinition(id);
      expect(destination.colliders.length).toBeGreaterThan(6);
      expect(destination.interactables.map((item) => item.id)).toContain(
        entry.interactions.service.id,
      );
      expect(destination.interactables.at(-1)?.kind).toBe('departure');
    }
    expect(anchors.size).toBe(6);
    expect(desertOpportunityForContact('water-cache')?.id).toBe('collapsed-service-depot');
    expect(desertOpportunityForContact('salvage-wreck')?.id).toBe('wrecked-convoy');
    expect(desertOpportunityForContact('memorial')?.id).toBe('damaged-relay');
    expect(expeditionDefinition('repair-depot')).toBeNull();
  });

  it('projects legacy contacts without mutating or inventing reward state', () => {
    const before = contact();
    const view = projectExpedition(before)!;
    expect(view.step).toBe('task-ready');
    expect(view.definition.variant).toBe('collapsed-service-depot');
    expect(before.expedition).toBeUndefined();
    expect(before.rewards[0]?.remaining).toBe(4);
  });

  it('completes the optional task once and preserves it through RouteChart save/restore', () => {
    const chart = new RouteChart();
    chart.restore({
      format: 1,
      nextSlot: 2,
      discovered: ['route-contact-1'],
      visited: [],
      missed: [],
      active: contact(),
    });
    expect(chart.completeExpeditionTask('route-contact-1', 'deep').ok).toBe(true);
    expect(chart.completeExpeditionTask('route-contact-1', 'deep').ok).toBe(false);
    expect(projectExpedition(chart.contact!)?.step).toBe('task-complete');
    const saved = chart.toSave();
    const restored = new RouteChart();
    restored.restore(saved);
    expect(projectExpedition(restored.contact!)?.step).toBe('task-complete');
    expect(restored.requestReward('route-contact-1')?.count).toBe(4);
    expect(
      restored.resolveReward(restored.requestReward('route-contact-1')!.token, 2)?.acceptedCount,
    ).toBe(2);
    expect(restored.requestReward('route-contact-1')?.count).toBe(2);
  });

  it('gates the physical retrieval behind service while leaving legacy contacts compatible', () => {
    const chart = new RouteChart();
    chart.restore({
      format: 1,
      nextSlot: 2,
      discovered: ['route-contact-1'],
      visited: [],
      missed: [],
      active: contact(),
    });
    expect(chart.ensureExpeditionTask('route-contact-1')).toBe(true);
    expect(chart.completeExpeditionTask('route-contact-1', 'retrieval').ok).toBe(false);
    expect(chart.completeExpeditionTask('route-contact-1', 'service').ok).toBe(true);
    expect(chart.completeExpeditionTask('route-contact-1', 'retrieval').ok).toBe(true);
    expect(projectExpedition(chart.contact!)?.step).toBe('task-complete');
  });

  it('rejects task completion unless the contact is docked and ignores malformed saved task state', () => {
    const chart = new RouteChart();
    chart.restore({
      format: 1,
      nextSlot: 2,
      discovered: ['route-contact-1'],
      visited: [],
      missed: [],
      active: contact('detected'),
    });
    expect(chart.completeExpeditionTask('route-contact-1').ok).toBe(false);
    chart.restore({
      format: 1,
      nextSlot: 2,
      discovered: ['route-contact-1'],
      visited: [],
      missed: [],
      active: { ...contact(), expedition: { format: 9, step: 'task-complete' } as never },
    });
    expect(chart.contact).toBeNull();
  });
});
