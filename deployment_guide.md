# QuizTinker AWS Deployment Guide

## 1. Audit Results & Code Fixes

> [!NOTE]
> We audited the codebase and identified a few things that were fixed before you start the deployment.

1. **Django-Q Memory Issue**: By default, `Q_CLUSTER['workers']` was hardcoded to 4 in `settings.py`. We updated it to use `env.int('Q_WORKERS', default=2)` so it can be dynamically adjusted for small instances (e.g., t3.micro) to prevent memory exhaustion.
2. **Hardcoded Localhost**: Fixed a minor issue in `NotificationsPage.js` where `new URL(url, 'http://localhost')` was used. We changed it to `new URL(url, window.location.origin)`.
3. **psycopg2 & Gunicorn**: Both are already present in `requirements.txt`.
4. **Admin URL**: Identified as parsed securely from `ADMIN_URL` environment variable (default: `qt-secret-portal/`).

---

## 2. AWS Setup

**1. Create a Key Pair**
- Go to EC2 > Key Pairs. Create a new RSA `.pem` key pair named `quiztinker-key`.

**2. Create a new EC2 Instance**
- **Name**: QuizTinker-Server
- **AMI**: Ubuntu 24.04 LTS
- **Instance Type**: `t3.micro` (or `t3.small` if you want a bit more breathing room).
- **Network**: Set Auto-Assign Public IP to Enabled.
- **Key Pair**: Select `quiztinker-key`.
- **Storage**: Allocate at least 15 GB of gp3 storage.
- **Security Group (EC2-SG)**:
  - SSH (TCP 22) from My IP
  - HTTP (TCP 80) from Anywhere
  - HTTPS (TCP 443) from Anywhere

**3. Create a new RDS PostgreSQL Database**
- **Engine**: PostgreSQL
- **Instance Type**: `db.t3.micro` or `db.t4g.micro`
- **Authentication**: Set a Master username (`postgres`) and Master password.
- **Connectivity**: Select the same VPC as your EC2 instance. Set "Public Access" to **No**.
- **Security Group (RDS-SG)**:
  - Create a new security group.
  - Set an Inbound Rule: PostgreSQL (TCP 5432) -> Source: Security Group ID of your EC2 instance (`EC2-SG`).

**4. Create and Configure the S3 Bucket**
- **Bucket Name**: `quiztinker-media-bucket` (must be unique).
- **Public Access**: Uncheck "Block all public access".
- **Bucket Policy**: Go to Permissions -> Bucket Policy and paste:
  ```json
  {
      "Version": "2012-10-17",
      "Statement": [
          {
              "Sid": "PublicReadGetObject",
              "Effect": "Allow",
              "Principal": "*",
              "Action": "s3:GetObject",
              "Resource": "arn:aws:s3:::quiztinker-media-bucket/*"
          }
      ]
  }
  ```
- **CORS Configuration**: Go to Permissions -> Cross-origin resource sharing (CORS) and paste:
  ```json
  [
      {
          "AllowedHeaders": ["*"],
          "AllowedMethods": ["GET", "HEAD"],
          "AllowedOrigins": ["*"],
          "ExposeHeaders": [],
          "MaxAgeSeconds": 3000
      }
  ]
  ```

---

## 3. Server Setup (Manual or Automated)

You can either run the steps below manually or use the `setup.sh` script to automate everything. 
To use the script, just upload it to the server and execute:
```bash
bash setup.sh
```
If you'd prefer to do things manually, continue below!

SSH into your EC2 instance:
```bash
ssh -i /path/to/quiztinker-key.pem ubuntu@<YOUR_EC2_PUBLIC_IP>
```

### Add Swap Space (Crucial for t3.micro to prevent OOM kills)
> [!IMPORTANT]
> The previous setup crashed because the RAM filled up and there was no swap space. We're creating a 2GB swap file.

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### Install Dependencies
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y python3 python3-venv python3-pip python3-dev libpq-dev postgresql-client nginx curl git

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### Clone Repo & Setup Virtual Environment
```bash
git clone <YOUR_REPO_URL> /home/ubuntu/QuizTinker
cd /home/ubuntu/QuizTinker/django_backend

python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### Configure the Environment
> [!IMPORTANT] 
> You MUST generate a cryptographically secure string for `SECRET_KEY`. Before editing the `.env` file, run this to get your random key:
> ```bash
> python3 -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
> ```

Create the `.env` file in `/home/ubuntu/QuizTinker/django_backend`:
```bash
nano .env
```
Paste the following, modifying the values to match the RDS, S3, and API configurations:
> [!WARNING]
> ALLOWED_HOSTS MUST contain `127.0.0.1` and your EC2 Public IP or Domain.

```env
# SECURITY
SECRET_KEY=<paste_randomly_generated_string_here>
DEBUG=False
ALLOWED_HOSTS=127.0.0.1,localhost,<YOUR_EC2_PUBLIC_IP>,<YOUR_DOMAIN>

# DATABASE (RDS)
DATABASE_URL=postgres://postgres:<DB_PASSWORD>@<RDS_ENDPOINT>:5432/postgres

# WORKERS
Q_WORKERS=1

# AWS S3 (Media)
AWS_STORAGE_BUCKET_NAME=quiztinker-media-bucket
AWS_S3_REGION_NAME=ap-southeast-2
AWS_ACCESS_KEY_ID=<YOUR_IAM_ACCESS_KEY>
AWS_SECRET_ACCESS_KEY=<YOUR_IAM_SECRET_KEY>

