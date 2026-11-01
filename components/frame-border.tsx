'use client'

import { useEffect, useRef } from 'react'

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
const MAX_PULSES = 6
const HOVER_BOOST = 1.8 // flow speed while the pointer is near the frame
const LINE_DRAW_S = 1.1
const GLOW_IN_S = 0.8

const VERT = `attribute vec2 aPos; void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`

const FRAG = `
precision highp float;
const float PI = 3.14159265;
uniform vec2 uRes;
uniform float uDpr, uTime, uFlow, uLineP, uGlowP;
uniform float uRadius, uLine, uInset, uGlow, uGlowW, uNoise, uNoiseScale, uIdleN, uIdleSpeed, uIdleStr, uIntensity;
uniform vec3 uLchA;   // L, C, hue of colour A
uniform vec2 uLchB;   // L, C of colour B
uniform float uDHue;  // shortest hue turn from A to B
uniform vec3 uPulse[${MAX_PULSES}]; // origin (0..1 along the frame), progress (0..1), active

float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 15731.743); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p){ return 0.55 * vnoise(p) + 0.3 * vnoise(p * 2.1 + 3.7) + 0.15 * vnoise(p * 4.3 - 1.9); }

// Arc-length position (0..1) of the nearest frame point, clockwise from the top centre.
float perim(vec2 p, vec2 a, float r){
  float qa = 0.5 * PI * r;
  float P = 4.0 * a.x + 4.0 * a.y + 4.0 * qa;
  vec2 ap = abs(p);
  float s;
  if (ap.x > a.x && ap.y > a.y) {
    vec2 d = ap - a;
    float ang = atan(d.y, d.x); // 0 = horizontal, PI/2 = vertical
    if (p.x >= 0.0 && p.y >= 0.0) s = a.x + (0.5 * PI - ang) * r;
    else if (p.x >= 0.0) s = a.x + qa + 2.0 * a.y + ang * r;
    else if (p.y < 0.0) s = 3.0 * a.x + 2.0 * qa + 2.0 * a.y + (0.5 * PI - ang) * r;
    else s = 3.0 * a.x + 3.0 * qa + 4.0 * a.y + ang * r;
  } else {
    float W = a.x + r, H = a.y + r;
    float dT = H - p.y, dB = H + p.y, dR = W - p.x, dL = W + p.x;
    float m = min(min(dT, dB), min(dR, dL));
    float cx = clamp(p.x, -a.x, a.x), cy = clamp(p.y, -a.y, a.y);
    if (m == dT) s = cx >= 0.0 ? cx : P + cx;
    else if (m == dR) s = a.x + qa + (a.y - cy);
    else if (m == dB) s = a.x + 2.0 * qa + 2.0 * a.y + (a.x - cx);
    else s = 3.0 * a.x + 3.0 * qa + 2.0 * a.y + (cy + a.y);
  }
  return s / P;
}
float cdist(float u, float v){ return abs(fract(u - v + 0.5) - 0.5); }

vec3 toSrgb(float L, float C, float h){
  float A = C * cos(h), B = C * sin(h);
  float l = L + 0.3963377774 * A + 0.2158037573 * B;
  float m = L - 0.1055613458 * A - 0.0638541728 * B;
  float s = L - 0.0894841775 * A - 1.2914855480 * B;
  l = l * l * l; m = m * m * m; s = s * s * s;
  vec3 lin = vec3(
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s);
  lin = clamp(lin, 0.0, 1.0);
  return mix(lin * 12.92, 1.055 * pow(lin, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, lin));
}

void main(){
  vec2 p = gl_FragCoord.xy - 0.5 * uRes;
  vec2 hs = 0.5 * uRes - vec2(uInset);
  float r = min(uRadius, min(hs.x, hs.y));
  vec2 a = hs - vec2(r);
  vec2 q = abs(p) - a;
  float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; // < 0 inside the frame
  float depth = -sd;
  if (sd > 0.5 || depth > uGlowW + 2.0) { gl_FragColor = vec4(0.0); return; } // cheap exit for the interior

  float u = perim(p, a, r);
  float drawn = 1.0 - smoothstep(0.5 * uLineP - 0.004, 0.5 * uLineP + 0.004, cdist(u, 0.0));

  float k = 0.5 - 0.5 * cos(2.0 * PI * (u - uFlow));
  vec3 col = toSrgb(mix(uLchA.x, uLchB.x, k), mix(uLchA.y, uLchB.y, k), uLchA.z + uDHue * k);

  float n = fbm(p / uRes.y * uNoiseScale + vec2(uTime * 0.07, -uTime * 0.05));

  float idle = 0.0;
  for (int j = 0; j < 6; j++) {
    if (float(j) >= uIdleN) break;
    float fj = float(j);
    float pos = fract(fj / uIdleN + uTime * 0.02 * uIdleSpeed + 0.05 * sin(uTime * 0.3 * uIdleSpeed + fj * 1.7));
    float amp = 0.5 + 0.5 * sin(uTime * 0.6 * uIdleSpeed + fj * 2.3);
    float d = cdist(u, pos) / 0.07;
    idle += amp * exp(-d * d);
  }
  idle *= 0.6 * uIdleStr;

  float pulse = 0.0;
  for (int i = 0; i < ${MAX_PULSES}; i++) {
    vec3 pl = uPulse[i];
    if (pl.z < 0.5) continue;
    // Fade in, travel, then a small flash where the twins meet on the far side.
    float amp = smoothstep(0.0, 0.08, pl.y) * (1.0 - pl.y * pl.y) + 1.2 * exp(-pow((pl.y - 0.93) / 0.05, 2.0));
    float d1 = cdist(u, fract(pl.x + 0.5 * pl.y)) / 0.025;
    float d2 = cdist(u, fract(pl.x - 0.5 * pl.y)) / 0.025;
    pulse += amp * (exp(-d1 * d1) + exp(-d2 * d2));
  }

  float energy = 1.0 + idle + 1.5 * pulse;
  float lw = uLine * uDpr;
  float lineA = (1.0 - smoothstep(0.5 * lw, 0.5 * lw + 1.0, abs(sd + 0.5 * lw))) * drawn;
  lineA *= clamp(mix(1.0, 0.55 + 0.9 * n, 0.5 * uNoise) * min(energy, 1.6), 0.0, 1.0);

  float g = pow(1.0 - clamp(depth / uGlowW, 0.0, 1.0), 2.0);
  float glowA = g * uGlow * uGlowP * mix(1.0, 0.25 + 1.5 * n, uNoise) * energy * uIntensity * drawn * 0.5;
  glowA = clamp(glowA, 0.0, 0.6);

  // Light page: inked (slightly darker) line over a tinted glow, premultiplied.
  vec3 ink = col * 0.78;
  float outA = lineA + glowA * (1.0 - lineA);
  vec3 outC = ink * lineA + col * glowA * (1.0 - lineA);
  gl_FragColor = vec4(outC, outA);
}
`

