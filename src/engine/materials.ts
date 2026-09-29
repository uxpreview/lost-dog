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
}

const VERT = /* glsl */ `
#include <common>
#include <color_pars_vertex>
#include <shadowmap_pars_vertex>
uniform float uTime;
uniform float uWind;
uniform float uWindBase;
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
      vec3 wd = vec3(push.x, -length(push) * 0.35, push.y) * min(hgt, 1.6);
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
varying vec3 vWorldPos;
varying float vViewDist;
varying vec3 vNormalW;
void main() {
  vec3 albedo = uColor;
  #if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
    albedo *= vColor.rgb;
  #endif
  #ifdef SMOOTH
    vec3 N = normalize(vNormalW);
  #else
    vec3 N = normalize(cross(dFdx(vWorldPos), dFdy(vWorldPos)));
  #endif
  float ndl = dot(N, uSunDir);
  float ramp = smoothstep(-0.04, 0.32, ndl);
  float sh = getShadowMask();
  // shadowed ground reads cooler, not just darker
  vec3 amb = mix(uAmbGround, uAmbSky, N.y * 0.5 + 0.5);
  vec3 col = albedo * (amb + uSunColor * ramp * sh);
  // a little bounce from sunlit ground onto shadow sides
  col += albedo * uSunColor * 0.06 * max(-N.y, 0.0);
  col += uEmissive;
  #ifdef WINDOWS
    // vertex alpha marks window panes: dark glass by day, the warmest value in the game by night
    col = mix(col, vec3(0.95, 0.5, 0.12) * 1.05, vColor.a * uWindow);
  #endif
  vec3 V = normalize(vWorldPos - cameraPosition);
  float toward = pow(max(dot(V, uSunDir), 0.0), 5.0);
  float f = smoothstep(uFogNear, uFogFar, vViewDist);
  f = f * (0.6 + 0.4 * f);
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
  /** washing: vertices flap by their aHang attribute */
  hang?: boolean
  smooth?: boolean
  emissive?: THREE.ColorRepresentation
  windows?: boolean
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
  const m = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.lights,
      {
        uColor: { value: new THREE.Color(o.color ?? 0xffffff) },
        uEmissive: { value: new THREE.Color(o.emissive ?? 0x000000) },
        uOpacity: { value: o.opacity ?? 1 },
        uWind: { value: o.wind ?? 0 },
        uWindBase: { value: o.windBase ?? 1.2 },
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
uniform float uFogNear;
uniform float uFogFar;
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uFoam;
uniform float uNight;
uniform float uRiver;
uniform sampler2D uHeight;
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
  // light on the water: ambient sky plus the sun on the facets
  vec3 col = base * (uAmbSky * 1.35 + uSunColor * 0.45 * max(dot(N, uSunDir), 0.0) + 0.06);
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  col = mix(col, uAmbSky * 1.25 + uFogColor * 0.2, fres * 0.45);
  // glitter: a path of sparkles toward the sun or moon
  vec3 R = reflect(-V, N);
  float sp = pow(max(dot(R, uSunDir), 0.0), 180.0);
  vec2 q = vWorldPos.xz * 1.3 + vec2(uTime * 0.25, -uTime * 0.18);
  float sparkle = step(0.82, vn(q * 2.1)) * step(0.6, vn(q * 0.7 + 3.1));
  float path = pow(max(dot(R, uSunDir), 0.0), 18.0);
  col += uSunColor * (sp * 2.2 + sparkle * path * (1.2 + uNight * 2.0));
  // flow lines on rivers, lapping foam at the shore
  if (uRiver > 0.5) {
    float streak = smoothstep(0.78, 0.95, vn(vec2(vFlow * 0.35 - uTime * 0.9, vWorldPos.x * 0.4 + vWorldPos.z * 0.4)));
    col = mix(col, uFoam * (uAmbSky + uSunColor * 0.6), streak * 0.35 * (1.0 - d * 0.5));
  }
  float edge = 1.0 - smoothstep(0.0, uRiver > 0.5 ? 0.18 : 0.55, vDepth);
  float lap = 0.5 + 0.5 * sin(uTime * 1.4 - vDepth * 9.0 + vn(vWorldPos.xz * 0.2) * 6.0);
  col = mix(col, uFoam * (uAmbSky + uSunColor * 0.7), edge * (0.35 + 0.45 * lap));
  float alpha = mix(0.35, 0.97, smoothstep(0.0, uRiver > 0.5 ? 0.9 : 2.5, vDepth));
  float toward = pow(max(dot(-V, uSunDir), 0.0), 5.0);
  float f = smoothstep(uFogNear, uFogFar, vViewDist);
  f = 1.0 - (1.0 - f) * (1.0 - f);
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
varying vec3 vDir;
float h31(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
void main() {
  vec3 d = normalize(vDir);
  float t = clamp(d.y, -1.0, 1.0);
  vec3 col = mix(uSkyHorizon, uSkyTop, pow(max(t, 0.0), 0.55));
  col = mix(col, uFogColor, smoothstep(0.08, -0.04, t));
  float cs = dot(d, uSunDir);
  // sun (day) or moon (night) share the light direction
  float disc = smoothstep(0.99955, 0.99975, cs);
  float glow = pow(max(cs, 0.0), 12.0) * 0.35 + pow(max(cs, 0.0), 120.0) * 0.5;
  vec3 sunC = mix(uSunGlow * 1.4, vec3(0.93, 0.95, 1.0) * 1.2, uMoon);
  col += uSunGlow * glow * (1.0 - uMoon * 0.7);
  col = mix(col, sunC, disc * (1.0 - smoothstep(-0.02, -0.06, uSunDir.y)));
  // stars: a fixed field in direction space, twinkling a little
  if (uStars > 0.0 && t > 0.0) {
    vec3 g = floor(d * 320.0);
    vec3 fc = fract(d * 320.0) - 0.5;
    float r = h31(g);
    float star = step(0.9955, r) * smoothstep(0.0, 0.25, t) * smoothstep(0.32, 0.06, length(fc));
    float tw = 0.6 + 0.4 * sin(uTime * (1.0 + r * 3.0) + r * 40.0);
    col += vec3(0.85, 0.9, 1.0) * star * tw * uStars * 0.9;
  }
  gl_FragColor = vec4(col, 1.0);
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
