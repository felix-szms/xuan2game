import * as THREE from 'three';

const vertexShader = /* glsl */ `
#include <fog_pars_vertex>
uniform float uTime;
uniform float uShoreZ;
varying vec3 vNormal;
varying vec3 vWorldPos;

float waveH(vec2 w, float t) {
  return sin(w.x * 0.06 + t * 1.3) * 0.45
       + sin(w.y * 0.09 + t * 0.9) * 0.35
       + sin((w.x + w.y) * 0.15 + t * 2.1) * 0.14;
}

void main() {
  // plane 局部 (x, y) 手工映射到世界 (x, z)，z 轴即世界 up
  vec2 w = vec2(position.x, -position.y);
  // 近岸处把波浪压平，避免海浪穿透沙滩
  float depthFade = clamp((uShoreZ - w.y) / 18.0, 0.0, 1.0);
  float h = waveH(w, uTime) * depthFade;
  // 波浪起伏的解析导数 → 法线（用于高光/菲涅尔）
  float e = 0.8;
  float hx = (waveH(w + vec2(e, 0.0), uTime) * clamp((uShoreZ - w.y) / 18.0, 0.0, 1.0) - h) / e;
  float hz = (waveH(w + vec2(0.0, e), uTime) * clamp((uShoreZ - w.y - e) / 18.0, 0.0, 1.0) - h) / e;
  vNormal = normalize(vec3(-hx, 1.0, -hz));
  vWorldPos = vec3(w.x, h, w.y);
  vec4 mvPosition = viewMatrix * vec4(vWorldPos, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const fragmentShader = /* glsl */ `
#include <fog_pars_fragment>
uniform float uTime;
uniform vec3 uSunDir;
uniform float uShoreZ;
varying vec3 vNormal;
varying vec3 vWorldPos;

void main() {
  vec3 deep = vec3(0.03, 0.2, 0.4);
  vec3 shallow = vec3(0.13, 0.48, 0.62);
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorldPos);

  // 菲涅尔：掠射角混入天空色
  float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.5);
  float wmix = 0.18 + 0.10 * sin(vWorldPos.z * 0.05 + uTime * 0.8);
  vec3 c = mix(mix(deep, shallow, wmix), vec3(0.42, 0.58, 0.75), fresnel * 0.5);

  // 太阳镜面高光（高亮，交给 Bloom）
  vec3 R = reflect(-V, N);
  float spec = pow(max(dot(R, uSunDir), 0.0), 240.0);
  c += vec3(1.4, 1.25, 1.0) * spec * 2.2;

  // 近岸碎浪带：随时间向岸推进的白色浪边
  float d = uShoreZ - vWorldPos.z;
  float band = 1.0 - smoothstep(0.0, 13.0, d);
  float waveEdge = 0.55 + 0.45 * sin(d * 0.9 - uTime * 1.6 + sin(vWorldPos.x * 0.06) * 2.5);
  float foam = band * smoothstep(0.6, 0.95, waveEdge);
  c = mix(c, vec3(0.93, 0.96, 0.97), foam * 0.65);

  gl_FragColor = vec4(c, 1.0);
  #include <fog_fragment>
}
`;

export class Water {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;

  constructor(shoreZ: number, sunDir: THREE.Vector3) {
    this.mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        { uTime: { value: 0 }, uShoreZ: { value: shoreZ }, uSunDir: { value: sunDir } },
      ]),
      vertexShader,
      fragmentShader,
      fog: true,
    });
    const geo = new THREE.PlaneGeometry(1400, 1400, 140, 140);
    this.mesh = new THREE.Mesh(geo, this.mat);
    // 世界坐标在着色器内手工计算，mesh 保持恒等变换
    this.mesh.frustumCulled = false;
  }

  update(dt: number): void {
    this.mat.uniforms.uTime.value += dt;
  }
}
