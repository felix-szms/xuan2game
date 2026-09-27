import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import './style.css';
import { GameLoop } from './core/GameLoop';
import { bus } from './core/EventBus';
import { Sfx } from './core/Sfx';
import { Sky } from './world/Sky';
import { Water } from './world/Water';
import { Terrain, BASE_Z } from './world/Terrain';
import { Turret } from './player/Turret';
import { WeaponSystem } from './player/WeaponSystem';
import { ProjectileSystem } from './entities/ProjectileSystem';
import { ExplosiveSystem } from './entities/ExplosiveSystem';
import { EffectsSystem } from './systems/EffectsSystem';
import { EnemyManager } from './systems/EnemyManager';
import { WaveManager } from './systems/WaveManager';
import { HUD } from './ui/HUD';

const app = document.getElementById('app')!;
const NOLOCK = new URLSearchParams(location.search).has('nolock');
const BASE_MAX_HP = 150;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xbfd6e8, 180, 720);

// ---------- 光照 ----------
scene.add(new THREE.HemisphereLight(0xcfe5f5, 0x8a7a58, 1.0));
const sky = new Sky(scene);
const sun = new THREE.DirectionalLight(0xffe8c0, 2.4);
sun.position.copy(sky.sunDir).multiplyScalar(130);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -50;
sun.shadow.camera.right = 50;
sun.shadow.camera.top = 50;
sun.shadow.camera.bottom = -50;
sun.shadow.camera.far = 400;
scene.add(sun);
const fill = new THREE.DirectionalLight(0xdfe8f0, 0.55);
fill.position.set(30, 40, 120);
scene.add(fill);

// ---------- 世界 ----------
const terrain = new Terrain();
scene.add(terrain.group);
const water = new Water(terrain.shorelineZ, sky.sunDir);
scene.add(water.mesh);

// ---------- 核心系统 ----------
const effects = new EffectsSystem(scene);
const sfx = new Sfx();
const weapons = new WeaponSystem();

let baseHp = BASE_MAX_HP;
let gameState: 'menu' | 'playing' | 'shop' | 'over' = 'menu';

const enemyManager = new EnemyManager(scene, (enemy) => {
  enemy.getCenter(v1);
  if (enemy.scoreValue <= 50) {
    // 士兵阵亡：尘土与硝烟小特效
    effects.burst(v1, 0x8a936a, { count: 12, speed: 3.5, gravity: 8, life: 0.6, size: 0.5 });
    effects.burst(v1, 0x555555, { count: 6, speed: 2, upBias: 2, gravity: 1, life: 0.8, size: 0.6 });
  } else {
    // 载具爆炸：大火球 + 浓烟
    effects.burst(v1, 0xff8c3a, { count: 30, speed: 11, upBias: 4, gravity: 11, life: 0.85, size: 0.75 });
    effects.burst(v1, 0x555555, { count: 14, speed: 5, upBias: 5, gravity: 3, life: 1.2, size: 1.1 });
    sfx.explosion();
  }
  bus.emit('score', enemy.scoreValue);
});

const projectiles = new ProjectileSystem(
  scene,
  (point, enemy) => {
    effects.burst(point, 0xffe08a, { count: 6, speed: 7, gravity: 16, life: 0.35, size: 0.4 });
    bus.emit('hit');
    enemyManager.damage(enemy, 1);
  },
  (point) => {
    const onSand = point.z > terrain.shorelineZ;
    effects.burst(
      point,
      onSand ? 0xcbb28a : 0xd7ecf2,
      { count: 10, speed: 5, upBias: 3, gravity: 12, life: 0.5, size: 0.45 },
    );
  },
);

const explosives = new ExplosiveSystem(
  scene,
  (pos, kind) => {
    effects.burst(pos, 0xff8c3a, { count: 34, speed: 13, upBias: 4, gravity: 11, life: 0.9, size: 0.85 });
    effects.burst(pos, 0x555555, { count: 16, speed: 6, upBias: 5, gravity: 3, life: 1.3, size: 1.2 });
    sfx.explosion();
    if (kind === 'heliRocket') {
      damageBase(3);
    } else {
      enemyManager.aoe(pos, 7, 4);
    }
  },
  (pos) => {
    effects.burst(pos, 0x999999, { count: 1, speed: 0.4, gravity: -2, life: 0.6, size: 0.5 });
  },
);

const waveManager = new WaveManager(enemyManager);

