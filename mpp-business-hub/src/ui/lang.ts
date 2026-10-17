// One place for the words the app uses. If a label appears in more than one screen, it comes from here.
// Rules: short verbs (Open, Review, Edit, Send, Pause, Resume, Confirm). Say what happens. No internal terms.

export const WORDS = {
  // the three kinds of "truth" — always these names
  detected: 'Detected in logs',
  employeeConfirmed: 'Employee confirmed',
  checkedInSource: 'Checked in the source system',
  // review actions
  yesAccurate: 'Yes, accurate',
  somethingIncorrect: 'Something is incorrect',
  notMyWork: 'This wasn’t my work',
  selectItem: 'Select this item',
  selectMultiple: 'Select multiple items',
  confirmSelected: 'Confirm selected items are accurate',
  mixedSelection: 'These items need different answers. Review them one at a time.',
  // pause
  pauseProject: 'Pause project',
  resumeProject: 'Resume project',
  // empty / explain
  noMatchingActivity: 'No matching computer activity found',
  checkingToday: 'Checking today’s work',
  lastActivityProcessed: 'Last activity processed',
} as const;

export const GLOSSARY: { old: string; now: string; note: string }[] = [
  { old: 'Pick for group confirm', now: 'Select this item / Select multiple items', note: 'A checkbox that picks a card.' },
  { old: 'Group confirm', now: 'Confirm selected items are accurate', note: 'Confirms the observation only. It never marks work complete.' },
  { old: 'Reconciliation pending', now: 'Checking today’s work', note: 'Shown while the day’s activity is still being read.' },
  { old: 'Inference', now: 'What the system noticed', note: 'Plus “What it suggests”.' },
  { old: 'Evidence provenance', now: 'Where this information came from', note: '' },
  { old: 'Source coverage', now: 'How much activity was received', note: '' },
  { old: 'Correlation ID', now: 'Related action reference', note: 'Advanced view only.' },
  { old: 'Ingest', now: 'Import / Get latest activity', note: '' },
  { old: 'Watermark', now: 'Last activity processed', note: '' },
  { old: 'Hydrate resource', now: 'Load file details', note: '' },
  { old: 'Confidence 0.82', now: 'Likely match (and why)', note: 'No percentages at the default level.' },
  { old: 'Observed / reported / verified', now: 'Detected in logs / Employee confirmed / Checked in the source system', note: 'Always these three names.' },
  { old: 'Bulk approve', now: 'Confirm selected items are accurate', note: '' },
  { old: 'Resume trigger', now: 'When should this project resume?', note: '' },
  { old: 'Snooze project', now: 'Pause project', note: 'Snooze is only for notifications and recommendations.' },
  { old: 'Close opportunity', now: 'Dismiss suggestion', note: '' },
  { old: 'Provision folder', now: 'Create project folder', note: '' },
  { old: 'Unmatched event', now: 'Work that may not belong to a project', note: '' },
  { old: 'Review queue', now: 'Items to review', note: '' },
  { old: 'No activity', now: 'No matching computer activity found', note: 'Never means no work happened.' },
  { old: 'Action queue', now: 'Needs your decision', note: '' },
  { old: 'Opportunities / Ideas', now: 'AI Recommendations', note: '' },
];

export const STATUS_WORDS = {
  tracker: 'Status',
  paused: 'Paused',
};
