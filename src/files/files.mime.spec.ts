import { assertPngOrPdf } from './files.mime';

describe('assertPngOrPdf', () => {
  it('accepts png under limit', () => {
    expect(() => assertPngOrPdf('image/png', 100)).not.toThrow();
  });

  it('rejects jpeg', () => {
    expect(() => assertPngOrPdf('image/jpeg', 100)).toThrow(/PNG and PDF/);
  });

  it('rejects oversize', () => {
    expect(() =>
      assertPngOrPdf('application/pdf', 21 * 1024 * 1024),
    ).toThrow(/20 MB/);
  });
});
