/* ============================================================
   version.js — the single source of truth for the game version

   The scheme runs BETA 0.1 → BETA 0.9, then MAIN 1.0 → MAIN 1.9,
   MAIN 2.0 → MAIN 2.9 and so on: major 0 is the beta line, and every
   major after that is a main release. Minor wraps 1..9 and carries
   into the next major.
   ============================================================ */

export const MAJOR = 0;
export const MINOR = 1;

/** "BETA 0.1", "MAIN 1.0", "MAIN 2.3" … */
export function versionLabel(major = MAJOR, minor = MINOR) {
  return `${major === 0 ? 'BETA' : 'MAIN'} ${major}.${minor}`;
}

/** the version after this one, following the 0.9 → 1.0 carry */
export function nextVersion(major = MAJOR, minor = MINOR) {
  return minor >= 9 ? [major + 1, 0] : [major, minor + 1];
}

export const VERSION = versionLabel();          // "BETA 0.1"
export const VERSION_NUM = `${MAJOR}.${MINOR}`; // "0.1"
export const CHANNEL = MAJOR === 0 ? 'beta' : 'main';
export const IS_BETA = MAJOR === 0;
