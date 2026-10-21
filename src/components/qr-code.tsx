import type { QrMatrix } from "@/lib/qr";

/** Crisp, high-contrast QR code rendered from its module matrix. */
export function QrCode({ matrix, label, className = "" }: { matrix: QrMatrix; label: string; className?: string }) {
  return (
    <svg
      viewBox={`0 0 ${matrix.size} ${matrix.size}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
      className={`block bg-white ${className}`}
    >
      <rect width={matrix.size} height={matrix.size} fill="#ffffff" />
      <path d={matrix.path} fill="#1d1f22" />
    </svg>
  );
}
