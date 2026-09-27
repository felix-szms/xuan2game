import * as THREE from 'three';
import type { WeaponKind, WeaponSystem } from './WeaponSystem';

export interface FireHandler {
  (weapon: WeaponKind, muzzleWorldPos: THREE.Vector3, dir: THREE.Vector3): void;
}

/**
 * 固定炮台：yaw 无限制（360° 环视），pitch 限制在俯仰范围内。
 * 结构：rig(挂在世界，转 yaw) → camera(只转 pitch) + gunPivot(随 pitch 抬枪)。
 * 含双联机枪开火节奏、枪管过热、后坐力与枪口焰。
 */
export class Turret {
  readonly rig = new THREE.Group();
  readonly camera: THREE.PerspectiveCamera;
  private readonly gunPivot = new THREE.Group();

  private yaw = 0;
  private pitch = 0;
  private readonly minPitch = THREE.MathUtils.degToRad(-6);
  private readonly maxPitch = THREE.MathUtils.degToRad(72);
  private readonly sensitivity = 0.0022;
  enabled = false;

  // ---------- 开火状态 ----------
  private firing = false;
  private shotTimer = 0;
  private readonly fireInterval = 0.095;
  heat = 0;
  overheated = false;
  onHeatChange: ((heat: number, overheated: boolean) => void) | null = null;

  private readonly muzzles: Record<WeaponKind, THREE.Object3D[]> = { mg: [], rocket: [], grenade: [] };
  private nextMuzzle = 0;
  private mgGroup!: THREE.Group;
  private rocketGroup!: THREE.Group;
  private grenadeGroup!: THREE.Group;
  private flash!: THREE.Mesh;
  private flashTimer = 0;
  private flashLight!: THREE.PointLight;
  private recoil = 0;

  private readonly v1 = new THREE.Vector3();
  private readonly v2 = new THREE.Vector3();

  /** 阵地基准点（由 Terrain 提供地面高度）。 */
  constructor(baseX: number, baseY: number, baseZ: number, private weapons: WeaponSystem, private fire: FireHandler) {
    this.rig.position.set(baseX, baseY, baseZ);

    this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 1200);
    this.camera.position.set(0, 1.5, 0.2);
    this.rig.add(this.camera);

