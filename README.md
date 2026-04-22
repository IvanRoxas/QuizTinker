# QuizTinker

QuizTinker is an AI-integrated quiz platform built for academic use. It features automated LET board exam-ready quiz generation powered by Gemini AI, reference material processing, two-factor authentication (OTP via email), and comprehensive assessment management.

## Key Features

- **AI Quiz Generation** — Generate LET board exam-ready questions using Gemini with Bloom's taxonomy distribution
- **Reference Material Processing** — Upload PDF, DOCX, PPTX, or TXT files for context-aware question generation
- **Two-Factor Authentication** — OTP email verification on login and registration
- **Multi-Language Support** — Automatic language detection (English and Filipino) based on specialization
- **Academic System** — Late penalties, time limits, attempt limits, and category-based organization
- **Auto-Save** — Real-time progress tracking to prevent data loss
- **Session Isolation** — Token Authentication for multiple concurrent sessions
- **Analytics** — Performance reports for students and management tools for instructors
- **AI Chatbot** — Chat with an academic AI assistant to review quiz results and summarize documents

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React.js |
| Backend | Django 5 + Django REST Framework |
| Database | PostgreSQL |
| Authentication | Token-based + OTP (Email) |
| AI | Google Gemini 2.5 Flash (`google-genai`) |
| Task Queue | Django Q2 |
| File Processing | pdfplumber, python-docx, python-pptx |

---

## Prerequisites — Install These First

Before starting, make sure you have all of these installed on your machine.

| Tool | Minimum Version | Download |
|---|---|---|
| Python | 3.10+ | https://python.org |
| Node.js | 18+ | https://nodejs.org |
| PostgreSQL | 14+ | https://postgresql.org |
| Git | any | https://git-scm.com |

### How to verify your installations

Open a terminal (Mac: **Terminal**, Windows: **Command Prompt** or **PowerShell**) and run:

```bash
python --version       # Windows
python3 --version      # Mac/Linux

node --version
psql --version
git --version
```

> **Windows tip:** If `python` is not found, open the Microsoft Store and install Python from there, or re-run the installer and check **"Add Python to PATH"**.

> **Mac tip:** If `psql` is not found after installing PostgreSQL, install it via Homebrew: `brew install postgresql@16`

---

## Step 1 — Clone the Repository

Open a terminal and run:

```bash
git clone https://github.com/IvanRoxas/QuizTinker.git
cd QuizTinker/QuizTinker
```

---

## Step 2 — Set Up PostgreSQL Database

### Mac / Linux

Open a terminal and run:

```bash
psql -U postgres
```

If that doesn't work, try:

```bash
psql postgres
```

### Windows

Search for **SQL Shell (psql)** in the Start Menu and open it. Press Enter to accept all the default prompts until it asks for a password, then enter the password you set during PostgreSQL installation.

---

### Create the database and user

Once you are inside the `psql` shell, run these commands one by one:

```sql
CREATE DATABASE quiztinker;
CREATE USER daniel WITH PASSWORD 'password123';
GRANT ALL PRIVILEGES ON DATABASE quiztinker TO daniel;
\q
```

> You can use any username and password you like — just make sure to use the same values in your `.env` file in Step 4.

---

## Step 3 — Backend Setup (Django)

Navigate to the Django backend folder:

```bash
cd django_backend
```

### Step 3a — Create a virtual environment

**Mac / Linux:**
```bash
python3 -m venv venv
source venv/bin/activate
```

**Windows (Command Prompt):**
```bash
python -m venv venv
venv\Scripts\activate
```

**Windows (PowerShell):**
```bash
python -m venv venv
.\venv\Scripts\Activate.ps1
```

> If PowerShell blocks the script with an error about execution policy, run this first:
> ```bash
> Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
> ```
> Then try activating again.

You should see `(venv)` at the start of your terminal prompt once activated.

---

### Step 3b — Install Python dependencies

```bash
pip install -r requirements.txt
```

> If you get a `psycopg2` error, install the binary version instead:
> ```bash
> pip install psycopg2-binary
> ```

