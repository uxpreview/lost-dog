// The look. One stylized lighting model shared by everything in the world:
//   albedo from vertex colors (palette changes are data edits, not textures)
//   x (sky/ground ambient + sun through a soft terminator, masked by shadow)
//   then fog that warms toward the sun, because morning and dusk air glows.
// All materials read the same uniform objects, so the time of day is set once.

import * as THREE from 'three'

export const U = {
  uSunDir: { value: new THREE.Vector3(0.5, 0.5, 0.5).normalize() },
  uSunColor: { value: new THREE.Color(1, 1, 1) },
  uAmbSky: { value: new THREE.Color(0.5, 0.5, 0.5) },
  uAmbGround: { value: new THREE.Color(0.3, 0.3, 0.3) },
  uFogColor: { value: new THREE.Color(0.8, 0.8, 0.8) },
  uSunGlow: { value: new THREE.Color(1, 0.9, 0.7) },
  uFogNear: { value: 60 },
  uFogFar: { value: 500 },
  uTime: { value: 0 },
  uNight: { value: 0 },
  uWindow: { value: 0 },
  uSkyTop: { value: new THREE.Color(0.4, 0.6, 0.8) },
  uSkyHorizon: { value: new THREE.Color(0.9, 0.9, 0.8) },
  uStars: { value: 0 },
  uMoon: { value: 0 },
  // plan positions of the boy (xy) and the dog (zw): brush and grass part for them
  uPush: { value: new THREE.Vector4(1e5, 1e5, 1e5, 1e5) },
  // one small tiling noise texture: clouds, their shadows, the wash on the ground
  uNoise: { value: null as THREE.Texture | null },
  // clouds: xy drift (uv), z coverage 0..1, w how dark their shadows fall on the land
  uCloud: { value: new THREE.Vector4(0, 0, 0.4, 0.3) },
  uCloudLit: { value: new THREE.Color(1, 1, 1) },
  uCloudShade: { value: new THREE.Color(0.6, 0.65, 0.7) },
  // low haze: x the height it lies at, y how fast it thins with height, z amount, w the distance it gathers over
  uHaze: { value: new THREE.Vector4(0, 12, 0, 120) },
  // the walled town: center xz and radius. Inside it the ground is flagstones.
  uTown: { value: new THREE.Vector3(0, 0, 0) },
}

/**
 * A 256 px tiling noise. R: four octaves of value noise (cloud bodies), G: a
 * second independent field, B: fine speckle. Generated once, never loaded.
 */
export function makeNoiseTexture(): THREE.DataTexture {
  const N = 256
  const data = new Uint8Array(N * N * 4)
  const lattice = (seed: number, cells: number) => {
    const v = new Float32Array(cells * cells)
    let a = seed >>> 0
    for (let i = 0; i < v.length; i++) {
      a = (a + 0x6d2b79f5) >>> 0
      let t = a
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      v[i] = ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    return (x: number, y: number) => {
      const fx = (x / N) * cells
      const fy = (y / N) * cells
      const ix = Math.floor(fx)
      const iy = Math.floor(fy)
      let ux = fx - ix
      let uy = fy - iy
      ux = ux * ux * (3 - 2 * ux)
      uy = uy * uy * (3 - 2 * uy)
      const g = (i: number, j: number) => v[(((j % cells) + cells) % cells) * cells + (((i % cells) + cells) % cells)]
      return (g(ix, iy) * (1 - ux) + g(ix + 1, iy) * ux) * (1 - uy) + (g(ix, iy + 1) * (1 - ux) + g(ix + 1, iy + 1) * ux) * uy
    }
  }
  const fbmOf = (seed: number, base: number) => {
    const o = [lattice(seed, base), lattice(seed + 11, base * 2), lattice(seed + 23, base * 4), lattice(seed + 37, base * 8)]
    return (x: number, y: number) => o[0](x, y) * 0.52 + o[1](x, y) * 0.26 + o[2](x, y) * 0.14 + o[3](x, y) * 0.08
  }
  const r = fbmOf(7, 4)
  const g = fbmOf(101, 8)
  const b = lattice(977, 64)
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const k = (y * N + x) * 4
      data[k] = Math.round(Math.min(1, Math.max(0, (r(x, y) - 0.5) * 1.7 + 0.5)) * 255)
      data[k + 1] = Math.round(Math.min(1, Math.max(0, (g(x, y) - 0.5) * 1.7 + 0.5)) * 255)
      data[k + 2] = Math.round(b(x, y) * 255)
      data[k + 3] = 255
    }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.generateMipmaps = true
  tex.needsUpdate = true
  return tex
}
U.uNoise.value = makeNoiseTexture()

