/**
 * Short note ↔ long note conversion (context menu / L key).
 */
import { useEditorStore } from '../../../src/renderer/stores/editorStore';
import type { EditableBMSNote } from '@rhythm-archive/bms-core';

function note(id: string, tick: number, overrides: Partial<EditableBMSNote> = {}): EditableBMSNote {
  return {
    id, tick, beat: tick / 960, measure: 0, fraction: 0,
    column: '1', keysound: '01', noteType: 'playable', channel: '',
    ...overrides,
  } as EditableBMSNote;
}

function seed(notes: EditableBMSNote[], selected: string[]) {
  useEditorStore.setState({
    notes, selectedNotes: new Set(selected), undoStack: [], redoStack: [], hasUnsavedChanges: false,
  });
}

const s = () => useEditorStore.getState();
const byId = (id: string) => s().notes.find((n) => n.id === id)!;

beforeEach(() => {
  useEditorStore.setState(useEditorStore.getInitialState());
});

describe('convertToLongNotes', () => {
  it('gives a selected short note one grid step (min LN length floor)', () => {
    useEditorStore.setState({ gridSnap: 16, minLnLength: 0.25 });
    seed([note('a', 0)], ['a']);
    expect(s().convertToLongNotes()).toBe(1);
    expect(byId('a').endTick).toBe(240);
    expect(byId('a').endBeat).toBe(0.25);
    expect(s().hasUnsavedChanges).toBe(true);
    expect(s().undoStack).toHaveLength(1);
  });

  it('uses minLnLength when it is longer than the grid step', () => {
    useEditorStore.setState({ gridSnap: 64, minLnLength: 1 });
    seed([note('a', 960)], ['a']);
    s().convertToLongNotes();
    expect(byId('a').endTick).toBe(1920);
  });

  it('stops a grid step before the next note in the same lane', () => {
    useEditorStore.setState({ gridSnap: 16, minLnLength: 1 });
    seed([note('a', 0), note('b', 480), note('c', 240, { column: '2' })], ['a']);
    s().convertToLongNotes();
    expect(byId('a').endTick).toBe(240);
  });

  it('skips a note with no room before the next note', () => {
    useEditorStore.setState({ gridSnap: 16 });
    seed([note('a', 0), note('b', 240)], ['a']);
    expect(s().convertToLongNotes()).toBe(0);
    expect(byId('a').endTick).toBeUndefined();
    expect(s().undoStack).toHaveLength(0);
  });

  it('leaves BGM, invisible, landmine and existing long notes alone', () => {
    seed([
      note('bgm', 0, { noteType: 'bgm', column: undefined, bgmChannel: 0 }),
      note('inv', 0, { noteType: 'invisible', column: '2' }),
      note('mine', 0, { noteType: 'landmine', column: '3' }),
      note('ln', 0, { column: '4', endTick: 1920, endBeat: 2 }),
    ], ['bgm', 'inv', 'mine', 'ln']);
    expect(s().convertToLongNotes()).toBe(0);
    expect(byId('ln').endTick).toBe(1920);
    expect(byId('inv').endTick).toBeUndefined();
  });

  it('is undoable', () => {
    seed([note('a', 0)], ['a']);
    s().convertToLongNotes();
    s().undo();
    expect(byId('a').endTick).toBeUndefined();
    expect(byId('a').endBeat).toBeUndefined();
  });
});

describe('convertToShortNotes', () => {
  it('clears the end of selected long notes only', () => {
    seed([
      note('a', 0, { endTick: 960, endBeat: 1, endMeasure: 0, endFraction: 0.25 }),
      note('b', 0, { column: '2', endTick: 960, endBeat: 1 }),
    ], ['a']);
    expect(s().convertToShortNotes()).toBe(1);
    expect(byId('a')).toMatchObject({ endTick: undefined, endBeat: undefined, endMeasure: undefined, endFraction: undefined });
    expect(byId('b').endTick).toBe(960);
  });

  it('reverts long notes when the short ones in the selection have no room', () => {
    useEditorStore.setState({ gridSnap: 16 });
    seed([
      note('a', 0), note('blocker', 240),
      note('b', 0, { column: '2', endTick: 960, endBeat: 1 }),
    ], ['a', 'b']);
    expect(s().toggleLongNotes()).toBe(1);
    expect(byId('b').endTick).toBeUndefined();
    expect(byId('a').endTick).toBeUndefined();
  });
});

describe('toggleLongNotes', () => {
  it('converts short → long, then long → short', () => {
    useEditorStore.setState({ gridSnap: 16, minLnLength: 0.25 });
    seed([note('a', 0)], ['a']);
    s().toggleLongNotes();
    expect(byId('a').endTick).toBe(240);
    s().toggleLongNotes();
    expect(byId('a').endTick).toBeUndefined();
  });

  it('prefers making long notes when the selection mixes short and long', () => {
    seed([note('a', 0), note('b', 0, { column: '2', endTick: 960, endBeat: 1 })], ['a', 'b']);
    s().toggleLongNotes();
    expect(byId('a').endTick).toBeDefined();
    expect(byId('b').endTick).toBe(960);
  });

  it('reverts long notes when the short ones in the selection have no room', () => {
    useEditorStore.setState({ gridSnap: 16 });
    seed([
      note('a', 0), note('blocker', 240),
      note('b', 0, { column: '2', endTick: 960, endBeat: 1 }),
    ], ['a', 'b']);
    expect(s().toggleLongNotes()).toBe(1);
    expect(byId('b').endTick).toBeUndefined();
    expect(byId('a').endTick).toBeUndefined();
  });
});
