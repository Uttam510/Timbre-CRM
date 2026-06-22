"use client";

import { useEffect, useState } from "react";

const STATUSES = ["New", "Researching", "Contacted", "Replied", "Won", "Lost"];

const PRESETS = [
  { label: "Faceless YouTube", queries: ["faceless youtube channel storytelling", "faceless documentary channel", "ai voiceover scary stories channel", "faceless history channel", "motivation faceless channel", "top 10 list youtube channel"] },
  { label: "Podcast clips", queries: ["podcast clips highlights channel", "comedy podcast clips", "business podcast clips", "true crime podcast clips", "sports podcast highlights", "interview clips channel"] },
  { label: "Finance / explainer", queries: ["finance explainer youtube channel", "personal finance youtube small creator", "stock market explainer channel", "crypto explainer channel", "economics explained channel", "money tips youtube channel"] },
  { label: "Creator agencies", queries: ["small youtube content agency editing", "video editing agency for creators", "short form content agency", "youtube channel management agency", "podcast editing service", "ugc content agency"] },
];

function gradeClass(grade) {
  if (grade === "A+" || grade === "A") return "A";
  return grade || "D";
}

// Template-based outreach in Timbre's voice: warm, short, no em dashes.
// (We can swap this for an AI-drafted version later via an /api/draft route.)
function draftFor(lead) {
  const first = (lead.name || "there").split(/[\s|·-]/)[0];
  const subject = "quick idea for " + (lead.name || "your channel");
  const body =
    "Hi " + first + ",\n\n" +
    "I came across your channel and the way you publish consistently stood out. " +
    "I work on Timbre, an app that turns long videos into clean cuts and short clips fast, " +
    "so creators spend less time editing and more time making.\n\n" +
    "Would it be useful if I sent over a quick example using one of your recent videos? " +
    "No pressure either way.\n\n" +
    "Thanks,\nUttam";
  return { subject, body };
}

