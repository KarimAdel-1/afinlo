// The looping map's timeline, in seconds, and the rows beside the map keep time with it: the camera follows the route
// stop by stop, pulls back to show all of it, clears, and returns to the first stop.

export const REEL_S = 16;
/** The whole route comes into view. */
export const OVERVIEW_S = 12;
/** The route clears, and the camera heads back to the first stop. */
export const CLEAR_S = 15;

/** When a stop is reached: the route takes the same time however many stops it has. */
export const reelDelay = (stop: number, stops: number) => 1 + (stop * 10) / Math.max(1, stops - 1);
