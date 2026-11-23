import type { Metadata } from "next";
import "./globals.css";
import { StoreProvider } from "@/components/store";
import { Shell } from "@/components/shell";
import { CursorGlow } from "@/components/cursor-glow";

export const metadata: Metadata = {
  title: "Rails Desk — Agent control layer",
  description: "A human-defined policy layer for AI-proposed actions.",
};

// A nonce CSP requires request-time HTML. Force the whole app dynamic so
// even scripts in the document shell receive the per-request nonce from Proxy.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body><CursorGlow /><StoreProvider><Shell>{children}</Shell></StoreProvider></body></html>;
}
