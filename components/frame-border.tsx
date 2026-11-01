'use client'

import { useEffect, useRef } from 'react'
import { FRAME_FRAG, FRAME_VERT, MAX_PULSES } from '@/components/frame-border-shader'
import {
  devicePixels,
  fitCanvas,
  fullscreenProgram,
  prefersReducedMotion,
  rgb,
  runLoop,
} from '@/components/webgl'

// Original glowing frame border, written from the public demo and prop docs of React Bits Pro's "Frame Border"
// (no React Bits code). Two colours blend in OKLCH and slowly travel around a crisp line with a soft, noisy inner
// glow; idle swells drift along it; hovering near the frame speeds the flow up; a click sends twin pulses from the
// nearest point of the frame that meet on the opposite side; on load the line draws in from the top, then the glow
// fades in. Light-page mode: a fine inked line with a tinted glow. Reduced motion gets one still frame.

// Defaults from the documented props.
const RADIUS = 16
const LINE_WIDTH = 1
const INSET = 0
const GLOW = 0.5
const GLOW_WIDTH = 110
const NOISE = 0.6
const NOISE_SCALE = 3
const FLOW_SPEED = 1
const PULSE_SPEED = 1
const IDLE_PULSES = 3
const IDLE_SPEED = 1
const IDLE_STRENGTH = 1
const INTENSITY = 1
const MAX_DPR = 2
const HOVER_BOOST = 1.8 // flow speed while the pointer is near the frame
const LINE_DRAW_S = 1.1
const GLOW_IN_S = 0.8

/** sRGB hex to OKLCH [L, C, h]. */
function oklch(hex: string): [number, number, number] {
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const [sr, sg, sb] = rgb(hex)
  const [r, g, b] = [lin(sr), lin(sg), lin(sb)]
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return [L, Math.hypot(A, B), Math.atan2(B, A)]
}

/** Both colours in OKLCH, plus the shortest hue turn from the first to the second. */
function huePair([first, second]: [string, string]) {
  const a = oklch(first)
  const b = oklch(second)
  let turn = b[2] - a[2]
  if (turn > Math.PI) turn -= 2 * Math.PI
  if (turn < -Math.PI) turn += 2 * Math.PI
  return { a, b, turn }
}

/** Where a point lands on the frame, as the same 0..1 arc-length position the shader uses (for click pulses). */
function perimAt(px: number, py: number, { w, h, r }: { w: number; h: number; r: number }) {
  const ax = w / 2 - r
  const ay = h / 2 - r
  const qa = (Math.PI / 2) * r
  const P = 4 * ax + 4 * ay + 4 * qa
  const x = px - w / 2
  const y = h / 2 - py // y up, like gl_FragCoord
  const cx = Math.max(-ax, Math.min(ax, x))
  const cy = Math.max(-ay, Math.min(ay, y))
  const d = [h / 2 - y, w / 2 - x, h / 2 + y, w / 2 + x] // top, right, bottom, left
  const side = d.indexOf(Math.min(...d))
  // Arc length clockwise from the top centre, for a point on each side.
  const along = [
    cx >= 0 ? cx : P + cx,
    ax + qa + (ay - cy),
    ax + 2 * qa + 2 * ay + (ax - cx),
    3 * ax + 3 * qa + 2 * ay + (cy + ay),
  ]
  return (along[side] ?? 0) / P
}

/** Sets the fixed uniforms and returns the locations updated every frame. */
function frameUniforms(gl: WebGLRenderingContext, prog: WebGLProgram) {
  const loc = (name: string) => gl.getUniformLocation(prog, name)
  gl.uniform1f(loc('uGlow'), GLOW)
  gl.uniform1f(loc('uNoise'), NOISE)
  gl.uniform1f(loc('uNoiseScale'), NOISE_SCALE)
  gl.uniform1f(loc('uIdleN'), IDLE_PULSES)
  gl.uniform1f(loc('uIdleSpeed'), IDLE_SPEED)
  gl.uniform1f(loc('uIdleStr'), IDLE_STRENGTH)
  gl.uniform1f(loc('uIntensity'), INTENSITY)
  gl.uniform1f(loc('uLine'), LINE_WIDTH)
  return {
    res: loc('uRes'),
    dpr: loc('uDpr'),
    time: loc('uTime'),
    flow: loc('uFlow'),
    lineP: loc('uLineP'),
    glowP: loc('uGlowP'),
    radius: loc('uRadius'),
    inset: loc('uInset'),
    glowW: loc('uGlowW'),
    lchA: loc('uLchA'),
    lchB: loc('uLchB'),
    dHue: loc('uDHue'),
    pulse: loc('uPulse'),
  }
}

