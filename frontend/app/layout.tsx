import './globals.css';
import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'College Tech Fest 2026', description: 'College event registration platform' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
