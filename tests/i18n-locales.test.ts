import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const completeLocales = ['de', 'en', 'es', 'fr', 'ja', 'ko', 'pt_BR', 'zh_CN'];

function messages(locale: string): Record<string, { message: string }> {
  return JSON.parse(readFileSync(resolve('public', '_locales', locale, 'messages.json'), 'utf8'));
}

function placeholders(value: string): string[] {
  return [...value.matchAll(/\$\d+/g)].map(match => match[0]).sort();
}

describe('extension locales', () => {
  it('keeps every complete UI locale aligned with English', () => {
    const english = messages('en');
    for (const locale of completeLocales) {
      const localized = messages(locale);
      expect(Object.keys(localized).sort(), locale).toEqual(Object.keys(english).sort());
      for (const key of Object.keys(english)) {
        expect(placeholders(localized[key]!.message), `${locale}:${key}`).toEqual(placeholders(english[key]!.message));
      }
    }
  });
});
