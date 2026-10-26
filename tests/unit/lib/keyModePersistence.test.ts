import { BMSParser, BMSWriter, Notes, encodeText, styleForKeyMode } from '@rhythm-archive/bms-core';
import type { EditableBMSChart, EditableBMSNote } from '@rhythm-archive/bms-core';
import type { KeyMode } from '@rhythm-archive/bms-editor';
import {
  contentHash,
  keyModeMetaFields,
  keyModeNeedsMeta,
  readWithSavedKeyMode,
  tagAutoSave,
  untagAutoSave,
} from '../../../src/renderer/lib/keyModePersistence';

type Lane = string | { column: string; noteType?: EditableBMSNote['noteType']; ln?: boolean };

function chartOf(lanes: Lane[], keyMode: KeyMode, custom = new Map<string, string>()): EditableBMSChart {
  const notes = lanes.map((lane, i) => {
    const { column, noteType = 'playable', ln = false } = typeof lane === 'string' ? { column: lane } : lane;
    return {
      id: `n${i}`,
      tick: i * 240,
      beat: i / 4,
      measure: -1,
      fraction: -1,
      column,
      keysound: '01',
      noteType,
      channel: '',
      ...(ln ? { endTick: i * 240 + 120, endBeat: i / 4 + 0.125 } : {}),
    };
  }) as EditableBMSNote[];
  return {
    headers: {
      player: 1,
      bpm: 120,
      wav: new Map([['01', 'a.wav']]),
      bmp: new Map(),
      bpmDef: new Map(),
      stopDef: new Map(),
      custom,
    },
    notes,
    timeSignatures: new Map(),
    bpmChanges: [],
    stopEvents: [],
    bgaEvents: [],
    style: styleForKeyMode(keyMode),
  };
}

/** Save with the editor's layout, then reload like the loader does. */
function saveAndReload(lanes: Lane[], keyMode: KeyMode, custom?: Map<string, string>) {
  const content = new BMSWriter().write(chartOf(lanes, keyMode, custom));
  const chart = new BMSParser().compileString(content);
  return { content, chart, detected: Notes.fromBMSChart(chart).all() };
}

const columnsOf = (lanes: Lane[]) => lanes.map((l) => (typeof l === 'string' ? l : l.column)).sort();
const laneColumns = (notes: Array<{ column?: string | null }>) =>
  notes.filter((n) => n.column).map((n) => n.column).sort();

