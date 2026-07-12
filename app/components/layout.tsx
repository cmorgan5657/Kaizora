import Sidebar from "./sidebar";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="flex">
        {/* Sidebar */}
        <div className="w-64 h-screen bg-gray-900 text-white p-4">
          <Sidebar />
        </div>

        {/* Main content */}
        <div className="flex-1 p-6 bg-gray-100 min-h-screen">{children}</div>
      </body>
    </html>
  );
}
