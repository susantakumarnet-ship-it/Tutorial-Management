/** SQL expression: great-circle distance (km) between row columns and bound lat/lng parameters. */
export function haversineSql(latCol: string, lngCol: string, latParam: string, lngParam: string): string {
  return `(6371 * acos(LEAST(1, GREATEST(-1,
    cos(radians(${latParam})) * cos(radians(${latCol})) * cos(radians(${lngCol}) - radians(${lngParam}))
    + sin(radians(${latParam})) * sin(radians(${latCol}))))))`;
}

/** Degrees of latitude/longitude covering `km` around a point - an index-friendly prefilter. */
export function boundingBox(lat: number, lng: number, km: number) {
  const dLat = km / 111.32;
  const dLng = km / (111.32 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));
  return { minLat: lat - dLat, maxLat: lat + dLat, minLng: lng - dLng, maxLng: lng + dLng };
}

/**
 * Coarsens a coordinate to ~1.1 km precision so exact home addresses are never revealed.
 * Used whenever a family location is shown to anybody other than its owner.
 */
export function fuzz(coord: number | null | undefined): number | null {
  if (coord === null || coord === undefined) return null;
  return Math.round(coord * 100) / 100;
}

/** Rounds a distance for display, never giving sub-500m precision about a family location. */
export function displayDistanceKm(km: number | null | undefined): number | null {
  if (km === null || km === undefined) return null;
  return Math.max(0.5, Math.round(km * 2) / 2);
}
