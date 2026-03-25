// lib/tokens.ts — SafeMinutes shared design tokens
// Light/warm "law firm document portal" palette
// Import in any page: import { T } from '@/lib/tokens';

export const T = {
  // Surfaces
  pageBg:    '#F5F2EE',   // stone — warm off-white page background
  surface:   '#FDFCFB',   // white — cards, panels
  surface2:  '#EBE6DF',   // stone-mid — secondary panels, hover states
  border:    '#E0DAD2',   // rule — dividers, card borders
  borderDark:'#C8C0B5',   // stronger border for active/focus states

  // Text
  ink:       '#231F1B',   // primary text
  inkMid:    '#5C5750',   // secondary text
  inkMute:   '#96908A',   // muted / placeholders

  // Accents
  crimson:   '#8B1A1A',   // primary CTA, status critical
  crimsonLt: '#F5E6E6',   // crimson tint background
  crimsonMid:'rgba(139,26,26,0.12)', // subtle crimson fill
  crimsonText:'#8B1A1A',  // crimson text on light bg

  gold:      '#C4973A',   // secondary accent
  goldLt:    '#FBF5E6',   // gold tint background
  goldMid:   'rgba(196,151,58,0.12)', // subtle gold fill
  goldText:  '#9B7320',   // gold text on light bg (darker for contrast)
  goldBdr:   '#DFC27A',   // gold border

  // Dark elements (sidebar, header) — used sparingly
  dark:      '#1C1A18',   // sidebar/header bg
  darkMid:   '#211F1C',   // slightly lighter dark
  darkLt:    '#2A2724',   // dark hover states
  darkBdr:   'rgba(255,255,255,0.07)', // dark surface border
  darkText:  '#EDE9E3',   // text on dark
  darkTextSub:'rgba(237,233,227,0.55)', // secondary on dark
  darkTextMute:'rgba(237,233,227,0.3)', // muted on dark

  // Semantic
  green:     '#166534',
  greenLt:   '#DCFCE7',
  greenMid:  'rgba(22,101,52,0.08)',
  amber:     '#92400E',
  amberLt:   '#FEF3C7',
  amberMid:  'rgba(146,64,14,0.08)',
  red:       '#991B1B',
  redLt:     '#FEE2E2',
  redMid:    'rgba(153,27,27,0.08)',
  blue:      '#1D4ED8',
  blueLt:    '#EFF6FF',
  blueMid:   'rgba(29,78,216,0.08)',
  purple:    '#6B21A8',
  purpleLt:  '#F5F3FF',
  purpleMid: 'rgba(107,33,168,0.08)',

  // Typography
  fontSans:  "'Instrument Sans', system-ui, sans-serif",
  fontSerif: "'Playfair Display', Georgia, serif",

  // Shadows
  shadow:    '0 1px 3px rgba(35,31,27,0.08), 0 1px 2px rgba(35,31,27,0.04)',
  shadowMd:  '0 4px 12px rgba(35,31,27,0.10), 0 2px 6px rgba(35,31,27,0.06)',
  shadowLg:  '0 16px 40px rgba(35,31,27,0.14)',
};

// Status pill configs — light mode
export const STATUS_LIGHT: Record<string, { label: string; color: string; bg: string; border: string }> = {
  DRAFT:              { label: 'Draft',           color: '#5C5750', bg: '#EBE6DF', border: '#D6CFC6' },
  SCHEDULED:          { label: 'Scheduled',       color: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE' },
  IN_PROGRESS:        { label: 'In Progress',     color: '#166534', bg: '#DCFCE7', border: '#BBF7D0' },
  VOTING:             { label: 'Voting',           color: '#92400E', bg: '#FEF3C7', border: '#FDE68A' },
  MINUTES_DRAFT:      { label: 'Minutes Draft',   color: '#6B21A8', bg: '#F5F3FF', border: '#DDD6FE' },
  MINUTES_CIRCULATED: { label: 'Circ.',           color: '#6B21A8', bg: '#F5F3FF', border: '#DDD6FE' },
  SIGNED:             { label: 'Signed',           color: '#166534', bg: '#DCFCE7', border: '#BBF7D0' },
  LOCKED:             { label: 'Locked',           color: '#5C5750', bg: '#EBE6DF', border: '#D6CFC6' },
};

export const ROLE_LIGHT: Record<string, { color: string; bg: string; border: string }> = {
  DIRECTOR:          { color: '#8B1A1A', bg: '#F5E6E6', border: '#ECC9C9' },
  COMPANY_SECRETARY: { color: '#9B7320', bg: '#FBF5E6', border: '#E8D499' },
  AUDITOR:           { color: '#166534', bg: '#DCFCE7', border: '#BBF7D0' },
  OBSERVER:          { color: '#5C5750', bg: '#EBE6DF', border: '#D6CFC6' },
};
