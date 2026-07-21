"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import {
  ArrowRight, Menu, X, ParkingSquare,
  Gauge, Zap, ShieldCheck, Receipt, BookOpen, ShieldX,
  BarChart3, Users, MapPin, Layers, Truck,
} from "lucide-react";
import { BrandMark } from "@/components/ui/BrandMark";

const NAV_LINKS = [
  { href: "#features", label: "Features" },
  { href: "#why", label: "Why ParkOS" },
];

const FEATURES = [
  { icon: Gauge,       tint: "bg-blue-50 text-blue-600",    title: "Real-Time Slot Tracking",  desc: "Live occupancy across every division and location, updated the moment a truck checks in or out." },
  { icon: ShieldCheck, tint: "bg-emerald-50 text-emerald-600", title: "Driver Verification",    desc: "Automatic mismatch detection between check-in and check-out drivers, with a full override trail." },
  { icon: Receipt,     tint: "bg-violet-50 text-violet-600", title: "Smart Billing",            desc: "GST-aware billing with cash, card and UPI support, and an instant receipt for every session." },
  { icon: BookOpen,    tint: "bg-amber-50 text-amber-600",  title: "Khata Monthly Accounts",     desc: "Run recurring customers on a monthly account instead of billing every single visit." },
  { icon: ShieldX,     tint: "bg-red-50 text-red-600",      title: "Blacklist Management",       desc: "Flag a restricted vehicle once and it's blocked automatically at check-in, everywhere." },
  { icon: BarChart3,   tint: "bg-cyan-50 text-cyan-600",    title: "Reports & Analytics",        desc: "Revenue trends, occupancy by division, and payment mix, all in one live dashboard." },
  { icon: Users,       tint: "bg-indigo-50 text-indigo-600", title: "Role-Based Access",         desc: "Define custom staff roles with exactly the permissions each job needs, nothing more." },
  { icon: MapPin,      tint: "bg-teal-50 text-teal-600",    title: "Multi-Location Ready",       desc: "Run one yard or twenty — every screen scopes cleanly to the location you're working in." },
];

const VALUES = [
  { icon: Zap,         title: "Built for Speed",    desc: "Every screen is built so gate staff can check a truck in or out in seconds, not minutes." },
  { icon: ShieldCheck, title: "Secure by Default",  desc: "Role-based permissions and an audit trail keep every action accountable, on every device." },
  { icon: Layers,      title: "Scales With You",    desc: "From a single yard to a multi-location fleet operation, the same platform grows with your business." },
];

