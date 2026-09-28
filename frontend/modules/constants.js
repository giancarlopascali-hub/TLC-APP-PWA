/** Shared, documented constants for the mobile component. */

export const PROJECT_SCHEMA_VERSION = 2;
export const PROTOCOL_VERSION = 1;
export const STORAGE_KEY = 'tlc_project';
export const UNDO_STACK_LIMIT = 50;
export const SMOOTH_SIGMA = 1.5;

// The lane box is 1.10 times the origin-to-front travel distance.  The
// physical origin/front lines sit 5 % in from either end of that box.
export const RF_ORIGIN_OFFSET = 1.05 / 1.10;
export const RF_FRONT_OFFSET = 0.05 / 1.10;

export const DEFAULT_ANALYSIS = Object.freeze({
  polarityMode: 'default',
  peakProminence: 40,
  peakDistance: 8,
  peakThreshold: 50,
  targetWavelength: null,
  wavelengthPreset: 'full',
  invertColors: false,
});

export const MAX_CLIENT_IMAGE_EDGE = 1600;
export const MAX_CLIENT_UPLOAD_BYTES = 16 * 1024 * 1024;
export const STATUS_IDLE = 'Ready';
