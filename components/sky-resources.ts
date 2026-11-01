import { SKY, SKY_FRAGMENT_SHADER, SKY_TONES, SKY_VERTEX_SHADER } from '@/components/sky-shader'

// GPU resources for the sky: the program, a full-screen triangle, the grain noise texture and the fixed uniforms.

export type Resources = {
  program: WebGLProgram
  vertex: WebGLShader
  fragment: WebGLShader
  buffer: WebGLBuffer
  texture: WebGLTexture
  resolution: WebGLUniformLocation | null
  time: WebGLUniformLocation | null
  mouse: WebGLUniformLocation | null
  pointer: WebGLUniformLocation | null
}

function compile(gl: WebGLRenderingContext, kind: number, source: string): WebGLShader {
  const shader = gl.createShader(kind)
  if (!shader) throw new Error('Could not create the Sky shader.')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || 'Sky shader failed to compile.'
    gl.deleteShader(shader)
    throw new Error(message)
  }
  return shader
}

function link(gl: WebGLRenderingContext, vertex: WebGLShader, fragment: WebGLShader) {
  const program = gl.createProgram()
  if (!program) throw new Error('Could not create the Sky program.')
  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.bindAttribLocation(program, 0, 'p')
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || 'Sky program failed to link.'
    gl.deleteProgram(program)
    throw new Error(message)
  }
  gl.useProgram(program)
  return program
}

/** One triangle that covers the viewport, on attribute 0. */
function createGeometry(gl: WebGLRenderingContext) {
  const buffer = gl.createBuffer()
  if (!buffer) throw new Error('Could not create the Sky geometry.')
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
  return buffer
}

/** 256 x 256 grey noise on texture unit 0, sampled by the shader for grain. */
function createNoiseTexture(gl: WebGLRenderingContext) {
  const texture = gl.createTexture()
  if (!texture) throw new Error('Could not create the Sky noise texture.')
  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, texture)
  const noise = new Uint8Array(256 * 256 * 4)
  for (let i = 0; i < 256 * 256; i++) {
    const value = (Math.random() * 256) | 0
    noise.set([value, value, value, 255], i * 4)
  }
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 256, 0, gl.RGBA, gl.UNSIGNED_BYTE, noise)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  return texture
}

/** Uniforms that never change: noise unit, palette and the export's look settings. */
function setStaticUniforms(gl: WebGLRenderingContext, program: WebGLProgram) {
  const loc = (name: string) => gl.getUniformLocation(program, name)
  gl.uniform1i(loc('u_noise'), 0)
  gl.uniform3fv(loc('u_main'), SKY_TONES.main)
  gl.uniform3fv(loc('u_low'), SKY_TONES.low)
  gl.uniform3fv(loc('u_mid'), SKY_TONES.mid)
  gl.uniform3fv(loc('u_high'), SKY_TONES.high)
  gl.uniform1f(loc('u_nscale'), 0.35 + (SKY.scale / 100) * 1.15)
  gl.uniform1f(loc('u_warp'), (SKY.distortion / 100) * 0.47)
  gl.uniform1f(loc('u_wind'), (SKY.swirl / 100) * 0.36)
  const angle = ((SKY.direction % 4) * Math.PI) / 2
  gl.uniform2f(loc('u_dirv'), Math.cos(angle), Math.sin(angle))
}

export function release(gl: WebGLRenderingContext, r: Partial<Resources>) {
  if (r.texture) gl.deleteTexture(r.texture)
  if (r.buffer) gl.deleteBuffer(r.buffer)
  if (r.program) gl.deleteProgram(r.program)
  if (r.fragment) gl.deleteShader(r.fragment)
  if (r.vertex) gl.deleteShader(r.vertex)
}

/** Compiles, links and uploads everything the sky draws with; on any failure frees what was made and rethrows. */
export function createResources(gl: WebGLRenderingContext): Resources {
  const made: Partial<Resources> = {}
  try {
    const vertex = compile(gl, gl.VERTEX_SHADER, SKY_VERTEX_SHADER)
    made.vertex = vertex
    const fragment = compile(gl, gl.FRAGMENT_SHADER, SKY_FRAGMENT_SHADER)
    made.fragment = fragment
    const program = link(gl, vertex, fragment)
    made.program = program
    const buffer = createGeometry(gl)
    made.buffer = buffer
    const texture = createNoiseTexture(gl)
    made.texture = texture
    setStaticUniforms(gl, program)
    const loc = (name: string) => gl.getUniformLocation(program, name)
    const uniforms = {
      resolution: loc('u_res'),
      time: loc('u_t'),
      mouse: loc('u_mouse'),
      pointer: loc('u_pointer'),
    }
    return { vertex, fragment, program, buffer, texture, ...uniforms }
  } catch (error) {
    release(gl, made)
    throw error
  }
}
