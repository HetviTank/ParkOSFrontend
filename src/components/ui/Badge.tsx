type BadgeColor = "blue" | "red" | "emerald" | "amber" | "gray" | "indigo";

const COLOR_MAP: Record<BadgeColor, string> = {
  blue: "bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300",
  red: "bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300",
  emerald: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  gray: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
  indigo: "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300",
};

export function Badge({
  color = "gray",
  children,
  className = "",
}: {
  color?: BadgeColor;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${COLOR_MAP[color]} ${className}`}>
      {children}
    </span>
  );
}
