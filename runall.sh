#!/bin/bash

echo "Starting Django backend..."

# Activate virtual environment
source venv/bin/activate

# Run Django server
python manage.py runserver &
DJANGO_PID=$!

# Run qcluster (django-q)
python manage.py qcluster &
QCLUSTER_PID=$!

echo "Starting React frontend..."

# Go to frontend folder
cd frontend

# Start React app
npm start &
FRONTEND_PID=$!

echo "All services started!"

# Wait (keeps script alive)
wait $DJANGO_PID $QCLUSTER_PID $FRONTEND_PID