// ---------- 炮台 ----------
const turret = new Turret(0, terrain.groundYAtBase, BASE_Z, weapons, (weapon, muzzle, dir) => {
  if (weapon === 'mg') {
    projectiles.fire(muzzle, dir);
    sfx.shot();
  } else {
    explosives.launch(weapon, muzzle, dir);
    sfx.launch();
  }
});
scene.add(turret.rig);

// ---------- 伤害与游戏流程 ----------
function damageBase(dmg: number): void {
  if (gameState === 'over') return;
  baseHp = Math.max(0, baseHp - dmg);
  hud.setBaseHp(baseHp, BASE_MAX_HP);
  if (baseHp <= 0) gameOver();
}

function gameOver(): void {
  gameState = 'over';
  turret.setEnabled(false);
  document.exitPointerLock();
  hud.showGameOver(waveManager.wave);
}

waveManager.onWaveStart = (n) => {
  hud.setWave(n);
  hud.showWaveBanner(n);
};
waveManager.onWaveClear = (n) => {
  bus.emit('score', 50 * n); // 波次奖励
  gameState = 'shop';
  document.exitPointerLock();
  hud.showShop(n);
};
waveManager.onBaseDamageCb = (dmg, from) => {
  damageBase(dmg);
  effects.burst(from, 0xffd070, { count: 5, speed: 4, gravity: 10, life: 0.3, size: 0.35 });
};
waveManager.onHeliFireCb = (from) => {
  const target = v2.set(0, 2.4, BASE_Z);
  dirV.copy(target).sub(from).normalize();
  explosives.launch('heliRocket', from, dirV);
  sfx.launch();
};

// ---------- HUD 与流程 ----------
const hud = new HUD();
hud.showDevInfo();
hud.showMenu();
hud.setBaseHp(baseHp, BASE_MAX_HP);
hud.setWeapon(weapons.snapshot());
hud.onShopPick((pick) => {
  if (pick === 'rocket') weapons.addAmmo('rocket', 6);
  else if (pick === 'grenade') weapons.addAmmo('grenade', 4);
  else baseHp = Math.min(BASE_MAX_HP, baseHp + 40);
  hud.setBaseHp(baseHp, BASE_MAX_HP);
});
hud.onNextWave(() => {
  gameState = 'playing';
  hud.hideOverlays();
  waveManager.startNext();
  if (!NOLOCK) renderer.domElement.requestPointerLock();
});
hud.onRestart(() => location.reload());
turret.onHeatChange = (heat, overheated) => hud.setHeat(heat, overheated);
weapons.onChange = (s) => hud.setWeapon(s);

hud.onStart(() => {
  sfx.ensure();
  gameState = 'playing';
  hud.hideOverlays();
  // 首次开始才开新波次；从暂停恢复时不重复刷波
  if (waveManager.phase === 'idle') waveManager.startNext();
  if (!NOLOCK) renderer.domElement.requestPointerLock();
});

document.addEventListener('pointerlockchange', () => {
  if (NOLOCK) return; // 调试模式：忽略浏览器焦点变化引发的锁定事件，保持炮台常开
  const locked = document.pointerLockElement === renderer.domElement;
  if (locked) {
    turret.setEnabled(true);
    hud.hideOverlays();
  } else if (gameState === 'playing') {
    turret.setEnabled(false);
    hud.showPause();
  }
});

if (NOLOCK) {
  gameState = 'playing';
  hud.hideOverlays();
  waveManager.startNext();
  turret.setEnabled(true);
}

// ---------- 后处理 ----------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, turret.camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.3, 0.45, 0.95));
composer.addPass(new OutputPass());

// ---------- 主循环 ----------
const loop = new GameLoop(() => composer.render());
loop.onUpdate((dt) => {
  if (gameState === 'over') return; // 结算画面定格
  water.update(dt);
  sky.update(dt);
  turret.update(dt);
  enemyManager.update(dt);
  projectiles.update(dt, enemyManager.enemies);
  explosives.update(dt, enemyManager.enemies);
  effects.update(dt);
  waveManager.update(dt);
  hud.tick(dt);
});
loop.start();

// ---------- 自适应窗口 ----------
window.addEventListener('resize', () => {
  turret.camera.aspect = window.innerWidth / window.innerHeight;
  turret.camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- 调试钩子（?nolock） ----------
if (NOLOCK) {
  (window as unknown as Record<string, unknown>).__debug = {
    scene,
    turret,
    weapons,
    bus,
    waveManager,
    enemyManager,
    enemies: enemyManager.enemies,
    damageBase,
    aimAt: (x: number, y: number, z: number) => turret.aimAt(new THREE.Vector3(x, y, z)),
  };
}

// ---------- 临时向量 ----------
const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const dirV = new THREE.Vector3();
