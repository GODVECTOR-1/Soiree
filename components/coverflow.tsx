'use client'

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from 'react'
import Image from 'next/image'
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react'

// Adapted from Originkit's Coverflow Gallery (Smooth3DSlideshow). Kept: the 3D math and the autoplay preset.
// Changed: sizes come from CSS (--card-w, --spread) so it fits any column, Framer-only code is gone, and autoplay
// pauses on hover or keyboard focus, starts paused under prefers-reduced-motion, and has a pause/play button (WCAG 2.2.2).
// Keyboard users step with previous/next buttons that appear on focus; mouse users click a side photo.

export type CoverflowSlide = { src: string; alt: string }

const DEPTH = 240 // px each step falls back; in preserve-3d, paint order follows depth, not z-index
const SCALE_STEP = 0.16
const MAX_VISIBLE = 2
const TILT = 12
const SIDE_TILT = 8
const DIM = 0.4 // overlay on inactive cards
const MOVE_S = 0.6
const HOLD_S = 1.95
const EASE = 'cubic-bezier(0.6, -0.28, 0.735, 0.045)'

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'
function subscribeMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

/** Slide `i`'s place relative to the active slide, the short way round: 0 is active, negative is left. */
function offsetFrom(i: number, active: number, n: number) {
  let rel = i - active
  if (rel > n / 2) rel -= n
  if (rel < -n / 2) rel += n
  return rel
}

/** The 3D placement for a slide `rel` steps from the active one; beyond MAX_VISIBLE it fades out. */
function slideStyle(rel: number): CSSProperties {
  const ax = Math.abs(rel)
  const visible = ax <= MAX_VISIBLE
  return {
    transform: `translateX(calc(var(--card-w) * var(--spread) * ${rel})) translateZ(${-ax * DEPTH}px) rotateY(${-rel * TILT}deg) rotateZ(${rel * SIDE_TILT}deg) scale(${Math.max(0.4, 1 - ax * SCALE_STEP)})`,
    transition: `transform ${MOVE_S}s ${EASE}, opacity ${MOVE_S}s ${EASE}`,
    opacity: visible ? 1 : 0,
    pointerEvents: visible ? 'auto' : 'none',
    cursor: rel === 0 ? 'default' : 'pointer',
  }
}

type SlideProps = {
  slide: CoverflowSlide
  index: number
  count: number
  rel: number
  onPick: () => void
}

function Slide({ slide, index, count, rel, onPick }: SlideProps) {
  const isActive = rel === 0
  return (
    <div
      className="coverflow-card"
      style={slideStyle(rel)}
      role="group"
      aria-roledescription="slide"
      aria-label={`${index + 1} of ${count}`}
      aria-hidden={!isActive}
    >
      {/* Above the fold: load every photo now, the first one first (it is the LCP image). */}
      <Image
        src={slide.src}
        alt={slide.alt}
        fill
        sizes="220px"
        loading="eager"
        fetchPriority={index === 0 ? 'high' : 'auto'}
        draggable={false}
      />
      <div
        className="coverflow-dim"
        style={{ opacity: isActive ? 0 : DIM, transition: `opacity ${MOVE_S}s ${EASE}` }}
      />
      {/* A mouse shortcut to a side photo; keyboard users have the previous and next buttons. */}
      {!isActive && (
        <button
          type="button"
          className="coverflow-pick"
          tabIndex={-1}
          aria-hidden
          onClick={onPick}
        />
      )}
    </div>
  )
}

type ControlsProps = { paused: boolean; onToggle: () => void; onStep: (by: number) => void }

/** Pause/play is always on screen; previous and next appear when a keyboard user tabs to them. */
function CarouselControls({ paused, onToggle, onStep }: ControlsProps) {
  return (
    <div className="coverflow-controls">
      <button
        type="button"
        className="coverflow-step"
        aria-label="Previous photo"
        onClick={() => onStep(-1)}
      >
        <ChevronLeft aria-hidden />
      </button>
      <button
        type="button"
        className="coverflow-toggle"
        aria-label={paused ? 'Play slideshow' : 'Pause slideshow'}
        onClick={onToggle}
      >
        {paused ? <Play aria-hidden /> : <Pause aria-hidden />}
      </button>
      <button
        type="button"
        className="coverflow-step"
        aria-label="Next photo"
        onClick={() => onStep(1)}
      >
        <ChevronRight aria-hidden />
      </button>
    </div>
  )
}

/** Which slide is active, moves that ignore input mid-move, and autoplay that pauses on hover, focus or request. */
function useCarousel(n: number) {
  const [active, setActive] = useState(0)
  const [hovering, setHovering] = useState(false)
  // null until the visitor chooses; until then reduced motion decides.
  const [pausedChoice, setPausedChoice] = useState<boolean | null>(null)
  const reducedMotion = useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  )
  const paused = pausedChoice ?? reducedMotion
  const lockRef = useRef(false)

  // Ignore input while a card is mid-move so rapid clicks don't stack up.
  const go = useCallback(
    (next: (a: number) => number) => {
      if (lockRef.current) return
      lockRef.current = true
      window.setTimeout(() => (lockRef.current = false), MOVE_S * 1000)
      setActive((a) => ((next(a) % n) + n) % n)
    },
    [n],
  )

  useEffect(() => {
    if (paused || hovering || n < 2) return
    const id = window.setInterval(() => go((a) => a + 1), HOLD_S * 1000)
    return () => window.clearInterval(id)
  }, [paused, hovering, n, go])

  return { active, go, paused, togglePaused: () => setPausedChoice(!paused), setHovering }
}

export function Coverflow({ slides, label }: { slides: CoverflowSlide[]; label: string }) {
  const n = slides.length
  const { active, go, paused, togglePaused, setHovering } = useCarousel(n)

  return (
    <div
      className="coverflow"
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onFocus={() => setHovering(true)}
      onBlur={() => setHovering(false)}
    >
      <div className="coverflow-stage">
        {slides.map((slide, i) => (
          <Slide
            key={slide.src}
            slide={slide}
            index={i}
            count={n}
            rel={offsetFrom(i, active, n)}
            onPick={() => go(() => i)}
          />
        ))}
      </div>
      {n > 1 && (
        <CarouselControls
          paused={paused}
          onToggle={togglePaused}
          onStep={(by) => go((a) => a + by)}
        />
      )}
    </div>
  )
}
