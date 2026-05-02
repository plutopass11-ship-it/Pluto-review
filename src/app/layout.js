import './globals.css';
import '../components/responsive.css';
import ToastProvider from '../components/shared/ToastProvider';

export const metadata = {
  title: 'Orbit',
  description: 'Premium client project review',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="app-layout">
        {children}
        <ToastProvider />
      </body>
    </html>
  );
}
