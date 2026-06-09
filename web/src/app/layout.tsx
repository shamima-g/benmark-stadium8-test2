import type { Metadata } from 'next';
import './globals.css';
import { ToastProvider } from '@/contexts/ToastContext';
import { ToastContainer } from '@/components/toast/ToastContainer';
import { SessionProvider } from '@/components/auth/SessionProvider';

export const metadata: Metadata = {
  title: 'Transaction Import & Approval System',
  description:
    'Upload, review, approve, and export bank transactions for a financial-services back office.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <SessionProvider>
          <ToastProvider>
            <main className="min-h-screen">{children}</main>
            <ToastContainer />
          </ToastProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
