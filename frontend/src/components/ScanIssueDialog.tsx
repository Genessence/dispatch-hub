import { useMemo } from "react";
import { AlertCircle, AlertTriangle, Info } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type ScanIssueSeverity = "error" | "warning" | "info";

export type ScanIssueContextItem = {
  label: string;
  value?: string | number | null | undefined;
};

export type ScanIssue = {
  title: string;
  description: string;
  severity?: ScanIssueSeverity;
  context?: ScanIssueContextItem[];
};

function getSeverityIcon(severity: ScanIssueSeverity) {
  switch (severity) {
    case "error":
      return AlertCircle;
    case "warning":
      return AlertTriangle;
    case "info":
      return Info;
  }
}

function getSeverityClasses(severity: ScanIssueSeverity) {
  switch (severity) {
    case "error":
      return { icon: "text-red-600", border: "border-red-200 dark:border-red-900" };
    case "warning":
      return { icon: "text-orange-600", border: "border-orange-200 dark:border-orange-900" };
    case "info":
      return { icon: "text-blue-600", border: "border-blue-200 dark:border-blue-900" };
  }
}

export function ScanIssueDialog({
  open,
  onOpenChange,
  issue,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  issue: ScanIssue | null;
}) {
  const severity: ScanIssueSeverity = issue?.severity ?? "warning";
  const Icon = getSeverityIcon(severity);
  const classes = getSeverityClasses(severity);

  const contextItems = useMemo(() => {
    const items = issue?.context ?? [];
    return items.filter((i) => i.value !== undefined && i.value !== null && String(i.value).trim() !== "");
  }, [issue]);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className={classes.border}>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Icon className={`h-5 w-5 ${classes.icon}`} />
            <span>{issue?.title ?? "Scan issue"}</span>
          </AlertDialogTitle>
          <AlertDialogDescription>
            <div className="space-y-3">
              <p className="whitespace-pre-line">{issue?.description ?? ""}</p>
              {contextItems.length > 0 && (
                <div className="rounded-md border bg-muted/30 p-3 text-sm">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {contextItems.map((item, idx) => (
                      <div key={`${item.label}-${idx}`} className="flex items-start justify-between gap-2">
                        <span className="text-muted-foreground">{item.label}</span>
                        <span className="font-medium text-right break-all">{String(item.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction autoFocus>OK</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

