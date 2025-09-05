import React, { useMemo, useRef, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpen, ArrowRight, Send, Sparkles, Library, MessageSquare, Search, NotebookPen, Clock, AlertTriangle, Share2 } from "lucide-react";
import html2canvas from 'html2canvas';
import posthog from 'posthog-js';
import * as Sentry from '@sentry/react';

// --- Minimal shadcn-inspired primitives (works in canvas preview)
const Card = ({ className = "", children }: any) => (
  <div className={`rounded-2xl shadow-sm border border-white/10 bg-white/5 backdrop-blur ${className}`}>{children}</div>
);
const CardHeader = ({ className = "", children }: any) => (
  <div className={`p-4 border-b border-white/10 ${className}`}>{children}</div>
);
const CardContent = ({ className = "", children }: any) => (
  <div className={`p-4 ${className}`}>{children}</div>
);
const Button = ({ className = "", children, ...props }: any) => (
  <button
    className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2 font-medium border border-white/10 bg-white/10 hover:bg-white/20 active:bg-white/25 transition ${className}`}
    {...props}
  >
    {children}
  </button>
);
const Input = ({ className = "", ...props }: any) => (
  <input
    className={`w-full rounded-2xl px-4 py-3 bg-white/5 border border-white/10 outline-none focus:ring-2 focus:ring-white/30 ${className}`}
    {...props}
  />
);
const Textarea = ({ className = "", ...props }: any) => (
  <textarea
    className={`w-full min-h-[110px] rounded-2xl px-4 py-3 bg-white/5 border border-white/10 outline-none focus:ring-2 focus:ring-white/30 ${className}`}
    {...props}
  />
);
const Badge = ({ className = "", children }: any) => (
  <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs border border-white/10 bg-white/10 ${className}`}>{children}</span>
);

// --- Backend base URL
const API_BASE = (import.meta as any).env?.VITE_API_BASE || "http://localhost:3001";

// --- Book type synced with backend shape
type Book = { id: string; title: string; author: string } & { theme?: string; color?: string; cover?: string; tagline?: string };

// --- Utility: fake streaming text for the demo
// (removed in this layout)

// --- Chat message type
type ChatMsg = { id: string; role: "user" | "book"; content: string; ts: number };

