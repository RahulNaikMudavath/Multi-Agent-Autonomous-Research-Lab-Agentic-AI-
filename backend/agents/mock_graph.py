import asyncio as real_asyncio
import json
from typing import AsyncGenerator, Dict, Any
from contextvars import ContextVar

sim_speed = ContextVar("sim_speed", default=1.0)

class AsyncioWrapper:
    def __getattr__(self, name):
        return getattr(real_asyncio, name)
    
    async def sleep(self, delay, *args, **kwargs):
        speed = sim_speed.get()
        await real_asyncio.sleep(delay / max(0.01, speed))

asyncio = AsyncioWrapper()

async def run_mock_research(query: str, queue: asyncio.Queue = None, speed: float = 1.0) -> AsyncGenerator[str, None]:
    """
    Simulates the multi-agent LangGraph workflow step-by-step, yielding
    state updates in JSON string format. It features loops:
    Fact-Checker flags a discrepancy -> Writer fixes it.
    Critic requests layout improvement -> Writer adds a table -> Critic approves.
    """
    sim_speed.set(speed)
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

    def add_log(agent: str, status: str, message: str):
        state["logs"].append({
            "agent": agent,
            "status": status,
            "message": message
        })

    # --- 1. COORDINATOR PLANNING ---
    add_log("Coordinator", "planning", f"Initiating research protocol for: '{query}'...")
    state["active_agent"] = "Coordinator"
    yield json.dumps(state)
    await asyncio.sleep(2.0)

    add_log("Coordinator", "planning", "Deconstructing search parameters and mapping technical aspects...")
    yield json.dumps(state)
    await asyncio.sleep(2.5)

    mock_plan = (
        f"# Research Plan: {query}\n\n"
        "1. **Core Architecture Analysis**: Review design principles, index types, and indexing speed.\n"
        "2. **Performance Benchmarks**: Analyze QPS (Queries Per Second), latency curves, and recall rate at scale.\n"
        "3. **Operational Overhead**: Evaluate resource footprints (RAM/CPU), setup complexity, and ecosystem integrations.\n"
        "4. **Factual Verification**: Authenticate numbers against official engineering documents.\n"
    )
    state["research_plan"] = mock_plan
    add_log("Coordinator", "completed", "Detailed research strategy formulated. Routing task to Researcher.")
    state["active_agent"] = "Researcher"
    yield json.dumps(state)
    await asyncio.sleep(2.0)

    # --- 2. RESEARCHER SEARCHING & SCRAPING ---
    add_log("Researcher", "searching", "Generating search queries matching plan nodes...")
    yield json.dumps(state)
    await asyncio.sleep(2.0)

    queries = [
        f"{query} benchmark recall latency",
        f"{query} hardware requirements architecture",
        f"{query} developer review limitations"
    ]
    queries_str = ', '.join([f'"{q}"' for q in queries])
    add_log("Researcher", "searching", f"Queries launched: {queries_str}")
    yield json.dumps(state)
    await asyncio.sleep(1.5)

    add_log("Researcher", "scraping", "Searching web and scraping tech blogs, benchmarks, and documentation...")
    yield json.dumps(state)
    await asyncio.sleep(3.0)

    state["research_results"] = [
        {
            "title": f"Official Performance Testing Guidelines for {query}",
            "url": "https://dbbenchmarks.org/vector-search-performance",
            "snippet": "Analysis of index build times and query-per-second metrics at 1M scale. Hardware configuration: 16 vCPUs, 64GB RAM.",
            "content": "For 1M 1536-dimensional vectors, index build times vary heavily. HNSW index shows 120s build time for PGVector (with pgvector HNSW), whereas standalone vector DBs construct index in 45s. Latency vs Recall rate shows standalone DBs maintaining 99% recall at 15ms latency, whereas SQL-based extensions hit 92% recall at similar latency unless resource allocations are highly tuned."
        },
        {
            "title": f"Comparative Vector Indexes at Scale",
            "url": "https://vectorsearch.internal/benchmarks-comparison",
            "snippet": "In-depth review of vector database capabilities and memory requirements for HNSW, IVF, and Flat indexes.",
            "content": "PGVector HNSW memory usage is roughly 1.5x the size of the vectors. Milvus/Pinecone utilize customized segment structures, showing memory consumption of roughly 1.2x. Setup for SQL extension is zero overhead if Postgres is already running, whereas standalone DBs require independent clusters."
        }
    ]
    add_log("Researcher", "completed", "Information extraction complete. Forwarding factual findings to Writer.")
    state["active_agent"] = "Writer"
    yield json.dumps(state)
    await asyncio.sleep(2.0)

    # --- 3. WRITER DRAFTING (ITERATION 1) ---
    add_log("Writer", "drafting", "Structuring initial draft report...")
    yield json.dumps(state)
    await asyncio.sleep(2.0)

    draft_1 = (
        f"# Technical Analysis Report: {query}\n\n"
        "## Executive Summary\n"
        f"This report compares technologies under the query '{query}' based on live scraped benchmarks. "
        "We evaluate architecture, query latencies, and resource efficiency.\n\n"
        "## Architectural Analysis\n"
        "One candidate integrates as a native relational extension (e.g. PGVector within Postgres), "
        "allowing SQL joins. The other candidate runs as a dedicated cloud-native cluster (e.g. Milvus/Qdrant).\n\n"
        "## Performance Comparison\n"
        "- **Index Build Time**: Postgres PGVector builds an HNSW index in 120 seconds. Standalone DBs build in 45 seconds.\n"
        "- **QPS & Recall**: Standalone databases reach 99% recall. Relational options are slightly slower.\n"
    )
    state["draft_report"] = draft_1
    add_log("Writer", "completed", "First draft compiled. Submitting to Fact-Checker for verification.")
    state["active_agent"] = "Fact-Checker"
    yield json.dumps(state)
    await asyncio.sleep(2.5)

    # --- 4. FACT-CHECKER CHECKS (ITERATION 1 - FLAG ERRORS) ---
    add_log("Fact-Checker", "checking", "Verifying quantitative metrics in draft against raw scraped content...")
    yield json.dumps(state)
    await asyncio.sleep(3.0)

    fact_details_1 = (
        "ERRORS FOUND:\n"
        "- Paragraph 2 states 'Relational options are slightly slower' without providing the precise QPS or latency numbers (e.g. 15ms latency benchmarks) present in Source [1].\n"
        "- Mention of 'Pinecone' is in the source but completely omitted in draft architecture."
    )
    state["fact_check_results"].append({
        "iteration": 1,
        "details": fact_details_1
    })
    add_log("Fact-Checker", "completed", "Factual gaps identified. Routing draft back to Writer for adjustments.")
    state["active_agent"] = "Writer"
    yield json.dumps(state)
    await asyncio.sleep(2.0)

    # --- 5. WRITER RE-DRAFTS (ITERATION 2 - FIX FACT-CHECK ERRORS) ---
    add_log("Writer", "drafting", "Refining metrics and addressing Fact-Checker feedback...")
    yield json.dumps(state)
    await asyncio.sleep(2.5)

    draft_2 = (
        f"# Technical Analysis Report: {query}\n\n"
        "## Executive Summary\n"
        f"This report compares technologies under the query '{query}' based on live scraped benchmarks. "
        "We evaluate architecture, query latencies, and resource efficiency.\n\n"
        "## Architectural Analysis\n"
        "We analyze PGVector (PostgreSQL extension) and Milvus (a cloud-native standalone vector database). "
        "Pinecone is also noted as an alternative managed solution.\n\n"
        "## Performance Comparison\n"
        "- **Index Build Time**: PGVector builds HNSW in 120s, whereas Milvus does it in 45s due to parallel indexing.\n"
        "- **Latency & Recall**: Milvus achieves 99% recall at 15ms query latency under load. "
        "PGVector achieves 92% recall under similar workloads unless cache size is tuned to equal the index size."
    )
    state["draft_report"] = draft_2
    add_log("Writer", "completed", "Revised draft submitted to Fact-Checker.")
    state["active_agent"] = "Fact-Checker"
    yield json.dumps(state)
    await asyncio.sleep(2.0)

    # --- 6. FACT-CHECKER CHECKS (ITERATION 2 - PASS) ---
    add_log("Fact-Checker", "checking", "Re-checking updated metrics against source data...")
    yield json.dumps(state)
    await asyncio.sleep(2.0)

    fact_details_2 = "VERIFIED: All claims are fully aligned with raw search sources."
    state["fact_check_results"].append({
        "iteration": 2,
        "details": fact_details_2
    })
    add_log("Fact-Checker", "completed", "Report verified. Submitting draft to Lead Critic for editorial review.")
    state["active_agent"] = "Critic"
    yield json.dumps(state)
    await asyncio.sleep(2.0)

    # --- 7. CRITIC REVIEW (ITERATION 1 - AWAIT USER REVIEW) ---
    add_log("Critic", "reviewing", "Analyzing report readability, structure, and depth...")
    yield json.dumps(state)
    await asyncio.sleep(2.5)

    if queue:
        # Pause execution and await human review
        state["active_agent"] = "Critic"
        state["awaiting_review"] = True
        add_log("Critic", "completed", "Critic audit completed. Awaiting Human Editor review...")
        yield json.dumps(state)
        
        user_msg_str = await queue.get()
        user_msg = json.loads(user_msg_str) if isinstance(user_msg_str, str) else user_msg_str
        feedback = user_msg.get("feedback", "")
        
        state["awaiting_review"] = False
        
        if feedback.lower() == "approve":
            add_log("Critic", "completed", "User approved the report! Publishing final output.")
            state["final_report"] = draft_2
            state["active_agent"] = "Finalize"
            yield json.dumps(state)
            await asyncio.sleep(1.0)
            return
        else:
            # Revision loop!
            add_log("Critic", "completed", f"User requested revisions: '{feedback}'. Routing back to Writer.")
            state["critic_feedback"] = feedback
            state["active_agent"] = "Writer"
            yield json.dumps(state)
            await asyncio.sleep(2.0)
    else:
        # Fallback autonomous mock routing
        critic_feedback_1 = "REVISION NEEDED: Please add comparative table and Recommendations."
        state["critic_feedback"] = critic_feedback_1
        add_log("Critic", "completed", "Revisions requested. Routing back to Writer to add comparative tables.")
        state["active_agent"] = "Writer"
        yield json.dumps(state)
        await asyncio.sleep(2.0)
        feedback = "Please add comparative table."

    # --- 8. WRITER RE-DRAFTS (ITERATION 3 - ADD TABLES & RECOMMENDATIONS) ---
    add_log("Writer", "drafting", "Constructing data comparison matrices and incorporating editor revisions...")
    yield json.dumps(state)
    await asyncio.sleep(3.0)

    draft_3 = (
        f"# Technical Analysis Report: {query}\n\n"
        "## Executive Summary\n"
        f"This report compares technologies under the query '{query}' based on live scraped benchmarks. "
        "We evaluate architecture, query latencies, and resource efficiency.\n\n"
        "## Architectural Analysis\n"
        "- **PGVector**: Runs inside PostgreSQL. Perfect for monolithic architectures already using Postgres. "
        "Allows direct vector joins with relational business tables in SQL.\n"
        "- **Milvus**: A microservices-oriented standalone database. Scalable horizontally, uses dedicated storage "
        "and compute nodes, ideal for high-volume, multi-million vector systems.\n\n"
        "## Performance Metrics (1M Scale, 1536-dim)\n\n"
        "| Metric | PGVector (Postgres) | Milvus (Standalone) |\n"
        "| :--- | :--- | :--- |\n"
        "| **Index Type** | HNSW / IVFFlat | HNSW / IVF_FLAT / DiskANN |\n"
        "| **Index Build Time** | ~120 seconds | ~45 seconds (Parallelized) |\n"
        "| **Query Recall Rate** | 92% | 99% |\n"
        "| **Query Latency** | 22ms | 15ms |\n"
        "| **Memory Footprint** | 1.5x Index Size | 1.2x Index Size |\n\n"
        "## Recommendations\n"
        "1. **Use PGVector if**: You already run PostgreSQL, have less than 5M vectors, and need relational integration.\n"
        "2. **Use Milvus if**: You require high QPS under concurrent load, need >=99% recall, and manage 10M+ vectors.\n\n"
        f"--- \n"
        f"*Note: Draft updated to address editor request: '{feedback}'*"
    )
    state["draft_report"] = draft_3
    state["critic_feedback"] = None # Cleared
    add_log("Writer", "completed", "Fitted comparative tables. Resubmitting to Editor/Critic.")
    state["active_agent"] = "Critic"
    yield json.dumps(state)
    await asyncio.sleep(2.0)

    # --- 9. CRITIC REVIEW (ITERATION 2 - FINAL APPROVAL) ---
    add_log("Critic", "reviewing", "Re-reviewing markdown tables and final structures...")
    yield json.dumps(state)
    await asyncio.sleep(2.0)

    if queue:
        state["active_agent"] = "Critic"
        state["awaiting_review"] = True
        add_log("Critic", "completed", "Revised draft ready. Awaiting final human approval...")
        yield json.dumps(state)
        
        user_msg_str = await queue.get()
        state["awaiting_review"] = False

    add_log("Critic", "completed", "Report formatting and technical depth approved. Publishing final research report.")
    state["final_report"] = draft_3
    state["active_agent"] = "Finalize"
    yield json.dumps(state)
    await asyncio.sleep(1.0)
