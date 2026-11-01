'use client'

import { useState, type FormEvent } from 'react'
import { Plus } from 'lucide-react'
import { Heading, type ViewProps } from '@/components/plan-views'
import { VendorRow } from '@/components/vendor-row'
import { MAX_CUSTOM_VENDORS } from '@/lib/domain/vendors'
import { LIMITS } from '@/lib/schemas'

type AddProps = {
  categories: string[]
  full: boolean
  onAdd: (category: string, name: string | undefined) => void
}

/** Add the user's own vendor (say, a second caterer to compare) under one of the plan's categories. */
function AddVendorForm({ categories, full, onAdd }: AddProps) {
  const [category, setCategory] = useState(categories[0] ?? 'Other')
  const [name, setName] = useState('')

  const add = (e: FormEvent) => {
    e.preventDefault()
    onAdd(category, name.trim() || undefined)
    setName('')
  }

  return (
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
          <input
            value={name}
            maxLength={LIMITS.vendorNameChars}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <button type="submit" className="primary-btn" disabled={full}>
          <Plus aria-hidden /> Add vendor
        </button>
      </div>
    </form>
  )
}

export function VendorsView({ input, version, canEdit, onAction }: ViewProps) {
  const categories = [...new Set(version.lines.map((l) => l.category))]
  const customCount = version.vendors.filter((v) => v.custom).length

  return (
    <section className="detail">
      <Heading eyebrow="Vendor checklist" title="Shortlists, not marketplaces">
        Ranges come from your own budget. Record who you are talking to and what they quote, and
        Soirée checks it against the plan.
      </Heading>
      <div className="vendor-list">
        {version.vendors.map((v) => (
          <VendorRow
            key={v.id}
            vendor={v}
            currency={input.currency}
            canEdit={canEdit}
            onSave={(patch, message = 'Saved.') =>
              void onAction({ type: 'vendor', id: v.id, patch }, message)
            }
            onRemove={() => void onAction({ type: 'vendor-remove', id: v.id }, 'Vendor removed.')}
          />
        ))}
      </div>
      {canEdit && (
        <AddVendorForm
          categories={categories}
          full={customCount >= MAX_CUSTOM_VENDORS}
          onAdd={(category, name) =>
            void onAction({ type: 'vendor-add', category, name }, 'Vendor added.')
          }
        />
      )}
    </section>
  )
}
