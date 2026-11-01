'use client'

import { useEffect, useRef } from 'react'
import {
  devicePixels,
  fitCanvas,
  fullscreenProgram,
  listenPointer,
  prefersReducedMotion,
  rgb,
  runLoop,
} from '@/components/webgl'

// Adapted from Originkit's Mood Field with the user's presets. The shader is unchanged. Gone: Framer plumbing
// (CSS-var colour probing, prop groups, the 1200x800 minimum size). Added: the cursor is tracked over the whole
// parent (so content on top still drives the swirl), the loop stops while off screen, and visitors who prefer
// reduced motion get one still frame.

const VERT = `
attribute vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }
`

// precision highp: the fbm divides and the exp() falloff both sit near zero on
// mobile GPUs that silently downgrade mediump.
const FRAG = `
precision highp float;

uniform vec2  iResolution;
uniform vec2  iMouse;
uniform float iTime;
uniform float uEmotion;
uniform vec3  uIntense;
uniform vec3  uCalm;
uniform vec3  uBg;
uniform float uScale;
uniform float uWarp;
uniform float uRidge;
uniform float uContrast;
uniform float uReach;
uniform float uHover;
uniform float uSwirl;
uniform float uPointer;

const mat2 R2 = mat2(0.80, 0.60, -0.60, 0.80);

float hash21(vec2 p){
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float vnoise(vec2 p){
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p){
    float sum  = 0.0;
    float amp  = 0.5;
    float norm = 0.0;
    for (int i = 0; i < 4; i++){
        float v = vnoise(p);
        v = mix(v, abs(v * 2.0 - 1.0), uRidge);
        sum  += amp * v;
        norm += amp;
        p = R2 * p * 2.03 + 7.13;
        amp *= 0.5;
    }
    return sum / max(norm, 1e-4);
}

void main(){
    float h = max(iResolution.y, 1.0);
    vec2 sp = (gl_FragCoord.xy - 0.5 * iResolution) / h;
    vec2 mp = (iMouse - 0.5 * iResolution) / h;

    float reach = max(uReach / h, 1e-4);
    vec2  d = sp - mp;
    float r = length(d);
    float infl = uPointer * uHover * exp(-(r * r) / (reach * reach));

    float ang = infl * uSwirl;
    float cs = cos(ang);
    float sn = sin(ang);
    sp = mp + mat2(cs, -sn, sn, cs) * d;
    sp += d * (infl * 0.30) / max(r, 1e-3);

    float tt = iTime * mix(1.55, 0.55, uEmotion);
    vec2 p = sp * uScale;

    vec2 q = vec2(
        fbm(p + vec2(0.0, tt * 0.16)),
        fbm(p + vec2(5.2, 1.3) - vec2(tt * 0.12, 0.0))
    );
    float f = fbm(p + uWarp * q + vec2(tt * 0.05, -tt * 0.04));

    float v = pow(clamp(f, 0.0, 1.0), uContrast);
    v = clamp(v + infl * 0.22, 0.0, 1.0);

    vec3 mood = mix(uIntense, uCalm, uEmotion);
    vec3 col = mix(uBg, mood, smoothstep(0.12, 0.92, v));
    col += mood * pow(v, 5.0) * 0.9;

    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`

// The presets resolved to shader values: speed 50, density 100, warp/turbulence/contrast 100, mood "intense",
// cursor reach 260 / hover 100 / swirl 90. With mood fixed, emotion stays 0, so warp and ridge are constants.
const BG = '#05060a'
const CALM = '#2f6bff'
const SCALE = 2.2
const WARP = 1.2
const RIDGE = 0.9
const CONTRAST = 1.75
const REACH = 260
const SWIRL = Math.PI / 2
const MAX_DPR = 1.5

/** Sets the fixed uniforms and returns the locations updated every frame. */
function moodUniforms(gl: WebGLRenderingContext, prog: WebGLProgram) {
  const loc = (name: string) => gl.getUniformLocation(prog, name)
  gl.uniform1f(loc('uEmotion'), 0)
  gl.uniform3fv(loc('uCalm'), rgb(CALM))
  gl.uniform3fv(loc('uBg'), rgb(BG))
  gl.uniform1f(loc('uScale'), SCALE)
  gl.uniform1f(loc('uWarp'), WARP)
  gl.uniform1f(loc('uRidge'), RIDGE)
  gl.uniform1f(loc('uContrast'), CONTRAST)
  gl.uniform1f(loc('uHover'), 1)
  gl.uniform1f(loc('uSwirl'), SWIRL)
  return {
    res: loc('iResolution'),
    mouse: loc('iMouse'),
    time: loc('iTime'),
    intense: loc('uIntense'),
    reach: loc('uReach'),
    pointer: loc('uPointer'),
  }
}

/** Animated WebGL background that fills its positioned parent and swirls toward the cursor. */
export function MoodField({ intenseColor }: { intenseColor: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const colorRef = useRef(intenseColor)
  const redrawRef = useRef<() => void>(() => {})

  useEffect(() => {
    const canvas = canvasRef.current
    const host = canvas?.parentElement
    const gl = canvas?.getContext('webgl', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
    })
    const prog = gl && fullscreenProgram(gl, VERT, FRAG)
    if (!canvas || !host || !gl || !prog) return // no WebGL: the CSS background colour shows instead

    const u = moodUniforms(gl, prog)

    const mouse = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, presence: 0, want: 0 }
    let clock = 0
    const draw = () => {
      fitCanvas(canvas, gl, devicePixels(MAX_DPR))
      const { width: bw, height: bh } = canvas
      gl.uniform2f(u.res, bw, bh)
      gl.uniform2f(u.mouse, mouse.x * bw, (1 - mouse.y) * bh) // pointer y is top-down, gl_FragCoord.y bottom-up
      gl.uniform1f(u.time, clock)
      gl.uniform3fv(u.intense, rgb(colorRef.current))
      gl.uniform1f(u.reach, REACH * (bh / Math.max(canvas.clientHeight, 1)))
      gl.uniform1f(u.pointer, mouse.presence)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }
    redrawRef.current = draw

    const step = (dt: number) => {
      clock += dt
      const mk = 1 - Math.pow(1 - 0.18, dt * 60)
      mouse.x += (mouse.tx - mouse.x) * mk
      mouse.y += (mouse.ty - mouse.y) * mk
      mouse.presence += (mouse.want - mouse.presence) * mk
    }

    const onMove = (e: PointerEvent) => {
      const r = host.getBoundingClientRect()
      mouse.tx = (e.clientX - r.left) / Math.max(r.width, 1)
      mouse.ty = (e.clientY - r.top) / Math.max(r.height, 1)
      mouse.want = 1
    }
    const onLeave = () => (mouse.want = 0)
    const reduced = prefersReducedMotion()
    const stopPointer = reduced ? () => {} : listenPointer(host, onMove, onLeave)
    const stopLoop = runLoop(host, step, draw, reduced)

    return () => {
      stopLoop()
      stopPointer()
      redrawRef.current = () => {}
    }
  }, [])

  // Colour changes reuse the same GL context; redraw at once in case the loop is paused.
  useEffect(() => {
    colorRef.current = intenseColor
    redrawRef.current()
  }, [intenseColor])

  return <canvas ref={canvasRef} className="mood-field" aria-hidden />
}
