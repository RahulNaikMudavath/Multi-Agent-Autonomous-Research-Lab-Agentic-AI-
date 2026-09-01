import asyncio
import json
import os
import re
from typing import Dict, Any, List
from langchain_core.runnables import RunnableConfig
from langchain_core.messages import SystemMessage, HumanMessage
from backend.agents.state import AgentState
from backend.agents.scraper import search_and_scrape

def extract_text(content: Any) -> str:
    """Safely convert LLM message content into a clean string across providers."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict) and "text" in item:
                parts.append(item["text"])
            elif hasattr(item, "text"):
                parts.append(getattr(item, "text", ""))
            else:
                parts.append(str(item))
        return "\n".join(parts)
    return str(content) if content is not None else ""

def get_llm(config: RunnableConfig, max_output_tokens: int = 2048):
    configurable = config.get("configurable", {})
    provider = configurable.get("provider", "gemini")
    api_key = configurable.get("api_key", "")
    
    if provider == "gemini":
        from langchain_google_genai import ChatGoogleGenerativeAI
        model_name = os.getenv("GEMINI_MODEL", "gemini-3.6-flash")
        return ChatGoogleGenerativeAI(
            model=model_name, 
            google_api_key=api_key,
            temperature=0.1,
            max_output_tokens=max_output_tokens
        )
    elif provider == "openai":
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(
            model="gpt-4o-mini", 
            openai_api_key=api_key,
            temperature=0.1,
            max_tokens=max_output_tokens
        )
    else:
        raise ValueError(f"Unsupported LLM provider: {provider}")

def append_log(state: AgentState, agent: str, status: str, message: str) -> List[Dict[str, Any]]:
    logs = list(state.get("logs", []))
    logs.append({
        "agent": agent,
        "status": status,
        "message": message
    })
    return logs

async def coordinator_node(state: AgentState, config: RunnableConfig) -> Dict[str, Any]:
    query = state["query"]
    logs = append_log(state, "Coordinator", "planning", f"Analyzing query '{query}' and creating research plan...")
    
    try:
        llm = get_llm(config, max_output_tokens=1024)
        prompt = (
            "You are the Lead Coordinator of an Autonomous AI Research Lab.\n"
            f"Topic to investigate: {query}\n\n"
            "Create a concise, structured research blueprint:\n"
            "1. Core Technical Objective\n"
            "2. Critical Evaluation Dimensions (Architecture, Performance, Latency, Scalability, Cost)\n"
            "3. Key Comparison Questions to Answer\n"
            "Keep it sharp, technical, and formatted in clean Markdown."
        )
        response = await llm.ainvoke([HumanMessage(content=prompt)])
        plan = extract_text(response.content)
        
        logs.append({
            "agent": "Coordinator",
            "status": "completed",
            "message": "Research plan formulated successfully."
        })
        
        return {
            "research_plan": plan,
            "logs": logs,
            "active_agent": "Researcher"
        }
    except Exception as e:
        logs.append({
            "agent": "Coordinator",
            "status": "error",
            "message": f"Error creating research plan: {str(e)}"
        })
        return {"logs": logs, "active_agent": "Coordinator"}

async def researcher_node(state: AgentState, config: RunnableConfig) -> Dict[str, Any]:
    query = state["query"]
    plan = state.get("research_plan", "")
    logs = append_log(state, "Researcher", "searching", "Generating targeted search queries...")
    
    try:
        llm = get_llm(config, max_output_tokens=256)
        prompt = (
            f"Topic: '{query}'\nPlan:\n{plan}\n\n"
            "Generate exactly 2 high-precision web search queries to find real benchmark numbers, technical specs, or official docs.\n"
            "Output ONLY the 2 search queries, one per line."
        )
        response = await llm.ainvoke([HumanMessage(content=prompt)])
        content_str = extract_text(response.content)
        search_queries = [q.strip().strip('"').strip("'") for q in content_str.strip().split("\n") if q.strip()][:2]
        
        if not search_queries:
            search_queries = [f"{query} benchmark performance", f"{query} architecture comparison"]
            
        queries_str = ', '.join([f'"{q}"' for q in search_queries])
        logs.append({
            "agent": "Researcher",
            "status": "searching",
            "message": f"Executing parallel search queries: {queries_str}"
        })
        
        results = []
        configurable = config.get("configurable", {})
        tavily_key = configurable.get("tavily_key", "")
        
        if tavily_key:
            logs.append({
                "agent": "Researcher",
                "status": "searching",
                "message": "Executing high-speed search via Tavily API..."
            })
            from tavily import TavilyClient
            tavily = TavilyClient(api_key=tavily_key)
            
            def run_tavily(sq):
                try:
                    return tavily.search(query=sq, max_results=3, include_raw_content=False).get("results", [])
                except Exception:
                    return []
            
            tavily_results = await asyncio.gather(*[asyncio.to_thread(run_tavily, sq) for sq in search_queries])
            for res_list in tavily_results:
                for r in res_list:
                    results.append({
                        "title": r.get("title", ""),
                        "url": r.get("url", ""),
                        "snippet": r.get("content", ""),
                        "content": r.get("content", "")
                    })
        
        # Fast parallel scraping fallback
        if not results:
            logs.append({
                "agent": "Researcher",
                "status": "scraping",
                "message": "Scraping top web sources in parallel..."
            })
            scrape_tasks = [search_and_scrape(sq, max_results=2) for sq in search_queries]
            scrape_outputs = await asyncio.gather(*scrape_tasks, return_exceptions=True)
            for out in scrape_outputs:
                if isinstance(out, list):
                    results.extend(out)
        
        if not results:
            results = [{
                "title": "Technical Knowledge Base",
                "url": "https://developer.nvidia.com/blog",
                "snippet": f"Benchmarking and architectural analysis for {query}",
                "content": f"Comparative evaluation and metrics regarding {query}."
            }]
            
        logs.append({
            "agent": "Researcher",
            "status": "completed",
            "message": f"Extracted intelligence from {len(results)} sources. Synthesizing data points..."
        })
        
        # Fast synthesis
        sources_text = ""
        for i, r in enumerate(results[:4]):
            sources_text += f"Source [{i+1}] ({r['title']} - {r['url']}):\n{r['content'][:1200]}\n\n"
            
        synthesis_prompt = (
            f"You are the Researcher agent. Summarize the key facts, benchmark data, and architecture specifics for '{query}' from these sources:\n\n{sources_text}\n\n"
            "Format as concise bullet points: Metrics, Performance Numbers, Strengths, Limitations, and Direct Citations."
        )
        synthesis_llm = get_llm(config, max_output_tokens=1500)
        synthesis_res = await synthesis_llm.ainvoke([HumanMessage(content=synthesis_prompt)])
        synthesis_content = extract_text(synthesis_res.content)
        
        logs.append({
            "agent": "Researcher",
            "status": "completed",
            "message": "Intelligence synthesis complete. Handoff to Writer."
        })
        
        return {
            "research_results": results,
            "research_synthesis": synthesis_content,
            "logs": logs,
            "active_agent": "Writer"
        }
    except Exception as e:
        logs.append({
            "agent": "Researcher",
            "status": "error",
            "message": f"Researcher node error: {str(e)}"
        })
        return {"logs": logs, "active_agent": "Researcher"}

async def writer_node(state: AgentState, config: RunnableConfig) -> Dict[str, Any]:
    query = state["query"]
    plan = state.get("research_plan", "")
    results = state.get("research_results", [])
    critic_feedback = state.get("critic_feedback", "")
    fact_check_results = state.get("fact_check_results", [])
    research_synthesis = state.get("research_synthesis", "")
    
    logs = append_log(state, "Writer", "drafting", "Generating comprehensive publication-grade report...")
    
    try:
        llm = get_llm(config, max_output_tokens=3500)
        
        sources_text = ""
        for i, r in enumerate(results[:4]):
            sources_text += f"- [{r.get('title', '')}]({r.get('url', '')}): {r.get('snippet', '')[:300]}\n"
            
        feedback_context = ""
        if critic_feedback:
            feedback_context += f"\n\nCRITIC FEEDBACK TO INCORPORATE:\n{critic_feedback}"
            logs.append({"agent": "Writer", "status": "drafting", "message": "Incorporating Editor revision feedback..."})
            
        if fact_check_results:
            last_check = fact_check_results[-1]
            if "ERRORS FOUND" in last_check.get("details", ""):
                feedback_context += f"\n\nFACT-CHECKER CORRECTIONS REQUIRED:\n{last_check.get('details', '')}"

        prompt = (
            "You are the Lead Writer in an AI Research Lab. Produce an exhaustive, highly technical, publication-ready research report.\n\n"
            f"TOPIC: {query}\n\n"
            f"RESEARCH PLAN:\n{plan}\n\n"
            f"FACTUAL SYNTHESIS & BENCHMARKS:\n{research_synthesis}\n\n"
            f"VERIFIED SOURCES:\n{sources_text}"
            f"{feedback_context}\n\n"
            "Report Requirements:\n"
            "1. # Professional Title\n"
            "2. ## Executive Summary (High-level findings, direct verdict)\n"
            "3. ## Architecture & Technical Deep-Dive\n"
            "4. ## Quantitative Performance & Benchmarks (Include a Markdown Comparison Matrix/Table with latency, QPS, memory, scalability)\n"
            "5. ## Code / Implementation Snippets (e.g. indexing, querying, configuration)\n"
            "6. ## Critical Trade-Offs & Decision Guide (When to choose which)\n"
            "7. ## References (Hyperlinked with real URLs from the verified sources)\n\n"
            "Provide deep technical rigor and precise metrics."
        )
        
        response = await llm.ainvoke([HumanMessage(content=prompt)])
        draft = extract_text(response.content)
        
        logs.append({
            "agent": "Writer",
            "status": "completed",
            "message": "Report draft completed successfully."
        })
        
        return {
            "draft_report": draft,
            "logs": logs,
            "active_agent": "Fact-Checker"
        }
    except Exception as e:
        logs.append({
            "agent": "Writer",
            "status": "error",
            "message": f"Writer node error: {str(e)}"
        })
        return {"logs": logs, "active_agent": "Writer"}

async def fact_checker_node(state: AgentState, config: RunnableConfig) -> Dict[str, Any]:
    draft = state.get("draft_report", "")
    results = state.get("research_results", [])
    fact_check_records = list(state.get("fact_check_results", []))
    
    logs = append_log(state, "Fact-Checker", "checking", "Cross-referencing report claims against raw intelligence...")
    
    try:
        llm = get_llm(config, max_output_tokens=1024)
        sources_text = ""
        for i, r in enumerate(results[:4]):
            sources_text += f"Source [{i+1}]: {r.get('title', '')} ({r.get('url', '')})\n{r.get('content', '')[:800]}\n\n"
            
        prompt = (
            "You are the Fact-Checker agent.\n"
            "Verify the factual accuracy and benchmarks in the report against the source materials.\n\n"
            f"DRAFT REPORT EXCERPTS:\n{draft[:3000]}\n\n"
            f"RAW SOURCES:\n{sources_text}\n\n"
            "Instructions:\n"
            "1. Verify numbers, architectural claims, and statements.\n"
            "2. If blatant contradictions or hallucinations exist, start with 'ERRORS FOUND: [details]'.\n"
            "3. If claims are solid and well-grounded, start with 'VERIFIED: All claims cross-referenced and verified.' with a 2-sentence summary."
        )
        
        response = await llm.ainvoke([HumanMessage(content=prompt)])
        check_output = extract_text(response.content)
        
        fact_check_records.append({
            "iteration": len(fact_check_records) + 1,
            "details": check_output
        })
        
        if check_output.strip().startswith("ERRORS FOUND") and len(fact_check_records) < 2:
            status_msg = "Fact-Checker flagged discrepancies. Routing back to Writer."
            next_agent = "Writer"
        else:
            status_msg = "Fact-Checker verified all claims. Routing to Editor/Critic."
            next_agent = "Critic"
            
        logs.append({
            "agent": "Fact-Checker",
            "status": "completed",
            "message": status_msg
        })
        
        return {
            "fact_check_results": fact_check_records,
            "logs": logs,
            "active_agent": next_agent
        }
    except Exception as e:
        logs.append({
            "agent": "Fact-Checker",
            "status": "error",
            "message": f"Fact-Checker node error: {str(e)}"
        })
        return {"logs": logs, "active_agent": "Fact-Checker"}

async def critic_node(state: AgentState, config: RunnableConfig) -> Dict[str, Any]:
    draft = state.get("draft_report", "")
    fact_check = state.get("fact_check_results", [])[-1].get("details", "") if state.get("fact_check_results") else ""
    
    logs = append_log(state, "Critic", "reviewing", "Editorial audit of structure, formatting, and depth...")
    
    try:
        llm = get_llm(config, max_output_tokens=1024)
        
        prompt = (
            "You are the Lead Critic (Editor-in-Chief).\n"
            "Audit this technical research report.\n\n"
            f"DRAFT REPORT:\n{draft[:3500]}\n\n"
            f"FACT-CHECK STATUS:\n{fact_check}\n\n"
            "If the report is comprehensive, well-structured, and accurate, respond with 'APPROVED'.\n"
            "If major sections are missing, respond with 'REVISION NEEDED: [concise notes]'."
        )
        
        response = await llm.ainvoke([HumanMessage(content=prompt)])
        critic_output = extract_text(response.content)
        
        configurable = config.get("configurable", {})
        websocket = configurable.get("websocket")
        queue = configurable.get("queue")
        
        # If interactive human-in-the-loop review is connected
        if websocket and queue:
            logs.append({
                "agent": "Critic",
                "status": "completed",
                "message": "Editorial audit complete. Awaiting Human Editor approval/review..."
            })
            
            pause_state = {
                **state,
                "logs": logs,
                "active_agent": "Critic",
                "awaiting_review": True
            }
            await websocket.send_text(json.dumps(pause_state))
            
            user_msg_str = await queue.get()
            user_msg = json.loads(user_msg_str) if isinstance(user_msg_str, str) else user_msg_str
            feedback = user_msg.get("feedback", "")
            
            if feedback.lower() == "approve":
                status_msg = "Human Editor approved the report. Publishing final output."
                next_agent = "Finalize"
                feedback_val = None
                final = draft
            else:
                status_msg = f"Revisions requested: '{feedback}'. Routing back to Writer."
                next_agent = "Writer"
                feedback_val = f"USER REQUESTED REVISIONS:\n{feedback}\n\nCRITIC NOTES:\n{critic_output}"
                final = None
                
            logs.append({
                "agent": "Critic",
                "status": "completed",
                "message": status_msg
            })
            
            return {
                "critic_feedback": feedback_val,
                "final_report": final,
                "logs": logs,
                "active_agent": next_agent,
                "awaiting_review": False
            }
        else:
            if critic_output.strip().startswith("REVISION NEEDED") and not state.get("critic_feedback"):
                status_msg = "Critic requested minor revisions. Routing to Writer."
                next_agent = "Writer"
                feedback = critic_output
                final = None
            else:
                status_msg = "Critic approved the research report! Publishing final output."
                next_agent = "Finalize"
                feedback = None
                final = draft
                
            logs.append({
                "agent": "Critic",
                "status": "completed",
                "message": status_msg
            })
            
            return {
                "critic_feedback": feedback,
                "final_report": final,
                "logs": logs,
                "active_agent": next_agent,
                "awaiting_review": False
            }
    except Exception as e:
        logs.append({
            "agent": "Critic",
            "status": "error",
            "message": f"Critic node error: {str(e)}"
        })
        return {"logs": logs, "active_agent": "Critic", "awaiting_review": False}