# EMAIL & GEMINI
EMAIL_HOST_USER=<YOUR_EMAIL_HOST_USER>
EMAIL_HOST_PASSWORD=<YOUR_APP_PASSWORD>
GEMINI_API_KEY=<YOUR_GEMINI_API_KEY>

# URLS
ADMIN_URL=qt-secret-portal/
FRONTEND_URL=http://<YOUR_EC2_PUBLIC_IP>
BACKEND_URL=http://127.0.0.1:8000
```

### Apply Migrations and Build Services

> [!WARNING]
> We **never** run `makemigrations` on a production server. Migrations should only run on your local machine and pushed to git.

```bash
python manage.py migrate
python manage.py createcachetable
python manage.py createsuperuser  # Follow prompts
python manage.py collectstatic --noinput
```

### Build the React Frontend
> [!IMPORTANT]
> The missing `REACT_APP_API_URL` caused previous API requests to go to localhost. We must provide this at build time!

```bash
cd /home/ubuntu/QuizTinker/frontend
npm install

# Build the frontend with the explicit public URL for the backend API
REACT_APP_API_URL=http://<YOUR_EC2_PUBLIC_IP> npm run build
```

---

## 4. Services Configuration (Gunicorn & Django-Q)

### Gunicorn Configuration
Create a systemd socket:
```bash
sudo nano /etc/systemd/system/gunicorn.socket
```
```ini
[Unit]
Description=gunicorn socket

[Socket]
ListenStream=/run/gunicorn.sock

[Install]
WantedBy=sockets.target
```

Create the Gunicorn service:
> [!TIP]
> Notice the worker count is set to `-w 2` instead of relying on default calculations. This prevents OOM errors on `t3.micro`.

```bash
sudo nano /etc/systemd/system/gunicorn.service
```
```ini
[Unit]
Description=gunicorn daemon
Requires=gunicorn.socket
After=network.target

[Service]
User=ubuntu
Group=www-data
WorkingDirectory=/home/ubuntu/QuizTinker/django_backend
ExecStart=/home/ubuntu/QuizTinker/django_backend/venv/bin/gunicorn \
          --access-logfile - \
          --workers 2 \
          --bind unix:/run/gunicorn.sock \
          quiztinker.wsgi:application

[Install]
WantedBy=multi-user.target
```

### Django-Q Worker Service
```bash
sudo nano /etc/systemd/system/django-q.service
```
```ini
[Unit]
Description=Django-Q Worker
After=network.target gunicorn.service

[Service]
User=ubuntu
Group=www-data
WorkingDirectory=/home/ubuntu/QuizTinker/django_backend
ExecStart=/home/ubuntu/QuizTinker/django_backend/venv/bin/python manage.py qcluster
Restart=always

[Install]
WantedBy=multi-user.target
```

Start the services:
```bash
sudo systemctl start gunicorn.socket
sudo systemctl enable gunicorn.socket
sudo systemctl start gunicorn
sudo systemctl enable gunicorn
sudo systemctl start django-q
sudo systemctl enable django-q
```

---

## 5. Nginx Configuration

> [!WARNING]
> This config properly routes React, Django Admin static routing, Media files mapping, and proxying for the APIs/Admin routing.

```bash
sudo nano /etc/nginx/sites-available/quiztinker
```
```nginx
server {
    listen 80;
    server_name <YOUR_EC2_PUBLIC_IP> <YOUR_DOMAIN>;

    root /home/ubuntu/QuizTinker/frontend/build;
    index index.html index.htm;

    # Serve React Frontend
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy API endpoints to Gunicorn
    location /api/ {
        include proxy_params;
        proxy_pass http://unix:/run/gunicorn.sock;
    }

    # Proxy Admin Portal endpoints to Gunicorn (Replace with your ADMIN_URL if changed)
    location /qt-secret-portal/ {
        include proxy_params;
        proxy_pass http://unix:/run/gunicorn.sock;
    }

    # Proxy Health Check
    location /health/ {
        include proxy_params;
        proxy_pass http://unix:/run/gunicorn.sock;
    }

    # Serve Django Admin Static Files 
    location /static/admin/ {
        alias /home/ubuntu/QuizTinker/django_backend/staticfiles/admin/;
    }

    location /static/rest_framework/ {
        alias /home/ubuntu/QuizTinker/django_backend/staticfiles/rest_framework/;
    }

    # Provide local media serving fallback (If not fully using S3)
    location /media/ {
        alias /home/ubuntu/QuizTinker/django_backend/media/;
    }
}
```

Enable Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/quiztinker /etc/nginx/sites-enabled
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
```

---

## 6. Final Verification Steps

Run these commands on the server to check service health:
```bash
sudo systemctl status gunicorn       # Must show active (running)
sudo systemctl status django-q       # Must show active (running)
sudo systemctl status nginx          # Must show active (running)
```

**Browser Tests:**
1. **Health Check**: Open `http://<YOUR_EC2_PUBLIC_IP>/health/`. Should render `{"status": "ok"}`.
2. **Admin Portal**: Open `http://<YOUR_EC2_PUBLIC_IP>/qt-secret-portal/`. The styling (CSS) should load properly. Try logging in with the superuser command configured earlier.
3. **Frontend Application**: Open `http://<YOUR_EC2_PUBLIC_IP>/`. Ensure you can navigate and that API endpoints work (e.g., attempt to register/login).
4. **Media (S3/CORS)**: Try uploading a media asset via functionality inside the portal. Validate that S3 returns the image through a bucket URL, and it is cleanly viewable on the frontend without blocked `CORS` issues.
