import * as THREE from 'three';

/** 确定性随机，保证每次进场场景一致（纯装饰用途）。 */
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 阵地（炮台/沙袋工事）所在的 z 坐标，距海岸线 31 单位。 */
export const BASE_Z = 26;

/**
 * 地形：向海面倾斜的沙滩（与世界 y=0 的海面相交形成海岸线）、
 * 干湿沙顶点着色、岩石、棕榈树、补给箱和阵地的沙袋工事。
 */
export class Terrain {
  readonly group = new THREE.Group();

  /** z 轴上沙滩与海面相交的位置（海岸线）。 */
  readonly shorelineZ = -5;
  /** 阵地所在处的地面高度。 */
  readonly groundYAtBase: number;

  constructor(baseZ: number = BASE_Z) {
    const tilt = 0.05; // 沙滩坡度
    this.groundYAtBase = 0.25 + tilt * baseZ;
    const rand = mulberry32(20020927);

    // ---------- 沙滩（顶点着色：干湿沙 + 噪点） ----------
    const sandGeo = new THREE.PlaneGeometry(900, 900, 140, 140);
    const pos = sandGeo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const dry = new THREE.Color(0xd8bf90);
    const wet = new THREE.Color(0x9f8a64);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = -pos.getY(i); // 旋转后局部 -y = 世界 z
      const wy = 0.25 + tilt * z; // 该顶点世界高度
      c.copy(dry);
      c.offsetHSL(0, 0, (rand() - 0.5) * 0.05 + Math.sin(x * 0.05) * Math.cos(z * 0.04) * 0.025);
      // 靠近海面（世界高度低）混入深色湿沙
      const wetT = 1 - THREE.MathUtils.smoothstep(wy, 0.1, 0.7);
      c.lerp(wet, wetT * 0.85);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    sandGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const sand = new THREE.Mesh(
      sandGeo,
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }),
    );
    // 旋转后局部 +y 指向世界 -z；再额外 -tilt 使 -z 一侧（海）下沉没入水中
    sand.rotation.x = -Math.PI / 2 - tilt;
    sand.position.y = 0.25;
    sand.receiveShadow = true;
    this.group.add(sand);

    // ---------- 海岸线浪花 ----------
    const foam = new THREE.Mesh(
      new THREE.PlaneGeometry(900, 3.2),
      new THREE.MeshBasicMaterial({ color: 0xeef6f8, transparent: true, opacity: 0.4 }),
    );
    foam.rotation.x = -Math.PI / 2;
    foam.position.set(0, 0.04, this.shorelineZ);
    this.group.add(foam);

    // ---------- 沙袋工事（围住玩家阵地） ----------
    const sandbagMat = new THREE.MeshStandardMaterial({ color: 0x8f7f5f, roughness: 0.95 });
    const bagGeo = new THREE.BoxGeometry(1.05, 0.42, 0.6);
    const emplacement = new THREE.Group();
    emplacement.position.set(0, this.groundYAtBase, baseZ);
    for (let layer = 0; layer < 2; layer++) {
      const count = 22;
      const r = 2.9 - layer * 0.12;
      for (let i = 0; i < count; i++) {
        // 每层错开半格，砖墙式堆叠
        const a = (i / count) * Math.PI * 2 + layer * 0.07 + rand() * 0.02;
        const bag = new THREE.Mesh(bagGeo, sandbagMat);
        bag.position.set(Math.cos(a) * r, 0.21 + layer * 0.4, Math.sin(a) * r);
        bag.rotation.y = -a + Math.PI / 2 + (rand() - 0.5) * 0.1;
        bag.castShadow = true;
        emplacement.add(bag);
      }
    }
    this.group.add(emplacement);

    // ---------- 岩石 ----------
    const rockMatA = new THREE.MeshStandardMaterial({ color: 0x7d7a72, roughness: 1 });
    const rockMatB = new THREE.MeshStandardMaterial({ color: 0x8d887c, roughness: 1 });
    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    for (let i = 0; i < 14; i++) {
      const rock = new THREE.Mesh(rockGeo, i % 2 ? rockMatA : rockMatB);
      const s = 0.5 + rand() * 1.4;
      rock.scale.set(s, s * 0.7, s);
      rock.position.set(
        (rand() - 0.5) * 130,
        0.4 + rand() * 0.4,
        18 + rand() * 80,
      );
      rock.rotation.y = rand() * Math.PI * 2;
      rock.castShadow = true;
      this.group.add(rock);
    }

    // ---------- 棕榈树 ----------
    for (const [x, z] of [[-16, 30], [20, 42], [-30, 55], [34, 24], [-45, 38]] as const) {
      this.group.add(this.makePalm(x, 0.25 + tilt * z, z, rand));
    }

    // ---------- 补给箱与木桩（阵地后方） ----------
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x9a7a50, roughness: 0.9 });
    const crateGeo = new THREE.BoxGeometry(1.15, 1.15, 1.15);
    for (const [x, dz, ry] of [[6.5, 4, 0.3], [7.9, 3.4, 1.2], [7.1, 5.4, 0.8]] as const) {
      const crate = new THREE.Mesh(crateGeo, woodMat);
      crate.position.set(x, 0.25 + tilt * (baseZ + dz) + 0.575, baseZ + dz);
      crate.rotation.y = ry;
      crate.castShadow = true;
      this.group.add(crate);
    }
    for (const [x, dz] of [[-8.5, 5], [-10.5, 7], [-9.3, 9.5]] as const) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 1.7, 6), woodMat);
      post.position.set(x, 0.25 + tilt * (baseZ + dz) + 0.85, baseZ + dz);
      post.rotation.z = (rand() - 0.5) * 0.2;
      post.castShadow = true;
      this.group.add(post);
    }
  }

  private makePalm(x: number, y: number, z: number, rand: () => number): THREE.Group {
    const palm = new THREE.Group();
    palm.position.set(x, y, z);
    palm.rotation.y = rand() * Math.PI * 2;

    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.32, 6, 7),
      new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 1 }),
    );
    trunk.position.y = 3;
    trunk.rotation.z = (rand() - 0.5) * 0.25;
    trunk.castShadow = true;
    palm.add(trunk);

    const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f7d3a, roughness: 0.9 });
    for (let i = 0; i < 7; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.45, 3.2, 4), leafMat);
      const a = (i / 7) * Math.PI * 2;
      leaf.position.set(Math.cos(a) * 1.1, 6.1, Math.sin(a) * 1.1);
      leaf.rotation.z = Math.cos(a) * 1.25;
      leaf.rotation.x = -Math.sin(a) * 1.25;
      leaf.scale.y = 0.35;
      leaf.castShadow = true;
      palm.add(leaf);
    }
    return palm;
  }
}
