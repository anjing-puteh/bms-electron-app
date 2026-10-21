import { t } from '../../src/main/i18n/menu';

describe('main process BMS dialog titles', () => {
  it.each([
    ['ko', 'BMS 파일 열기', 'BMS 폴더 열기', 'BMS 파일 저장'],
    ['en', 'Open BMS File', 'Open BMS Folder', 'Save BMS File'],
    ['ja', 'BMSファイルを開く', 'BMSフォルダを開く', 'BMSファイルを保存'],
  ] as const)('localizes the file dialog titles for %s', (locale, open, folder, save) => {
    expect(t(locale, 'dialog.openBmsFile')).toBe(open);
    expect(t(locale, 'dialog.openBmsFolder')).toBe(folder);
    expect(t(locale, 'dialog.saveBmsFile')).toBe(save);
  });

  it('falls back to English titles for a locale without a menu dictionary', () => {
    expect(t('ru', 'dialog.saveBmsFile')).toBe('Save BMS File');
  });
});
