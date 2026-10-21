/**
 * estimateDifficulty: only notes the player hits count.
 */
import type { EditableBMSNote } from '@rhythm-archive/bms-core';
import { estimateDifficulty } from '../../../src/renderer/components/ChartStatsView';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

function notes(count: number, noteType: EditableBMSNote['noteType']): EditableBMSNote[] {
  return Array.from({ length: count }, (_, i) => ({ beat: i / 4, noteType }) as EditableBMSNote);
}

describe('estimateDifficulty', () => {
  it('ignores invisible notes (ch 31-4Z)', () => {
    const visible = notes(64, 'playable');
    expect(estimateDifficulty([...visible, ...notes(400, 'invisible')], 150, 64))
      .toBe(estimateDifficulty(visible, 150, 64));
  });

  it('returns 0 for a chart with only invisible / BGM notes', () => {
    expect(estimateDifficulty([...notes(10, 'invisible'), ...notes(10, 'bgm')], 150, 64)).toBe(0);
  });
});