type Pulse = { u: number; age: number }

/** Animation state: clocks, the hover boost, and click pulses still travelling. */
type FrameState = {
  time: number
  flow: number
  boost: number
  near: boolean
  elapsed: number
  pulses: Pulse[]
}

/** Advance the clocks; the flow speeds up while the pointer is near the frame; finished pulses drop off. */
function advance(s: FrameState, dt: number) {
  s.elapsed += dt
  s.time += dt
  s.boost += ((s.near ? HOVER_BOOST : 1) - s.boost) * (1 - Math.pow(0.92, dt * 60))
  s.flow += dt * 0.045 * FLOW_SPEED * s.boost
  for (const p of s.pulses) p.age += dt
  while (s.pulses.length && ((s.pulses[0]?.age ?? 0) * PULSE_SPEED) / 1.4 >= 1) s.pulses.shift()
}

/** Draws a frame of the border from the state and the current colours. */
function frameRenderer(gl: WebGLRenderingContext, prog: WebGLProgram, canvas: HTMLCanvasElement) {
  const U = frameUniforms(gl, prog)
  const pulseData = new Float32Array(MAX_PULSES * 3) // per pulse: origin, progress, active
  return (s: FrameState, colors: [string, string]) => {
    const dpr = devicePixels(MAX_DPR)
    fitCanvas(canvas, gl, dpr)
    const { a, b, turn } = huePair(colors)
    pulseData.fill(0)
    s.pulses.forEach((p, i) =>
      pulseData.set([p.u, Math.min(1, (p.age * PULSE_SPEED) / 1.4), 1], i * 3),
    )
    gl.uniform2f(U.res, canvas.width, canvas.height)
    gl.uniform1f(U.dpr, dpr)
    gl.uniform1f(U.time, s.time)
    gl.uniform1f(U.flow, s.flow)
    gl.uniform1f(U.lineP, Math.min(1, s.elapsed / LINE_DRAW_S))
    gl.uniform1f(U.glowP, Math.max(0, Math.min(1, (s.elapsed - LINE_DRAW_S * 0.8) / GLOW_IN_S)))
    gl.uniform1f(U.radius, RADIUS * dpr)
    gl.uniform1f(U.inset, INSET * dpr)
    gl.uniform1f(U.glowW, GLOW_WIDTH * dpr)
    gl.uniform3f(U.lchA, a[0], a[1], a[2])
    gl.uniform2f(U.lchB, b[0], b[1])
    gl.uniform1f(U.dHue, turn)
    gl.uniform3fv(U.pulse, pulseData)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }
}

/** A glowing frame around the whole window. Decorative: never takes clicks or focus. */
export function FrameBorder({ colors }: { colors: [string, string] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const colorsRef = useRef(colors)

  useEffect(() => {
    colorsRef.current = colors
  }, [colors])

  useEffect(() => {
    const canvas = canvasRef.current
    const gl = canvas?.getContext('webgl', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
    })
    const prog = gl && fullscreenProgram(gl, FRAME_VERT, FRAME_FRAG)
    if (!canvas || !gl || !prog) return

    const reduced = prefersReducedMotion()
    const draw = frameRenderer(gl, prog, canvas)
    // Reduced motion skips the intro: the line and glow are already in.
    const s: FrameState = {
      time: 0,
      flow: 0,
      boost: 1,
      near: false,
      elapsed: reduced ? LINE_DRAW_S + GLOW_IN_S : 0,
      pulses: [],
    }

    const onMove = (e: PointerEvent) => {
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      s.near = Math.min(e.clientX, e.clientY, w - e.clientX, h - e.clientY) < GLOW_WIDTH
    }
    const onDown = (e: PointerEvent) => {
      const frame = { w: canvas.clientWidth, h: canvas.clientHeight, r: RADIUS }
      s.pulses.push({ u: perimAt(e.clientX, e.clientY, frame), age: 0 })
      if (s.pulses.length > MAX_PULSES) s.pulses.shift() // clicks stack, oldest drops
    }

    if (!reduced) {
      window.addEventListener('pointermove', onMove, { passive: true })
      window.addEventListener('pointerdown', onDown, { passive: true })
    }
    const stopLoop = runLoop(
      canvas,
      (dt) => advance(s, dt),
      () => draw(s, colorsRef.current),
      reduced,
    )

    return () => {
      stopLoop()
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', onDown)
    }
  }, [])

  return <canvas ref={canvasRef} className="frame-border" aria-hidden />
}
