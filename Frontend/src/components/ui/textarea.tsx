import * as React from "react";
import { cn } from "@/lib/utils";
import { securityValidator } from "@/lib/security";
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AlertCircle } from "lucide-react";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  onSecurityFlag?: (flagged: boolean) => void;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, onChange, onPaste, onSecurityFlag, ...props }, ref) => {
    const [isFlagged, setIsFlagged] = React.useState(false);
    const [showWarning, setShowWarning] = React.useState(false);
    const warningTimeoutRef = React.useRef<NodeJS.Timeout>();

    const validateAndProcess = (value: string) => {
      const { isValid } = securityValidator(value);
      
      if (!isValid) {
        setIsFlagged(true);
        setShowWarning(true);
        onSecurityFlag?.(true);
        
        if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);
        warningTimeoutRef.current = setTimeout(() => setShowWarning(false), 3000);
        
        return false; // Block
      }
      
      return true; // Proceed
    };

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (validateAndProcess(e.target.value)) {
        onChange?.(e);
      } else {
        e.preventDefault();
      }
    };

    const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const pastedData = e.clipboardData.getData("text");
      if (!validateAndProcess(pastedData)) {
        e.preventDefault();
      } else {
        onPaste?.(e);
      }
    };

    return (
      <TooltipProvider>
        <Tooltip open={showWarning}>
          <TooltipTrigger asChild>
            <div className="relative w-full">
              <textarea
                className={cn(
                  "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors",
                  isFlagged && "border-destructive/50",
                  showWarning && "border-destructive ring-destructive focus-visible:ring-destructive",
                  className,
                )}
                onChange={handleChange}
                onPaste={handlePaste}
                ref={ref}
                {...props}
              />
              {showWarning && (
                <div className="absolute right-3 top-3 text-destructive animate-pulse">
                  <AlertCircle className="w-4 h-4" />
                </div>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent 
            side="top" 
            className="bg-destructive text-destructive-foreground border-none font-bold text-xs"
          >
            Restricted characters detected for security.
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
