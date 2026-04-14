#!/bin/bash
set -e

echo "======================================"
echo "    QuizTinker Automated Setup Script"
echo "======================================"

# 1. Ask for variables
read -p "Enter your EC2 Public IP or Domain: " EC2_IP
read -p "Enter the Git Repo URL to clone (e.g. https://github.com/user/repo.git): " REPO_URL
read -p "Enter the Git Branch to clone [default: main]: " TARGET_BRANCH
TARGET_BRANCH=${TARGET_BRANCH:-main}

read -p "Enter your RDS Endpoint (e.g. db.abc.ap-southeast-2.rds.amazonaws.com): " RDS_ENDPOINT
read -s -p "Enter your DB Password: " DB_PASSWORD
echo ""
read -p "Enter your IAM Access Key for S3: " AWS_ACCESS_KEY
read -s -p "Enter your IAM Secret Key for S3: " AWS_SECRET_KEY
echo ""
read -p "Enter your Email Host User (e.g. danielespela251@gmail.com): " EMAIL_HOST_USER
read -s -p "Enter your Email App Password: " EMAIL_HOST_PASSWORD
echo ""
read -s -p "Enter your Gemini API Key: " GEMINI_API_KEY
echo ""
read -s -p "Enter your Groq API Key (Optional, press Enter to skip): " GROQ_API_KEY
echo ""
read -s -p "Enter your OpenRouter API Key (Optional, press Enter to skip): " OPENROUTER_API_KEY
echo ""

# 2. Add Swap Space (2GB)
echo "[1/8] Setting up 2GB swap space..."
if [ ! -f /swapfile ]; then
    sudo fallocate -l 2G /swapfile
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
    echo "Swap space successfully created."
else
    echo "Swap space already configured."
fi

# 3. Install Dependencies
echo "[2/8] Installing system dependencies..."
sudo apt update && sudo apt upgrade -y
sudo DEBIAN_FRONTEND=noninteractive apt install -y python3 python3-venv python3-pip python3-dev libpq-dev postgresql-client nginx curl git

echo "Installing Node.js..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo DEBIAN_FRONTEND=noninteractive apt install -y nodejs

# 4. Clone / Setup App Directory
echo "[3/8] Setting up the application directory..."
if [ ! -d "/home/ubuntu/QuizTinker" ]; then
    git clone -b $TARGET_BRANCH $REPO_URL /home/ubuntu/QuizTinker
else
    echo "/home/ubuntu/QuizTinker already exists. Skipping clone..."
fi

# 5. Python Environment and .env
echo "[4/8] Setting up Python virtual environment and .env..."
cd /home/ubuntu/QuizTinker/django_backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

echo "Generating generic secret key..."
SECRET_KEY=$(python3 -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())")

cat <<EOF > .env
# SECURITY
SECRET_KEY=$SECRET_KEY
DEBUG=False
ALLOWED_HOSTS=127.0.0.1,localhost,$EC2_IP

# DATABASE (RDS)
DATABASE_URL=postgres://postgres:$DB_PASSWORD@$RDS_ENDPOINT:5432/postgres

# WORKERS
Q_WORKERS=1

# AWS S3 (Media)
AWS_STORAGE_BUCKET_NAME=quiztinker-media-bucket
AWS_S3_REGION_NAME=ap-southeast-2
AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY
AWS_SECRET_ACCESS_KEY=$AWS_SECRET_KEY

# EMAIL & AI PROVIDERS
EMAIL_HOST_USER=$EMAIL_HOST_USER
EMAIL_HOST_PASSWORD=$EMAIL_HOST_PASSWORD
GEMINI_API_KEY=$GEMINI_API_KEY
GROQ_API_KEY=$GROQ_API_KEY
OPENROUTER_API_KEY=$OPENROUTER_API_KEY

# URLS
ADMIN_URL=qt-secret-portal/
FRONTEND_URL=http://$EC2_IP
BACKEND_URL=http://127.0.0.1:8000
EOF

# 6. Migrations and Build
echo "[5/8] Running Django migrations..."
python manage.py migrate
python manage.py createcachetable
python manage.py collectstatic --noinput

echo "Building React app..."
cd /home/ubuntu/QuizTinker/frontend
npm install
REACT_APP_API_URL=http://$EC2_IP npm run build

# 7. Systemd Services
echo "[6/8] Configuring Systemd services (Gunicorn & Django-Q)..."

sudo bash -c 'cat <<EOF > /etc/systemd/system/gunicorn.socket
[Unit]
Description=gunicorn socket

[Socket]
ListenStream=/run/gunicorn.sock

[Install]
WantedBy=sockets.target
EOF'

sudo bash -c 'cat <<EOF > /etc/systemd/system/gunicorn.service
[Unit]
Description=gunicorn daemon
Requires=gunicorn.socket
After=network.target

[Service]
User=ubuntu
Group=www-data
WorkingDirectory=/home/ubuntu/QuizTinker/django_backend
ExecStart=/home/ubuntu/QuizTinker/django_backend/venv/bin/gunicorn \\
          --access-logfile - \\
          --workers 2 \\
          --bind unix:/run/gunicorn.sock \\
          quiztinker.wsgi:application

[Install]
WantedBy=multi-user.target
EOF'

sudo bash -c 'cat <<EOF > /etc/systemd/system/django-q.service
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
EOF'

sudo systemctl daemon-reload
sudo systemctl start gunicorn.socket
sudo systemctl enable gunicorn.socket
sudo systemctl restart gunicorn
sudo systemctl enable gunicorn
sudo systemctl restart django-q
sudo systemctl enable django-q

# 8. Nginx Config
echo "[7/8] Configuring Nginx..."
sudo bash -c "cat <<'EOF' > /etc/nginx/sites-available/quiztinker
server {
    listen 80;
    server_name $EC2_IP;

    root /home/ubuntu/QuizTinker/frontend/build;
    index index.html index.htm;

    # Serve React Frontend
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Proxy API endpoints to Gunicorn
    location /api/ {
        include proxy_params;
        proxy_pass http://unix:/run/gunicorn.sock;
    }

    # Proxy Admin Portal endpoints to Gunicorn
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

    # Provide local media serving fallback
    location /media/ {
        alias /home/ubuntu/QuizTinker/django_backend/media/;
    }
}
EOF"

sudo ln -sf /etc/nginx/sites-available/quiztinker /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx

echo "======================================"
echo "[8/8] Setup Complete!"
echo "Your app should now be running at http://$EC2_IP"
echo ""
echo "Don't forget to create a superuser for the admin portal:"
echo "cd /home/ubuntu/QuizTinker/django_backend"
echo "source venv/bin/activate"
echo "python manage.py createsuperuser"
echo "======================================"
