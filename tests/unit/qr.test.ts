import { describe, expect, it } from "vitest";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import { qrMatrix, qrPngBuffer } from "@/lib/qr";

describe("QR code", () => {
  it("the downloadable PNG decodes to exactly the configured address", async () => {
    const url = "https://ask.example.org";
    const png = PNG.sync.read(await qrPngBuffer(url, 600));
    const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
    expect(decoded?.data).toBe(url);
  });

  it("the on-screen matrix decodes to the same address", () => {
    const url = "https://ask.example.org";
    const matrix = qrMatrix(url);
    const scale = 10;
    const size = matrix.size * scale;
    const pixels = new Uint8ClampedArray(size * size * 4).fill(255);
    for (const [, x, y] of matrix.path.matchAll(/M(\d+) (\d+)h1v1h-1z/g)) {
      for (let dy = 0; dy < scale; dy++)
        for (let dx = 0; dx < scale; dx++) {
          const i = ((Number(y) * scale + dy) * size + Number(x) * scale + dx) * 4;
          pixels[i] = pixels[i + 1] = pixels[i + 2] = 0;
        }
    }
    expect(jsQR(pixels, size, size)?.data).toBe(url);
  });

  it("keeps the 4-module quiet zone the specification requires", () => {
    const matrix = qrMatrix("https://ask.example.org");
    const xs = [...matrix.path.matchAll(/M(\d+) (\d+)/g)].flatMap((m) => [Number(m[1]), Number(m[2])]);
    expect(Math.min(...xs)).toBe(4);
    expect(Math.max(...xs)).toBe(matrix.size - 5);
  });
});
