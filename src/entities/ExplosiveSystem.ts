import * as THREE from 'three';
import { groundHeight } from '../world/Ground';
import type { Enemy } from './Enemy';

export type ExplosiveKind = 'rocket' | 'grenade' | 'heliRocket';

interface Explosive {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  kind: ExplosiveKind;
  life: number;
  trailTimer: number;
  active: boolean;
}

const CFG: Record<ExplosiveKind, { speed: number; gravity: number; upBias: number; color: [number, number, number] }> = {
  rocket: { speed: 55, gravity: 0, upBias: 0, color: [2.6, 1.7, 0.8] },
  grenade: { speed: 26, gravity: 22, upBias: 0.4, color: [0.9, 1.1, 0.6] },
  heliRocket: { speed: 42, gravity: 0, upBias: 0, color: [2.4, 1.2, 0.6] },
};

/** 火箭弹 / 手雷 / 敌方火箭：抛射、尾烟、触发爆炸（伤害结算交给回调）。 */
export class ExplosiveSystem {
  private pool: Explosive[] = [];
  private readonly geos: Record<ExplosiveKind, THREE.BufferGeometry> = {
    rocket: new THREE.CylinderGeometry(0.09, 0.09, 0.8, 8),
    grenade: new THREE.SphereGeometry(0.14, 8, 6),
    heliRocket: new THREE.CylinderGeometry(0.09, 0.09, 0.8, 8),
  };
  private readonly tmp = new THREE.Vector3();
  private readonly maxCount = 32;

  constructor(
    private scene: THREE.Scene,
    private onExplode: (pos: THREE.Vector3, kind: ExplosiveKind) => void,
    private onTrail: (pos: THREE.Vector3) => void,
  ) {}

  launch(kind: ExplosiveKind, pos: THREE.Vector3, dir: THREE.Vector3): void {
    let e = this.pool.find((p) => !p.active && p.kind === kind);
    if (!e) {
      if (this.pool.length >= this.maxCount) return;
      const cfg = CFG[kind];
      const mesh = new THREE.Mesh(
        this.geos[kind],
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(...cfg.color),
          toneMapped: false,
        }),
      );
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      e = { mesh, vel: new THREE.Vector3(), kind, life: 0, trailTimer: 0, active: false };
      this.pool.push(e);
    }
    const cfg = CFG[kind];
    e.active = true;
    e.life = 7;
    e.trailTimer = 0;
    e.mesh.visible = true;
    e.mesh.position.copy(pos);
    e.vel.copy(dir).normalize().multiplyScalar(cfg.speed);
    if (cfg.upBias) e.vel.y += cfg.upBias * cfg.speed;
    e.mesh.lookAt(this.tmp.copy(pos).add(e.vel));
    if (kind !== 'grenade') e.mesh.rotateX(Math.PI / 2);
  }

  update(dt: number, enemies: Enemy[]): void {
    const gravity = new THREE.Vector3();
    for (const e of this.pool) {
      if (!e.active) continue;
      const cfg = CFG[e.kind];
      gravity.set(0, -cfg.gravity, 0);
      e.vel.addScaledVector(gravity, dt);
      e.mesh.position.addScaledVector(e.vel, dt);
      e.life -= dt;

      // 尾烟
      if (e.kind !== 'grenade') {
        e.trailTimer -= dt;
        if (e.trailTimer <= 0) {
          e.trailTimer = 0.05;
          this.onTrail(e.mesh.position);
        }
      }

      // 命中敌人（直接命中即爆）
      let hitEnemy = false;
      for (const en of enemies) {
        if (!en.alive) continue;
        en.getCenter(this.tmp);
        if (e.mesh.position.distanceToSquared(this.tmp) < en.radius * en.radius) {
          hitEnemy = true;
          break;
        }
      }

      const ground = groundHeight(e.mesh.position.z) + 0.15;
      if (hitEnemy || e.mesh.position.y < ground || e.life <= 0) {
        this.explode(e);
      }
    }
  }

  private explode(e: Explosive): void {
    e.active = false;
    e.mesh.visible = false;
    this.onExplode(e.mesh.position.clone(), e.kind);
  }
}