---

### Step 3c — Create the `.env` file

Create a file called `.env` inside the `django_backend` folder — this is the same folder that contains `manage.py`.

**Mac / Linux** — create it from the terminal:
```bash
touch .env
```

**Windows** — create it from the terminal:
```bash
type nul > .env
```

Or just create a new file called `.env` using Notepad or VS Code (make sure it does not save as `.env.txt`).

---

Paste the following into your `.env` file and fill in your own values:

```bash
# django_backend/.env

SECRET_KEY=any-long-random-string-you-make-up
DEBUG=True
DATABASE_URL=postgres://user:password@localhost:5432/quiztinker
FRONTEND_URL=http://localhost:3000
BACKEND_URL=http://localhost:8000

# Get this from https://aistudio.google.com/
GEMINI_API_KEY=your-gemini-api-key
GROQ_API_KEY=your-groq-api-key
OPENROUTER_API_KEY=your-openrouter-api-key

# Use a Gmail account with an App Password
EMAIL_HOST_USER=youremail@gmail.com
EMAIL_HOST_PASSWORD=your-16-character-app-password

#Use AWS Credentials
AWS_STORAGE_BUCKET_NAME=aws-bucket-name
AWS_S3_REGION_NAME=ap-southeast-2
AWS_ACCESS_KEY_ID=aws-access-key
AWS_SECRET_ACCESS_KEY=aws-secret-access
```

#### Getting each value

**SECRET_KEY** — Just type a long random string, for example: `my-super-secret-key-qt-2026-abc123xyz789`. Do not share this with anyone.

**DATABASE_URL** — Replace `daniel` and `password123` with whatever username and password you created in Step 2.

