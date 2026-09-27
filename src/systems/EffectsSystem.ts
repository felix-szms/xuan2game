import * as THREE from 'three';

interface Burst {
  points: THREE.Points;
  vels: Float32Array;
  count: number;
  life: number;
  maxLife: number;
  gravity: number;
  active: boolean;
}

export interface BurstOptions {
  count: number;
  speed: number;
  upBias?: number;
  gravity?: number;
  life: number;
  size?: number;
}

/** 柔和圆形粒子贴图，避免粒子呈方块状。 */
let puffTexture: THREE.CanvasTexture | null = null;
function getPuffTexture(): THREE.CanvasTexture {
  if (!puffTexture) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const g = canvas.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.45, 'rgba(255,255,255,0.85)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    puffTexture = new THREE.CanvasTexture(canvas);
  }
  return puffTexture;
}

/** 粒子爆发池：命中火花、爆炸、水花共用。 */
export class EffectsSystem {
  private bursts: Burst[] = [];
  private readonly maxBursts = 10;
  private readonly particlesPerBurst = 36;

  constructor(private scene: THREE.Scene) {}

  burst(pos: THREE.Vector3, color: THREE.ColorRepresentation, opts: BurstOptions): void {
    let b = this.bursts.find((x) => !x.active);
    if (!b) {
      if (this.bursts.length >= this.maxBursts) return;
      b = this.createBurst();
    }
    const count = Math.min(opts.count, this.particlesPerBurst);
    b.active = true;
    b.life = opts.life;
    b.maxLife = opts.life;
    b.gravity = opts.gravity ?? 14;
    b.count = count;

    const mat = b.points.material as THREE.PointsMaterial;
    mat.color.set(color);
    mat.size = opts.size ?? 0.55;
    mat.opacity = 1;

    const arr = b.points.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < this.particlesPerBurst; i++) {
      if (i < count) {
        arr[i * 3] = pos.x;
        arr[i * 3 + 1] = pos.y;
        arr[i * 3 + 2] = pos.z;
        // 球形随机速度 + 向上偏置
        const a = Math.random() * Math.PI * 2;
        const ph = Math.acos(2 * Math.random() - 1);
        const s = opts.speed * (0.4 + Math.random() * 0.6);
        b.vels[i * 3] = Math.sin(ph) * Math.cos(a) * s;
        b.vels[i * 3 + 1] = Math.cos(ph) * s + (opts.upBias ?? 0);
        b.vels[i * 3 + 2] = Math.sin(ph) * Math.sin(a) * s;
      } else {
        // 多余粒子藏到远处
        arr[i * 3] = 9999;
        arr[i * 3 + 1] = 9999;
        arr[i * 3 + 2] = 9999;
      }
    }
    b.points.geometry.attributes.position.needsUpdate = true;
    b.points.visible = true;
  }

  update(dt: number): void {
    for (const b of this.bursts) {
      if (!b.active) continue;
      b.life -= dt;
      if (b.life <= 0) {
        b.active = false;
        b.points.visible = false;
        continue;
      }
      const arr = b.points.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < b.count; i++) {
        arr[i * 3] += b.vels[i * 3] * dt;
        arr[i * 3 + 1] += b.vels[i * 3 + 1] * dt;
        arr[i * 3 + 2] += b.vels[i * 3 + 2] * dt;
        b.vels[i * 3 + 1] -= b.gravity * dt;
      }
      b.points.geometry.attributes.position.needsUpdate = true;
      (b.points.material as THREE.PointsMaterial).opacity = b.life / b.maxLife;
    }
  }

  private createBurst(): Burst {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(this.particlesPerBurst * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.55,
      map: getPuffTexture(),
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    const points = new THREE.Points(geo, mat);
    points.visible = false;
    points.frustumCulled = false;
    this.scene.add(points);
    const b: Burst = {
      points,
      vels: new Float32Array(this.particlesPerBurst * 3),
      count: 0,
      life: 0,
      maxLife: 1,
      gravity: 14,
      active: false,
    };
    this.bursts.push(b);
    return b;
  }
}
