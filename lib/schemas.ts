import { z } from 'zod'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

/** What the user tells us in the wizard. Shared by client and server. */
export const PlanInput = z.object({
  eventType: z.enum(['wedding', 'birthday', 'community']),
  title: z.string().trim().min(1).max(80),
  city: z.string().trim().min(1).max(40),
  date: isoDate,
  planningStart: isoDate,
  guestCount: z.number().int().min(1).max(5000),
  cityTier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  currency: z.enum(['INR', 'USD', 'EUR', 'GBP']),
  totalBudget: z.number().int().positive().max(1_000_000_000),
  priorities: z.array(z.string().min(1).max(40)).min(1).max(3),
  vibes: z.array(z.string().max(30)).max(4).default([]),
  diet: z.array(z.string().max(30)).max(4).default([]),
  accessibility: z.boolean().default(false),
  notes: z.string().max(600).optional(),
})
export type PlanInput = z.infer<typeof PlanInput>
export type EventType = PlanInput['eventType']
export type Currency = PlanInput['currency']

export const BudgetLine = z.object({
  id: z.string(),
  category: z.string(),
  amount: z.number().int().nonnegative(),
  sharePct: z.number().min(0).max(100),
  isPriority: z.boolean(),
  rationale: z.string().max(200),
  tradeoffNote: z.string().max(120).optional(),
  locked: z.boolean().optional(),
})
export type BudgetLine = z.infer<typeof BudgetLine>

export const Task = z.object({
  id: z.string(),
  title: z.string().max(140),
  dueLabel: z.string(),
  done: z.boolean(),
  tags: z.array(z.string()).optional(),
  /** Days before the event this task is due; absent for urgent tasks that always sit in "This week". */
  offsetDays: z.number().int().optional(),
})
export type Task = z.infer<typeof Task>

export const Phase = z.object({ id: z.string(), label: z.string(), tasks: z.array(Task) })
export type Phase = z.infer<typeof Phase>

export const VendorStatus = z.enum(['not_started', 'shortlisting', 'quote_received', 'booked'])
export type VendorStatus = z.infer<typeof VendorStatus>

export const VendorItem = z.object({
  id: z.string(),
  category: z.string(),
  status: VendorStatus,
  estLow: z.number().int().nonnegative(),
  estHigh: z.number().int().nonnegative(),
  questionsToAsk: z.array(z.string().max(160)),
  notes: z.string().max(500).optional(),
  verifyBeforeDeposit: z.boolean(),
  /** The user's own records: who they are talking to, how to reach them, and what they quoted. */
  name: z.string().trim().max(80).optional(),
  contact: z.string().trim().max(120).optional(),
  quote: z.number().int().nonnegative().max(1_000_000_000).optional(),
  /** Added by the user rather than generated from a budget line; only these can be removed. */
  custom: z.boolean().optional(),
})
export type VendorItem = z.infer<typeof VendorItem>

export const Idea = z.object({
  id: z.string(),
  kind: z.enum(['theme', 'menu', 'activity', 'decor', 'music', 'favor']),
  title: z.string().max(80),
  blurb: z.string().max(240),
  fitsPriority: z.string().optional(),
  saved: z.boolean(),
})
export type Idea = z.infer<typeof Idea>

export const PlanVersion = z.object({
  version: z.number().int().positive(),
  createdAt: z.string(),
  scenario: z.string().optional(),
  budgetTotal: z.number().int().nonnegative(),
  lines: z.array(BudgetLine),
  phases: z.array(Phase),
  vendors: z.array(VendorItem),
  ideas: z.array(Idea),
  narrative: z.string().optional(),
})
export type PlanVersion = z.infer<typeof PlanVersion>

/** Plan input fields a scenario may change. Picked (not `.partial()`) so defaults never leak into a patch. */
export const InputPatch = PlanInput.pick({ totalBudget: true, guestCount: true, date: true, priorities: true }).partial()
export type InputPatch = z.infer<typeof InputPatch>

export const HistoryItem = z.object({ version: z.number().int(), createdAt: z.string(), scenario: z.string().optional() })
export type HistoryItem = z.infer<typeof HistoryItem>

/** A plan as the API returns it: the current applied version only, never a draft. */
export const Plan = z.object({
  slug: z.string(),
  input: PlanInput,
  current: PlanVersion,
  history: z.array(HistoryItem),
  readOnly: z.boolean(),
})
export type Plan = z.infer<typeof Plan>

