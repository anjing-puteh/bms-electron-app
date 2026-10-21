/**
 * Player chart → engine input
 *
 * - Invisible objects (ch 31-4Z) only supply keysounds: never rendered/judged.
 * - #RANK / #DEFEXRANK / #TOTAL reach the game options.
 */
import { BMSParser } from '@rhythm-archive/bms-core';
import { JudgmentEngine } from '@rhythm-archive/bms-player';
import { splitPlayerNotes, chartJudgeOptions } from '../../../src/renderer/routes/Player';

vi.mock('../../../src/renderer/workers/gameLoop.worker?worker', () => ({
  default: class {
    postMessage() {}
    terminate() {}
  },
}));

function compile(lines: string[]) {
  const parser = new BMSParser();
  const chart = parser.compileString(lines.join('\n'));
  return { chart, notes: parser.getNotes()!.all() };
}

const HEADER = ['#PLAYER 1', '#BPM 120', '#WAV01 a.wav', '#WAV02 b.wav', '#WAV03 c.wav'];

describe('splitPlayerNotes', () => {
  it('excludes invisible notes (ch 31) from the playable notechart input', () => {
    const { notes } = compile([
      ...HEADER,
      '#00111:01',  // visible 1P key 1
      '#00131:02',  // invisible 1P key 1
      '#001D1:03',  // landmine 1P key 1
      '#00101:01',  // BGM
    ]);
    expect(notes.some((n) => n.noteType === 'invisible')).toBe(true);

    const { playable, landmines } = splitPlayerNotes(notes);
    expect(playable.some((n) => n.noteType === 'invisible')).toBe(false);
    expect(playable.filter((n) => n.noteType === 'playable')).toHaveLength(1);
    expect(playable.filter((n) => n.noteType === 'bgm')).toHaveLength(1);
    expect(landmines).toHaveLength(1);
    expect(landmines[0].noteType).toBe('landmine');
  });
});

describe('chartJudgeOptions', () => {
  it('passes #RANK, #DEFEXRANK and #TOTAL through to the engine', () => {
    const { chart } = compile([...HEADER, '#RANK 0', '#DEFEXRANK 120.5', '#TOTAL 350']);
    expect(chartJudgeOptions(chart.headers)).toEqual({ rank: 0, defexrank: 120.5, total: 350 });
    const { chart: c2 } = compile([...HEADER, '#RANK 1', '#TOTAL 300']);
    expect(chartJudgeOptions(c2.headers)).toEqual({ rank: 1, total: 300 });
  });

  it('#DEFEXRANK 120 widens the RANK 2 windows by 1.2x in the engine', () => {
    const { chart } = compile([...HEADER, '#RANK 2', '#DEFEXRANK 120']);
    const windows = new JudgmentEngine({ ...chartJudgeOptions(chart.headers) }).getWindows();
    expect(windows.pgreat).toBeCloseTo(18 * 1.2, 1);
    expect(windows.good).toBeCloseTo(100 * 1.2, 1);
  });

  it('#DEFEXRANK 100 plays with the same judge windows as #RANK 2', () => {
    const { chart } = compile([...HEADER, '#RANK 2', '#DEFEXRANK 100']);
    const rank2 = new JudgmentEngine({ rank: 2 });
    for (const style of ['lr2', 'beatoraja'] as const) {
      const fromHeaders = new JudgmentEngine({ ...chartJudgeOptions(chart.headers), style });
      const ref = new JudgmentEngine({ rank: 2, style });
      for (const offset of [10, 17, 30, 44, 60, 90, 110, 150]) {
        expect(fromHeaders.judge(offset, 0).judgment).toBe(ref.judge(offset, 0).judgment);
      }
    }
    // NORMAL GOOD window (LR2 100ms). Not narrowed to 64ms
    expect(new JudgmentEngine({ ...chartJudgeOptions(chart.headers) }).judge(90, 0).judgment)
      .toBe(rank2.judge(90, 0).judgment);
    expect(rank2.judge(90, 0).judgment).toBe('GOOD');
  });

  it('#RANK after #DEFEXRANK (closer to EOF) wins; #DEFEXRANK after #RANK wins', () => {
    const { chart: rankLast } = compile([...HEADER, '#DEFEXRANK 120', '#RANK 1']);
    expect(chartJudgeOptions(rankLast.headers)).toEqual({ rank: 1 });
    const { chart: defexLast } = compile([...HEADER, '#RANK 1', '#DEFEXRANK 120']);
    expect(chartJudgeOptions(defexLast.headers)).toEqual({ rank: 1, defexrank: 120 });
    // An invalid later #RANK does not cancel a valid #DEFEXRANK
    const { chart: badRank } = compile([...HEADER, '#DEFEXRANK 80', '#RANK EASY']);
    expect(chartJudgeOptions(badRank.headers)).toEqual({ defexrank: 80 });
  });

  it('accepts #RANK 4 (VERY EASY) and lower-case header names', () => {
    const { chart } = compile([...HEADER, '#rank 4', '#total 260']);
    expect(chartJudgeOptions(chart.headers)).toEqual({ rank: 4, total: 260 });
  });

  it('leaves absent headers undefined so engine defaults apply', () => {
    const { chart } = compile(HEADER);
    expect(chartJudgeOptions(chart.headers)).toEqual({});
    expect(chartJudgeOptions(null)).toEqual({});
  });

  it('treats non-numeric or out-of-range values as absent', () => {
    const { chart } = compile([...HEADER, '#RANK EASY', '#DEFEXRANK -5', '#TOTAL abc']);
    expect(chartJudgeOptions(chart.headers)).toEqual({});
    const { chart: c2 } = compile([...HEADER, '#RANK 7', '#TOTAL 0']);
    expect(chartJudgeOptions(c2.headers)).toEqual({});
  });
});
