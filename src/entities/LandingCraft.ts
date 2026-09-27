import * as THREE from 'three';
import type { Enemy } from './Enemy';

/** 敌方登陆艇：从远海驶向海滩，卸载步兵后撤离。 */
export class LandingCraft implements Enemy {
  readonly group = new THREE.Group();
  alive = true;
  readonly radius = 3.4;
  readonly scoreValue = 200;

  private hp = 10;
  private state: 'approach' | 'unloading' | 'retreat' = 'approach';
  private t = Math.random() * 10;
  private unloadTimer = 0;
  private unloaded = 0;

  constructor(
    x: number,
    private readonly unloadX: number,
    private readonly soldierCount: number,
    private readonly spawnSoldier: (x: number, z: number) => void,
  ) {
    this.group.position.set(x, 0, -170);

    const hullMat = new THREE.MeshStandardMaterial({ color: 0x5a6068, roughness: 0.8, metalness: 0.25 });
    const hull = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1.6, 7.5), hullMat);
    hull.position.y = 0.8;
    this.group.add(hull);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.2, 1.8), hullMat);
    cabin.position.set(0, 2.1, 2.4);
    this.group.add(cabin);

    // 前部跳板
    const ramp = new THREE.Mesh(
      new THREE.BoxGeometry(3.6, 0.12, 2.2),
      new THREE.MeshStandardMaterial({ color: 0x777d85, roughness: 0.8 }),
    );
    ramp.position.set(0, 0.75, -4.4);
    ramp.rotation.x = -0.25;
    this.group.add(ramp);

    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = true;
    });
  }

  update(dt: number): void {
    if (!this.alive) return;
    this.t += dt;
    const p = this.group.position;

    if (this.state === 'approach') {
      const dz = -5 - p.z;
      const step = 7 * dt;
      if (Math.abs(dz) > step) {
        p.z += Math.sign(dz) * step;
        p.x += Math.sign(this.unloadX - p.x) * Math.min(1.5 * dt, Math.abs(this.unloadX - p.x));
      } else {
        p.z = -5;
        this.state = 'unloading';
        this.unloadTimer = 0.4;
      }
    } else if (this.state === 'unloading') {
      this.unloadTimer -= dt;
      if (this.unloadTimer <= 0) {
        if (this.unloaded < this.soldierCount) {
          this.spawnSoldier(this.unloadX + (Math.random() - 0.5) * 3.5, -3.5 + Math.random() * 1.5);
          this.unloaded++;
          this.unloadTimer = 0.45;
        } else {
          this.state = 'retreat';
        }
      }
    } else {
      p.z -= 9 * dt;
      if (p.z < -175) {
        this.alive = false;
      }
    }

    // 海浪起伏
    p.y = Math.sin(this.t * 1.1) * 0.12;
    this.group.rotation.x = Math.sin(this.t * 0.9) * 0.03;
    // 卸载/撤离时艇头朝向
    this.group.rotation.y = this.state === 'retreat' ? Math.PI : 0;
  }

  takeDamage(n: number): boolean {
    if (!this.alive || this.state === 'retreat') return false;
    this.hp -= n;
    if (this.hp <= 0) {
      this.alive = false;
      return true;
    }
    return false;
  }

  getCenter(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.group.position).setY(this.group.position.y + 1.0);
  }
}
