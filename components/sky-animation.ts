import { SKY } from '@/components/sky-shader'
import { createResources, release, type Resources } from '@/components/sky-resources'

/** A tile of soft film grain for the overlay above the canvas, as a data URL (null without 2D canvas). */
export function grainDataUrl(): string | null {
  const tile = document.createElement('canvas')
  tile.width = tile.height = 256
  const context = tile.getContext('2d')
  if (!context) return null
  const image = context.createImageData(256, 256)
  for (let i = 0; i < image.data.length; i += 4) {
    const value = Math.round((Math.random() + Math.random()) * 127.5)
    image.data.set([value, value, value, 255], i)
  }
  context.putImageData(image, 0, 0)
  return tile.toDataURL()
}

/**
 * The sky's render loop. It owns the GL resources, eases the pointer, and pauses while the canvas is off screen, the
 * tab is hidden or reduced motion is on (a still frame is painted instead). A lost context hides the canvas, so the
 * CSS gradient behind it shows, and a restored one picks up again.
 */
export class SkyAnimation {
  private resources: Resources | null = null
  private frame = 0
  private last = 0
  private time: number = SKY.startTime
  private visible = true
  private lost = false
  private disposed = false
  private readonly motion = window.matchMedia('(prefers-reduced-motion: reduce)')
  private readonly ptr = { x: 0, y: 0, tx: 0, ty: 0, presence: 0, want: 0 }
  private readonly resizeObserver: ResizeObserver | null
  private readonly intersection: IntersectionObserver | null

  private constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly gl: WebGLRenderingContext,
  ) {
    canvas.addEventListener('webglcontextlost', this.onLost)
    canvas.addEventListener('webglcontextrestored', this.onRestored)
    this.resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(this.resize)
    this.resizeObserver?.observe(canvas)
    window.addEventListener('resize', this.resize)
    // The pointer is tracked on the window, so text or cards laid over the sky still steer the swirl.
    window.addEventListener('pointermove', this.onPointer, { passive: true })
    document.documentElement.addEventListener('pointerleave', this.onPointerLeave)
    this.intersection =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(this.onIntersect)
    this.intersection?.observe(canvas)
    document.addEventListener('visibilitychange', this.sync)
    this.motion.addEventListener('change', this.sync)
  }

  /** Starts the sky on `canvas`. Without WebGL the canvas is hidden and the CSS gradient shows; returns null. */
  static start(canvas: HTMLCanvasElement): SkyAnimation | null {
    const gl = canvas.getContext('webgl', { alpha: false, antialias: false })
    if (!gl) {
      canvas.style.visibility = 'hidden'
      return null
    }
    const sky = new SkyAnimation(canvas, gl)
    sky.boot()
    return sky
  }

  dispose() {
    this.disposed = true
    if (this.frame) cancelAnimationFrame(this.frame)
    this.resizeObserver?.disconnect()
    this.intersection?.disconnect()
    window.removeEventListener('resize', this.resize)
    window.removeEventListener('pointermove', this.onPointer)
    document.documentElement.removeEventListener('pointerleave', this.onPointerLeave)
    document.removeEventListener('visibilitychange', this.sync)
    this.motion.removeEventListener('change', this.sync)
    this.canvas.removeEventListener('webglcontextlost', this.onLost)
    this.canvas.removeEventListener('webglcontextrestored', this.onRestored)
    if (this.resources && !this.lost) release(this.gl, this.resources)
    this.resources = null
  }

  private boot() {
    try {
      this.resources = createResources(this.gl)
      this.resize()
      this.sync()
    } catch (error) {
      this.fail(error)
    }
  }

  private fail(error?: unknown) {
    if (error) console.warn('Sky WebGL unavailable:', error)
    this.canvas.style.visibility = 'hidden' // the CSS gradient underneath is the fallback
  }

  private paint() {
    const { canvas, gl, resources: r } = this
    if (!r || this.lost || this.disposed || canvas.width < 1 || canvas.height < 1) return
    gl.useProgram(r.program)
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.uniform2f(r.resolution, canvas.width, canvas.height)
    gl.uniform1f(r.time, this.time)
    gl.uniform2f(r.mouse, this.ptr.x, canvas.height - this.ptr.y) // pointer y is top-down, gl_FragCoord bottom-up
    gl.uniform1f(r.pointer, this.ptr.presence)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  private active() {
    return (
      !this.disposed &&
      !this.lost &&
      !!this.resources &&
      this.visible &&
      !document.hidden &&
      !this.motion.matches
    )
  }

  private tick = (now: number) => {
    this.frame = 0
    if (!this.active()) {
      this.last = 0
      return
    }
    const dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 0
    this.time += dt * (SKY.speed / 100) * SKY.flowSpeedRate
    const k = 1 - Math.pow(1 - SKY.pointerEase, dt * 60)
    const p = this.ptr
    p.x += (p.tx - p.x) * k
    p.y += (p.ty - p.y) * k
    p.presence += (p.want - p.presence) * k
    this.last = now
    this.paint()
    this.frame = requestAnimationFrame(this.tick)
  }

  /** Start or stop the loop to match `active()`; either way the current frame is painted. */
  private sync = () => {
    if (!this.active()) {
      if (this.frame) cancelAnimationFrame(this.frame)
      this.frame = 0
      this.last = 0
      this.paint()
    } else if (!this.frame) {
      this.last = 0
      this.paint()
      this.frame = requestAnimationFrame(this.tick)
    }
  }

  private resize = () => {
    const rect = this.canvas.getBoundingClientRect()
    const dpr = Math.min(3, window.devicePixelRatio || 1)
    const scale = Math.min(1, SKY.maxWidth / Math.max(1, rect.width * dpr))
    const width = Math.max(1, Math.round(rect.width * dpr * scale))
    const height = Math.max(1, Math.round(rect.height * dpr * scale))
    if (this.canvas.width !== width) this.canvas.width = width
    if (this.canvas.height !== height) this.canvas.height = height
    this.paint()
  }

  private onPointer = (e: PointerEvent) => {
    const rect = this.canvas.getBoundingClientRect()
    const inside =
      e.clientX >= rect.left &&
      e.clientX <= rect.right &&
      e.clientY >= rect.top &&
      e.clientY <= rect.bottom
    const sx = this.canvas.width / Math.max(1, rect.width)
    const p = this.ptr
    p.tx = (e.clientX - rect.left) * sx
    p.ty = (e.clientY - rect.top) * sx
    if (inside && p.presence < 0.01) {
      p.x = p.tx // enter where the pointer is, not from a corner
      p.y = p.ty
    }
    p.want = inside ? 1 : 0
  }

  private onPointerLeave = () => {
    this.ptr.want = 0
  }

  private onIntersect = ([entry]: IntersectionObserverEntry[]) => {
    this.visible = entry?.isIntersecting ?? true
    this.sync()
  }

  private onLost = (event: Event) => {
    event.preventDefault()
    this.lost = true
    this.resources = null
    if (this.frame) cancelAnimationFrame(this.frame)
    this.frame = 0
    this.last = 0
    this.fail()
  }

  private onRestored = () => {
    this.lost = false
    try {
      this.resources = createResources(this.gl)
      this.canvas.style.visibility = 'visible'
      this.resize()
      this.sync()
    } catch (error) {
      this.fail(error)
    }
  }
}
