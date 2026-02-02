import * as React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type PageShellProps = {
  title: string;
  subtitle?: string;
  backHref: string;
  backIcon?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  /** Optional decorative background layers (e.g., gradients/patterns). */
  decorations?: React.ReactNode;
  /** Additional classes for the root wrapper. */
  rootClassName?: string;
  /** Tailwind max-width class for the content container (default: max-w-5xl). */
  maxWidthClassName?: string;
  /** Additional classes for the main content area. */
  mainClassName?: string;
};

export function PageShell({
  title,
  subtitle,
  backHref,
  backIcon,
  actions,
  children,
  decorations,
  rootClassName,
  maxWidthClassName,
  mainClassName,
}: PageShellProps) {
  return (
    <div className={cn("min-h-screen relative overflow-hidden bg-background", rootClassName)}>
      {decorations}
      <header className="sticky top-0 z-50 border-b border-border/60 bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/60">
        <div className="container mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 sm:gap-4 w-full sm:w-auto">
              <Button
                asChild
                variant="ghost"
                size="icon"
                className="h-8 w-8 sm:h-10 sm:w-10"
              >
                <Link to={backHref} aria-label="Back">
                  {backIcon ?? <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />}
                </Link>
              </Button>
              <div className="flex-1">
                <h1 className="text-lg sm:text-2xl font-semibold tracking-tight text-foreground">
                  {title}
                </h1>
                {subtitle ? (
                  <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">
                    {subtitle}
                  </p>
                ) : null}
              </div>
            </div>
            {actions ? (
              <div className="w-full sm:w-auto flex items-center justify-stretch sm:justify-end gap-2">
                {actions}
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <main
        className={cn(
          "container mx-auto px-4 sm:px-6 py-4 sm:py-8 pb-24 sm:pb-8",
          maxWidthClassName ?? "max-w-5xl",
          mainClassName
        )}
      >
        {children}
      </main>
    </div>
  );
}

