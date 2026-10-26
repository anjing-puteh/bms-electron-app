/**
 * Qwilight #4K / #6K / #8K (U_E "Yuipack") handling: save headers, write
 * layout, 0.5.5 sidecar migration and the lanes the modes play.
 */
import { BMSParser, BMSWriter, Notes, styleForKeyMode } from '@rhythm-archive/bms-core';
import type { BMSHeaderData, EditableBMSChart, EditableBMSNote } from '@rhythm-archive/bms-core';
import { detectKeyMode } from '@rhythm-archive/bms-editor';
import { withKeyModeCommand, writeStyleFor } from '../../../src/renderer/stores/editorStore';
import {
  contentHash,
  keyModeMetaFields,
  readWithLayout,
  readWithSavedKeyMode,
  tagAutoSave,
  untagAutoSave,
} from '../../../src/renderer/lib/keyModePersistence';
import { filterPlayedNotes, isScratchColumn, playedLanes } from '../../../src/renderer/lib/keyModeLanes';

function headers(custom: Array<[string, string]> = []): BMSHeaderData {
  return {
    player: 1,
    bpm: 120,
    wav: new Map([['01', 'a.wav']]),
    bmp: new Map(),
    bpmDef: new Map(),
    stopDef: new Map(),
    custom: new Map(custom),
  };
}

function parse(text: string) {
  const chart = new BMSParser().compileString(text);
  return { chart, notes: Notes.fromBMSChart(chart).all(), editable: BMSWriter.fromBMSChart(chart) };
}

const lines = (text: string) => text.split(/\r?\n/);

describe('withKeyModeCommand', () => {
  it('adds the value-less command for 4K / 6K / 8K only', () => {
    expect([...withKeyModeCommand(headers(), '6K').custom]).toEqual([['6K', '']]);
    expect([...withKeyModeCommand(headers(), '8K').custom]).toEqual([['8K', '']]);
    expect(withKeyModeCommand(headers(), '7K').custom.size).toBe(0);
  });

  it('returns the same headers when nothing changes', () => {
    const h = headers([['6K', '']]);
    expect(withKeyModeCommand(h, '6K')).toBe(h);
  });

  it('rewrites a command that carries a value (Qwilight ignores "#6K 1")', () => {
    expect([...withKeyModeCommand(headers([['6K', '1']]), '6K').custom]).toEqual([['6K', '']]);
  });

  it('keeps #KEYMODE in step with the mode', () => {
    const out = withKeyModeCommand(headers([['KEYMODE', '7K']]), '8K');
    expect(out.custom.get('KEYMODE')).toBe('8K');
    expect(out.custom.get('8K')).toBe('');
  });

  it('a saved #KEYMODE 7K + #8K chart reopens as 8K', () => {
    const chart: EditableBMSChart = {
      headers: withKeyModeCommand(headers([['KEYMODE', '7K']]), '8K'),
      notes: [],
      timeSignatures: new Map(),
      bpmChanges: [],
      stopEvents: [],
      bgaEvents: [],
      style: styleForKeyMode('8K'),
    };
    const { chart: reloaded, notes } = parse(new BMSWriter().write(chart));
    expect(detectKeyMode(notes, reloaded.headers)).toBe('8K');
  });
});

