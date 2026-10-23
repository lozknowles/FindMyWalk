import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'FindMyWalk — Nottinghamshire beta', description: 'Nottinghamshire beta walk planning, local discovery and unlisted route sharing. Check access and conditions before walking.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
