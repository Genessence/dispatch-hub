import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Upload, ScanBarcode, Truck, Clock } from "lucide-react";

interface LogEntry {
  id: string;
  user: string;
  action: string;
  details: string;
  timestamp: Date;
  type: 'upload' | 'audit' | 'dispatch';
}

interface LogsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  logs: LogEntry[];
  title: string;
  type: 'upload' | 'audit' | 'dispatch';
}

export const LogsDialog = ({ isOpen, onClose, logs, title, type }: LogsDialogProps) => {
  const getIcon = () => {
    switch (type) {
      case 'upload':
        return <Upload className="h-4 w-4" />;
      case 'audit':
        return <ScanBarcode className="h-4 w-4" />;
      case 'dispatch':
        return <Truck className="h-4 w-4" />;
    }
  };

  const getColor = () => {
    switch (type) {
      case 'upload':
        return 'bg-blue-500';
      case 'audit':
        return 'bg-purple-500';
      case 'dispatch':
        return 'bg-green-500';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] w-[95vw] sm:w-full">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            {getIcon()}
            <span className="truncate">{title}</span>
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            View all {type} activities across all user sessions
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[400px] sm:h-[500px] pr-2 sm:pr-4">
          {logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              {getIcon()}
              <p className="mt-4 text-sm">No {type} logs yet</p>
              <p className="text-xs mt-1">Activities will appear here once users perform actions</p>
            </div>
          ) : (
            <div className="space-y-2 sm:space-y-3">
              {logs.map((log, index) => (
                <div
                  key={log.id}
                  className="border border-border rounded-lg p-3 sm:p-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className={`w-2 h-2 rounded-full ${getColor()}`} />
                      <Badge variant="outline" className="text-xs font-medium">
                        {log.user}
                      </Badge>
                      <span className="text-xs text-muted-foreground">#{logs.length - index}</span>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] sm:text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span className="truncate">{log.timestamp.toLocaleString()}</span>
                    </div>
                  </div>
                  
                  <div className="space-y-1">
                    <p className="text-xs sm:text-sm font-medium break-words">{log.action}</p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground break-words">{log.details}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {logs.length > 0 && (
          <div className="pt-3 sm:pt-4 border-t border-border">
            <p className="text-[10px] sm:text-xs text-muted-foreground">
              Total {type} activities: <strong>{logs.length}</strong>
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

