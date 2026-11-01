import type { PlanInput } from './schemas'

/**
 * Budget category labels per event type.
 * Used by the wizard (priority picker) AND server templates.
 * These are the canonical labels — budget lines must match exactly.
 */
export const categories: Record<PlanInput['eventType'], readonly string[]> = {
  wedding: [
    'Catering',
    'Photo and video',
    'Venue and rentals',
    'Music and sound',
    'Decor and flowers',
  ],
  birthday: ['Food and cake', 'Entertainment', 'Venue', 'Decor', 'Return gifts'],
  community: [
    'Promotion and reach',
    'Food',
    'Sound and stage',
    'Volunteers',
    'Permits',
    'Contingency reserve',
  ],
} as const
