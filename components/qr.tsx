"use client";

import QRCode from "qrcode";
import { useEffect, useRef } from "react";

/** QR code drawn on a canvas in the theme's ink colour. */
export function Qr({ value, size = 280, className }: { value: string; size?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current && value) {
      QRCode.toCanvas(ref.current, value, {
        width: size,
        margin: 1,
        errorCorrectionLevel: "M",
        color: { dark: "#242b34", light: "#ffffff" },
      }).catch(() => undefined);
    }
  }, [value, size]);
  return <canvas ref={ref} className={className} style={{ width: size, height: size }} role="img" aria-label="QR code" />;
}
