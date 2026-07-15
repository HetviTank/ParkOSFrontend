export function GlassCard({
  gradientBorder = false,
  hoverLift = false,
  className = "",
  style,
  children,
}: {
  gradientBorder?: boolean;
  hoverLift?: boolean;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  // The gradient-border variant needs a near-opaque surface, otherwise the
  // vivid 1px ring bleeds through a translucent glass background and washes
  // the whole card in color instead of reading as a thin accent line.
  const surface = gradientBorder
    ? "bg-white/95 dark:bg-slate-900/95"
    : "bg-white/70 backdrop-blur-xl dark:bg-slate-900/60";

  const cardClasses = `rounded-3xl border border-white/60 shadow-sm dark:border-slate-800/70 ${surface} ${
    hoverLift ? "transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:scale-[1.015] " : ""
  }${className}`;

  if (gradientBorder) {
    return (
      <div
        className="rounded-3xl p-px bg-gradient-to-br from-indigo-400 via-cyan-400 to-indigo-500 dark:from-indigo-500 dark:via-cyan-500 dark:to-indigo-600"
        style={style}
      >
        <div className={cardClasses}>{children}</div>
      </div>
    );
  }

  return (
    <div className={cardClasses} style={style}>
      {children}
    </div>
  );
}
