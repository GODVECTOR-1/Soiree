// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { Ribbon } from '@/components/ribbon'
import { TaskRow } from '@/components/plan-views'
import { VendorsView } from '@/components/vendors-view'
import { Coverflow } from '@/components/coverflow'
import { LoadingScreen } from '@/components/loading-screen'
import CreatePage from '@/app/create/page'
import { previewVersion } from '@/lib/domain/baseline'
import { samples, type PlanVersion } from '@/lib/schemas'

// UI behaviour that screen-reader and keyboard users rely on. Canvas effects have no WebGL here, so they fall back
// to their CSS backgrounds, exactly as they do in a browser without WebGL.

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}))

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() =>
    null) as typeof HTMLCanvasElement.prototype.getContext
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const input = { ...samples.wedding, planningStart: '2026-11-01' }
const version = previewVersion(input, '2026-11-01')
const viewProps = (v: PlanVersion, canEdit = true) => ({
  slug: 'abc',
  token: canEdit ? 'tok' : null,
  input,
  version: v,
  canEdit,
  onAction: vi.fn(async () => {}),
})

describe('Ribbon', () => {
  it('describes the whole split in words, marking priorities without relying on colour', () => {
    render(<Ribbon lines={version.lines} />)
    const label = screen.getByRole('img').getAttribute('aria-label') ?? ''
    expect(label).toMatch(/^Budget split: /)
    expect(label).toMatch(/Catering \d+ percent, priority/)
  })
})

describe('TaskRow', () => {
  const task = {
    id: 'wedding-1',
    title: 'Book the caterer',
    dueLabel: 'By 1 Jan 2027',
    done: false,
    tags: ['Catering'],
    offsetDays: 200,
  }

  it('is a labelled checkbox with a priority and its reason', () => {
    const onToggle = vi.fn()
    render(<TaskRow task={task} input={input} canEdit onToggle={onToggle} />)
    const box = screen.getByRole('checkbox', { name: /Book the caterer/ })
    expect(screen.getByText(/High priority · Your priority: Catering/)).toBeTruthy()
    fireEvent.click(box)
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it('is disabled on a read-only plan', () => {
    render(<TaskRow task={task} input={input} canEdit={false} onToggle={() => {}} />)
    expect((screen.getByRole('checkbox') as HTMLInputElement).disabled).toBe(true)
  })
})

describe('VendorsView', () => {
  it('flags a quote over the planning range in words', () => {
    const vendors = version.vendors.map((v) =>
      v.category === 'Catering' ? { ...v, name: 'Spice Route', quote: v.estHigh + 5000 } : v,
    )
    render(<VendorsView {...viewProps({ ...version, vendors })} />)
    const card = screen.getByRole('article', { name: 'Spice Route' })
    expect(within(card).getByRole('status').textContent).toMatch(/over your planning range/)
  })

  it('adds a vendor from the labelled form', () => {
    const props = viewProps(version)
    render(<VendorsView {...props} />)
    fireEvent.change(screen.getByLabelText('Name (optional)'), {
      target: { value: 'Second caterer' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add vendor' }))
    expect(props.onAction).toHaveBeenCalledWith(
      { type: 'vendor-add', category: 'Catering', name: 'Second caterer' },
      'Vendor added.',
    )
  })

  it('shows status as text and no edit controls on a shared plan', () => {
    render(<VendorsView {...viewProps(version, false)} />)
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.queryByRole('form', { name: 'Add a vendor' })).toBeNull()
    expect(screen.getAllByText('Not started').length).toBe(version.vendors.length)
  })
})

describe('Coverflow', () => {
  const slides = ['a', 'b', 'c'].map((s) => ({ src: `/${s}.webp`, alt: `Photo ${s}` }))
  const current = () =>
    screen
      .getAllByRole('group', { hidden: true })
      .find((g) => g.getAttribute('aria-hidden') === 'false')

  it('moves with the arrow keys and can be paused', () => {
    vi.useFakeTimers()
    render(<Coverflow slides={slides} label="Celebration photos" />)
    const region = screen.getByRole('region', { name: /Celebration photos/ })
    expect(current()?.getAttribute('aria-label')).toBe('1 of 3')
    fireEvent.keyDown(region, { key: 'ArrowRight' })
    expect(current()?.getAttribute('aria-label')).toBe('2 of 3')

    fireEvent.click(screen.getByRole('button', { name: 'Pause slideshow' }))
    expect(screen.getByRole('button', { name: 'Play slideshow' })).toBeTruthy()
    fireEvent.blur(region) // focus left by clicking: only the pause button holds it still now
    act(() => void vi.advanceTimersByTime(10_000))
    expect(current()?.getAttribute('aria-label')).toBe('2 of 3')
  })
})

describe('LoadingScreen', () => {
  it('announces the title once and rotates the visual steps', () => {
    vi.useFakeTimers()
    render(<LoadingScreen title="Opening your plan" steps={['One', 'Two']} />)
    expect(screen.getByRole('status').textContent).toMatch(/Opening\s+your\s+plan/)
    expect(screen.getByText('One').getAttribute('aria-hidden')).toBe('true')
    act(() => void vi.advanceTimersByTime(2400))
    expect(screen.getByText('Two')).toBeTruthy()
  })
})

describe('Create wizard', () => {
  it('moves focus to the first invalid field and ties each error to it', () => {
    sessionStorage.clear()
    render(<CreatePage />)
    expect(screen.getByRole('button', { name: /Wedding/, pressed: true })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('The basics')

    fireEvent.click(screen.getByRole('button', { name: /Continue/ }))
    const title = screen.getByLabelText(/Celebration name/)
    expect(title.getAttribute('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe(title)
    const errorId = title.getAttribute('aria-describedby') ?? ''
    expect(document.getElementById(errorId)?.textContent).toBe('Give your celebration a name.')
  })

  it('caps priorities at three and says why the rest are unavailable', () => {
    sessionStorage.setItem('soiree:wizard', JSON.stringify({ ...input, priorities: [] }))
    render(<CreatePage />)
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }))
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }))
    const group = screen.getByRole('group', { name: 'Priorities' })
    expect(group.getAttribute('aria-describedby')).toBe('h-priorities')
    for (const name of ['Catering', 'Photo and video', 'Venue and rentals'])
      fireEvent.click(within(group).getByRole('button', { name }))
    const music = within(group).getByRole('button', { name: 'Music and sound' })
    expect(music.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(music)
    expect(music.getAttribute('aria-pressed')).toBe('false')
  })
})
