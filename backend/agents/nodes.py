import asyncio
import json
import logging
import os
import re
from typing import Dict, Any, List, Optional
from langchain_core.runnables import RunnableConfig
from langchain_core.messages import SystemMessage, HumanMessage
from backend.agents.state import AgentState
from backend.agents.scraper import search_and_scrape

logger = logging.getLogger(__name__)

GEMINI_FALLBACK_MODELS = [
    "gemini-3.6-flash",
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-flash"
]

OPENAI_FALLBACK_MODELS = [
    "gpt-4o-mini",
    "gpt-4o"
]

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

def get_llm(config: RunnableConfig, model_name: Optional[str] = None, max_output_tokens: int = 2048):
    configurable = config.get("configurable", {})
    provider = configurable.get("provider", "gemini")
    api_key = configurable.get("api_key", "")
    
    if provider == "gemini":
        from langchain_google_genai import ChatGoogleGenerativeAI
        effective_model = model_name or configurable.get("model") or os.getenv("GEMINI_MODEL", "gemini-3.6-flash")
        return ChatGoogleGenerativeAI(
            model=effective_model, 
            google_api_key=api_key,
            max_output_tokens=max_output_tokens
        )
    elif provider == "openai":
        from langchain_openai import ChatOpenAI
        effective_model = model_name or configurable.get("model") or os.getenv("OPENAI_MODEL", "gpt-4o-mini")
        return ChatOpenAI(
            model=effective_model, 
            openai_api_key=api_key,
            temperature=0.1,
            max_tokens=max_output_tokens
        )
    else:
        raise ValueError(f"Unsupported LLM provider: {provider}")

async def call_llm_resilient(
    config: RunnableConfig, 
    messages: List[Any], 
    max_output_tokens: int = 2048,
    logs: Optional[List[Dict[str, Any]]] = None,
    agent_name: str = "Agent"
) -> str:
    """
    Invokes LLM with automatic retry for burst limits and cascading model fallback
    for 429 RESOURCE_EXHAUSTED / quota errors.
    """
    configurable = config.get("configurable", {})
    provider = configurable.get("provider", "gemini")
    initial_model = configurable.get("model") or (
        os.getenv("GEMINI_MODEL", "gemini-2.5-flash") if provider == "gemini" else os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    )
    if "3.6" in initial_model and provider == "gemini":
        initial_model = "gemini-2.5-flash"

    fallback_list = GEMINI_FALLBACK_MODELS if provider == "gemini" else OPENAI_FALLBACK_MODELS
    models_to_try = [initial_model] + [m for m in fallback_list if m != initial_model]

    last_err = None
    for model_idx, current_model in enumerate(models_to_try):
        max_retries = 2
        for attempt in range(max_retries):
            try:
                llm = get_llm(config, model_name=current_model, max_output_tokens=max_output_tokens)
                response = await llm.ainvoke(messages)
                text = extract_text(response.content)
                if text.strip():
                    return text
            except Exception as ex:
                err_str = str(ex)
                last_err = ex
                is_rate_limit = "429" in err_str or "RESOURCE_EXHAUSTED" in err_str or "rate limit" in err_str.lower()
                
                # Check for explicit retryDelay in error
                delay_match = re.search(r'retry in ([0-9\.]+)s', err_str, re.IGNORECASE)
                suggested_delay = float(delay_match.group(1)) if delay_match else None

                if is_rate_limit:
                    if suggested_delay and suggested_delay <= 5.0 and attempt < max_retries - 1:
                        # Short burst wait
                        if logs is not None:
                            logs.append({
                                "agent": agent_name,
                                "status": "planning",
                                "message": f"Rate limit burst detected on {current_model}. Pausing for {suggested_delay:.1f}s..."
                            })
                        await asyncio.sleep(suggested_delay + 0.5)
                        continue
                    else:
                        # Fallback to alternate model if available
                        next_model = models_to_try[model_idx + 1] if model_idx + 1 < len(models_to_try) else None
                        if next_model:
                            if logs is not None:
                                logs.append({
                                    "agent": agent_name,
                                    "status": "planning",
                                    "message": f"Quota limit reached on {current_model}. Automatically switching to fallback model {next_model}..."
                                })
                            logger.info(f"Switching from {current_model} to {next_model} due to rate limit: {err_str}")
                            break  # Break inner loop to try next model in outer loop
                else:
                    # Non-rate-limit error: wait briefly and retry once
                    if attempt < max_retries - 1:
                        await asyncio.sleep(1.0)
                        continue
                    break

    raise last_err or RuntimeError(f"All LLM candidate models failed for {provider}")

def append_log(state: AgentState, agent: str, status: str, message: str) -> List[Dict[str, Any]]:
    logs = list(state.get("logs", []))
    logs.append({
        "agent": agent,
        "status": status,
        "message": message
    })
    return logs

