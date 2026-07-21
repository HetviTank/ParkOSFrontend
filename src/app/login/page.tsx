"use client";

import { useState } from "react";
import {
  Eye,
  EyeOff,
  Mail,
  Lock,
  Car,
  Truck,
  ArrowRight,
  Loader2,
  ChevronLeft,
  CheckCircle2,
  ParkingSquare,
  Zap,
  Gauge,
  MapPin,
} from "lucide-react";
import { authApi } from "@/lib/api";
import { BrandMark } from "@/components/ui/BrandMark";

type View = "login" | "forgot" | "otp";

export default function LoginPage() {
  const [view, setView] = useState<View>("login");
  const [forgotEmail, setForgotEmail] = useState("");

  return (
    <div className="min-h-screen flex bg-slate-50">
      <HeroPanel />

      {/* ── Right panel ── */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12 bg-slate-50 relative">
        <div className="absolute inset-0 bg-[radial-gradient(800px_400px_at_100%_0%,rgba(37,99,235,0.08),transparent_60%)] pointer-events-none" />
        <div className="w-full max-w-md relative">
          <div className="animate-fade-in-up rounded-3xl border border-white/60 bg-white/80 backdrop-blur-xl shadow-[0_25px_70px_-20px_rgba(37,99,235,0.3)] p-8 sm:p-10">
            {view === "login" && <LoginForm onForgot={() => setView("forgot")} />}
            {view === "forgot" && (
              <ForgotPasswordForm
                onBack={() => setView("login")}
                onNext={(email) => {
                  setForgotEmail(email);
                  setView("otp");
                }}
              />
            )}
            {view === "otp" && <OtpForm email={forgotEmail} onBack={() => setView("forgot")} />}
          </div>
          <p className="mt-6 text-center text-xs text-gray-400">
            © 2026 ParkOS • Smart Parking Management
          </p>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────── Hero panel ──────────────────────────────── */
const HERO_STATS = [
  { icon: Car, value: "Real-Time", label: "Vehicle Tracking", tint: "bg-emerald-50 text-emerald-600" },
  { icon: Truck, value: "Fleet Ready", label: "Trucks & Trailers", tint: "bg-blue-50 text-blue-600" },
  { icon: Gauge, value: "Smart", label: "Slot Detection", tint: "bg-blue-50 text-blue-600" },
  { icon: Zap, value: "Instant", label: "Live Alerts", tint: "bg-indigo-50 text-indigo-600" },
];

function HeroPanel() {
  return (
    <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden flex-col p-12 m-4 rounded-[32px] shadow-2xl shadow-blue-900/10 bg-gradient-to-b from-sky-50 via-white to-white border border-gray-100">
      {/* logo */}
      <div className="relative z-10">
        <BrandMark size="md" />
      </div>

      {/* headline */}
      <div className="relative z-10 max-w-sm mt-10">
        <h1 className="text-4xl font-bold text-gray-900 leading-tight mb-4">
          Smart Parking Management
        </h1>
        <p className="text-gray-500 text-base mb-3">
          Manage cars, trucks, parking slots, bookings, and operations efficiently from one
          intelligent platform.
        </p>
        <p className="text-sm font-medium text-gray-400 tracking-wide">
          Secure <span className="mx-2 text-emerald-400">•</span> Real-Time
          <span className="mx-2 text-emerald-400">•</span> Scalable
          <span className="mx-2 text-emerald-400">•</span> Enterprise Ready
        </p>

        {/* stat cards */}
        <div className="grid grid-cols-2 gap-3 mt-8 max-w-sm">
          {HERO_STATS.map((s) => (
            <div
              key={s.label}
              className="flex items-center gap-3 bg-white rounded-2xl shadow-md shadow-gray-200/60 border border-gray-100 px-3.5 py-3"
            >
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${s.tint}`}>
                <s.icon className="w-4.5 h-4.5" />
              </div>
              <div>
                <p className="text-gray-900 font-bold text-sm leading-none">{s.value}</p>
                <p className="text-gray-400 text-[11px] leading-none mt-1">{s.label}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* modern dashboard-mockup visual, filling the lower portion of the panel */}
      <div className="absolute inset-x-0 bottom-0 h-[56%] z-0 pointer-events-none">
        <HeroVisual />
      </div>
    </div>
  );
}

/* ──────────────────────────────── Hero visual (dashboard mockup) ──────────────────────────────── */
function HeroVisual() {
  const r = 42;
  const circumference = 2 * Math.PI * r;
  const dash = circumference * 0.68;

  return (
    <div className="relative w-full h-full">
      {/* ambient gradient blobs */}
      <div className="absolute top-4 right-6 w-64 h-64 bg-blue-200/40 rounded-full blur-3xl animate-blob" />
      <div
        className="absolute bottom-2 left-4 w-72 h-72 bg-emerald-200/40 rounded-full blur-3xl animate-blob"
        style={{ animationDelay: "4s" }}
      />

      {/* occupancy tracking card (illustrative UI preview, not live data) */}
      <div
        className="absolute right-8 top-2 w-52 bg-white rounded-3xl shadow-xl shadow-blue-900/10 border border-gray-100 p-5"
        style={{ transform: "rotate(-4deg)" }}
      >
        <div className="flex items-center gap-1.5 mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse-soft" />
          <span className="text-xs font-semibold text-gray-500">Occupancy Tracking</span>
        </div>
        <div className="relative w-28 h-28 mx-auto">
          <svg viewBox="0 0 100 100" className="w-28 h-28 -rotate-90">
            <defs>
              <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#2563EB" />
                <stop offset="100%" stopColor="#10B981" />
              </linearGradient>
            </defs>
            <circle cx="50" cy="50" r={r} fill="none" stroke="#eef2f7" strokeWidth="10" />
            <circle
              cx="50"
              cy="50"
              r={r}
              fill="none"
              stroke="url(#ringGrad)"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circumference - dash}`}
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

      {/* zone map card (illustrative UI preview, not live data) */}
      <div
        className="absolute left-4 bottom-4 w-56 bg-white rounded-3xl shadow-xl shadow-blue-900/10 border border-gray-100 p-4"
        style={{ transform: "rotate(3deg)" }}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-gray-500">Zone Map</span>
          <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
            Multi-Zone
          </span>
        </div>
        <div className="relative h-28 rounded-2xl bg-slate-50 overflow-hidden">
          <div
            className="absolute inset-0 opacity-60"
            style={{
              backgroundImage: "radial-gradient(circle, #cbd5e1 1px, transparent 1px)",
              backgroundSize: "14px 14px",
            }}
          />
          <svg className="absolute inset-0 w-full h-full">
            <line x1="34" y1="76" x2="112" y2="34" stroke="#93c5fd" strokeWidth="2" strokeDasharray="4 4" />
            <line x1="112" y1="34" x2="182" y2="64" stroke="#93c5fd" strokeWidth="2" strokeDasharray="4 4" />
          </svg>
          <MapPin className="absolute w-5 h-5 text-blue-600" style={{ left: 24, top: 60 }} fill="#dbeafe" />
          <div className="absolute" style={{ left: 100, top: 12 }}>
            <span className="absolute -inset-1.5 rounded-full bg-emerald-400/40 animate-pulse-soft" />
            <MapPin className="relative w-6 h-6 text-emerald-600" fill="#d1fae5" />
          </div>
          <MapPin className="absolute w-5 h-5 text-blue-600" style={{ left: 172, top: 50 }} fill="#dbeafe" />
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────── Shared bits ──────────────────────────────── */
function ErrorAlert({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
      <span className="mt-0.5">⚠</span>
      <span>{children}</span>
    </div>
  );
}

function SubmitButton({
  loading,
  loadingLabel,
  children,
}: {
  loading: boolean;
  loadingLabel: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-emerald-500 hover:from-blue-700 hover:to-emerald-600 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-all shadow-lg shadow-blue-600/20 hover:shadow-xl hover:shadow-blue-600/30 active:scale-[0.99]"
    >
      {loading ? (
        <>
          <Loader2 className="w-4.5 h-4.5 animate-spin" />
          {loadingLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}

/* ──────────────────────────────── Login form ──────────────────────────────── */
function LoginForm({ onForgot }: { onForgot: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await authApi.login({
        email,
        password,
        is_running_on_mobile: false,
        is_remember: remember,
        mobile_device_name: null,
      });
      localStorage.setItem("token", data.token);
      localStorage.setItem("refresh_token", data.refresh_token);
      localStorage.setItem(
        "user",
        JSON.stringify({ id: data.id, name: data.name, email: data.email, location_id: data.location_id, role: data.role })
      );
      window.location.href = "/dashboard";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="mb-8">
        <div className="lg:hidden mb-6">
          <BrandMark size="sm" />
        </div>
        <h2 className="text-3xl font-bold text-gray-900">Welcome back</h2>
        <p className="mt-2 text-gray-500">Sign in to continue to your dashboard</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Email address
          </label>
          <div className="relative">
            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-400" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:border-transparent focus:bg-white transition-all"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-sm font-medium text-gray-700">Password</label>
            <button
              type="button"
              onClick={onForgot}
              className="text-xs font-medium text-blue-600 hover:text-blue-700 transition"
            >
              Forgot password?
            </button>
          </div>
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-400" />
            <input
              type={showPw ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              className="w-full pl-10 pr-11 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:border-transparent focus:bg-white transition-all"
            />
            <button
              type="button"
              onClick={() => setShowPw(!showPw)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
            >
              {showPw ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
            </button>
          </div>
        </div>

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 accent-blue-600"
          />
          <span className="text-sm text-gray-600">Remember me</span>
        </label>

        {error && <ErrorAlert>{error}</ErrorAlert>}

        <SubmitButton loading={loading} loadingLabel="Signing in…">
          Sign In
          <ArrowRight className="w-4.5 h-4.5" />
        </SubmitButton>
      </form>

      <div className="flex items-center gap-3 my-6">
        <div className="h-px flex-1 bg-gray-200" />
        <span className="text-xs text-gray-400">or continue with</span>
        <div className="h-px flex-1 bg-gray-200" />
      </div>

      <button
        type="button"
        disabled
        title="Google sign-in coming soon"
        className="w-full flex items-center justify-center gap-2.5 border border-gray-200 bg-white text-gray-700 font-medium py-3 rounded-xl opacity-60 cursor-not-allowed"
      >
        <svg className="w-4.5 h-4.5" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
        Sign in with Google
      </button>
    </div>
  );
}

/* ──────────────────────────── Forgot password form ─────────────────────────── */
function ForgotPasswordForm({
  onBack,
  onNext,
}: {
  onBack: () => void;
  onNext: (email: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await authApi.forgotPassword({ email });
      onNext(email);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send OTP.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-8 transition"
      >
        <ChevronLeft className="w-4 h-4" />
        Back to login
      </button>

      <div className="mb-8">
        <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center mb-5">
          <Mail className="w-7 h-7 text-blue-600" />
        </div>
        <h2 className="text-3xl font-bold text-gray-900">Forgot password?</h2>
        <p className="mt-2 text-gray-500">
          Enter your email and we&apos;ll send a 6-digit OTP to reset your password.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Email address
          </label>
          <div className="relative">
            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-400" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:border-transparent focus:bg-white transition-all"
            />
          </div>
        </div>

        {error && <ErrorAlert>{error}</ErrorAlert>}

        <SubmitButton loading={loading} loadingLabel="Sending OTP…">
          Send OTP
          <ArrowRight className="w-4.5 h-4.5" />
        </SubmitButton>
      </form>
    </div>
  );
}

/* ──────────────────────────────── OTP / Reset form ──────────────────────────── */
function OtpForm({ email: initialEmail, onBack }: { email: string; onBack: () => void }) {
  const [email, setEmail] = useState(initialEmail);
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirmPw) {
      setError("Passwords do not match.");
      return;
    }
    if (otp.length !== 6) {
      setError("OTP must be exactly 6 digits.");
      return;
    }
    setLoading(true);
    try {
      await authApi.confirmForgotPassword({ email, otp, password });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset password.");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="text-center">
        <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="w-8 h-8 text-emerald-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Password reset!</h2>
        <p className="text-gray-500 mb-8">
          Your password has been updated. You can now sign in.
        </p>
        <button
          onClick={onBack}
          className="w-full bg-gradient-to-r from-blue-600 to-emerald-500 hover:from-blue-700 hover:to-emerald-600 text-white font-semibold py-3 rounded-xl transition-all shadow-lg shadow-blue-600/20"
        >
          Back to login
        </button>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-8 transition"
      >
        <ChevronLeft className="w-4 h-4" />
        Back
      </button>

      <div className="mb-8">
        <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center mb-5">
          <Lock className="w-7 h-7 text-blue-600" />
        </div>
        <h2 className="text-3xl font-bold text-gray-900">Reset password</h2>
        <p className="mt-2 text-gray-500">
          Enter the OTP sent to your email and choose a new password.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Email address
          </label>
          <div className="relative">
            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-400" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:border-transparent focus:bg-white transition-all"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            6-digit OTP
          </label>
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
            required
            placeholder="123456"
            className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:border-transparent focus:bg-white transition-all tracking-[0.5em] font-mono text-center text-lg"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            New password
          </label>
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-400" />
            <input
              type={showPw ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="Min 6 characters"
              className="w-full pl-10 pr-11 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:border-transparent focus:bg-white transition-all"
            />
            <button
              type="button"
              onClick={() => setShowPw(!showPw)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
            >
              {showPw ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Confirm new password
          </label>
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-400" />
            <input
              type={showPw ? "text" : "password"}
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              required
              placeholder="Re-enter password"
              className={`w-full pl-10 pr-4 py-3 rounded-xl border bg-gray-50 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:border-transparent focus:bg-white transition-all ${
                confirmPw && confirmPw !== password ? "border-red-300" : "border-gray-200"
              }`}
            />
          </div>
          {confirmPw && confirmPw !== password && (
            <p className="mt-1.5 text-xs text-red-500">Passwords do not match</p>
          )}
        </div>

        {error && <ErrorAlert>{error}</ErrorAlert>}

        <SubmitButton loading={loading} loadingLabel="Resetting…">
          Reset password
          <ArrowRight className="w-4.5 h-4.5" />
        </SubmitButton>
      </form>
    </div>
  );
}
