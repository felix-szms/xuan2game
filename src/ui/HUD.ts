import { bus } from '../core/EventBus';

export type ShopPick = 'rocket' | 'grenade' | 'repair';
import type { WeaponState } from '../player/WeaponSystem';

/** HUD：准星、血条、武器面板、波次提示、商店、结算与 FPS。 */
export class HUD {
  private overlay = document.getElementById('overlay')!;
  private startBtn = document.getElementById('start-btn')!;
  private crosshair = document.getElementById('crosshair')!;
  private fpsEl = document.getElementById('fps')!;
  private scoreEl = document.getElementById('score')!;
  private waveLabel = document.getElementById('wave-label')!;
  private baseHpFill = document.getElementById('basehp-fill')!;
  private baseHpWrap = document.getElementById('basehp-wrap')!;
  private heatWrap = document.getElementById('heat-wrap')!;
  private heatFill = document.getElementById('heat-fill')!;
  private overheatEl = document.getElementById('overheat')!;
  private weaponPanel = document.getElementById('weapon-panel')!;
  private ammoRocket = document.getElementById('ammo-rocket')!;
  private ammoGrenade = document.getElementById('ammo-grenade')!;
  private waveBanner = document.getElementById('wave-banner')!;
  private shop = document.getElementById('shop')!;
  private shopTitle = document.getElementById('shop-title')!;
  private nextWaveBtn = document.getElementById('next-wave-btn')!;
  private gameover = document.getElementById('gameover')!;
  private finalScore = document.getElementById('final-score')!;
  private finalWave = document.getElementById('final-wave')!;
  private restartBtn = document.getElementById('restart-btn')!;

  private frames = 0;
  private elapsed = 0;
  private score = 0;
  private hitMarkerTimer: ReturnType<typeof setTimeout> | null = null;
  private bannerTimer: ReturnType<typeof setTimeout> | null = null;
  private shopPicked = false;

  private cbShopPick: ((pick: ShopPick) => void) | null = null;
  private cbNextWave: (() => void) | null = null;
  private cbRestart: (() => void) | null = null;

  constructor() {
    bus.on('score', (p) => {
      this.score += Number(p ?? 0);
      this.scoreEl.textContent = String(this.score);
    });
    bus.on('hit', () => this.flashHitMarker());

    this.shop.querySelectorAll<HTMLButtonElement>('.shop-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (this.shopPicked) return;
        this.shopPicked = true;
        this.shop.querySelectorAll<HTMLButtonElement>('.shop-btn').forEach((b) => (b.disabled = true));
        this.cbShopPick?.(btn.dataset.pick as ShopPick);
      });
    });
    this.nextWaveBtn.addEventListener('click', () => this.cbNextWave?.());
    this.restartBtn.addEventListener('click', () => this.cbRestart?.());
  }

  onShopPick(cb: (pick: ShopPick) => void): void {
    this.cbShopPick = cb;
  }

  onStart(cb: () => void): void {
    this.startBtn.addEventListener('click', cb);
  }

  onNextWave(cb: () => void): void {
    this.cbNextWave = cb;
  }

  onRestart(cb: () => void): void {
    this.cbRestart = cb;
  }

  getScore(): number {
    return this.score;
  }

  // ---------- 开始 / 暂停 ----------
  showMenu(): void {
    this.overlay.classList.remove('hidden');
    this.startBtn.textContent = '开始防守';
    this.setPlayHud(false);
  }

  showPause(): void {
    this.overlay.classList.remove('hidden');
    this.startBtn.textContent = '继续游戏';
    this.setPlayHud(false);
  }

  hideOverlays(): void {
    this.overlay.classList.add('hidden');
    this.shop.classList.add('hidden');
    this.gameover.classList.add('hidden');
    this.setPlayHud(true);
  }

  private setPlayHud(on: boolean): void {
    this.crosshair.classList.toggle('hidden', !on);
    this.heatWrap.classList.toggle('hidden', !on);
    this.weaponPanel.classList.toggle('hidden', !on);
    this.scoreEl.classList.toggle('hidden', !on);
    this.waveLabel.classList.toggle('hidden', !on);
    this.baseHpWrap.classList.toggle('hidden', !on);
  }

  // ---------- 游戏内数值 ----------
  setHeat(heat: number, overheated: boolean): void {
    this.heatFill.style.width = `${(heat * 100).toFixed(1)}%`;
    this.heatFill.style.background = overheated
      ? '#e84b3c'
      : heat > 0.7 ? '#e8a33b' : '#7fc75f';
    this.overheatEl.classList.toggle('hidden', !overheated);
  }

  setBaseHp(cur: number, max: number): void {
    this.baseHpFill.style.width = `${((cur / max) * 100).toFixed(1)}%`;
    this.baseHpFill.style.background = cur / max < 0.35 ? '#e84b3c' : '#5f9ec7';
  }

  setWeapon(s: WeaponState): void {
    this.ammoRocket.textContent = String(s.rocket);
    this.ammoGrenade.textContent = String(s.grenade);
    this.weaponPanel.querySelectorAll<HTMLElement>('.wp-item').forEach((el) => {
      el.classList.toggle('active', el.dataset.w === s.current);
    });
  }

  setWave(n: number): void {
    this.waveLabel.textContent = `第 ${n} 波`;
  }

  showWaveBanner(n: number): void {
    this.waveBanner.textContent = `第 ${n} 波 来袭`;
    this.waveBanner.classList.remove('hidden');
    if (this.bannerTimer) clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => this.waveBanner.classList.add('hidden'), 2200);
  }

  // ---------- 商店 / 结算 ----------
  showShop(wave: number): void {
    this.shopPicked = false;
    this.shop.querySelectorAll<HTMLButtonElement>('.shop-btn').forEach((b) => (b.disabled = false));
    this.shopTitle.textContent = `第 ${wave} 波已肃清`;
    this.shop.classList.remove('hidden');
    this.overlay.classList.add('hidden');
    this.setPlayHud(false);
  }

  showGameOver(wave: number): void {
    this.finalScore.textContent = String(this.score);
    this.finalWave.textContent = String(wave);
    this.gameover.classList.remove('hidden');
    this.overlay.classList.add('hidden');
    this.shop.classList.add('hidden');
    this.setPlayHud(false);
  }

  // ---------- 内部小件 ----------
  private flashHitMarker(): void {
    this.crosshair.classList.add('hit');
    if (this.hitMarkerTimer) clearTimeout(this.hitMarkerTimer);
    this.hitMarkerTimer = setTimeout(() => this.crosshair.classList.remove('hit'), 90);
  }

  tick(dt: number): void {
    this.frames++;
    this.elapsed += dt;
    if (this.elapsed >= 0.5) {
      this.fpsEl.textContent = `${Math.round(this.frames / this.elapsed)} FPS`;
      this.frames = 0;
      this.elapsed = 0;
    }
  }

  showDevInfo(): void {
    this.fpsEl.classList.remove('hidden');
  }
}
