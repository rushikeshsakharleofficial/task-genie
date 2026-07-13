import type { Metadata } from "next";
import { AppProviders } from "@/components/providers";
import { RealtimeProvider } from "@/components/realtime-provider";
import "./globals.css";
export const metadata: Metadata = { title: "Task Genie", description: "Self-hosted task and project management" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body><AppProviders><RealtimeProvider>{children}</RealtimeProvider></AppProviders></body></html>; }
