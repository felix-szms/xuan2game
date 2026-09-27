import * as THREE from 'three';
import type { Enemy } from './Enemy';
import { groundHeight } from '../world/Ground';
import { BASE_Z } from '../world/Terrain';

/** 敌方步兵：登陆后冲向阵地，在近距离开火攻击基地。 */
export class Soldier implements Enemy {
  readonly group = new THREE.Group();
  alive = true;
  readonly radius = 1.0;
  readonly scoreValue = 50;

  private readonly stopPoint = new THREE.Vector3(0, 0, BASE_Z - 11.5);
  private readonly muzzle = new THREE.Vector3();
  private t = Math.random() * 10;
  private fireTimer = 2.5 + Math.random() * 1.5;
  private state: 'run' | 'fire' = 'run';
  private hp = 2;

  private readonly legL: THREE.Mesh;
  private readonly legR: THREE.Mesh;
  private readonly torso: THREE.Group;
  private readonly flash: THREE.Mesh;

  constructor(x: number, z: number, private readonly speed: number, private readonly onShoot: (from: THREE.Vector3) => void) {
    this.group.position.set(x, groundHeight(z), z);
    // 每个步兵在阵地前散开站位，避免扎堆被一锅端
    this.stopPoint.set((Math.random() - 0.5) * 12, 0, BASE_Z - 11.5 + (Math.random() - 0.5) * 3);

    const uniform = new THREE.MeshStandardMaterial({ color: 0x4d5c3d, roughness: 0.9 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x39442e, roughness: 0.9 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xc9a17a, roughness: 0.9 });
    const metal = new THREE.MeshStandardMaterial({ color: 0x26282a, roughness: 0.55, metalness: 0.4 });

    // ---------- 腿（髋部为轴心，便于摆动） ----------
    const legGeo = new THREE.BoxGeometry(0.14, 0.66, 0.16);
    legGeo.translate(0, -0.33, 0);
    this.legL = new THREE.Mesh(legGeo, uniform);
    this.legR = new THREE.Mesh(legGeo, uniform);
    this.legL.position.set(-0.11, 0.66, 0);
    this.legR.position.set(0.11, 0.66, 0);
    this.legL.castShadow = true;
    this.legR.castShadow = true;
    this.group.add(this.legL, this.legR);

    // ---------- 上半身 ----------
    this.torso = new THREE.Group();
    this.torso.position.y = 0.62;
    this.group.add(this.torso);

    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.58, 0.24), uniform);
    chest.position.y = 0.33;
    this.torso.add(chest);

    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.3), dark);
    vest.position.y = 0.4;
    this.torso.add(vest);

    const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.4, 0.16), dark);
    backpack.position.set(0, 0.36, 0.22);
    this.torso.add(backpack);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), skin);
    head.position.y = 0.86;
    this.torso.add(head);

    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 6), dark);
    helmet.position.y = 0.9;
    helmet.scale.y = 0.62;
    this.torso.add(helmet);

    // 双臂前伸持枪
    const armGeo = new THREE.BoxGeometry(0.11, 0.44, 0.11);
    armGeo.translate(0, -0.22, 0);
    const armL = new THREE.Mesh(armGeo, uniform);
    const armR = new THREE.Mesh(armGeo, uniform);
    armL.position.set(-0.26, 0.56, 0);
    armR.position.set(0.26, 0.56, 0);
    armL.rotation.set(-1.15, 0, 0.35);
    armR.rotation.set(-1.35, 0, -0.2);
    this.torso.add(armL, armR);

    const rifle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.78), metal);
    rifle.position.set(0.12, 0.48, -0.32);
    this.torso.add(rifle);

    const muzzleTip = new THREE.Object3D();
    muzzleTip.position.set(0.12, 0.5, -0.75);
    this.torso.add(muzzleTip);
    this.muzzleOffset = muzzleTip.position;

    // 步枪开火的小枪口焰
    this.flash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.3, 0.3),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(2.6, 1.9, 0.9),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.flash.position.copy(muzzleTip.position);
    this.flash.visible = false;
    this.torso.add(this.flash);
    this.flashTimer = 0;

    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = true;
    });
  }

  private flashTimer = 0;
  private muzzleOffset!: THREE.Vector3;

  update(dt: number): void {
    if (!this.alive) return;
    this.t += dt;
    const p = this.group.position;

    // 枪口焰计时
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) this.flash.visible = false;
    }

    if (this.state === 'run') {
      const dx = this.stopPoint.x - p.x;
      const dz = this.stopPoint.z - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.6) {
        const step = Math.min(this.speed * dt, dist);
        p.x += (dx / dist) * step;
        p.z += (dz / dist) * step;
        p.y = groundHeight(p.z) + Math.abs(Math.sin(this.t * 11)) * 0.05; // 跑动起伏
        // 面向前进方向，双腿摆动，身体前倾
        this.group.rotation.y = Math.atan2(dx, dz) + Math.PI;
        this.group.rotation.x = 0.08;
        const swing = Math.sin(this.t * 12) * 0.75;
        this.legL.rotation.x = swing;
        this.legR.rotation.x = -swing;
        return;
      }
      this.state = 'fire';
      this.group.rotation.set(0, Math.PI, 0); // 立定面向阵地
    }

    // 立足开火
    this.legL.rotation.x = 0;
    this.legR.rotation.x = 0;
    this.group.rotation.x = 0;
    this.fireTimer -= dt;
    if (this.fireTimer <= 0) {
      this.fireTimer = 2.2 + Math.random();
      this.muzzle.copy(p).add(this.v1.copy(this.muzzleOffset).applyEuler(this.group.rotation));
      this.onShoot(this.muzzle);
      this.flash.visible = true;
      this.flash.rotation.z = Math.random() * Math.PI;
      this.flashTimer = 0.06;
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
    return out.copy(this.group.position).setY(this.group.position.y + 0.9);
  }

  private readonly v1 = new THREE.Vector3();
}
