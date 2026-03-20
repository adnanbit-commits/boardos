import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title:       'SafeMinutes — Board minutes done right for Indian companies',
  description: 'Manage board meetings, resolutions, and minutes for private companies.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
