import { describe, expect, it } from 'vitest';
import { chooseHighlightSurface, cssColorLightness, parseCssColor, relativeLuminance } from '../lib/highlight-theme';

describe('adaptive highlight theme', () => {
  it('解析 Chrome 返回的 rgb 与 rgba 颜色', () => {
    expect(parseCssColor('rgb(245, 245, 245)')).toEqual({ red: 245, green: 245, blue: 245, alpha: 1 });
    expect(parseCssColor('rgba(12, 14, 18, 0.8)')).toEqual({ red: 12, green: 14, blue: 18, alpha: 0.8 });
  });

  it('白字始终选择深色高亮底', () => {
    expect(chooseHighlightSurface('rgb(245, 245, 245)', ['rgba(0, 0, 0, 0)', 'rgb(33, 33, 33)'])).toBe('dark');
  });

  it('识别 ChatGPT 使用的 OKLCH 暗黑主题颜色', () => {
    expect(cssColorLightness('oklch(0.985 0 0)')).toBeCloseTo(0.985);
    expect(cssColorLightness('oklch(14.5% 0 0)')).toBeCloseTo(0.145);
    expect(chooseHighlightSurface('oklch(0.985 0 0)', ['oklch(0.145 0 0)'])).toBe('dark');
  });

  it('识别 color(srgb) 计算色', () => {
    expect(chooseHighlightSurface('color(srgb 0.95 0.95 0.95)', ['color(srgb 0.1 0.1 0.1)'])).toBe('dark');
  });

  it('暗背景即使文字颜色不明确也选择深色高亮底', () => {
    expect(chooseHighlightSurface('rgb(120, 120, 120)', ['transparent', 'rgb(20, 20, 20)'])).toBe('dark');
  });

  it('浅色页面保留柔和浅色高亮', () => {
    expect(chooseHighlightSurface('rgb(32, 32, 32)', ['rgb(255, 255, 255)'])).toBe('light');
  });

  it('亮色与暗色的亮度判断有明显间隔', () => {
    expect(relativeLuminance(parseCssColor('rgb(255,255,255)')!)).toBeGreaterThan(0.9);
    expect(relativeLuminance(parseCssColor('rgb(20,20,20)')!)).toBeLessThan(0.02);
  });
});
