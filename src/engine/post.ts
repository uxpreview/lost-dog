// The final passes. The scene renders linear into a multisampled HDR target
// whose alpha is a "solid" mask (the sky writes 0), then:
//
//   bloom   a soft-knee bright pass, down five halvings and back up, so the
//           sun on water, pale stone at noon and the lit windows of home glow
//   shafts  the sky near the sun, smeared radially from the sun's place on
//           screen and blocked by everything solid: light through the pines
//   grade   exposure, a soft shoulder, split tone, saturation, vignette, a
//           breath of grain, and the fades between chapters
//
// Everything is small: bloom and shafts run at half and quarter resolution.

import * as THREE from 'three'

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`

/** Bright pass: 4 taps, each weighted down by its own brightness so one hot pixel cannot flicker. */
const PREFILTER = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uThreshold;
uniform float uKnee;
varying vec2 vUv;
vec3 bright(vec3 c) {
  float l = max(c.r, max(c.g, c.b));
  float soft = clamp(l - uThreshold + uKnee, 0.0, 2.0 * uKnee);
  soft = soft * soft / (4.0 * uKnee + 1e-4);
  return c * max(soft, l - uThreshold) / max(l, 1e-4);
}
void main() {
  vec3 a = bright(min(texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb, 8.0));
  vec3 b = bright(min(texture2D(tSrc, vUv + uTexel * vec2(1.0, -1.0)).rgb, 8.0));
  vec3 c = bright(min(texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb, 8.0));
  vec3 d = bright(min(texture2D(tSrc, vUv + uTexel * vec2(1.0, 1.0)).rgb, 8.0));
  float wa = 1.0 / (1.0 + dot(a, vec3(0.3333)));
  float wb = 1.0 / (1.0 + dot(b, vec3(0.3333)));
  float wc = 1.0 / (1.0 + dot(c, vec3(0.3333)));
  float wd = 1.0 / (1.0 + dot(d, vec3(0.3333)));
  gl_FragColor = vec4((a * wa + b * wb + c * wc + d * wd) / (wa + wb + wc + wd), 1.0);
}
`

const DOWN = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSrc, vUv).rgb * 4.0;
  c += texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  c += texture2D(tSrc, vUv + uTexel * vec2(1.0, -1.0)).rgb;
  c += texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb;
  c += texture2D(tSrc, vUv + uTexel * vec2(1.0, 1.0)).rgb;
  gl_FragColor = vec4(c / 8.0, 1.0);
}
`

const UP = /* glsl */ `
uniform sampler2D tSrc;
uniform sampler2D tAdd;
uniform vec2 uTexel;
uniform float uSpread;
varying vec2 vUv;
void main() {
  vec2 o = uTexel * uSpread;
  vec3 c = texture2D(tSrc, vUv + vec2(-o.x * 2.0, 0.0)).rgb;
  c += texture2D(tSrc, vUv + vec2(o.x * 2.0, 0.0)).rgb;
  c += texture2D(tSrc, vUv + vec2(0.0, -o.y * 2.0)).rgb;
  c += texture2D(tSrc, vUv + vec2(0.0, o.y * 2.0)).rgb;
  c += texture2D(tSrc, vUv + vec2(-o.x, o.y)).rgb * 2.0;
  c += texture2D(tSrc, vUv + vec2(o.x, o.y)).rgb * 2.0;
  c += texture2D(tSrc, vUv + vec2(-o.x, -o.y)).rgb * 2.0;
  c += texture2D(tSrc, vUv + vec2(o.x, -o.y)).rgb * 2.0;
  gl_FragColor = vec4(c / 12.0 + texture2D(tAdd, vUv).rgb, 1.0);
}
`

/** Light shafts: sky near the sun, marched toward the sun's screen position. */
const RAYS = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uSun;
uniform float uAspect;
uniform float uTime;
varying vec2 vUv;
float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec2 d = (uSun - vUv);
  float jit = h(vUv * 811.0 + fract(uTime) * 7.0);
  vec3 acc = vec3(0.0);
  float wsum = 0.0;
  for (int i = 0; i < STEPS; i++) {
    float t = (float(i) + jit) / float(STEPS);
    vec2 p = vUv + d * t * 0.92;
    vec4 s = texture2D(tSrc, p);
    // only open sky counts, and most of all the sky around the sun
    vec2 q = (p - uSun) * vec2(uAspect, 1.0);
    float near = exp(-dot(q, q) * 5.0);
    float w = 1.0 - t * 0.75;
    acc += min(s.rgb, 4.0) * (1.0 - clamp(s.a, 0.0, 1.0)) * near * w;
    wsum += w;
  }
  gl_FragColor = vec4(acc / wsum, 1.0);
}
`

