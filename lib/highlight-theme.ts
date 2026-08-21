export type HighlightSurface = 'light' | 'dark';

export interface RgbColor { red: number; green: number; blue: number; alpha: number }

export function parseCssColor(value: string): RgbColor | null {
  if (value === 'transparent') return { red: 0, green: 0, blue: 0, alpha: 0 };
  const values = value.match(/[\d.]+/g)?.map(Number);
  if (!values || values.length < 3) return null;
  return {
    red: values[0]!, green: values[1]!, blue: values[2]!,
    alpha: values[3] ?? 1
  };
}

export function relativeLuminance(color: RgbColor): number {
  const channel = (value: number) => {
    const normalized = value / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(color.red) + 0.7152 * channel(color.green) + 0.0722 * channel(color.blue);
}

export function cssColorLightness(value: string): number | null {
  const normalized = value.trim().toLowerCase();
  const first = normalized.match(/[\d.]+%?/)?.[0];
  if ((normalized.startsWith('oklch(') || normalized.startsWith('oklab(')) && first) {
    const lightness = Number.parseFloat(first);
    return first.endsWith('%') ? lightness / 100 : lightness;
  }
  if (normalized.startsWith('lab(') && first) {
    const lightness = Number.parseFloat(first);
    return first.endsWith('%') ? lightness / 100 : lightness / 100;
  }
  if (normalized.startsWith('color(srgb')) {
    const channels = normalized.match(/[\d.]+/g)?.map(Number).slice(0, 3);
    if (!channels || channels.length < 3) return null;
    return relativeLuminance({ red: channels[0]! * 255, green: channels[1]! * 255, blue: channels[2]! * 255, alpha: 1 });
  }
  const rgb = parseCssColor(value);
  return rgb ? relativeLuminance(rgb) : null;
}

export function chooseHighlightSurface(textColor: string, backgroundColors: string[]): HighlightSurface {
  const textLightness = cssColorLightness(textColor);
  if (textLightness !== null && textLightness >= 0.55) return 'dark';
  const background = backgroundColors
    .map(value => ({ color: parseCssColor(value), lightness: cssColorLightness(value) }))
    .find(item => item.lightness !== null && (!item.color || item.color.alpha >= 0.25));
  return background?.lightness !== undefined && background.lightness !== null && background.lightness < 0.35 ? 'dark' : 'light';
}
