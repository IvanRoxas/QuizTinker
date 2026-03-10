# QuizTinker 📚

QuizTinker is a high-performance, AI-integrated quiz platform designed for academic environments. It features automated quiz generation, strict per-tab session isolation, and a robust late submission system with automated penalties.

## ✨ Key Features

- **🤖 AI-Powered Generation**: Instantly generate high-quality quiz items using advanced AI integration.
- **🛡️ Academic Rigor**: Built-in support for late submission penalties, time limits, and attempt management.
- **🔄 Progressive Auto-Save**: Real-time progress tracking ensures student data is never lost, even during connectivity issues.
- **🔐 Per-Tab Isolation**: Advanced session management using `sessionStorage` and Token Authentication allows multiple concurrent sessions in different tabs.
- **🖌️ Neo-Brutalist Design**: A bold, modern UI/UX designed to be both visually striking and highly functional.
- **📊 Real-time Analytics**: Detailed performance reports for students and management tools for instructors.

## 🛠️ Tech Stack

- **Frontend**: React.js, Lucide React, Axios.
- **Backend**: Django, Django Rest Framework (DRF).
- **Database**: PostgreSQL (Production-ready).
- **Security**: DRF Token Authentication.

---

## 🚀 Getting Started

### 📋 Prerequisites
- **Node.js** (v18+)
- **Python** (3.10+)
- **PostgreSQL**

### 🏗️ Backend Setup (Django)

1. **Navigate to the backend directory:**
   ```powershell
   cd django_backend
   ```
2. **Setup Virtual Environment:**
   ```powershell
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   ```
3. **Install dependencies:**
   ```powershell
   pip install -r requirements.txt
   ```
4. **Environment Configuration:**
   - Copy `.env.example` to `.env`.
   - Update `DATABASE_URL` with your PostgreSQL credentials.
5. **Initialize Database:**
   ```powershell
   python manage.py migrate
   ```
6. **Start Server:**
   ```powershell
   python manage.py runserver
   ```

### 💻 Frontend Setup (React)

1. **Navigate to the frontend directory:**
   ```powershell
   cd frontend
   ```
2. **Install dependencies:**
   ```powershell
   npm install
   ```
3. **Configure API URL:**
   - Create a `.env` file in the `frontend` directory:
     `REACT_APP_API_URL=http://localhost:8000`
4. **Start Development Server:**
   ```powershell
   npm start
   ```

---

## 📝 Academic Project Disclaimer

QuizTinker was developed as a Final Requirement for the **Web Systems and Technologies 2** course at the **Technological Institute of the Philippines - Manila**. It is intended for academic demonstration purposes.

## 👥 Development Team
- **Ivan Roxas** (Lead Developer)
- **Team Members** (See Footer for full list)

---
© 2026 QuizTinker Project