import { ParkingSquare, Car } from "lucide-react";

export function BrandMark({ size = "md", light = false }: { size?: "sm" | "md" | "lg"; light?: boolean }) {
  const box = size === "lg" ? "w-14 h-14" : size === "sm" ? "w-9 h-9" : "w-12 h-12";
  const icon = size === "lg" ? "w-7 h-7" : size === "sm" ? "w-5 h-5" : "w-6 h-6";
  const text = size === "lg" ? "text-2xl" : size === "sm" ? "text-lg" : "text-xl";

  return (
    <div className="inline-flex items-center gap-3">
      <div
        className={`relative ${box} rounded-2xl bg-gradient-to-br from-blue-600 to-emerald-500 flex items-center justify-center shadow-lg shadow-blue-900/20`}
      >
        <ParkingSquare className={`${icon} text-white`} strokeWidth={2.25} />
        <div className="absolute -bottom-1.5 -right-1.5 w-5 h-5 rounded-full bg-white flex items-center justify-center shadow">
          <Car className="w-3 h-3 text-blue-600" strokeWidth={2.5} />
        </div>
      </div>
      <span className={`font-bold ${text} ${light ? "text-white" : "text-gray-900"}`}>
        Park<span className={light ? "text-emerald-300" : "text-blue-600"}>OS</span>
      </span>
    </div>
  );
}
