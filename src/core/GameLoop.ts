import * as THREE from 'three';

/** 主循环：每帧执行已注册的更新器并调用渲染回调。 */
export class GameLoop {
  private clock = new THREE.Clock();
  private updaters: ((dt: number) => void)[] = [];
  private running = false;

  constructor(private render: () => void) {}

  onUpdate(fn: (dt: number) => void): void {
    this.updaters.push(fn);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    const tick = () => {
      if (!this.running) return;
      // 钳制 dt，避免切后台回来后一步跳太远
      const dt = Math.min(this.clock.getDelta(), 0.1);
      for (const u of this.updaters) u(dt);
      this.render();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
  }
}
