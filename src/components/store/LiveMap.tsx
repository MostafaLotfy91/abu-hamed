import { useEffect, useRef } from "react";
import type { Map as LMap, Marker } from "leaflet";
import "leaflet/dist/leaflet.css";

/** Live OpenStreetMap via Leaflet (no API key). Leaflet is loaded only in the browser. */
export function LiveMap({ lat, lng, className }: { lat: number; lng: number; className?: string }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LMap | null>(null);
  const marker = useRef<Marker | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !el.current || map.current) return;
      const m = L.map(el.current, { zoomControl: true, attributionControl: true }).setView([lat, lng], 16);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(m);
      const icon = L.divIcon({
        className: "",
        html: '<div style="width:22px;height:22px;border-radius:9999px;background:var(--primary);border:3px solid var(--background);box-shadow:0 0 0 6px color-mix(in oklab, var(--primary) 30%, transparent)"></div>',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });
      marker.current = L.marker([lat, lng], { icon }).addTo(m);
      map.current = m;
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      marker.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    marker.current?.setLatLng([lat, lng]);
    map.current?.panTo([lat, lng], { animate: true });
  }, [lat, lng]);

  return <div ref={el} className={className ?? "z-0 h-64 w-full overflow-hidden rounded-2xl border"} />;
}
