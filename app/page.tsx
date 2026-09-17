"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { createClient } from "@supabase/supabase-js";
import { DefaultChatTransport } from "ai";

import type {
  AppUIMessage,
  DemoLimits,
  DocumentSummary,
  WorkspaceResponse,
} from "@/lib/types";

type AppStage = "loading" | "access" | "workspace" | "unavailable";
type ApiFailure = { error?: { code?: string; message?: string } };

const repositoryUrl = process.env.NEXT_PUBLIC_REPOSITORY_URL || "https://github.com/Rachitgarg56/support-agent";
const videoUrl = process.env.NEXT_PUBLIC_DEMO_VIDEO_URL || "#";
const publicDemoCode = "thisisdemoaccesscode";

async function readResponse<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as T & ApiFailure;
  if (!response.ok) {
    const error = new Error(body.error?.message || "The request failed.");
    Object.assign(error, { code: body.error?.code, status: response.status });
    throw error;
  }
  return body;
}

function Icon({ name }: { name: "upload" | "file" | "trash" | "send" | "spark" | "lock" | "web" | "refresh" }) {
  const paths = {
    upload: <><path d="M12 16V4m0 0-4 4m4-4 4 4"/><path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/></>,
    file: <><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5M9 13h6M9 17h6"/></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/></>,
    send: <><path d="m3 3 18 9-18 9 4-9z"/><path d="M7 12h14"/></>,
    spark: <><path d="m12 2 1.6 5.4L19 9l-5.4 1.6L12 16l-1.6-5.4L5 9l5.4-1.6z"/><path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7z"/></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></>,
    web: <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 8a7 7 0 0 1 11.5-2L20 8M4 16l2.4 2a7 7 0 0 0 11.5-2"/></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function ResourceLinks() {
  return (
    <div className="resource-links">
      {repositoryUrl !== "#" && <a href={repositoryUrl} target="_blank" rel="noreferrer">Source code ↗</a>}
      {videoUrl !== "#" && <a href={videoUrl} target="_blank" rel="noreferrer">Recorded walkthrough ↗</a>}
    </div>
  );
}

function AccessScreen({ unavailable, message, onUnlock }: { unavailable: boolean; message?: string; onUnlock: (code: string) => Promise<void> }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState(message || "");
  const [busy, setBusy] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");

  async function copyDemoCode() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(publicDemoCode);
      setCopyStatus("Copied");
    } catch {
      setCopyStatus("Could not copy. Select the code above to copy it manually.");
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try { await onUnlock(code); } catch (caught) { setError(caught instanceof Error ? caught.message : "Access failed."); }
    finally { setBusy(false); }
  }

  return (
    <main className="access-page">
      <div className="ambient ambient-one" /><div className="ambient ambient-two" />
      <section className="access-card">
        <div className="brand-mark"><Icon name={unavailable ? "refresh" : "lock"} /></div>
        <p className="eyebrow">PORTFOLIO LAB · LIVE DEMO</p>
        <h1>{unavailable ? "The lab is resting." : "Enter the document lab."}</h1>
        <p className="access-copy">
          {unavailable
            ? error || "The free service is temporarily unavailable. The source and walkthrough are still available."
            : "This public portfolio demo is access-controlled to limit automated abuse and API usage."}
        </p>
        {!unavailable && (
          <>
            <div className="demo-access-panel" role="group" aria-labelledby="demo-access-title">
              <h2 id="demo-access-title">Portfolio Demo Access</h2>
              <p>Use this public code to enter the live demo.</p>
              <div className="demo-code-row">
                <code>{publicDemoCode}</code>
                <button type="button" onClick={copyDemoCode} aria-label="Copy demo access code">Copy</button>
              </div>
              <span className="copy-status" role="status" aria-live="polite">{copyStatus}</span>
            </div>
            <form className="access-form" onSubmit={submit}>
              <label htmlFor="access-code">Demo access code</label>
              <div className="access-input-row">
                <input id="access-code" type="password" value={code} onChange={(event) => setCode(event.target.value)} placeholder="Enter access code" autoComplete="off" required />
                <button disabled={busy || !code}>{busy ? "Checking…" : "Enter lab"}</button>
              </div>
              {error && <p className="form-error" role="alert">{error}</p>}
            </form>
          </>
        )}
        <ResourceLinks />
        <p className="privacy-note">Do not upload confidential information. Free-tier Gemini submissions may be used by Google to improve its products.</p>
      </section>
    </main>
  );
}

