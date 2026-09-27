import * as THREE from 'three';
import type { Enemy } from './Enemy';
import { groundHeight } from '../world/Ground';

interface Tracer {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  active: boolean;
}

/** 曳光弹池 + 弹丸-靶标球体相交检测。 */
export class ProjectileSystem {
  private pool: Tracer[] = [];
  private readonly geo = new THREE.BoxGeometry(0.07, 0.07, 1.7);
  private readonly mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(3.0, 2.0, 0.85),
    toneMapped: false,
  });
  private readonly tmp = new THREE.Vector3();
  private readonly targetCenter = new THREE.Vector3();

  constructor(
    private scene: THREE.Scene,
    private onHitTarget: (point: THREE.Vector3, enemy: Enemy) => void,
    private onSplash: (point: THREE.Vector3) => void,
  ) {}

  fire(pos: THREE.Vector3, dir: THREE.Vector3, speed = 300): void {
    let t = this.pool.find((p) => !p.active);
    if (!t) {
      if (this.pool.length >= 64) return;
      const mesh = new THREE.Mesh(this.geo, this.mat);
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      t = { mesh, vel: new THREE.Vector3(), life: 0, active: false };
      this.pool.push(t);
    }
    t.active = true;
    t.life = 2.2;
    t.mesh.visible = true;
    t.mesh.position.copy(pos);
    t.vel.copy(dir).normalize().multiplyScalar(speed);
    t.mesh.lookAt(this.tmp.copy(pos).add(dir));
  }

  update(dt: number, enemies: Enemy[]): void {
    for (const t of this.pool) {
      if (!t.active) continue;
      t.life -= dt;
      const p = t.mesh.position;
      p.addScaledVector(t.vel, dt);

      const ground = groundHeight(p.z) + 0.1;
      if (p.y < ground) {
        this.onSplash(p.clone());
        this.deactivate(t);
        continue;
      }
      let hit = false;
      for (const enemy of enemies) {
        if (!enemy.alive) continue;
        enemy.getCenter(this.targetCenter);
        if (p.distanceToSquared(this.targetCenter) < enemy.radius * enemy.radius) {
          this.onHitTarget(p.clone(), enemy);
          this.deactivate(t);
          hit = true;
          break;
        }
      }
      if (hit) continue;
      if (t.life <= 0) this.deactivate(t);
    }
  }

  private deactivate(t: Tracer): void {
    t.active = false;
    t.mesh.visible = false;
  }
}
