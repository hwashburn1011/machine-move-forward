/** One supported campaign. The legacy Survival tag is normalized on load. */
export type CampaignProfile = 'story';
export const profileUsesInfiniteAmmo = (_profile: CampaignProfile): boolean => true;
export const campaignProfileLabel = (_profile: CampaignProfile): string => 'Story';
export function sanitizeCampaignProfile(_value: unknown): CampaignProfile {
  return 'story';
}
