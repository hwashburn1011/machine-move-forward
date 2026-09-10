/** Seeded random replacements in ordinary infantry waves. Scripted fights keep their roster. */
export function mechWave(
  base: readonly string[],
  wavesSurvived: number,
  healthFraction: number,
  random: () => number,
): string[] {
  // Two introductory fights remain unchanged. No elites while recovering at low health.
  if (wavesSurvived < 2) return [...base];
  let elite = false;
  const result = base.map((id, index) => {
    // Keep an engine raider in larger waves so machinery still needs defending.
    if (index === 0 && base.length >= 3) return id;
    const draw = random();
    if (draw < 0.25) return id;
    const candidates = ['warden', 'revenant'];
    if (!elite && wavesSurvived >= 4 && healthFraction >= 0.35) candidates.push('bastion');
    if (!elite && wavesSurvived >= 6 && healthFraction >= 0.35) candidates.push('sovereign');
    const chosen =
      candidates[
        Math.min(candidates.length - 1, Math.floor(((draw - 0.25) / 0.75) * candidates.length))
      ]!;
    if (chosen === 'bastion' || chosen === 'sovereign') elite = true;
    return chosen;
  });
  return result;
}