function DocumentPanel({ documents, limits, busy, onUpload, onDelete, onRetry, onClear }: {
  documents: DocumentSummary[];
  limits: DemoLimits;
  busy: boolean;
  onUpload: (files: File[]) => void;
  onDelete: (id: string) => void;
  onRetry: (id: string) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const sizeMb = Math.floor(limits.maxFileBytes / 1024 / 1024);

  function select(files: FileList | null) {
    if (files?.length) onUpload(Array.from(files));
  }

  return (
    <aside className="document-panel">
      <div className="panel-heading">
        <div><p className="eyebrow">KNOWLEDGE</p><h2>Your documents</h2></div>
        <span className="count-pill">{documents.length}/{limits.maxFiles}</span>
      </div>
      <button
        type="button"
        className={`drop-zone ${dragging ? "dragging" : ""}`}
        disabled={busy || documents.length >= limits.maxFiles}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => { event.preventDefault(); setDragging(false); select(event.dataTransfer.files); }}
      >
        <span className="upload-icon"><Icon name="upload" /></span>
        <strong>{busy ? "Processing document…" : "Drop files here"}</strong>
        <span>or click to browse</span>
        <small>PDF, TXT or MD · up to {sizeMb} MB</small>
        <small className="upload-privacy"><Icon name="lock" /> Never upload confidential files</small>
      </button>
      <input ref={inputRef} hidden type="file" multiple accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown" onChange={(event) => { select(event.target.files); event.target.value = ""; }} />

      <div className="document-list">
        {!documents.length && <div className="empty-docs"><Icon name="file" /><p>Your uploaded sources will appear here.</p></div>}
        {documents.map((document) => (
          <article className="document-card" key={document.id}>
            <span className="file-icon"><Icon name="file" /></span>
            <div className="file-meta">
              <strong title={document.name}>{document.name}</strong>
              <span>{(document.sizeBytes / 1024).toFixed(0)} KB · {document.chunkCount ? `${document.chunkCount} chunks` : document.status}</span>
              {document.error && <em>{document.error}</em>}
            </div>
            <span className={`status-dot ${document.status}`} title={document.status} />
            {document.status === "failed" && <button className="icon-button retry" aria-label={`Retry ${document.name}`} onClick={() => onRetry(document.id)}><Icon name="refresh" /></button>}
            <button className="icon-button" aria-label={`Delete ${document.name}`} onClick={() => onDelete(document.id)}><Icon name="trash" /></button>
          </article>
        ))}
      </div>
      {documents.length > 0 && <button className="clear-button" onClick={onClear}>Clear workspace</button>}
      <div className="sidebar-foot"><span><i className="pulse" /> Anonymous workspace</span><small>Expires after 30 inactive days</small></div>
    </aside>
  );
}

