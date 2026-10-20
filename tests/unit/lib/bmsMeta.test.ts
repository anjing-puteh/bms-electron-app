import { describe, it, expect } from 'vitest';
import {
  getMetaPath,
  createDefaultMeta,
  serializeMeta,
  deserializeMeta,
  gridSnapOverridesToRecord,
  recordToGridSnapOverrides,
  buildMetaFromState,
  applyMetaToState,
  notePositionKeys,
  restoreMetaNoteRefs,
} from '../../../src/renderer/lib/bmsMeta';

describe('getMetaPath', () => {
  it('appends .meta to bms path', () => {
    expect(getMetaPath('/path/to/chart.bms')).toBe('/path/to/chart.bms.meta');
    expect(getMetaPath('C:\\Music\\test.bme')).toBe('C:\\Music\\test.bme.meta');
  });
});

describe('createDefaultMeta', () => {
  it('returns object with the current version (2)', () => {
    const meta = createDefaultMeta();
    expect(meta.version).toBe(2);
    expect(meta.bookmarks).toBeUndefined();
    expect(meta.gridSnapOverrides).toBeUndefined();
  });
});

describe('serialize / deserialize', () => {
  it('round-trips default meta', () => {
    const meta = createDefaultMeta();
    const json = serializeMeta(meta);
    const result = deserializeMeta(json);
    expect(result.version).toBe(2);
  });

  it('round-trips meta with all fields', () => {
    const meta = {
      version: 1,
      gridSnapOverrides: { 4: 12, 8: 48 },
      bookmarks: [{ measure: 0, name: 'Intro' }, { measure: 16, name: 'Drop', color: '#ff0000' }],
      noteGroups: [{ id: 'g1', name: 'Pattern A', noteIds: ['n1', 'n2'] }],
      minLnLength: 0.5,
      writerResolution: 3840,
    };
    const json = serializeMeta(meta);
    const result = deserializeMeta(json);
    expect(result.gridSnapOverrides).toEqual({ 4: 12, 8: 48 });
    expect(result.bookmarks).toHaveLength(2);
    expect(result.bookmarks![1].name).toBe('Drop');
    expect(result.noteGroups).toHaveLength(1);
    expect(result.minLnLength).toBe(0.5);
  });

  it('handles invalid JSON gracefully', () => {
    expect(deserializeMeta('')).toEqual({ version: 2 });
    expect(deserializeMeta('not json')).toEqual({ version: 2 });
    expect(deserializeMeta('null')).toEqual({ version: 2 });
    expect(deserializeMeta('42')).toEqual({ version: 2 });
  });
});

describe('gridSnapOverrides conversion', () => {
  it('converts Map to Record', () => {
    const map = new Map<number, number>([[4, 12], [8, 48]]);
    const record = gridSnapOverridesToRecord(map);
    expect(record).toEqual({ 4: 12, 8: 48 });
  });

  it('returns undefined for empty Map', () => {
    expect(gridSnapOverridesToRecord(new Map())).toBeUndefined();
  });

  it('converts Record back to Map', () => {
    const map = recordToGridSnapOverrides({ 4: 12, 8: 48 });
    expect(map.get(4)).toBe(12);
    expect(map.get(8)).toBe(48);
    expect(map.size).toBe(2);
  });

  it('returns empty Map for undefined', () => {
    expect(recordToGridSnapOverrides(undefined).size).toBe(0);
  });
});

describe('buildMetaFromState', () => {
  it('builds minimal meta when all defaults', () => {
    const meta = buildMetaFromState({
      gridSnapOverrides: new Map(),
      minLnLength: 0.25,
    });
    expect(meta.version).toBe(2);
    expect(meta.gridSnapOverrides).toBeUndefined();
    expect(meta.minLnLength).toBeUndefined(); // 0.25 is default, omitted
  });

  it('includes non-default values', () => {
    const meta = buildMetaFromState({
      gridSnapOverrides: new Map([[4, 12]]),
      minLnLength: 0.5,
      bookmarks: [{ measure: 0, name: 'Start' }],
    });
    expect(meta.gridSnapOverrides).toEqual({ 4: 12 });
    expect(meta.minLnLength).toBe(0.5);
    expect(meta.bookmarks).toHaveLength(1);
  });
});

