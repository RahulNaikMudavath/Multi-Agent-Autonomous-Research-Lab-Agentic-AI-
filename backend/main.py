import json
import logging
import os
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from backend.agents.graph import graph
from backend.agents.mock_graph import run_mock_research

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Multi-Agent Autonomous Research Lab API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For dev simplicity, allow all. In production, restrict this.
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"status": "online", "message": "Multi-Agent Research Lab API is running."}

import asyncio

@app.websocket("/ws/research")
async def websocket_research(websocket: WebSocket):
    await websocket.accept()
    logger.info("WebSocket connection established.")
    
    queue = asyncio.Queue()
    research_task = None
    
    async def run_research_flow(query, mode, provider, api_key, tavily_key):
        nonlocal websocket, queue
        try:
            if mode == "simulation":
                # Run mock research
                async for state_str in run_mock_research(query, queue):
                    await websocket.send_text(state_str)
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
                await websocket.send_text(json.dumps(state))
                
                config = {
                    "configurable": {
                        "provider": provider,
                        "api_key": effective_api_key,
                        "tavily_key": effective_tavily_key,
                        "websocket": websocket,
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
                    
                    await websocket.send_text(json.dumps(state))
                
                # Final notification
                state["active_agent"] = "Finalize"
                state["awaiting_review"] = False
                state["logs"].append({
                    "agent": "System",
                    "status": "completed",
                    "message": "Research task finished successfully."
                })
                await websocket.send_text(json.dumps(state))
        except asyncio.CancelledError:
            logger.info("Research task cancelled.")
            # Send abort state
            try:
                await websocket.send_text(json.dumps({
                    "active_agent": "Error",
                    "logs": [{
                        "agent": "System",
                        "status": "error",
                        "message": "Research process aborted by user."
                    }]
                }))
            except:
                pass
        except Exception as ex:
            logger.error(f"Execution error: {str(ex)}")
            try:
                await websocket.send_text(json.dumps({
                    "active_agent": "Error",
                    "logs": [{
                        "agent": "System",
                        "status": "error",
                        "message": f"Execution failed: {str(ex)}"
                    }]
                }))
            except:
                pass

    try:
        while True:
            data_str = await websocket.receive_text()
            data = json.loads(data_str)
            
            msg_type = data.get("type", "start")
            
            if msg_type == "start":
                # Cancel existing task if running
                if research_task and not research_task.done():
                    research_task.cancel()
                    
                # Reset queue
                queue = asyncio.Queue()
                
                query = data.get("query", "")
                mode = data.get("mode", "simulation")
                provider = data.get("provider", "gemini")
                api_key = data.get("api_key", "")
                tavily_key = data.get("tavily_key", "")
                
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
                
                research_task = asyncio.create_task(
                    run_research_flow(query, mode, provider, api_key, tavily_key)
                )
                
            elif msg_type == "review":
                # Push user review feedback to the queue
                await queue.put(data)
                
            elif msg_type == "abort":
                if research_task and not research_task.done():
                    research_task.cancel()
                    
    except WebSocketDisconnect:
        logger.info("WebSocket disconnected.")
    except Exception as e:
        logger.error(f"WebSocket error: {str(e)}")
    finally:
        if research_task and not research_task.done():
            research_task.cancel()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
