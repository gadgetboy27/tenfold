import type { Metadata } from "next";
import { Toaster } from "react-hot-toast";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://tenfold.nz"),
  title: "tenfold — one prompt, a whole campaign",
  description:
    "tenfold turns a single prompt into images, video, music and copy — then publishes it to up to 13 social platforms. The AI creative pipeline for modern brands.",
  openGraph: {
    title: "tenfold — one prompt, a whole campaign",
    description:
      "Turn one idea into a full campaign — images, video, music, copy — published everywhere. Start free with 50 credits.",
    url: "https://tenfold.nz",
    siteName: "tenfold",
    images: ["/landing/hero-founder.jpg"],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "tenfold — one prompt, a whole campaign",
    description:
      "Turn one idea into a full campaign — images, video, music, copy — published everywhere.",
    images: ["/landing/hero-founder.jpg"],
  },
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