    const gunPivot = this.gunPivot;
    gunPivot.position.set(0, 0.9, 0);
    this.rig.add(gunPivot);
    gunPivot.add(this.buildGun());

    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mousedown', this.onMouseDown);
    document.addEventListener('mouseup', this.onMouseUp);
    document.addEventListener('keydown', this.onKeyDown);
  }

  /** 指针锁定时才响应鼠标。 */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.firing = false;
  }

  /** 直接把炮口指向世界坐标点（调试/自动化测试用）。 */
  aimAt(point: THREE.Vector3): void {
    this.camera.getWorldPosition(this.v1);
    const d = this.v2.copy(point).sub(this.v1);
    const len = d.length();
    this.pitch = THREE.MathUtils.clamp(Math.asin(d.y / len), this.minPitch, this.maxPitch);
    this.yaw = Math.atan2(-d.x, -d.z);
    this.apply();
  }

  /** 每帧更新：武器冷却、枪管冷却、开火节奏、枪口焰与后坐力恢复。 */
  update(dt: number): void {
    this.weapons.update(dt);
    // 枪管冷却（持续开火时冷却慢，仅机枪有过热）
    this.heat = Math.max(0, this.heat - dt * (this.firing ? 0.06 : 0.3));
    if (this.overheated && this.heat <= 0.35) this.overheated = false;
    this.onHeatChange?.(this.heat, this.overheated);

    if (this.firing && !this.overheated) {
      this.shotTimer -= dt;
      while (this.shotTimer <= 0) {
        if (this.shoot()) {
          this.shotTimer += this.fireInterval;
        } else {
          this.shotTimer = 0.2;
        }
      }
    } else {
      this.shotTimer = Math.min(this.shotTimer, this.fireInterval);
    }

    // 武器模型随切换变形
    const w = this.weapons.current;
    this.mgGroup.visible = w === 'mg';
    this.rocketGroup.visible = w === 'rocket';
    this.grenadeGroup.visible = w === 'grenade';

    // 枪口焰
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) this.flash.visible = false;
    }
    this.flashLight.intensity = Math.max(0, this.flashLight.intensity - dt * 800);

    // 后坐力恢复
    this.recoil = Math.max(0, this.recoil - dt * 0.7);
    this.gunPivot.position.z = this.recoil;
  }

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.enabled) return;
    this.yaw -= e.movementX * this.sensitivity;
    this.pitch -= e.movementY * this.sensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch, this.minPitch, this.maxPitch);
    this.apply();
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (!this.enabled) return;
    if (e.key === '1') this.weapons.select('mg');
    else if (e.key === '2') this.weapons.select('rocket');
    else if (e.key === '3') this.weapons.select('grenade');
  };

  private onMouseDown = (e: MouseEvent): void => {
    if (!this.enabled || e.button !== 0) return;
    this.firing = true;
  };

  private onMouseUp = (e: MouseEvent): void => {
    if (e.button !== 0) return;
    this.firing = false;
  };

  /** 尝试开火，返回是否成功（弹药/冷却不满足时失败）。 */
  private shoot(): boolean {
    const w = this.weapons.current;
    if (w !== 'mg' && !this.weapons.tryConsume(w)) return false;

    // 机枪双管交替，火箭/手雷各自管口
    const tips = this.muzzles[w];
    const muzzle = tips[this.nextMuzzle % tips.length];
    this.nextMuzzle++;

    muzzle.getWorldPosition(this.v1);
    this.camera.getWorldDirection(this.v2);
    // 轻微散布
    this.v2.x += (Math.random() - 0.5) * 0.006;
    this.v2.y += (Math.random() - 0.5) * 0.006;
    this.v2.z += (Math.random() - 0.5) * 0.006;

    this.fire(w, this.v1, this.v2);

    if (w === 'mg') {
      this.heat = Math.min(1, this.heat + 0.032);
      if (this.heat >= 1) this.overheated = true;
      this.recoil = Math.min(this.recoil + 0.035, 0.09);
      this.pitch = Math.min(this.pitch + 0.0014, this.maxPitch);
    } else {
      // 火箭/手雷后坐更猛
      this.recoil = Math.min(this.recoil + 0.1, 0.16);
    }
    this.apply();

    // 枪口焰
    this.flash.position.copy(muzzle.position);
    this.flash.rotation.z = Math.random() * Math.PI;
    this.flash.visible = true;
    this.flashTimer = 0.045;
    this.flashLight.position.copy(muzzle.position);
    this.flashLight.intensity = w === 'mg' ? 90 : 160;
    return true;
  }

  private apply(): void {
    this.rig.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
    this.gunPivot.rotation.x = this.pitch;
  }

  private buildGun(): THREE.Group {
    const gun = new THREE.Group();

    const metal = new THREE.MeshStandardMaterial({ color: 0x3c4048, roughness: 0.55, metalness: 0.55 });
    const darkMetal = new THREE.MeshStandardMaterial({ color: 0x23262c, roughness: 0.5, metalness: 0.6 });
    const olive = new THREE.MeshStandardMaterial({ color: 0x4f5d3f, roughness: 0.7, metalness: 0.3 });

    // 共用底座与摇架
    const mount = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.55, 0.5, 12), darkMetal);
    mount.position.y = -0.75;
    gun.add(mount);

    const cradle = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.42, 0.9), metal);
    cradle.position.set(0, -0.1, 0.05);
    gun.add(cradle);

    // ---------- 机枪（双管 + 防盾 + 弹箱） ----------
    this.mgGroup = new THREE.Group();
    const shield = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.6, 0.06), darkMetal);
    shield.position.set(0, -0.02, -0.42);
    this.mgGroup.add(shield);

    const ammoBox = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, 0.5), darkMetal);
    ammoBox.position.set(0.42, -0.35, -0.2);
    this.mgGroup.add(ammoBox);

    for (const x of [-0.13, 0.13]) {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 1.9, 10), metal);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(x, 0.04, -1.25);
      this.mgGroup.add(barrel);

      const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.22, 10), darkMetal);
      muzzle.rotation.x = Math.PI / 2;
      muzzle.position.set(x, 0.04, -2.2);
      this.mgGroup.add(muzzle);

      const tip = new THREE.Object3D();
      tip.position.set(x, 0.04, -2.35);
      this.mgGroup.add(tip);
      this.muzzles.mg.push(tip);
    }
    gun.add(this.mgGroup);

    // ---------- 火箭筒（单管 + 提把 + 排焰口） ----------
    this.rocketGroup = new THREE.Group();
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 2.1, 12), olive);
    tube.rotation.x = Math.PI / 2;
    tube.position.set(0, 0.05, -1.0);
    this.rocketGroup.add(tube);

    const frontRing = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.28, 12), darkMetal);
    frontRing.rotation.x = Math.PI / 2;
    frontRing.position.set(0, 0.05, -2.0);
    this.rocketGroup.add(frontRing);

    const rearCone = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.21, 0.35, 12), olive);
    rearCone.rotation.x = Math.PI / 2;
    rearCone.position.set(0, 0.05, -0.1);
    this.rocketGroup.add(rearCone);

    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.16, 0.2), darkMetal);
    sight.position.set(0, 0.32, -0.5);
    this.rocketGroup.add(sight);

    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.22, 0.09), darkMetal);
    grip.position.set(0, -0.22, -0.15);
    this.rocketGroup.add(grip);

    const rocketTip = new THREE.Object3D();
    rocketTip.position.set(0, 0.05, -2.2);
    this.rocketGroup.add(rocketTip);
    this.muzzles.rocket.push(rocketTip);
    gun.add(this.rocketGroup);

    // ---------- 榴弹发射器（短管 + 弹杯） ----------
    this.grenadeGroup = new THREE.Group();
    const gBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.1, 10), metal);
    gBarrel.rotation.x = Math.PI / 2;
    gBarrel.position.set(0, 0.05, -0.85);
    this.grenadeGroup.add(gBarrel);

    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.12, 0.4, 10), darkMetal);
    cup.rotation.x = Math.PI / 2;
    cup.position.set(0, 0.05, -1.45);
    this.grenadeGroup.add(cup);

    const gAmmo = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.26, 0.4), darkMetal);
    gAmmo.position.set(0.36, -0.3, -0.1);
    this.grenadeGroup.add(gAmmo);

    const grenadeTip = new THREE.Object3D();
    grenadeTip.position.set(0, 0.05, -1.7);
    this.grenadeGroup.add(grenadeTip);
    this.muzzles.grenade.push(grenadeTip);
    gun.add(this.grenadeGroup);

    // 枪口焰（加法混合亮片）与闪光点光源
    this.flash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.65, 0.65),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(3.0, 2.2, 1.0),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.flash.visible = false;
    gun.add(this.flash);

    this.flashLight = new THREE.PointLight(0xffc060, 0, 22, 2);
    gun.add(this.flashLight);

    gun.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = true;
    });
    this.flash.castShadow = false;
    return gun;
  }

  dispose(): void {
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mousedown', this.onMouseDown);
    document.removeEventListener('mouseup', this.onMouseUp);
    document.removeEventListener('keydown', this.onKeyDown);
  }
}
