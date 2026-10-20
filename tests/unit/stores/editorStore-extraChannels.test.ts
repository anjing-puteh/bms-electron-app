/**
 * Editor load -> save keeps channels it does not model (TEXT 99, JUDGE A0,
 * extension lanes 1A-2Z ...) and the 10K 2P channels.
 */
import { BMSParser, BMSWriter } from '@rhythm-archive/bms-core';
import type { EditableBMSNote } from '@rhythm-archive/bms-core';
import { useEditorStore } from '../../../src/renderer/stores/editorStore';
import { isEditableNote } from '../../../src/renderer/hooks/useLocalBmsFile';

vi.mock('i18next', () => ({ default: { t: (k: string) => k } }));

/** Mirrors Editor.tsx: parse, build the editable chart, seed the store, save. */
function loadAndSave(text: string, keyMode?: string): string {
  const parser = new BMSParser();
  parser.compileString(text);
  const ec = BMSWriter.fromBMSChart(parser.chart!);
  const notes: EditableBMSNote[] = parser.getNotes()!.all().filter(isEditableNote).map((n, i) => ({
    id: `note-${i}`,
    beat: n.beat,
    tick: Math.round(n.beat * 960),
    column: n.column || '',
    noteType: n.noteType ?? 'playable',
    keysound: (n.keysound || '00').toUpperCase(),
    measure: n.measure ?? 0,
    fraction: n.fraction ?? 0,
    channel: n.channel || '',
  }));
  useEditorStore.getState().initFromChart(ec, notes, notes.length + 1, keyMode as never);
  return new BMSWriter().write(useEditorStore.getState().savableChart()!);
}

const channelLines = (text: string) =>
  text.split(/\r?\n/).filter((l) => /^#\d{3}[0-9A-Za-z]{2}:/.test(l)).sort();

describe('editor save keeps unmodelled channels', () => {
  it('writes back 99 / A0 / 05 / 1A objects', () => {
    const src = [
      '#PLAYER 1', '#BPM 120', '#WAV01 a.wav', '#TEXT01 hi', '#EXRANK01 50',
      '#00111:01', '#00199:01', '#001A0:01', '#00105:01', '#0011A:01',
    ].join('\n');
    const out = channelLines(loadAndSave(src));
    expect(out).toEqual(['#00105:01', '#00111:01', '#0011A:01', '#00199:01', '#001A0:01']);
  });

  it('an extension-lane object is not also written as BGM', () => {
    const out = channelLines(loadAndSave(['#BPM 120', '#WAV01 a.wav', '#0011A:01'].join('\n')));
    expect(out).toEqual(['#0011A:01']);
  });

  it('isEditableNote: BGM and mapped lane notes only', () => {
    expect(isEditableNote({ noteType: 'bgm', column: undefined })).toBe(true);
    expect(isEditableNote({ noteType: 'playable', column: '1' })).toBe(true);
    expect(isEditableNote({ noteType: 'playable', column: undefined })).toBe(false);
  });
});

describe('editor save keeps 10K 2P channels', () => {
  it('a 10K chart saves its 2P notes back to 21-26', () => {
    const src = [
      '#PLAYER 3', '#BPM 150', '#WAV01 a.wav',
      '#00111:01', '#00116:01', '#00121:01', '#00125:01', '#00126:01',
    ].join('\n');
    expect(channelLines(loadAndSave(src, '10K'))).toEqual(
      ['#00111:01', '#00116:01', '#00121:01', '#00125:01', '#00126:01'],
    );
  });
});
