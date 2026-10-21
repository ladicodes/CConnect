import "server-only";
import QRCode from "qrcode";

/**
 * QR codes for the permanent public address. Error correction "M" (15%)
 * keeps modules large enough to scan from the back of a room; the 4-module
 * quiet zone is the size the QR specification requires.
 */
export const QR_OPTIONS = { errorCorrectionLevel: "M" as const, margin: 4 };

export type QrMatrix = { size: number; path: string; margin: number };

/** Module matrix as a single SVG path (no markup injection needed). */
export function qrMatrix(url: string): QrMatrix {
  const qr = QRCode.create(url, { errorCorrectionLevel: QR_OPTIONS.errorCorrectionLevel });
  const { size, data } = qr.modules;
  const margin = QR_OPTIONS.margin;
  let path = "";
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (data[y * size + x]) path += `M${x + margin} ${y + margin}h1v1h-1z`;
    }
  }
  return { size: size + margin * 2, path, margin };
}

export async function qrSvgString(url: string): Promise<string> {
  return QRCode.toString(url, { ...QR_OPTIONS, type: "svg", color: { dark: "#1d1f22ff", light: "#ffffffff" } });
}

export async function qrPngBuffer(url: string, width = 2048): Promise<Buffer> {
  return QRCode.toBuffer(url, { ...QR_OPTIONS, type: "png", width, color: { dark: "#1d1f22ff", light: "#ffffffff" } });
}
