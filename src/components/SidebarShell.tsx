"use client";

import { useState } from "react";
import { Menu, Car } from "lucide-react";
import Sidebar from "./Sidebar";

export default function SidebarShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-[#f8fafc]" style={{ colorScheme: "light" }}>
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Desktop sidebar (always visible) */}
      <div className="hidden md:flex flex-col w-64 shrink-0 h-screen sticky top-0">
        <Sidebar />
      </div>

      {/* Mobile sidebar (slide-in) */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-64 transition-transform duration-300 ease-in-out md:hidden ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Sidebar onClose={() => setOpen(false)} />
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Mobile top bar */}
        <div className="flex items-center gap-3 md:hidden bg-white border-b border-gray-100 px-4 py-3 shrink-0 sticky top-0 z-30">
          <button
            onClick={() => setOpen(true)}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
              <Car className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-gray-900 text-sm">ParkOS <span className="text-blue-600">Admin</span></span>
          </div>
        </div>

        {/* Scrollable page content */}
        <div className="flex-1 overflow-auto bg-[#f8fafc]">
          {children}
        </div>
      </div>
    </div>
  );
}
