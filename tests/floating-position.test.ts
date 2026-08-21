import { describe, expect, it } from 'vitest';
import { resolveFloatingPosition, type RectLike } from '../lib/floating-position';

const rect = (left: number, top: number, width: number, height: number): RectLike => ({
  left, top, width, height, right: left + width, bottom: top + height
});

describe('floating button positioning', () => {
  it('默认居中放在选区上方', () => {
    expect(resolveFloatingPosition(rect(200, 200, 160, 20), [], { width: 800, height: 600 }))
      .toEqual({ left: 242, top: 158 });
  });

  it('跟随 ChatGPT 原生按钮组之后', () => {
    const position = resolveFloatingPosition(rect(200, 200, 160, 20), [
      rect(230, 156, 42, 36), rect(274, 156, 42, 36), rect(318, 156, 42, 36)
    ], { width: 800, height: 600 });
    expect(position.left).toBe(368);
    expect(position.top).toBe(158);
  });

  it('右侧空间不足时退到选区下方', () => {
    const position = resolveFloatingPosition(rect(650, 200, 120, 20), [rect(650, 156, 110, 36)], { width: 800, height: 600 });
    expect(position).toEqual({ left: 694, top: 230 });
  });

  it('多行选区贴近视口顶部时仍放在原生工具条之后', () => {
    const position = resolveFloatingPosition(rect(82, 4, 858, 100), [
      rect(77, 16, 463, 55),
      rect(77, 16, 171, 55),
      rect(248, 16, 122, 55),
      rect(370, 16, 170, 55)
    ], { width: 940, height: 500 });
    expect(position).toEqual({ left: 548, top: 27.5 });
  });
});
