// Small display helpers shared by the app's views. No imports, so the map can use them without pulling in more.

// The landing page's blue, ink and their shades, so no tile brings in a colour of its own.
const TILE = ["#4336ff", "#262a3f", "#3023df", "#565967", "#6c63ff", "#50577b"];

/** A steady colour for a name's initial tile: the same name always gets the same colour. */
export const tileColor = (name: string) => TILE[[...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % TILE.length];

/** How long a run took; a run answered from the cache takes almost nothing. */
export const seconds = (ms: number) => (ms < 100 ? "under 0.1 s" : `${(ms / 1000).toFixed(1)} s`);

/** A metro population, as 2.1M or 640k. */
export const people = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : `${Math.round(n / 1e3)}k`);
