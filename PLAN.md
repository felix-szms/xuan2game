# 网页版「抢滩登陆 2002」从 0 开发方案

## 一、调研结论

对 GitHub（API 搜索 + 关键词多轮组合：beachhead / turret defense / rail shooter / wave shooter three.js / anti-aircraft 等）进行了调研，结论：

**没有可直接二次开发的成熟开源项目。** 具体情况：

| 搜索方向 | 结果 |
|---|---|
| 直接复刻 Beach Head / 抢滩登陆的 Web 项目 | 无（仅有一个 ★5 的 C++ 桌面项目 `v36372/BeachHeadGame`，非网页、无文档） |
| Three.js 波次射击（wave shooter） | 有零星小 demo（★0~7，个人练习项目，无持续维护，仅可当参考代码看） |
| 固定炮台 / rail shooter（如 Star Fox 类） | 均为 on-rails 移动视角玩法，与"固定炮台"玩法不一致 |
| 知名开源浏览器 FPS（QuakeJS、three.js FPS 示例） | 是**自由移动 FPS**，核心玩法不同，直接改造反而要拆掉其移动系统 |

**判断依据**：这个玩法本身很窄（玩家固定 + 波次防御 + 多武器切换），工作量主要在玩法层而非引擎层，而现成项目要么玩法不符、要么质量/活跃度不够，直接二开省不了多少时间，还会背上别人的架构债。

**替代思路**：不找"整游戏"开源项目，而是**从 0 开发 + 借用开源积木**（引擎示例、免费美术资产、音频库），这是性价比最高的路线。

---

## 二、技术选型

| 层 | 选型 | 理由 |
|---|---|---|
| 3D 引擎 | **Three.js**（TS） | 玩法是"固定机位 + 简单弹道"，不需要 Unity 级引擎；Babylon.js 也可，生态略小 |
| 语言/构建 | TypeScript + Vite | 类型安全对实体/武器/波次配置收益大；秒级热更 |
| 碰撞/物理 | 自写（球体相交） | 不需要物理引擎（ cannon-es / rapper 都过重），弹丸-目标相交检测百行搞定 |
| 音频 | Howler.js | 音效管理简单可靠 |
| 输入 | Pointer Lock API | 鼠标瞄准锁屏，抢滩登陆的核心操作 |
| 美术资产 | **Kenney.nl**（CC0）、**Quaternius**（CC0）低多边形军事模型包 | 免版权、有 GLB 格式，登录艇/直升机/士兵/沙包都有现成的 |
| 音效 | freesound.org（CC0）+ jsfxr 生成 | 枪声/爆炸/海浪 |
| 部署 | 静态托管（任选：GitHub Pages / CloudBase 静态托管） | 纯前端零后端 |

---

## 三、玩法拆解（对标抢滩登陆 2002）

玩家固定在海滩阵地，视角 360° 可旋转、俯仰受限：

- **敌人波次**：登陆艇（海面→放下步兵→步兵登岸冲锋）、直升机（空中盘旋扫射/投弹）、战斗机（快速掠过俯冲）、坦克（后期波次，上岸后直推阵地）
- **武器系统**：双管重机枪（无限弹药、有枪管过热）、火箭筒（有限弹药、范围伤害、对载具高效）、手雷（抛物线、对步兵群）
- **生存**：阵地有生命值，敌人抵达近处/开火会掉血；血量归零游戏结束
- **经济/成长**：每波结算分数换补给（火箭弹、维修、新武器解锁），波次难度递增
- **HUD**：准星、弹药、血条、波次进度、雷达（可选）

---

## 四、架构设计

```
src/
  main.ts               # 引导：renderer / scene / loop
  core/
    GameLoop.ts         # fixed-timestep 更新 + render
    EventBus.ts         # 模块解耦（敌人死亡→加分→HUD 更新）
    ObjectPool.ts       # 弹丸/特效对象池（性能关键）
  world/
    Terrain.ts          # 海面 + 海滩 + 阵地（程序化 + 模型）
    SkyWater.ts         # 天空盒、海面动画 shader
  player/
    Turret.ts           # 炮台视角：yaw 360°、pitch 限位
    WeaponSystem.ts     # 武器状态机：机枪/火箭/手雷，弹药、过热
  entities/
    Entity.ts           # 基类：hp、位置、update()
    Soldier.ts  LandingCraft.ts  Helicopter.ts  Jet.ts  Tank.ts
    Projectile.ts       # 直射/抛物线弹道，命中检测
  systems/
    WaveManager.ts      # 数据驱动波次表（JSON 配置）
    SpawnSystem.ts      # 按波次表刷兵
    CollisionSystem.ts  # 球体相交、伤害结算
    EffectsSystem.ts    # 爆炸、弹痕、粒子
  ui/
    HUD.ts  Menu.ts  WaveResult.ts
  data/
    weapons.json  waves.json  enemies.json   # 纯配置调平衡
```

核心原则：**一切数值进 JSON 配置**，平衡性调整不动代码；实体系统用轻量基类即可，不必上完整 ECS。

---

## 五、里程碑（建议 6 个阶段）

| 阶段 | 内容 | 验收标准 |
|---|---|---|
| **M0 场景搭建** | Three.js 项目脚手架、海/滩/阵地场景、炮台视角（鼠标锁定旋转） | 能转动炮台环视海滩，60fps |
| **M1 核心射击** | 机枪弹道、命中检测、简单靶子（静态假人）、枪管过热 | 能打中移动靶并击杀 |
| **M2 首个敌人** | 登陆艇+步兵完整流程：艇靠近→放兵→冲锋→近身掉我方血 | 能完整防守一波步兵 |
| **M3 武器与波次** | 火箭筒/手雷、波次配置表、直升机与战斗机、难度递增 | 连续守 5 波不崩溃 |
| **M4 完整游戏循环** | 血量/死亡/重开、每波结算与补给购买、HUD 全量、音效 | 从开始到 Game Over 闭环可玩 |
| **M5 打磨** | 粒子特效、打击感（镜头震动/命中反馈）、性能（对象池/LOD）、部署上线 | 陌生人可玩、手机帧率可接受（可选移动端触控） |

单人全职约 4~8 周；借助 AI 编程辅助可显著压缩。

---

## 六、可借鉴的开源积木清单

- **three.js 官方示例** `games_fps`（指针锁定、准星、射击交互）——直接当 M0/M1 起点
- **Kenney Military / Quaternius 低模包**（CC0）：士兵、直升机、登陆艇、坦克模型
- **Howler.js**：音效调度
- **three.jsParticleSystem / GPU particle 示例**：爆炸特效参考
- 参考代码（只看思路，不建议直接 fork）：GitHub 上零星 three.js wave shooter demo（星标低、维护差）

## 七、风险与对策

1. **打击感**是这类游戏成败关键 → 尽早做命中特效 + 镜头反馈，M1 就开始迭代
2. **性能**：敌人多时注意 InstancedMesh 渲染士兵、弹丸用对象池
3. **美术版权**：只使用 CC0 资产或自制；不要复刻原作美术/音效
4. **范围膨胀**：严格按里程碑推进，M4 结束即为"可玩完整版"，M5 之后才是加分项
