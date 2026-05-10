import * as React from "react";
import { cn } from "@/lib/utils";
import { securityValidator } from "@/lib/security";
import { AlertCircle } from "lucide-react";
import { 
  Tooltip, 
  TooltipContent, 
  TooltipProvider, 
  TooltipTrigger 
} from "@/components/ui/tooltip";

export interface InputProps extends React.ComponentProps<"input"> {
  // Option to bypass security check if absolutely necessary for some specific internal tool
  bypassSecurity?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, onChange, onPaste, bypassSecurity = false, ...props }, ref) => {
    const [isFlagged, setIsFlagged] = React.useState(false);
    const [isCurrentlyMalicious, setIsCurrentlyMalicious] = React.useState(false);

    const validateAndIntercept = (
      event: React.ChangeEvent<HTMLInputElement> | React.ClipboardEvent<HTMLInputElement>,
      value: string,
      originalHandler?: (e: any) => void
    ) => {
      if (bypassSecurity) {
        originalHandler?.(event);
        return;
      }

      if (!securityValidator(value)) {
        // Malicious pattern detected!
        setIsFlagged(true);
        setIsCurrentlyMalicious(true);
        
        // Prevent the state update by not calling the original handler
        // and optionally stop propagation
        event.preventDefault();
        return;
      }

      // Safe input
      setIsCurrentlyMalicious(false);
      originalHandler?.(event);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      validateAndIntercept(e, e.target.value, onChange);
    };

    const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
      const pasteData = e.clipboardData.getData("text");
      validateAndIntercept(e, pasteData, onPaste);
    };

    return (
      <TooltipProvider>
        <Tooltip open={isCurrentlyMalicious}>
          <TooltipTrigger asChild>
            <div className="relative w-full">
              <input
                type={type}
                className={cn(
                  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm transition-colors",
                  isCurrentlyMalicious && "border-red-500 ring-red-500 focus-visible:ring-red-500",
                  className,
                )}
                ref={ref}
                onChange={handleChange}
                onPaste={handlePaste}
                {...props}
              />
              {isCurrentlyMalicious && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-red-500">
                  <AlertCircle className="h-4 w-4" />
                </div>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="bg-red-600 text-white border-red-700 shadow-lg">
            <p className="text-xs font-bold">Restricted characters detected for security.</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  },
);
Input.displayName = "Input";

export { Input };
