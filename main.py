from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
import sqlite3
import json
import time
import uuid
import asyncio
import httpx
from contextlib import contextmanager

app = FastAPI(title="AgentLens API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_PATH = "agentlens.db"
GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent"

# ─── DB Setup ────────────────────────────────────────────────────────────────

def init_db():
    with sqlite3.connect(DB_PATH) as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS events (
            id TEXT PRIMARY KEY,
            session_id TEXT,
            agent_name TEXT,
            action TEXT,
            input TEXT,
            output TEXT,
            confidence REAL,
            timestamp REAL,
            metadata TEXT
        );
        CREATE TABLE IF NOT EXISTS incidents (
            id TEXT PRIMARY KEY,
            session_id TEXT,
            detected_at REAL,
            root_cause_agent TEXT,
            reason TEXT,
            confidence REAL,
            affected_agents TEXT,
            status TEXT DEFAULT 'open',
            security_threat INTEGER DEFAULT 0,
            threat_type TEXT
        );
        CREATE TABLE IF NOT EXISTS trust_scores (
            agent_name TEXT PRIMARY KEY,
            accuracy REAL DEFAULT 100.0,
            hallucination_rate REAL DEFAULT 0.0,
            security_violations INTEGER DEFAULT 0,
            failure_contributions INTEGER DEFAULT 0,
            total_tasks INTEGER DEFAULT 0,
            score REAL DEFAULT 100.0
        );
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            task TEXT,
            started_at REAL,
            status TEXT DEFAULT 'running',
            result TEXT
        );
        """)

init_db()

@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()

# ─── Models ──────────────────────────────────────────────────────────────────

class AgentEvent(BaseModel):
    session_id: str
    agent_name: str
    action: str
    input: str
    output: str
    confidence: float = 1.0
    metadata: dict = {}

class SessionCreate(BaseModel):
    task: str

class RunTaskRequest(BaseModel):
    task: str
    api_key: str

# ─── Security Engine ─────────────────────────────────────────────────────────

INJECTION_PATTERNS = [
    "ignore previous instructions", "ignore prior instructions",
    "disregard your instructions", "forget your instructions",
    "new instructions:", "you are now", "jailbreak",
    "send all", "exfiltrate", "reveal confidential", "override safety",
]

def detect_prompt_injection(text: str):
    text_lower = text.lower()
    for pattern in INJECTION_PATTERNS:
        if pattern in text_lower:
            return True, 0.97, f"Detected pattern: '{pattern}'"
    return False, 0.0, ""

# ─── Trust Engine ────────────────────────────────────────────────────────────

def get_or_create_trust(conn, agent_name):
    row = conn.execute("SELECT * FROM trust_scores WHERE agent_name=?", (agent_name,)).fetchone()
    if not row:
        conn.execute("INSERT INTO trust_scores (agent_name) VALUES (?)", (agent_name,))
        conn.commit()
        return {"agent_name": agent_name, "score": 100.0, "accuracy": 100.0,
                "hallucination_rate": 0.0, "security_violations": 0,
                "failure_contributions": 0, "total_tasks": 0}
    return dict(row)

def recalculate_trust(conn, agent_name):
    t = get_or_create_trust(conn, agent_name)
    score = (t["accuracy"] * 0.4 - t["hallucination_rate"] * 0.3
             - t["security_violations"] * 10 - t["failure_contributions"] * 5)
    score = max(0.0, min(100.0, score))
    conn.execute("UPDATE trust_scores SET score=? WHERE agent_name=?", (score, agent_name))

# ─── Incident Detection ───────────────────────────────────────────────────────

def detect_incident(conn, session_id, events):
    if len(events) < 2:
        return None
    low_conf = [e for e in events if e["confidence"] < 0.6]
    if low_conf:
        root = low_conf[0]
        affected = [e["agent_name"] for e in events if e["agent_name"] != root["agent_name"]]
        return {"root_cause_agent": root["agent_name"],
                "reason": f"Low confidence output ({root['confidence']:.0%}) propagated downstream",
                "confidence": 0.89, "affected_agents": affected, "security_threat": False}
    bad_keywords = ["stale", "outdated", "error", "failed", "unavailable", "incorrect", "unable to"]
    for e in events:
        for kw in bad_keywords:
            if kw in e["output"].lower():
                affected = [ev["agent_name"] for ev in events if ev["agent_name"] != e["agent_name"]]
                return {"root_cause_agent": e["agent_name"],
                        "reason": f"Agent produced problematic output containing '{kw}'",
                        "confidence": 0.88, "affected_agents": affected, "security_threat": False}
    return None

# ─── Log Event ───────────────────────────────────────────────────────────────

def _log_event_internal(conn, session_id, agent_name, action, inp, out, confidence=1.0, metadata=None):
    eid = str(uuid.uuid4())
    ts = time.time()
    is_injection, threat_conf, threat_detail = detect_prompt_injection(out)
    is_injection_in = detect_prompt_injection(inp)[0]
    security_flag = is_injection or is_injection_in

    conn.execute(
        "INSERT INTO events VALUES (?,?,?,?,?,?,?,?,?)",
        (eid, session_id, agent_name, action, inp, out, confidence, ts, json.dumps(metadata or {}))
    )
    get_or_create_trust(conn, agent_name)
    conn.execute("UPDATE trust_scores SET total_tasks = total_tasks + 1 WHERE agent_name=?", (agent_name,))
    recalculate_trust(conn, agent_name)

    all_events = [dict(e) for e in conn.execute(
        "SELECT * FROM events WHERE session_id=? ORDER BY timestamp", (session_id,)).fetchall()]

    if security_flag:
        iid = str(uuid.uuid4())
        conn.execute("INSERT INTO incidents VALUES (?,?,?,?,?,?,?,?,?,?)",
            (iid, session_id, ts, agent_name, f"Prompt injection: {threat_detail}",
             threat_conf, json.dumps([]), "contained", 1, "prompt_injection"))
        conn.execute("UPDATE trust_scores SET security_violations = security_violations + 1 WHERE agent_name=?", (agent_name,))
        recalculate_trust(conn, agent_name)
    else:
        incident_data = detect_incident(conn, session_id, all_events)
        if incident_data:
            existing = conn.execute(
                "SELECT id FROM incidents WHERE session_id=? AND security_threat=0", (session_id,)).fetchone()
            if not existing:
                iid = str(uuid.uuid4())
                conn.execute("INSERT INTO incidents VALUES (?,?,?,?,?,?,?,?,?,?)",
                    (iid, session_id, ts, incident_data["root_cause_agent"],
                     incident_data["reason"], incident_data["confidence"],
                     json.dumps(incident_data["affected_agents"]), "investigating", 0, None))
                conn.execute(
                    "UPDATE trust_scores SET failure_contributions = failure_contributions + 1 WHERE agent_name=?",
                    (incident_data["root_cause_agent"],))
                recalculate_trust(conn, incident_data["root_cause_agent"])

    conn.commit()
    return eid, security_flag

# ─── Gemini API Call ─────────────────────────────────────────────────────────

async def call_gemini(api_key: str, system: str, user: str) -> tuple[str, float]:
    prompt = f"{system}\n\nTask: {user}"
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{GEMINI_API_URL}?key={api_key}",
            headers={"Content-Type": "application/json"},
            json={
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {"maxOutputTokens": 400, "temperature": 0.7}
            }
        )
        if resp.status_code != 200:
            raise Exception(f"Gemini API error {resp.status_code}: {resp.text[:200]}")
        data = resp.json()
        text = data["candidates"][0]["content"]["parts"][0]["text"]

        # Infer confidence from content
        confidence = 0.93
        lower = text.lower()
        if any(w in lower for w in ["unable", "cannot", "error", "failed", "stale", "outdated"]):
            confidence = 0.45
        elif any(w in lower for w in ["uncertain", "unclear", "missing", "incomplete"]):
            confidence = 0.58

        return text, confidence

# ─── Agent Definitions ────────────────────────────────────────────────────────

AGENTS = [
    {
        "name": "Planner Agent",
        "action": "decompose_task",
        "system": "You are a Planner Agent in an AI agent swarm. Break down the user task into 3-5 clear subtasks for other agents. Be concise and specific. Format as: 'Subtasks: [task1, task2, ...]' then a brief strategy. Be realistic."
    },
    {
        "name": "Research Agent",
        "action": "gather_information",
        "system": "You are a Research Agent. Based on the plan, gather and synthesize relevant information. Provide realistic data, prices, availability, or facts. Mention data sources and freshness. Be specific with numbers and details. Occasionally note data quality concerns."
    },
    {
        "name": "Validator Agent",
        "action": "validate_data",
        "system": "You are a Validator Agent. Critically review the research data for: freshness, reliability, completeness, consistency. Sometimes flag issues like stale data or missing info. Output your validation status and any concerns clearly."
    },
    {
        "name": "Execution Agent",
        "action": "execute_task",
        "system": "You are an Execution Agent. Based on all previous agent outputs, execute the final action and provide a concrete result. If previous agents flagged issues, reflect that in your output. Be specific — give confirmations, IDs, prices, or failure reasons."
    }
]

# ─── SSE Task Runner ─────────────────────────────────────────────────────────

async def run_task_stream(task: str, api_key: str):
    sid = str(uuid.uuid4())

    with get_db() as conn:
        conn.execute("INSERT INTO sessions VALUES (?,?,?,?,?)",
                     (sid, task, time.time(), "running", None))

    yield f"data: {json.dumps({'type': 'session_start', 'session_id': sid, 'task': task})}\n\n"

    previous_output = task
    all_outputs = []

    for agent in AGENTS:
        yield f"data: {json.dumps({'type': 'agent_start', 'agent': agent['name'], 'action': agent['action']})}\n\n"

        try:
            user_prompt = f"Original task: {task}\n\nPrevious agent outputs:\n{chr(10).join(all_outputs) if all_outputs else 'None yet'}\n\nProcess this: {previous_output}"
            output, confidence = await call_gemini(api_key, agent["system"], user_prompt)
        except Exception as e:
            output = f"Agent encountered an issue: {str(e)}"
            confidence = 0.3

        with get_db() as conn:
            eid, security_flag = _log_event_internal(
                conn, sid, agent["name"], agent["action"],
                previous_output, output, confidence
            )
            incidents = [dict(i) for i in conn.execute(
                "SELECT * FROM incidents WHERE session_id=?", (sid,)).fetchall()]
            trust = [dict(t) for t in conn.execute("SELECT * FROM trust_scores").fetchall()]

        all_outputs.append(f"[{agent['name']}]: {output}")
        previous_output = output

        yield f"data: {json.dumps({'type': 'agent_done', 'agent': agent['name'], 'output': output, 'confidence': confidence, 'security_flag': security_flag, 'incidents': incidents, 'trust': trust})}\n\n"
        await asyncio.sleep(0.3)

    # Determine final status
    with get_db() as conn:
        inc = [dict(i) for i in conn.execute("SELECT * FROM incidents WHERE session_id=?", (sid,)).fetchall()]

    if inc:
        has_security = any(i["security_threat"] for i in inc)
        final_status = "blocked" if has_security else "failed"
    else:
        final_status = "completed"

    with get_db() as conn:
        conn.execute("UPDATE sessions SET status=?, result=? WHERE id=?",
                     (final_status, previous_output[:500], sid))

    yield f"data: {json.dumps({'type': 'complete', 'session_id': sid, 'status': final_status, 'result': previous_output})}\n\n"

# ─── Routes ───────────────────────────────────────────────────────────────────

@app.post("/run")
async def run_task(body: RunTaskRequest):
    return StreamingResponse(
        run_task_stream(body.task, body.api_key),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    )

@app.post("/events")
def log_event(event: AgentEvent):
    with get_db() as conn:
        eid, security_flag = _log_event_internal(
            conn, event.session_id, event.agent_name, event.action,
            event.input, event.output, event.confidence, event.metadata
        )
    return {"event_id": eid, "security_flag": security_flag}

@app.get("/sessions")
def list_sessions():
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM sessions ORDER BY started_at DESC").fetchall()
    return [dict(r) for r in rows]

@app.get("/sessions/{session_id}")
def get_session(session_id: str):
    with get_db() as conn:
        session = conn.execute("SELECT * FROM sessions WHERE id=?", (session_id,)).fetchone()
        events = conn.execute("SELECT * FROM events WHERE session_id=? ORDER BY timestamp", (session_id,)).fetchall()
        incidents = conn.execute("SELECT * FROM incidents WHERE session_id=?", (session_id,)).fetchall()
    if not session:
        raise HTTPException(404, "Session not found")
    return {"session": dict(session), "events": [dict(e) for e in events], "incidents": [dict(i) for i in incidents]}

@app.get("/trust")
def get_trust_scores():
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM trust_scores ORDER BY score DESC").fetchall()
    return [dict(r) for r in rows]

@app.get("/incidents")
def get_all_incidents():
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM incidents ORDER BY detected_at DESC").fetchall()
    return [dict(r) for r in rows]

@app.get("/dashboard")
def dashboard_summary():
    with get_db() as conn:
        total_sessions = conn.execute("SELECT COUNT(*) FROM sessions").fetchone()[0]
        total_events = conn.execute("SELECT COUNT(*) FROM events").fetchone()[0]
        total_incidents = conn.execute("SELECT COUNT(*) FROM incidents").fetchone()[0]
        security_threats = conn.execute("SELECT COUNT(*) FROM incidents WHERE security_threat=1").fetchone()[0]
        trust_scores = [dict(r) for r in conn.execute("SELECT * FROM trust_scores ORDER BY score DESC").fetchall()]
        recent_incidents = [dict(r) for r in conn.execute("SELECT * FROM incidents ORDER BY detected_at DESC LIMIT 5").fetchall()]
    return {"total_sessions": total_sessions, "total_events": total_events,
            "total_incidents": total_incidents, "security_threats": security_threats,
            "trust_scores": trust_scores, "recent_incidents": recent_incidents}

@app.delete("/reset")
def reset_all():
    with get_db() as conn:
        conn.executescript("DELETE FROM events; DELETE FROM incidents; DELETE FROM trust_scores; DELETE FROM sessions;")
    return {"ok": True}
