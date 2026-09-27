import * as THREE from 'three';
import type { Enemy } from './Enemy';

/** 敌方武装直升机：进场后绕阵地盘旋，周期性向基地开火。 */
export class Helicopter implements Enemy {
  readonly group = new THREE.Group();
  alive = true;
  readonly radius = 2.6;
  readonly scoreValue = 150;

  private hp = 6;
  private t = 0;
  private state: 'approach' | 'patrol' = 'approach';
  private readonly patrolCenter = new THREE.Vector3(0, 23, -55);
  private angle: number;
  private fireTimer = 2.0;
  private readonly rotor: THREE.Mesh;

  /** 进入巡逻状态后开始攻击。 */
  onFire: ((from: THREE.Vector3) => void) | null = null;

  constructor(x: number, y: number, z: number) {
    this.angle = Math.atan2(z - this.patrolCenter.z, x - this.patrolCenter.x);
    this.group.position.set(x, y, z);

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3d4a3a, roughness: 0.7, metalness: 0.3 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.5, 4.2), bodyMat);
    this.group.add(body);

    const cockpit = new THREE.Mesh(
      new THREE.SphereGeometry(0.75, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x22303a, roughness: 0.3, metalness: 0.5 }),
    );
    cockpit.position.set(0, 0.25, -1.9);
    cockpit.scale.z = 1.3;
    this.group.add(cockpit);

    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 3.2), bodyMat);
    tail.position.set(0, 0.3, 3.4);
    this.group.add(tail);

    const tailFin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.0, 0.7), bodyMat);
    tailFin.position.set(0, 0.8, 4.8);
    this.group.add(tailFin);

    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.5, 6), bodyMat);
    mast.position.y = 0.95;
    this.group.add(mast);

    this.rotor = new THREE.Mesh(
      new THREE.BoxGeometry(7.2, 0.06, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x222522, roughness: 0.6 }),
    );
    this.rotor.position.y = 1.2;
    this.group.add(this.rotor);

    const skidL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 2.6), bodyMat);
    const skidR = skidL.clone();
    skidL.position.set(-0.8, -1.0, 0);
    skidR.position.set(0.8, -1.0, 0);
    this.group.add(skidL, skidR);

    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = true;
    });
  }

  update(dt: number): void {
    if (!this.alive) return;
    this.t += dt;
    this.rotor.rotation.y += dt * 30;

    if (this.state === 'approach') {
      // 飞向巡逻圈上自己角度对应的位置
      const tx = this.patrolCenter.x + Math.cos(this.angle) * 26;
      const tz = this.patrolCenter.z + Math.sin(this.angle) * 26;
      const d = this.group.position.distanceTo(this.v1.set(tx, this.patrolCenter.y, tz));
      if (d > 1) {
        this.group.position.lerp(this.v1.set(tx, this.patrolCenter.y, tz), Math.min(1, dt * 0.8));
      } else {
        this.state = 'patrol';
      }
      this.group.rotation.y = Math.atan2(
        this.group.position.x - this.patrolCenter.x,
        this.group.position.z - this.patrolCenter.z,
      );
    } else {
      this.angle += dt * 0.45;
      this.group.position.set(
        this.patrolCenter.x + Math.cos(this.angle) * 26,
        this.patrolCenter.y + Math.sin(this.t * 0.8) * 1.5,
        this.patrolCenter.z + Math.sin(this.angle) * 26,
      );
      // 机头朝切线方向
      this.group.rotation.y = Math.atan2(
        -Math.sin(this.angle),
        Math.cos(this.angle),
      ) + Math.PI / 2;
      this.group.rotation.z = 0.18; // 侧倾

      this.fireTimer -= dt;
      if (this.fireTimer <= 0) {
        this.fireTimer = 2.6 + Math.random() * 0.8;
        this.onFire?.(this.group.position);
      }
    }
  }

  takeDamage(n: number): boolean {
    if (!this.alive) return false;
    this.hp -= n;
    if (this.hp <= 0) {
      this.alive = false;
      return true;
    }
    return false;
  }

  getCenter(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.group.position);
  }

  private readonly v1 = new THREE.Vector3();
}
