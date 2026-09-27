/** 沙滩地形高度：z > 海岸线为沙地，海面为 0。 */
export function groundHeightAt(z: number, shorelineZ: number): number {
  return z > shorelineZ ? 0.25 + 0.05 * z : 0;
}

/** 沙滩地形高度（使用默认海岸线 -5 的便捷版）。 */
export function groundHeight(z: number): number {
  return groundHeightAt(z, -5);
}
