import type { Metadata } from "next";
import { headers } from "next/headers";
import { Suspense } from "react";
import "./globals.css";
import { StoreProvider } from "@/components/store";
import { Shell } from "@/components/shell";
import { CursorGlow } from "@/components/cursor-glow";

export const metadata: Metadata = {
  title: "Rails Desk — Agent control layer",
  description: "A human-defined policy layer for AI-proposed actions.",
};

async function RequestBoundApp({ children }: { children: React.ReactNode }) {
  // Reading request headers opts this subtree into request-time rendering so Next.js
  // can apply the per-request CSP nonce to its framework and inline bootstrap scripts.
  await headers();
  return <><CursorGlow /><StoreProvider><Shell>{children}</Shell></StoreProvider></>;
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body><Suspense fallback={null}><RequestBoundApp>{children}</RequestBoundApp></Suspense></body></html>;
}
