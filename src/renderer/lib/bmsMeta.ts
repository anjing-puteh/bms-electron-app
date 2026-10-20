/**
 * .bms.meta — Sidecar metadata file for BMS editor
 *
 * Stores editor-specific data that doesn't belong in the BMS format:
 * - Note groups
 * - Timeline bookmarks
 * - Per-measure gridSnap overrides
 * - Custom note skin/color settings
 * - Clipboard history
 * - A/B comparison snapshots
 *
 * File is stored alongside the .bms file as <filename>.bms.meta (JSON)
 */

/**
 * Schema version for forward compatibility.
 * v2: note references (bgmChannels keys, noteGroups.noteKeys) are position-based
 *     keys from `notePositionKeys` — editor note ids are reassigned on every load.
 */
const META_VERSION = 2;

export interface BmsMetaBookmark {
  measure: number;
  name: string;
  color?: string;
}

export interface BmsMetaNoteGroup {
  id: string;
  name: string;
  noteIds: string[];
  /** v2: position keys of the member notes (stable across reloads). */
  noteKeys?: string[];
  color?: string;
}

export interface BmsMetaData {
  version: number;
  /** Per-measure gridSnap overrides */
  gridSnapOverrides?: Record<number, number>;
  /** Timeline bookmarks */
  bookmarks?: BmsMetaBookmark[];
  /** Note groups */
  noteGroups?: BmsMetaNoteGroup[];
  /** Custom note skin/color settings */
  customColors?: {
    playable?: string;
    invisible?: string;
    landmine?: string;
    bgm?: string;
    selection?: string;
    background?: string;
  };
  /** Layer config overrides */
  layerConfig?: {
    playable?: { visible?: boolean; locked?: boolean; opacity?: number };
    invisible?: { visible?: boolean; locked?: boolean; opacity?: number };
    landmine?: { visible?: boolean; locked?: boolean; opacity?: number };
    bgm?: { visible?: boolean; locked?: boolean; opacity?: number };
  };
  /** Writer resolution preference */
  writerResolution?: number;
  /** Minimum long note length (beats) */
  minLnLength?: number;
  /** BGM channel assignments (v2: note position key → bgmChannel; v1: session note id, ignored) */
  bgmChannels?: Record<string, number>;
}

/** Minimal note shape needed to derive a position key. */
export interface PositionKeyNote {
  id: string;
  tick?: number;
  beat?: number;
  noteType?: string;
  column?: string;
  keysound?: string;
}

/**
 * Stable per-note keys derived from what is written to the BMS file
 * (position, type, lane, keysound) plus an occurrence index among identical
 * notes. Editor note ids (`note-N`) are reassigned on every load, so they
 * cannot be used to re-attach sidecar data.
 */
export function notePositionKeys(notes: readonly PositionKeyNote[]): string[] {
  const seen = new Map<string, number>();
  return notes.map((n) => {
    const tick = n.tick ?? Math.round((n.beat ?? 0) * 960);
    const base = `${tick}:${n.noteType ?? 'playable'}:${n.column ?? ''}:${n.keysound ?? '00'}`; // ids are already canonical (#BASE 62 is case-sensitive)
    const k = seen.get(base) ?? 0;
    seen.set(base, k + 1);
    return `${base}:${k}`;
  });
}

/**
 * Get the .bms.meta file path from a .bms file path
 */
export function getMetaPath(bmsFilePath: string): string {
  return bmsFilePath + '.meta';
}

/**
 * Create a default empty meta
 */
export function createDefaultMeta(): BmsMetaData {
  return { version: META_VERSION };
}

/**
 * Serialize meta to JSON string
 */
export function serializeMeta(meta: BmsMetaData): string {
  return JSON.stringify(meta, null, 2);
}

/**
 * Deserialize meta from JSON string, with version migration
 */
export function deserializeMeta(json: string): BmsMetaData {
  try {
    const data = JSON.parse(json);
    if (!data || typeof data !== 'object') return createDefaultMeta();
    // Version migration: v1 keyed BGM channels by session note id, which
    // points at the wrong notes after any edit — drop them (defaults apply).
    if (!data.version || data.version < 2) {
      delete data.bgmChannels;
    }
    data.version = META_VERSION;
    return data as BmsMetaData;
  } catch {
    return createDefaultMeta();
  }
}

/**
 * Convert gridSnapOverrides Map to Record for serialization
 */
export function gridSnapOverridesToRecord(map: Map<number, number>): Record<number, number> | undefined {
  if (map.size === 0) return undefined;
  const record: Record<number, number> = {};
  for (const [k, v] of map) record[k] = v;
  return record;
}

/**
 * Convert Record back to Map for store
 */
export function recordToGridSnapOverrides(record: Record<number, number> | undefined): Map<number, number> {
  const map = new Map<number, number>();
  if (!record) return map;
  for (const [k, v] of Object.entries(record)) {
    map.set(Number(k), v);
  }
  return map;
}

/**
 * Build meta from current editor state
 */