describe('writeStyleFor', () => {
  it('keeps the read layout when it has a channel for every lane of the mode', () => {
    expect(writeStyleFor('9K', { id: 'keyboard', isDP: false })).toEqual({ id: 'keyboard', isDP: false });
  });

  it('always writes 4K / 6K / 8K on the IIDX channels Qwilight reads', () => {
    for (const mode of ['4K', '6K', '8K'] as const) {
      expect(writeStyleFor(mode, { id: 'keyboard', isDP: false })).toEqual({ id: 'iidx', isDP: false });
    }
  });

  it('reads a #6K file on the IIDX channels even when channel 17 makes it look like keyboard', () => {
    const text = ['#PLAYER 1', '#6K', '#WAV01 a.wav', ...['11', '12', '13', '15', '17', '17', '18', '19'].map((c, i) => `#00${i}${c}:01`)].join('\n');
    const { chart, editable } = parse(text);
    expect(editable.style?.id).toBe('keyboard');
    const read = readWithLayout(chart, '6K', styleForKeyMode('6K'));
    const played = filterPlayedNotes(read.notes, '6K').map((n) => n.column).sort();
    expect(played).toEqual(['1', '2', '3', '5', '6', '7']);
  });

  it('uses the mode layout when the read layout lacks lanes', () => {
    expect(writeStyleFor('9K', { id: 'iidx', isDP: false })).toEqual(styleForKeyMode('9K'));
    expect(writeStyleFor('8K', { id: 'keyboard', isDP: false })).toEqual({ id: 'iidx', isDP: false });
  });

  it('an 8-key keyboard chart opened as 9K is saved back on channels 11-18', () => {
    const text = ['#PLAYER 1', '#WAV01 a.wav', ...['11', '12', '13', '14', '15', '16', '17', '18'].map((c) => `#001${c}:01`)].join('\n');
    const { chart, notes, editable } = parse(text);
    const keyMode = detectKeyMode(notes, chart.headers);
    expect(keyMode).toBe('9K');
    const style = writeStyleFor(keyMode, editable.style);
    const written = new BMSWriter().write({ ...editable, style });
    const channels = lines(written).filter((l) => /^#001\d\d:/.test(l)).map((l) => l.slice(4, 6)).sort();
    expect(channels).toEqual(['11', '12', '13', '14', '15', '16', '17', '18']);
    expect(keyModeMetaFields(written, keyMode, style)).toEqual({});
  });
});

describe('0.5.5 8K files (keyboard lanes on 11-18)', () => {
  // 0.5.5 lanes 1-8 → channels 11-18; lane 7 (ch17) sparse, so it reads as IIDX
  const text = ['#PLAYER 1', '#WAV01 a.wav', '#00111:01', '#00116:01', '#00117:01', '#00118:01'].join('\n');

  it('moves every note to the same lane position of the new 8K', () => {
    const { chart, notes } = parse(text);
    const saved = readWithSavedKeyMode(chart, notes, { keyMode: '8K', contentHash: contentHash(text) }, text);
    expect(saved?.keyMode).toBe('8K');
    // lane 1 → leftmost key, lane 6 → '5', lane 7 → '6', lane 8 → '7'
    expect(saved!.notes.map((n) => n.column).sort()).toEqual(['5', '6', '7', 'SC']);
  });

  it('is saved as #8K on the Qwilight channels afterwards', () => {
    const { chart, notes } = parse(text);
    const saved = readWithSavedKeyMode(chart, notes, { keyMode: '8K', contentHash: contentHash(text) }, text)!;
    const editable = BMSWriter.fromBMSChart(chart, saved.style);
    const remapped = editable.notes.map((n, i) => ({ ...n, column: saved.notes[i]?.column ?? n.column })) as EditableBMSNote[];
    const style = writeStyleFor('8K', saved.style);
    const written = new BMSWriter().write({ ...editable, notes: remapped, style, headers: withKeyModeCommand(editable.headers, '8K') });
    const channels = lines(written).filter((l) => /^#001\d\d:/.test(l)).map((l) => l.slice(4, 6)).sort();
    expect(channels).toEqual(['16', '18', '19', '15'].sort());
    expect(lines(written)).toContain('#8K');
  });

  it('a sidecar written now (with layout) is read with that layout', () => {
    const { chart, notes } = parse(text);
    const saved = readWithSavedKeyMode(chart, notes, { keyMode: '9K', style: { id: 'keyboard', isDP: false } }, text);
    expect(saved?.style).toEqual({ id: 'keyboard', isDP: false });
    expect(saved!.notes.map((n) => n.column).sort()).toEqual(['1', '6', '7', '8']);
  });
});

describe('autosave tag', () => {
  it('carries the write layout', () => {
    const tagged = tagAutoSave('#TITLE a', '9K', { id: 'keyboard', isDP: false });
    expect(untagAutoSave(tagged)).toEqual({ content: '#TITLE a', keyMode: '9K', style: { id: 'keyboard', isDP: false } });
  });
});

describe('lanes Qwilight plays', () => {
  it('4K / 6K / 8K drop notes on other lanes; other modes keep them', () => {
    const notes = [{ column: 'SC' }, { column: '1' }, { column: '3' }, { column: '4' }, {}];
    expect(filterPlayedNotes(notes, '4K').map((n) => n.column)).toEqual(['1', '4', undefined]);
    expect(filterPlayedNotes(notes, '6K').map((n) => n.column)).toEqual(['1', '3', undefined]);
    expect(filterPlayedNotes(notes, '8K').map((n) => n.column)).toEqual(['SC', '1', '3', '4', undefined]);
    expect(filterPlayedNotes(notes, '7K')).toBe(notes);
    expect(playedLanes('7K')).toBeNull();
  });

  it('8K has no scratch', () => {
    expect(isScratchColumn('SC', '8K')).toBe(false);
    expect(isScratchColumn('SC', '7K')).toBe(true);
    expect(isScratchColumn('SC2', '14K')).toBe(true);
  });
});
