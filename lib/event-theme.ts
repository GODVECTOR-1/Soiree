import type { EventType } from './schemas'

/** Display name for each event type. */
export const eventLabels: Record<EventType, string> = {
  wedding: 'Wedding',
  birthday: 'Birthday',
  community: 'Community gathering',
}

/**
 * Colours for the canvas effects, one set per event. `accent` matches the `--accent` token in globals.css, `light` is
 * its softer partner, `glow` is a saturated highlight, and `mood` tints the landing hero.
 */
export const eventColors: Record<
  EventType,
  { accent: string; light: string; glow: string; mood: string }
> = {
  wedding: { accent: '#b5446e', light: '#ff8fc7', glow: '#ff00b3', mood: '#ff00b3' },
  birthday: { accent: '#c4421f', light: '#ffa54d', glow: '#ef4c04', mood: '#ef4c04' },
  community: { accent: '#0b7f6b', light: '#5fd4b8', glow: '#14b8a0', mood: '#0b7f6b' },
}
