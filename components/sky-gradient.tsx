'use client'

import { useEffect, useRef, type CSSProperties } from 'react'
import { SKY, SKY_STOPS } from '@/components/sky-shader'
import { SkyAnimation, grainDataUrl } from '@/components/sky-animation'

/**
 * Animated sky that fills its box, with film grain over it; the clouds swirl gently around the cursor. Decorative:
 * hidden from screen readers. Without WebGL the CSS gradient shows instead.
 */
export function SkyGradient({ style }: { style?: CSSProperties }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const grainRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const grain = grainDataUrl()
    if (grain && grainRef.current) grainRef.current.style.backgroundImage = `url(${grain})`
    const sky = SkyAnimation.start(canvas)
    return () => sky?.dispose()
  }, [])

  return (
    <div
      style={{
        position: 'relative',
        display: 'block',
        overflow: 'hidden',
        width: '100%',
        aspectRatio: `${SKY.width} / ${SKY.height}`,
        background: `linear-gradient(180deg, ${SKY_STOPS.join(', ')})`,
        ...style,
      }}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        style={{ position: 'absolute', inset: 0, display: 'block', width: '100%', height: '100%' }}
      />
      <div
        ref={grainRef}
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          backgroundSize: '256px 256px',
          imageRendering: 'pixelated',
          mixBlendMode: 'overlay',
          opacity: SKY.grain / 200,
        }}
      />
    </div>
  )
}
