// Natural size of each overlay at zero padding, shown as the OBS browser source size.
export const OVERLAY_WIDTH = 400;
export const SCORE_HEIGHT = 130;
export const SMALL_SCORE_HEIGHT = 90;
export const DRIFT_HEIGHT = 180;
export const SMALL_DRIFT_HEIGHT = 130;
export const HEALTH_HEIGHT = 210;
export const MAPS_HEIGHT = 430;
export const RATIO_HEIGHT = 150;
export const BROADCAST_WIDTH = 800;
export const BROADCAST_HEIGHT = 480;

// The panel grows with its padding; the map list instead fits inside the source.
export const withPadding = (height: number, padding: number): number => height + padding * 2;
