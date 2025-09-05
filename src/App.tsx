import React, { useMemo, useRef, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpen, ArrowRight, Send, Sparkles, Library, MessageSquare, Search } from "lucide-react";

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
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return books;
    const s = search.toLowerCase();
    return books.filter(
      (b) => b.title.toLowerCase().includes(s) || b.author.toLowerCase().includes(s) || b.theme?.toLowerCase().includes(s)
    );
  }, [search, books]);

  const handleSend = async () => {
    const q = query.trim();
    if (!q) return;
    const userMsg: ChatMsg = { id: crypto.randomUUID(), role: "user", content: q, ts: Date.now() };
    setMessages((m) => [...m, userMsg]);
    setQuery("");
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
    } catch (e) {
      console.error('SSE stream failed', e);
      const errorMsg: ChatMsg = { id: crypto.randomUUID(), role: 'book', content: 'Sorry, something went wrong while fetching the answer.', ts: Date.now() };
      setMessages((m) => [...m, errorMsg]);
    }
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      {/* NAV inspired by 21st.dev */}
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
            <Input placeholder="Global search… (books, ideas, chapters)" className="pl-9" value={search} onChange={(e:any)=>setSearch(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <Button className="hidden sm:inline-flex">Creators</Button>
            <Button className="hidden sm:inline-flex">Pricing</Button>
            <Button className="bg-white/20">Publish</Button>
          </div>
        </div>
      </div>

      {/* HERO with big question + chat box */}
      <section className="mx-auto max-w-5xl px-4 py-10">
        <div className="text-center">
          <h1 className="text-3xl md:text-5xl font-semibold tracking-tight">What would you like to learn from a book today?</h1>
          <p className="mt-3 text-slate-300/90">Ask in plain English and get a warm, explanatory answer in the voice of the book.</p>
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
            <div className="mt-2 flex items-center justify-between text-xs opacity-70">
              <div>Tip: Press ⌘/Ctrl + Enter to send</div>
              <div>Out-of-scope replies with: <span className="italic">“I don’t know. That’s outside this book.”</span></div>
            </div>
            <div className="mt-3 flex justify-end">
              <Button onClick={handleSend}><Send className="h-4 w-4"/> Ask</Button>
            </div>
          </CardContent>
        </Card>

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
                    {messages.map((m)=> (
                      <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-6 ${m.role==='user' ? 'bg-white/20 border border-white/10' : 'bg-white/10 border border-white/10'}`}>
                          <div className="opacity-70 text-xs mb-1">{m.role==='user' ? 'You' : (selected?.title ?? books[0]?.title ?? 'Book')}</div>
                          <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
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

      {/* FEATURED grid like 21st.dev big tiles */}
      <section className="mx-auto max-w-6xl px-4 pb-14">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Featured</h2>
          <Button className="text-sm">View all</Button>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {filtered.map((b: Book)=> (
            <motion.button key={b.id} onClick={()=>setSelected(b)} whileHover={{y:-3}} className="text-left group">
              <div className={`relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br ${b.color}`}>
                <img src={b.cover} alt="" className="h-44 w-full object-cover opacity-70"/>
                <div className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold text-base">{b.title}</h3>
                    <Badge>{b.theme}</Badge>
                  </div>
                  <p className="text-xs text-slate-200/90 mt-1">by {b.author}</p>
                  <p className="text-sm/6 text-slate-100 mt-3 opacity-90">{b.tagline}</p>
                  <div className="mt-4 flex items-center gap-2 text-sm opacity-90">
                    <span>Chat with this book</span>
                    <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                  </div>
                </div>
              </div>
            </motion.button>
          ))}
          {/* Placeholder tiles for future features */}
          <div className="md:col-span-3 grid gap-6 md:grid-cols-3">
            {["Daily Habit Plan", "Career Frameworks", "Money Playbooks"].map((feat)=> (
              <Card key={feat} className="h-full">
                <CardContent className="p-6">
                  <div className="text-sm uppercase tracking-wide opacity-70">Coming soon</div>
                  <div className="text-xl font-semibold mt-1">{feat}</div>
                  <p className="text-sm text-slate-300/90 mt-3">Actionable templates generated from your chosen books. Tap to learn more.</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

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

      <div className="py-28"/>
    </div>
  );
}