const VERT = /* glsl */ `
#include <common>
#include <color_pars_vertex>
#include <shadowmap_pars_vertex>
uniform float uTime;
uniform float uWind;
uniform float uWindBase;
uniform float uPushAmt;
uniform vec4 uPush;
#ifdef USE_HANG
attribute float aHang;
#endif
varying vec3 vWorldPos;
varying float vViewDist;
varying vec3 vNormalW;
void main() {
  #include <color_vertex>
  #include <beginnormal_vertex>
  #include <defaultnormal_vertex>
  #include <begin_vertex>
  #ifdef USE_WIND
  {
    // trees lean in the air above their first meters, each on its own phase
    vec3 base = vec3(0.0);
    #ifdef USE_INSTANCING
      base = instanceMatrix[3].xyz;
    #endif
    float hgt = max(transformed.y - uWindBase, 0.0);
    float ph = base.x * 0.13 + base.z * 0.17;
    float sway = sin(uTime * 1.3 + ph) * 0.6 + sin(uTime * 2.7 + ph * 1.7) * 0.25;
    transformed.x += sway * hgt * hgt * 0.004 * uWind;
    transformed.z += cos(uTime * 1.1 + ph) * hgt * hgt * 0.003 * uWind;
    // low growth parts for whoever walks through it, and springs back
    if (uWindBase < 0.5) {
      mat3 im = mat3(1.0);
      vec3 wpos = transformed;
      #ifdef USE_INSTANCING
        im = mat3(instanceMatrix);
        wpos = (instanceMatrix * vec4(transformed, 1.0)).xyz;
      #endif
      wpos = (modelMatrix * vec4(wpos, 1.0)).xyz;
      vec2 push = vec2(0.0);
      for (int i = 0; i < 2; i++) {
        vec2 who = i == 0 ? uPush.xy : uPush.zw;
        vec2 d = wpos.xz - who;
        float l = length(d);
        float r = i == 0 ? 1.5 : 1.0;
        push += (l > 0.001 ? d / l : vec2(0.0)) * smoothstep(r, 0.2, l) * (i == 0 ? 0.9 : 0.6);
      }
      vec3 wd = vec3(push.x, -length(push) * 0.35, push.y) * min(hgt, 1.6) * uPushAmt;
      // back into the instance's own frame (uniform scale: R^T d / s)
      float sc2 = dot(im[0], im[0]);
      transformed += (transpose(im) * wd) / max(sc2, 1e-4);
    }
  }
  #endif
  #ifdef USE_HANG
  {
    // washing lifts and flaps in the sea breeze, more the further it hangs
    float ph = position.x * 0.31 + position.z * 0.27;
    float f = sin(uTime * 2.4 + ph) * 0.6 + sin(uTime * 5.3 + ph * 2.1) * 0.25;
    transformed.x += f * aHang * 0.22;
    transformed.z += cos(uTime * 1.9 + ph) * aHang * 0.12;
    transformed.y += abs(f) * aHang * aHang * 0.08;
  }
  #endif
  #include <project_vertex>
  #include <worldpos_vertex>
  #include <shadowmap_vertex>
  vec4 wp = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    wp = instanceMatrix * wp;
  #endif
  wp = modelMatrix * wp;
  vWorldPos = wp.xyz;
  vViewDist = length(mvPosition.xyz);
  vec3 n = objectNormal;
  #ifdef USE_INSTANCING
    n = mat3(instanceMatrix) * n;
  #endif
  vNormalW = normalize(mat3(modelMatrix) * n);
}
`

