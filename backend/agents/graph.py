from langgraph.graph import StateGraph, END
from backend.agents.state import AgentState
from backend.agents.nodes import (
    coordinator_node,
    researcher_node,
    writer_node,
    fact_checker_node,
    critic_node
)

def route_fact_checker(state: AgentState):
    # Returns the name of the next node based on active_agent set in state
    next_agent = state.get("active_agent")
    if next_agent == "Writer":
        return "writer"
    return "critic"

def route_critic(state: AgentState):
    next_agent = state.get("active_agent")
    if next_agent == "Writer":
        return "writer"
    return END

# Build the state graph
workflow = StateGraph(AgentState)

# Add nodes
workflow.add_node("coordinator", coordinator_node)
workflow.add_node("researcher", researcher_node)
workflow.add_node("writer", writer_node)
workflow.add_node("fact_checker", fact_checker_node)
workflow.add_node("critic", critic_node)

# Set starting node
workflow.set_entry_point("coordinator")

# Establish structural edges
workflow.add_edge("coordinator", "researcher")
workflow.add_edge("researcher", "writer")
workflow.add_edge("writer", "fact_checker")

# Establish conditional edges for loops
workflow.add_conditional_edges(
    "fact_checker",
    route_fact_checker,
    {
        "writer": "writer",
        "critic": "critic"
    }
)

workflow.add_conditional_edges(
    "critic",
    route_critic,
    {
        "writer": "writer",
        END: END
    }
)

# Compile the workflow
graph = workflow.compile()
