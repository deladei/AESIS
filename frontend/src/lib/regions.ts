// The 16 administrative regions of Ghana (2019 demarcation). Mirrors the
// backend Prisma `Region` enum and `shared/constants/regions.ts`. Keep the two
// in sync — the API validates against the backend copy.
export const REGION_VALUES = [
  'ahafo',
  'ashanti',
  'bono',
  'bono_east',
  'central',
  'eastern',
  'greater_accra',
  'north_east',
  'northern',
  'oti',
  'savannah',
  'upper_east',
  'upper_west',
  'volta',
  'western',
  'western_north',
] as const;

export type RegionValue = (typeof REGION_VALUES)[number];

export const REGION_LABELS: Record<RegionValue, string> = {
  ahafo:         'Ahafo',
  ashanti:       'Ashanti',
  bono:          'Bono',
  bono_east:     'Bono East',
  central:       'Central',
  eastern:       'Eastern',
  greater_accra: 'Greater Accra',
  north_east:    'North East',
  northern:      'Northern',
  oti:           'Oti',
  savannah:      'Savannah',
  upper_east:    'Upper East',
  upper_west:    'Upper West',
  volta:         'Volta',
  western:       'Western',
  western_north: 'Western North',
};

/** Label for a region value, tolerant of null/unknown. */
export function regionLabel(region: string | null | undefined): string {
  if (!region) return 'Unassigned';
  return REGION_LABELS[region as RegionValue] ?? region;
}