const FRAG = /* glsl */ `
#include <common>
#include <packing>
#include <color_pars_fragment>
#include <lights_pars_begin>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uAmbSky;
uniform vec3 uAmbGround;
uniform vec3 uFogColor;
uniform vec3 uSunGlow;
uniform float uFogNear;
uniform float uFogFar;
uniform vec3 uColor;
uniform vec3 uEmissive;
uniform float uOpacity;
uniform float uWindow;
uniform float uNight;
uniform sampler2D uNoise;
uniform vec4 uCloud;
uniform vec4 uHaze;
uniform vec3 uTown;
varying vec3 vWorldPos;
varying float vViewDist;
varying vec3 vNormalW;
float h21w(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec3 albedo = uColor;
  #if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
    albedo *= vColor.rgb;
  #endif
  #ifdef DETAIL
    // the ground is painted, not printed: a slow wash across meters of it, and
    // a fine tooth close to the eye. Each facet stays one plane of light.
    float wash = texture2D(uNoise, vWorldPos.xz * 0.0105).g - 0.5;
    float tooth = texture2D(uNoise, vWorldPos.xz * 0.19).b - 0.5;
    albedo *= 1.0 + wash * 0.2 + tooth * 0.1 * (1.0 - smoothstep(10.0, 46.0, vViewDist));
    // inside the walls every street is laid stone: courses of flags, each its own tone
    float inTown = 1.0 - smoothstep(uTown.z * 0.86, uTown.z * 0.93, distance(vWorldPos.xz, uTown.xy));
    if (inTown > 0.0) {
      vec2 g = vWorldPos.xz * vec2(0.82, 1.25);
      g.x += mod(floor(g.y), 2.0) * 0.5 + h21w(vec2(floor(g.y), 3.0)) * 0.3;
      vec2 id = floor(g);
      vec2 fr = fract(g);
      float joint = smoothstep(0.0, 0.07, min(min(fr.x, 1.0 - fr.x) * 1.5, min(fr.y, 1.0 - fr.y)));
      float tone = h21w(id);
      float near = 1.0 - smoothstep(24.0, 60.0, vViewDist);
      float flat_ = smoothstep(0.75, 0.92, abs(normalize(vNormalW).y));
      albedo *= mix(1.0, mix(0.8, 1.0, joint) * (0.93 + tone * 0.13), inTown * near * flat_);
    }
  #endif
  #ifdef SMOOTH
    vec3 N = normalize(vNormalW);
  #else
    vec3 N = normalize(cross(dFdx(vWorldPos), dFdy(vWorldPos)));
  #endif
  float ndl = dot(N, uSunDir);
  float ramp = smoothstep(-0.04, 0.32, ndl);
  float sh = getShadowMask();
  // clouds cross the land: their shadows drift with them
  vec2 cuv = vWorldPos.xz * 0.00135 + uCloud.xy;
  float cl = texture2D(uNoise, cuv).r;
  float cov = mix(0.82, 0.36, uCloud.z);
  sh *= 1.0 - smoothstep(cov - 0.04, cov + 0.16, cl) * uCloud.w;
  // shadowed ground reads cooler, not just darker
  vec3 amb = mix(uAmbGround, uAmbSky, N.y * 0.5 + 0.5);
  vec3 col = albedo * (amb + uSunColor * ramp * sh);
  // bounce: sunlit ground throws its warmth up under eaves and onto shade walls
  col += albedo * uSunColor * uAmbGround * (0.12 * max(-N.y, 0.0) + 0.3 * (1.0 - abs(N.y)) * (1.0 - ramp * sh));
  vec3 V = normalize(vWorldPos - cameraPosition);
  #ifdef RIM
    // the two of them never sink into the picture: sky light catches their edges
    float rim = pow(1.0 - max(dot(N, -V), 0.0), 2.6);
    col += albedo * (uAmbSky * 1.1 + uSunColor * 0.5 * sh) * rim * 0.6;
  #endif
  col += uEmissive;
  #ifdef WINDOWS
    // vertex alpha marks window panes: dark glass by day, the warmest value in the game by night
    col = mix(col, vec3(0.95, 0.5, 0.12) * 2.4, vColor.a * uWindow);
  #endif
  float toward = pow(max(dot(V, uSunDir), 0.0), 5.0);
  float f = smoothstep(uFogNear, uFogFar, vViewDist);
  f = f * (0.6 + 0.4 * f);
  // haze lies low: over the river in the morning, among the trunks at dusk, on the sea at night
  float hz = uHaze.z * exp(-max(vWorldPos.y - uHaze.x, 0.0) / uHaze.y) * (1.0 - exp(-vViewDist / uHaze.w));
  f = 1.0 - (1.0 - f) * (1.0 - hz);
  col = mix(col, mix(uFogColor, uSunGlow, toward * 0.7), f);
  gl_FragColor = vec4(col, uOpacity);
}
`

