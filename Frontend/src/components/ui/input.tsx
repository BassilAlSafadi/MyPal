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

export interface InputProps extends React.ComponentProps<"input"> {
  onSecurityFlag?: (flagged: boolean) => void;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, onChange, onPaste, onSecurityFlag, ...props }, ref) => {
    const [isFlagged, setIsFlagged] = React.useState(false);
    const [showWarning, setShowWarning] = React.useState(false);
    const warningTimeoutRef = React.useRef<NodeJS.Timeout>();

    const validateAndProcess = (value: string, originalHandler?: Function, event?: React.ChangeEvent<any> | React.ClipboardEvent<any>) => {
      const { isValid } = securityValidator(value);
      
      if (!isValid) {
        setIsFlagged(true);
        setShowWarning(true);
        onSecurityFlag?.(true);
        
        // Auto-hide warning after 3 seconds
        if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);
        warningTimeoutRef.current = setTimeout(() => setShowWarning(false), 3000);
        
        return false; // Block
      }
      
      return true; // Proceed
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (validateAndProcess(e.target.value)) {
        onChange?.(e);
      } else {
        // Stop state update by not calling the original handler
        e.preventDefault();
      }
    };

    const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
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
              <input
                type={type}
                className={cn(
                  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm transition-colors",
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
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-destructive animate-pulse">
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
Input.displayName = "Input";

export { Input };
