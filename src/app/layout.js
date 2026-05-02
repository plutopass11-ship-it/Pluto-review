import './globals.css';
import '../components/responsive.css';
import ToastProvider from '../components/shared/ToastProvider';

export const metadata = {
  title: 'Parallax',
  description: 'Premium client project review',
  icons: {
    icon: '/parallax-icon.png',
    apple: '/parallax-icon.png',
  },
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
