import { describe, expect, it } from 'vitest';
import {
  campaignProfileLabel,
  profileUsesInfiniteAmmo,
  sanitizeCampaignProfile,
} from '@/game/CampaignProfile';

describe('campaign profile', () => {
  it('sanitizes unknown saves to story and keeps profile labels pure', () => {
    expect(sanitizeCampaignProfile('survival')).toBe('story');
    expect(sanitizeCampaignProfile('future')).toBe('story');
    expect(sanitizeCampaignProfile(null)).toBe('story');
    expect(profileUsesInfiniteAmmo('story')).toBe(true);
    expect(profileUsesInfiniteAmmo(sanitizeCampaignProfile('survival'))).toBe(true);
    expect(campaignProfileLabel(sanitizeCampaignProfile('survival'))).toBe('Story');
  });
});
