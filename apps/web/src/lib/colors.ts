import type { SeverityColor } from '@bss/shared';

export const SEVERITY_HEX: Record<SeverityColor, string> = {
  RED:    '#EF4444',
  ORANGE: '#F97316',
  YELLOW: '#EAB308',
  GREEN:  '#22C55E',
  GRAY:   '#9CA3AF',
};

export const SEVERITY_LABEL: Record<SeverityColor, string> = {
  RED:    '4+ incidents',
  ORANGE: '3 incidents',
  YELLOW: '2 incidents',
  GREEN:  '1 incident',
  GRAY:   '0 incidents',
};

export const SEVERITY_BG: Record<SeverityColor, string> = {
  RED:    'bg-red-100 text-red-700 border-red-200',
  ORANGE: 'bg-orange-100 text-orange-700 border-orange-200',
  YELLOW: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  GREEN:  'bg-green-100 text-green-700 border-green-200',
  GRAY:   'bg-gray-100 text-gray-600 border-gray-200',
};