function ChatPanel({ hasReadyDocuments }: { hasReadyDocuments: boolean }) {
  const [input, setInput] = useState("");
  const [lastQuestion, setLastQuestion] = useState("");
  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/chat" }), []);
  const { messages, sendMessage, status, error, stop } = useChat<AppUIMessage>({ transport });
  const isStreaming = status === "submitted" || status === "streaming";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const question = input.trim();
    if (!question || isStreaming || !hasReadyDocuments) return;
    setInput(""); setLastQuestion(question);
    await sendMessage({ text: question }, { body: { allowWebSearch: false } });
  }

  async function searchWeb(question: string) {
    setLastQuestion(question);
    await sendMessage({ text: question }, { body: { allowWebSearch: true } });
  }

  return (
    <section className="chat-panel">
      <header className="chat-header">
        <div><p className="eyebrow">DOCUMENT INTELLIGENCE</p><h1>Ask your sources.</h1></div>
        <div className="model-chip"><Icon name="spark" /><span>Gemini · grounded</span></div>
      </header>

      <div className="messages" aria-live="polite">
        {!messages.length && (
          <div className="chat-empty">
            <span className="orb"><Icon name="spark" /></span>
            <h2>{hasReadyDocuments ? "Your documents are ready." : "Bring your own context."}</h2>
            <p>{hasReadyDocuments ? "Ask a specific question and I’ll answer from the uploaded text, with citations." : "Upload a readable PDF, text file, or Markdown document to begin."}</p>
            <div className="suggestions">
              <button disabled={!hasReadyDocuments} onClick={() => setInput("Summarize the key ideas in these documents.")}>Summarize key ideas</button>
              <button disabled={!hasReadyDocuments} onClick={() => setInput("What are the most important facts?")}>Find important facts</button>
            </div>
          </div>
        )}
        {messages.map((message) => (
          <article className={`message ${message.role}`} key={message.id}>
            <div className="message-label">{message.role === "user" ? "You" : "Papertrail"}</div>
            <div className="message-body">
              {message.parts.map((part, index) => {
                if (part.type === "text") return <p key={index}>{part.text}</p>;
                if (part.type === "data-citations") return (
                  <div className="citations" key={index}>
                    <span>Sources</span>
                    {part.data.items.map((citation) => (
                      <details key={citation.id}>
                        <summary><b>[{citation.id}]</b> {citation.fileName}{citation.pageNumber ? ` · p. ${citation.pageNumber}` : ""}</summary>
                        <p>{citation.excerpt}{citation.excerpt.length >= 240 ? "…" : ""}</p>
                      </details>
                    ))}
                  </div>
                );
                if (part.type === "data-retrieval" && part.data.canSearchWeb) return (
                  <button key={index} className="web-button" disabled={isStreaming} onClick={() => searchWeb(part.data.question)}><Icon name="web" /> Search the web instead</button>
                );
                if (part.type === "source-url") return <a className="web-source" key={index} href={part.url} target="_blank" rel="noreferrer">{part.title || part.url} ↗</a>;
                return null;
              })}
            </div>
          </article>
        ))}
        {isStreaming && <div className="thinking"><i /><i /><i /><span>{status === "submitted" ? "Searching your documents" : "Writing a grounded answer"}</span></div>}
        {error && <div className="chat-error" role="alert">{error.message.includes("429") ? "The free demo quota is exhausted for today. Please view the recorded walkthrough." : error.message}</div>}
      </div>

      <footer className="composer-wrap">
        <form className="composer" onSubmit={submit}>
          <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder={hasReadyDocuments ? "Ask a question about your documents…" : "Upload a document to start asking questions"} disabled={!hasReadyDocuments} maxLength={2000} rows={1} />
          <button type={isStreaming ? "button" : "submit"} onClick={isStreaming ? stop : undefined} disabled={!isStreaming && (!input.trim() || !hasReadyDocuments)} aria-label={isStreaming ? "Stop response" : "Send message"}>{isStreaming ? <span className="stop-icon" /> : <Icon name="send" />}</button>
        </form>
        <div className="composer-meta"><span>Answers are grounded in retrieved excerpts.</span><span>{lastQuestion ? `${lastQuestion.length}/2000 last question` : "No chat history is stored"}</span></div>
      </footer>
    </section>
  );
}

