import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ClientErrorLogger } from "@/components/client-error-logger";
import { ThemedToaster } from "@/components/themed-toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { HostProvider } from "@/lib/host-bridge";
import { ThemeProvider } from "@/lib/theme";
import "./globals.css";

// Set the theme class before React hydrates to avoid a light/dark flash.
const themeInitScript = `
try {
  var t = localStorage.getItem('testeiya.theme');
  if (t !== 'light' && t !== 'dark') {
    t = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }
  var r = document.documentElement;
  r.classList.add(t);
  r.style.colorScheme = t;
} catch (e) {}
`;

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Testeiya Agent",
  description: "AI-powered QA testing agent",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block"
          rel="stylesheet"
        />
      </head>
      <body className="h-full flex flex-col" suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <ClientErrorLogger />
        <HostProvider>
          <ThemeProvider>
            <TooltipProvider>
              {children}
            </TooltipProvider>
            <ThemedToaster />
          </ThemeProvider>
        </HostProvider>
      </body>
    </html>
  );
}
