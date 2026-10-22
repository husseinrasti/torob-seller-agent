const R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in meters. */
export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Bounding box (degrees) that contains a circle of `radiusM` around the point. */
export function bbox(lat: number, lon: number, radiusM: number) {
  const dLat = (radiusM / R) * (180 / Math.PI);
  const dLon = dLat / Math.cos(rad(lat));
  return { minLat: lat - dLat, maxLat: lat + dLat, minLon: lon - dLon, maxLon: lon + dLon };
}

/** SQL expression for haversine distance (meters) from ($lat,$lon) params to table alias `s`. */
export const SQL_DISTANCE = (latParam: string, lonParam: string, alias = 's') =>
  `(2*6371000*asin(sqrt(power(sin(radians(${alias}.lat-${latParam})/2),2)+cos(radians(${latParam}))*cos(radians(${alias}.lat))*power(sin(radians(${alias}.lon-${lonParam})/2),2))))`;

export const DEFAULT_LOCATION = { lat: 35.6957, lon: 51.4105, label: 'فردوسی (پیش‌فرض)', source: 'default' as const };
export const RADIUS_STEPS = [500, 1000, 2000, 3000, 5000];

/** Plain geo links for turn-by-turn navigation apps (spec §8). */
export function navLinks(lat: number, lon: number) {
  return {
    osm: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=19/${lat}/${lon}`,
    google: `https://maps.google.com/?q=${lat},${lon}`,
    neshan: `https://neshan.org/maps/@${lat},${lon},18z`,
  };
}