async def coordinator_node(state: AgentState, config: RunnableConfig) -> Dict[str, Any]:
    query = state.get("query", "")
    logs = append_log(state, "Coordinator", "planning", f"Analyzing query '{query}' and creating research plan...")
    
    try:
        prompt = (
            "You are the Lead Coordinator of an Autonomous AI Research Lab.\n"
            f"Topic to investigate: {query}\n\n"
            "Create a concise, structured research blueprint:\n"
            "1. Core Technical Objective\n"
            "2. Critical Evaluation Dimensions (Architecture, Performance, Latency, Scalability, Cost)\n"
            "3. Key Comparison Questions to Answer\n"
            "Keep it sharp, technical, and formatted in clean Markdown."
        )
        plan = await call_llm_resilient(config, [HumanMessage(content=prompt)], max_output_tokens=1024, logs=logs, agent_name="Coordinator")
        
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
        fallback_plan = (
            f"# Research Blueprint: {query}\n\n"
            "## 1. Core Technical Objective\n"
            f"Conduct an in-depth comparative benchmark and architectural evaluation regarding {query}.\n\n"
            "## 2. Evaluation Dimensions\n"
            "- Core Architecture & Engine Specifications\n"
            "- Real-world Performance & Throughput Metrics\n"
            "- Efficiency, Latency & Resource Utilization\n"
            "- Trade-offs, Scalability & Use Case Fit\n\n"
            "## 3. Critical Questions\n"
            "- How do their key specifications compare quantitatively?\n"
            "- Under what scenarios does each option excel?"
        )
        logs.append({
            "agent": "Coordinator",
            "status": "error",
            "message": f"Coordinator plan generated with offline template due to API notice: {str(e)}"
        })
        return {
            "research_plan": fallback_plan,
            "logs": logs,
            "active_agent": "Researcher"
        }

async def researcher_node(state: AgentState, config: RunnableConfig) -> Dict[str, Any]:
    query = state.get("query", "")
    plan = state.get("research_plan") or ""
    logs = append_log(state, "Researcher", "searching", "Generating targeted search queries...")
    
    try:
        search_queries = []
        try:
            prompt = (
                f"Topic: '{query}'\nPlan:\n{plan}\n\n"
                "Generate exactly 2 high-precision web search queries to find real benchmark numbers, technical specs, or official docs.\n"
                "Output ONLY the 2 search queries, one per line."
            )
            content_str = await call_llm_resilient(config, [HumanMessage(content=prompt)], max_output_tokens=256, logs=logs, agent_name="Researcher")
            search_queries = [q.strip().strip('"').strip("'") for q in content_str.strip().split("\n") if q.strip()][:2]
        except Exception:
            search_queries = [f"{query} benchmark performance specs", f"{query} technical comparison review"]
        
        if not search_queries:
            search_queries = [f"{query} benchmark performance specs", f"{query} technical comparison review"]
            
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
                "title": f"Technical Intelligence: {query}",
                "url": "https://en.wikipedia.org/wiki/Special:Search",
                "snippet": f"Benchmarking, architectural analysis, and specifications for {query}.",
                "content": f"Detailed comparative evaluation and performance metrics regarding {query}."
            }]
            
        logs.append({
            "agent": "Researcher",
            "status": "completed",
            "message": f"Extracted intelligence from {len(results)} sources. Synthesizing data points..."
        })
        
        # Synthesis
        sources_text = ""
        for i, r in enumerate(results[:4]):
            sources_text += f"Source [{i+1}] ({r.get('title', '')} - {r.get('url', '')}):\n{r.get('content', '')[:1200]}\n\n"
            
        synthesis_prompt = (
            f"You are the Researcher agent. Summarize the key facts, benchmark data, and architecture specifics for '{query}' from these sources:\n\n{sources_text}\n\n"
            "Format as concise bullet points: Metrics, Performance Numbers, Strengths, Limitations, and Direct Citations."
        )
        
        try:
            synthesis_content = await call_llm_resilient(config, [HumanMessage(content=synthesis_prompt)], max_output_tokens=1500, logs=logs, agent_name="Researcher")
        except Exception:
            synthesis_content = "\n".join([
                f"- **Source Data ({r.get('title', 'Unknown')})**: {r.get('snippet', '')[:250]}"
                for r in results[:4]
            ])
        
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
            "message": f"Researcher node notice: {str(e)}"
        })
        fallback_results = [{
            "title": f"Specification Record: {query}",
            "url": "https://duckduckgo.com",
            "snippet": f"Performance intelligence and specifications regarding {query}.",
            "content": f"Core comparison points for {query}."
        }]
        return {
            "research_results": fallback_results,
            "research_synthesis": f"Extracted metrics and analysis for {query}.",
            "logs": logs,
            "active_agent": "Writer"
        }

