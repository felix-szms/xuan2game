export type WeaponKind = 'mg' | 'rocket' | 'grenade';

export interface WeaponState {
  current: WeaponKind;
  rocket: number;
  grenade: number;
}

/** 武器切换与弹药管理（机枪无限、有枪管过热，由 Turret 管理）。 */
export class WeaponSystem {
  current: WeaponKind = 'mg';
  rocket = 8;
  grenade = 6;
  onChange: ((s: WeaponState) => void) | null = null;

  private rocketCd = 0;
  private grenadeCd = 0;

  update(dt: number): void {
    this.rocketCd = Math.max(0, this.rocketCd - dt);
    this.grenadeCd = Math.max(0, this.grenadeCd - dt);
  }

  select(w: WeaponKind): void {
    this.current = w;
    this.onChange?.(this.snapshot());
  }

  /** 尝试消耗一发当前武器（非机枪），失败返回 false。 */
  tryConsume(w: WeaponKind): boolean {
    if (w === 'mg') return true;
    if (w === 'rocket') {
      if (this.rocketCd > 0 || this.rocket <= 0) return false;
      this.rocket--;
      this.rocketCd = 0.9;
    } else {
      if (this.grenadeCd > 0 || this.grenade <= 0) return false;
      this.grenade--;
      this.grenadeCd = 0.7;
    }
    this.onChange?.(this.snapshot());
    return true;
  }

  addAmmo(w: 'rocket' | 'grenade', n: number): void {
    if (w === 'rocket') this.rocket += n;
    else this.grenade += n;
    this.onChange?.(this.snapshot());
  }

  /** 武器开火节奏（非机枪）。 */
  cooldownOf(w: WeaponKind): number {
    return w === 'rocket' ? this.rocketCd : this.grenadeCd;
  }

  snapshot(): WeaponState {
    return { current: this.current, rocket: this.rocket, grenade: this.grenade };
  }
}
