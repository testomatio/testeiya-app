import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
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
      <body className="h-full flex flex-col" suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
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
