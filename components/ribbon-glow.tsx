'use client'

import { useEffect, useRef } from 'react'

// Original glowing-ribbon background, written from the public description and props of Originkit's "Ribbon Glow 4"
// (no Originkit code). Each ribbon is accumulated from 84 stacked sheets of light across its width, so its edges
// catch the light and it brightens into a crease where it folds. A Gaussian field around the pointer swirls the plane
// (up to 1.25 rad) and drags it along the smoothed, speed-capped pointer velocity. Filmic tone mapping lets crossing
// ribbons saturate instead of clipping to white; light is screened over dark grounds and laid like pigment over light
// ones. Rendered at half resolution with a 2x device-pixel cap and an interleaved-gradient-noise dither. Reduced
// motion gets one still frame; the loop stops while off screen.

// Defaults from the documented props: size 100, angle 0, hover 100, reach 240, ribbonCount 3, speed 50.
const SIZE = 1
const ANGLE = 0
const HOVER = 1
const REACH = 240
const RIBBON_COUNT = 3
const SPEED = 1
const MAX_DPR = 2
const SCALE = 0.5 // half-resolution field, upsampled by CSS
const MAX_COLORS = 5
const SWIRL = 1.25
const VEL_CAP = 1.5 // field units per second

const VERT = `attribute vec2 aPos; void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`

const FRAG = `
precision highp float;
uniform vec2 uRes, uMouse, uVel;
uniform float uTime, uPresence, uReach, uHover, uSize, uAngle, uCount, uLight;
uniform vec3 uBg;
uniform vec3 uColorA[${MAX_COLORS}];
uniform vec3 uColorB[${MAX_COLORS}];

mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

// A centre line that travels and breathes, and a signed width that pinches through zero where the ribbon folds.
// 84 thin sheets are stacked across the width; the outer sheets are brightest, like light on silk.
vec3 ribbon(vec2 p, float t, float seed, vec3 a, vec3 b){
  float centre = 0.38 * sin(p.x * 1.15 + t * 0.55 + seed) + 0.16 * sin(p.x * 2.3 - t * 0.35 + seed * 1.7);
  float width = 0.22 * sin(p.x * 0.9 + t * 0.4 + seed * 2.3);
  vec3 tint = mix(a, b, 0.5 + 0.5 * sin(p.x * 0.7 + t * 0.25 + seed));
  float acc = 0.0;
  for (int i = 0; i < 84; i++) {
    float s = float(i) / 83.0 * 2.0 - 1.0;
    float d = (p.y - centre - width * s) * 140.0;
    acc += (0.18 + 0.82 * s * s * s * s) / (1.0 + d * d);
  }
  float g = (p.y - centre) / (abs(width) + 0.18);
  return tint * (acc * 0.06 + 0.35 * exp(-g * g));
}

void main(){
  vec2 frag = gl_FragCoord.xy;
  vec2 p = (frag - 0.5 * uRes) / uRes.y;
  vec2 m = (uMouse - 0.5 * uRes) / uRes.y;
  vec2 d = p - m;
  float r = uReach / uRes.y;
  float infl = uPresence * uHover * exp(-dot(d, d) / (r * r));
  p = m + rot(infl * ${SWIRL.toFixed(2)}) * d - uVel * infl * 0.35;
  p = rot(uAngle) * p / uSize;

  vec3 hdr = vec3(0.0);
  for (int k = 0; k < ${MAX_COLORS}; k++) {
    if (float(k) >= uCount) break;
    float fk = float(k);
    hdr += ribbon(rot(fk * 0.55) * p / (1.0 + fk * 0.12), uTime, fk * 1.7 + 0.3, uColorA[k], uColorB[k]);
  }

  // Filmic (ACES fit) per channel, then a slight per-channel gamma: overlaps go deeper in hue, not white.
  vec3 c = clamp((hdr * (2.51 * hdr + 0.03)) / (hdr * (2.43 * hdr + 0.59) + 0.14), 0.0, 1.0);
  c = pow(c, vec3(0.95, 1.0, 1.05));
  vec3 lit = 1.0 - (1.0 - uBg) * (1.0 - c);                       // light over a dark ground
  float amt = max(max(c.r, c.g), c.b);
  vec3 hue = c / max(amt, 1e-4);
  vec3 pigment = uBg * (1.0 - (1.0 - hue) * amt);                  // pigment on paper
  vec3 col = mix(lit, pigment, uLight);
  float n = fract(52.9829189 * fract(dot(frag, vec2(0.06711056, 0.00583715))));
  gl_FragColor = vec4(col + (n - 0.5) / 255.0, 1.0);
}
`

const rgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1, 7), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

