import asyncio
import json
import logging
import os
import time
from collections import OrderedDict
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from backend.agents.graph import graph
from backend.agents.mock_graph import run_mock_research

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Multi-Agent Autonomous Research Lab API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory storage for runs with memory cap (max 20 sessions to prevent OOM)
MAX_RUNS_HISTORY = 20
runs = OrderedDict()

def prune_runs():
    """Remove oldest completed/failed runs when memory cap is exceeded."""
    while len(runs) > MAX_RUNS_HISTORY:
        oldest_key, oldest_val = runs.popitem(last=False)
        # Ensure any background task is cancelled
        if oldest_val.get("task") and not oldest_val["task"].done():
            try:
                oldest_val["task"].cancel()
            except Exception:
                pass

class WebSocketProxy:
    def __init__(self, run_id):
        self.run_id = run_id

    async def send_text(self, text):
        run = runs.get(self.run_id)
        if run and run.get("websocket"):
            try:
                await run["websocket"].send_text(text)
            except Exception as e:
                logger.error(f"Failed to send to websocket for run {self.run_id}: {str(e)}")
                run["websocket"] = None

async def run_research_flow(run_id, query, mode, provider, api_key, tavily_key, speed=1.0):
    ws_proxy = WebSocketProxy(run_id)
    queue = runs[run_id]["queue"]
    try:
        if mode == "simulation":
            # Run mock research
            async for state_str in run_mock_research(query, queue, speed=speed):
                state = json.loads(state_str)
                if run_id in runs:
                    runs[run_id]["state"] = state
                await ws_proxy.send_text(state_str)
        else:
            # Real execution using LangGraph
            provider_key_name = "GEMINI_API_KEY" if provider == "gemini" else "OPENAI_API_KEY"
            effective_api_key = api_key or os.getenv(provider_key_name)
            effective_tavily_key = tavily_key or os.getenv("TAVILY_API_KEY")
            
            state = {
                "query": query,
                "research_plan": None,
                "research_results": [],
                "fact_check_results": [],
                "draft_report": None,
                "critic_feedback": None,
                "final_report": None,
                "logs": [],
                "active_agent": "Coordinator",
                "awaiting_review": False
            }
            
            state["logs"].append({
                "agent": "System",
                "status": "planning",
                "message": f"Starting real execution using {provider.upper()}..."
            })
            if run_id in runs:
                runs[run_id]["state"] = state
            await ws_proxy.send_text(json.dumps(state))
            
            config = {
                "configurable": {
                    "provider": provider,
                    "api_key": effective_api_key,
                    "tavily_key": effective_tavily_key,
                    "websocket": ws_proxy,
                    "queue": queue
                }
            }
            
            async for output in graph.astream(state, config=config):
                for node_name, updates in output.items():
                    for key, val in updates.items():
                        if key == "logs":
                            current_len = len(state["logs"])
                            for item in val[current_len:]:
                                state["logs"].append(item)
                        elif val is not None:
                            state[key] = val
                
                if run_id in runs:
                    runs[run_id]["state"] = state
                await ws_proxy.send_text(json.dumps(state))
            
            # Final notification
            state["active_agent"] = "Finalize"
            state["awaiting_review"] = False
            state["logs"].append({
                "agent": "System",
                "status": "completed",
                "message": "Research task finished successfully."
            })
            if run_id in runs:
                runs[run_id]["state"] = state
            await ws_proxy.send_text(json.dumps(state))
    except asyncio.CancelledError:
        logger.info(f"Research task cancelled for run {run_id}.")
        try:
            state = {
                "active_agent": "Error",
                "logs": [{
                    "agent": "System",
                    "status": "error",
                    "message": "Research process aborted by user."
                }]
            }
            if run_id in runs:
                runs[run_id]["state"] = state
            await ws_proxy.send_text(json.dumps(state))
        except Exception:
            pass
    except Exception as ex:
        logger.error(f"Execution error in run {run_id}: {str(ex)}")
        try:
            state = {
                "active_agent": "Error",
                "logs": [{
                    "agent": "System",
                    "status": "error",
                    "message": f"Execution failed: {str(ex)}"
                }]
            }
            if run_id in runs:
                runs[run_id]["state"] = state
            await ws_proxy.send_text(json.dumps(state))
        except Exception:
            pass

