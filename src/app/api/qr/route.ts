import { getStaff } from "@/lib/auth";
import { siteUrl } from "@/lib/env";
import { qrPngBuffer, qrSvgString } from "@/lib/qr";

/** Downloadable QR code for service slides (staff only). */
export async function GET(request: Request) {
  const lookup = await getStaff();
  if (lookup.status !== "staff") return new Response("Not signed in", { status: 401, headers: { "Cache-Control": "no-store" } });
  const site = siteUrl();
  if (!site.ok) return new Response(site.problem, { status: 503, headers: { "Cache-Control": "no-store" } });

  const format = new URL(request.url).searchParams.get("format") === "png" ? "png" : "svg";
  const headers = {
    "Cache-Control": "no-store",
    "Content-Disposition": `attachment; filename="connect-ask-qr.${format}"`,
  };
  if (format === "png") {
    const png = await qrPngBuffer(site.url);
    return new Response(new Uint8Array(png), { headers: { ...headers, "Content-Type": "image/png" } });
  }
  const svg = await qrSvgString(site.url);
  return new Response(svg, { headers: { ...headers, "Content-Type": "image/svg+xml" } });
}