export default function HomePage() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 overflow-x-hidden">

      {/* ── Navbar ── */}
      <header className="sticky top-0 z-50 bg-white/70 backdrop-blur-xl border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <BrandMark size="sm" />

          <nav className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map(l => (
              <a key={l.href} href={l.href} className="text-sm font-medium text-gray-600 hover:text-gray-900 transition">
                {l.label}
              </a>
            ))}
          </nav>

          <div className="hidden md:block">
            <Link
              href="/login"
              className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-emerald-500 hover:from-blue-700 hover:to-emerald-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl shadow-md shadow-blue-600/20 hover:shadow-lg hover:-translate-y-0.5 transition-all"
            >
              Login <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <button
            onClick={() => setMenuOpen(v => !v)}
            aria-label="Toggle menu"
            className="md:hidden p-2 -mr-2 text-gray-500 hover:text-gray-900 transition"
          >
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="md:hidden border-t border-gray-100 bg-white px-4 py-4 space-y-1 overflow-hidden"
          >
            {NAV_LINKS.map(l => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setMenuOpen(false)}
                className="block text-sm font-medium text-gray-600 hover:text-gray-900 py-2.5"
              >
                {l.label}
              </a>
            ))}
            <Link
              href="/login"
              className="flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-emerald-500 text-white text-sm font-semibold px-5 py-3 rounded-xl mt-3"
            >
              Login <ArrowRight className="w-4 h-4" />
            </Link>
          </motion.div>
        )}
      </header>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-200/30 rounded-full blur-3xl animate-blob" />
          <div className="absolute bottom-0 left-0 w-[420px] h-[420px] bg-emerald-200/30 rounded-full blur-3xl animate-blob" style={{ animationDelay: "4s" }} />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-14 pb-20 lg:pt-20 lg:pb-28 grid lg:grid-cols-2 gap-12 lg:gap-8 items-center">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: "easeOut" }}>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-100 px-3 py-1.5 rounded-full mb-6">
              <Zap className="w-3.5 h-3.5" />Built for parking operators
            </span>
            <h1 className="text-4xl sm:text-5xl lg:text-[3.25rem] font-bold text-gray-900 leading-[1.1] tracking-tight mb-6">
              Smart Parking Management,{" "}
              <span className="bg-gradient-to-r from-blue-600 to-emerald-500 bg-clip-text text-transparent">Simplified.</span>
            </h1>
            <p className="text-lg text-gray-500 leading-relaxed mb-8 max-w-lg">
              One intelligent platform to manage trucks, slots, billing, and staff — from check-in to checkout, across every location you run.
            </p>
            <div className="flex flex-wrap items-center gap-4 mb-10">
              <Link
                href="/login"
                className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-emerald-500 hover:from-blue-700 hover:to-emerald-600 text-white font-semibold px-6 py-3.5 rounded-xl shadow-lg shadow-blue-600/25 hover:shadow-xl hover:-translate-y-0.5 transition-all"
              >
                Get Started <ArrowRight className="w-4.5 h-4.5" />
              </Link>
              <a
                href="#features"
                className="flex items-center gap-2 text-gray-700 font-semibold px-6 py-3.5 rounded-xl border border-gray-200 hover:border-gray-300 hover:bg-white transition-all"
              >
                See Features
              </a>
            </div>
            <p className="text-sm font-medium text-gray-400 tracking-wide">
              Secure <span className="mx-2 text-emerald-400">•</span> Real-Time
              <span className="mx-2 text-emerald-400">•</span> Scalable
              <span className="mx-2 text-emerald-400">•</span> Enterprise Ready
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.15, ease: "easeOut" }}
            className="relative h-[380px] sm:h-[440px] lg:h-[480px]"
          >
            <HeroVisual />
          </motion.div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 scroll-mt-16">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <span className="text-xs font-bold text-blue-600 uppercase tracking-widest">Features</span>
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mt-3 mb-4">Everything your yard needs, in one place</h2>
          <p className="text-gray-500 text-lg">From the gate to the ledger — every part of the operation, covered.</p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.4, delay: (i % 4) * 0.06, ease: "easeOut" }}
              className="group bg-white rounded-2xl border border-gray-100 shadow-sm p-6 hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
            >
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 ${f.tint} transition-transform duration-300 group-hover:scale-110`}>
                <f.icon className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-gray-900 mb-1.5">{f.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── Why ParkOS / value props ── */}
      <section id="why" className="relative bg-white border-y border-gray-100 scroll-mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <span className="text-xs font-bold text-emerald-600 uppercase tracking-widest">Why ParkOS</span>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mt-3">Reliable software for a business that doesn&apos;t stop</h2>
          </div>
          <div className="grid sm:grid-cols-3 gap-10">
            {VALUES.map((v, i) => (
              <motion.div
                key={v.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.1, ease: "easeOut" }}
                className="text-center sm:text-left"
              >
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-emerald-500 flex items-center justify-center mb-5 mx-auto sm:mx-0 shadow-lg shadow-blue-900/10">
                  <v.icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="font-bold text-gray-900 text-lg mb-2">{v.title}</h3>
                <p className="text-gray-500 leading-relaxed">{v.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600 to-emerald-500" />
        <div
          className="absolute inset-0 opacity-10"
          style={{ backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)", backgroundSize: "24px 24px" }}
        />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">Ready to run a tighter yard?</h2>
          <p className="text-blue-50 text-lg mb-10 max-w-xl mx-auto">
            Sign in to your ParkOS dashboard and see everything happening across your locations in real time.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 bg-white text-blue-700 font-semibold px-7 py-3.5 rounded-xl shadow-xl hover:shadow-2xl hover:-translate-y-0.5 transition-all"
          >
            Login Now <ArrowRight className="w-4.5 h-4.5" />
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-slate-50 border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <BrandMark size="sm" />
          <p className="text-xs text-gray-400">© 2026 ParkOS • Smart Parking Management</p>
        </div>
      </footer>
    </div>
  );
}

/* ──────────────────────────── Hero visual (illustrative preview) ─────────────────────────── */
function HeroVisual() {
  const r = 42;
  const circumference = 2 * Math.PI * r;
  const dash = circumference * 0.68;

  return (
    <div className="relative w-full h-full">
      <div className="absolute inset-4 sm:inset-8 bg-gradient-to-br from-blue-50 to-emerald-50 rounded-[40px] border border-gray-100" />

      {/* occupancy ring card — illustrative UI preview, not live data */}
      <div
        className="absolute left-2 sm:left-8 top-2 sm:top-6 w-48 sm:w-52 bg-white rounded-3xl shadow-xl shadow-blue-900/10 border border-gray-100 p-5 animate-float-slow"
        style={{ transform: "rotate(-3deg)" }}
      >
        <div className="flex items-center gap-1.5 mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse-soft" />
          <span className="text-xs font-semibold text-gray-500">Live Occupancy</span>
        </div>
        <div className="relative w-24 h-24 sm:w-28 sm:h-28 mx-auto">
          <svg viewBox="0 0 100 100" className="w-24 h-24 sm:w-28 sm:h-28 -rotate-90">
            <defs>
              <linearGradient id="homeRingGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#2563EB" />
                <stop offset="100%" stopColor="#10B981" />
              </linearGradient>
            </defs>
            <circle cx="50" cy="50" r={r} fill="none" stroke="#eef2f7" strokeWidth="10" />
            <circle
              cx="50" cy="50" r={r} fill="none" stroke="url(#homeRingGrad)" strokeWidth="10"
              strokeLinecap="round" strokeDasharray={`${dash} ${circumference - dash}`}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <ParkingSquare className="w-6 h-6 text-blue-600 mb-1" />
            <span className="text-[10px] text-gray-400">Per Zone</span>
          </div>
        </div>
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-600" />
            <span className="text-[11px] text-gray-500">Cars</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-[11px] text-gray-500">Trucks</span>
          </div>
        </div>
      </div>

      {/* zone map card — illustrative UI preview, not live data */}
      <div
        className="absolute left-1 sm:left-2 bottom-4 sm:bottom-8 w-52 sm:w-56 bg-white rounded-3xl shadow-xl shadow-blue-900/10 border border-gray-100 p-4 animate-float-slow"
        style={{ transform: "rotate(3deg)", animationDelay: "1.2s" }}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-gray-500">Zone Map</span>
          <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Multi-Zone</span>
        </div>
        <div className="relative h-24 sm:h-28 rounded-2xl bg-slate-50 overflow-hidden">
          <div
            className="absolute inset-0 opacity-60"
            style={{ backgroundImage: "radial-gradient(circle, #cbd5e1 1px, transparent 1px)", backgroundSize: "14px 14px" }}
          />
          <svg className="absolute inset-0 w-full h-full">
            <line x1="34" y1="76" x2="112" y2="34" stroke="#93c5fd" strokeWidth="2" strokeDasharray="4 4" />
            <line x1="112" y1="34" x2="182" y2="64" stroke="#93c5fd" strokeWidth="2" strokeDasharray="4 4" />
          </svg>
          <MapPin className="absolute w-5 h-5 text-blue-600" style={{ left: 24, top: 44 }} fill="#dbeafe" />
          <div className="absolute" style={{ left: 100, top: 4 }}>
            <span className="absolute -inset-1.5 rounded-full bg-emerald-400/40 animate-pulse-soft" />
            <MapPin className="relative w-6 h-6 text-emerald-600" fill="#d1fae5" />
          </div>
          <MapPin className="absolute w-5 h-5 text-blue-600" style={{ left: 172, top: 34 }} fill="#dbeafe" />
        </div>
      </div>

      {/* floating check-in notification chip — illustrative UI preview, not live data */}
      <div
        className="absolute right-2 sm:right-6 bottom-8 sm:bottom-16 flex items-center gap-2.5 bg-white rounded-2xl shadow-xl shadow-blue-900/10 border border-gray-100 pl-3 pr-4 py-2.5 animate-float-slow"
        style={{ animationDelay: "2.4s" }}
      >
        <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
          <Truck className="w-4 h-4 text-emerald-600" />
        </div>
        <div>
          <p className="text-[11px] font-bold text-gray-800 leading-none">New Check-in</p>
          <p className="text-[10px] text-gray-400 mt-1">Slot assigned automatically</p>
        </div>
      </div>
    </div>
  );
}
