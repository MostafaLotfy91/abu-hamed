/** Lightweight live map via OpenStreetMap embed — no extra libraries, SSR-safe. */
export function LiveMap({ lat, lng, className }: { lat: number; lng: number; className?: string }) {
  const d = 0.006;
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${lng - d}%2C${lat - d}%2C${lng + d}%2C${lat + d}&layer=mapnik&marker=${lat}%2C${lng}`;
  return <iframe title="map" src={src} className={className ?? "h-64 w-full rounded-2xl border"} loading="lazy" />;
}
