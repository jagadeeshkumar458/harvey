import { useEffect, useRef, useState } from "react";
import { COUNSEL, PREP, PLAYBOOK_TOOL, DEBRIEF, DEBRIEF_TOOL, OPPONENTS, CASE_TYPES, caseToText, sparPrompt } from "./persona.js";
import { storage, KEYS, DEFAULT_MODEL, streamText, callTool, describeError } from "./api.js";
import { md } from "./markdown.js";

const MODES = [
  { id: "counsel", name: "Counsel", blurb: "Bring him a situation. Get the play." },
  { id: "prep", name: "Prep", blurb: "Fill the case file. Walk in with a playbook." },
  { id: "spar", name: "Spar", blurb: "He plays the other side. Then he grades you." },
];

const EMPTY_CASE = { type: CASE_TYPES[0], want: "", who: "", theyWant: "", leverage: "", context: "" };

export default function App() {
  const [mode, setMode] = useState(() => storage.get("harvey.mode", "counsel"));
  const [hasKey, setHasKey] = useState(() => !!storage.get(KEYS.apiKey));
  const [settingsOpen, setSettingsOpen] = useState(() => !storage.get(KEYS.apiKey));
  const [caseFile, setCaseFile] = useState(() => ({ ...EMPTY_CASE, ...storage.json(KEYS.caseFile, {}) }));

  useEffect(() => { storage.set("harvey.mode", mode); }, [mode]);
  useEffect(() => { storage.setJson(KEYS.caseFile, caseFile); }, [caseFile]);

  const needKey = () => setSettingsOpen(true);
  const shared = { hasKey, needKey };

  return (
    <div className="shell">
      <aside className="rail">
        <div className="mark">
          <span className="mark-name">Harvey</span>
          <span className="mark-sub">Closer on call</span>
        </div>
        <nav className="modes" aria-label="Modes">
          {MODES.map(m => (
            <button key={m.id} className={"mode" + (mode === m.id ? " on" : "")} onClick={() => setMode(m.id)} aria-current={mode === m.id ? "page" : undefined}>
              <span className="mode-name">{m.name}</span>
              <span className="mode-blurb">{m.blurb}</span>
            </button>
          ))}
        </nav>
        <button className="link settings-link" onClick={() => setSettingsOpen(true)}>Settings</button>
      </aside>

      <main className="stage">
        {mode === "counsel" && <Counsel {...shared} />}
        {mode === "prep" && <Prep {...shared} caseFile={caseFile} setCaseFile={setCaseFile} onSpar={() => setMode("spar")} />}
        {mode === "spar" && <Spar {...shared} caseFile={caseFile} onEditCase={() => setMode("prep")} />}
      </main>

      {settingsOpen && <Settings onClose={() => { setSettingsOpen(false); setHasKey(!!storage.get(KEYS.apiKey)); }} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Counsel({ hasKey, needKey }) {
  const [msgs, setMsgs] = useState(() => storage.json(KEYS.counsel, []));
  const [draft, setDraft] = useState("");
  const [live, setLive] = useState(null); // streaming text
  const [error, setError] = useState(null);
  const ctrl = useRef(null);
  const end = useRef(null);

  useEffect(() => { storage.setJson(KEYS.counsel, msgs); }, [msgs]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs.length, live === null]);

  async function run(history) {
    setError(null); setLive("");
    ctrl.current = new AbortController();
    let latest = "";
    try {
      const text = await streamText({ prompt: COUNSEL, messages: history.slice(-16), signal: ctrl.current.signal, onText: t => { latest = t; setLive(t); } });
      setMsgs([...history, { role: "assistant", content: text }]);
    } catch (e) {
      if (e.name === "AbortError") { if (latest.trim()) setMsgs([...history, { role: "assistant", content: latest + "\n\n*(Cut off.)*" }]); }
      else setError({ ...describeError(e), history });
    } finally { setLive(null); ctrl.current = null; }
  }

  function send(text) {
    text = text.trim();
    if (!text || live !== null) return;
    if (!hasKey) return needKey();
    const last = msgs[msgs.length - 1];
    const history = last?.role === "user"
      ? [...msgs.slice(0, -1), { role: "user", content: last.content + "\n\n" + text }]
      : [...msgs, { role: "user", content: text }];
    setMsgs(history); setDraft("");
    run(history);
  }

  const busy = live !== null;
  const empty = msgs.length === 0 && !busy;

  return (
    <section className="pane">
      <header className="pane-head">
        <h1>Counsel</h1>
        {msgs.length > 0 && <button className="link" onClick={() => { ctrl.current?.abort(); setMsgs([]); setError(null); }}>Clear the table</button>}
      </header>

      {empty && (
        <div className="opener">
          <p className="opener-line">What are we dealing with?</p>
          <ul className="prompts">
            {["My manager keeps giving my ideas to someone else in meetings. How do I handle it?",
              "I have an offer from another company. How do I use it without burning bridges?",
              "I freeze when people push back on me. How do I hold my ground?"].map(p => (
              <li key={p}><button onClick={() => send(p)}>{p}</button></li>
            ))}
          </ul>
        </div>
      )}

      <ol className="log">
        {msgs.map((m, i) => <Turn key={i} role={m.role} text={m.content} />)}
        {busy && <Turn role="assistant" text={live} pending />}
      </ol>
      {error && <ErrorBox err={error} onSettings={needKey} onRetry={() => run(error.history)} />}
      <div ref={end} />

      <Composer value={draft} onChange={setDraft} onSend={() => send(draft)} busy={busy} onStop={() => ctrl.current?.abort()} placeholder="Lay it out. Facts first." />
    </section>
  );
}

function Turn({ role, text, pending, label }) {
  if (role === "user") return <li className="turn you"><p>{text}</p></li>;
  return (
    <li className={"turn him" + (pending ? " pending" : "")}>
      <span className="who">{label || "Harvey"}</span>
      {pending && !text ? <p className="thinking">Reading the room…</p> : <div className="prose" dangerouslySetInnerHTML={{ __html: md(text) }} />}
    </li>
  );
}

function Composer({ value, onChange, onSend, busy, onStop, placeholder }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 260) + "px";
  }, [value]);
  return (
    <form className="composer" onSubmit={e => { e.preventDefault(); onSend(); }}>
      <label className="sr" htmlFor="say">Message</label>
      <textarea id="say" ref={ref} rows={1} value={value} placeholder={placeholder} disabled={busy}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); onSend(); } }} />
      {busy
        ? <button type="button" className="btn ghost" onClick={onStop}>Stop</button>
        : <button type="submit" className="btn" disabled={!value.trim()}>Send</button>}
    </form>
  );
}