const FINAL = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform sampler2D tRays;
uniform float uTime;
uniform float uGrain;
uniform float uVignette;
uniform vec3 uLift;
uniform vec3 uGain;
uniform float uSat;
uniform float uExposure;
uniform float uContrast;
uniform float uBloom;
uniform float uRays;
uniform vec3 uRayColor;
uniform vec3 uFadeColor;
uniform float uFade;
uniform float uBars;
uniform vec2 uRes;
varying vec2 vUv;
float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 toSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
void main() {
  vec3 c = texture2D(tScene, vUv).rgb;
  vec3 bloom = texture2D(tBloom, vUv).rgb;
  c += bloom * uBloom;
  c += texture2D(tRays, vUv).rgb * uRayColor * uRays;
  c *= uExposure;
  // soft shoulder: flat color stays true, only highlights roll off
  vec3 k = max(c - 0.72, 0.0);
  c = min(c, 0.72) + k / (1.0 + k * 1.5);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  // a little contrast about middle grey, in luminance so hues hold
  float lc = clamp(0.5 + (l - 0.5) * uContrast, 0.0, 4.0);
  c *= l > 1e-4 ? mix(1.0, lc / l, 0.6) : 1.0;
  l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSat);
  // split tone: lift the shadows toward one hue, gain the highlights toward another
  c = c * uGain + uLift * (1.0 - smoothstep(0.0, 0.6, l));
  c = toSRGB(clamp(c, 0.0, 1.0));
  vec2 q = vUv - 0.5;
  q.x *= uRes.x / uRes.y;
  float v = smoothstep(1.05, 0.3, length(q) * 1.05);
  c *= mix(1.0, v, uVignette);
  c += (h(vUv * uRes + fract(uTime * 13.7) * 91.0) - 0.5) * uGrain;
  c = mix(c, uFadeColor, uFade);
  // the staged moments are letterboxed, the bars easing in and out
  float bar = step(vUv.y, uBars) + step(1.0 - uBars, vUv.y);
  c = mix(c, vec3(0.045, 0.04, 0.036), min(bar, 1.0));
  gl_FragColor = vec4(c, 1.0);
}
`

function target(w: number, h: number) {
  const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false })
  rt.texture.minFilter = THREE.LinearFilter
  rt.texture.magFilter = THREE.LinearFilter
  rt.texture.generateMipmaps = false
  return rt
}

export class Post {
  rt: THREE.WebGLRenderTarget
  scene = new THREE.Scene()
  cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  /** the grade and composite: every look uniform lives here */
  mat: THREE.ShaderMaterial
  private quad: THREE.Mesh
  private pre: THREE.ShaderMaterial
  private down: THREE.ShaderMaterial
  private up: THREE.ShaderMaterial
  private rays: THREE.ShaderMaterial
  private mips: THREE.WebGLRenderTarget[] = []
  private ups: THREE.WebGLRenderTarget[] = []
  private rayRT: THREE.WebGLRenderTarget
  private black: THREE.DataTexture
  private levels: number
  /** set by the game each frame: where the sun is on screen (uv), and how much of it reaches the lens */
  sunUv = new THREE.Vector2(0.5, 0.5)
  sunVisible = 0

  constructor(samples: number, quality = 1) {
    this.levels = quality > 0.7 ? 5 : 4
    this.rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples, depthBuffer: true })
    for (let i = 0; i < this.levels; i++) this.mips.push(target(2, 2))
    for (let i = 0; i < this.levels - 1; i++) this.ups.push(target(2, 2))
    this.rayRT = target(2, 2)
    this.black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1)
    this.black.needsUpdate = true
    const mk = (frag: string, uniforms: Record<string, THREE.IUniform>, defines: Record<string, string | number> = {}) =>
      new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: frag, depthTest: false, depthWrite: false, defines })
    const texel = () => ({ value: new THREE.Vector2() })
    this.pre = mk(PREFILTER, { tSrc: { value: null }, uTexel: texel(), uThreshold: { value: 0.96 }, uKnee: { value: 0.26 } })
    this.down = mk(DOWN, { tSrc: { value: null }, uTexel: texel() })
    this.up = mk(UP, { tSrc: { value: null }, tAdd: { value: null }, uTexel: texel(), uSpread: { value: 1 } })
    this.rays = mk(RAYS, { tSrc: { value: null }, uSun: { value: new THREE.Vector2() }, uAspect: { value: 1 }, uTime: { value: 0 } }, { STEPS: quality > 0.7 ? 28 : 14 })
    this.mat = mk(FINAL, {
      tScene: { value: this.rt.texture },
      tBloom: { value: null },
      tRays: { value: null },
      uTime: { value: 0 },
      uGrain: { value: 0.03 },
      uVignette: { value: 0.3 },
      uLift: { value: new THREE.Vector3(0, 0, 0) },
      uGain: { value: new THREE.Vector3(1, 1, 1) },
      uSat: { value: 1 },
      uExposure: { value: 1 },
      uContrast: { value: 1.06 },
      uBloom: { value: 0.5 },
      uRays: { value: 0 },
      uRayColor: { value: new THREE.Color(1, 1, 1) },
      uFadeColor: { value: new THREE.Color(0, 0, 0) },
      uFade: { value: 0 },
      uBars: { value: 0 },
      uRes: { value: new THREE.Vector2(1, 1) },
    })
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat)
    this.quad.frustumCulled = false
    this.scene.add(this.quad)
  }

  setSize(w: number, h: number) {
    w = Math.max(2, Math.floor(w))
    h = Math.max(2, Math.floor(h))
    this.rt.setSize(w, h)
    this.mat.uniforms.uRes.value.set(w, h)
    let mw = w
    let mh = h
    for (let i = 0; i < this.levels; i++) {
      mw = Math.max(2, Math.floor(mw / 2))
      mh = Math.max(2, Math.floor(mh / 2))
      this.mips[i].setSize(mw, mh)
      if (i < this.levels - 1) this.ups[i].setSize(mw, mh)
    }
    this.rayRT.setSize(Math.max(2, Math.floor(w / 4)), Math.max(2, Math.floor(h / 4)))
  }

  private pass(gl: THREE.WebGLRenderer, mat: THREE.ShaderMaterial, to: THREE.WebGLRenderTarget | null) {
    this.quad.material = mat
    gl.setRenderTarget(to)
    gl.render(this.scene, this.cam)
  }

  render(gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    gl.setRenderTarget(this.rt)
    gl.render(scene, camera)
    const u = this.mat.uniforms
    // bloom
    const src = this.rt.texture
    const m = this.mips
    this.pre.uniforms.tSrc.value = src
    this.pre.uniforms.uTexel.value.set(0.5 / m[0].width, 0.5 / m[0].height)
    this.pass(gl, this.pre, m[0])
    for (let i = 1; i < this.levels; i++) {
      this.down.uniforms.tSrc.value = m[i - 1].texture
      this.down.uniforms.uTexel.value.set(1 / m[i - 1].width, 1 / m[i - 1].height)
      this.pass(gl, this.down, m[i])
    }
    let acc = m[this.levels - 1].texture
    for (let i = this.levels - 2; i >= 0; i--) {
      this.up.uniforms.tSrc.value = acc
      this.up.uniforms.tAdd.value = m[i].texture
      this.up.uniforms.uTexel.value.set(1 / m[i + 1].width, 1 / m[i + 1].height)
      this.pass(gl, this.up, this.ups[i])
      acc = this.ups[i].texture
    }
    u.tBloom.value = acc
    // shafts, only while the sun is somewhere near the frame
    if (u.uRays.value * this.sunVisible > 0.004) {
      const r = this.rays.uniforms
      r.tSrc.value = src
      r.uSun.value.copy(this.sunUv)
      r.uAspect.value = this.rt.width / this.rt.height
      r.uTime.value = u.uTime.value
      this.pass(gl, this.rays, this.rayRT)
      u.tRays.value = this.rayRT.texture
    } else u.tRays.value = this.black
    const keep = u.uRays.value
    u.uRays.value = keep * this.sunVisible
    this.pass(gl, this.mat, null)
    u.uRays.value = keep
  }
}
