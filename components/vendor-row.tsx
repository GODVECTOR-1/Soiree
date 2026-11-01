'use client'

import { ShieldCheck, Trash2 } from 'lucide-react'
import type { Currency, VendorItem, VendorPatch, VendorStatus } from '@/lib/schemas'
import { quoteCheck } from '@/lib/domain/vendors'
import { money } from '@/lib/format'

const statusLabels: Record<VendorStatus, string> = {
  not_started: 'Not started',
  shortlisting: 'Shortlisting',
  quote_received: 'Quote received (pending)',
  booked: 'Booked (confirmed)',
}

type FieldProps = {
  label: string
  hint?: string
  value?: string
  type?: 'text' | 'number'
  maxLength?: number
  onSave: (v: string) => void
}

/** Text field that saves on blur, only when the value changed. */
function BlurField({ label, hint, value = '', type = 'text', maxLength, onSave }: FieldProps) {
  const numeric = type === 'number'
  return (
    <label className="vendor-field">
      <span className="field-hint">{label}</span>
      <input
        type={type}
        inputMode={numeric ? 'numeric' : undefined}
        min={numeric ? 0 : undefined}
        maxLength={maxLength}
        defaultValue={value}
        onBlur={(e) => {
          const next = e.target.value.trim()
          if (next !== value) onSave(next)
        }}
      />
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}

const quoteText = (v: VendorItem & { quote: number }, currency: Currency) => ({
  over: `${money(v.quote - v.estHigh, currency)} over your planning range. Ask what can be trimmed, or run a what-if to make room.`,
  within: 'Within your planning range.',
  under: `${money(v.estLow - v.quote, currency)} under your planning range. Check nothing is missing from the quote.`,
})

/** The recorded quote, and how it compares with the planning range, in words. */
function QuoteNote({ v, currency }: { v: VendorItem; currency: Currency }) {
  const check = quoteCheck(v)
  if (v.quote === undefined) return null
  const quoted = money(v.quote, currency)
  if (!check)
    return (
      <span className="estimate">
        Quoted <b>{quoted}</b>
      </span>
    )
  return (
    <span className="quote-note" data-check={check} role="status">
      Quoted <b>{quoted}</b>: {quoteText({ ...v, quote: v.quote }, currency)[check]}
    </span>
  )
}

type RowProps = {
  vendor: VendorItem
  currency: Currency
  canEdit: boolean
  onSave: (patch: VendorPatch, message?: string) => void
  onRemove: () => void
}

function VendorHead({ vendor: v, canEdit, onSave }: RowProps) {
  const name = v.name || v.category
  return (
    <div className="vendor-row-head">
      <div>
        <strong id={`${v.id}-name`}>{name}</strong>
        {(v.name || v.custom) && (
          <span className="vendor-meta">
            {v.category}
            {v.custom && ' · added by you'}
          </span>
        )}
      </div>
      {canEdit ? (
        <label>
          <span className="sr-only">Status for {name}</span>
          <select
            value={v.status}
            onChange={(e) => onSave({ status: e.target.value as VendorStatus }, 'Status saved.')}
          >
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
  )
}

/** Name, contact and quote, each saved when the field loses focus. */
function VendorFields({ vendor: v, currency, onSave }: RowProps) {
  return (
    <div className="vendor-fields">
      <BlurField
        label="Vendor name"
        value={v.name}
        maxLength={80}
        onSave={(x) => onSave({ name: x })}
      />
      <BlurField
        label="Contact (phone or email)"
        hint="Anyone with your view link can see this."
        value={v.contact}
        maxLength={120}
        onSave={(x) => onSave({ contact: x })}
      />
      <BlurField
        label={`Quote (${currency})`}
        type="number"
        value={v.quote?.toString()}
        onSave={(x) =>
          onSave(
            { quote: x === '' ? null : Math.max(0, Math.round(Number(x)) || 0) },
            'Quote saved.',
          )
        }
      />
    </div>
  )
}

function VendorNotes({ vendor: v, onSave }: RowProps) {
  return (
    <label className="notes-field">
      <span className="field-hint">Notes</span>
      <textarea
        maxLength={500}
        defaultValue={v.notes ?? ''}
        rows={2}
        onBlur={(e) => {
          if (e.target.value !== (v.notes ?? '')) onSave({ notes: e.target.value }, 'Note saved.')
        }}
      />
    </label>
  )
}

/** One vendor: status, planning range, quote check, the user's records, questions to ask, and notes. */
export function VendorRow(props: RowProps) {
  const { vendor: v, currency, canEdit, onRemove } = props
  return (
    <article className="vendor-row" aria-labelledby={`${v.id}-name`}>
      <VendorHead {...props} />
      {v.estHigh > 0 && (
        <span className="estimate">
          Planning estimate, not a quote: <b>{money(v.estLow, currency)}</b> to{' '}
          <b>{money(v.estHigh, currency)}</b>
        </span>
      )}
      <QuoteNote v={v} currency={currency} />
      {!canEdit && v.contact && <span className="estimate">Contact: {v.contact}</span>}
      {canEdit && <VendorFields {...props} />}
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
      {canEdit && <VendorNotes {...props} />}
      <div className="vendor-row-foot">
        {v.verifyBeforeDeposit && (
          <span className="verify-note">
            <ShieldCheck aria-hidden /> Verify the vendor before paying a deposit.
          </span>
        )}
        {canEdit && v.custom && (
          <button className="text-btn" onClick={onRemove}>
            <Trash2 aria-hidden /> Remove
          </button>
        )}
      </div>
    </article>
  )
}
