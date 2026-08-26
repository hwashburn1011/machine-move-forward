import { SUBSYSTEMS, type SubsystemId } from '@/data/subsystems';

/**
 * One line naming what is wrong, or nothing at all.
 *
 * Names the part rather than averaging the machine, because handoff section 15
 * opens by forbidding a global HP bar and a row reading "83%" would be one
 * with extra steps. Full per-subsystem detail lives behind a held key; this
 * row's job is to stay quiet across 650m of scheduled peace and to be
 * unmissable the moment it is not.
 */
export function conditionLabel(damaged: readonly { id: SubsystemId; fraction: number }[]): string {
  if (damaged.length === 0) return 'Sound';

  const worst = damaged[0] as { id: SubsystemId; fraction: number };
  if (worst.id === 'engine' && worst.fraction <= 0) return 'ENGINE OUT';

  // Floor, not round: 99.6% is not whole, and reporting it as 100% would tell
  // the player the opposite of what the row exists to say.
  const pct = Math.floor(worst.fraction * 100);
  const rest = damaged.length - 1;
  const name = SUBSYSTEMS[worst.id].name;
  return rest > 0 ? `${name} ${pct}% +${rest}` : `${name} ${pct}%`;
}
