'use client'

import { useParams } from 'next/navigation'
import { PlanLoader } from '@/components/plan-loader'

/** Edit link: `/plan/{slug}#edit={token}`. Without a token the plan opens read-only. */
export default function PlanPage() {
  const { slug } = useParams<{ slug: string }>()
  return <PlanLoader slug={slug} mode="edit" />
}
