import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PersonaProfile } from "@/stores/authStore";

const INTERESTS = ["Productivity", "Fitness", "Creator Gear", "Home Tech", "Gaming", "Travel"];
const CONTEXT_PREFS = ["Value-first results", "Premium-first", "Sustainability weighting", "Fast shipping weighting"];

interface PersonaOnboardingModalProps {
  open: boolean;
  onComplete: (profile: PersonaProfile) => void;
}

export const PersonaOnboardingModal = ({ open, onComplete }: PersonaOnboardingModalProps) => {
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [selectedPrefs, setSelectedPrefs] = useState<string[]>([]);

  const canSubmit = selectedInterests.length >= 2 && selectedPrefs.length >= 1;
  const affinity = useMemo(
    () => Object.fromEntries(selectedInterests.map((interest, idx) => [interest, Math.max(55, 90 - idx * 8)])),
    [selectedInterests],
  );

  const toggle = (value: string, selected: string[], setter: (next: string[]) => void) => {
    setter(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  };

  return (
    <Dialog open={open}>
      <DialogContent className="max-w-4xl border-0 bg-white p-8">
        <DialogHeader>
          <DialogTitle className="text-2xl font-semibold">Initialize your AI context memory</DialogTitle>
          <DialogDescription>Choose interest taxonomy and ranking preferences before entering the workspace.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="space-y-3">
            <p className="text-sm font-medium text-slate-700">Interest taxonomy</p>
            <div className="flex flex-wrap gap-2">
              {INTERESTS.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => toggle(item, selectedInterests, setSelectedInterests)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm transition",
                    selectedInterests.includes(item) ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-slate-300",
                  )}
                >
                  {item}
                </button>
              ))}
            </div>
          </section>
          <section className="space-y-3">
            <p className="text-sm font-medium text-slate-700">AI context preferences</p>
            <div className="space-y-2">
              {CONTEXT_PREFS.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => toggle(item, selectedPrefs, setSelectedPrefs)}
                  className={cn(
                    "w-full rounded-lg border px-3 py-2 text-left text-sm transition",
                    selectedPrefs.includes(item) ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-slate-300",
                  )}
                >
                  {item}
                </button>
              ))}
            </div>
          </section>
        </div>
        <div className="flex items-center justify-between border-t pt-4">
          <p className="text-xs text-slate-500">Complete onboarding to unlock the desktop dashboard.</p>
          <Button
            disabled={!canSubmit}
            onClick={() => onComplete({ interests: selectedInterests, categoryAffinity: affinity, aiContextPreferences: selectedPrefs })}
          >
            Enter Workspace
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
