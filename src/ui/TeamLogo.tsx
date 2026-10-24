import type { LogoShape, TeamDef } from '../engine/types.ts';

const SHAPES: Record<LogoShape, string> = {
  shield: 'M50 4 L92 18 V52 C92 74 74 90 50 98 C26 90 8 74 8 52 V18 Z',
  circle: 'M50 4 A46 46 0 1 1 49.99 4 Z',
  hex: 'M50 3 L90 26 V74 L50 97 L10 74 V26 Z',
  chevron: 'M6 14 H60 L94 50 L60 86 H6 L40 50 Z',
  diamond: 'M50 2 L98 50 L50 98 L2 50 Z',
  stripe: 'M14 6 H86 A8 8 0 0 1 94 14 V86 A8 8 0 0 1 86 94 H14 A8 8 0 0 1 6 86 V14 A8 8 0 0 1 14 6 Z',
};

export const LOGO_SHAPES = Object.keys(SHAPES) as LogoShape[];

interface Props {
  team: Pick<TeamDef, 'colors' | 'logo' | 'name'>;
  size?: number;
}

/** Generated emblem, or the user's uploaded image when one is set. */
export function TeamLogo({ team, size = 28 }: Props) {
  const { logo, colors } = team;
  if (logo.imageDataUrl) {
    return (
      <img
        src={logo.imageDataUrl}
        width={size}
        height={size}
        alt={`${team.name} logo`}
        style={{ objectFit: 'contain', borderRadius: 2, flex: 'none' }}
      />
    );
  }
  const text = (logo.initials || '?').slice(0, 3).toUpperCase();
  const fontSize = text.length >= 3 ? 30 : 38;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={`${team.name} logo`} style={{ flex: 'none' }}>
      <path d={SHAPES[logo.shape]} fill={colors.primary} stroke={colors.secondary} strokeWidth={5} strokeLinejoin="round" />
      {logo.shape === 'stripe' && <rect x="6" y="40" width="88" height="20" fill={colors.secondary} opacity={0.25} />}
      <text
        x="50"
        y="50"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={fontSize}
        fontWeight={800}
        fontFamily="system-ui, sans-serif"
        fill={colors.secondary}
      >
        {text}
      </text>
    </svg>
  );
}
