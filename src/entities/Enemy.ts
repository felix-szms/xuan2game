import * as THREE from 'three';

/** 所有可被攻击实体的公共接口。 */
export interface Enemy {
  readonly group: THREE.Group;
  alive: boolean;
  readonly radius: number;
  readonly scoreValue: number;
  update(dt: number): void;
  /** 扣血，返回本次是否将其击毁。 */
  takeDamage(n: number): boolean;
  getCenter(out: THREE.Vector3): THREE.Vector3;
}
