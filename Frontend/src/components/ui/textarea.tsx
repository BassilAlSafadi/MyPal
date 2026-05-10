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

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  bypassSecurity?: boolean;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, onChange, onPaste, bypassSecurity = false, ...props }, ref) => {
    const [isFlagged, setIsFlagged] = React.useState(false);
    const [isCurrentlyMalicious, setIsCurrentlyMalicious] = React.useState(false);

    const validateAndIntercept = (
      event: React.ChangeEvent<HTMLTextAreaElement> | React.ClipboardEvent<HTMLTextAreaElement>,
      value: string,
      originalHandler?: (e: any) => void
    ) => {
      if (bypassSecurity) {
        originalHandler?.(event);
        return;
      }

      if (!securityValidator(value)) {
        setIsFlagged(true);
        setIsCurrentlyMalicious(true);
        event.preventDefault();
        return;
      }

      setIsCurrentlyMalicious(false);
      originalHandler?.(event);
    };

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      validateAndIntercept(e, e.target.value, onChange);
    };

    const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const pasteData = e.clipboardData.getData("text");
      validateAndIntercept(e, pasteData, onPaste);
    };

    return (
      <TooltipProvider>
        <Tooltip open={isCurrentlyMalicious}>
          <TooltipTrigger asChild>
            <div className="relative w-full">
              <textarea
                className={cn(
                  "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors",
                  isCurrentlyMalicious && "border-red-500 ring-red-500 focus-visible:ring-red-500",
                  className,
                )}
                ref={ref}
                onChange={handleChange}
                onPaste={handlePaste}
                {...props}
              />
              {isCurrentlyMalicious && (
                <div className="absolute right-3 top-3 text-red-500">
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
Textarea.displayName = "Textarea";

export { Textarea };
