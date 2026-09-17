import type { StoryUniqueId } from './story';

/** Inspectable descriptions of earned objects, shared with the existing shelf UI. */
export const KEEPSAKE_DETAILS: Record<StoryUniqueId, { title: string; text: string }> = {
  'course-gyro': {
    title: 'Course Gyro',
    text: 'Recovered at Wreck One. The cartridge is installed in the Navigation Helm. It makes plotted expedition routes possible; powered free steering requires the Quiet Array actuator.',
  },
  'salvage-controller': {
    title: 'Salvage Controller',
    text: 'Recovered at the Relay Foundry. Its preserved control patterns unlock the automatic salvage collector, helping the Nomad gather supplies while S-07 tends the ship.',
  },
  'tracking-servo': {
    title: 'Tracking Servo',
    text: 'Recovered at the Relay Foundry. The servo unlocks the tracking turret: another way to protect the home and records carried aboard the Nomad.',
  },
  'course-actuator': {
    title: 'Course Actuator',
    text: 'Recovered at Quiet Array. The exposed servo at the Helm marks the first powered steering authority: 12 degrees to either side, with adjustable throttle. The Nomad can begin choosing its own path.',
  },
  'annika-archive-shard': {
    title: 'ANNIKA Archive Shard',
    text: 'Recovered at Quiet Array. A fragment of the archive ANNIKA kept for humans. Its protected memory core is displayed here; only records S-07 actually reads enter the Campaign Record.',
  },
  'human-seed-bank': {
    title: 'Human Seed Bank',
    text: 'Recovered at Glass Orchard. These sealed samples represent the viable seeds entrusted to S-07. The bank unlocks the Seed Garden, which needs water to grow food aboard the Nomad.',
  },
  'vector-governor': {
    title: 'Vector Governor',
    text: 'Recovered at Glass Orchard. The illuminated calibration unit at the Helm expands powered steering to 28 degrees either side, putting more distant discoveries within reach.',
  },
  'orchard-memory-core': {
    title: 'Orchard Memory Core',
    text: 'Recovered at Glass Orchard. ANNIKA preserved ordinary lives alongside the seeds: names, shared work, and small moments. This core carries that evidence without claiming to know who survived.',
  },
  'meridian-solution': {
    title: 'Meridian Solution',
    text: 'Recovered at Last Garden at Meridian. The encoded bearing cartridge completes the Helm, enabling 45-degree course authority. The final journey remains a deliberate choice at the powered Helm.',
  },
};
