export type CampaignProfile = 'story' | 'survival';
export const profileUsesInfiniteAmmo = (profile: CampaignProfile): boolean => profile === 'story';
export const campaignProfileLabel = (profile: CampaignProfile): string =>
  profile === 'survival' ? 'Survival' : 'Story';
export function sanitizeCampaignProfile(value: unknown): CampaignProfile {
  return value === 'survival' ? 'survival' : 'story';
}
