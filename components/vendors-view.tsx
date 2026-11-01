'use client'

import { useState, type FormEvent } from 'react'
import { Plus, ShieldCheck, Trash2 } from 'lucide-react'
import { Heading, type ViewProps } from '@/components/plan-views'
import type { VendorItem, VendorPatch, VendorStatus } from '@/lib/schemas'
import { MAX_CUSTOM_VENDORS, quoteCheck } from '@/lib/domain/vendors'
import { money } from '@/lib/format'

const statusLabels: Record<VendorStatus, string> = {
  not_started: 'Not started',
  shortlisting: 'Shortlisting',
  quote_received: 'Quote received (pending)',
  booked: 'Booked (confirmed)',
}

/** Text field that saves on blur, only when the value changed. */
function BlurField(props: { label: string; hint?: string; value?: string; type?: string; maxLength?: number; onSave: (v: string) => void }) {
  return (
    <label className="vendor-field">
      <span className="field-hint">{props.label}</span>
      <input
        type={props.type ?? 'text'}
        inputMode={props.type === 'number' ? 'numeric' : undefined}
        min={props.type === 'number' ? 0 : undefined}
        maxLength={props.maxLength}
        defaultValue={props.value ?? ''}
        onBlur={(e) => {
          if (e.target.value.trim() !== (props.value ?? '')) props.onSave(e.target.value.trim())
        }}
      />
      {props.hint && <span className="field-hint">{props.hint}</span>}
    </label>
  )
}

function QuoteNote({ v, currency }: { v: VendorItem; currency: Parameters<typeof money>[1] }) {
  const check = quoteCheck(v)
  if (v.quote === undefined) return null
  const quoted = money(v.quote, currency)
  if (!check) return <span className="estimate">Quoted <b>{quoted}</b></span>
  const text = {
    over: `${money(v.quote - v.estHigh, currency)} over your planning range. Ask what can be trimmed, or run a what-if to make room.`,
    within: 'Within your planning range.',
    under: `${money(v.estLow - v.quote, currency)} under your planning range. Check nothing is missing from the quote.`,
  }[check]
  return (
    <span className="quote-note" data-check={check} role="status">
      Quoted <b>{quoted}</b>: {text}
    </span>
  )
}

export function VendorsView({ input, version, canEdit, onAction }: ViewProps) {
  const categories = [...new Set(version.lines.map((l) => l.category))]
  const [category, setCategory] = useState(categories[0] ?? 'Other')
  const [name, setName] = useState('')
  const customCount = version.vendors.filter((v) => v.custom).length
  const save = (id: string, patch: VendorPatch, message = 'Saved.') => onAction({ type: 'vendor', id, patch }, message)

  const add = (e: FormEvent) => {
    e.preventDefault()
    void onAction({ type: 'vendor-add', category, name: name.trim() || undefined }, 'Vendor added.')
    setName('')
  }

  return (
    <section className="detail">
      <Heading eyebrow="Vendor checklist" title="Shortlists, not marketplaces">
        Ranges come from your own budget. Record who you are talking to and what they quote, and Soirée checks it
        against the plan.
      </Heading>
      <div className="vendor-list">
        {version.vendors.map((v) => (
          <article className="vendor-row" key={v.id} aria-labelledby={`${v.id}-name`}>
            <div className="vendor-row-head">
              <div>
                <strong id={`${v.id}-name`}>{v.name || v.category}</strong>
                {(v.name || v.custom) && <span className="vendor-meta">{v.category}{v.custom && ' · added by you'}</span>}
              </div>
              {canEdit ? (
                <label>
                  <span className="sr-only">Status for {v.name || v.category}</span>
                  <select value={v.status} onChange={(e) => save(v.id, { status: e.target.value as VendorStatus }, 'Status saved.')}>
                    {Object.entries(statusLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <span className="status-pill" data-status={v.status}>
                  {statusLabels[v.status]}
                </span>
              )}
            </div>
            {v.estHigh > 0 && (
              <span className="estimate">
                Planning estimate, not a quote: <b>{money(v.estLow, input.currency)}</b> to <b>{money(v.estHigh, input.currency)}</b>
              </span>
            )}
            <QuoteNote v={v} currency={input.currency} />
            {!canEdit && v.contact && <span className="estimate">Contact: {v.contact}</span>}
            {canEdit && (
              <div className="vendor-fields">
                <BlurField label="Vendor name" value={v.name} maxLength={80} onSave={(x) => save(v.id, { name: x })} />
                <BlurField
                  label="Contact (phone or email)"
                  hint="Anyone with your view link can see this."
                  value={v.contact}
                  maxLength={120}
                  onSave={(x) => save(v.id, { contact: x })}
                />
                <BlurField
                  label={`Quote (${input.currency})`}
                  type="number"
                  value={v.quote?.toString()}
                  onSave={(x) => save(v.id, { quote: x === '' ? null : Math.max(0, Math.round(Number(x)) || 0) }, 'Quote saved.')}
                />
              </div>
            )}
            {v.questionsToAsk.length > 0 && (
              <details>
                <summary>Questions to ask ({v.questionsToAsk.length})</summary>
                <ul>
                  {v.questionsToAsk.map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ul>
              </details>
            )}
            {canEdit && (
              <label className="notes-field">
                <span className="field-hint">Notes</span>
                <textarea
                  maxLength={500}
                  defaultValue={v.notes ?? ''}
                  rows={2}
                  onBlur={(e) => {
                    if (e.target.value !== (v.notes ?? '')) void save(v.id, { notes: e.target.value }, 'Note saved.')
                  }}
                />
              </label>
            )}
            <div className="vendor-row-foot">
              {v.verifyBeforeDeposit && (
                <span className="verify-note">
                  <ShieldCheck aria-hidden /> Verify the vendor before paying a deposit.
                </span>
              )}
              {canEdit && v.custom && (
                <button className="text-btn" onClick={() => onAction({ type: 'vendor-remove', id: v.id }, 'Vendor removed.')}>
                  <Trash2 aria-hidden /> Remove
                </button>
              )}
            </div>
          </article>
        ))}
      </div>

      {canEdit && (
        <form className="add-vendor" onSubmit={add} aria-labelledby="add-vendor-title">
          <h3 id="add-vendor-title">Add a vendor</h3>
          <p className="field-hint">Comparing two caterers? Add each one and record their quotes.</p>
          <div className="add-vendor-fields">
            <label className="vendor-field">
              <span className="field-hint">Category</span>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                {[...categories, 'Other'].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="vendor-field">
              <span className="field-hint">Name (optional)</span>
              <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
            </label>
            <button type="submit" className="primary-btn" disabled={customCount >= MAX_CUSTOM_VENDORS}>
              <Plus aria-hidden /> Add vendor
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
