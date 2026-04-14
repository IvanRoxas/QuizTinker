# QuizTinker — Redeployment Guide (Push New Changes)

> [!NOTE]
> This guide is for **updating** your already-deployed AWS application with new local changes.
> It is **NOT** a fresh deployment guide. For initial setup, see `deployment_guide.md`.

---

## Summary of Changes to Deploy

| Area | File | What Changed |
|------|------|-------------|
| Backend Model | `django_backend/quizzes/models.py` | Added `reference_file_1` and `reference_file_2` fields to the `Quiz` model |
| Backend Serializer | `django_backend/quizzes/serializers.py` | Exposed new reference file fields in the API |
| Backend View | `django_backend/quizzes/views.py` | Updated `ai_generate_quiz` view to persist metadata and file references |
| Backend Migration | `django_backend/quizzes/migrations/0014_...` | New migration for the reference file fields |
| Frontend | `frontend/src/components/CreateQuizModal.js` | AI-generated quiz properties now read-only; reference file display improvements |

> [!IMPORTANT]
> No new Python or Node.js dependencies were added, so `pip install` and `npm install` are **optional** but included for safety.

---

## Step 1: Commit & Push Changes Locally

Run these commands on your **local machine** (your Mac):

```bash
cd ~/Desktop/QuizTinker

# Stage all changes (modified + new files)
git add django_backend/quizzes/models.py \
        django_backend/quizzes/serializers.py \
        django_backend/quizzes/views.py \
        django_backend/quizzes/migrations/0014_quiz_reference_file_1_quiz_reference_file_2.py \
        frontend/src/components/CreateQuizModal.js

# Commit
git commit -m "Add reference file fields to Quiz model and update AI quiz modal UI"

# Push to GitHub
git push origin main
```

> [!TIP]
> If you also want to push the deployment scripts to the repo:
> ```bash
> git add deployment_guide.md redeployment_guide.md setup.sh runall.sh
> git commit -m "Add deployment and redeployment guides"
> git push origin main
> ```

---

## Step 2: SSH into Your EC2 Instance

```bash
ssh -i /path/to/quiztinker-key.pem ubuntu@<YOUR_EC2_PUBLIC_IP>
```

Replace `/path/to/quiztinker-key.pem` with the actual path to your key file, and `<YOUR_EC2_PUBLIC_IP>` with your server's IP.

---

## Step 3: Pull Latest Changes on the Server

```bash
cd /home/ubuntu/QuizTinker
git pull origin main
```

---

## Step 4: Update the Backend

Activate the virtual environment and apply the new database migration:

```bash
cd /home/ubuntu/QuizTinker/django_backend
source venv/bin/activate

# (Optional) Install any new dependencies — safe to run even if nothing changed
pip install -r requirements.txt

# Apply the new migration (adds reference_file_1 & reference_file_2 to quiz table)
python manage.py migrate

# Re-collect static files (in case of admin/DRF changes)
python manage.py collectstatic --noinput
```

> [!WARNING]
> **Never** run `makemigrations` on the production server. Migrations should only be created locally and pushed via git.

---

## Step 5: Rebuild the React Frontend

```bash
cd /home/ubuntu/QuizTinker/frontend

# (Optional) Install any new npm packages — safe to run even if nothing changed
npm install

# Build with the production API URL
REACT_APP_API_URL=http://<YOUR_EC2_PUBLIC_IP> npm run build
```

> [!IMPORTANT]
> Replace `<YOUR_EC2_PUBLIC_IP>` with your actual EC2 public IP address. This tells the React app where to send API requests.

---

## Step 6: Restart All Services

```bash
sudo systemctl restart gunicorn
sudo systemctl restart django-q
sudo systemctl restart nginx
```

---

## Step 7: Verify the Deployment

### Check Service Health
```bash
sudo systemctl status gunicorn   # Should show: active (running)
sudo systemctl status django-q   # Should show: active (running)
sudo systemctl status nginx      # Should show: active (running)
```

### Check for Errors (if something seems wrong)
```bash
# Gunicorn logs
sudo journalctl -u gunicorn --no-pager -n 30

# Django-Q logs
sudo journalctl -u django-q --no-pager -n 30

# Nginx error log
sudo tail -30 /var/log/nginx/error.log
```

### Browser Tests
1. **Health Check**: Visit `http://<YOUR_EC2_PUBLIC_IP>/health/` → should return `{"status": "ok"}`
2. **Frontend**: Visit `http://<YOUR_EC2_PUBLIC_IP>/` → navigate around, test the updated AI quiz creation modal
3. **AI Quiz Generation**: Create a new AI-generated quiz with reference files to verify the new fields work
4. **Admin Portal**: Visit `http://<YOUR_EC2_PUBLIC_IP>/qt-secret-portal/` → confirm Quiz objects now show the reference file fields

---

## Quick Reference — One-Liner for Future Updates

Once you're familiar with the process, here's the condensed version you can run on the **server** after pushing changes from your local machine:

```bash
cd /home/ubuntu/QuizTinker && \
git pull origin main && \
cd django_backend && \
source venv/bin/activate && \
pip install -r requirements.txt && \
python manage.py migrate && \
python manage.py collectstatic --noinput && \
cd ../frontend && \
npm install && \
REACT_APP_API_URL=http://<YOUR_EC2_PUBLIC_IP> npm run build && \
sudo systemctl restart gunicorn && \
sudo systemctl restart django-q && \
sudo systemctl restart nginx && \
echo "✅ Redeployment complete!"
```

---

## Troubleshooting

| Problem | Likely Cause | Fix |
|---------|-------------|-----|
| `502 Bad Gateway` | Gunicorn crashed or isn't running | `sudo journalctl -u gunicorn -n 50` to check logs, then `sudo systemctl restart gunicorn` |
| Frontend shows old version | Browser cache or build not refreshed | Hard refresh (`Cmd+Shift+R`) or rebuild frontend |
| Migration error | Migration conflict or missing dependency | Check `python manage.py showmigrations` and resolve conflicts locally |
| API returns 500 | Check Django logs for traceback | `sudo journalctl -u gunicorn --no-pager -n 50` |
| Static files (CSS) broken on admin | `collectstatic` wasn't run | `python manage.py collectstatic --noinput` then restart Nginx |
| S3 upload fails | IAM credentials or bucket config issue | Verify `.env` has correct `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` |
