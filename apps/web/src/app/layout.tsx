import type { Metadata } from 'next';
import { ThemeProvider } from '@/app/components/theme';
import './globals.css';

export const metadata: Metadata = {
  title: 'Comercial Ops — Plataforma de Vendas',
  description: 'Plataforma de inteligência comercial, CRM, WhatsApp e automação de vendas',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}