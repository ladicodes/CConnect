import { Logo } from "@/components/logo";
import { QrCode } from "@/components/qr-code";
import type { QrMatrix } from "@/lib/qr";

export function displayAddress(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

/** The join slide: logo, instruction, a large unobstructed QR code and the address. */
export function QrSlide({ matrix, url }: { matrix: QrMatrix; url: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-between gap-[3vh] px-[5vw] py-[5vh]">
      <Logo eager maxHeight={110} className="h-[clamp(56px,9vh,110px)]" />
      <div className="flex w-full max-w-[110rem] flex-col items-center gap-[4vh] landscape:flex-row landscape:justify-center landscape:gap-[6vw]">
        <div className="max-w-[40rem] text-center landscape:text-left">
          <p className="display text-[clamp(2.5rem,6.2vw,6.5rem)] leading-[0.98] text-ink">
            Ask a question.
            <br />
            Share a prayer<span className="text-red">.</span>
          </p>
          <p className="mt-[2.5vh] text-[clamp(1.125rem,2vw,2rem)] leading-snug text-ink-2">
            Point your phone camera at the code. Anonymous, with no app or account needed.
          </p>
        </div>
        <div className="rounded-[1.5vh] border border-line bg-white p-[1.2vh] shadow-[0_2px_0_rgb(29_31_34/0.04)]">
          <QrCode matrix={matrix} label={`QR code linking to ${displayAddress(url)}`} className="size-[min(62vh,44vw)] portrait:size-[min(70vw,48vh)]" />
        </div>
      </div>
      <p className="font-display text-[clamp(1.5rem,3vw,3rem)] font-semibold tracking-[-0.01em] text-ink">{displayAddress(url)}</p>
    </div>
  );
}