/** Animated ribbons that fill their positioned parent and swirl toward the cursor anywhere over that parent. */
export function RibbonGlow({
  colors,
  background = '#0B0A10',
}: {
  colors: string[]
  background?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const colorsRef = useRef({ colors, background })
  const redrawRef = useRef<() => void>(() => {})

  useEffect(() => {
    const canvas = canvasRef.current
    const host = canvas?.parentElement
    const gl = canvas?.getContext('webgl', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
    })
    if (!canvas || !host || !gl) return // no WebGL: the CSS background colour shows instead

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)
      if (!sh) return null
      gl.shaderSource(sh, src)
      gl.compileShader(sh)
      return sh
    }
    const vs = compile(gl.VERTEX_SHADER, VERT)
    const fs = compile(gl.FRAGMENT_SHADER, FRAG)
    const prog = gl.createProgram()
    if (!vs || !fs || !prog) return
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return
    gl.useProgram(prog)
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const aPos = gl.getAttribLocation(prog, 'aPos')
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

    const loc = (name: string) => gl.getUniformLocation(prog, name)
    const U = {
      res: loc('uRes'),
      mouse: loc('uMouse'),
      vel: loc('uVel'),
      time: loc('uTime'),
      presence: loc('uPresence'),
      reach: loc('uReach'),
      bg: loc('uBg'),
      a: loc('uColorA'),
      b: loc('uColorB'),
      light: loc('uLight'),
    }
    gl.uniform1f(loc('uHover'), HOVER)
    gl.uniform1f(loc('uSize'), SIZE)
    gl.uniform1f(loc('uAngle'), ANGLE)
    gl.uniform1f(loc('uCount'), RIBBON_COUNT)

    let scale = 1
    const resize = () => {
      scale = Math.min(window.devicePixelRatio || 1, MAX_DPR) * SCALE
      const w = Math.max(1, Math.round(canvas.clientWidth * scale))
      const h = Math.max(1, Math.round(canvas.clientHeight * scale))
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
        gl.viewport(0, 0, w, h)
      }
    }

    // Pointer in CSS px (y down) with a smoothed, capped velocity in field units (fractions of the height) per second.
    const ptr = { x: 0, y: 0, tx: 0, ty: 0, vx: 0, vy: 0, presence: 0, want: 0 }
    let time = 0

    const draw = () => {
      resize()
      const { colors: cs, background: bg } = colorsRef.current
      const list = cs.slice(0, MAX_COLORS)
      const A = new Float32Array(MAX_COLORS * 3)
      const B = new Float32Array(MAX_COLORS * 3)
      for (let k = 0; k < MAX_COLORS; k++) {
        A.set(rgb(list[k % list.length] ?? '#ffffff'), k * 3)
        B.set(rgb(list[(k + 1) % list.length] ?? '#ffffff'), k * 3)
      }
      const ground = rgb(bg)
      const luma = 0.2126 * ground[0] + 0.7152 * ground[1] + 0.0722 * ground[2]
      gl.uniform2f(U.res, canvas.width, canvas.height)
      gl.uniform2f(U.mouse, ptr.x * scale, canvas.height - ptr.y * scale)
      gl.uniform2f(U.vel, ptr.vx, -ptr.vy)
      gl.uniform1f(U.time, time)
      gl.uniform1f(U.presence, ptr.presence)
      gl.uniform1f(U.reach, REACH * scale)
      gl.uniform3f(U.bg, ground[0], ground[1], ground[2])
      gl.uniform3fv(U.a, A)
      gl.uniform3fv(U.b, B)
      gl.uniform1f(U.light, luma > 0.5 ? 1 : 0)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }
    redrawRef.current = draw

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    let last = -1
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const dt = last < 0 ? 0 : Math.min(0.1, (now - last) / 1000)
      last = now
      time += dt * SPEED
      const k = 1 - Math.pow(1 - 0.18, dt * 60)
      const px = ptr.x
      const py = ptr.y
      ptr.x += (ptr.tx - ptr.x) * k
      ptr.y += (ptr.ty - ptr.y) * k
      ptr.presence += (ptr.want - ptr.presence) * k
      if (dt > 0) {
        const h = Math.max(canvas.clientHeight, 1)
        let vx = (ptr.x - px) / h / dt
        let vy = (ptr.y - py) / h / dt
        const sp = Math.hypot(vx, vy)
        if (sp > VEL_CAP) {
          vx *= VEL_CAP / sp
          vy *= VEL_CAP / sp
        }
        ptr.vx += (vx - ptr.vx) * k
        ptr.vy += (vy - ptr.vy) * k
      }
      draw()
    }
    const start = () => {
      if (raf || reduced) return
      last = -1
      raf = requestAnimationFrame(frame)
    }
    const stop = () => {
      cancelAnimationFrame(raf)
      raf = 0
    }

    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      ptr.tx = e.clientX - r.left
      ptr.ty = e.clientY - r.top
      if (ptr.want === 0) {
        ptr.x = ptr.tx // enter where the pointer is, not from a corner
        ptr.y = ptr.ty
      }
      ptr.want = 1
    }
    const onLeave = () => (ptr.want = 0)
    if (!reduced) {
      host.addEventListener('pointermove', onMove)
      host.addEventListener('pointerleave', onLeave)
      host.addEventListener('pointercancel', onLeave)
    }

    const io = new IntersectionObserver(([entry]) => (entry?.isIntersecting ? start() : stop()))
    io.observe(host)
    const ro = new ResizeObserver(() => !raf && draw())
    ro.observe(host)
    draw()

    return () => {
      stop()
      io.disconnect()
      ro.disconnect()
      host.removeEventListener('pointermove', onMove)
      host.removeEventListener('pointerleave', onLeave)
      host.removeEventListener('pointercancel', onLeave)
      redrawRef.current = () => {}
    }
  }, [])

  // Colour changes reuse the same GL context; redraw at once in case the loop is paused.
  useEffect(() => {
    colorsRef.current = { colors, background }
    redrawRef.current()
  }, [colors, background])

  return <canvas ref={canvasRef} className="ribbon-glow" aria-hidden />
}
