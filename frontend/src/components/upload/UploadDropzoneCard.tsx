import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type UploadDropzoneCardProps = {
  title: string;
  titleIcon: React.ReactNode;
  dropzoneIcon: React.ReactNode;
  requirementsTitle: string;
  requirements: React.ReactNode;
  selectedFile?: File | null;
  onFileSelected: (file: File) => void;
  accept?: string;
  disabled?: boolean;
  helperText?: string;
  optionalBadge?: React.ReactNode;
};

export function UploadDropzoneCard({
  title,
  titleIcon,
  dropzoneIcon,
  requirementsTitle,
  requirements,
  selectedFile,
  onFileSelected,
  accept,
  disabled,
  helperText,
  optionalBadge,
}: UploadDropzoneCardProps) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = React.useState(false);

  const pickFile = React.useCallback(() => {
    if (disabled) return;
    inputRef.current?.click();
  }, [disabled]);

  const onDrag = React.useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    if (e.type === "dragleave") setDragActive(false);
  }, [disabled]);

  const onDrop = React.useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (disabled) return;
    const f = e.dataTransfer.files?.[0];
    if (f) onFileSelected(f);
  }, [disabled, onFileSelected]);

  const onChange = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onFileSelected(f);
    // Allow selecting the same file again (important for retry flows)
    e.target.value = "";
  }, [onFileSelected]);

  return (
    <Card className="h-full flex flex-col border-border/60 shadow-sm">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <div className="[&_svg]:h-5 [&_svg]:w-5 text-primary">{titleIcon}</div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg leading-tight">{title}</CardTitle>
              {optionalBadge}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col gap-4">
        {/* Requirements (fixed height to keep both cards symmetric) */}
        <div className="rounded-xl border border-blue-200/70 dark:border-blue-900/60 bg-gradient-to-br from-blue-50/70 to-white/60 dark:from-blue-950/40 dark:to-background/30 p-4 h-36 overflow-auto">
          <p className="text-xs font-semibold text-blue-900/90 dark:text-blue-100/90 mb-2">
            {requirementsTitle}
          </p>
          <div className="text-xs text-muted-foreground">{requirements}</div>
        </div>

        {/* Dropzone */}
        <div
          className={cn(
            "rounded-2xl border-2 border-dashed p-6 text-center transition-colors flex-1 flex items-center justify-center min-h-[220px]",
            disabled
              ? "border-border bg-muted/40 opacity-70"
              : dragActive
                ? "border-primary bg-primary/5"
                : "border-border/80 bg-card/40",
          )}
          onDragEnter={onDrag}
          onDragLeave={onDrag}
          onDragOver={onDrag}
          onDrop={onDrop}
        >
          <div className="flex flex-col items-center gap-3 w-full">
            <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
              <div className="[&_svg]:h-6 [&_svg]:w-6 text-primary">{dropzoneIcon}</div>
            </div>

            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">Drag and drop your file here</p>
              <p className="text-xs text-muted-foreground">or</p>
            </div>

            <div className="flex flex-col items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={pickFile}
                disabled={disabled}
                className="bg-background/80 hover:bg-accent"
              >
                Browse Files
              </Button>
              <input
                ref={inputRef}
                type="file"
                className="hidden"
                accept={accept}
                onChange={onChange}
                disabled={disabled}
              />
            </div>

            {selectedFile && (
              <p className="text-xs font-medium text-primary break-all">
                ✓ {selectedFile.name}
              </p>
            )}

            {helperText && <p className="text-xs text-muted-foreground">{helperText}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