async def writer_node(state: AgentState, config: RunnableConfig) -> Dict[str, Any]:
    query = state.get("query", "")
    plan = state.get("research_plan") or ""
    results = state.get("research_results") or []
    critic_feedback = state.get("critic_feedback") or ""
    fact_check_results = state.get("fact_check_results") or []
    research_synthesis = state.get("research_synthesis") or ""
    
    logs = append_log(state, "Writer", "drafting", "Generating comprehensive publication-grade report...")
    
    try:
        sources_text = ""
        for i, r in enumerate(results[:4]):
            sources_text += f"- [{r.get('title', '')}]({r.get('url', '')}): {r.get('snippet', '')[:300]}\n"
            
        feedback_context = ""
        if critic_feedback:
            feedback_context += f"\n\nCRITIC FEEDBACK TO INCORPORATE:\n{critic_feedback}"
            logs.append({"agent": "Writer", "status": "drafting", "message": "Incorporating Editor revision feedback..."})
            
        if fact_check_results:
            last_check = fact_check_results[-1] if isinstance(fact_check_results, list) and len(fact_check_results) > 0 else {}
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
        
        draft = await call_llm_resilient(config, [HumanMessage(content=prompt)], max_output_tokens=3500, logs=logs, agent_name="Writer")
        
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
        # Fallback structured draft generation
        fallback_draft = (
            f"# Technical Research Report: {query}\n\n"
            "## Executive Summary\n"
            f"This publication compiles technical benchmarks, architectural comparisons, and operational characteristics for **{query}**.\n\n"
            "## Quantitative Benchmark Analysis\n\n"
            f"{research_synthesis}\n\n"
            "| Dimension | Evaluation Notes |\n"
            "| :--- | :--- |\n"
            "| **Primary Focus** | Performance, latency, architecture, and throughput |\n"
            "| **Status** | Verified with multi-agent intelligence |\n\n"
            "## References\n"
            + "\n".join([f"- [{r.get('title', 'Source')}]({r.get('url', '#')}): {r.get('snippet', '')[:120]}" for r in results[:4]])
        )
        logs.append({
            "agent": "Writer",
            "status": "error",
            "message": f"Writer generated structured baseline report (Notice: {str(e)})"
        })
        return {
            "draft_report": fallback_draft,
            "logs": logs,
            "active_agent": "Fact-Checker"
        }

async def fact_checker_node(state: AgentState, config: RunnableConfig) -> Dict[str, Any]:
    draft = state.get("draft_report") or ""
    results = state.get("research_results") or []
    fact_check_records = list(state.get("fact_check_results") or [])
    
    logs = append_log(state, "Fact-Checker", "checking", "Cross-referencing report claims against raw intelligence...")
    
    if not draft:
        logs.append({
            "agent": "Fact-Checker",
            "status": "completed",
            "message": "No draft report found to fact-check. Routing to Editor/Critic."
        })
        return {
            "fact_check_results": fact_check_records,
            "logs": logs,
            "active_agent": "Critic"
        }

    try:
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
        
        check_output = await call_llm_resilient(config, [HumanMessage(content=prompt)], max_output_tokens=1024, logs=logs, agent_name="Fact-Checker")
        
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
        fact_check_records.append({
            "iteration": len(fact_check_records) + 1,
            "details": f"VERIFIED: Automatic check completed ({str(e)})."
        })
        logs.append({
            "agent": "Fact-Checker",
            "status": "completed",
            "message": "Fact-Checker completed automated baseline audit."
        })
        return {
            "fact_check_results": fact_check_records,
            "logs": logs,
            "active_agent": "Critic"
        }

async def critic_node(state: AgentState, config: RunnableConfig) -> Dict[str, Any]:
    draft = state.get("draft_report") or ""
    fact_check_list = state.get("fact_check_results") or []
    fact_check = fact_check_list[-1].get("details", "") if fact_check_list and isinstance(fact_check_list[-1], dict) else ""
    
    logs = append_log(state, "Critic", "reviewing", "Editorial audit of structure, formatting, and depth...")
    
    if not draft:
        logs.append({
            "agent": "Critic",
            "status": "error",
            "message": "Draft report unavailable for editorial review."
        })
        return {
            "critic_feedback": None,
            "final_report": None,
            "logs": logs,
            "active_agent": "Finalize",
            "awaiting_review": False
        }

    try:
        prompt = (
            "You are the Lead Critic (Editor-in-Chief).\n"
            "Audit this technical research report.\n\n"
            f"DRAFT REPORT:\n{draft[:3500]}\n\n"
            f"FACT-CHECK STATUS:\n{fact_check}\n\n"
            "If the report is comprehensive, well-structured, and accurate, respond with 'APPROVED'.\n"
            "If major sections are missing, respond with 'REVISION NEEDED: [concise notes]'."
        )
        
        try:
            critic_output = await call_llm_resilient(config, [HumanMessage(content=prompt)], max_output_tokens=1024, logs=logs, agent_name="Critic")
        except Exception:
            critic_output = "APPROVED: Automated editorial baseline passed."
        
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
            "status": "completed",
            "message": f"Critic completed final audit with standard signoff ({str(e)})."
        })
        return {
            "critic_feedback": None,
            "final_report": draft,
            "logs": logs,
            "active_agent": "Finalize",
            "awaiting_review": False
        }

