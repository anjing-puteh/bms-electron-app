/**
 * Editor save keeps the chart's source encoding (Shift_JIS / EUC-KR ...).
 */
import { BMSParser } from '@rhythm-archive/bms-core';
import { encodeForSave } from '../../../src/renderer/hooks/useLocalBmsFile';

// "#TITLE テスト\n" in Shift_JIS
const SJIS = new Uint8Array([0x23, 0x54, 0x49, 0x54, 0x4c, 0x45, 0x20, 0x83, 0x65, 0x83, 0x58, 0x83, 0x67, 0x0a]);
// "#TITLE 사랑\n" in EUC-KR
const EUCKR = new Uint8Array([0x23, 0x54, 0x49, 0x54, 0x4c, 0x45, 0x20, 0xbb, 0xe7, 0xb6, 0xfb, 0x0a]);

async function load(bytes: Uint8Array) {
  const parser = new BMSParser();
  const text = await parser.readBuffer(bytes);
  return { text, chart: { sourceEncoding: parser.encoding ?? 'utf-8', sourceBom: parser.bom } };
}

describe('encodeForSave', () => {
  it.each([
    ['Shift_JIS', SJIS],
    ['EUC-KR', EUCKR],
  ])('a %s chart is written back byte for byte', async (_name, bytes) => {
    const { text, chart } = await load(bytes);
    const { content, fellBack } = encodeForSave(text, chart);
    expect(fellBack).toBe(false);
    expect([...(content as Uint8Array)]).toEqual([...bytes]);
  });

  it('a UTF-8 chart stays text (written as UTF-8 by the main process)', async () => {
    const { text, chart } = await load(new TextEncoder().encode('#TITLE 한국어 テスト\n'));
    expect(encodeForSave(text, chart)).toEqual({ content: text, fellBack: false });
  });

  it('a UTF-8 chart with BOM keeps its BOM', async () => {
    const { text, chart } = await load(new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('#TITLE a\n')]));
    const { content } = encodeForSave(text, chart);
    expect([...(content as Uint8Array).slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it('falls back to UTF-8 with BOM when an edit added a character the source encoding lacks', async () => {
    const { text, chart } = await load(SJIS);
    const { content, fellBack } = encodeForSave(text + '#ARTIST 한국어\n', chart);
    expect(fellBack).toBe(true);
    expect([...(content as Uint8Array).slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it('charts without encoding info (new files) are written as text', () => {
    expect(encodeForSave('#TITLE x', null)).toEqual({ content: '#TITLE x', fellBack: false });
  });
});
