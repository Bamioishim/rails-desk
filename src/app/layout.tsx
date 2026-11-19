import type { Metadata } from "next";
import "./globals.css";
import {StoreProvider} from "@/components/store";
import {Shell} from "@/components/shell";
export const metadata: Metadata = { title: "Rails Desk — Agent control layer", description: "A human-defined policy layer for AI-proposed actions." };
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="en"><body><StoreProvider><Shell>{children}</Shell></StoreProvider></body></html> }
