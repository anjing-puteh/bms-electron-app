/**
 * Lane rules of Qwilight's 4K / 6K / 8K modes (the U_E "Yuipack" tables).
 * In these modes Qwilight drops every note on a channel the mode has no lane
 * for (e.g. channel 16 under #6K), and #8K plays channel 16 as an ordinary key.
 */

import { getLaneIds } from '@rhythm-archive/bms-editor';
import type { KeyMode } from '@rhythm-archive/bms-editor';

const DROPPING_MODES = new Set<string>(['4K', '6K', '8K']);

/** Lanes the mode plays, or null when the mode keeps every lane note. */
export function playedLanes(keyMode: string): Set<string> | null {
  return DROPPING_MODES.has(keyMode) ? new Set(getLaneIds(keyMode as KeyMode)) : null;
}

/** Notes the mode plays: BGM notes and notes on the mode's lanes. */
export function filterPlayedNotes<T extends { column?: string | null }>(notes: T[], keyMode: string): T[] {
  const lanes = playedLanes(keyMode);
  return lanes ? notes.filter((n) => !n.column || lanes.has(n.column)) : notes;
}

/** Whether a lane is a turntable (8K's 'SC' lane is the leftmost key). */
export function isScratchColumn(column: string, keyMode: string): boolean {
  return (column === 'SC' && keyMode !== '8K') || column === 'SC2';
}
