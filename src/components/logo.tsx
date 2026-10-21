import Image from "next/image";
import logo from "../../public/brand/covenant-connect-logo-transparent.png";

const RATIO = logo.width / logo.height;

/**
 * The official Covenant Connect logo (transparent version of the supplied
 * logo.png, artwork unaltered). The box is sized by height and keeps the
 * artwork's exact proportions; the image fills it with object-contain, so it
 * can never be stretched. Pass `height` for a fixed size, or size the box
 * with `className` (e.g. responsive heights) and give `maxHeight` for loading.
 * Below ~36px the light "connect" wordmark gets hard to read.
 */
export function Logo({
  height,
  maxHeight,
  eager = false,
  className = "",
}: {
  height?: number;
  maxHeight?: number;
  /** Above-the-fold logos load immediately. */
  eager?: boolean;
  className?: string;
}) {
  const largest = maxHeight ?? height ?? 64;
  return (
    <span
      className={`relative inline-block shrink-0 align-middle ${className}`}
      style={{ aspectRatio: `${logo.width} / ${logo.height}`, ...(height ? { height } : {}) }}
    >
      <Image
        src={logo}
        alt="Covenant Connect"
        fill
        sizes={`${Math.ceil(largest * RATIO)}px`}
        quality={90}
        loading={eager ? "eager" : "lazy"}
        className="select-none object-contain"
        draggable={false}
      />
    </span>
  );
}
