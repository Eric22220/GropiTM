import { describe, expect, it } from 'vitest';
import { snapAfterDrag } from '../src/ui/kit';

const H = { peek: 200, half: 460, full: 760 };
describe('panoul de jos: poziția după tragere', () => {
  it('cea mai apropiată poziție la tragere lentă', () => {
    expect(snapAfterDrag(230, 0, H, 'peek')).toBe('peek');
    expect(snapAfterDrag(420, 0, H, 'peek')).toBe('half');
    expect(snapAfterDrag(700, 0.1, H, 'half')).toBe('full');
  });
  it('o tragere rapidă trece la poziția următoare în direcția gestului', () => {
    expect(snapAfterDrag(260, -1, H, 'peek')).toBe('half');
    expect(snapAfterDrag(400, 1, H, 'half')).toBe('peek');
    expect(snapAfterDrag(740, -1, H, 'full')).toBe('full');
    expect(snapAfterDrag(190, 1, H, 'peek')).toBe('peek');
  });
});