function ErrorBox({ err, onSettings, onRetry }) {
  return (
    <div className="err" role="alert">
      <strong>{err.title}</strong>
      <span>{err.detail}</span>
      <div className="err-actions">
        {err.settings && <button className="btn ghost" onClick={onSettings}>Open settings</button>}
        {err.retry && onRetry && <button className="btn ghost" onClick={onRetry}>Try again</button>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function CaseForm({ caseFile, setCaseFile }) {
  const field = (key, label, hint, rows = 2) => (
    <label className="field">
      <span className="field-label">{label}</span>
      <textarea rows={rows} value={caseFile[key]} placeholder={hint} onChange={e => setCaseFile({ ...caseFile, [key]: e.target.value })} />
    </label>
  );
  return (
    <div className="case">
      <label className="field">
        <span className="field-label">What kind of situation</span>
        <select value={caseFile.type} onChange={e => setCaseFile({ ...caseFile, type: e.target.value })}>
          {CASE_TYPES.map(t => <option key={t}>{t}</option>)}
        </select>
      </label>
      {field("want", "What you want", "e.g. ₹28 LPA and a senior title, up from ₹18 LPA")}
      {field("who", "Who's across the table", "e.g. Hiring manager at a fintech startup; HR joins the final call")}
      {field("theyWant", "What they want", "e.g. Someone who can own the payments backend fast; they've been hiring for 3 months")}
      {field("leverage", "Your leverage", "e.g. Competing offer at ₹25 LPA, 5 years of payments experience, can join in 30 days")}
      {field("context", "Timing and anything else", "e.g. Call is on Friday. They said the budget is 'fixed'.", 2)}
    </div>
  );
}

function Prep({ hasKey, needKey, caseFile, setCaseFile, onSpar }) {
  const [book, setBook] = useState(() => storage.json("harvey.playbook", null));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const top = useRef(null);

  const ready = caseFile.want.trim() && caseFile.who.trim();

  async function build() {
    if (!hasKey) return needKey();
    setBusy(true); setError(null);
    try {
      const result = await callTool({ prompt: PREP, tool: PLAYBOOK_TOOL, messages: [{ role: "user", content: `Here's my case file:\n\n${caseToText(caseFile)}` }] });
      setBook(result); storage.setJson("harvey.playbook", result);
      requestAnimationFrame(() => top.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (e) { setError(describeError(e)); }
    finally { setBusy(false); }
  }

  return (
    <section className="pane">
      <header className="pane-head">
        <h1>Prep</h1>
        <button className="link" onClick={() => { setCaseFile({ ...EMPTY_CASE }); setBook(null); storage.del("harvey.playbook"); }}>New case</button>
      </header>
      <p className="pane-intro">Give him the facts. The more specific, the sharper the play.</p>

      <CaseForm caseFile={caseFile} setCaseFile={setCaseFile} />

      <div className="row">
        <button className="btn" onClick={build} disabled={!ready || busy}>{busy ? "Building your playbook…" : book ? "Rebuild the playbook" : "Build the playbook"}</button>
        {!ready && <span className="hint">Fill in at least what you want and who's across the table.</span>}
      </div>
      {error && <ErrorBox err={error} onSettings={needKey} onRetry={build} />}

      <div ref={top} />
      {book && !busy && <Playbook book={book} onSpar={onSpar} />}
    </section>
  );
}

function Playbook({ book, onSpar }) {
  const list = (items = []) => <ul>{items.map((x, i) => <li key={i}>{x}</li>)}</ul>;
  return (
    <article className="playbook">
      <p className="pb-kicker">The play</p>
      <h2 className="pb-headline">{book.headline}</h2>
      <p className="pb-read">{book.the_read}</p>

      <div className="pb-grid">
        <section><h3>What they really want</h3><p>{book.their_real_interest}</p></section>
        <section><h3>Your leverage</h3>{list(book.your_leverage)}</section>
        <section><h3>Their leverage, and how to blunt it</h3>{list(book.their_leverage)}</section>
        <section><h3>Opening move</h3><p>{book.opening_move}</p></section>
      </div>

      <section className="pb-lines">
        <h3>Say it like this</h3>
        {book.key_lines?.map((l, i) => <blockquote key={i}>{l}</blockquote>)}
      </section>

      <section className="pb-push">
        <h3>When they push</h3>
        <dl>
          {book.if_they_push?.map((p, i) => (
            <div key={i} className="push">
              <dt>{p.they_say}</dt>
              <dd>{p.you_say}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="pb-dont"><h3>Don't</h3>{list(book.do_not)}</section>

      <section className="pb-walk">
        <h3>Walk-away point</h3>
        <p>{book.walk_away}</p>
      </section>

      <p className="pb-take">{book.harvey_take}</p>
      <button className="btn" onClick={onSpar}>Rehearse it in Spar</button>
    </article>
  );
}

/* ------------------------------------------------------------------ */

function Spar({ hasKey, needKey, caseFile, onEditCase }) {
  const saved = storage.json(KEYS.spar, {});
  const [style, setStyle] = useState(saved.style || "tough");
  const [msgs, setMsgs] = useState(saved.msgs || []);
  const [draft, setDraft] = useState("");
  const [live, setLive] = useState(null);
  const [error, setError] = useState(null);
  const [debrief, setDebrief] = useState(saved.debrief || null);
  const [grading, setGrading] = useState(false);
  const ctrl = useRef(null);
  const end = useRef(null);

  useEffect(() => { storage.setJson(KEYS.spar, { style, msgs, debrief }); }, [style, msgs, debrief]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs.length, live === null, !!debrief]);

  const hasCase = caseFile.want.trim() && caseFile.who.trim();
  const busy = live !== null || grading;
  const yourTurns = msgs.filter(m => m.role === "user").length;

  async function run(history) {
    setError(null); setLive("");
    ctrl.current = new AbortController();
    try {
      const text = await streamText({ prompt: sparPrompt(caseToText(caseFile), style), messages: history, signal: ctrl.current.signal, onText: setLive, maxTokens: 400 });
      setMsgs([...history, { role: "assistant", content: text }]);
    } catch (e) {
      if (e.name !== "AbortError") setError({ ...describeError(e), history });
    } finally { setLive(null); ctrl.current = null; }
  }

  function send() {
    const text = draft.trim();
    if (!text || busy) return;
    if (!hasKey) return needKey();
    const last = msgs[msgs.length - 1];
    const history = last?.role === "user"
      ? [...msgs.slice(0, -1), { role: "user", content: last.content + "\n\n" + text }]
      : [...msgs, { role: "user", content: text }];
    setMsgs(history); setDraft("");
    run(history);
  }

  async function grade() {
    if (!hasKey) return needKey();
    setGrading(true); setError(null);
    const transcript = msgs.map(m => `${m.role === "user" ? "ME" : "COUNTERPART"}: ${m.content}`).join("\n\n");
    try {
      const d = await callTool({
        prompt: DEBRIEF, tool: DEBRIEF_TOOL, maxTokens: 1500,
        messages: [{ role: "user", content: `Case file:\n${caseToText(caseFile)}\n\nCounterpart style: ${OPPONENTS[style]}\n\nTranscript:\n${transcript}` }],
      });
      setDebrief(d);
    } catch (e) { setError(describeError(e)); }
    finally { setGrading(false); }
  }

  function reset() { ctrl.current?.abort(); setMsgs([]); setDebrief(null); setError(null); }

  if (!hasCase) {
    return (
      <section className="pane">
        <header className="pane-head"><h1>Spar</h1></header>
        <div className="opener">
          <p className="opener-line">Nobody spars without a case file.</p>
          <p className="pane-intro">Tell Harvey what you want and who's across the table in Prep, and he'll put someone in that chair.</p>
          <button className="btn" onClick={onEditCase}>Open the case file</button>
        </div>
      </section>
    );
  }

  return (
    <section className="pane">
      <header className="pane-head">
        <h1>Spar</h1>
        {msgs.length > 0 && <button className="link" onClick={reset}>Start over</button>}
      </header>

      <div className="spar-brief">
        <p><span className="brief-label">You want</span> {caseFile.want}</p>
        <p><span className="brief-label">Across the table</span> {caseFile.who}</p>
        <div className="styles" role="radiogroup" aria-label="Counterpart style">
          {Object.entries({ tough: "Tough", friendly: "Friendly but stingy", stonewall: "Stonewaller" }).map(([k, label]) => (
            <button key={k} role="radio" aria-checked={style === k} className={"chip" + (style === k ? " on" : "")} disabled={msgs.length > 0} onClick={() => setStyle(k)}>{label}</button>
          ))}
        </div>
        {msgs.length === 0 && <p className="hint">You open. Say what you'd actually say when you sit down.</p>}
      </div>

      <ol className="log">
        {msgs.map((m, i) => <Turn key={i} role={m.role} text={m.content} label="Across the table" />)}
        {live !== null && <Turn role="assistant" text={live} pending label="Across the table" />}
      </ol>

      {error && <ErrorBox err={error} onSettings={needKey} onRetry={() => (error.history ? run(error.history) : grade())} />}

      {debrief && <Debrief d={debrief} onAgain={reset} />}
      <div ref={end} />

      {!debrief && (
        <>
          {yourTurns >= 2 && !busy && (
            <div className="row center"><button className="btn ghost" onClick={grade}>End it. Grade me.</button></div>
          )}
          {grading && <p className="thinking center">Harvey's reviewing the tape…</p>}
          <Composer value={draft} onChange={setDraft} onSend={send} busy={live !== null} onStop={() => ctrl.current?.abort()} placeholder="Your move." />
        </>
      )}
    </section>
  );
}

function Debrief({ d, onAgain }) {
  return (
    <article className="debrief">
      <div className="score"><span className="score-num">{d.score}</span><span className="score-of">/10</span></div>
      <p className="verdict">{d.verdict}</p>
      <div className="pb-grid">
        <section><h3>What worked</h3><ul>{d.what_worked?.map((x, i) => <li key={i}>{x}</li>)}</ul></section>
        <section><h3>What cost you</h3><ul>{d.what_cost_you?.map((x, i) => <li key={i}>{x}</li>)}</ul></section>
      </div>
      {d.rewrite && (
        <section className="rewrite">
          <h3>The line to fix</h3>
          <p className="said">{d.rewrite.you_said}</p>
          <blockquote>{d.rewrite.say_this_instead}</blockquote>
        </section>
      )}
      <p className="pb-take">{d.next_time}</p>
      <button className="btn" onClick={onAgain}>Run it again</button>
    </article>
  );
}

/* ------------------------------------------------------------------ */

function Settings({ onClose }) {
  const ref = useRef(null);
  const [key, setKey] = useState(() => storage.get(KEYS.apiKey, ""));
  const [model, setModel] = useState(() => storage.get(KEYS.model, DEFAULT_MODEL));
  useEffect(() => { ref.current?.showModal(); }, []);
  function save(e) {
    e.preventDefault();
    key.trim() ? storage.set(KEYS.apiKey, key.trim()) : storage.del(KEYS.apiKey);
    storage.set(KEYS.model, model);
    ref.current?.close();
  }
  return (
    <dialog ref={ref} className="settings" onClose={onClose}>
      <form onSubmit={save}>
        <h2>Settings</h2>
        <label className="field">
          <span className="field-label">Claude API key</span>
          <input type="password" value={key} onChange={e => setKey(e.target.value)} placeholder="sk-ant-…" autoComplete="off" spellCheck={false} />
          <small>Get one at console.anthropic.com. It's stored only in this browser and sent only to Anthropic.</small>
        </label>
        <label className="field">
          <span className="field-label">Model</span>
          <select value={model} onChange={e => setModel(e.target.value)}>
            <option value="claude-sonnet-5-5">Claude Sonnet 5.5 (recommended)</option>
            <option value="claude-opus-5-5">Claude Opus 5.5 (sharpest)</option>
            <option value="claude-haiku-5-5">Claude Haiku 5.5 (fastest)</option>
          </select>
        </label>
        <div className="row end">
          <button type="button" className="btn ghost" onClick={() => ref.current?.close()}>Cancel</button>
          <button type="submit" className="btn">Save</button>
        </div>
      </form>
    </dialog>
  );
}
