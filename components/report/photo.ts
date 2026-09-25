"use client";

// Browser-side photo handling: read GPS from the ORIGINAL file, then re-encode a
// small JPEG through a canvas (which drops all EXIF/metadata before upload).

const MAX_SIDE = 1024;
const MAX_BYTES = 1_450_000;

/** GPS from EXIF, or null. Never throws. */
export async function readExifGps(file: Blob): Promise<{ lat: number; lng: number } | null> {
  try {
    const exifr = (await import("exifr")).default;
    const gps = await exifr.gps(file);
    if (gps && Number.isFinite(gps.latitude) && Number.isFinite(gps.longitude) && !(gps.latitude === 0 && gps.longitude === 0)) {
      return { lat: gps.latitude, lng: gps.longitude };
    }
  } catch {
    // No EXIF / unsupported format: fall back to device location or manual.
  }
  return null;
}

function toJpeg(canvas: HTMLCanvasElement): string {
  let quality = 0.82;
  let url = canvas.toDataURL("image/jpeg", quality);
  // base64 is ~4/3 of the bytes
  while (url.length * 0.75 > MAX_BYTES && quality > 0.4) {
    quality -= 0.12;
    url = canvas.toDataURL("image/jpeg", quality);
  }
  return url;
}

function drawScaled(src: CanvasImageSource, w: number, h: number): HTMLCanvasElement {
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** File -> JPEG data URL, max 1024 px, EXIF orientation applied, metadata stripped. */
export async function fileToJpeg(file: Blob): Promise<string> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const url = toJpeg(drawScaled(bmp, bmp.width, bmp.height));
    bmp.close();
    return url;
  } catch {
    // Fallback through <img> (older Safari).
    const src = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = src;
      await img.decode();
      return toJpeg(drawScaled(img, img.naturalWidth, img.naturalHeight));
    } catch {
      throw new Error("We couldn't read this photo. Try a JPEG or PNG, or take a new one.");
    } finally {
      URL.revokeObjectURL(src);
    }
  }
}

/** Current frame of a <video> -> JPEG data URL (max 1024 px). */
export function videoFrameToJpeg(video: HTMLVideoElement): string {
  return toJpeg(drawScaled(video, video.videoWidth, video.videoHeight));
}

/** navigator.geolocation as a promise (asks permission). */
export function deviceLocation(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new Error("Location is not available on this device."));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (e) =>
        reject(
          new Error(
            e.code === e.PERMISSION_DENIED
              ? "Location permission was denied. Type the address or drop a pin instead."
              : "We couldn't get your location. Type the address or drop a pin instead.",
          ),
        ),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 },
    );
  });
}