export const DiffRow = z.object({
  category: z.string(), before: z.number(), after: z.number(), deltaPct: z.number(), protected: z.boolean(),
})
export type DiffRow = z.infer<typeof DiffRow>

export const PlanDiff = z.object({
  fromVersion: z.number().int(),
  toVersion: z.number().int(),
  budgetFrom: z.number(),
  budgetTo: z.number(),
  rows: z.array(DiffRow),
  impactedTasks: z.array(z.string()),
  totalCheck: z.object({ allocated: z.number(), target: z.number(), ok: z.boolean() }),
})
export type PlanDiff = z.infer<typeof PlanDiff>

/** budget_change: percent -50..100; guest_change: new guest count 1..5000; date_change: days -365..365. */
export const ScenarioInput = z.object({
  kind: z.enum(['budget_change', 'guest_change', 'venue_cancelled', 'date_change', 'reprioritize', 'custom']),
  value: z.number().optional(),
  priorities: z.array(z.string()).max(3).optional(),
  text: z.string().max(300).optional(),
})
export type ScenarioInput = z.infer<typeof ScenarioInput>

export const WhatIfResult = z.object({ draft: PlanVersion, diff: PlanDiff, inputPatch: InputPatch })
export type WhatIfResult = z.infer<typeof WhatIfResult>

export const AskRequest = z.object({
  question: z.string().trim().min(1).max(300),
  history: z.array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(900) })).max(6),
})
export type AskRequest = z.infer<typeof AskRequest>

export const AskResponse = z.object({
  answer: z.string().max(900),
  references: z.array(z.object({ kind: z.enum(['budget', 'task', 'vendor', 'idea']), id: z.string(), label: z.string() })),
})
export type AskResponse = z.infer<typeof AskResponse>

export const ApiErrorBody = z.object({
  error: z.object({ code: z.string(), message: z.string(), retryAfterSec: z.number().optional() }),
})
export type ApiErrorBody = z.infer<typeof ApiErrorBody>

// Request and response bodies for the remaining endpoints.
export const CreatePlanResponse = z.object({ slug: z.string(), editToken: z.string() })
export const ApplyRequest = z.object({ version: z.number().int().positive() })
export const TaskPatch = z.object({ done: z.boolean() })
export const VendorPatch = z.strictObject({
  status: VendorStatus.optional(),
  notes: z.string().max(500).optional(),
  name: z.string().trim().max(80).optional(),
  contact: z.string().trim().max(120).optional(),
  /** `null` clears a recorded quote. */
  quote: z.number().int().nonnegative().max(1_000_000_000).nullable().optional(),
})
export type VendorPatch = z.infer<typeof VendorPatch>
export const NewVendor = z.strictObject({
  category: z.string().trim().min(1).max(40),
  name: z.string().trim().max(80).optional(),
})
export type NewVendor = z.infer<typeof NewVendor>
export const IdeaPatch = z.object({ saved: z.boolean() })
export const RegenerateRequest = z.object({ feedback: z.string().trim().max(300).optional() })
export const BudgetPatch = z.object({ amounts: z.record(z.string(), z.number().int().nonnegative().max(1_000_000_000)) })

export const samples: Record<EventType, PlanInput> = {
  wedding: {
    eventType: 'wedding', title: "Priya and Arjun's celebration", city: 'Bengaluru',
    date: '2027-02-14', planningStart: '2026-10-31', guestCount: 120, cityTier: 1, currency: 'INR',
    totalBudget: 300000, priorities: ['Catering', 'Photo and video'], vibes: ['Garden', 'Golden hour'],
    diet: [], accessibility: false, notes: 'A warm garden supper.',
  },
  birthday: {
    eventType: 'birthday', title: "Meera's 30th birthday", city: 'Mumbai',
    date: '2026-12-08', planningStart: '2026-10-31', guestCount: 40, cityTier: 2, currency: 'INR',
    totalBudget: 80000, priorities: ['Food and cake', 'Entertainment'], vibes: ['Rooftop evening', 'Playful'],
    diet: [], accessibility: false, notes: 'A lively dinner with friends.',
  },
  community: {
    eventType: 'community', title: "Lakeview residents' winter fair", city: 'Pune',
    date: '2027-01-23', planningStart: '2026-10-31', guestCount: 250, cityTier: 2, currency: 'INR',
    totalBudget: 180000, priorities: ['Promotion and reach', 'Food'], vibes: ['Family friendly', 'Outdoor'],
    diet: ['Vegetarian'], accessibility: true, notes: 'A welcoming neighborhood gathering.',
  },
}
