import * as React from "react";

/**
 * Global decorative background for the app.
 * Kept pointer-events-none so it never blocks UI interactions.
 */
export function AppBackground() {
  return (
    <>
      {/* Base gradient */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-blue-100 via-background to-background dark:from-blue-950/40" />

      {/* Radial accents */}
      <div
        className="pointer-events-none absolute inset-0 opacity-60 dark:opacity-40"
        style={{
          backgroundImage: `radial-gradient(circle at 15% 10%, rgba(59, 130, 246, 0.18) 0%, transparent 45%),
                           radial-gradient(circle at 85% 30%, rgba(14, 165, 233, 0.15) 0%, transparent 50%),
                           radial-gradient(circle at 60% 90%, rgba(99, 102, 241, 0.15) 0%, transparent 45%)`,
        }}
      />
    </>
  );
}

