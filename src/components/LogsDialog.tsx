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
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {getIcon()}
            {title}
          </DialogTitle>
          <DialogDescription>
            View all {type} activities across all user sessions
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[500px] pr-4">
          {logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              {getIcon()}
              <p className="mt-4 text-sm">No {type} logs yet</p>
              <p className="text-xs mt-1">Activities will appear here once users perform actions</p>
            </div>
          ) : (
            <div className="space-y-3">
              {logs.map((log, index) => (
                <div
                  key={log.id}
                  className="border border-border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${getColor()}`} />
                      <Badge variant="outline" className="text-xs font-medium">
                        {log.user}
                      </Badge>
                      <span className="text-xs text-muted-foreground">#{logs.length - index}</span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {log.timestamp.toLocaleString()}
                    </div>
                  </div>
                  
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{log.action}</p>
                    <p className="text-xs text-muted-foreground">{log.details}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {logs.length > 0 && (
          <div className="pt-4 border-t border-border">
            <p className="text-xs text-muted-foreground">
              Total {type} activities: <strong>{logs.length}</strong>
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

