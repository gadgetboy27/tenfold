import type { Metadata } from "next";
import { Toaster } from "react-hot-toast";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tenfold",
  description: "B2B AI Creative Platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full dark">
      <head>
        {/* Runtime public env (Supabase URL/anon key) — set before hydration so
            the browser Supabase client works even if the values weren't inlined
            at build time. See app/api/public-env/route.ts. */}
        <script src="/api/public-env" />
      </head>
      <body className="h-full bg-background text-foreground antialiased">
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: "#111111",
              color: "#F0F0F0",
              border: "1px solid rgba(255,255,255,0.08)",
            },
          }}
        />
      </body>
    </html>
  );
}
