const RATES = {
  standard: { base: 2.5, perKm: 1.2 },
  premium: { base: 4, perKm: 2.0 },
  xl: { base: 5, perKm: 2.5 },
};

export const RIDE_TYPES = Object.keys(RATES);
const ROAD_FACTOR = 1.3; // straight-line distance -> approximate road distance

export function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export const roadDistanceKm = (...args) => haversineKm(...args) * ROAD_FACTOR;

export function calculateFare(type, km) {
  const r = RATES[type];
  return Math.round((r.base + r.perKm * km) * 100) / 100;
}

export function estimateAll(km) {
  return Object.fromEntries(RIDE_TYPES.map((t) => [t, calculateFare(t, km)]));
}