export function buildMetaFromState(state: {
  gridSnapOverrides: Map<number, number>;
  minLnLength: number;
  layerConfig?: {
    playable: { visible: boolean; locked: boolean; opacity: number };
    invisible: { visible: boolean; locked: boolean; opacity: number };
    landmine: { visible: boolean; locked: boolean; opacity: number };
    bgm: { visible: boolean; locked: boolean; opacity: number };
  };
  bookmarks?: BmsMetaBookmark[];
  noteGroups?: BmsMetaNoteGroup[];
  notes?: Array<PositionKeyNote & { bgmChannel?: number }>;
  customColors?: {
    playable?: string;
    invisible?: string;
    landmine?: string;
    bgm?: string;
    selection?: string;
    background?: string;
  };
}): BmsMetaData {
  const meta: BmsMetaData = { version: META_VERSION };

  const overrides = gridSnapOverridesToRecord(state.gridSnapOverrides);
  if (overrides) meta.gridSnapOverrides = overrides;

  if (state.minLnLength !== 0.25) meta.minLnLength = state.minLnLength;

  if (state.bookmarks && state.bookmarks.length > 0) meta.bookmarks = state.bookmarks;
  const keys = state.notes ? notePositionKeys(state.notes) : [];
  const keyById = new Map<string, string>();
  if (state.notes) state.notes.forEach((n, i) => keyById.set(n.id, keys[i]));

  if (state.noteGroups && state.noteGroups.length > 0) {
    meta.noteGroups = state.noteGroups.map((g) => ({
      ...g,
      noteKeys: g.noteIds.map((id) => keyById.get(id)).filter((k): k is string => k !== undefined),
    }));
  }

  if (state.customColors && Object.keys(state.customColors).length > 0) {
    meta.customColors = state.customColors;
  }

  // BGM channel assignments
  if (state.notes) {
    const bgmChannels: Record<string, number> = {};
    let hasBgmChannels = false;
    state.notes.forEach((note, i) => {
      if (note.noteType === 'bgm' && note.bgmChannel !== undefined) {
        bgmChannels[keys[i]] = note.bgmChannel;
        hasBgmChannels = true;
      }
    });
    if (hasBgmChannels) meta.bgmChannels = bgmChannels;
  }

  return meta;
}

/**
 * Apply meta to editor state (returns partial state update)
 */
export function applyMetaToState(meta: BmsMetaData): {
  gridSnapOverrides: Map<number, number>;
  minLnLength?: number;
  customColors?: BmsMetaData['customColors'];
  bookmarks?: BmsMetaBookmark[];
  noteGroups?: BmsMetaNoteGroup[];
} {
  return {
    gridSnapOverrides: recordToGridSnapOverrides(meta.gridSnapOverrides),
    ...(meta.minLnLength !== undefined ? { minLnLength: meta.minLnLength } : {}),
    ...(meta.customColors ? { customColors: meta.customColors } : {}),
    ...(meta.bookmarks ? { bookmarks: meta.bookmarks } : {}),
    ...(meta.noteGroups ? { noteGroups: meta.noteGroups } : {}),
  };
}

/**
 * Re-attaches sidecar note references to freshly loaded notes:
 * - BGM channels by position key; a tick whose restored channels collide
 *   keeps the default 0..n-1 assignment instead of stacking notes in one lane.
 * - Note groups by position key (v2) or legacy ids (v1, best effort).
 * Returns the new notes array (same objects when nothing changed) and groups.
 */
export function restoreMetaNoteRefs<T extends PositionKeyNote & { bgmChannel?: number }>(
  meta: BmsMetaData,
  notes: T[],
): { notes: T[]; noteGroups?: BmsMetaNoteGroup[] } {
  const keys = notePositionKeys(notes);
  const idByKey = new Map<string, string>();
  notes.forEach((n, i) => idByKey.set(keys[i], n.id));

  let outNotes = notes;
  const channels = meta.bgmChannels;
  if (channels && Object.keys(channels).length > 0) {
    const restored = notes.map((n, i) => {
      if (n.noteType !== 'bgm') return n;
      const ch = channels[keys[i]];
      return typeof ch === 'number' && Number.isInteger(ch) && ch >= 0 && ch !== n.bgmChannel
        ? { ...n, bgmChannel: ch }
        : n;
    });
    // Reject restored channels for any tick where two BGM notes now share a lane.
    const used = new Map<number, Set<number>>();
    const badTicks = new Set<number>();
    restored.forEach((n) => {
      if (n.noteType !== 'bgm') return;
      const tick = n.tick ?? Math.round((n.beat ?? 0) * 960);
      let set = used.get(tick);
      if (!set) { set = new Set(); used.set(tick, set); }
      const ch = n.bgmChannel ?? 0;
      if (set.has(ch)) badTicks.add(tick);
      set.add(ch);
    });
    outNotes = badTicks.size === 0
      ? restored
      : restored.map((n, i) => {
        const tick = n.tick ?? Math.round((n.beat ?? 0) * 960);
        return badTicks.has(tick) ? notes[i] : n;
      });
  }

  let noteGroups: BmsMetaNoteGroup[] | undefined;
  if (meta.noteGroups) {
    const ids = new Set(notes.map((n) => n.id));
    noteGroups = meta.noteGroups
      .map((g) => ({
        ...g,
        noteIds: g.noteKeys
          ? g.noteKeys.map((k) => idByKey.get(k)).filter((id): id is string => id !== undefined)
          : g.noteIds.filter((id) => ids.has(id)),
      }))
      .filter((g) => g.noteIds.length > 0);
  }

  return { notes: outNotes, noteGroups };
}
