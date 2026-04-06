import type { Metadata } from 'next';
import './globals.css';
import { TenantProvider } from '@/core/lib/tenant-context';

export const metadata: Metadata = {
  title: 'BotFans CRM',
  description: 'CRM com integração de IA para Telegram',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </head>
      <body>
        <TenantProvider>{children}</TenantProvider>
      </body>
    </html>
  );
}
