// @vitest-environment node
import { app } from 'electron';
import { resolveInitialLocale } from '../../src/main/store/localeStore';

vi.mock('electron', () => ({
  app: { getLocale: vi.fn(() => 'en-US') },
}));

vi.mock('electron-store', () => ({
  default: class {
    get() {
      return undefined;
    }
    set() {
      /* no-op: persistence is not under test here */
    }
  },
}));

describe('resolveInitialLocale', () => {
  const originalTestLang = process.env['APP_TEST_LANG'];

  beforeEach(() => {
    delete process.env['APP_TEST_LANG'];
    vi.mocked(app.getLocale).mockReturnValue('en-US');
  });

  afterEach(() => {
    if (originalTestLang === undefined) delete process.env['APP_TEST_LANG'];
    else process.env['APP_TEST_LANG'] = originalTestLang;
  });

  it('uses an enabled OS locale', async () => {
    vi.mocked(app.getLocale).mockReturnValue('ko-KR');
    expect(await resolveInitialLocale()).toBe('ko');
  });

  it('falls back to en for a supported but not yet enabled OS locale', async () => {
    vi.mocked(app.getLocale).mockReturnValue('de-DE');
    expect(await resolveInitialLocale()).toBe('en');
  });

  it('ignores a not yet enabled APP_TEST_LANG', async () => {
    process.env['APP_TEST_LANG'] = 'ru';
    expect(await resolveInitialLocale()).toBe('en');
  });

  it('honours an enabled APP_TEST_LANG', async () => {
    process.env['APP_TEST_LANG'] = 'ja';
    expect(await resolveInitialLocale()).toBe('ja');
  });
});
