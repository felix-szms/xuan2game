import * as THREE from 'three';
import type { Enemy } from '../entities/Enemy';

/** 敌人容器：生成/移除、范围伤害结算。 */
export class EnemyManager {
  readonly enemies: Enemy[] = [];
  private readonly center = new THREE.Vector3();

  constructor(
    private scene: THREE.Scene,
    private onKill: (enemy: Enemy) => void,
  ) {}

  /** 场上活跃敌人数（含驶离中的空艇）。 */
  get activeCount(): number {
    return this.enemies.length;
  }

  spawn(enemy: Enemy): void {
    this.enemies.push(enemy);
    this.scene.add(enemy.group);
  }

  update(dt: number): void {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.update(dt);
      if (!e.alive) {
        // 无声移除（撤出战场 / 随艇销毁等）
        this.scene.remove(e.group);
        this.enemies.splice(i, 1);
      }
    }
  }

  damage(enemy: Enemy, n: number): void {
    if (enemy.takeDamage(n)) {
      this.scene.remove(enemy.group);
      const i = this.enemies.indexOf(enemy);
      if (i >= 0) this.enemies.splice(i, 1);
      this.onKill(enemy);
    }
  }

  /** 以某点为中心的范围伤害（火箭弹/手雷）。 */
  aoe(point: THREE.Vector3, radius: number, dmg: number): void {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.getCenter(this.center);
      if (this.center.distanceTo(point) < radius + e.radius) {
        this.damage(e, dmg);
      }
    }
  }
}