describe('key mode survives save and reload', () => {
  const cases: Array<[string, KeyMode, Lane[]]> = [
    ['6K using only two lanes', '6K', ['1', '2', '1', '2']],
    ['4K using only scratch and lane 1', '4K', ['SC', '1']],
    ['4K with a busy FZ lane (reads as keyboard)', '4K', ['SC', '1', '2', '4', '5', 'FZ', 'FZ', 'FZ', 'FZ']],
    ['7K with a busy FZ lane', '7K', ['SC', '1', '2', '3', '4', '5', '6', '7', 'FZ', 'FZ', 'FZ', 'FZ', 'FZ']],
    ['8K with lanes 6 and 7 empty', '8K', ['1', '2', '3', '4', '5', '8']],
    ['8K with a sparse lane 7', '8K', ['1', '2', '3', '4', '5', '6', '8', '1', '2', '3', '4', '5', '6', '8', '7']],
    ['12K with lane 7 empty', '12K', ['1', '2', '3', '4', '5', '6', '8', '9', '10', '11', '12']],
    // DP charts that read as PMS: the LN / landmine lanes have no PMS channel
    ['12K with a lane-6 long note', '12K', ['1', '2', '3', '11', '12', { column: '6', ln: true }]],
    ['10K with a scratch long note', '10K', ['1', '2', '3', '4', '5', '9', '10', '11', '12', { column: 'SC', ln: true }]],
    ['14K with a scratch landmine', '14K', ['1', '2', '3', '4', '5', '9', '10', '11', '12', { column: 'SC', noteType: 'landmine' }]],
  ];

  it.each(cases)('%s: recorded at save, every lane restored at load', (_name, keyMode, lanes) => {
    const { content, chart, detected } = saveAndReload(lanes, keyMode);
    expect(keyModeNeedsMeta(content, keyMode)).toBe(true);
    const saved = readWithSavedKeyMode(chart, detected, { keyMode }, content);
    expect(saved?.keyMode).toBe(keyMode);
    expect(laneColumns(saved!.notes)).toEqual(columnsOf(lanes));
    // The editor model read with the same layout keeps every object as a note
    const editable = BMSWriter.fromBMSChart(chart, saved!.style);
    expect(laneColumns(editable.notes)).toEqual(columnsOf(lanes));
    expect(editable.extraObjects ?? []).toEqual([]);
  });

  it.each<[KeyMode, string[]]>([
    ['7K', ['SC', '1', '2', '3', '4', '5', '6', '7']],
    ['6K', ['SC', '1', '2', '3', '5', '6', '7']],
    ['8K', ['1', '2', '3', '4', '5', '6', '7', '8']],
  ])('%s that reloads as itself needs no sidecar entry', (keyMode, columns) => {
    expect(keyModeNeedsMeta(saveAndReload(columns, keyMode).content, keyMode)).toBe(false);
  });

  it('records the mode when a #KEYMODE header would override it', () => {
    const { content } = saveAndReload(['SC', '1', '2', '3', '4', '5', '6', '7'], '7K', new Map([['keymode', '6K']]));
    expect(content).toMatch(/#KEYMODE 6K/i);
    expect(keyModeNeedsMeta(content, '7K')).toBe(true);
  });

  it('ignores a stale 8K entry once the file holds an IIDX 7K chart', () => {
    const { content, chart, detected } = saveAndReload(['SC', '1', '2', '3', '4', '5', '6', '7'], '7K');
    // Saved with other text (outside edit / failed sidecar write)
    expect(readWithSavedKeyMode(chart, detected, { keyMode: '8K', contentHash: 'deadbeef' }, content)).toBeNull();
    expect(readWithSavedKeyMode(chart, detected, { keyMode: '8K' }, content)).toBeNull();
  });

  it('trusts the mode for its own save even with lanes the mode hides', () => {
    // 7K → 5K keeps the lane-6 notes (hidden, preserved) and writes them on channel 18
    const { content, chart, detected } = saveAndReload(['SC', '1', '2', '3', '4', '5', '6', '6'], '5K');
    const fields = keyModeMetaFields(content, '5K');
    expect(fields).toEqual({ keyMode: '5K', keyModeContentHash: contentHash(content) });
    expect(readWithSavedKeyMode(chart, detected, { keyMode: '5K' }, content)).toBeNull();
    const saved = readWithSavedKeyMode(chart, detected, { keyMode: '5K', contentHash: fields.keyModeContentHash }, content);
    expect(saved?.keyMode).toBe('5K');
    expect(laneColumns(saved!.notes)).toEqual(['1', '2', '3', '4', '5', '6', '6', 'SC']);
  });

  it('writes no sidecar fields when the mode reloads by itself', () => {
    expect(keyModeMetaFields(saveAndReload(['SC', '1', '2', '3', '4', '5', '6', '7'], '7K').content, '7K')).toEqual({});
  });

  it('hashes the same text after a Shift_JIS save and reload', async () => {
    const chart = chartOf(['1', '2'], '6K');
    chart.headers.title = 'さよなら';
    const content = new BMSWriter().write(chart);
    const parser = new BMSParser();
    const text = await parser.readBuffer(encodeText(content, 'shift_jis', false).bytes);
    expect(parser.encoding).toMatch(/shift/i);
    expect(contentHash(text)).toBe(contentHash(content));
  });

  it('does nothing without a recorded key mode', () => {
    const { content, chart, detected } = saveAndReload(['1', '2'], '6K');
    expect(readWithSavedKeyMode(chart, detected, undefined, content)).toBeNull();
  });
});

describe('autosave key mode tag', () => {
  it('round-trips the key mode and the content', () => {
    const tagged = tagAutoSave('#TITLE a\r\n#00111:01', '6K');
    expect(untagAutoSave(tagged)).toEqual({ content: '#TITLE a\r\n#00111:01', keyMode: '6K' });
  });

  it('passes untagged (older) autosaves through', () => {
    expect(untagAutoSave('#TITLE a')).toEqual({ content: '#TITLE a' });
  });

  it('is ignored by the parser as a comment line', () => {
    const chart = new BMSParser().compileString(tagAutoSave('#TITLE a\r\n#00111:01', '6K'));
    expect(chart.headers.get('title')).toBe('a');
  });
});
