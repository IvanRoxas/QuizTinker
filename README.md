# QuizTinker

QuizTinker is an AI-integrated quiz platform for academic use. It includes automated quiz generation, per-tab session isolation, and late submission penalties.

## Key Features

- **AI Quiz Generation**: Instantly create quiz items using AI.
- **Academic System**: Support for late penalties, time limits, and attempt limits.
- **Auto-Save**: Real-time progress tracking to prevent data loss.
- **Session Isolation**: Uses `sessionStorage` and Token Authentication for multiple concurrent sessions.
- **Modern UI**: Clean neo-brutalist design for better usability.
- **Analytics**: Performance reports for students and management tools for instructors.

## Tech Stack

- **Frontend**: React.js
- **Backend**: Django, Django Rest Framework
- **Database**: PostgreSQL
- **Authentication**: Token-based

## Getting Started

### Prerequisites
- Node.js (v18+)
- Python (3.10+)
- PostgreSQL

### Backend Setup

1. Go to the `django_backend` directory.
2. Create and activate a virtual environment.
3. Install dependencies: `pip install -r requirements.txt`.
4. Copy `.env.example` to `.env` and configure your database.
5. Run migrations: `python manage.py migrate`.
6. Start server: `python manage.py runserver`.

### Frontend Setup

1. Go to the `frontend` directory.
2. Install dependencies: `npm install`.
3. Create a `.env` file with `REACT_APP_API_URL=http://localhost:8000`.
4. Start development server: `npm start`.

## Academic Project Disclaimer

QuizTinker was developed as a Final Requirement for the Web Systems and Technologies 2 course at the Technological Institute of the Philippines - Manila. It is intended for academic demonstration purposes.

## Development Team
- **Ivan Roxas**: Lead Developer
- Team Members (See Footer for full list)

---
© 2026 QuizTinker Project
