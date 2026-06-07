import { useState, useEffect, useCallback, useRef } from "react";

const API = "http://localhost:8000";

const C = {
  bg: "#0a0e1a", surface: "#111827", surfaceHi: "#1a2235",
  border: "#1e2d47", accent: "#00d4ff", accentDim: "#0090b3",
  green: "#00e5a0", red: "#ff4d6d", orange: "#ff9f43",
  yellow: "#ffd32a", text: "#e2e8f0", muted: "#64748b", purple: "#a78bfa",
};

const fmt_time = (ts) => new Date(ts * 1000).toLocaleTimeString("en-IN", { hour12: false });
const trust_color = (s) => s >= 85 ? C.green : s >= 65 ? C.yellow : C.red;
const status_color = (s) => ({ running: C.accent, completed: C.green, failed: C.red, blocked: C.orange, investigating: C.yellow, contained: C.purple, open: C.red })[s] || C.muted;

const Badge = ({ children, color = C.accent }) => (
  <span style={{ background: color + "22", border: `1px solid ${color}44`, color, fontSize: 11, padding: "2px 8px", borderRadius: 4, fontFamily: "monospace", letterSpacing: 1, textTransform: "uppercase" }}>{children}</span>
);

const Card = ({ children, style = {} }) => (
  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, ...style }}>{children}</div>
);

const StatBox = ({ label, value, color = C.accent }) => (
  <Card style={{ textAlign: "center" }}>
    <div style={{ color, fontSize: 36, fontWeight: 800, fontFamily: "monospace" }}>{value}</div>
    <div style={{ color: C.muted, fontSize: 12, marginTop: 4, letterSpacing: 1, textTransform: "uppercase" }}>{label}</div>
  </Card>
);

