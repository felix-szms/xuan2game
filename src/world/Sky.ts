import * as THREE from 'three';

const SUN_DIR = new THREE.Vector3(-0.42, 0.58, -0.7).normalize();

const skyVertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const skyFragment = /* glsl */ `
uniform vec3 uSunDir;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = max(d.y, 0.0);
  vec3 horizon = vec3(0.60, 0.73, 0.85);
  vec3 zenith = vec3(0.09, 0.30, 0.64);
  vec3 c = mix(horizon, zenith, pow(h, 0.5));
  float sunAmt = max(dot(d, uSunDir), 0.0);
  // 太阳圆盘（高亮，交给 Bloom 泛光）+ 大范围光晕
  c += vec3(1.6, 1.35, 0.95) * pow(sunAmt, 800.0) * 3.0;
  c += vec3(1.0, 0.82, 0.55) * pow(sunAmt, 28.0) * 0.16;
  gl_FragColor = vec4(c, 1.0);
}
`;

/** 天空穹顶（渐变 + 太阳）与漂浮的云。 */
export class Sky {
  private mat: THREE.ShaderMaterial;
  private clouds: THREE.Sprite[] = [];

  readonly sunDir = SUN_DIR;

  constructor(scene: THREE.Scene) {
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uSunDir: { value: SUN_DIR } },
      vertexShader: skyVertex,
      fragmentShader: skyFragment,
      side: THREE.BackSide,
      depthWrite: false,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), this.mat);
    dome.frustumCulled = false;
    scene.add(dome);

    // ---------- 云 ----------
    const cloudTex = makeCloudTexture();
    const rand = mulberry32(20260927);
    for (let i = 0; i < 9; i++) {
      const mat = new THREE.SpriteMaterial({
        map: cloudTex,
        transparent: true,
        opacity: 0.55 + rand() * 0.3,
        depthWrite: false,
      });
      const s = new THREE.Sprite(mat);
      const dist = 320 + rand() * 260;
      const a = rand() * Math.PI * 2;
      s.position.set(Math.cos(a) * dist, 95 + rand() * 90, Math.sin(a) * dist);
      const w = 110 + rand() * 110;
      s.scale.set(w, w * (0.32 + rand() * 0.12), 1);
      s.renderOrder = -1;
      this.clouds.push(s);
      scene.add(s);
    }
  }

  update(dt: number): void {
    for (const c of this.clouds) c.position.x += dt * 1.2;
  }
}

function makeCloudTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const g = canvas.getContext('2d')!;
  const blob = (x: number, y: number, r: number, a: number) => {
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(255,255,255,${a})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 128);
  };
  blob(128, 70, 58, 0.9);
  blob(90, 78, 42, 0.75);
  blob(168, 78, 46, 0.75);
  blob(128, 90, 70, 0.5);
  blob(60, 86, 30, 0.4);
  blob(196, 86, 32, 0.4);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
