import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Termômetro Financeiro",
  description: "Seu planejador financeiro baseado em fluxo de caixa futuro",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen text-gray-900">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
