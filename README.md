
# AgentLens 🔍

> **The Trust, Security & Observability Platform for Autonomous AI Agents**

AgentLens is an open-source monitoring and incident investigation platform built for multi-agent AI systems. As AI agents become more autonomous — browsing the web, querying databases, making decisions, and executing actions — organizations need visibility into what went wrong, which agent caused it, and how to fix it. AgentLens solves exactly that.

Think of it as **Datadog + Sentry + Git Blame**, but built specifically for AI agent swarms.

---

## 🎯 The Problem

Modern AI agent pipelines are powerful but opaque. When a multi-agent task fails, you're left asking:

- Which agent caused the failure?
- Was it a hallucination or bad data?
- Was it a security attack (prompt injection)?
- How do we prevent it next time?

Without observability, debugging AI agents is guesswork.

---

## ✅ What AgentLens Does

| Feature | Description |
|--------|-------------|
| ✈️ **Flight Recorder** | Logs every agent action, input, output, confidence score, and timestamp in real time |
| 🔴 **Blame Graph** | Visually identifies which agent in the pipeline caused the failure — like Git blame for AI |
| 🔒 **Prompt Injection Detection** | Automatically detects and quarantines prompt injection attacks before they spread |
| 📊 **Trust Score Engine** | Dynamic reputation scores per agent based on accuracy, failures, and security violations |
| 🔎 **Root Cause Investigation** | Automatically traces failures back to their origin with confidence scores |
| 🩺 **Recommendations** | Suggests fixes after every incident |
| 🔄 **Session History** | Full audit trail of every task ever run through the system |

---

## 🏗️ Architecture

```
User Types Task
      │
      ▼
AgentLens Platform
      │
      ├── Planner Agent    → Breaks task into subtasks
      ├── Research Agent   → Gathers information
      ├── Validator Agent  → Checks data quality
      └── Execution Agent  → Performs final action
      │
      ▼
Flight Recorder logs every action
      │
      ▼
Incident Detection Engine
      │
      ├── Root Cause identified
      ├── Blame Graph generated
      ├── Trust Scores updated
      └── Recommendations surfaced
```

AgentLens sits **outside** your agent swarm and observes everything. Any agent framework — CrewAI, LangGraph, AutoGen, or custom — can plug in with a single API call.

---

## 🚀 Features in Detail

### Flight Recorder
Every agent action is logged with full context — what it received, what it output, its confidence level, and when it ran. Nothing is lost. If something goes wrong, you have the complete picture.

### Blame Graph
Instead of a generic "Task Failed" message, AgentLens generates a visual pipeline showing exactly which agent introduced the failure. The red node is the root cause. Downstream agents affected by it are highlighted in orange.

### Prompt Injection Detection
When an agent reads from an untrusted source (a website, a user message, an external API), AgentLens scans the content for injection patterns. If detected, the agent is quarantined, the malicious instruction is stripped, and the incident is logged with a 97% confidence score.

### Trust Score Engine
Every agent maintains a dynamic trust score (0–100) updated after each action:
- **Accuracy** — how often the agent produces correct outputs
- **Hallucination Rate** — how often it invents information
- **Security Violations** — prompt injection exposure count
- **Failure Contributions** — how often it causes downstream failures

### Root Cause Investigation
AgentLens automatically reconstructs the execution chain and identifies the origin of failure. Each incident includes a reason, confidence score, list of affected agents, and recommended fix.

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, CSS-in-JS |
| Backend | Python, FastAPI |
| Database | SQLite |
| AI Agents | Gemini / Groq API |
| Streaming | Server-Sent Events (SSE) |
| HTTP | httpx (async) |

---

## 📁 Project Structure

```
agentlens/
├── backend/
│   ├── main.py              ← FastAPI server, all core logic
│   └── requirements.txt
├── frontend/
│   ├── public/
│   │   └── index.html
│   └── src/
│       ├── App.jsx          ← Full React dashboard
│       └── index.js
└── agents/
    └── demo_swarm.py        ← Scripted demo scenarios
```

---

## ⚙️ Setup & Installation

### Prerequisites
- Python 3.9+
- Node.js 16+
- A free Groq API key → [console.groq.com](https://console.groq.com)

### Terminal 1 — Backend
```bash
cd agentlens/backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Terminal 2 — Frontend
```bash
cd agentlens/frontend
npm install
npm start
```

Dashboard opens at **http://localhost:3000**

---

## 🎮 How to Use

1. Open the dashboard at `localhost:3000`
2. Go to the **▶ Run Task** tab
3. Type any task — flight booking, invoice processing, hotel search, inventory management
4. Paste your API key and click **Launch Agent Swarm**
5. Watch 4 AI agents collaborate in real time
6. See incidents, blame graphs, and trust scores update live
7. Go to **Session Detail** to inspect the full execution trace

---

## 🔌 Integrating Your Own Agents

Any agent can report to AgentLens with one API call:

```python
import requests

requests.post("http://localhost:8000/events", json={
    "session_id": "your-session-id",
    "agent_name": "My Custom Agent",
    "action": "search_web",
    "input": "Find cheapest flights",
    "output": "Found 3 results...",
    "confidence": 0.92,
    "metadata": {"source": "google"}
})
```

AgentLens handles everything else — incident detection, trust scoring, blame graph, security scanning.

---

## 📡 API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/run` | Run a task through the AI agent swarm |
| `POST` | `/events` | Log a single agent event |
| `GET` | `/sessions` | List all sessions |
| `GET` | `/sessions/{id}` | Get full session detail |
| `GET` | `/dashboard` | Summary stats |
| `GET` | `/trust` | All agent trust scores |
| `GET` | `/incidents` | All incidents |
| `DELETE` | `/reset` | Reset database |

Full interactive API docs at **http://localhost:8000/docs**

---

## 🔮 Roadmap

- [ ] Self-healing engine — automatically retries failed tasks with improved agent prompts
- [ ] Multi-framework support — native plugins for CrewAI, LangGraph, AutoGen
- [ ] Alert system — Slack/email notifications on incidents
- [ ] Custom agent definitions — define your own agent pipeline via config
- [ ] Exportable reports — PDF incident reports for stakeholders
- [ ] Cloud deployment — one-click deploy to AWS/GCP

---

## 💡 Use Cases

- **Enterprise AI pipelines** — monitor production agent workflows
- **Research** — study agent failure modes and hallucination patterns
- **Security teams** — detect and prevent prompt injection attacks
- **Developers** — debug multi-agent systems during development
- **Hackathons** — demonstrate trustworthy AI agent infrastructure

---



<div align="center">
  <strong>AgentLens — Because autonomous AI needs a black box.</strong>
</div>