/** sRGB hex to OKLCH [L, C, h]. */
function oklch(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1, 7), 16)
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const [r, g, b] = [
    lin(((n >> 16) & 255) / 255),
    lin(((n >> 8) & 255) / 255),
    lin((n & 255) / 255),
  ]
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return [L, Math.hypot(A, B), Math.atan2(B, A)]
}

/** Same arc-length position as the shader, for click pulses. */
function perimAt(px: number, py: number, w: number, h: number, r: number) {
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
  const s =
    side === 0
      ? cx >= 0
        ? cx
        : P + cx
      : side === 1
        ? ax + qa + (ay - cy)
        : side === 2
          ? ax + 2 * qa + 2 * ay + (ax - cx)
          : 3 * ax + 3 * qa + 2 * ay + (cy + ay)
  return s / P
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
    if (!canvas || !gl) return

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
      dpr: loc('uDpr'),
      time: loc('uTime'),
      flow: loc('uFlow'),
      lineP: loc('uLineP'),
      glowP: loc('uGlowP'),
      radius: loc('uRadius'),
      line: loc('uLine'),
      inset: loc('uInset'),
      glowW: loc('uGlowW'),
      lchA: loc('uLchA'),
      lchB: loc('uLchB'),
      dHue: loc('uDHue'),
      pulse: loc('uPulse'),
    }
    gl.uniform1f(loc('uGlow'), GLOW)
    gl.uniform1f(loc('uNoise'), NOISE)
    gl.uniform1f(loc('uNoiseScale'), NOISE_SCALE)
    gl.uniform1f(loc('uIdleN'), IDLE_PULSES)
    gl.uniform1f(loc('uIdleSpeed'), IDLE_SPEED)
    gl.uniform1f(loc('uIdleStr'), IDLE_STRENGTH)
    gl.uniform1f(loc('uIntensity'), INTENSITY)

    let dpr = 1
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr))
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr))
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
        gl.viewport(0, 0, w, h)
      }
    }

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const pulses: { u: number; age: number }[] = []
    const pulseData = new Float32Array(MAX_PULSES * 3)
    let time = 0
    let flow = 0
    let boost = 1
    let near = false
    let elapsed = reduced ? LINE_DRAW_S + GLOW_IN_S : 0

    const draw = () => {
      resize()
      const [ca, cb] = colorsRef.current
      const A = oklch(ca)
      const B = oklch(cb)
      let dh = B[2] - A[2]
      if (dh > Math.PI) dh -= 2 * Math.PI
      if (dh < -Math.PI) dh += 2 * Math.PI
      pulseData.fill(0)
      pulses.forEach((p, i) =>
        pulseData.set([p.u, Math.min(1, (p.age * PULSE_SPEED) / 1.4), 1], i * 3),
      )
      gl.uniform2f(U.res, canvas.width, canvas.height)
      gl.uniform1f(U.dpr, dpr)
      gl.uniform1f(U.time, time)
      gl.uniform1f(U.flow, flow)
      gl.uniform1f(U.lineP, Math.min(1, elapsed / LINE_DRAW_S))
      gl.uniform1f(U.glowP, Math.max(0, Math.min(1, (elapsed - LINE_DRAW_S * 0.8) / GLOW_IN_S)))
      gl.uniform1f(U.radius, RADIUS * dpr)
      gl.uniform1f(U.line, LINE_WIDTH)
      gl.uniform1f(U.inset, INSET * dpr)
      gl.uniform1f(U.glowW, GLOW_WIDTH * dpr)
      gl.uniform3f(U.lchA, A[0], A[1], A[2])
      gl.uniform2f(U.lchB, B[0], B[1])
      gl.uniform1f(U.dHue, dh)
      gl.uniform3fv(U.pulse, pulseData)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }

    let raf = 0
    let last = -1
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const dt = last < 0 ? 0 : Math.min(0.1, (now - last) / 1000)
      last = now
      elapsed += dt
      time += dt
      boost += ((near ? HOVER_BOOST : 1) - boost) * (1 - Math.pow(0.92, dt * 60))
      flow += dt * 0.045 * FLOW_SPEED * boost
      for (const p of pulses) p.age += dt
      while (pulses.length && ((pulses[0]?.age ?? 0) * PULSE_SPEED) / 1.4 >= 1) pulses.shift()
      draw()
    }

    const onMove = (e: PointerEvent) => {
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      near = Math.min(e.clientX, e.clientY, w - e.clientX, h - e.clientY) < GLOW_WIDTH
    }
    const onDown = (e: PointerEvent) => {
      pulses.push({
        u: perimAt(e.clientX, e.clientY, canvas.clientWidth, canvas.clientHeight, RADIUS),
        age: 0,
      })
      if (pulses.length > MAX_PULSES) pulses.shift() // clicks stack, oldest drops
    }

    const ro = new ResizeObserver(() => !raf && draw())
    ro.observe(canvas)
    if (reduced) draw()
    else {
      window.addEventListener('pointermove', onMove, { passive: true })
      window.addEventListener('pointerdown', onDown, { passive: true })
      raf = requestAnimationFrame(frame)
    }

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', onDown)
    }
  }, [])

  return <canvas ref={canvasRef} className="frame-border" aria-hidden />
}
