import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'FindMyWalk — Find your path. Create your adventure.', description: 'Plan a walk, discover places along the way, and share your next outdoor adventure.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