@app.get("/health")
def health_check():
    """Healthcheck endpoint for Render / monitoring."""
    return {"status": "ok", "active_runs": len(runs)}

@app.websocket("/ws/research")
async def websocket_research(websocket: WebSocket):
    await websocket.accept()
    logger.info("WebSocket connection established.")
    
    current_run_id = None
    
    try:
        while True:
            data_str = await websocket.receive_text()
            data = json.loads(data_str)
            
            msg_type = data.get("type", "start")
            
            if msg_type == "start":
                run_id = data.get("run_id")
                if not run_id:
                    await websocket.send_text(json.dumps({"error": "run_id is required."}))
                    continue
                
                query = data.get("query", "")
                mode = data.get("mode", "simulation")
                provider = data.get("provider", "gemini")
                api_key = data.get("api_key", "")
                tavily_key = data.get("tavily_key", "")
                speed = data.get("speed", 1.0)
                
                if not query:
                    await websocket.send_text(json.dumps({"error": "Query cannot be empty."}))
                    continue
                    
                provider_key_name = "GEMINI_API_KEY" if provider == "gemini" else "OPENAI_API_KEY"
                effective_api_key = api_key or os.getenv(provider_key_name)
                
                if mode == "real" and not effective_api_key:
                    await websocket.send_text(json.dumps({
                        "error": f"API Key is required for Real Mode. Please provide it in settings or set {provider_key_name} in backend/.env"
                    }))
                    continue
                
                current_run_id = run_id
                
                if run_id in runs:
                    existing_run = runs[run_id]
                    if existing_run.get("task") and not existing_run["task"].done():
                        existing_run["task"].cancel()
                
                queue = asyncio.Queue()
                runs[run_id] = {
                    "state": None,
                    "websocket": websocket,
                    "queue": queue,
                    "task": None,
                    "created_at": time.time()
                }
                prune_runs()
                
                task = asyncio.create_task(
                    run_research_flow(run_id, query, mode, provider, api_key, tavily_key, speed)
                )
                runs[run_id]["task"] = task
                
            elif msg_type == "reconnect":
                run_id = data.get("run_id")
                if not run_id or run_id not in runs:
                    await websocket.send_text(json.dumps({"error": f"Run ID {run_id} not found."}))
                    continue
                
                current_run_id = run_id
                runs[run_id]["websocket"] = websocket
                logger.info(f"Reconnected client to run {run_id}")
                
                if runs[run_id]["state"]:
                    await websocket.send_text(json.dumps(runs[run_id]["state"]))
                
            elif msg_type == "review":
                run_id = data.get("run_id") or current_run_id
                if run_id in runs:
                    await runs[run_id]["queue"].put(data)
                
            elif msg_type == "abort":
                run_id = data.get("run_id") or current_run_id
                if run_id in runs:
                    run = runs[run_id]
                    if run.get("task") and not run["task"].done():
                        run["task"].cancel()
                    
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for run {current_run_id}.")
    except Exception as e:
        logger.error(f"WebSocket error: {str(e)}")
    finally:
        if current_run_id and current_run_id in runs:
            if runs[current_run_id]["websocket"] == websocket:
                runs[current_run_id]["websocket"] = None

# Static frontend mounting for single-service deployment
base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
frontend_dist = os.path.join(base_dir, "frontend", "dist")

if os.path.exists(frontend_dist) and os.path.exists(os.path.join(frontend_dist, "index.html")):
    logger.info(f"Mounting static frontend assets from {frontend_dist}")
    assets_dir = os.path.join(frontend_dist, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # Don't hijack health or ws endpoints
        if full_path in ("health", "ws/research"):
            return JSONResponse(status_code=404, content={"detail": "Not found"})
        file_path = os.path.join(frontend_dist, full_path)
        if full_path and os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(frontend_dist, "index.html"))
else:
    @app.get("/")
    def read_root():
        return {
            "status": "online",
            "message": "Multi-Agent Research Lab API is running. (Frontend dist not mounted)"
        }

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("backend.main:app", host="0.0.0.0", port=port, reload=False, workers=1)
