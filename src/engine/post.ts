// The final pass: the scene renders linear into a multisampled HDR target, then
// one full-screen shader tone-maps, grades, vignettes, adds a breath of grain,
// and handles the fades between chapters. One pass, so it is cheap on phones.

import * as THREE from 'three'

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`

const FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform float uTime;
uniform float uGrain;
uniform float uVignette;
uniform vec3 uLift;
uniform vec3 uGain;
uniform float uSat;
uniform float uExposure;
uniform vec3 uFadeColor;
uniform float uFade;
uniform vec2 uRes;
varying vec2 vUv;
float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 toSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
void main() {
  vec3 c = texture2D(tScene, vUv).rgb * uExposure;
  // soft shoulder: flat color stays true, only highlights roll off
  vec3 k = max(c - 0.75, 0.0);
  c = min(c, 0.75) + k / (1.0 + k * 1.6);
  // grade: lift the shadows toward a hue, gain the highlights toward another
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSat);
  c = c * uGain + uLift * (1.0 - smoothstep(0.0, 0.6, l));
  c = toSRGB(clamp(c, 0.0, 1.0));
  vec2 q = vUv - 0.5;
  q.x *= uRes.x / uRes.y;
  float v = smoothstep(0.95, 0.25, length(q) * 1.05);
  c *= mix(1.0, v, uVignette);
  c += (h(vUv * uRes + fract(uTime * 13.7) * 91.0) - 0.5) * uGrain;
  c = mix(c, uFadeColor, uFade);
  gl_FragColor = vec4(c, 1.0);
}
`

export class Post {
  rt: THREE.WebGLRenderTarget
  scene = new THREE.Scene()
  cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  mat: THREE.ShaderMaterial

  constructor(samples: number) {
    this.rt = new THREE.WebGLRenderTarget(4, 4, {
      type: THREE.HalfFloatType,
      samples,
      depthBuffer: true,
    })
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: this.rt.texture },
        uTime: { value: 0 },
        uGrain: { value: 0.028 },
        uVignette: { value: 0.32 },
        uLift: { value: new THREE.Vector3(0, 0, 0) },
        uGain: { value: new THREE.Vector3(1, 1, 1) },
        uSat: { value: 1 },
        uExposure: { value: 0.94 },
        uFadeColor: { value: new THREE.Color(0, 0, 0) },
        uFade: { value: 0 },
        uRes: { value: new THREE.Vector2(1, 1) },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      depthTest: false,
      depthWrite: false,
    })
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat)
    quad.frustumCulled = false
    this.scene.add(quad)
  }

  setSize(w: number, h: number) {
    this.rt.setSize(Math.max(1, Math.floor(w)), Math.max(1, Math.floor(h)))
    this.mat.uniforms.uRes.value.set(w, h)
  }

  render(gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    gl.setRenderTarget(this.rt)
    gl.render(scene, camera)
    gl.setRenderTarget(null)
    gl.render(this.scene, this.cam)
  }
}
