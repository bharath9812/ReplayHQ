import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "@/components/ThemeProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "GameVault - Apple Pro Gaming Footage Vault & Studio",
  description:
    "High-Performance Self-Hosted SaaS for iPad & Gaming Footage with Thumbnail-Based Timeline Scrubbing and Zero-Corruption Architecture.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "GameVault",
  },
};

export const viewport: Viewport = {
  themeColor: "#121316",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
          rel="stylesheet"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var w = localStorage.getItem('gamevault_sidebar_width');
                  if (w) {
                    var num = parseInt(w, 10);
                    if (!isNaN(num) && num >= 180 && num <= 500) {
                      document.documentElement.style.setProperty('--sidebar-width', num + 'px');
                    }
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="h-[100dvh] w-screen overflow-hidden bg-background font-body-md text-body-md text-on-surface antialiased select-none">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
