#!/usr/bin/env bash
# Exit on error
set -o errexit

echo "========================================================"
echo " Starting Multi-Agent Research Lab Build for Render"
echo "========================================================"

# 1. Build Vite React Frontend if Node/npm is present
if command -v npm &> /dev/null; then
    echo "==> Building Frontend with npm..."
    cd frontend
    npm install --no-audit --no-fund
    npm run build
    cd ..
elif [ -d "frontend/dist" ] && [ -f "frontend/dist/index.html" ]; then
    echo "==> Node/npm not detected, but prebuilt frontend/dist found. Using existing build."
else
    echo "==> WARNING: Neither npm nor prebuilt frontend/dist found!"
fi

# 2. Install Python Dependencies
echo "==> Installing Python Backend Requirements..."
python -m pip install --upgrade pip
pip install -r backend/requirements.txt

echo "========================================================"
echo " Build Completed Successfully!"
echo "========================================================"
