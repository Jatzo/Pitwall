import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { defaultTeams } from '../data/teams.ts';
import { contrast, inkFor } from './colour.ts';

const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const rootBlock = css.match(/:root\s*\{([^}]*)\}/)?.[1] ?? '';
const tokens = new Map<string, string>();
for (const m of rootBlock.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) tokens.set(m[1], m[2].toLowerCase());

function token(name: string): string {
  const value = tokens.get(name);
  assert.ok(value, `--${name} must be a six-digit hex token in :root`);
  return value;
}

/** Every text colour the UI puts on every surface it sits on. */
const PAIRS: [text: string, surface: string][] = [
  ...['text', 'muted', 'accent-ink'].flatMap((t) => ['bg', 'panel', 'panel-2', 'zebra'].map((s) => [t, s] as [string, string])),
  ['on-accent', 'accent'],
  ['faded', 'panel'],
  ['faded', 'zebra'],
  ['good', 'panel'],
  ['warn', 'panel'],
  ['bad', 'panel'],
  ['purple', 'panel'],
  ['pill-green-ink', 'pill-green'],
  ['pill-sc-ink', 'pill-sc'],
  ['pill-rain-ink', 'pill-rain'],
  ['pill-grid-ink', 'pill-grid'],
  ['pill-fin-ink', 'pill-fin'],
  ['warn-ink', 'warn-bg'],
];

describe('Broadcast colours', () => {
  for (const [text, surface] of PAIRS) {
    it(`--${text} on --${surface} reads at WCAG AA`, () => {
      const ratio = contrast(token(text), token(surface));
      assert.ok(ratio >= 4.5, `${ratio.toFixed(2)}:1`);
    });
  }

  it('picks readable ink on every default team colour', () => {
    for (const team of defaultTeams()) {
      for (const colour of [team.colors.primary, team.colors.secondary]) {
        const ratio = contrast(inkFor(colour), colour);
        assert.ok(ratio >= 4.5, `${team.id} ${colour}: ${ratio.toFixed(2)}:1`);
      }
    }
  });

  it('keeps every colour in a token, so nothing hard-coded escapes these checks', () => {
    const outside = css.replace(/:root\s*\{[^}]*\}/, '');
    const literals = outside.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/g) ?? [];
    assert.deepEqual(literals, []);
  });
});
