import asyncio
import json
from typing import Dict, Any, List
from langchain_core.runnables import RunnableConfig
from langchain_core.messages import SystemMessage, HumanMessage
from backend.agents.state import AgentState
from backend.agents.scraper import search_and_scrape

def get_llm(config: RunnableConfig):
    configurable = config.get("configurable", {})
    provider = configurable.get("provider", "gemini")
    api_key = configurable.get("api_key", "")
    
    if provider == "gemini":
        from langchain_google_genai import ChatGoogleGenerativeAI
        return ChatGoogleGenerativeAI(
            model="gemini-3.6-flash", 
            google_api_key=api_key,
            temperature=0.2
        )
    elif provider == "openai":
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(
            model="gpt-4o-mini", 
            openai_api_key=api_key,
            temperature=0.2
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
        llm = get_llm(config)
        prompt = (
            "You are the Coordinator of an Autonomous Research Lab.\n"
            f"The user wants to research: {query}\n"
            "Break this topic down into a detailed research plan. Specify the key aspects to investigate, "
            "technical parameters, comparison criteria, and target data. Output the plan in clear Markdown."
        )
        response = await llm.ainvoke([HumanMessage(content=prompt)])
        plan = response.content
        
        logs.append({
            "agent": "Coordinator",
            "status": "completed",
            "message": "Research plan successfully created."
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
    logs = append_log(state, "Researcher", "searching", "Generating search queries based on research plan...")
    
    try:
        llm = get_llm(config)
        prompt = (
            f"Given the research query: '{query}' and research plan:\n{plan}\n\n"
            "Generate 3 distinct search queries to find technical documentation, benchmarks, or articles. "
            "Output ONLY the search queries, one per line, and no other text."
        )
        response = await llm.ainvoke([HumanMessage(content=prompt)])
        search_queries = [q.strip() for q in response.content.strip().split("\n") if q.strip()]
        
        if not search_queries:
            search_queries = [query]
            
        queries_str = ', '.join([f'"{q}"' for q in search_queries])
        logs.append({
            "agent": "Researcher",
            "status": "searching",
            "message": f"Generated search queries: {queries_str}"
        })
        
        results = []
        configurable = config.get("configurable", {})
        tavily_key = configurable.get("tavily_key", "")
        
        if tavily_key:
            logs.append({
                "agent": "Researcher",
                "status": "searching",
                "message": "Performing web search using Tavily API..."
            })
            from tavily import TavilyClient
            tavily = TavilyClient(api_key=tavily_key)
            
            for s_query in search_queries[:2]: # Search 2 queries to avoid context overload
                try:
                    search_res = tavily.search(query=s_query, max_results=3, include_raw_content=False)
                    for r in search_res.get("results", []):
                        results.append({
                            "title": r.get("title", ""),
                            "url": r.get("url", ""),
                            "snippet": r.get("content", ""),
                            "content": r.get("content", "")
                        })
                except Exception as ex:
                    logs.append({
                        "agent": "Researcher",
                        "status": "error",
                        "message": f"Tavily search failed for '{s_query}': {str(ex)}"
                    })
        
        # If Tavily key not provided or search results empty, use lightweight web scraper
        if not results:
            logs.append({
                "agent": "Researcher",
                "status": "scraping",
                "message": "Searching web and extracting content from top sources..."
            })
            for s_query in search_queries[:2]:
                try:
                    scrape_res = await search_and_scrape(s_query, max_results=2)
                    results.extend(scrape_res)
                except Exception as ex:
                    logs.append({
                        "agent": "Researcher",
                        "status": "error",
                        "message": f"Web scrape failed for '{s_query}': {str(ex)}"
                    })
        
        if not results:
            # Complete fallback
            results = [{
                "title": "Fallback Information",
                "url": "http://internal-db.local",
                "snippet": f"Manual search fallback for {query}",
                "content": f"Please note that search failed. Proceeding with LLM knowledge database regarding {query}."
            }]
            
        logs.append({
            "agent": "Researcher",
            "status": "completed",
            "message": f"Gathered details from {len(results)} sources. Synthesizing research findings..."
        })
        
        # Let LLM synthesize search findings
        sources_text = ""
        for i, r in enumerate(results):
            sources_text += f"Source [{i+1}]: {r['title']} ({r['url']})\nContent: {r['content'][:1500]}\n\n"
            
        synthesis_prompt = (
            f"You are the Researcher agent. Synthesize the findings for query '{query}' from these sources:\n\n{sources_text}\n\n"
            "Compile a structured summary of facts, numbers, benchmarks, and references. Output in Markdown."
        )
        synthesis_res = await llm.ainvoke([HumanMessage(content=synthesis_prompt)])
        
        logs.append({
            "agent": "Researcher",
            "status": "completed",
            "message": "Research synthesis completed successfully."
        })
        
        return {
            "research_results": results,
            "research_synthesis": synthesis_res.content,
            "logs": logs,
            "active_agent": "Writer"
        }
    except Exception as e:
        logs.append({
            "agent": "Researcher",
            "status": "error",
            "message": f"Researcher node failed: {str(e)}"
        })
        return {"logs": logs, "active_agent": "Researcher"}

async def writer_node(state: AgentState, config: RunnableConfig) -> Dict[str, Any]:
    query = state["query"]
    plan = state.get("research_plan", "")
    results = state.get("research_results", [])
    critic_feedback = state.get("critic_feedback", "")
    fact_check_results = state.get("fact_check_results", [])
    
    logs = append_log(state, "Writer", "drafting", "Drafting research report based on gathered intelligence...")
    
    try:
        llm = get_llm(config)
        
        # Compile sources context
        sources_text = ""
        for i, r in enumerate(results):
            sources_text += f"Source [{i+1}]: {r.get('title', '')} ({r.get('url', '')})\nSnippet: {r.get('snippet', '')}\n\n"
            
        feedback_context = ""
        if critic_feedback:
            feedback_context += f"\n\nCRITIC FEEDBACK FOR REVISION:\n{critic_feedback}"
            logs.append({"agent": "Writer", "status": "drafting", "message": "Incorporating Editor/Critic feedback..."})
            
        if fact_check_results:
            last_check = fact_check_results[-1]
            if "ERRORS FOUND" in last_check.get("details", ""):
                feedback_context += f"\n\nFACT-CHECKER CORRECTIONS REQUIRED:\n{last_check.get('details', '')}"
                logs.append({"agent": "Writer", "status": "drafting", "message": "Correcting factual discrepancies identified by Fact-Checker..."})

        synthesis_context = ""
        research_synthesis = state.get("research_synthesis", "")
        if research_synthesis:
            synthesis_context = f"\n\nRESEARCH FINDINGS SYNTHESIS:\n{research_synthesis}"

        prompt = (
            "You are the Writer agent. Your goal is to draft a comprehensive, detailed, publication-ready research report.\n"
            f"Research Query: {query}\n"
            f"Research Plan:\n{plan}\n\n"
            f"Factual Sources:\n{sources_text}"
            f"{synthesis_context}"
            f"{feedback_context}\n\n"
            "Draft the report in Markdown. Include:\n"
            "- A professional title\n"
            "- Executive summary\n"
            "- Detailed analysis sections mapping to the research plan\n"
            "- Comparison tables/matrices (especially for performance, features, costs)\n"
            "- Practical code snippets or implementation setup if relevant\n"
            "- Limitations / critical trade-offs\n"
            "- References list with URLs from the sources\n\n"
            "Produce a long, thorough report. Go into technical depth."
        )
        
        response = await llm.ainvoke([HumanMessage(content=prompt)])
        draft = response.content
        
        logs.append({
            "agent": "Writer",
            "status": "completed",
            "message": "Report draft finished."
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
            "message": f"Writer node failed: {str(e)}"
        })
        return {"logs": logs, "active_agent": "Writer"}

async def fact_checker_node(state: AgentState, config: RunnableConfig) -> Dict[str, Any]:
    draft = state.get("draft_report", "")
    results = state.get("research_results", [])
    fact_check_records = list(state.get("fact_check_results", []))
    
    logs = append_log(state, "Fact-Checker", "checking", "Verifying assertions in the report against raw sources to prevent hallucinations...")
    
    try:
        llm = get_llm(config)
        sources_text = ""
        for i, r in enumerate(results):
            sources_text += f"Source [{i+1}]: {r.get('title', '')} ({r.get('url', '')})\nSnippet: {r.get('content', '')[:1000]}\n\n"
            
        prompt = (
            "You are the Fact-Checker agent.\n"
            "Compare the drafted report against the raw source materials provided below.\n\n"
            f"DRAFT REPORT:\n{draft}\n\n"
            f"RAW SOURCE MATERIALS:\n{sources_text}\n\n"
            "Tasks:\n"
            "1. Scan the report for specific facts (numbers, benchmarks, technical claims, URLs).\n"
            "2. Cross-reference them with the source materials.\n"
            "3. If there are contradictions, unsupported assumptions, or hallucinations, list them clearly and start your response with: 'ERRORS FOUND: [details]'.\n"
            "4. If all claims are supported by the sources, start your response with: 'VERIFIED: All claims cross-referenced and verified.' followed by a brief summary of findings.\n"
        )
        
        response = await llm.ainvoke([HumanMessage(content=prompt)])
        check_output = response.content
        
        fact_check_records.append({
            "iteration": len(fact_check_records) + 1,
            "details": check_output
        })
        
        if check_output.strip().startswith("ERRORS FOUND"):
            status_msg = "Fact-Checker flagged potential errors/hallucinations. Routing back to Writer."
            next_agent = "Writer"
        else:
            status_msg = "Fact-Checker successfully verified all claims. Routing to Critic."
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
            "message": f"Fact-Checker node failed: {str(e)}"
        })
        return {"logs": logs, "active_agent": "Fact-Checker"}

async def critic_node(state: AgentState, config: RunnableConfig) -> Dict[str, Any]:
    draft = state.get("draft_report", "")
    fact_check = state.get("fact_check_results", [])[-1].get("details", "") if state.get("fact_check_results") else ""
    
    logs = append_log(state, "Critic", "reviewing", "Performing editorial review of formatting, clarity, and depth...")
    
    try:
        llm = get_llm(config)
        
        prompt = (
            "You are the Lead Critic (Editor) agent.\n"
            "Review the draft research report for structure, technical depth, formatting, and overall quality.\n\n"
            f"DRAFT REPORT:\n{draft}\n\n"
            f"FACT-CHECK SUMMARY:\n{fact_check}\n\n"
            "Decide if the report is ready for publication.\n"
            "- If improvements are needed (e.g. formatting improvements, missing sections, lack of comparisons, poor markdown), "
            "list concrete suggestions and start your response with 'REVISION NEEDED: [suggestions]'.\n"
            "- If the report is outstanding, technically accurate, nicely formatted, and complete, "
            "start your response with 'APPROVED'.\n"
        )
        
        response = await llm.ainvoke([HumanMessage(content=prompt)])
        critic_output = response.content
        
        # Check if queue and websocket are present in configurable
        configurable = config.get("configurable", {})
        websocket = configurable.get("websocket")
        queue = configurable.get("queue")
        
        if websocket and queue:
            # Let the user know the critic finished its audit, and we are pausing for human approval/edits
            logs.append({
                "agent": "Critic",
                "status": "completed",
                "message": f"Critic audit completed. Awaiting Human Editor review..."
            })
            
            # Send current state with awaiting_review flag set to True
            pause_state = {
                **state,
                "logs": logs,
                "active_agent": "Critic",
                "awaiting_review": True
            }
            await websocket.send_text(json.dumps(pause_state))
            
            # Await user feedback from the session queue
            user_msg_str = await queue.get()
            user_msg = json.loads(user_msg_str) if isinstance(user_msg_str, str) else user_msg_str
            feedback = user_msg.get("feedback", "")
            
            if feedback.lower() == "approve":
                status_msg = "User approved the report! Publishing final output."
                next_agent = "Finalize"
                feedback_val = None
                final = draft
            else:
                status_msg = f"User requested revisions: '{feedback}'. Routing back to Writer."
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
            # Fallback to LLM autonomous review
            if critic_output.strip().startswith("REVISION NEEDED"):
                status_msg = "Critic requested revisions. Routing back to Writer."
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
            "message": f"Critic node failed: {str(e)}"
        })
        return {"logs": logs, "active_agent": "Critic", "awaiting_review": False}
