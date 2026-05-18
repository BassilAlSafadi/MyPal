package saga

import (
	"time"
)

type Status string

const (
	StatusProcessing   Status = "PROCESSING"
	StatusCompleted    Status = "COMPLETED"
	StatusFailed       Status = "FAILED"
	StatusCompensating Status = "COMPENSATING"
	StatusCompensated  Status = "COMPENSATED"
	StatusDeadLetter   Status = "DEAD_LETTER"
)

type SagaState struct {
	ID            string
	Workflow      string
	CorrelationID string
	CausationID   string
	CurrentStatus Status
	CurrentStep   string
	CreatedAt     time.Time
	UpdatedAt     time.Time
	TimeoutAt     time.Time
	FailureReason *string
	RetryCount    int
}

type StatusResponse struct {
	SagaID        string     `json:"saga_id"`
	Workflow      string     `json:"workflow"`
	Status        Status     `json:"status"`
	CurrentStep   string     `json:"current_step"`
	Completed     bool       `json:"completed"`
	FailureReason *string    `json:"failure_reason,omitempty"`
	UpdatedAt     *time.Time `json:"updated_at,omitempty"`
}

type StepStatus string

const (
	StepStatusStarted     StepStatus = "STARTED"
	StepStatusCompleted   StepStatus = "COMPLETED"
	StepStatusFailed      StepStatus = "FAILED"
	StepStatusCompensated StepStatus = "COMPENSATED"
)

type SagaStep struct {
	ID                    string
	SagaID                string
	StepName              string
	ExecutionOrder        int
	Status                StepStatus
	Timestamp             time.Time
	CompensationRequired  bool
	CompensationCompleted bool
	ErrorDetails          *string
}
