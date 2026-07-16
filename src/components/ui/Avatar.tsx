const GRADIENTS = [
  "from-indigo-500 to-cyan-500",
  "from-emerald-500 to-cyan-500",
  "from-amber-500 to-red-500",
  "from-cyan-500 to-indigo-600",
  "from-red-500 to-amber-500",
];

function gradientFor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return GRADIENTS[hash % GRADIENTS.length];
}

export function Avatar({ name, size = "sm" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const box = size === "sm" ? "w-7 h-7 text-xs" : size === "md" ? "w-9 h-9 text-sm" : "w-12 h-12 text-lg";

  return (
    <div
      className={`shrink-0 rounded-full bg-gradient-to-br ${gradientFor(name)} text-white flex items-center justify-center font-bold ${box}`}
    >
      {initial}
    </div>
  );
}
