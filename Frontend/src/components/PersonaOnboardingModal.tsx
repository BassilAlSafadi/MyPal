import * as React from "react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuthStore, PersonaProfile } from "@/stores/authStore";
import { Sparkles, Brain, Search, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

const INTEREST_OPTIONS = [
  "Electronics", "Home Decor", "Fitness", "Fashion", "Outdoor", "Gaming", "Photography", "Books"
];

const PREFERENCE_OPTIONS = [
  "Lowest Price First", "Fastest Shipping", "Highest Quality", "Eco-Friendly", "Local Sellers"
];

export const PersonaOnboardingModal = () => {
  const { needsOnboarding, completeOnboarding } = useAuthStore();
  const [step, setStep] = React.useState(1);
  const [selectedInterests, setSelectedInterests] = React.useState<string[]>([]);
  const [selectedPrefs, setSelectedPrefs] = React.useState<string[]>([]);

  const toggleInterest = (interest: string) => {
    setSelectedInterests(prev => 
      prev.includes(interest) ? prev.filter(i => i !== interest) : [...prev, interest]
    );
  };

  const togglePref = (pref: string) => {
    setSelectedPrefs(prev => 
      prev.includes(pref) ? prev.filter(p => p !== pref) : [...prev, pref]
    );
  };

  const handleComplete = () => {
    const profile: PersonaProfile = {
      interests: selectedInterests,
      categoryAffinity: selectedInterests.reduce((acc, curr) => ({ ...acc, [curr]: 0.5 }), {}),
      aiContextPreferences: selectedPrefs
    };
    completeOnboarding(profile);
  };

  return (
    <Dialog open={needsOnboarding}>
      <DialogContent className="sm:max-w-md bg-white rounded-3xl border-0 shadow-2xl p-0 overflow-hidden">
        <div className="bg-gradient-cobalt p-8 text-white">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center">
              <Brain className="w-6 h-6" />
            </div>
            <div className="h-1 w-24 bg-white/30 rounded-full overflow-hidden">
              <div className="h-full bg-white transition-all duration-500" style={{ width: `${(step/2)*100}%` }} />
            </div>
          </div>
          <h2 className="text-2xl font-serif font-bold leading-tight">
            {step === 1 ? "Initialize AI Persona" : "Set Discovery Logic"}
          </h2>
          <p className="text-sm text-white/80 mt-2 font-medium">
            {step === 1 ? "What are you passionate about discovered today?" : "How should our agents prioritize results for you?"}
          </p>
        </div>

        <div className="p-8">
          {step === 1 ? (
            <div className="flex flex-wrap gap-2">
              {INTEREST_OPTIONS.map(interest => (
                <button
                  key={interest}
                  onClick={() => toggleInterest(interest)}
                  className={cn(
                    "px-4 py-2 rounded-xl text-sm font-bold transition-all border-2",
                    selectedInterests.includes(interest)
                      ? "bg-cobalt border-cobalt text-white shadow-lg shadow-cobalt/20"
                      : "bg-slate-50 border-slate-100 text-slate-500 hover:border-cobalt-light/30"
                  )}
                >
                  {interest}
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {PREFERENCE_OPTIONS.map(pref => (
                <button
                  key={pref}
                  onClick={() => togglePref(pref)}
                  className={cn(
                    "w-full flex items-center justify-between p-4 rounded-2xl border-2 transition-all",
                    selectedPrefs.includes(pref)
                      ? "bg-cobalt/5 border-cobalt text-cobalt"
                      : "bg-slate-50 border-slate-100 text-slate-500"
                  )}
                >
                  <span className="text-sm font-bold">{pref}</span>
                  {selectedPrefs.includes(pref) && <CheckCircle2 className="w-5 h-5" />}
                </button>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="p-8 pt-0 flex gap-3">
          {step === 1 ? (
            <Button 
              onClick={() => setStep(2)} 
              disabled={selectedInterests.length === 0}
              className="w-full h-12 bg-gradient-cobalt rounded-xl font-bold"
            >
              Continue <Search className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep(1)} className="h-12 rounded-xl font-bold">Back</Button>
              <Button onClick={handleComplete} className="flex-1 h-12 bg-gradient-cobalt rounded-xl font-bold">
                Finish <Sparkles className="w-4 h-4 ml-2" />
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
