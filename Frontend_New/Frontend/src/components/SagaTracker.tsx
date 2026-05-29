import React, { useEffect, useState } from 'react';
import { workflowService } from '@/services/workflowService';
import { Loader2, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface SagaTrackerProps {
  sagaId: string;
  onComplete?: () => void;
  onError?: (error: string) => void;
}

export const SagaTracker: React.FC<SagaTrackerProps> = ({ sagaId, onComplete, onError }) => {
  const [status, setStatus] = useState<string>('PENDING');
  const [completed, setCompleted] = useState<boolean>(false);

  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    const pollStatus = async () => {
      try {
        const res = await workflowService.pollSagaStatus(sagaId);
        setStatus(res.status);

        if (res.completed || res.status === 'COMPLETED' || res.status === 'FAILED') {
          setCompleted(true);
          clearInterval(intervalId);
          if (res.status === 'COMPLETED' && onComplete) {
            onComplete();
          } else if (res.status === 'FAILED' && onError) {
            onError('Transaction failed during coordination.');
          }
        }
      } catch (err) {
        console.error('Failed to poll saga status:', err);
      }
    };

    // Initial check
    pollStatus();

    // Setup polling every 2 seconds
    intervalId = setInterval(pollStatus, 2000);

    return () => clearInterval(intervalId);
  }, [sagaId, onComplete, onError]);

  if (status === 'COMPLETED') {
    return (
      <Alert className="border-emerald-500/20 bg-emerald-500/10 text-emerald-500">
        <CheckCircle2 className="h-4 w-4" />
        <AlertTitle>Success</AlertTitle>
        <AlertDescription>Transaction processed successfully.</AlertDescription>
      </Alert>
    );
  }

  if (status === 'FAILED') {
    return (
      <Alert variant="destructive">
        <XCircle className="h-4 w-4" />
        <AlertTitle>Transaction Failed</AlertTitle>
        <AlertDescription>We encountered an issue coordinating this action. Compensations are being applied safely.</AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert className="border-cobalt/20 bg-cobalt/10 text-cobalt">
      <Loader2 className="h-4 w-4 animate-spin" />
      <AlertTitle>Processing</AlertTitle>
      <AlertDescription>
        Coordinating distributed workflow (Status: {status})
      </AlertDescription>
    </Alert>
  );
};