describe('applyMetaToState', () => {
  it('converts meta to partial state', () => {
    const state = applyMetaToState({
      version: 1,
      gridSnapOverrides: { 4: 12, 8: 48 },
      minLnLength: 0.5,
    });
    expect(state.gridSnapOverrides.get(4)).toBe(12);
    expect(state.minLnLength).toBe(0.5);
  });

  it('handles empty meta', () => {
    const state = applyMetaToState({ version: 1 });
    expect(state.gridSnapOverrides.size).toBe(0);
    expect(state.minLnLength).toBeUndefined();
  });
});

describe('note references survive a reload (position keys)', () => {
  const bgm = (id: string, tick: number, keysound: string, bgmChannel?: number) =>
    ({ id, tick, noteType: 'bgm', keysound, bgmChannel });

  it('keys notes by position + occurrence, not by session id', () => {
    const keys = notePositionKeys([bgm('a', 0, '01'), bgm('b', 0, '01'), bgm('c', 0, '02')]);
    expect(keys).toEqual(['0:bgm::01:0', '0:bgm::01:1', '0:bgm::02:0']);
  });

  it('restores BGM channels onto the right notes after ids were reassigned', () => {
    // Saved session: a note was deleted, so ids no longer match parse order.
    const saved = buildMetaFromState({
      gridSnapOverrides: new Map(),
      minLnLength: 0.25,
      notes: [bgm('note-7', 960, '0A', 3), bgm('note-2', 960, '0B', 0)],
    });
    const meta = deserializeMeta(serializeMeta(saved));
    // Reload: parse order differs and ids are note-0, note-1
    const loaded = [bgm('note-0', 960, '0B', 0), bgm('note-1', 960, '0A', 1)];
    const { notes } = restoreMetaNoteRefs(meta, loaded);
    expect(notes.find((n) => n.keysound === '0A')!.bgmChannel).toBe(3);
    expect(notes.find((n) => n.keysound === '0B')!.bgmChannel).toBe(0);
  });

  it('keeps default channels for a tick whose restored channels would collide', () => {
    const meta = { version: 2, bgmChannels: { '0:bgm::01:0': 1 } };
    const loaded = [bgm('n0', 0, '01', 0), bgm('n1', 0, '02', 1)];
    const { notes } = restoreMetaNoteRefs(meta, loaded);
    expect(notes.map((n) => n.bgmChannel)).toEqual([0, 1]);
  });

  it('drops v1 id-keyed BGM channels (they point at the wrong notes)', () => {
    const meta = deserializeMeta(JSON.stringify({ version: 1, bgmChannels: { 'note-1': 5 } }));
    expect(meta.bgmChannels).toBeUndefined();
  });

  it('re-attaches note groups by position key', () => {
    const notes = [
      { id: 'note-5', tick: 0, noteType: 'playable', column: '1', keysound: '01' },
      { id: 'note-9', tick: 480, noteType: 'playable', column: '2', keysound: '02' },
    ];
    const saved = buildMetaFromState({
      gridSnapOverrides: new Map(), minLnLength: 0.25, notes,
      noteGroups: [{ id: 'g', name: 'G', noteIds: ['note-9'] }],
    });
    const reloaded = [
      { id: 'note-0', tick: 0, noteType: 'playable', column: '1', keysound: '01' },
      { id: 'note-1', tick: 480, noteType: 'playable', column: '2', keysound: '02' },
    ];
    const { noteGroups } = restoreMetaNoteRefs(deserializeMeta(serializeMeta(saved)), reloaded);
    expect(noteGroups![0].noteIds).toEqual(['note-1']);
  });
});
