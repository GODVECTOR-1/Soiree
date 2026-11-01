// Shared plumbing for the canvas effects: one program over a full-screen triangle, and a frame loop that only runs
// while its element is on screen.

/** `#rrggbb` to sRGB channels in 0..1. */
export const rgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1, 7), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

/** Compiles and links `vert` + `frag`, and feeds attribute `aPos` one triangle covering the viewport. Null on failure. */
export function fullscreenProgram(gl: WebGLRenderingContext, vert: string, frag: string) {
  const prog = gl.createProgram()
  if (!prog) return null
  for (const [type, src] of [
    [gl.VERTEX_SHADER, vert],
    [gl.FRAGMENT_SHADER, frag],
  ] as const) {
    const shader = gl.createShader(type)
    if (!shader) return null
    gl.shaderSource(shader, src)
    gl.compileShader(shader)
    gl.attachShader(prog, shader)
  }
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null
  gl.useProgram(prog)
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const aPos = gl.getAttribLocation(prog, 'aPos')
  gl.enableVertexAttribArray(aPos)
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)
  return prog
}

/**
 * Each animation frame, `step(dt)` advances the state (dt in seconds, capped at 0.1) and `draw()` renders it. Runs
 * only while `el` is on screen; while paused, and always under reduced motion, a still frame is redrawn on resize.
 * Returns the cleanup.
 */
export function runLoop(
  el: Element,
  step: (dt: number) => void,
  draw: () => void,
  reducedMotion: boolean,
) {
  let raf = 0
  let last = -1
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame)
    const dt = last < 0 ? 0 : Math.min(0.1, Math.max(0, (now - last) / 1000))
    last = now
    step(dt)
    draw()
  }
  const start = () => {
    if (raf || reducedMotion) return
    last = -1
    raf = requestAnimationFrame(frame)
  }
  const stop = () => {
    cancelAnimationFrame(raf)
    raf = 0
  }
  const io = new IntersectionObserver(([entry]) => (entry?.isIntersecting ? start() : stop()))
  const ro = new ResizeObserver(() => !raf && draw())
  io.observe(el)
  ro.observe(el)
  draw()
  return () => {
    stop()
    io.disconnect()
    ro.disconnect()
  }
}
