// The hexagon grid the US map is drawn on: pointy-top hexagons over the 975 × 610 Albers USA map. Shared by the
// server (which hexagons are land, which ones an act's heatmap lights up) and the browser (drawing them). Pure.

/** A hexagon's radius, in map units (about 40 km). */
export const HEX = 8.5;
const COL = Math.sqrt(3) * HEX;
const ROW = 1.5 * HEX;

/** The centre of the hexagon in column `col`, row `row`. Odd rows are shifted half a hexagon right. */
export function hexCenter(col: number, row: number): [number, number] {
  return [COL / 2 + col * COL + (row % 2 ? COL / 2 : 0), HEX + row * ROW];
}

/** Every hexagon position on the map, as [column, row]. */
export function hexPositions(width = 975, height = 610): [number, number][] {
  const out: [number, number][] = [];
  for (let row = 0; HEX + row * ROW < height; row++)
    for (let col = 0; COL / 2 + col * COL < width; col++) out.push([col, row]);
  return out;
}

/** The hexagon a map point falls in. */
export function hexAt(x: number, y: number): [number, number] {
  const r0 = Math.round((y - HEX) / ROW);
  let best: [number, number] = [0, r0],
    bestD = Infinity;
  for (let row = r0 - 1; row <= r0 + 1; row++) {
    const c0 = Math.round((x - COL / 2 - (row % 2 ? COL / 2 : 0)) / COL);
    for (let col = c0 - 1; col <= c0 + 1; col++) {
      const [cx, cy] = hexCenter(col, row);
      const d = (cx - x) ** 2 + (cy - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = [col, row];
      }
    }
  }
  return best;
}

/** SVG path data for hexagons, drawn a little smaller than the grid so tiles have a gap between them. */
export function hexPath(cells: Iterable<[number, number]>, scale = 0.86) {
  const s = HEX * scale,
    w = s * 0.866;
  let d = "";
  for (const [col, row] of cells) {
    const [x, y] = hexCenter(col, row);
    d += `M${x.toFixed(1)} ${(y - s).toFixed(1)}l${w.toFixed(1)} ${(s / 2).toFixed(1)}v${s.toFixed(1)}l${(-w).toFixed(1)} ${(s / 2).toFixed(1)}l${(-w).toFixed(1)} ${(-s / 2).toFixed(1)}v${(-s).toFixed(1)}z`;
  }
  return d;
}