export default function AuraBookChatMVP() {
  const [books, setBooks] = useState<Book[]>([]);
  const [selected, setSelected] = useState<Book | null>(null);
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [search, setSearch] = useState("");
  const [showJournalDrawer, setShowJournalDrawer] = useState(false);
  const [streak, setStreak] = useState<number>(0);
  const [resumeSession, setResumeSession] = useState<{bookId:string;question:string;bookTitle?:string}|null>(null);
  const [dailyPrompts, setDailyPrompts] = useState<string[]>([]);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  useEffect(() => {
    // Load books from backend
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/books`);
        const data: Book[] = await res.json();
        setBooks(data);
      } catch (err) {
        console.error('Failed to load books', err);
        Sentry.captureException(err);
      }
    })();
  }, []);

  // --- On load: compute daily prompts, load streak & resume data
  useEffect(() => {
    // Daily rotating prompts
    const pool = [
      "Give me today’s 2-minute habit",
      "Explain this chapter with an example",
      "Turn this into a daily plan",
      "What mistake do people make with this idea?",
      "How do I apply this in 10 minutes?",
    ];
    const today = new Date();
    const key = today.toISOString().slice(0, 10); // YYYY-MM-DD
    let seed = Array.from(key).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    const picks: string[] = [];
    const used = new Set<number>();
    for (let i = 0; i < 3 && i < pool.length; i++) {
      seed = (seed * 9301 + 49297) % 233280; // LCG
      const idx = seed % pool.length;
      // ensure unique
      let j = 0; let pick = idx;
      while (used.has(pick) && j < pool.length) { pick = (pick + 1) % pool.length; j++; }
      used.add(pick);
      picks.push(pool[pick]);
    }
    setDailyPrompts(picks);

    // Streak
    try {
      const ls = localStorage.getItem('streakCount');
      setStreak(ls ? parseInt(ls) || 0 : 0);
    } catch {}

    // Resume banner
    try {
      const raw = localStorage.getItem('lastSession');
      if (raw) setResumeSession(JSON.parse(raw));
    } catch {}
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return books;
    const s = search.toLowerCase();
    return books.filter(
      (b) => b.title.toLowerCase().includes(s) || b.author.toLowerCase().includes(s) || b.theme?.toLowerCase().includes(s)
    );
  }, [search, books]);

  const handleSend = async (overrideText?: string) => {
    const q = (overrideText ?? query).trim();
    if (!q) return;
    const userMsg: ChatMsg = { id: crypto.randomUUID(), role: "user", content: q, ts: Date.now() };
    setMessages((m) => [...m, userMsg]);
    setQuery("");
    posthog.capture('ask_sent', { bookId: selected?.id, q });

    // Update streak
    try {
      const todayStr = new Date().toISOString().slice(0,10);
      const last = localStorage.getItem('lastActiveDate');
      let count = parseInt(localStorage.getItem('streakCount') || '0') || 0;
      const yesterdayStr = new Date(Date.now() - 86400000).toISOString().slice(0,10);
      if (!last) { count = 1; }
      else if (last === todayStr) { /* unchanged */ }
      else if (last === yesterdayStr) { count = count + 1; posthog.capture('streak_incremented', { count }); }
      else { count = 1; }
      localStorage.setItem('lastActiveDate', todayStr);
      localStorage.setItem('streakCount', String(count));
      setStreak(count);
    } catch (e) { console.warn('streak update failed', e); }

    // Save resume pointer
    try {
      const which = selected ?? books[0];
      if (which) localStorage.setItem('lastSession', JSON.stringify({ bookId: which.id, question: q, bookTitle: which.title }));
      setResumeSession((prev)=>{
        const which2 = selected ?? books[0];
        return which2 ? { bookId: which2.id, question: q, bookTitle: which2.title } : prev;
      });
    } catch {}

    const which = selected ?? books[0];
    if (!which) return;

    const bookMsgId = crypto.randomUUID();
    const initBookMsg: ChatMsg = { id: bookMsgId, role: 'book', content: '', ts: Date.now() };
    setMessages((m) => [...m, initBookMsg]);

    // Stream SSE from backend
    try {
      const res = await fetch(`${API_BASE}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId: which.id, question: q }),
      });

      if (!res.ok || !res.body) {
        throw new Error(`Request failed: ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let done = false;
      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        buffer += value ? decoder.decode(value, { stream: !readerDone }) : '';
        let idx;
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
          const chunk = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          // Parse SSE event lines
          const lines = chunk.split('\n');
          let dataLines: string[] = [];
          let eventType: string | null = null;
          for (const line of lines) {
            if (line.startsWith('event:')) {
              eventType = line.replace(/^event:\s?/, '').trim();
            } else if (line.startsWith('data:')) {
              dataLines.push(line.replace(/^data:\s?/, ''));
            }
          }
          if (dataLines.length && (eventType === null || eventType === 'chunk')) {
            const delta = dataLines.join('\n');
            setMessages((m) => m.map((msg) => msg.id === bookMsgId ? { ...msg, content: (msg.content + delta) } : msg));
          }
        }
      }
      posthog.capture('ask_success', { bookId: which.id });
    } catch (e) {
      console.error('SSE stream failed', e);
      Sentry.captureException(e);
      const errorMsg: ChatMsg = { id: crypto.randomUUID(), role: 'book', content: 'Sorry, something went wrong while fetching the answer.', ts: Date.now() };
      setMessages((m) => [...m, errorMsg]);
    }
  };

  // --- Helpers
  const truncate = (s: string, n = 180) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

  const saveToJournal = (bookId: string, q: string, a: string) => {
    try {
      const id = crypto.randomUUID();
      const entry = { id, ts: Date.now(), bookId, q, a };
      const raw = localStorage.getItem('journal');
      const list = raw ? JSON.parse(raw) : [];
      list.push(entry);
      localStorage.setItem('journal', JSON.stringify(list));
      posthog.capture('save_journal', { bookId });
    } catch (e) { console.warn('journal save failed', e); }
  };

  const copyAllJournal = async () => {
    try {
      const raw = localStorage.getItem('journal');
      const list: any[] = raw ? JSON.parse(raw) : [];
      const text = list.sort((a,b)=>b.ts-a.ts).map(e => `# ${e.q}\n${e.a}\n`).join('\n');
      await navigator.clipboard.writeText(text);
    } catch (e) { console.warn('copy failed', e); }
  };

  const downloadJournalTxt = () => {
    try {
      const raw = localStorage.getItem('journal');
      const list: any[] = raw ? JSON.parse(raw) : [];
      const text = list.sort((a,b)=>b.ts-a.ts).map(e => `# ${e.q}\n${e.a}\n`).join('\n');
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'journal.txt'; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { console.warn('download failed', e); }
  };

  const shareAnswerCard = async (bookTitle: string, content: string) => {
    try {
      const temp = document.createElement('div');
      temp.style.position = 'fixed';
      temp.style.left = '-10000px';
      temp.style.top = '0';
      temp.style.width = '800px';
      temp.style.padding = '24px';
      temp.style.background = 'linear-gradient(180deg, #020617 0%, #0b1220 100%)';
      temp.style.color = 'white';
      temp.style.fontFamily = 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial';
      temp.innerHTML = `
        <div style="border:1px solid rgba(255,255,255,0.1); border-radius:16px; padding:24px; position:relative;">
          <div style="opacity:0.9; font-size:14px;">Shared from</div>
          <div style="font-weight:700; font-size:22px; margin-bottom:8px;">Talk to the Book</div>
          <div style="font-size:13px; opacity:0.9; margin-bottom:8px;">${bookTitle}</div>
          <div style="white-space:pre-wrap; line-height:1.5; font-size:16px;">${truncate(content, 600)}</div>
          <div style="position:absolute; right:16px; bottom:12px; opacity:0.15; font-weight:800;">BookTalk</div>
        </div>`;
      document.body.appendChild(temp);
      const canvas = await html2canvas(temp, { backgroundColor: null, scale: 2 });
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = dataUrl; link.download = `share-${Date.now()}.png`; link.click();
      document.body.removeChild(temp);
      posthog.capture('share_card', {});
    } catch (e) {
      console.warn('share failed', e);
    }
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      {/* TopNav */}
      <div className="sticky top-0 z-30 backdrop-blur supports-[backdrop-filter]:bg-slate-900/40 border-b border-white/10">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center gap-3">
          <div className="flex items-center gap-3 mr-auto">
            <div className="h-9 w-9 rounded-xl bg-white/10 grid place-items-center">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="font-semibold">insta-read</div>
            <Badge className="hidden sm:inline-flex">beta</Badge>
          </div>
          <div className="hidden md:flex items-center flex-1 max-w-lg mx-6 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 opacity-70"/>
            <Input placeholder="Search books, ideas, chapters…" className="pl-9" value={search} onChange={(e:any)=>setSearch(e.target.value)} />
          </div>
          <div className="flex items-center gap-3">
            {/* Streak badge like Duolingo */}
            {streak>0 && (
              <Badge className="bg-orange-500/15 border-orange-500/20 text-orange-300">
                🔥 Day {streak}
              </Badge>
            )}
            {/* Journal icon opens drawer */}
            <Button aria-label="Open journal" onClick={()=>setShowJournalDrawer(true)} className="px-3 py-2">
              <NotebookPen className="h-4 w-4"/>
              <span className="hidden sm:inline">Journal</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Streak banner */}
      {streak > 0 && (
        <div className="mx-auto max-w-5xl px-4 mt-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm">🔥 Day {streak} learning streak</div>
        </div>
      )}

      {/* Resume banner */}
      {resumeSession && (
        <div className="mx-auto max-w-5xl px-4 mt-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm flex items-center justify-between">
            <div>Continue your chat with {resumeSession.bookTitle ?? 'your book'}?</div>
            <div>
              <Button onClick={()=>{
                const b = books.find(x=>x.id===resumeSession.bookId) || books[0];
                if (b) setSelected(b);
                setQuery(resumeSession.question);
              }}>Resume →</Button>
            </div>
          </div>
        </div>
      )}

      {/* HERO / Landing */}
      <section className="mx-auto max-w-6xl px-4 py-10">
        <div className="text-center max-w-3xl mx-auto">
          <h1 className="text-3xl md:text-5xl font-semibold tracking-tight">Learn smarter with your book mentor</h1>
          <p className="mt-3 text-slate-300/90">Ask questions, get friendly explanations, save insights to your journal, and build a daily learning streak.</p>
        </div>

        {/* Resume card if exists */}
        {resumeSession && (
          <div className="mt-6 grid place-items-center">
            <div className="w-full max-w-3xl">
              <Card className="overflow-hidden">
                <CardContent className="p-0">
                  <div className="flex items-stretch">
                    <div className="hidden sm:block w-32 shrink-0 bg-gradient-to-br from-sky-400/20 to-sky-600/10 border-r border-white/10 grid place-items-center">
                      <BookOpen className="h-10 w-10 opacity-80"/>
                    </div>
                    <div className="p-4 flex-1">
                      <div className="text-xs opacity-70 mb-1">Resume your last chat</div>
                      <div className="text-base font-semibold">{resumeSession.bookTitle ?? 'Your Book'}</div>
                      <div className="text-sm mt-1 opacity-90 line-clamp-2">{resumeSession.question}</div>
                    </div>
                    <div className="p-4">
                      <Button onClick={()=>{
                        const b = books.find(x=>x.id===resumeSession.bookId) || books[0];
                        if (b) setSelected(b);
                        setQuery(resumeSession.question);
                      }} className="bg-white/20">Resume →</Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Starter prompt cards */}
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {dailyPrompts.map((p,i)=> (
            <button key={p} onClick={()=>handleSend(p)} className="text-left group rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition p-4 flex items-start gap-3">
              <div className="h-9 w-9 rounded-xl bg-white/10 grid place-items-center">
                {i===0 && <Clock className="h-5 w-5 opacity-80"/>}
                {i===1 && <BookOpen className="h-5 w-5 opacity-80"/>}
                {i===2 && <AlertTriangle className="h-5 w-5 opacity-80"/>}
              </div>
              <div>
                <div className="font-medium">{p}</div>
                <div className="text-xs opacity-70">Tap to ask now</div>
              </div>
            </button>
          ))}
        </div>

        {/* Chat box */}
        <Card className="mt-8">
          <CardContent>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="text-xs opacity-70">Chatting with:</span>
              <div className="flex flex-wrap gap-2">
                {filtered.map((b: Book) => (
                  <button
                    key={b.id}
                    onClick={() => setSelected(b)}
                    className={`text-xs rounded-full px-3 py-1 border transition ${selected?.id===b.id?"bg-white/20 border-white/20":"bg-white/5 border-white/10 hover:bg-white/10"}`}
                  >{b.title}</button>
                ))}
              </div>
            </div>
            <Textarea
              placeholder={selected ? `Ask ${selected.title} about a chapter, idea, or application…` : "Pick a book above (or just type) and ask about a chapter, idea, or how to apply it…"}
              value={query}
              onChange={(e:any)=>setQuery(e.target.value)}
              onKeyDown={(e:any)=> e.key === "Enter" && (e.metaKey || e.ctrlKey) && handleSend()}
            />
            {/* Daily rotating starter prompts */}
            <div className="mt-3 flex flex-wrap gap-2">
              {dailyPrompts.map((p) => (
                <button key={p} onClick={()=>handleSend(p)} className="text-xs rounded-full px-3 py-1 border bg-white/5 border-white/10 hover:bg-white/10">
                  {p}
                </button>
              ))}
            </div>
            <div className="mt-2 flex items-center justify-between text-xs opacity-70">
              <div>Tip: Press ⌘/Ctrl + Enter to send</div>
              <div>Out-of-scope replies with: <span className="italic">“I don’t know. That’s outside this book.”</span></div>
            </div>
            <div className="mt-3 flex justify-end">
              <Button onClick={handleSend}><Send className="h-4 w-4"/> Ask</Button>
            </div>
          </CardContent>
        </Card>

        {/* Empty state before any chat */}
        {messages.length===0 && (
          <div className="mt-6">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm flex items-center justify-between">
              <div className="opacity-90">Ready when you are. Keep your streak going{streak>0?` — Day ${streak}!`:'.'}</div>
              <div className="hidden sm:block opacity-70 text-xs">Pro tip: ⌘/Ctrl + Enter to send</div>
            </div>
          </div>
        )}

        {/* Live transcript */}
        <AnimatePresence>
          {messages.length > 0 && (
            <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} className="mt-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2"><MessageSquare className="h-4 w-4"/> Conversation</div>
                </CardHeader>
                <CardContent>
                  <div className="max-h-[44vh] overflow-y-auto pr-1 space-y-4">
                    {messages.map((m, idx)=> (
                      <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`flex items-start gap-2 max-w-[85%]`}> 
                          {/* Avatar */}
                          {m.role==='book' && (
                            <div className="h-8 w-8 rounded-full bg-white/10 grid place-items-center shrink-0">
                              <BookOpen className="h-4 w-4 opacity-80"/>
                            </div>
                          )}
                          <div className={`rounded-2xl px-4 py-3 text-sm leading-6 border ${m.role==='user' ? 'bg-sky-500/15 border-sky-400/20' : 'bg-white/10 border-white/10'}`}>
                            <div className="opacity-70 text-xs mb-1">{m.role==='user' ? 'You' : (selected?.title ?? books[0]?.title ?? 'Book')}</div>
                            <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
                            {m.role==='book' && (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {/* Journal star */}
                                <Button className="text-xs" onClick={()=>{
                                  const prevUser = messages.slice(0, idx).reverse().find(x=>x.role==='user');
                                  const q = prevUser?.content || '(previous question)';
                                  const which = selected ?? books[0];
                                  if (which) saveToJournal(which.id, q, m.content);
                                }}>⭐ Save</Button>
                                {/* Follow-up chips */}
                                {['Give me examples', 'Make a 7-day plan', 'Summarize in 5 bullets'].map(f => (
                                  <button key={f} onClick={()=>handleSend(f)} className="text-[11px] rounded-full px-3 py-1 border bg-white/5 border-white/10 hover:bg-white/10">{f}</button>
                                ))}
                                {/* Share PNG */}
                                <Button className="text-xs" onClick={()=>{
                                  const which = selected ?? books[0];
                                  shareAnswerCard(which?.title || 'Book', m.content);
                                }}><Share2 className="h-4 w-4"/> Share PNG</Button>
                                {/* Web share if supported */}
                                <button onClick={async()=>{
                                  try {
                                    const which = selected ?? books[0];
                                    const text = `${which?.title || 'Book'} — ${truncate(m.content, 180)}`;
                                    if ((navigator as any).share) {
                                      await (navigator as any).share({ text, title: 'Talk to the Book' });
                                    } else {
                                      await navigator.clipboard.writeText(text);
                                    }
                                  } catch {}
                                }} className="text-[11px] rounded-full px-3 py-1 border bg-white/5 border-white/10 hover:bg-white/10">Quick Share</button>
                              </div>
                            )}
                          </div>
                          {/* User avatar on right */}
                          {m.role==='user' && (
                            <div className="h-8 w-8 rounded-full bg-sky-500/20 grid place-items-center shrink-0">
                              <span className="text-[10px] opacity-80">You</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    <div ref={endRef}/>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* Featured carousel */}
      <section className="mx-auto max-w-6xl px-4 pb-24">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Featured</h2>
          <Button className="text-sm">View all</Button>
        </div>
        <div className="overflow-x-auto hide-scrollbar">
          <div className="flex gap-5 min-w-full py-1">
            {filtered.map((b: Book)=> (
              <motion.button key={b.id} onClick={()=>setSelected(b)} whileHover={{y:-3}} className="text-left group min-w-[260px]">
                <div className={`relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br ${b.color}`}>
                  <img src={b.cover} alt="" className="h-40 w-full object-cover opacity-70"/>
                  <div className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-semibold text-base">{b.title}</h3>
                      <Badge>{b.theme}</Badge>
                    </div>
                    <p className="text-xs text-slate-200/90 mt-1">by {b.author}</p>
                    <p className="text-sm/6 text-slate-100 mt-3 opacity-90 line-clamp-2">{b.tagline}</p>
                    <div className="mt-4 flex items-center gap-2 text-sm opacity-90">
                      <span>Chat with this book</span>
                      <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                    </div>
                  </div>
                </div>
              </motion.button>
            ))}
          </div>
        </div>
      </section>

      {/* Floating Journal button */}
      <button aria-label="Open journal" onClick={()=>setShowJournalDrawer(true)} className="fixed right-4 bottom-24 z-40 rounded-full border border-white/10 bg-white/10 hover:bg-white/20 backdrop-blur px-4 py-3 flex items-center gap-2">
        <NotebookPen className="h-4 w-4"/>
        <span className="hidden sm:inline">Journal</span>
      </button>

      {/* Sticky bottom chat composer */}
      <div className="fixed bottom-0 inset-x-0 z-40">
        <div className="mx-auto max-w-5xl px-4 pb-4 pt-2">
          <Card className="shadow-lg border-white/10 bg-slate-900/70 backdrop-blur">
            <CardContent>
              <div className="flex items-start gap-3">
                <Textarea
                  placeholder={selected ? `Ask ${selected.title}…` : "Pick a book above (or just type) and ask…"}
                  value={query}
                  onChange={(e:any)=>setQuery(e.target.value)}
                  onKeyDown={(e:any)=> e.key === "Enter" && (e.metaKey || e.ctrlKey) && handleSend()}
                  className="min-h-[72px] flex-1"
                />
                <Button onClick={handleSend} className="self-end"><Send className="h-4 w-4"/> Ask</Button>
              </div>
              <div className="mt-2 text-xs opacity-70 flex justify-between">
                <div>Tip: Press ⌘/Ctrl + Enter to send</div>
                <div className="hidden sm:block">Answers stream live from the book.</div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Journal Drawer */}
      <div className={`fixed inset-0 z-50 transition ${showJournalDrawer? 'pointer-events-auto' : 'pointer-events-none'}`} aria-hidden={!showJournalDrawer}>
        <div onClick={()=>setShowJournalDrawer(false)} className={`absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity ${showJournalDrawer? 'opacity-100' : 'opacity-0'}`}/>
        <div className={`absolute right-0 top-0 h-full w-full sm:w-[480px] bg-slate-950/95 border-l border-white/10 transform transition-transform ${showJournalDrawer? 'translate-x-0' : 'translate-x-full'}`}>
          <div className="p-4 border-b border-white/10 flex items-center justify-between">
            <div className="font-semibold flex items-center gap-2"><NotebookPen className="h-4 w-4"/> Journal</div>
            <div className="flex items-center gap-2">
              <Button className="text-xs" onClick={copyAllJournal}>Copy all</Button>
              <Button className="text-xs" onClick={downloadJournalTxt}>Download .txt</Button>
              <Button className="text-xs" onClick={()=>setShowJournalDrawer(false)}>Close</Button>
            </div>
          </div>
          <div className="p-4 space-y-3 overflow-y-auto h-[calc(100%-56px)]">
            {(() => {
              try {
                const raw = localStorage.getItem('journal');
                const list: any[] = raw ? JSON.parse(raw) : [];
                const sorted = list.sort((a,b)=>b.ts-a.ts);
                if (!sorted.length) return <div className="opacity-70 text-sm">No saved insights yet. ⭐ answers you like to add them here.</div>;
                return sorted.map((e) => (
                  <Card key={e.id}>
                    <CardContent>
                      <div className="text-xs opacity-70 mb-1">{new Date(e.ts).toLocaleString()}</div>
                      <div className="text-sm font-medium mb-1">Q: {e.q}</div>
                      <div className="text-sm whitespace-pre-wrap">{e.a}</div>
                      <div className="mt-2 flex justify-end">
                        <Button className="text-xs" onClick={()=>{
                          try {
                            const raw2 = localStorage.getItem('journal');
                            const list2: any[] = raw2 ? JSON.parse(raw2) : [];
                            const next = list2.filter(x=>x.id!==e.id);
                            localStorage.setItem('journal', JSON.stringify(next));
                            // refresh
                            setShowJournalDrawer(false); setTimeout(()=>setShowJournalDrawer(true), 0);
                          } catch {}
                        }}>Delete</Button>
                      </div>
                    </CardContent>
                  </Card>
                ));
              } catch (e) {
                return <div className="opacity-70 text-sm">Failed to load journal.</div>;
              }
            })()}
          </div>
        </div>
      </div>

      <div className="py-28"/>
    </div>
  );
}