export interface WorldMatOpts {
  color?: THREE.ColorRepresentation
  vertexColors?: boolean
  wind?: number
  /** height above which things sway: trees 1.2 m, grass and brush 0 (and they part) */
  windBase?: number
  /** how far low growth leans away from whoever walks through it (grass 1, bushes much less) */
  push?: number
  /** washing: vertices flap by their aHang attribute */
  hang?: boolean
  smooth?: boolean
  emissive?: THREE.ColorRepresentation
  windows?: boolean
  /** the ground: a painted wash and a fine tooth over the vertex colors */
  detail?: boolean
  /** characters: sky light on their edges */
  rim?: boolean
  transparent?: boolean
  opacity?: number
  side?: THREE.Side
  depthWrite?: boolean
}

export function worldMaterial(o: WorldMatOpts = {}) {
  const defines: Record<string, string> = {}
  if (o.wind) defines.USE_WIND = ''
  if (o.smooth) defines.SMOOTH = ''
  if (o.windows) defines.WINDOWS = ''
  if (o.hang) defines.USE_HANG = ''
  if (o.detail) defines.DETAIL = ''
  if (o.rim) defines.RIM = ''
  const m = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.lights,
      {
        uColor: { value: new THREE.Color(o.color ?? 0xffffff) },
        uEmissive: { value: new THREE.Color(o.emissive ?? 0x000000) },
        uOpacity: { value: o.opacity ?? 1 },
        uWind: { value: o.wind ?? 0 },
        uWindBase: { value: o.windBase ?? 1.2 },
        uPushAmt: { value: o.push ?? 1 },
      },
    ]),
    vertexShader: VERT,
    fragmentShader: FRAG,
    lights: true,
    vertexColors: !!o.vertexColors,
    transparent: !!o.transparent,
    side: o.side ?? THREE.FrontSide,
    depthWrite: o.depthWrite ?? true,
    defines,
  })
  // share the global time-of-day uniforms (merge() cloned them)
  Object.assign(m.uniforms, {
    uSunDir: U.uSunDir,
    uSunColor: U.uSunColor,
    uAmbSky: U.uAmbSky,
    uAmbGround: U.uAmbGround,
    uFogColor: U.uFogColor,
    uSunGlow: U.uSunGlow,
    uFogNear: U.uFogNear,
    uFogFar: U.uFogFar,
    uTime: U.uTime,
    uWindow: U.uWindow,
    uNight: U.uNight,
    uPush: U.uPush,
    uNoise: U.uNoise,
    uCloud: U.uCloud,
    uHaze: U.uHaze,
    uTown: U.uTown,
  })
  if (o.windows) m.vertexColors = true
  return m
}

// ---------------------------------------------------------------- water

const WATER_VERT = /* glsl */ `
uniform float uTime;
attribute float depth;
attribute float flow;
varying vec3 vWorldPos;
varying float vDepth;
varying float vFlow;
varying float vViewDist;
void main() {
  vec3 p = position;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  float w = sin(wp.x * 0.21 + uTime * 0.9) * 0.5 + sin(wp.z * 0.17 - uTime * 0.7 + wp.x * 0.05) * 0.5;
  wp.y += w * 0.09 * smoothstep(0.2, 3.0, depth);
  vWorldPos = wp.xyz;
  vDepth = depth;
  vFlow = flow;
  vec4 mv = viewMatrix * wp;
  vViewDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`