// ─── Blame Graph ──────────────────────────────────────────────────────────────
function BlameGraph({ events, incidents }) {
  if (!events || events.length === 0)
    return <div style={{ color: C.muted, textAlign: "center", padding: 40 }}>No events yet</div>;

  const agents = [...new Set(events.map(e => e.agent_name))];
  const rootCause = incidents?.[0]?.root_cause_agent;
  const affected = incidents?.[0] ? JSON.parse(incidents[0].affected_agents || "[]") : [];
  const isSecThreat = incidents?.[0]?.security_threat;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0, padding: "20px 0" }}>
      {agents.map((agent, i) => {
        const isRoot = agent === rootCause;
        const isAffected = affected.includes(agent);
        const agentEvents = events.filter(e => e.agent_name === agent);
        const lastEvent = agentEvents[agentEvents.length - 1];
        const conf = lastEvent?.confidence ?? 1;
        let nodeColor = C.green;
        if (isRoot) nodeColor = isSecThreat ? C.purple : C.red;
        else if (isAffected) nodeColor = C.orange;

        return (
          <div key={agent} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            {i > 0 && <div style={{ width: 2, height: 32, background: `linear-gradient(to bottom, ${C.border}, ${nodeColor})` }} />}
            <div style={{ background: C.surfaceHi, border: `2px solid ${nodeColor}`, borderRadius: 12, padding: "14px 28px", minWidth: 240, boxShadow: `0 0 20px ${nodeColor}33`, position: "relative" }}>
              {isRoot && (
                <div style={{ position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)", background: isSecThreat ? C.purple : C.red, color: "#fff", fontSize: 10, padding: "2px 10px", borderRadius: 10, fontWeight: 700, whiteSpace: "nowrap" }}>
                  {isSecThreat ? "⚠ INJECTION SOURCE" : "🔴 ROOT CAUSE"}
                </div>
              )}
              <div style={{ color: nodeColor, fontWeight: 700, fontSize: 14 }}>{agent}</div>
              <div style={{ color: C.muted, fontSize: 11, marginTop: 4 }}>
                {agentEvents.length} action{agentEvents.length !== 1 ? "s" : ""} · Confidence: {(conf * 100).toFixed(0)}%
              </div>
              {lastEvent && (
                <div style={{ color: C.muted, fontSize: 11, marginTop: 6, borderTop: `1px solid ${C.border}`, paddingTop: 6, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {lastEvent.output.slice(0, 60)}…
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Trust Panel ──────────────────────────────────────────────────────────────
function TrustPanel({ scores }) {
  if (!scores || scores.length === 0)
    return <div style={{ color: C.muted, textAlign: "center", padding: 20 }}>No agents tracked yet</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {scores.map(agent => {
        const sc = Math.round(agent.score);
        const color = trust_color(sc);
        return (
          <div key={agent.agent_name} style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ color: C.text, fontWeight: 600, fontSize: 13 }}>{agent.agent_name}</span>
              <span style={{ color, fontWeight: 800, fontSize: 18, fontFamily: "monospace" }}>{sc}</span>
            </div>
            <div style={{ background: C.border, borderRadius: 4, height: 6, overflow: "hidden" }}>
              <div style={{ width: `${sc}%`, height: "100%", background: `linear-gradient(to right, ${color}88, ${color})`, borderRadius: 4, transition: "width 0.5s ease" }} />
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 8, fontSize: 11, color: C.muted }}>
              <span>Tasks: {agent.total_tasks}</span>
              <span style={{ color: agent.security_violations > 0 ? C.red : C.muted }}>Sec: {agent.security_violations}</span>
              <span style={{ color: agent.failure_contributions > 0 ? C.orange : C.muted }}>Fails: {agent.failure_contributions}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Event Log ────────────────────────────────────────────────────────────────
function EventLog({ events }) {
  if (!events || events.length === 0)
    return <div style={{ color: C.muted, padding: 16, textAlign: "center" }}>No events yet</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 400, overflowY: "auto" }}>
      {[...events].reverse().map(ev => (
        <div key={ev.id} style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", fontSize: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ color: C.accent, fontWeight: 600 }}>{ev.agent_name}</span>
            <span style={{ color: C.muted }}>{fmt_time(ev.timestamp)}</span>
          </div>
          <div style={{ color: C.muted, marginBottom: 4 }}>Action: <span style={{ color: C.text }}>{ev.action}</span></div>
          <div style={{ color: C.muted, marginBottom: 4 }}>
            Out: <span style={{ color: ev.confidence < 0.6 ? C.orange : C.text }}>{ev.output.slice(0, 120)}{ev.output.length > 120 ? "…" : ""}</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <span style={{ color: C.muted }}>Confidence:</span>
            <span style={{ color: trust_color(ev.confidence * 100), fontFamily: "monospace" }}>{(ev.confidence * 100).toFixed(0)}%</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Incident Panel ───────────────────────────────────────────────────────────
function IncidentPanel({ incidents }) {
  if (!incidents || incidents.length === 0)
    return <div style={{ color: C.green, padding: 16, textAlign: "center" }}>✓ No incidents detected</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {incidents.map(inc => (
        <div key={inc.id} style={{ background: C.surfaceHi, border: `1px solid ${inc.security_threat ? C.purple : C.red}44`, borderLeft: `3px solid ${inc.security_threat ? C.purple : C.red}`, borderRadius: 8, padding: "12px 16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <Badge color={inc.security_threat ? C.purple : C.red}>{inc.security_threat ? "Security Threat" : "Incident"}</Badge>
            <Badge color={status_color(inc.status)}>{inc.status}</Badge>
          </div>
          <div style={{ color: C.text, fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Root Cause: {inc.root_cause_agent}</div>
          <div style={{ color: C.muted, fontSize: 12, marginBottom: 6 }}>{inc.reason}</div>
          <div style={{ display: "flex", gap: 16, fontSize: 11, color: C.muted }}>
            <span>Confidence: <span style={{ color: C.yellow }}>{(inc.confidence * 100).toFixed(0)}%</span></span>
            <span>{fmt_time(inc.detected_at)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Session List ─────────────────────────────────────────────────────────────
function SessionList({ sessions, selected, onSelect }) {
  if (!sessions || sessions.length === 0)
    return <div style={{ color: C.muted, padding: 16, textAlign: "center" }}>No sessions yet. Run a task!</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {sessions.map(s => (
        <div key={s.id} onClick={() => onSelect(s.id)} style={{ background: selected === s.id ? C.surfaceHi : "transparent", border: `1px solid ${selected === s.id ? C.accent + "66" : C.border}`, borderRadius: 8, padding: "10px 14px", cursor: "pointer", transition: "all 0.2s" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ color: C.text, fontSize: 13, fontWeight: 500 }}>{s.task.slice(0, 35)}{s.task.length > 35 ? "…" : ""}</span>
            <Badge color={status_color(s.status)}>{s.status}</Badge>
          </div>
          <div style={{ color: C.muted, fontSize: 11 }}>{fmt_time(s.started_at)}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Run Task Tab ─────────────────────────────────────────────────────────────
function RunTaskTab({ onSessionComplete }) {
  const [task, setTask] = useState("");
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("gemini_key") || "");
  const [showKey, setShowKey] = useState(false);
  const [running, setRunning] = useState(false);
  const [liveAgents, setLiveAgents] = useState([]);
  const [liveIncidents, setLiveIncidents] = useState([]);
  const [liveTrust, setLiveTrust] = useState([]);
  const [activeAgent, setActiveAgent] = useState(null);
  const [finalStatus, setFinalStatus] = useState(null);
  const [finalResult, setFinalResult] = useState(null);
  const started = useRef(false);

  const AGENT_ORDER = ["Planner Agent", "Research Agent", "Validator Agent", "Execution Agent"];

  const examples = [
    "Find and book cheapest flight from Hyderabad to Delhi",
    "Process invoice #INV-2024 and verify vendor details",
    "Find best hotel deals in Mumbai under ₹5000/night",
    "Handle customer complaint about delayed order #ORD-8821",
    "Analyze inventory and reorder low-stock items",
  ];

  const handleRun = async () => {
    if (!task.trim() || !apiKey.trim() || running) return;
    localStorage.setItem("gemini_key", apiKey);
    setRunning(true);
    setLiveAgents([]);
    setLiveIncidents([]);
    setLiveTrust([]);
    setActiveAgent(null);
    setFinalStatus(null);
    setFinalResult(null);
    started.current = true;

    try {
      const resp = await fetch(`${API}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: task.trim(), api_key: apiKey.trim() })
      });

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        const lines = text.split("\n").filter(l => l.startsWith("data: "));
        for (const line of lines) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "agent_start") {
              setActiveAgent(data.agent);
              setLiveAgents(prev => prev.find(a => a.name === data.agent) ? prev : [...prev, { name: data.agent, status: "running", output: null, confidence: null }]);
            } else if (data.type === "agent_done") {
              setActiveAgent(null);
              setLiveAgents(prev => prev.map(a => a.name === data.agent ? { ...a, status: data.security_flag ? "blocked" : "done", output: data.output, confidence: data.confidence } : a));
              if (data.incidents) setLiveIncidents(data.incidents);
              if (data.trust) setLiveTrust(data.trust);
            } else if (data.type === "complete") {
              setFinalStatus(data.status);
              setFinalResult(data.result);
              setActiveAgent(null);
              setRunning(false);
              onSessionComplete && onSessionComplete();
            }
          } catch { }
        }
      }
    } catch (e) {
      setFinalStatus("error");
      setRunning(false);
    }
  };

  const getAgentColor = (ag) => {
    if (!ag) return C.muted;
    const inc = liveIncidents.find(i => i.root_cause_agent === ag.name);
    if (inc?.security_threat) return C.purple;
    if (inc) return C.red;
    if (ag.status === "running") return C.accent;
    if (ag.status === "done") return ag.confidence < 0.6 ? C.orange : C.green;
    if (ag.status === "blocked") return C.purple;
    return C.muted;
  };

  return (
    <div>
      {/* Input section */}
      <Card style={{ marginBottom: 24 }}>
        <div style={{ color: C.accent, fontSize: 13, fontWeight: 700, letterSpacing: 1, marginBottom: 16 }}>LAUNCH AGENT SWARM</div>
        <textarea
          value={task}
          onChange={e => setTask(e.target.value)}
          placeholder="What task should the agents handle? e.g. Find cheapest flight to Delhi..."
          disabled={running}
          style={{ width: "100%", minHeight: 80, background: C.surfaceHi, border: `1px solid ${task ? C.accent + "66" : C.border}`, borderRadius: 8, padding: "12px 14px", color: C.text, fontSize: 14, fontFamily: "inherit", resize: "vertical", outline: "none", boxSizing: "border-box", opacity: running ? 0.6 : 1 }}
        />

        {/* Example tasks */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10, marginBottom: 14 }}>
          {examples.map((ex, i) => (
            <button key={i} onClick={() => !running && setTask(ex)} style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 10px", color: C.muted, fontSize: 11, cursor: running ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
              {ex.slice(0, 35)}…
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          <input
            type={showKey ? "text" : "password"}
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="Gemini API key (aistudio.google.com → Get API Key)"
            disabled={running}
            style={{ flex: 1, background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", color: C.text, fontSize: 13, fontFamily: "monospace", outline: "none", boxSizing: "border-box" }}
          />
          <button onClick={() => setShowKey(!showKey)} style={{ background: C.surfaceHi, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", color: C.muted, cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>{showKey ? "Hide" : "Show"}</button>
        </div>

        <button
          onClick={handleRun}
          disabled={!task.trim() || !apiKey.trim() || running}
          style={{ width: "100%", padding: "13px 0", background: task && apiKey && !running ? `linear-gradient(135deg, ${C.accent}cc, ${C.purple}cc)` : C.surfaceHi, border: `1px solid ${task && apiKey && !running ? C.accent : C.border}`, borderRadius: 8, color: task && apiKey && !running ? "#fff" : C.muted, fontSize: 14, fontWeight: 700, letterSpacing: 2, cursor: task && apiKey && !running ? "pointer" : "not-allowed", fontFamily: "inherit", textTransform: "uppercase" }}
        >
          {running ? "⟳ Agents Running…" : "▶ Launch Agent Swarm"}
        </button>
      </Card>

      {/* Live view — only shown when running or done */}
      {liveAgents.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          {/* Agent Pipeline / Blame Graph */}
          <Card>
            <div style={{ color: C.accent, fontSize: 13, fontWeight: 700, letterSpacing: 1, marginBottom: 20 }}>AGENT PIPELINE</div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              {AGENT_ORDER.map((agName, i) => {
                const ag = liveAgents.find(a => a.name === agName);
                const isActive = activeAgent === agName;
                const color = ag ? getAgentColor(ag) : C.border;
                const inc = liveIncidents.find(inc => inc.root_cause_agent === agName);

                return (
                  <div key={agName} style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
                    {i > 0 && <div style={{ width: 2, height: 28, background: ag ? color : C.border, opacity: ag ? 1 : 0.3 }} />}
                    <div style={{ width: "90%", background: C.surfaceHi, border: `2px solid ${isActive ? C.accent : ag ? color : C.border}`, borderRadius: 10, padding: "14px 18px", boxShadow: isActive ? `0 0 20px ${C.accent}44` : "none", transition: "all 0.3s", opacity: !ag ? 0.35 : 1, position: "relative" }}>
                      {isActive && <div style={{ position: "absolute", top: -10, right: 12, background: C.accent, color: "#000", fontSize: 9, padding: "2px 8px", borderRadius: 8, fontWeight: 800, letterSpacing: 1 }}>RUNNING</div>}
                      {inc && <div style={{ position: "absolute", top: -10, left: 12, background: inc.security_threat ? C.purple : C.red, color: "#fff", fontSize: 9, padding: "2px 8px", borderRadius: 8, fontWeight: 800 }}>{inc.security_threat ? "⚠ INJECTION" : "🔴 ROOT CAUSE"}</div>}
                      <div style={{ color: ag ? color : C.muted, fontWeight: 700, fontSize: 13 }}>{agName}</div>
                      {ag?.confidence != null && <div style={{ color: trust_color(ag.confidence * 100), fontSize: 11, marginTop: 2 }}>Confidence: {(ag.confidence * 100).toFixed(0)}%</div>}
                      {ag?.output && <div style={{ color: C.muted, fontSize: 11, marginTop: 8, borderTop: `1px solid ${C.border}`, paddingTop: 8, lineHeight: 1.5, maxHeight: 55, overflow: "hidden" }}>{ag.output.slice(0, 100)}…</div>}
                      {!ag && <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>Waiting…</div>}
                    </div>
                  </div>
                );
              })}
            </div>

            {finalStatus && (
              <div style={{ marginTop: 20, padding: "12px 16px", background: (finalStatus === "completed" ? C.green : C.red) + "11", border: `1px solid ${(finalStatus === "completed" ? C.green : C.red)}33`, borderRadius: 8 }}>
                <div style={{ color: finalStatus === "completed" ? C.green : C.red, fontSize: 11, fontWeight: 700, marginBottom: 4 }}>
                  {finalStatus === "completed" ? "✓ TASK COMPLETED" : `✗ TASK ${finalStatus.toUpperCase()}`}
                </div>
                <div style={{ color: C.muted, fontSize: 11, lineHeight: 1.5 }}>{finalResult?.slice(0, 180)}…</div>
              </div>
            )}
          </Card>

          {/* Right: Incidents + Trust */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Card>
              <div style={{ color: C.red, fontSize: 13, fontWeight: 700, letterSpacing: 1, marginBottom: 14 }}>INCIDENTS</div>
              {liveIncidents.length === 0
                ? <div style={{ color: C.green, fontSize: 12 }}>✓ No incidents detected</div>
                : liveIncidents.map(inc => (
                  <div key={inc.id} style={{ background: C.surfaceHi, border: `1px solid ${inc.security_threat ? C.purple : C.red}44`, borderLeft: `3px solid ${inc.security_threat ? C.purple : C.red}`, borderRadius: 8, padding: "10px 14px", marginBottom: 8 }}>
                    <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                      <Badge color={inc.security_threat ? C.purple : C.red}>{inc.security_threat ? "Security" : "Incident"}</Badge>
                      <Badge color={status_color(inc.status)}>{inc.status}</Badge>
                    </div>
                    <div style={{ color: C.text, fontSize: 12, fontWeight: 600, marginBottom: 3 }}>Root: {inc.root_cause_agent}</div>
                    <div style={{ color: C.muted, fontSize: 11 }}>{inc.reason}</div>
                    <div style={{ color: C.yellow, fontSize: 11, marginTop: 4 }}>Confidence: {(inc.confidence * 100).toFixed(0)}%</div>
                  </div>
                ))
              }
            </Card>

            <Card>
              <div style={{ color: C.accent, fontSize: 13, fontWeight: 700, letterSpacing: 1, marginBottom: 14 }}>LIVE TRUST SCORES</div>
              {liveTrust.length === 0
                ? <div style={{ color: C.muted, fontSize: 12 }}>Updating as agents run…</div>
                : liveTrust.map(ag => {
                  const sc = Math.round(ag.score);
                  const color = trust_color(sc);
                  return (
                    <div key={ag.agent_name} style={{ marginBottom: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ color: C.text, fontSize: 12 }}>{ag.agent_name}</span>
                        <span style={{ color, fontWeight: 800, fontFamily: "monospace" }}>{sc}</span>
                      </div>
                      <div style={{ background: C.border, borderRadius: 4, height: 5 }}>
                        <div style={{ width: `${sc}%`, height: "100%", background: `linear-gradient(to right, ${color}88, ${color})`, borderRadius: 4, transition: "width 0.5s" }} />
                      </div>
                    </div>
                  );
                })
              }
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function AgentLens() {
  const [dashboard, setDashboard] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [sessionDetail, setSessionDetail] = useState(null);
  const [activeTab, setActiveTab] = useState("run");
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const [dash, sess] = await Promise.all([
        fetch(`${API}/dashboard`).then(r => r.json()),
        fetch(`${API}/sessions`).then(r => r.json()),
      ]);
      setDashboard(dash);
      setSessions(sess);
      setError(null);
    } catch {
      setError("Backend not reachable. Start FastAPI on port 8000.");
    }
  }, []);

  const fetchSession = useCallback(async (sid) => {
    if (!sid) return;
    const detail = await fetch(`${API}/sessions/${sid}`).then(r => r.json()).catch(() => null);
    if (detail) setSessionDetail(detail);
  }, []);

  useEffect(() => {
    fetchData();
    const i = setInterval(fetchData, 4000);
    return () => clearInterval(i);
  }, [fetchData]);

  useEffect(() => {
    if (selectedSession) {
      fetchSession(selectedSession);
      const i = setInterval(() => fetchSession(selectedSession), 3000);
      return () => clearInterval(i);
    }
  }, [selectedSession, fetchSession]);

  const tabs = [
    { id: "run", label: "▶ Run Task" },
    { id: "overview", label: "Overview" },
    { id: "session", label: "Session Detail" },
    { id: "trust", label: "Trust Scores" },
    { id: "incidents", label: "Incidents" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'IBM Plex Mono', 'Fira Code', monospace", fontSize: 14 }}>
      {/* Header */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "16px 32px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 800 }}>A</div>
          <div>
            <div style={{ color: C.accent, fontWeight: 800, fontSize: 18, letterSpacing: 2 }}>AGENTLENS</div>
            <div style={{ color: C.muted, fontSize: 10, letterSpacing: 1 }}>TRUST & SECURITY PLATFORM</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: error ? C.red : C.green, boxShadow: `0 0 8px ${error ? C.red : C.green}` }} />
          <span style={{ color: C.muted, fontSize: 12 }}>{error ? "Offline" : "Live"}</span>
        </div>
      </div>

      {error && <div style={{ background: C.red + "22", border: `1px solid ${C.red}44`, padding: "12px 32px", color: C.red, fontSize: 13 }}>⚠ {error}</div>}

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, background: C.surface, padding: "0 32px" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: "14px 20px", fontSize: 13, color: activeTab === t.id ? C.accent : C.muted, borderBottom: activeTab === t.id ? `2px solid ${C.accent}` : "2px solid transparent", transition: "all 0.2s", letterSpacing: 0.5, fontFamily: "inherit" }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ padding: 32, maxWidth: 1400, margin: "0 auto" }}>

        {/* RUN TASK TAB */}
        {activeTab === "run" && (
          <RunTaskTab onSessionComplete={() => { fetchData(); setActiveTab("overview"); }} />
        )}

        {/* OVERVIEW TAB */}
        {activeTab === "overview" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 32 }}>
              <StatBox label="Total Sessions" value={dashboard?.total_sessions ?? "–"} color={C.accent} />
              <StatBox label="Events Logged" value={dashboard?.total_events ?? "–"} color={C.green} />
              <StatBox label="Incidents" value={dashboard?.total_incidents ?? "–"} color={C.orange} />
              <StatBox label="Security Threats" value={dashboard?.security_threats ?? "–"} color={C.red} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <Card>
                <div style={{ color: C.accent, fontSize: 13, fontWeight: 700, marginBottom: 16, letterSpacing: 1 }}>AGENT SESSIONS</div>
                <SessionList sessions={sessions} selected={selectedSession} onSelect={(sid) => { setSelectedSession(sid); setActiveTab("session"); }} />
              </Card>
              <Card>
                <div style={{ color: C.red, fontSize: 13, fontWeight: 700, marginBottom: 16, letterSpacing: 1 }}>RECENT INCIDENTS</div>
                <IncidentPanel incidents={dashboard?.recent_incidents} />
              </Card>
            </div>
          </div>
        )}

        {/* SESSION DETAIL TAB */}
        {activeTab === "session" && (
          <div>
            {!selectedSession ? (
              <div style={{ color: C.muted, textAlign: "center", padding: 60 }}>Select a session from the Overview tab</div>
            ) : !sessionDetail ? (
              <div style={{ color: C.muted, textAlign: "center", padding: 60 }}>Loading…</div>
            ) : (
              <div>
                <Card style={{ marginBottom: 20 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ color: C.accent, fontSize: 13, marginBottom: 4 }}>SESSION</div>
                      <div style={{ color: C.text, fontWeight: 700, fontSize: 16 }}>{sessionDetail.session.task}</div>
                      <div style={{ color: C.muted, fontSize: 11, marginTop: 4 }}>ID: {sessionDetail.session.id.slice(0, 16)}… · {fmt_time(sessionDetail.session.started_at)}</div>
                    </div>
                    <Badge color={status_color(sessionDetail.session.status)}>{sessionDetail.session.status}</Badge>
                  </div>
                  {sessionDetail.session.result && (
                    <div style={{ marginTop: 12, padding: "10px 14px", background: C.surfaceHi, borderRadius: 6, color: C.muted, fontSize: 12 }}>
                      Result: <span style={{ color: C.text }}>{sessionDetail.session.result.slice(0, 300)}</span>
                    </div>
                  )}
                </Card>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 16 }}>
                  <Card>
                    <div style={{ color: C.accent, fontSize: 13, fontWeight: 700, marginBottom: 16, letterSpacing: 1 }}>AGENT BLAME GRAPH</div>
                    <BlameGraph events={sessionDetail.events} incidents={sessionDetail.incidents} />
                    {sessionDetail.incidents?.length > 0 && (
                      <div style={{ marginTop: 16, padding: "10px 14px", background: C.red + "11", border: `1px solid ${C.red}33`, borderRadius: 8 }}>
                        <div style={{ color: C.red, fontWeight: 700, fontSize: 12, marginBottom: 4 }}>ROOT CAUSE IDENTIFIED</div>
                        <div style={{ color: C.muted, fontSize: 12 }}>{sessionDetail.incidents[0].reason}</div>
                        <div style={{ color: C.yellow, fontSize: 11, marginTop: 4 }}>Confidence: {(sessionDetail.incidents[0].confidence * 100).toFixed(0)}%</div>
                      </div>
                    )}
                  </Card>
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <Card>
                      <div style={{ color: C.accent, fontSize: 13, fontWeight: 700, marginBottom: 12, letterSpacing: 1 }}>FLIGHT RECORDER — EVENT LOG</div>
                      <EventLog events={sessionDetail.events} />
                    </Card>
                    <Card>
                      <div style={{ color: C.red, fontSize: 13, fontWeight: 700, marginBottom: 12, letterSpacing: 1 }}>INCIDENTS</div>
                      <IncidentPanel incidents={sessionDetail.incidents} />
                    </Card>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TRUST SCORES TAB */}
        {activeTab === "trust" && (
          <div style={{ maxWidth: 600 }}>
            <Card>
              <div style={{ color: C.accent, fontSize: 13, fontWeight: 700, marginBottom: 16, letterSpacing: 1 }}>AGENT TRUST & REPUTATION ENGINE</div>
              <div style={{ color: C.muted, fontSize: 12, marginBottom: 20 }}>Dynamic scores updated after every agent action — based on accuracy, hallucination rate, security violations, and failure contributions.</div>
              <TrustPanel scores={dashboard?.trust_scores} />
            </Card>
          </div>
        )}

        {/* INCIDENTS TAB */}
        {activeTab === "incidents" && (
          <div style={{ maxWidth: 700 }}>
            <Card>
              <div style={{ color: C.red, fontSize: 13, fontWeight: 700, marginBottom: 16, letterSpacing: 1 }}>ALL INCIDENTS</div>
              <AllIncidents />
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

function AllIncidents() {
  const [incidents, setIncidents] = useState([]);
  useEffect(() => {
    fetch(`${API}/incidents`).then(r => r.json()).then(setIncidents).catch(() => {});
    const i = setInterval(() => fetch(`${API}/incidents`).then(r => r.json()).then(setIncidents).catch(() => {}), 4000);
    return () => clearInterval(i);
  }, []);
  return <IncidentPanel incidents={incidents} />;
}
