import json
import logging
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from backend.agents.graph import graph
from backend.agents.mock_graph import run_mock_research

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

@app.websocket("/ws/research")
async def websocket_research(websocket: WebSocket):
    await websocket.accept()
    logger.info("WebSocket connection established.")
    
    try:
        while True:
            # Receive research trigger message
            data_str = await websocket.receive_text()
            data = json.loads(data_str)
            
            query = data.get("query", "")
            mode = data.get("mode", "simulation")  # 'simulation' or 'real'
            provider = data.get("provider", "gemini")  # 'gemini' or 'openai'
            api_key = data.get("api_key", "")
            tavily_key = data.get("tavily_key", "")
            
            logger.info(f"Triggering research. Query: '{query}', Mode: '{mode}', Provider: '{provider}'")
            
            if not query:
                await websocket.send_text(json.dumps({
                    "error": "Query cannot be empty."
                }))
                continue
            
            if mode == "simulation":
                # Run simulated research steps
                async for state_str in run_mock_research(query):
                    await websocket.send_text(state_str)
            else:
                # Real execution using LangGraph
                if not api_key:
                    await websocket.send_text(json.dumps({
                        "error": "API Key is required for Real Mode execution."
                    }))
                    continue
                
                # Setup initial state
                state = {
                    "query": query,
                    "research_plan": None,
                    "research_results": [],
                    "fact_check_results": [],
                    "draft_report": None,
                    "critic_feedback": None,
                    "final_report": None,
                    "logs": [],
                    "active_agent": "Coordinator"
                }
                
                # Initialize task log
                state["logs"].append({
                    "agent": "System",
                    "status": "planning",
                    "message": f"Starting real execution using {provider.upper()}..."
                })
                await websocket.send_text(json.dumps(state))
                
                config = {
                    "configurable": {
                        "provider": provider,
                        "api_key": api_key,
                        "tavily_key": tavily_key
                    }
                }
                
                try:
                    # Run the LangGraph workflow streaming state updates
                    async for output in graph.astream(state, config=config):
                        # Merge state updates from node execution
                        for node_name, updates in output.items():
                            for key, val in updates.items():
                                # Merge logs list instead of overriding
                                if key == "logs":
                                    # Take items not already in state["logs"]
                                    current_len = len(state["logs"])
                                    for item in val[current_len:]:
                                        state["logs"].append(item)
                                elif val is not None:
                                    state[key] = val
                        
                        await websocket.send_text(json.dumps(state))
                        
                    # Final notification
                    state["active_agent"] = "Finalize"
                    state["logs"].append({
                        "agent": "System",
                        "status": "completed",
                        "message": "Research task finished successfully."
                    })
                    await websocket.send_text(json.dumps(state))
                    
                except Exception as ex:
                    logger.error(f"LangGraph execution error: {str(ex)}")
                    state["logs"].append({
                        "agent": "System",
                        "status": "error",
                        "message": f"Execution failed: {str(ex)}"
                    })
                    state["active_agent"] = "Error"
                    await websocket.send_text(json.dumps(state))
                    
    except WebSocketDisconnect:
        logger.info("WebSocket disconnected.")
    except Exception as e:
        logger.error(f"WebSocket error: {str(e)}")
        try:
            await websocket.close()
        except:
            pass

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
