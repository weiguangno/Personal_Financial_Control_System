import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Living Cost Pro",
  description: "Personal living cost tracking tool",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased font-sans bg-gray-50 flex flex-col min-h-screen">
        <div className="flex-1 pb-16">
          {children}
        </div>
        
        {/* Fixed Bottom Navigation */}
        <nav className="fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-gray-200 flex items-center justify-around z-50 px-4 max-w-md mx-auto">
          <a href="/" className="flex flex-col items-center justify-center w-full h-full text-gray-600 hover:text-primary transition-colors">
            <span className="text-xl mb-1">🏠</span>
            <span className="text-[10px] font-medium">首页</span>
          </a>
          <a href="/analysis" className="flex flex-col items-center justify-center w-full h-full text-gray-600 hover:text-primary transition-colors">
            <span className="text-xl mb-1">📊</span>
            <span className="text-[10px] font-medium">分析</span>
          </a>
          <a href="/settings" className="flex flex-col items-center justify-center w-full h-full text-gray-600 hover:text-primary transition-colors">
            <span className="text-xl mb-1">⚙️</span>
            <span className="text-[10px] font-medium">设置</span>
          </a>
        </nav>
      </body>
    </html>
  );
}
