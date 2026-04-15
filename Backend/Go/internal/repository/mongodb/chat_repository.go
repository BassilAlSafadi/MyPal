package mongodb

import (
	"context"
	"MyPal/Backend/Go/internal/models"
)

type ChatRepository interface {
	SaveMessage(ctx context.Context, message *models.ChatMessage) error
	GetMessagesByTicket(ctx context.Context, ticketID string) ([]*models.ChatMessage, error)
}

type chatRepository struct {
	// mongo client reference
}

func NewChatRepository() ChatRepository {
	return &chatRepository{}
}

func (r *chatRepository) SaveMessage(ctx context.Context, message *models.ChatMessage) error {
	return nil
}

func (r *chatRepository) GetMessagesByTicket(ctx context.Context, ticketID string) ([]*models.ChatMessage, error) {
	return nil, nil
}
