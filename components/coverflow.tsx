'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import Image from 'next/image'

// Adapted from Originkit's Coverflow Gallery (Smooth3DSlideshow). Kept: the 3D math and the autoplay preset.
// Changed: sizes come from CSS (--card-w, --spread) so it fits any column, Framer-only code is gone, and autoplay
// pauses on hover, keyboard focus, or prefers-reduced-motion.

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

export function Coverflow({ slides, label }: { slides: CoverflowSlide[]; label: string }) {
  const n = slides.length
  const [active, setActive] = useState(0)
  const [hovering, setHovering] = useState(false)
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
    if (hovering || n < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const id = window.setInterval(() => go((a) => a + 1), HOLD_S * 1000)
    return () => window.clearInterval(id)
  }, [hovering, n, go])

  return (
    <div
      className="coverflow"
      role="region"
      aria-roledescription="carousel"
      aria-label={`${label}. Use the arrow keys to browse.`}
      tabIndex={0}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onFocus={() => setHovering(true)}
      onBlur={() => setHovering(false)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') go((a) => a + 1)
        else if (e.key === 'ArrowLeft') go((a) => a - 1)
        else return
        e.preventDefault()
      }}
    >
      <div className="coverflow-stage">
        {slides.map((slide, i) => {
          let rel = i - active
          if (rel > n / 2) rel -= n
          if (rel < -n / 2) rel += n
          const ax = Math.abs(rel)
          const visible = ax <= MAX_VISIBLE
          const isActive = rel === 0
          const style: CSSProperties = {
            transform: `translateX(calc(var(--card-w) * var(--spread) * ${rel})) translateZ(${-ax * DEPTH}px) rotateY(${-rel * TILT}deg) rotateZ(${rel * SIDE_TILT}deg) scale(${Math.max(0.4, 1 - ax * SCALE_STEP)})`,
            transition: `transform ${MOVE_S}s ${EASE}, opacity ${MOVE_S}s ${EASE}`,
            opacity: visible ? 1 : 0,
            pointerEvents: visible ? 'auto' : 'none',
            cursor: isActive ? 'default' : 'pointer',
          }
          return (
            <div
              key={slide.src}
              className="coverflow-card"
              style={style}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${n}`}
              aria-hidden={!isActive}
              onClick={() => !isActive && go(() => i)}
            >
              {/* Above the fold: load every photo now, the first one first (it is the LCP image). */}
              <Image src={slide.src} alt={slide.alt} fill sizes="220px" loading="eager" fetchPriority={i === 0 ? 'high' : 'auto'} draggable={false} />
              <div className="coverflow-dim" style={{ opacity: isActive ? 0 : DIM, transition: `opacity ${MOVE_S}s ${EASE}` }} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