const WATER_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uAmbSky;
uniform vec3 uFogColor;
uniform vec3 uSunGlow;
uniform vec3 uSkyTop;
uniform vec3 uSkyHorizon;
uniform float uFogNear;
uniform float uFogFar;
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uFoam;
uniform float uNight;
uniform float uRiver;
uniform sampler2D uHeight;
uniform sampler2D uNoise;
uniform vec4 uCloud;
uniform vec4 uHaze;
uniform vec4 uHMap; // x0, z0, 1/cell, unused
uniform vec2 uHSize;
varying vec3 vWorldPos;
varying float vDepth;
varying float vFlow;
varying float vViewDist;
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
}
void main() {
  vec3 N = normalize(cross(dFdx(vWorldPos), dFdy(vWorldPos)));
  vec3 V = normalize(cameraPosition - vWorldPos);
  vec2 huv = ((vWorldPos.xz - uHMap.xy) * uHMap.z + 0.5) / uHSize;
  float ground = texture2D(uHeight, huv).r;
  bool inside = huv.x > 0.0 && huv.x < 1.0 && huv.y > 0.0 && huv.y < 1.0;
  float depthPx = inside ? vWorldPos.y - ground : 14.0;
  if (depthPx < -0.05) discard;
  float vDepth = max(depthPx, 0.0);
  float d = clamp(vDepth / (uRiver > 0.5 ? 1.6 : 7.0), 0.0, 1.0);
  vec3 base = mix(uShallow, uDeep, sqrt(d));
  // clouds cross the water too
  float cl = texture2D(uNoise, vWorldPos.xz * 0.00135 + uCloud.xy).r;
  float cov = mix(0.82, 0.36, uCloud.z);
  float sh = 1.0 - smoothstep(cov - 0.04, cov + 0.16, cl) * uCloud.w;
  // light on the water: ambient sky plus the sun on the facets
  vec3 col = base * (uAmbSky * 1.3 + uSunColor * 0.5 * sh * max(dot(N, uSunDir), 0.0) + 0.05);
  // toward the horizon the water gives the sky back
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.5);
  vec3 skyRef = mix(uSkyHorizon, uSkyTop, 0.35);
  col = mix(col, skyRef * (0.75 + 0.2 * sh), fres * 0.6);
  // the swell, drawn: slow pale lines riding in on the sea, short ones on the river
  float near = 1.0 - smoothstep(60.0, 260.0, vViewDist);
  if (uRiver < 0.5) {
    vec2 sw = vWorldPos.xz * vec2(0.012, 0.05) + vec2(uTime * 0.004, -uTime * 0.021);
    float band = texture2D(uNoise, sw).g + texture2D(uNoise, sw * 2.3 + 0.4).r * 0.35;
    float line = smoothstep(0.035, 0.0, abs(fract(band * 4.0) - 0.5) - 0.44) ;
    col += (uAmbSky * 0.5 + uSunColor * 0.5 * sh) * line * 0.2 * near * smoothstep(0.4, 2.5, vDepth);
  }
  // glitter: a path of sparkles toward the sun or moon
  vec3 R = reflect(-V, N);
  float sp = pow(max(dot(R, uSunDir), 0.0), 180.0);
  vec2 q = vWorldPos.xz * 1.3 + vec2(uTime * 0.25, -uTime * 0.18);
  float sparkle = step(0.82, vn(q * 2.1)) * step(0.6, vn(q * 0.7 + 3.1));
  float path = pow(max(dot(R, uSunDir), 0.0), 16.0);
  col += uSunColor * sh * (sp * 2.6 + sparkle * path * (1.6 + uNight * 2.6));
  // flow lines on rivers, lapping foam at the shore
  if (uRiver > 0.5) {
    float streak = smoothstep(0.78, 0.95, vn(vec2(vFlow * 0.35 - uTime * 0.9, vWorldPos.x * 0.4 + vWorldPos.z * 0.4)));
    col = mix(col, uFoam * (uAmbSky + uSunColor * 0.6 * sh), streak * 0.4 * (1.0 - d * 0.5));
  }
  vec3 foamC = uFoam * (uAmbSky + uSunColor * 0.75 * sh);
  float wob = texture2D(uNoise, vWorldPos.xz * 0.02).g;
  float edge = 1.0 - smoothstep(0.0, uRiver > 0.5 ? 0.18 : 0.5, vDepth);
  float lap = 0.5 + 0.5 * sin(uTime * 1.4 - vDepth * 9.0 + wob * 9.0);
  col = mix(col, foamC, edge * (0.4 + 0.5 * lap));
  if (uRiver < 0.5) {
    // a second, slower line of foam that runs up the beach and slides back
    float run = 0.9 + 0.7 * sin(uTime * 0.55 + wob * 7.0);
    float line2 = smoothstep(0.16, 0.0, abs(vDepth - run)) * smoothstep(2.2, 0.3, vDepth);
    col = mix(col, foamC, line2 * 0.55);
  }
  float alpha = mix(0.3, 0.97, smoothstep(0.0, uRiver > 0.5 ? 0.9 : 2.5, vDepth));
  alpha = max(alpha, edge * 0.8);
  float toward = pow(max(dot(-V, uSunDir), 0.0), 5.0);
  float f = smoothstep(uFogNear, uFogFar, vViewDist);
  f = 1.0 - (1.0 - f) * (1.0 - f);
  float hz = uHaze.z * exp(-max(vWorldPos.y - uHaze.x, 0.0) / uHaze.y) * (1.0 - exp(-vViewDist / uHaze.w));
  f = 1.0 - (1.0 - f) * (1.0 - hz);
  col = mix(col, mix(uFogColor, uSunGlow, toward * 0.7), f);
  gl_FragColor = vec4(col, mix(alpha, 1.0, f));
}
`

export const HeightMap = {
  uHeight: { value: null as THREE.Texture | null },
  uHMap: { value: new THREE.Vector4() },
  uHSize: { value: new THREE.Vector2(1, 1) },
}

export function waterMaterial(shallow: string, deep: string, river: boolean) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...U,
      ...HeightMap,
      uShallow: { value: new THREE.Color(shallow) },
      uDeep: { value: new THREE.Color(deep) },
      uFoam: { value: new THREE.Color('#F4F1E6') },
      uRiver: { value: river ? 1 : 0 },
    },
    vertexShader: WATER_VERT,
    fragmentShader: WATER_FRAG,
    transparent: true,
    depthWrite: false,
  })
}

// ---------------------------------------------------------------- falling water

/** A cascade down a rock face: white streaks running down a ribbon laid on the land. uv.y is meters along the fall. */
export function fallsMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { ...U, uShallow: { value: new THREE.Color('#8CC2B2') } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying float vViewDist;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vec4 mv = viewMatrix * wp;
        vViewDist = length(mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform sampler2D uNoise;
      uniform vec3 uShallow;
      uniform vec3 uAmbSky;
      uniform vec3 uSunColor;
      uniform vec3 uFogColor;
      uniform float uFogNear;
      uniform float uFogFar;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying float vViewDist;
      void main() {
        // long streaks running down, and a quicker finer set over them
        float a = texture2D(uNoise, vec2(vUv.x * 0.9, vUv.y * 0.022 - uTime * 0.5)).g;
        float b = texture2D(uNoise, vec2(vUv.x * 2.6 + 0.3, vUv.y * 0.06 - uTime * 0.95)).r;
        float body = a * 0.55 + b * 0.55;
        float streak = smoothstep(0.42, 0.66, body);
        // ragged at the sides, torn through the middle: falling water, not a sheet
        float side = min(vUv.x, 1.0 - vUv.x);
        float edge = smoothstep(0.02, 0.2 + 0.22 * b, side);
        float torn = smoothstep(0.3, 0.46, body);
        vec3 col = mix(uShallow * 1.15, vec3(0.98, 0.99, 0.97), 0.6 + 0.4 * streak) * (uAmbSky * 1.7 + uSunColor * 0.5 + 0.1);
        float alpha = edge * torn * mix(0.75, 1.0, streak);
        float f = smoothstep(uFogNear, uFogFar, vViewDist);
        col = mix(col, uFogColor, f * (0.6 + 0.4 * f));
        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
}

// ---------------------------------------------------------------- sky

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}
`
const SKY_FRAG = /* glsl */ `
uniform vec3 uSkyTop;
uniform vec3 uSkyHorizon;
uniform vec3 uFogColor;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSunGlow;
uniform float uStars;
uniform float uMoon;
uniform float uTime;
uniform sampler2D uNoise;
uniform vec4 uCloud;
uniform vec3 uCloudLit;
uniform vec3 uCloudShade;
uniform vec4 uHaze;
varying vec3 vDir;
float h31(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float field(vec2 p) {
  return texture2D(uNoise, p).r * 0.72 + texture2D(uNoise, p * 2.7 + 0.31).g * 0.28;
}
void main() {
  vec3 d = normalize(vDir);
  float t = clamp(d.y, -1.0, 1.0);
  vec3 col = mix(uSkyHorizon, uSkyTop, pow(max(t, 0.0), 0.5));
  float cs = dot(d, uSunDir);
  float up = 1.0 - smoothstep(-0.02, -0.06, uSunDir.y);
  // the light gathers round the sun: a wide warm breath, then a tight halo
  float wide = pow(max(cs, 0.0), 6.0);
  float tight = pow(max(cs, 0.0), 90.0);
  col += uSunGlow * (wide * 0.15 + tight * 0.5) * (1.0 - uMoon * 0.55) * up;

  // stars: a fixed field in direction space, a few of them large, all breathing
  if (uStars > 0.0 && t > 0.0) {
    vec3 g = floor(d * 260.0);
    vec3 fc = fract(d * 260.0) - 0.5;
    float r = h31(g);
    float big = step(0.9993, r);
    float star = step(0.9938, r) * smoothstep(0.0, 0.22, t) * smoothstep(0.34 + big * 0.12, 0.04, length(fc));
    float tw = 0.62 + 0.38 * sin(uTime * (0.8 + r * 3.0) + r * 40.0);
    vec3 tint = mix(vec3(0.82, 0.9, 1.0), vec3(1.0, 0.94, 0.8), step(0.5, fract(r * 91.7)));
    col += tint * star * tw * uStars * (0.75 + big * 1.6);
    // and the faint river of them overhead
    float band = exp(-pow(dot(d, normalize(vec3(0.55, 0.25, -0.8))), 2.0) * 9.0);
    col += vec3(0.5, 0.58, 0.8) * band * texture2D(uNoise, d.xz * 1.6 + d.y).g * 0.07 * uStars * smoothstep(0.0, 0.3, t);
  }

  // sun by day; by night the same light is the moon, larger and nearer
  float sunDisc = smoothstep(0.99935, 0.99962, cs);
  float moonDisc = smoothstep(0.99855, 0.99875, cs);
  vec3 seas = vec3(texture2D(uNoise, (d.xy + d.z) * 9.0).r);
  vec3 moonC = vec3(0.95, 0.97, 1.0) * (1.25 + 0.5 * smoothstep(0.35, 0.65, seas));
  col = mix(col, uSunGlow * 3.2, sunDisc * (1.0 - uMoon) * up);
  col += vec3(0.6, 0.7, 0.95) * pow(max(cs, 0.0), 420.0) * 0.6 * uMoon * up;
  col = mix(col, moonC, moonDisc * uMoon * up);

  // clouds: flat-bottomed heaps on a plane overhead, two tones, lit from the sun's side
  if (uCloud.z > 0.01 && t > -0.02) {
    vec2 p = d.xz / (max(t, 0.0) + 0.14);
    vec2 uv = p * vec2(0.1, 0.15) + uCloud.xy * 6.0;
    float n = texture2D(uNoise, uv).r;
    float det = texture2D(uNoise, uv * 3.1 + 0.37).g - 0.5;
    float fine = texture2D(uNoise, uv * 9.0).g - 0.5;
    float body = n + det * 0.2 + fine * 0.06;
    float cov = mix(0.9, 0.44, uCloud.z);
    float m = smoothstep(cov, cov + 0.035, body);
    vec2 sd = normalize(uSunDir.xz + vec2(1e-4));
    float n2 = texture2D(uNoise, uv + sd * 0.03).r + (texture2D(uNoise, (uv + sd * 0.03) * 3.1 + 0.37).g - 0.5) * 0.2;
    // thicker toward the sun means in its own shade; thinner means lit. Two tones, one soft step.
    float lit = smoothstep(-0.012, 0.03, n + det * 0.2 - n2);
    lit = max(lit, pow(max(cs, 0.0), 6.0) * 0.8);
    vec3 cc = mix(uCloudShade, uCloudLit, 0.25 + 0.75 * lit);
    // the edge nearest the sun burns
    cc += uSunGlow * pow(max(cs, 0.0), 24.0) * (1.0 - smoothstep(cov, cov + 0.16, body)) * 1.1 * up;
    m *= smoothstep(0.015, 0.16, t);
    // high thin streaks near the horizon, to hold the evening's color
    float streak = texture2D(uNoise, vec2(p.x * 0.018 + uCloud.x * 2.0, p.y * 0.11)).g;
    float sm = smoothstep(0.6, 0.72, streak) * smoothstep(0.02, 0.1, t) * (1.0 - smoothstep(0.2, 0.5, t)) * uCloud.z * 0.5;
    col = mix(col, mix(uCloudShade, uCloudLit, 0.85), sm);
    // far clouds take the color of the air they are seen through
    cc = mix(cc, mix(uSkyHorizon, cc, 0.55), 1.0 - smoothstep(0.02, 0.3, t));
    col = mix(col, cc, m);
  }
  // the horizon dissolves into the air
  float hz = smoothstep(0.1 + uHaze.z * 0.22, -0.04, t);
  col = mix(col, mix(uFogColor, uSunGlow, pow(max(cs, 0.0), 5.0) * 0.7), hz);
  // alpha 0 marks open sky for the light shafts
  gl_FragColor = vec4(col, 0.0);
}
`