// Lightweight pre-send check for things that get cold email filtered to spam.
const SPAM_WORDS = ["free", "guarantee", "act now", "limited time", "click here", "buy now", "winner", "risk-free", "100%", "cash", "earn money", "cheap", "urgent", "congratulations"];
function spamCheck(subject, body) {
  const text = (subject + " " + body).toLowerCase();
  const w = [];
  const hits = SPAM_WORDS.filter((s) => text.includes(s));
  if (hits.length) w.push("Spam-trigger words: " + hits.join(", "));
  const exclaims = (subject + body).split("!").length - 1;
  if (exclaims > 1) w.push("Too many exclamation marks (" + exclaims + ")");
  const caps = (subject + " " + body).match(/\b[A-Z]{4,}\b/g);
  if (caps && caps.length) w.push("All-caps words: " + caps.join(", "));
  const links = (body.match(/https?:\/\//g) || []).length;
  if (links > 1) w.push(links + " links (keep to one or none in a first email)");
  const words = body.trim().split(/\s+/).length;
  if (words < 20) w.push("Very short, can look like bulk mail");
  if (words > 200) w.push("Long, cold emails do better under ~150 words");
  if (/attach|attachment/.test(text)) w.push("Avoid attachments in cold outreach");
  return { clean: w.length === 0, warnings: w };
}

export default function Dashboard() {
  const [view, setView] = useState("dashboard");
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);

  // discover form
  const [query, setQuery] = useState("");
  const [segment, setSegment] = useState("Faceless YouTube");
  const [minSubs, setMinSubs] = useState(5000);
  const [maxSubs, setMaxSubs] = useState(200000);
  const [discovering, setDiscovering] = useState(false);
  const [live, setLive] = useState({ running: false, log: [], found: [], scored: 0, done: false, savedCount: 0, queryIndex: 0, totalQueries: 0 });

  // send state
  const [sending, setSending] = useState(false);

  async function loadLeads() {
    setLoading(true);
    try {
      const res = await fetch("/api/leads");
      const data = await res.json();
      if (data.error) setError(data.error);
      else setLeads(data.leads || []);
    } catch (e) {
      setError("Could not reach the server.");
    }
    setLoading(false);
  }

  useEffect(() => {
    loadLeads();
  }, []);

  async function readStream(res) {
    if (!res.body) return;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        let ev;
        try { ev = JSON.parse(line); } catch { continue; }
        setLive((s) => {
          if (ev.type === "status") return { ...s, log: [ev.msg, ...s.log].slice(0, 7) };
          if (ev.type === "scored") return { ...s, scored: s.scored + 1, found: [{ name: ev.name, subs: ev.subs, grade: ev.grade, score: ev.score }, ...s.found].slice(0, 40) };
          if (ev.type === "lead") return { ...s, savedCount: s.savedCount + 1 };
          if (ev.type === "error") { setError(ev.msg); return s; }
          return s;
        });
      }
    }
  }

  async function runDiscovery(queries) {
    const qs = queries.filter((q) => q && q.trim());
    if (!qs.length) return;
    setDiscovering(true);
    setError("");
    setLive({ running: true, log: [], found: [], scored: 0, done: false, savedCount: 0, queryIndex: 0, totalQueries: qs.length });
    try {
      for (let i = 0; i < qs.length; i++) {
        setLive((s) => ({ ...s, queryIndex: i + 1, log: ["▸ searching: " + qs[i], ...s.log].slice(0, 7) }));
        const res = await fetch("/api/discover", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: qs[i], segment, minSubs, maxSubs }),
        });
        await readStream(res);
      }
      await loadLeads();
      setLive((s) => ({ ...s, running: false, done: true }));
    } catch (e) {
      setError("Discovery failed. Check your API keys and try again.");
      setLive((s) => ({ ...s, running: false }));
    }
    setDiscovering(false);
  }

  async function patchLead(id, fields) {
    const res = await fetch("/api/leads", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...fields }),
    });
    const data = await res.json();
    if (data.lead) {
      setLeads((ls) => ls.map((l) => (l.id === id ? data.lead : l)));
      setSelected((s) => (s && s.id === id ? data.lead : s));
    }
  }

  async function sendEmail(lead) {
    if (!lead.contact_email) {
      setError("No contact email on this lead. Add one in the drawer first.");
      return;
    }
    const draft = lead.outreach || draftFor(lead);
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: lead.id,
          to: lead.contact_email,
          subject: draft.subject,
          body: draft.body,
        }),
      });
      const data = await res.json();
      if (data.error) setError(data.error);
      else await loadLeads();
    } catch (e) {
      setError("Send failed. Check your Gmail app password.");
    }
    setSending(false);
  }

  const stats = {
    total: leads.length,
    hot: leads.filter((l) => l.score >= 70).length,
    contacted: leads.filter((l) => ["Contacted", "Replied", "Won"].includes(l.status)).length,
    replied: leads.filter((l) => ["Replied", "Won"].includes(l.status)).length,
    avg: leads.length ? Math.round(leads.reduce((a, l) => a + (l.score || 0), 0) / leads.length) : 0,
  };

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <span><i style={{ height: 5 }} /><i style={{ height: 11 }} /><i style={{ height: 7 }} /><i style={{ height: 9 }} /></span>
          </div>
          <div className="brand-name">Timbre Signal</div>
        </div>
        {[
          ["dashboard", "Dashboard"],
          ["discover", "Discover"],
          ["pipeline", "Pipeline"],
        ].map(([k, label]) => (
          <button key={k} className={"nav-item" + (view === k ? " active" : "")} onClick={() => setView(k)}>
            <span>{label}</span>
            {k === "pipeline" && leads.length > 0 && <span className="nav-count">{leads.length}</span>}
          </button>
        ))}
        <div className="sidebar-foot">Sending from Gmail · YouTube discovery</div>
      </aside>

      <main className="main">
        <div className="topbar">
          <h1>{view === "dashboard" ? "Overview" : view === "discover" ? "Discover creators" : "Pipeline"}</h1>
          {view !== "discover" && <button className="btn btn-sm" onClick={() => setView("discover")}>+ Find creators</button>}
        </div>

        <div className="content">
          {error && <div className="banner err">{error}</div>}

          {view === "dashboard" && (
            <>
              <div className="stats">
                {[
                  [stats.total, "Leads"],
                  [stats.hot, "Hot (A)"],
                  [stats.contacted, "Contacted"],
                  [stats.replied, "Replied"],
                  [stats.avg, "Avg score"],
                ].map(([n, l]) => (
                  <div className="stat" key={l}>
                    <div className="stat-n">{n}</div>
                    <div className="stat-l">{l}</div>
                  </div>
                ))}
              </div>
              {loading ? (
                <p className="help">Loading pipeline…</p>
              ) : leads.length === 0 ? (
                <div className="empty">
                  <h3>No creators yet</h3>
                  <p>Discover YouTube creators in your target subscriber band to get started.</p>
                  <button className="btn" onClick={() => setView("discover")}>Find creators</button>
                </div>
              ) : (
                <div className="dash-grid">
                  <div className="panel">
                    <div className="panel-head">Pipeline funnel</div>
                    <div style={{ padding: "14px 18px" }}>
                      {["New", "Researching", "Contacted", "Replied", "Won"].map((st) => {
                        const c = leads.filter((l) => l.status === st).length;
                        const pct = leads.length ? Math.round((c / leads.length) * 100) : 0;
                        return (
                          <div key={st} className="funnel-row">
                            <span className="funnel-label">{st}</span>
                            <div className="funnel-track"><div className="funnel-fill" style={{ width: pct + "%" }} /></div>
                            <span className="funnel-n">{c}</span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="panel-head" style={{ borderTop: "1px solid var(--line)" }}>Grade breakdown</div>
                    <div style={{ padding: "14px 18px" }}>
                      {["A+", "A", "B", "C", "D"].map((g) => {
                        const c = leads.filter((l) => l.grade === g).length;
                        const pct = leads.length ? Math.round((c / leads.length) * 100) : 0;
                        return (
                          <div key={g} className="funnel-row">
                            <span className={"grade " + gradeClass(g)} style={{ width: 34, textAlign: "center" }}>{g}</span>
                            <div className="funnel-track"><div className="funnel-fill" style={{ width: pct + "%" }} /></div>
                            <span className="funnel-n">{c}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="panel">
                    <div className="panel-head">Recent activity</div>
                    {[...leads].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 8).map((l) => (
                      <div className="row" key={l.id} onClick={() => setSelected(l)} style={{ padding: "11px 16px" }}>
                        <span className={"grade " + gradeClass(l.grade)}>{l.grade}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="row-name" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.name}</div>
                          <div className="row-sub">{(l.subs || 0).toLocaleString()} subs · {l.status}</div>
                        </div>
                        <span className="meter-val">{l.score}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {view === "discover" && (
            <div style={{ maxWidth: 760 }}>
              <p className="help" style={{ marginTop: 0, marginBottom: 14 }}>
                Type anything on YouTube, or tap a preset to run a whole batch of searches at once.
              </p>
              <div className="searchbar">
                <span className="searchbar-icon">⌕</span>
                <input
                  className="searchbar-input"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") runDiscovery([query]); }}
                  placeholder="Search creators, niches, keywords…  e.g. ai cooking shorts channel"
                />
                <button className="btn" onClick={() => runDiscovery([query])} disabled={discovering}>
                  {discovering ? "Scanning…" : "Search"}
                </button>
              </div>

              <label className="label">Quick presets — each runs 6 searches</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {PRESETS.map((p) => (
                  <button key={p.label} className="chip" disabled={discovering} onClick={() => { setSegment(p.label); runDiscovery(p.queries); }}>
                    {p.label} <span style={{ opacity: 0.6 }}>×{p.queries.length}</span>
                  </button>
                ))}
              </div>

              <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
                <div style={{ flex: 1 }}>
                  <label className="label">Segment label</label>
                  <input className="field" value={segment} onChange={(e) => setSegment(e.target.value)} />
                </div>
                <div style={{ width: 130 }}>
                  <label className="label">Min subs</label>
                  <input className="field" type="number" value={minSubs} onChange={(e) => setMinSubs(+e.target.value)} />
                </div>
                <div style={{ width: 130 }}>
                  <label className="label">Max subs</label>
                  <input className="field" type="number" value={maxSubs} onChange={(e) => setMaxSubs(+e.target.value)} />
                </div>
              </div>

              {(live.running || live.done) && (
                <div className="scanner" style={{ marginTop: 22 }}>
                  <div className="scanner-head">
                    {live.running ? (
                      <div className="wave">{Array.from({ length: 8 }).map((_, i) => <i key={i} />)}</div>
                    ) : (
                      <div className="counter">{live.savedCount}</div>
                    )}
                    <div>
                      <div className="scanner-title">{live.running ? "Scanning YouTube" : "Added " + live.savedCount + " new creators"}</div>
                      <div className="scanner-sub">
                        {live.totalQueries > 1 ? "search " + live.queryIndex + " of " + live.totalQueries + " · " : ""}
                        {live.scored} channels scored in your band
                      </div>
                    </div>
                    {live.done && <button className="btn btn-sm" style={{ marginLeft: "auto" }} onClick={() => setView("pipeline")}>View pipeline</button>}
                  </div>
                  <div className="log">{live.log.map((l, i) => <div key={i}>{l}</div>)}</div>
                  {live.found.slice(0, 10).map((f, i) => (
                    <div className="found-row" key={f.name + i}>
                      <span className={"grade " + gradeClass(f.grade)}>{f.grade}</span>
                      <div style={{ flex: 1, fontWeight: 600, fontSize: 13.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.name}</div>
                      <span className="row-sub">{(f.subs || 0).toLocaleString()} subs</span>
                      <span className="meter-val">{f.score}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {view === "pipeline" && (
            <div className="panel">
              <div className="panel-head">All leads</div>
              {leads.length === 0 ? (
                <div style={{ padding: 24 }} className="help">Nothing yet. Go to Discover.</div>
              ) : (
                leads.map((l) => (
                  <div className="row" key={l.id} onClick={() => setSelected(l)}>
                    <span className={"grade " + gradeClass(l.grade)}>{l.grade}</span>
                    <div style={{ width: 200 }}>
                      <div className="row-name">{l.name}</div>
                      <div className="row-sub">{(l.subs || 0).toLocaleString()} subs · {l.segment}</div>
                    </div>
                    <div className="meter"><div style={{ width: l.score + "%" }} /></div>
                    <span className="meter-val">{l.score}</span>
                    <span className="chip" style={{ width: 92, textAlign: "center" }}>{l.status}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </main>

      {selected && (
        <LeadDrawer
          lead={selected}
          onClose={() => setSelected(null)}
          onStatus={(s) => patchLead(selected.id, { status: s })}
          onEmail={(email) => patchLead(selected.id, { contact_email: email })}
          onDraft={() => patchLead(selected.id, { outreach: draftFor(selected) })}
          onSaveDraft={(d) => patchLead(selected.id, { outreach: d })}
          onSend={() => sendEmail(selected)}
          sending={sending}
        />
      )}
    </div>
  );
}

function LeadDrawer({ lead, onClose, onStatus, onEmail, onDraft, onSaveDraft, onSend, sending }) {
  const sc = lead.scores || {};
  const draft = lead.outreach;
  const [email, setEmailLocal] = useState(lead.contact_email || "");

  return (
    <div className="scrim" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h2 className="drawer-title">{lead.name}</h2>
            <div style={{ display: "flex", gap: 14, marginTop: 4 }}>
              {lead.url && <a href={lead.url} target="_blank" rel="noreferrer" className="help" style={{ color: "var(--teal)" }}>View channel</a>}
              {lead.contact_link && <a href={lead.contact_link} target="_blank" rel="noreferrer" className="help" style={{ color: "var(--teal)" }}>Contact link</a>}
            </div>
          </div>
          <button className="nav-item" style={{ width: "auto", fontSize: 20 }} onClick={onClose}>×</button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "16px 0" }}>
          <div style={{ fontSize: 38, fontWeight: 680, letterSpacing: "-0.03em" }}>{lead.score}</div>
          <div>
            <span className={"grade " + gradeClass(lead.grade)}>{lead.grade}</span>
            <div className="help" style={{ marginTop: 5 }}>{(lead.subs || 0).toLocaleString()} subs · {lead.segment}</div>
          </div>
        </div>

        <div className="section-label">Fit breakdown</div>
        <div className="eq">
          {[["Fit", sc.fit], ["Reach", sc.reach], ["Need", sc.need], ["Timing", sc.timing]].map(([k, v]) => (
            <div className="eq-col" key={k}>
              <div className="eq-bar"><div className="eq-fill" style={{ height: ((v || 0) / 25) * 100 + "%" }} /></div>
              <div className="eq-n">{v || 0}</div>
              <div className="eq-l">{k}</div>
            </div>
          ))}
        </div>

        <div className="section-label">Why they fit</div>
        {(lead.fit_reasons || []).map((r, i) => (
          <div key={i} className="help" style={{ marginBottom: 5, color: "var(--text)" }}>• {r}</div>
        ))}

        <div className="section-label">Status</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {STATUSES.map((s) => (
            <button key={s} className={"chip" + (lead.status === s ? " on" : "")} onClick={() => onStatus(s)}>{s}</button>
          ))}
        </div>

        <div className="section-label">Contact email</div>
        <div style={{ display: "flex", gap: 8 }}>
          <input className="field" value={email} placeholder="name@domain.com" onChange={(e) => setEmailLocal(e.target.value)} />
          <button className="btn btn-ghost btn-sm" onClick={() => onEmail(email)}>Save</button>
        </div>

        <div className="section-label">Outreach</div>
        {draft ? (
          <DraftEditor draft={draft} onSave={onSaveDraft} onSend={onSend} sending={sending} canSend={!!lead.contact_email} sentId={lead.last_message_id} />
        ) : (
          <button className="btn btn-ghost" onClick={onDraft}>Draft email</button>
        )}
      </div>
    </div>
  );
}

function DraftEditor({ draft, onSave, onSend, sending, canSend, sentId }) {
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const check = spamCheck(subject, body);
  return (
    <div>
      <input className="field" value={subject} onChange={(e) => setSubject(e.target.value)} style={{ marginBottom: 8 }} />
      <textarea className="field" rows={9} value={body} onChange={(e) => setBody(e.target.value)} />
      <div className={"spam " + (check.clean ? "clean" : "warn")}>
        {check.clean ? "Looks clean for deliverability." : (
          <>Deliverability warnings:<ul>{check.warnings.map((x, i) => <li key={i}>{x}</li>)}</ul></>
        )}
      </div>
      {sentId && <div className="help" style={{ color: "var(--teal)", marginTop: 8 }}>Sent ✓ (id {sentId.slice(0, 14)}…)</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button className="btn" disabled={sending || !canSend} onClick={() => { onSave({ subject, body }); onSend(); }}>
          {sending ? "Sending…" : "Send from Gmail"}
        </button>
        <button className="btn btn-ghost" onClick={() => onSave({ subject, body })}>Save draft</button>
      </div>
      {!canSend && <div className="help" style={{ marginTop: 8 }}>Add a contact email above to enable sending.</div>}
    </div>
  );
}