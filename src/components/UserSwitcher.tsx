import { useState } from "react";
import { User, ChevronUp, ChevronDown } from "lucide-react";
import { useSession } from "@/contexts/SessionContext";
import { toast } from "sonner";

const UserSwitcher = () => {
  const { currentUser, setCurrentUser } = useSession();
  const [isExpanded, setIsExpanded] = useState(false);

  const users = ["User 1", "User 2", "User 3"];

  const handleUserSwitch = (user: string) => {
    setCurrentUser(user);
    setIsExpanded(false);
    toast.success(`Switched to ${user}`, {
      description: "You can now work with shared data across sessions"
    });
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {/* Expanded User List */}
      {isExpanded && (
        <div className="mb-2 bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden animate-in slide-in-from-bottom-2 duration-200">
          <div className="p-2 space-y-1">
            {users.map((user) => (
              <button
                key={user}
                onClick={() => handleUserSwitch(user)}
                className={`w-full px-4 py-2.5 text-left rounded-md transition-all duration-200 flex items-center gap-2 ${
                  currentUser === user
                    ? "bg-primary text-primary-foreground font-medium"
                    : "hover:bg-gray-100 text-gray-700"
                }`}
              >
                <User className="h-4 w-4" />
                <span className="text-sm">{user}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main Button */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg hover:shadow-xl transition-all duration-200 rounded-lg px-4 py-3 flex items-center gap-2 min-w-[140px] justify-between group"
      >
        <div className="flex items-center gap-2">
          <User className="h-4 w-4" />
          <span className="text-sm font-medium">{currentUser}</span>
        </div>
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 transition-transform" />
        ) : (
          <ChevronUp className="h-4 w-4 transition-transform" />
        )}
      </button>
    </div>
  );
};

export default UserSwitcher;

