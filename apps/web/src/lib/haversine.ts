/** Haversine great-circle distance in miles. */
export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Create a GeoJSON-compatible polygon approximating a circle.
 * @param lat        Centre latitude (degrees)
 * @param lon        Centre longitude (degrees)
 * @param radiusMi   Radius in miles
 * @param numPoints  Number of polygon vertices (default 64)
 */
export function circlePolygon(
  lat: number,
  lon: number,
  radiusMi: number,
  numPoints = 64
): [number, number][] {
  const R = 3958.8;
  const latRad = (lat * Math.PI) / 180;
  const points: [number, number][] = [];

  for (let i = 0; i <= numPoints; i++) {
    const angle = (i / numPoints) * 2 * Math.PI;
    const dLat = (radiusMi / R) * Math.cos(angle) * (180 / Math.PI);
    const dLon =
      (radiusMi / R) * Math.sin(angle) * (180 / Math.PI) / Math.cos(latRad);
    points.push([lon + dLon, lat + dLat]);
  }
  // Close the ring
  points.push(points[0]);
  return points;
}
