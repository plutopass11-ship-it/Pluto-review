import './globals.css';
import '../components/responsive.css';
import ToastProvider from '../components/shared/ToastProvider';
import ServiceWorkerRegistration from '../components/ServiceWorkerRegistration';

export const metadata = {
  title: 'Parallax',
  description: 'Premium client project review',
  manifest: '/manifest.json',
  icons: {
    icon: '/parallax-icon.jpeg',
    apple: '/parallax-icon.jpeg',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Parallax',
  },
  applicationName: 'Parallax',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className="app-layout">
        {children}
        <ToastProvider />
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
