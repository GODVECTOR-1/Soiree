// Shaders for the glowing frame border (see frame-border.tsx).

/** Most click pulses alive at once; the shader loops over this many. */
export const MAX_PULSES = 6

export const FRAME_VERT = `attribute vec2 aPos; void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`

export const FRAME_FRAG = `
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
