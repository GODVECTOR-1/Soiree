'use client'

import { useParams } from 'next/navigation'
import { PlanLoader } from '@/components/plan-loader'

/** View link: the same plan, always read-only. Never reads a token. */
export default function SharedPlanPage() {
  const { slug } = useParams<{ slug: string }>()
  return <PlanLoader slug={slug} mode="view" />
}
