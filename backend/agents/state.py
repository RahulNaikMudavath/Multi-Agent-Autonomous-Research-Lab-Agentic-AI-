from typing import TypedDict, List, Dict, Any, Optional

class AgentState(TypedDict):
    query: str
    research_plan: Optional[str]
    research_results: List[Dict[str, Any]]
    research_synthesis: Optional[str]
    fact_check_results: List[Dict[str, Any]]
    draft_report: Optional[str]
    critic_feedback: Optional[str]
    final_report: Optional[str]
    logs: List[Dict[str, Any]]
    active_agent: Optional[str]
    awaiting_review: Optional[bool]

