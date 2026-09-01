#!/usr/bin/env bash
# Exit on error
set -o errexit

echo "========================================================"
echo " Starting Multi-Agent Research Lab Build for Render"
echo "========================================================"

# 1. Build Vite React Frontend
echo "==> Building Frontend..."
cd frontend
npm install --no-audit --no-fund
npm run build
cd ..

# 2. Install Python Dependencies
echo "==> Installing Python Backend Requirements..."
python -m pip install --upgrade pip
pip install -r backend/requirements.txt

echo "========================================================"
echo " Build Completed Successfully!"
echo "========================================================"
