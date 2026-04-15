# MyPal Support System Infrastructure

This module defines the polyglot infrastructure for the MyPal Support System.

## Architectural Ownership

- **C# (`Backend/CSharp`)**: Owns the persistent data layer via **PostgreSQL**. Responsible for ticket management and core business entities.
- **Go (`Backend/Go`)**: Owns the real-time communication layer and session management. Utilizes **MongoDB** for chat history and **Redis** for active sessions.
- **Python (`Backend/Python`)**: Owns the **AI Service** and inference logic. Responsible for sentiment analysis, automated categorization, and response suggestions.
- **Frontend (`Frontend`)**: React-based UI components for user interaction with the support system.

## Clean Architecture Principles

Each service is structured to separate concerns, ensuring that the business logic remains independent of external frameworks or databases.
