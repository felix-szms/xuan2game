# 抢滩 · 海滩防线（Beach Defense）

网页版固定炮台防御射击游戏（致敬《抢滩登陆 2002》），纯前端实现。

- 技术栈：Three.js + TypeScript + Vite，无后端
- 玩法：坚守海滩阵地，抵御登陆艇/步兵/武装直升机的无限波次进攻

## 本地运行

```bash
npm install
npm run dev        # http://localhost:5173
```

## 操作

| 输入 | 功能 |
|---|---|
| 鼠标 | 旋转炮台（360° 环视，俯仰 -6°~72°） |
| 左键按住 | 开火 |
| 1 / 2 / 3 | 切换 机枪（过热限制）/ 火箭筒（AoE）/ 手雷（AoE） |
| Esc | 暂停 / 释放鼠标 |

## 玩法规则

- 敌人从海面进攻：登陆艇运送步兵抢滩，武装直升机绕圈向基地开火
- 基地 150 HP，血量归零游戏结束
- 每波肃清后可选择一项补给（火箭弹 / 手雷 / 维修），波次奖励 = 50 × 波数
- 波次配置在 `src/data/waves.json`（前 10 波手工配置，之后按公式无限加压）

## 构建与部署

```bash
npm run build      # 产物输出到 dist/（纯静态，任意静态托管可部署）
npm run preview    # 本地预览构建产物
```

### 部署到腾讯云开发（CloudBase）静态托管

```bash
npm i -g @cloudbase/cli
tcb login
tcb hosting deploy dist -e <你的环境ID>
```

或使用 MCP 工具链（登录后）：`manageHosting(action="upload", localPath=<abs dist>, cloudPath="/")`。

部署后访问地址形如 `https://<envId>-<appId>.tcloudbaseapp.com/`。

## 调试

- `?nolock`：跳过指针锁定自动开局，保留鼠标转向与开火，并在 `window.__debug` 暴露调试接口
  （`aimAt(x,y,z)` 瞄准、`damageBase(n)` 扣基地血、`enemyManager/waveManager/weapons/turret` 实例）

## 代码结构

```
src/
  core/     GameLoop（主循环）、EventBus（事件）、Sfx（WebAudio 合成音效）
  world/    Water（海面着色器）、Sky（天空穹顶/云）、Terrain（沙滩/工事）、Ground
  player/   Turret（炮台/开火/过热）、WeaponSystem（武器与弹药）
  entities/ Soldier、LandingCraft、Helicopter、ProjectileSystem（曳光弹）、ExplosiveSystem（火箭/手雷）、Enemy
  systems/  EnemyManager（伤害结算）、EffectsSystem（粒子池）、WaveManager（波次调度）
  ui/       HUD（准星/血条/武器面板/商店/结算）
  data/     waves.json（波次配置）
```