**GEMINI_API_KEY:**
1. Go to [https://aistudio.google.com/](https://aistudio.google.com/)
2. Click **Get API key** → **Create API key**
3. Copy it and paste it here. It is free to use.

**EMAIL_HOST_USER and EMAIL_HOST_PASSWORD (Gmail App Password):**

Gmail requires an *App Password* — your normal Gmail password will not work here.

1. Go to your Google Account → **Security**
2. Make sure **2-Step Verification** is turned on (required)
3. Search for **App Passwords** in the search bar at the top
4. Click **Create** → name it `QuizTinker` → click **Create**
5. Copy the 16-character code (no spaces) and paste it into `EMAIL_HOST_PASSWORD`

---

### Step 3d — Run database migrations

```bash
python manage.py migrate
```

You should see a list of migration names with `OK` next to each one.

---

### Step 3e — Create a superuser (optional but recommended)

This gives you access to the Django admin panel at `/admin`.

```bash
python manage.py createsuperuser
```

Follow the prompts to set a username, email, and password.

---

### Step 3f — Start the Django server

```bash
python manage.py runserver
```

The backend is now running at **http://localhost:8000**.

Leave this terminal open and running.

---

### Step 3g — Start the background worker (required)

Open a **second terminal window**, navigate back to `django_backend`, and activate the virtual environment again:

**Mac / Linux:**
```bash
cd QuizTinker/QuizTinker/django_backend
source venv/bin/activate
python manage.py qcluster
```

**Windows (Command Prompt):**
```bash
cd QuizTinker\QuizTinker\django_backend
venv\Scripts\activate
python manage.py qcluster
```

**Windows (PowerShell):**
```bash
cd QuizTinker\QuizTinker\django_backend
.\venv\Scripts\Activate.ps1
python manage.py qcluster
```

> This worker must stay running alongside the Django server. It handles OTP emails and AI quiz generation. Without it, emails will not send and AI generation will not work.

Leave this second terminal open and running.

---

## Step 4 — Frontend Setup (React)

Open a **third terminal window** and navigate to the frontend folder:

**Mac / Linux:**
```bash
cd QuizTinker/QuizTinker/frontend
```

**Windows:**
```bash
cd QuizTinker\QuizTinker\frontend
```

### Step 4a — Install Node dependencies

```bash
npm install
```

This may take a minute or two.

### Step 4b — Start the React development server

```bash
npm start
```

The frontend will open automatically at **http://localhost:3000**.

---

## Step 5 — You're Done!

You should now have three terminals running:

| Terminal | Command | URL |
|---|---|---|
| 1 | `python manage.py runserver` | http://localhost:8000 |
| 2 | `python manage.py qcluster` | (no URL — background worker) |
| 3 | `npm start` | http://localhost:3000 |

**Checklist before testing:**
- [ ] PostgreSQL is running
- [ ] `python manage.py runserver` is running (Terminal 1)
- [ ] `python manage.py qcluster` is running (Terminal 2)
- [ ] `npm start` is running (Terminal 3)
- [ ] `.env` file is created and filled in correctly

Open your browser and go to **http://localhost:3000** to use the app.

---

## Common Issues and Fixes

### `psycopg2` error during pip install

```bash
pip install psycopg2-binary
```

---

### Database connection refused

PostgreSQL is not running. Start it first:

**Mac (Homebrew):**
```bash
brew services start postgresql
```

**Mac (Postgres.app):** Open the Postgres.app from your Applications folder and click Start.

**Windows:** Open the **Services** app (search for it in the Start Menu) → find **PostgreSQL** → right-click → **Start**.

---

### `python: command not found` on Mac/Linux

Use `python3` instead of `python` everywhere in this guide.

---

### OTP emails not arriving

- Make sure `qcluster` is running in a second terminal
- Double-check `EMAIL_HOST_USER` and `EMAIL_HOST_PASSWORD` in `.env`
- Make sure you are using an **App Password**, not your regular Gmail password
- Check your spam or junk folder

---

### PowerShell says "running scripts is disabled"

```bash
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

Then activate the virtual environment again.

---

### `npm install` fails

Check your Node.js version — it must be v18 or higher:

```bash
node --version
```

If it is lower than 18, download the latest LTS version from https://nodejs.org.

---

### Port 8000 or 3000 already in use

**Mac / Linux:**
```bash
lsof -i :8000
kill -9 <PID>
```

**Windows (Command Prompt):**
```bash
netstat -ano | findstr :8000
taskkill /PID <PID> /F
```

Replace `8000` with `3000` if the frontend port is the one that's busy.

---

### `django_backend/.env` file saves as `.env.txt` on Windows

In Notepad, when saving, set **Save as type** to **All Files (*.*)** and name the file `.env`. This prevents Windows from adding a `.txt` extension.

---

## Project Structure

```
QuizTinker/
├── django_backend/        # Python / Django backend
│   ├── accounts/          # Auth, OTP, user profiles, friendships
│   ├── quizzes/           # Quiz management and AI generation
│   ├── chatbot/           # AI chatbot feature
│   ├── quiztinker/        # Django settings and URL config
│   ├── requirements.txt   # Python dependencies
│   └── .env               # ← YOU CREATE THIS (see Step 3c)
│
└── frontend/              # React frontend
    ├── src/
    │   ├── pages/         # Auth, Dashboard, Quizzes, Profile, Chat
    │   ├── components/    # Shared components
    │   ├── context/       # Auth context
    │   └── api/           # Axios API calls
    └── package.json
```

---

## AI Features

### Bloom's Taxonomy Distribution

Questions are distributed across cognitive levels:

| Level | Percentage |
|---|---|
| Remember | 15% |
| Understand | 20% |
| Apply | 25% |
| Analyze | 20% |
| Evaluate | 10% |
| Create | 10% |

### Supported Specializations

GenEd, ProfEd, Filipino, English, Mathematics, Science, Social Studies, MAPEH, TLE, Values Education, Rizal

---

## Academic Project Disclaimer

QuizTinker was developed as a Final Requirement for the Web Systems and Technologies 2 course at the Technological Institute of the Philippines - Manila. It is intended for academic demonstration purposes.

## Development Team

- **Ivan Roxas** — Lead Developer
- **Daniel Espela** — AI and Deployment Specialist

---

© 2026 QuizTinker Project
