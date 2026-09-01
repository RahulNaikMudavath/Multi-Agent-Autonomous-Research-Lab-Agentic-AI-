# 🚀 Deploying to Render (Zero-OOM Optimized)

This guide walks you through deploying the **Multi-Agent Autonomous Research Lab** to [Render](https://render.com) with complete memory safety and zero Out-Of-Memory (OOM) errors.

---

## ⚡ Why This Setup Won't Hit OOM Errors

1. **Ultra-Lightweight Async Web Scraper**: Playwright/Chromium (~450MB RAM) has been replaced with an asynchronous `httpx` + `BeautifulSoup4` search engine (~15MB RAM).
2. **Unified Single Service**: FastAPI hosts both the WebSocket API and the pre-built Vite React application directly from memory, using only ~80MB–90MB total RAM (safe inside Render's 512MB Free Tier limit).
3. **Session Cache Capping**: In-memory run history is strictly bounded to the 20 most recent sessions with automatic pruning.
4. **Glibc Arena Memory Tuning**: Uses `MALLOC_ARENA_MAX=2` and `PYTHONUNBUFFERED=1` to eliminate Linux heap fragmentation.
5. **Single Worker Concurrency**: Uvicorn runs on a dedicated async event loop (`--workers 1`), avoiding duplicate multi-process memory overhead.

---

## Option 1: 1-Click Blueprint Deployment (Recommended)

Render can automatically read the included [`render.yaml`](file:///render.yaml) file:

1. Push your repository to GitHub / GitLab.
2. Log in to the [Render Dashboard](https://dashboard.render.com/).
3. Click **New +** in the top right and select **Blueprint**.
4. Connect your GitHub repository.
5. Render will automatically detect `render.yaml` and configure:
   - **Build Command:** `bash build.sh`
   - **Start Command:** `uvicorn backend.main:app --host 0.0.0.0 --port $PORT --workers 1`
   - **Health Check Path:** `/health`
   - **Environment Variables:**
     - `PYTHON_VERSION`: `3.11.9`
     - `PYTHONUNBUFFERED`: `1`
     - `PYTHONDONTWRITEBYTECODE`: `1`
     - `MALLOC_ARENA_MAX`: `2`
6. Under **Environment Variables**, optionally provide:
   - `GEMINI_API_KEY`: *(Optional - your Google Gemini API key)*
   - `OPENAI_API_KEY`: *(Optional - your OpenAI API key)*
   - `TAVILY_API_KEY`: *(Optional - your Tavily Search API key)*
   *(Note: Keys can also be entered directly by the user in the UI settings!)*
7. Click **Apply**. Render will build the frontend, install backend requirements, and launch your service!

---

## Option 2: Manual Web Service Deployment

If you prefer to configure the Web Service manually:

1. In Render Dashboard, click **New +** -> **Web Service**.
2. Select your repository.
3. Configure the following settings:
   - **Name**: `multi-agent-research-lab` (or your choice)
   - **Runtime**: `Python 3`
   - **Region**: Oregon (or nearest to you)
   - **Branch**: `main`
   - **Build Command**:
     ```bash
     bash build.sh
     ```
   - **Start Command**:
     ```bash
     uvicorn backend.main:app --host 0.0.0.0 --port $PORT --workers 1
     ```
   - **Instance Type**: `Free` (512 MB RAM) or `Starter`
4. Under **Advanced** -> **Health Check Path**, enter:
   ```text
   /health
   ```
5. Under **Environment Variables**, add:
   - `PYTHON_VERSION` = `3.11.9`
   - `PYTHONUNBUFFERED` = `1`
   - `PYTHONDONTWRITEBYTECODE` = `1`
   - `MALLOC_ARENA_MAX` = `2`
   - *(Optional)* `GEMINI_API_KEY` = `your-gemini-key`
   - *(Optional)* `OPENAI_API_KEY` = `your-openai-key`
   - *(Optional)* `TAVILY_API_KEY` = `your-tavily-key`
6. Click **Create Web Service**.

---

## Option 3: Docker Container Deployment

If you prefer deploying via Docker on Render:

1. In Render Dashboard, click **New +** -> **Web Service**.
2. Select your repository.
3. Set **Runtime** to `Docker`.
4. Render will automatically build using the multi-stage [`Dockerfile`](file:///Dockerfile).
5. Set Health Check Path to `/health`.
6. Click **Create Web Service**.

---

## 🔍 How WebSocket & Static Routing Works in Production

When hosted on Render:
- The frontend automatically detects the `https://` domain and opens a secure WebSocket connection to `wss://<your-service>.onrender.com/ws/research`.
- No environment variables are needed on the frontend for WebSocket routing.
- The FastAPI backend serves the React single-page application and API endpoints from a single URL.
