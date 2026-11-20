export interface StoreGeofenceZone {
  id: string;
  name: string;
  shortName: string;
  lat: number;
  lng: number;
  radiusMeters: number;
}

export const OFFICIAL_STORES = [
  "SUKO 719 PAKUWON MALL",
  "SUKO 720 TUNJUNGAN PLAZA",
] as const;

export type OfficialStoreName = (typeof OFFICIAL_STORES)[number];

/**
 * Daftar zona geofencing lokasi kerja toko resmi (Surabaya).
 * Radius diberi buffer wajar mall besar + toleransi indoor GPS.
 */
export const WORK_LOCATION_ZONES: StoreGeofenceZone[] = [
  {
    id: "SUKO_719_PAKUWON_MALL",
    name: "SUKO 719 PAKUWON MALL",
    shortName: "SUKO 719 PAKUWON MALL",
    lat: -7.28918,
    lng: 112.67565,
    radiusMeters: 750,
  },
  {
    id: "SUKO_720_TUNJUNGAN_PLAZA",
    name: "SUKO 720 TUNJUNGAN PLAZA",
    shortName: "SUKO 720 TUNJUNGAN PLAZA",
    lat: -7.26238,
    lng: 112.73928,
    radiusMeters: 700,
  },
];

export interface GeofenceCheckResult {
  allowed: boolean;
  nearestZone: StoreGeofenceZone;
  distanceMeters: number;
  effectiveDistanceMeters: number;
}

/** Hitung jarak Haversine dalam meter antara 2 titik koordinat GPS */
export function haversineDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000; // jari-jari bumi (meter)
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Verifikasi apakah koordinat GPS HP berada di dalam area Pakuwon Mall atau Tunjungan Plaza Surabaya.
 */
export function verifyStoreGeofence(
  lat: number,
  lng: number,
  accuracyMeters?: number | null
): GeofenceCheckResult | null {
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180 ||
    (lat === 0 && lng === 0)
  ) {
    return null;
  }

  // Buffer akurasi GPS indoor yang sehat (maksimal 180m agar tidak bisa diakali dari jauh)
  const safeAccuracyBonus =
    typeof accuracyMeters === "number" && Number.isFinite(accuracyMeters) && accuracyMeters > 0
      ? Math.min(accuracyMeters * 0.5, 180)
      : 0;

  let best: GeofenceCheckResult | null = null;

  for (const zone of WORK_LOCATION_ZONES) {
    const rawDist = haversineDistanceMeters(lat, lng, zone.lat, zone.lng);
    const effectiveDist = Math.max(0, rawDist - safeAccuracyBonus);
    const allowed = effectiveDist <= zone.radiusMeters;

    if (!best || rawDist < best.distanceMeters) {
      best = {
        allowed,
        nearestZone: zone,
        distanceMeters: Math.round(rawDist),
        effectiveDistanceMeters: Math.round(effectiveDist),
      };
    }
    if (allowed) {
      return {
        allowed: true,
        nearestZone: zone,
        distanceMeters: Math.round(rawDist),
        effectiveDistanceMeters: Math.round(effectiveDist),
      };
    }
  }

  return best;
}

/** Ambil jam WIB (0..23) secara akurat di server maupun browser */
export function getJakartaHour(date: Date = new Date()): number {
  const wib = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  return wib.getUTCHours();
}

/** Deteksi shift otomatis berdasarkan jam WIB (1 = Pagi < 14:00, 2 = Siang >= 14:00) */
export function resolveAutoShiftType(hourWib: number): 1 | 2 {
  return hourWib < 14 ? 1 : 2;
}

/** Jam operasional mall untuk Crew Store: 08:00 - 23:00 WIB */
export function isWithinStoreOperatingHours(hourWib: number): boolean {
  return hourWib >= 8 && hourWib < 23;
}
