"use client";

import Link from "next/link";

export default function Sidebar() {
  return (
    <div className="h-screen w-64 bg-gray-900 text-white p-6">
      <h2 className="text-2xl font-bold mb-6">Menu</h2>

      <ul className="space-y-3">
        <li>
          <Link
            href="/dashboard"
            className="block p-2 bg-gray-800 rounded hover:bg-gray-700"
          >
            Dashboard
          </Link>
        </li>

        <li>
          <Link
            href="/profile"
            className="block p-2 bg-gray-800 rounded hover:bg-gray-700"
          >
            Profile
          </Link>
        </li>

        <li>
          <Link
            href="/settings"
            className="block p-2 bg-gray-800 rounded hover:bg-gray-700"
          >
            Settings
          </Link>
        </li>
      </ul>
    </div>
  );
}
