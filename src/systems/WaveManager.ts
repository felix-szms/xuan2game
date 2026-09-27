import * as THREE from 'three';
import waveData from '../data/waves.json';
import type { EnemyManager } from './EnemyManager';
import { LandingCraft } from '../entities/LandingCraft';
import { Soldier } from '../entities/Soldier';
import { Helicopter } from '../entities/Helicopter';

interface WaveConfig {
  boats: number;
  soldiersPerBoat: number;
  helis: number;
}

interface SpawnTask {
  delay: number;
  run: () => void;
}

export type WavePhase = 'idle' | 'active' | 'shop' | 'over';

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** 波次调度：按配置刷敌人，波次清空后进入补给阶段。 */
export class WaveManager {
  wave = 0;
  phase: WavePhase = 'idle';
  onWaveStart: ((n: number) => void) | null = null;
  onWaveClear: ((n: number) => void) | null = null;

  private queue: SpawnTask[] = [];

  constructor(private enemies: EnemyManager) {}

  private static config(wave: number): WaveConfig {
    if (wave <= waveData.length) {
      return waveData[wave - 1] as WaveConfig;
    }
    // 超出配置表后按公式无限扩展
    const extra = wave - waveData.length;
    return {
      boats: Math.min(4 + Math.floor(extra / 2), 7),
      soldiersPerBoat: Math.min(6 + Math.floor(extra / 3), 9),
      helis: Math.min(4 + Math.floor(extra / 2), 8),
    };
  }

  startNext(): void {
    this.wave++;
    const cfg = WaveManager.config(this.wave);
    this.queue = [];

    for (let i = 0; i < cfg.boats; i++) {
      this.queue.push({
        delay: 1.5 + i * 7,
        run: () => {
          const unloadX = rand(-24, 24);
          const boat = new LandingCraft(rand(-70, 70), unloadX, cfg.soldiersPerBoat, (x, z) => {
            this.enemies.spawn(new Soldier(x, z, 4.2, (from) => this.soldierShoot(from)));
          });
          this.enemies.spawn(boat);
        },
      });
    }
    for (let i = 0; i < cfg.helis; i++) {
      this.queue.push({
        delay: 4 + i * 6,
        run: () => {
          const side = Math.random() > 0.5 ? 1 : -1;
          const heli = new Helicopter(side * 130, rand(20, 28), rand(-90, -40));
          heli.onFire = (from) => this.heliShoot(from);
          this.enemies.spawn(heli);
        },
      });
    }
    this.phase = 'active';
    this.onWaveStart?.(this.wave);
  }

  update(dt: number): void {
    if (this.phase !== 'active') return;
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const task = this.queue[i];
      task.delay -= dt;
      if (task.delay <= 0) {
        task.run();
        this.queue.splice(i, 1);
      }
    }
    if (this.queue.length === 0 && this.enemies.activeCount === 0) {
      this.phase = 'shop';
      this.onWaveClear?.(this.wave);
    }
  }

  private soldierShoot(from: THREE.Vector3): void {
    // 步兵对基地开火，伤害结算在 main 的 onBaseDamage
    this.onBaseDamageCb?.(0.7, from);
  }

  private heliShoot(from: THREE.Vector3): void {
    this.onHeliFireCb?.(from);
  }

  onBaseDamageCb: ((dmg: number, from: THREE.Vector3) => void) | null = null;
  onHeliFireCb: ((from: THREE.Vector3) => void) | null = null;
}