export function skyMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: true,
  })
}

// ---------------------------------------------------------------- prints (decals that fade)

const PRINT_VERT = /* glsl */ `
attribute float aBorn;
attribute float aLife;
uniform float uTime;
varying float vA;
varying vec2 vUv;
varying float vViewDist;
void main() {
  vUv = uv;
  float age = uTime - aBorn;
  vA = (1.0 - smoothstep(aLife * 0.55, aLife, age)) * smoothstep(0.0, 0.25, age) * step(0.0, aBorn);
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  vViewDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`
const PRINT_FRAG = /* glsl */ `
uniform vec3 uInk;
uniform float uFogNear;
uniform float uFogFar;
varying float vA;
varying vec2 vUv;
varying float vViewDist;
float disc(vec2 p, vec2 c, float r) { return 1.0 - smoothstep(r * 0.75, r, length(p - c)); }
void main() {
  vec2 p = vUv;
  float a;
  #ifdef PAW
    a = disc(p, vec2(0.5, 0.38), 0.24);
    a = max(a, disc(p, vec2(0.24, 0.66), 0.11));
    a = max(a, disc(p, vec2(0.41, 0.8), 0.11));
    a = max(a, disc(p, vec2(0.59, 0.8), 0.11));
    a = max(a, disc(p, vec2(0.76, 0.66), 0.11));
  #else
    vec2 q = (p - 0.5) * vec2(2.2, 1.0);
    a = 1.0 - smoothstep(0.34, 0.46, length(q - vec2(0.0, 0.12)) * 1.0);
    a = max(a, 1.0 - smoothstep(0.2, 0.3, length(q + vec2(0.0, 0.26))));
  #endif
  float f = smoothstep(uFogNear, uFogFar, vViewDist);
  // a print is a darkening of the ground, so it reads in any light
  gl_FragColor = vec4(uInk * 0.35, a * vA * 0.42 * (1.0 - f));
  if (gl_FragColor.a < 0.01) discard;
}
`

export function printMaterial(paw: boolean) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: U.uTime,
      uFogNear: U.uFogNear,
      uFogFar: U.uFogFar,
      uInk: { value: new THREE.Color('#5A4632') },
    },
    vertexShader: PRINT_VERT,
    fragmentShader: PRINT_FRAG,
    defines: paw ? { PAW: '' } : {},
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  })
}

// ---------------------------------------------------------------- glow sprites (eyes, rings)

export function glowMaterial(color: string, additive = true) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uAlpha: { value: 1 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uAlpha; varying vec2 vUv;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float a = pow(max(1.0 - d, 0.0), 2.2);
        gl_FragColor = vec4(uColor * a * uAlpha, a * uAlpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  })
}
