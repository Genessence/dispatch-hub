import * as React from "react";

import { cn } from "@/lib/utils";

type StatusBannerVariant = "info" | "success" | "warning" | "neutral";

export type StatusBannerProps = React.HTMLAttributes<HTMLDivElement> & {
  variant?: StatusBannerVariant;
};

const variantClasses: Record<StatusBannerVariant, string> = {
  info: "border-primary/20 bg-primary/5",
  success: "border-success/20 bg-success/10",
  warning: "border-warning/20 bg-warning/10",
  neutral: "border-border/60 bg-muted/40",
};

export function StatusBanner({
  variant = "neutral",
  className,
  ...props
}: StatusBannerProps) {
  return (
    <div
      className={cn(
        "rounded-lg border px-4 py-3 text-sm text-foreground",
        variantClasses[variant],
        className
      )}
      {...props}
    />
  );
}