export default function Home() {
  const [stage, setStage] = useState<AppStage>("loading");
  const [workspace, setWorkspace] = useState<WorkspaceResponse | null>(null);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState("");

  const initialize = useCallback(async () => {
    try {
      const result = await readResponse<WorkspaceResponse>(await fetch("/api/workspace", { method: "POST" }));
      setWorkspace(result); setStage("workspace");
    } catch (error) {
      const code = (error as Error & { code?: string }).code;
      setNotice(error instanceof Error ? error.message : "The demo is unavailable.");
      setStage(code === "ACCESS_REQUIRED" || code === "ACCESS_EXPIRED" ? "access" : "unavailable");
    }
  }, []);

  const refreshDocuments = useCallback(async () => {
    const result = await readResponse<{ documents: DocumentSummary[] }>(await fetch("/api/documents"));
    setDocuments(result.documents);
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/workspace", { method: "POST" })
      .then((response) => readResponse<WorkspaceResponse>(response))
      .then((result) => {
        if (!active) return;
        setWorkspace(result);
        setStage("workspace");
      })
      .catch((error: Error & { code?: string }) => {
        if (!active) return;
        setNotice(error.message || "The demo is unavailable.");
        setStage(error.code === "ACCESS_REQUIRED" || error.code === "ACCESS_EXPIRED" ? "access" : "unavailable");
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (stage !== "workspace") return;
    let active = true;
    fetch("/api/documents")
      .then((response) => readResponse<{ documents: DocumentSummary[] }>(response))
      .then((result) => { if (active) setDocuments(result.documents); })
      .catch((error: Error) => { if (active) setNotice(error.message); });
    return () => { active = false; };
  }, [stage]);

  async function unlock(code: string) {
    await readResponse(await fetch("/api/demo-access", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) }));
    await initialize();
  }

  async function upload(files: File[]) {
    if (!workspace) return;
    setUploading(true); setNotice("");
    try {
      const remaining = Math.max(0, workspace.limits.maxFiles - documents.length);
      for (const file of files.slice(0, remaining)) {
        const upload = await readResponse<{ documentId: string; path: string; token: string; bucket: string; mediaType: string }>(await fetch("/api/documents/upload-url", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: file.name, size: file.size, mediaType: file.type }),
        }));
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (!url || !key) throw new Error("Public Supabase upload configuration is missing.");
        const client = createClient(url, key);
        const { error } = await client.storage.from(upload.bucket).uploadToSignedUrl(upload.path, upload.token, file, { contentType: upload.mediaType });
        if (error) throw error;
        await refreshDocuments();
        await readResponse(await fetch(`/api/documents/${upload.documentId}/process`, { method: "POST" }));
        await refreshDocuments();
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Upload failed.");
      await refreshDocuments().catch(() => undefined);
    } finally { setUploading(false); }
  }

  async function remove(id: string) {
    try { await readResponse(await fetch(`/api/documents/${id}`, { method: "DELETE" })); await refreshDocuments(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Delete failed."); }
  }

  async function retry(id: string) {
    setUploading(true); setNotice("");
    try { await readResponse(await fetch(`/api/documents/${id}/process`, { method: "POST" })); await refreshDocuments(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Retry failed."); await refreshDocuments().catch(() => undefined); }
    finally { setUploading(false); }
  }

  async function clearWorkspace() {
    if (!confirm("Delete every document in this workspace?")) return;
    try { await readResponse(await fetch("/api/workspace", { method: "DELETE" })); setDocuments([]); await initialize(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Could not clear the workspace."); }
  }

  if (stage === "loading") return <main className="loading-page"><span className="orb"><Icon name="spark" /></span><p>Opening the document lab…</p></main>;
  if (stage === "access" || stage === "unavailable") return <AccessScreen unavailable={stage === "unavailable"} message={notice} onUnlock={unlock} />;
  if (!workspace) return null;

  return (
    <main className="app-shell">
      <nav className="topbar">
        <div className="wordmark"><span><Icon name="spark" /></span><b>Papertrail</b><em>RAG LAB</em></div>
        <div className="topbar-right"><ResourceLinks /><span className="free-chip">FREE-TIER SAFE</span></div>
      </nav>
      {notice && <div className="notice" role="alert"><span>{notice}</span><button onClick={() => setNotice("")}>×</button></div>}
      <div className="workspace-grid">
        <DocumentPanel documents={documents} limits={workspace.limits} busy={uploading} onUpload={upload} onDelete={remove} onRetry={retry} onClear={clearWorkspace} />
        <ChatPanel hasReadyDocuments={documents.some((document) => document.status === "ready")} />
      </div>
      <div className="global-privacy"><Icon name="lock" /><span>Public portfolio demo. Do not upload confidential files; free-tier Gemini submissions may be used by Google to improve its products.</span></div>
    </main>
  );
}
