"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type { Map as LeafletMap, Marker } from "leaflet";

const LISBON: [number, number] = [38.7223, -9.1393];

/**
 * Small OpenStreetMap map with one draggable pin. Tap/click the map or drag the pin
 * to move it. Leaflet is loaded client-side only (it touches window on import).
 */
export function PinMap({
  lat,
  lng,
  onMove,
  height = 200,
  disabled,
}: {
  lat: number | null;
  lng: number | null;
  onMove: (lat: number, lng: number) => void;
  height?: number;
  disabled?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const onMoveRef = useRef(onMove);
  const disabledRef = useRef(disabled);
  const latest = useRef({ lat, lng });
  const placeRef = useRef<((ll: [number, number]) => void) | null>(null);
  useEffect(() => {
    onMoveRef.current = onMove;
    disabledRef.current = disabled;
    latest.current = { lat, lng };
  });

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !box.current || map.current) return;
      const start = latest.current; // latest props, in case they changed while Leaflet loaded
      const m = L.map(box.current, { zoomControl: true, attributionControl: true }).setView(
        start.lat != null && start.lng != null ? [start.lat, start.lng] : LISBON,
        start.lat != null ? 17 : 13,
      );
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(m);
      // A CSS pin (Leaflet's default PNG icons break under bundlers).
      const icon = L.divIcon({
        className: "",
        html: '<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#293644;border:3px solid #fff;box-shadow:0 2px 8px #23334b55"></div>',
        iconSize: [22, 22],
        iconAnchor: [11, 22],
      });
      const place = (ll: [number, number]) => {
        if (!marker.current) {
          marker.current = L.marker(ll, { draggable: true, icon, keyboard: true, title: "Problem location" }).addTo(m);
          marker.current.on("dragend", () => {
            const p = marker.current!.getLatLng();
            onMoveRef.current(p.lat, p.lng);
          });
        } else marker.current.setLatLng(ll);
      };
      if (start.lat != null && start.lng != null) place([start.lat, start.lng]);
      m.on("click", (e) => {
        if (disabledRef.current) return;
        place([e.latlng.lat, e.latlng.lng]);
        onMoveRef.current(e.latlng.lat, e.latlng.lng);
      });
      map.current = m;
      placeRef.current = place;
      setTimeout(() => m.invalidateSize(), 60); // the dialog may still be laying out
    })();
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      marker.current = null;
      placeRef.current = null;
    };
  }, []);

  // Follow prop changes (device location, typed address, server re-geocode).
  useEffect(() => {
    const m = map.current;
    if (!m || lat == null || lng == null) return;
    const cur = marker.current?.getLatLng();
    if (cur && Math.abs(cur.lat - lat) < 1e-7 && Math.abs(cur.lng - lng) < 1e-7) return;
    placeRef.current?.([lat, lng]);
    m.setView([lat, lng], Math.max(m.getZoom(), 16));
  }, [lat, lng]);

  useEffect(() => {
    if (disabled) marker.current?.dragging?.disable();
    else marker.current?.dragging?.enable();
  }, [disabled, lat, lng]);

  return (
    <div
      ref={box}
      className="relative z-0 w-full overflow-hidden rounded-ctl bg-well"
      style={{ height }}
      role="application"
      aria-label="Map: tap to place the pin, drag it to adjust"
    />
  );
}
