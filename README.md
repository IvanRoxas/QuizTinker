# QuizTinker

QuizTinker is an AI-integrated quiz platform for academic use. It includes automated LET-ready quiz generation powered by Gemini AI, reference material processing, per-tab session isolation, and comprehensive assessment management.

## Key Features

- **AI Quiz Generation**: Automatically generate LET board exam-ready questions using Gemini with Bloom's taxonomy distribution
- **Reference Material Processing**: Upload PDF, DOCX, PPTX, or TXT files as reference material for context-aware question generation
- **Multi-Language Support**: Automatic language detection (English and Filipino) based on specialization
- **Academic System**: Support for late penalties, time limits, attempt limits, and category-based organization
- **Smart Specialization Detection**: Auto-detect quiz specialization from uploaded reference materials
- **Auto-Save**: Real-time progress tracking to prevent data loss
- **Session Isolation**: Uses `sessionStorage` and Token Authentication for multiple concurrent sessions
- **Modern UI**: Clean interface for better usability
- **Analytics**: Performance reports for students and comprehensive management tools for instructors

## Tech Stack

- **Frontend**: React.js
- **Backend**: Django, Django Rest Framework
- **Database**: PostgreSQL
- **Authentication**: Token-based
- **AI**: Google Generativeai (Gemini 2.5 Flash)
- **File Processing**: pdfplumber (PDF), python-docx (DOCX), python-pptx (PPTX)

## AI Features

### LET Board Exam Question Generation

Automatically generate Licensure Examination for Teachers (LET) board exam-ready multiple-choice questions with intelligent distribution across all Bloom's taxonomy levels:

- 15% Remember | 20% Understand | 25% Apply | 20% Analyze | 10% Evaluate | 10% Create

### Supported Specializations

GenEd, ProfEd, Filipino, English, Mathematics, Science, Social Studies, MAPEH, TLE, Values Education, Rizal

### Context-Aware Generation

Upload reference materials (PDF, DOCX, PPTX, TXT) for context-aware question generation. The system automatically detects subject matter and adjusts question complexity accordingly.

### Smart Preprocessing

NLP-based prompt analysis extracts topic, desired question count, and language preferences from free-text user input, optimizing API efficiency and response quality.

## Getting Started

### Prerequisites

- Node.js (v18+)
- Python (3.10+)
- PostgreSQL
- Google Generativeai API Key (for AI quiz generation)

### Backend Setup

1. Go to the `django_backend` directory.
2. Create and activate a virtual environment.
3. Install dependencies: `pip install -r requirements.txt`.
4. Copy `.env.example` to `.env` and configure:
   - Database credentials
   - `GEMINI_API_KEY` for AI quiz generation
5. Run migrations: `python manage.py migrate`.
6. Start server: `python manage.py runserver`.

### Frontend Setup

1. Go to the `frontend` directory.
2. Install dependencies: `npm install`.
3. Create a `.env` file with `REACT_APP_API_URL=http://localhost:8000`.
4. Start development server: `npm start`.

## Documentation

For detailed information about recent updates, features, and implementation details, see [UPDATES.md](UPDATES.md).

## Academic Project Disclaimer

QuizTinker was developed as a Final Requirement for the Web Systems and Technologies 2 course at the Technological Institute of the Philippines - Manila. It is intended for academic demonstration purposes.

## Development Team

- **Ivan Roxas**: Lead Developer
- **Daniel Espela**: AI and Deployment Specialist

---

© 2026 QuizTinker Project
