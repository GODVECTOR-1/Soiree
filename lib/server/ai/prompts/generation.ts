import 'server-only'
import { z } from 'zod'
import type { BudgetLine, Idea, PlanInput, Task, VendorItem } from '@/lib/schemas'
import { categories } from '@/lib/categories'
import { floorShare, sum, templateFor } from '@/lib/domain/templates'
import { request } from './system'

const personal = (input: PlanInput) => ({
  title: input.title,
  city: input.city,
  vibes: input.vibes,
  diet: input.diet,
  accessibility: input.accessibility,
  notes: input.notes ?? '',
})

// ---------- Allocation review ----------

type BaselineFact = {
  id: string
  category: string
  flex: string
  baselineSharePct: number
  floorPct: number
  isPriority: boolean
}

/** Guardrails: same lines, within 6 points of baseline, priorities never below baseline, floors held, sum 100. */
function reviewSchema(base: BaselineFact[]) {
  return z
    .object({
      lines: z.array(
        z.object({
          id: z.string(),
          sharePct: z.number(),
          rationale: z.string().max(160),
          tradeoffNote: z.string().max(100),
        }),
      ),
    })
    .superRefine((out, ctx) => {
      const issue = (message: string) => ctx.addIssue({ code: 'custom', message })
      const ids = out.lines.map((l) => l.id)
      if (ids.length !== base.length || base.some((b) => !ids.includes(b.id)))
        issue('Return exactly one entry per line id.')
      for (const b of base) {
        const l = out.lines.find((x) => x.id === b.id)
        if (!l) continue
        if (Math.abs(l.sharePct - b.baselineSharePct) > 6)
          issue(`${b.id} moved more than 6 points.`)
        if (b.isPriority && l.sharePct < b.baselineSharePct - 0.05)
          issue(`${b.id} is a priority and must not go below its baseline.`)
        if (l.sharePct < b.floorPct) issue(`${b.id} is below its floor.`)
      }
      if (Math.abs(sum(out.lines.map((l) => l.sharePct)) - 100) > 0.5)
        issue('Shares must add up to 100.')
    })
}

/** Ask the model to fine-tune the baseline split and explain each line. */
export function allocationReview(input: PlanInput, baseline: BudgetLine[]) {
  const lines: BaselineFact[] = baseline.map((l) => {
    const t = templateFor(input.eventType, l.category)
    return {
      id: l.id,
      category: l.category,
      flex: t?.flex ?? 'flexible',
      baselineSharePct: l.sharePct,
      floorPct: t ? floorShare(t) : 0,
      isPriority: l.isPriority,
    }
  })
  const facts = {
    eventType: input.eventType,
    guestCount: input.guestCount,
    cityTier: input.cityTier,
    priorities: input.priorities,
    lines,
  }
  return {
    facts,
    req: request({
      task: 'allocation_review',
      instructions:
        'Review this budget split in percent. Move any line by at most 6 points from its baseline. Priority lines must not go below their baseline. No line may go below its floor. Shares must add up to 100. For each line write a one-sentence rationale (max 160 characters) and a short trade-off note (max 100 characters) on what gives if money gets tight. Do not mention amounts or percentages in the text.',
      facts,
      data: personal(input),
      schema: reviewSchema(lines),
    }),
  }
}

// ---------- Timeline ----------

/** Rename at most 8 tasks (ids unchanged) and add at most 6 from the notes. */
export function timelinePersonalization(input: PlanInput, tasks: Task[]) {
  const ids = tasks.map((t) => t.id)
  const tags = categories[input.eventType]
  const schema = z.object({
    renames: z
      .array(z.object({ id: z.string(), title: z.string().min(3).max(140) }))
      .max(8)
      .refine((r) => r.every((x) => ids.includes(x.id)), 'Rename only existing task ids.'),
    additions: z
      .array(
        z.object({
          title: z.string().min(3).max(140),
          offsetDays: z.number().int().min(0).max(365),
          tag: z.enum(tags).optional(),
        }),
      )
      .max(6),
  })
  const facts = {
    eventType: input.eventType,
    tasks: tasks.map((t) => ({ id: t.id, title: t.title, offsetDays: t.offsetDays })),
  }
  return request({
    task: 'timeline',
    instructions:
      'Personalize this timeline using the user data. Rename at most 8 tasks so they fit this event, keeping each id and its meaning. Add at most 6 tasks that the notes clearly call for, each with offsetDays (days before the event, 0 to 365) and an optional budget tag. If nothing is needed, return empty lists.',
    facts,
    data: personal(input),
    schema,
  })
}

// ---------- Vendor questions ----------

/** Up to 3 tailored questions per vendor. */
export function vendorQuestionsPrompt(input: PlanInput, vendors: VendorItem[]) {
  const schema = z.object({
    vendors: z
      .array(
        z.object({ id: z.string(), questions: z.array(z.string().min(5).max(160)).min(1).max(3) }),
      )
      .max(vendors.length),
  })
  const facts = {
    eventType: input.eventType,
    guestCount: input.guestCount,
    priorities: input.priorities,
    vendors: vendors.map((v) => ({ id: v.id, category: v.category })),
  }
  return request({
    task: 'vendor_questions',
    instructions:
      'For each vendor, write up to 3 short questions the user should ask before booking, tailored to the user data (needs, diet, access, style). Questions only: no prices, no vendor names.',
    facts,
    data: personal(input),
    schema,
  })
}

// ---------- Ideas ----------

const KINDS = ['theme', 'menu', 'activity', 'decor', 'music', 'favor'] as const
const MIN_PER_KIND: Record<Idea['kind'], number> = {
  theme: 2,
  menu: 2,
  activity: 2,
  decor: 2,
  music: 1,
  favor: 1,
}

const ideasSchema = z.object({
  ideas: z
    .array(
      z.object({
        kind: z.enum(KINDS),
        title: z.string().min(3).max(80),
        blurb: z.string().min(10).max(240),
        fitsPriority: z.string().optional(),
      }),
    )
    .length(12)
    .superRefine((ideas, ctx) => {
      for (const k of KINDS)
        if (ideas.filter((i) => i.kind === k).length < MIN_PER_KIND[k])
          ctx.addIssue({
            code: 'custom',
            message: `Include at least ${MIN_PER_KIND[k]} ${k} ideas.`,
          })
    }),
})

/** 12 personal ideas: at least 2 each of theme, menu, activity, decor and 1 each of music and favor. */
export function ideasPrompt(input: PlanInput, feedback?: string, avoidTitles: string[] = []) {
  const facts = {
    eventType: input.eventType,
    guestCount: input.guestCount,
    priorities: input.priorities,
    minimumPerKind: MIN_PER_KIND,
    avoidTitles,
  }
  return request({
    task: 'ideas',
    instructions:
      'Suggest 12 personal ideas for this event that respect the vibes, diet, accessibility needs and notes. Include at least 2 each of theme, menu, activity and decor, and at least 1 each of music and favor. Set fitsPriority only to one of the listed priorities when the idea supports it; otherwise omit it. Never name real vendors, brands or venues. Do not repeat the titles to avoid. Titles max 80 characters, blurbs one or two sentences.',
    facts,
    data: { ...personal(input), feedback: feedback ?? '' },
    schema: ideasSchema,
  })
}
