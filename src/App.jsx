import { useState, useEffect, useMemo, useCallback } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, Cell } from "recharts";
import { db } from "./firebase";
import {
  collection, doc, setDoc, deleteDoc, onSnapshot, query, orderBy
} from "firebase/firestore";

const MAX_PLAYERS = 20;
const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const AUTH_KEY = "mj-auth-v1";

function PasswordGate({ onAuth }) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);

  const submit = () => {
    if (pw === "jerryalwayswin") {
      localStorage.setItem(AUTH_KEY, btoa("jerryalwayswin:" + Date.now()));
      onAuth();
    } else {
      setError(true);
      setShake(true);
      setTimeout(() => setShake(false), 500);
    }
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "linear-gradient(170deg, #0f1f0f 0%, #1a2e1a 40%, #1f331f 100%)",
      fontFamily: "'Outfit', sans-serif", color: "#e8dcc8", padding: 20,
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Crimson+Pro:wght@400;600;700&display=swap" rel="stylesheet" />
      <style>{`
        @keyframes shake { 0%,100% { transform: translateX(0); } 20%,60% { transform: translateX(-8px); } 40%,80% { transform: translateX(8px); } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
      <div style={{ textAlign: "center", maxWidth: 320, width: "100%", animation: "fadeUp 0.5s ease-out" }}>
        <div style={{ fontSize: 64, marginBottom: 16, filter: "drop-shadow(0 4px 20px rgba(201,168,76,0.3))" }}>🀄</div>
        <div style={{ fontFamily: "'Crimson Pro', serif", fontSize: 28, fontWeight: 700, color: "#c9a84c", letterSpacing: 1, marginBottom: 4 }}>
          Mahjong Tracker
        </div>
        <div style={{ fontSize: 13, opacity: 0.4, marginBottom: 32 }}>Enter password to continue</div>

        <div style={{ animation: shake ? "shake 0.4s ease-out" : "none" }}>
          <input
            type="password"
            value={pw}
            onChange={e => { setPw(e.target.value); setError(false); }}
            onKeyDown={e => e.key === "Enter" && submit()}
            placeholder="Password"
            autoFocus
            style={{
              width: "100%", background: "rgba(255,255,255,0.06)",
              border: `1px solid ${error ? "rgba(232,124,108,0.5)" : "rgba(255,255,255,0.12)"}`,
              borderRadius: 12, padding: "16px 18px", color: "#e8dcc8", fontSize: 16,
              outline: "none", textAlign: "center", letterSpacing: 2,
              fontFamily: "'Outfit', sans-serif", transition: "border-color 0.2s",
            }}
          />
        </div>

        {error && (
          <div style={{ color: "#e87c6c", fontSize: 13, marginTop: 10, opacity: 0.8 }}>
            Wrong password. Try again.
          </div>
        )}

        <button onClick={submit} style={{
          width: "100%", marginTop: 16, padding: 16, borderRadius: 12, border: "none",
          background: pw ? "linear-gradient(135deg, #c9a84c, #a8893a)" : "rgba(255,255,255,0.06)",
          color: pw ? "#1a2e1a" : "rgba(232,220,200,0.2)",
          fontSize: 16, fontWeight: 600, cursor: pw ? "pointer" : "default",
          fontFamily: "'Outfit', sans-serif", transition: "all 0.2s",
        }}>
          Enter
        </button>
      </div>
    </div>
  );
}

const EMOJI_OPTIONS = [
  "🀄", "🀅", "🀇", "🀈", "🀉", "🀊", "🀋", "🀌", "🀍",
  "🐉", "🐲", "🐯", "🐼", "🦊", "🐨", "🦁", "🐸", "🐙",
  "🔥", "⚡", "💎", "🌙", "⭐", "🎯", "🎲", "🃏", "👑",
  "🗡️", "🛡️", "🏆", "🎰", "🧧", "💰", "🍀", "🌸", "🎴",
];

const CHART_COLORS = [
  "#c9a84c", "#7dce82", "#e87c6c", "#6cb4e8", "#d4a0e8",
  "#e8c46c", "#6ce8d4", "#e86cbc", "#a0e86c", "#6c8ce8",
  "#e8a06c", "#6ce8a0", "#bc6ce8", "#e86c6c", "#6cd4e8",
  "#c4e86c", "#e86ca0", "#6c6ce8", "#e8d46c", "#8ce86c",
];

function minimizeTransactions(balances) {
  const debtors = [], creditors = [];
  Object.entries(balances).forEach(([id, bal]) => {
    if (bal < -0.005) debtors.push({ id, amount: -bal });
    else if (bal > 0.005) creditors.push({ id, amount: bal });
  });
  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);
  const txns = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amt = Math.min(debtors[i].amount, creditors[j].amount);
    if (amt > 0.005) txns.push({ from: debtors[i].id, to: creditors[j].id, amount: amt });
    debtors[i].amount -= amt;
    creditors[j].amount -= amt;
    if (debtors[i].amount < 0.005) i++;
    if (creditors[j].amount < 0.005) j++;
  }
  return txns;
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "rgba(26,46,26,0.95)", border: "1px solid rgba(201,168,76,0.3)", borderRadius: 8, padding: "10px 14px", fontSize: 12 }}>
      <div style={{ color: "#c9a84c", marginBottom: 6, fontWeight: 600 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, padding: "2px 0" }}>
          {p.name}: <span style={{ fontWeight: 700 }}>{p.value > 0 ? "+" : ""}{p.value.toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
};

export default function App() {
  const [authed, setAuthed] = useState(() => {
    try {
      const stored = localStorage.getItem(AUTH_KEY);
      if (!stored) return false;
      const decoded = atob(stored);
      return decoded.startsWith("jerryalwayswin:");
    } catch { return false; }
  });

  if (!authed) return <PasswordGate onAuth={() => setAuthed(true)} />;

  return <MahjongApp />;
}

function MahjongApp() {
  const [players, setPlayers] = useState([]);
  const [history, setHistory] = useState([]);
  const [tab, setTab] = useState("new");
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState(null);

  const [selPlayers, setSelPlayers] = useState([]);
  const [scores, setScores] = useState({});
  const [step, setStep] = useState(1);
  const [editingSession, setEditingSession] = useState(null);

  const [viewPlayer, setViewPlayer] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [editingPlayerName, setEditingPlayerName] = useState(null);
  const [editNameVal, setEditNameVal] = useState("");

  // ─── Real-time Firestore listeners ───
  useEffect(() => {
    let loaded = { players: false, sessions: false };
    const checkLoaded = () => {
      if (loaded.players && loaded.sessions) setLoading(false);
    };

    const unsubPlayers = onSnapshot(
      collection(db, "players"),
      (snap) => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        setPlayers(list);
        loaded.players = true;
        checkLoaded();
      },
      (err) => {
        console.error("Players listener error:", err);
        setDbError("Failed to connect to database. Check your Firebase config.");
        loaded.players = true;
        checkLoaded();
      }
    );

    const unsubSessions = onSnapshot(
      query(collection(db, "sessions"), orderBy("date", "desc")),
      (snap) => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setHistory(list);
        loaded.sessions = true;
        checkLoaded();
      },
      (err) => {
        console.error("Sessions listener error:", err);
        setDbError("Failed to connect to database. Check your Firebase config.");
        loaded.sessions = true;
        checkLoaded();
      }
    );

    return () => { unsubPlayers(); unsubSessions(); };
  }, []);

  // ─── Firestore write helpers ───
  const fbAddPlayer = async (player) => {
    await setDoc(doc(db, "players", player.id), {
      name: player.name,
      emoji: player.emoji,
      createdAt: Date.now(),
    });
  };

  const fbUpdatePlayer = async (id, data) => {
    await setDoc(doc(db, "players", id), data, { merge: true });
  };

  const fbRemovePlayer = async (id) => {
    await deleteDoc(doc(db, "players", id));
  };

  const fbSaveSession = async (session) => {
    await setDoc(doc(db, "sessions", session.id), {
      date: session.date,
      scores: session.scores,
      transactions: session.transactions,
    });
  };

  const fbDeleteSession = async (id) => {
    await deleteDoc(doc(db, "sessions", id));
  };

  // ─── Player actions ───
  const addPlayer = async () => {
    const name = newName.trim();
    if (!name || players.find(p => p.name.toLowerCase() === name.toLowerCase())) return;
    if (players.length >= MAX_PLAYERS) return;
    const used = players.map(p => p.emoji);
    const emoji = EMOJI_OPTIONS.find(e => !used.includes(e)) || EMOJI_OPTIONS[players.length % EMOJI_OPTIONS.length];
    const player = { id: genId(), name, emoji };
    setNewName("");
    await fbAddPlayer(player);
  };

  const removePlayer = async (id) => {
    if (history.some(h => h.scores && h.scores[id] !== undefined)) {
      if (!confirm(`${getName(id)} has past sessions. Remove anyway?`)) return;
    }
    if (viewPlayer === id) setViewPlayer(null);
    await fbRemovePlayer(id);
  };

  const updatePlayerEmoji = async (id, emoji) => {
    setShowEmojiPicker(false);
    await fbUpdatePlayer(id, { emoji });
  };

  const updatePlayerName = async (id) => {
    const name = editNameVal.trim();
    if (!name || players.find(p => p.id !== id && p.name.toLowerCase() === name.toLowerCase())) return;
    setEditingPlayerName(null);
    setEditNameVal("");
    await fbUpdatePlayer(id, { name });
  };

  // ─── Helpers ───
  const getName = (id) => players.find(p => p.id === id)?.name || "Unknown";
  const getEmoji = (id) => players.find(p => p.id === id)?.emoji || "🀄";
  const getColor = (id) => CHART_COLORS[players.findIndex(p => p.id === id) % CHART_COLORS.length];

  const togglePlayer = (id) => {
    setSelPlayers(prev => prev.includes(id) ? prev.filter(p => p !== id) : prev.length < 4 ? [...prev, id] : prev);
  };

  const startScoreEntry = () => {
    if (selPlayers.length < 2) return;
    const s = {}; selPlayers.forEach(id => (s[id] = "")); setScores(s); setStep(2);
  };

  const setScore = (id, val) => {
    if (val !== "" && val !== "-" && val !== "-." && val !== "." && !/^-?\d*\.?\d*$/.test(val)) return;
    setScores(prev => ({ ...prev, [id]: val }));
  };

  const scoresValid = () => {
    const entries = Object.entries(scores);
    return entries.every(([, v]) => v !== "" && v !== "-" && v !== "-." && v !== ".") &&
      Math.abs(entries.reduce((s, [, v]) => s + parseFloat(v), 0)) < 0.01;
  };

  const getTotal = () => Object.values(scores).reduce((s, v) => { const n = parseFloat(v); return s + (isNaN(n) ? 0 : n); }, 0);

  const confirmSettle = async () => {
    const parsed = {};
    Object.entries(scores).forEach(([id, v]) => (parsed[id] = parseFloat(v)));
    const session = {
      id: editingSession || genId(),
      date: new Date().toISOString(),
      scores: parsed,
      transactions: minimizeTransactions(parsed),
    };
    await fbSaveSession(session);
    resetForm();
    setTab("history");
  };

  const resetForm = () => { setSelPlayers([]); setScores({}); setStep(1); setEditingSession(null); };

  const editSession = (session) => {
    setEditingSession(session.id);
    const ids = Object.keys(session.scores);
    setSelPlayers(ids);
    const s = {}; ids.forEach(id => (s[id] = session.scores[id].toString()));
    setScores(s); setStep(2); setTab("new");
  };

  const deleteSession = async (id) => {
    if (!confirm("Delete this session?")) return;
    await fbDeleteSession(id);
  };

  // ─── Computed stats ───
  const lifetimeStats = useMemo(() => {
    const stats = {};
    history.forEach(h => {
      if (!h.scores) return;
      Object.entries(h.scores).forEach(([id, score]) => {
        if (!stats[id]) stats[id] = { total: 0, games: 0, wins: 0, losses: 0, best: -Infinity, worst: Infinity };
        stats[id].total += score; stats[id].games += 1;
        if (score > 0) stats[id].wins += 1;
        if (score < 0) stats[id].losses += 1;
        if (score > stats[id].best) stats[id].best = score;
        if (score < stats[id].worst) stats[id].worst = score;
      });
    });
    return Object.entries(stats).map(([id, s]) => ({ id, ...s, avg: s.total / s.games })).sort((a, b) => b.total - a.total);
  }, [history]);

  const cumulativeData = useMemo(() => {
    const sorted = [...history].reverse();
    const running = {};
    return sorted.map((h, i) => {
      if (!h.scores) return null;
      const point = { name: new Date(h.date).toLocaleDateString("en-SG", { day: "numeric", month: "short" }), idx: i + 1 };
      Object.entries(h.scores).forEach(([id, score]) => { running[id] = (running[id] || 0) + score; });
      Object.entries(running).forEach(([id, total]) => { point[id] = parseFloat(total.toFixed(2)); });
      return point;
    }).filter(Boolean);
  }, [history]);

  const chartPlayers = useMemo(() => {
    const ids = new Set();
    history.forEach(h => { if (h.scores) Object.keys(h.scores).forEach(id => ids.add(id)); });
    return players.filter(p => ids.has(p.id));
  }, [history, players]);

  const getPlayerData = (playerId) => {
    const sorted = [...history].reverse();
    let cumulative = 0;
    return sorted.filter(h => h.scores && h.scores[playerId] !== undefined).map(h => {
      cumulative += h.scores[playerId];
      return {
        name: new Date(h.date).toLocaleDateString("en-SG", { day: "numeric", month: "short" }),
        score: h.scores[playerId],
        cumulative: parseFloat(cumulative.toFixed(2)),
      };
    });
  };

  // ─── Styles ───
  const CSS = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Outfit', sans-serif; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.5; } }
    .card { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); border-radius: 14px; padding: 16px; }
    .btn { border: none; cursor: pointer; font-family: 'Outfit', sans-serif; transition: all 0.15s; }
    .btn:active { transform: scale(0.97); }
    .chip { display: inline-flex; align-items: center; gap: 6px; padding: 10px 16px; border-radius: 10px; font-size: 14px; cursor: pointer; transition: all 0.15s; border: 2px solid transparent; user-select: none; }
    .chip:active { transform: scale(0.95); }
    .chip-on { border-color: #c9a84c; background: rgba(201,168,76,0.15); }
    .chip-off { border-color: rgba(255,255,255,0.1); background: rgba(255,255,255,0.03); }
    .pos { color: #7dce82; } .neg { color: #e87c6c; } .zero { color: rgba(232,220,200,0.4); }
    .tab-btn { padding: 10px 0; font-size: 13px; font-weight: 500; border: none; background: none; cursor: pointer; color: rgba(232,220,200,0.4); position: relative; font-family: 'Outfit', sans-serif; transition: color 0.2s; flex: 1; }
    .tab-active { color: #c9a84c; }
    .tab-active::after { content: ''; position: absolute; bottom: 0; left: 20%; right: 20%; height: 2px; background: #c9a84c; border-radius: 1px; }
    .score-input { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); border-radius: 10px; padding: 12px 14px; color: #e8dcc8; font-size: 18px; font-family: 'Crimson Pro', serif; font-weight: 700; outline: none; width: 110px; text-align: right; transition: border-color 0.2s; }
    .score-input:focus { border-color: #c9a84c; }
    .score-input::placeholder { color: rgba(232,220,200,0.2); }
    input { font-family: 'Outfit', sans-serif; }
    .lbl { font-size: 11px; text-transform: uppercase; letter-spacing: 2px; opacity: 0.4; margin-bottom: 14px; }
    .player-row { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; margin-bottom: 8px; border-radius: 10px; cursor: pointer; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06); transition: background 0.15s; }
    .player-row:hover { background: rgba(255,255,255,0.07); }
  `;

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#1a2e1a", fontFamily: "'Outfit', sans-serif", color: "#d4c5a0" }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600&display=swap" rel="stylesheet" />
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 48, animation: "pulse 1.5s infinite" }}>🀄</div>
        <div style={{ marginTop: 12, opacity: 0.5, fontSize: 14 }}>Connecting...</div>
        <style>{`@keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.5; } }`}</style>
      </div>
    </div>
  );

  if (dbError) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#1a2e1a", fontFamily: "'Outfit', sans-serif", color: "#d4c5a0", padding: 20 }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600&display=swap" rel="stylesheet" />
      <div style={{ textAlign: "center", maxWidth: 360 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
        <div style={{ color: "#e87c6c", fontWeight: 600, marginBottom: 8 }}>Connection Error</div>
        <div style={{ opacity: 0.6, fontSize: 14, lineHeight: 1.6 }}>{dbError}</div>
        <div style={{ marginTop: 16, opacity: 0.4, fontSize: 12 }}>Check src/firebase.js and make sure your Firebase config is correct and Firestore is enabled.</div>
      </div>
    </div>
  );

  // ─── PLAYER PROFILE VIEW ───
  if (viewPlayer) {
    const p = players.find(pl => pl.id === viewPlayer);
    if (!p) { setViewPlayer(null); return null; }
    const stats = lifetimeStats.find(s => s.id === viewPlayer);
    const data = getPlayerData(viewPlayer);
    const rank = lifetimeStats.findIndex(s => s.id === viewPlayer) + 1;

    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(170deg, #0f1f0f 0%, #1a2e1a 40%, #1f331f 100%)", fontFamily: "'Outfit', sans-serif", color: "#e8dcc8", maxWidth: 480, margin: "0 auto" }}>
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Crimson+Pro:wght@400;600;700&display=swap" rel="stylesheet" />
        <style>{CSS}</style>
        <div style={{ padding: 20, animation: "fadeIn 0.3s" }}>
          <button className="btn" onClick={() => { setViewPlayer(null); setShowEmojiPicker(false); setEditingPlayerName(null); }}
            style={{ background: "rgba(255,255,255,0.06)", borderRadius: 10, padding: "8px 16px", color: "rgba(232,220,200,0.6)", fontSize: 14, marginBottom: 20 }}>← Back</button>

          <div className="card" style={{ textAlign: "center", padding: "28px 20px", marginBottom: 16 }}>
            <div onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              style={{ fontSize: 56, cursor: "pointer", marginBottom: 8, filter: "drop-shadow(0 4px 12px rgba(201,168,76,0.3))" }}>
              {p.emoji}
            </div>
            <div style={{ fontSize: 11, opacity: 0.3, marginBottom: 8 }}>tap icon to change</div>

            {showEmojiPicker && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", padding: 14, marginBottom: 12, borderRadius: 12, background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.08)" }}>
                {EMOJI_OPTIONS.map(e => (
                  <div key={e} onClick={() => updatePlayerEmoji(p.id, e)}
                    style={{ fontSize: 24, cursor: "pointer", padding: 6, borderRadius: 8, background: p.emoji === e ? "rgba(201,168,76,0.2)" : "transparent", border: p.emoji === e ? "1px solid rgba(201,168,76,0.4)" : "1px solid transparent" }}>{e}</div>
                ))}
              </div>
            )}

            {editingPlayerName === p.id ? (
              <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 4 }}>
                <input value={editNameVal} onChange={e => setEditNameVal(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && updatePlayerName(p.id)} autoFocus
                  style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(201,168,76,0.4)", borderRadius: 8, padding: "8px 12px", color: "#e8dcc8", fontSize: 18, fontWeight: 600, textAlign: "center", outline: "none", width: 160, fontFamily: "'Outfit', sans-serif" }} />
                <button className="btn" onClick={() => updatePlayerName(p.id)} style={{ background: "rgba(201,168,76,0.2)", color: "#c9a84c", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600 }}>✓</button>
                <button className="btn" onClick={() => setEditingPlayerName(null)} style={{ background: "rgba(255,255,255,0.06)", color: "rgba(232,220,200,0.5)", borderRadius: 8, padding: "8px 14px", fontSize: 13 }}>✕</button>
              </div>
            ) : (
              <div onClick={() => { setEditingPlayerName(p.id); setEditNameVal(p.name); }}
                style={{ fontFamily: "'Crimson Pro', serif", fontSize: 24, fontWeight: 700, color: "#c9a84c", cursor: "pointer", marginBottom: 4 }}>{p.name}</div>
            )}
            {!editingPlayerName && <div style={{ fontSize: 11, opacity: 0.3 }}>tap name to edit</div>}

            {stats && (
              <div style={{ marginTop: 16, display: "flex", justifyContent: "center", gap: 20 }}>
                {[
                  [stats.total > 0.005 ? "pos" : stats.total < -0.005 ? "neg" : "zero", `${stats.total > 0 ? "+" : ""}$${stats.total.toFixed(2)}`, "Lifetime"],
                  ["", `#${rank}`, "Rank"],
                  ["", `${stats.games}`, "Games"],
                ].map(([cls, val, label], i) => (
                  <div key={i}>
                    <div className={cls} style={{ fontFamily: "'Crimson Pro', serif", fontSize: 22, fontWeight: 700, ...(!cls ? { color: "#c9a84c" } : {}) }}>{val}</div>
                    <div style={{ fontSize: 10, opacity: 0.4, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {stats && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="lbl">Statistics</div>
              {[
                ["Win rate", `${((stats.wins / stats.games) * 100).toFixed(0)}%`, `${stats.wins}W / ${stats.losses}L`],
                ["Average", `${stats.avg > 0 ? "+" : ""}$${stats.avg.toFixed(2)}`, "per session"],
                ["Best session", stats.best > -Infinity ? `${stats.best > 0 ? "+" : ""}$${stats.best.toFixed(2)}` : "—", ""],
                ["Worst session", stats.worst < Infinity ? `${stats.worst > 0 ? "+" : ""}$${stats.worst.toFixed(2)}` : "—", ""],
              ].map(([label, value, sub], i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: i < 3 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                  <span style={{ opacity: 0.6, fontSize: 14 }}>{label}</span>
                  <div style={{ textAlign: "right" }}>
                    <span style={{ fontFamily: "'Crimson Pro', serif", fontWeight: 700, fontSize: 16 }}>{value}</span>
                    {sub && <span style={{ fontSize: 11, opacity: 0.3, marginLeft: 6 }}>{sub}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {data.length > 1 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="lbl">Cumulative Score</div>
              <div style={{ width: "100%", height: 200 }}>
                <ResponsiveContainer>
                  <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                    <CartesianGrid stroke="rgba(255,255,255,0.04)" />
                    <XAxis dataKey="name" tick={{ fill: "rgba(232,220,200,0.3)", fontSize: 10 }} />
                    <YAxis tick={{ fill: "rgba(232,220,200,0.3)", fontSize: 10 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" />
                    <Line type="monotone" dataKey="cumulative" stroke={getColor(viewPlayer)} strokeWidth={2.5} dot={{ r: 4, fill: getColor(viewPlayer) }} name="Total" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {data.length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="lbl">Per Session</div>
              <div style={{ width: "100%", height: 180 }}>
                <ResponsiveContainer>
                  <BarChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                    <CartesianGrid stroke="rgba(255,255,255,0.04)" />
                    <XAxis dataKey="name" tick={{ fill: "rgba(232,220,200,0.3)", fontSize: 10 }} />
                    <YAxis tick={{ fill: "rgba(232,220,200,0.3)", fontSize: 10 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" />
                    <Bar dataKey="score" name="Score" radius={[4, 4, 0, 0]}>
                      {data.map((d, i) => (<Cell key={i} fill={d.score >= 0 ? "#7dce82" : "#e87c6c"} fillOpacity={0.8} />))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {data.length > 0 && (
            <div className="card">
              <div className="lbl">Session History</div>
              {[...data].reverse().map((d, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <span style={{ opacity: 0.5, fontSize: 13 }}>{d.name}</span>
                  <span className={d.score > 0.005 ? "pos" : d.score < -0.005 ? "neg" : "zero"}
                    style={{ fontFamily: "'Crimson Pro', serif", fontWeight: 700 }}>{d.score > 0 ? "+" : ""}${d.score.toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}

          <button className="btn" onClick={() => { if (confirm(`Remove ${p.name}?`)) removePlayer(p.id); }}
            style={{ width: "100%", marginTop: 16, padding: 14, borderRadius: 12, background: "rgba(232,124,108,0.08)", color: "rgba(232,124,108,0.5)", border: "1px solid rgba(232,124,108,0.15)", fontSize: 14 }}>
            Remove Player
          </button>
        </div>
      </div>
    );
  }

  // ─── MAIN APP ───
  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(170deg, #0f1f0f 0%, #1a2e1a 40%, #1f331f 100%)", fontFamily: "'Outfit', sans-serif", color: "#e8dcc8", maxWidth: 480, margin: "0 auto" }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Crimson+Pro:wght@400;600;700&display=swap" rel="stylesheet" />
      <style>{CSS}</style>

      <div style={{ padding: "20px 20px 0" }}>
        <div style={{ fontFamily: "'Crimson Pro', serif", fontSize: 26, fontWeight: 700, color: "#c9a84c", letterSpacing: 1 }}>🀄 Mahjong</div>
        <div style={{ fontSize: 12, opacity: 0.4, marginTop: 2, display: "flex", alignItems: "center", gap: 6 }}>
          Score Tracker
          <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: 3, background: "#7dce82" }} title="Connected" />
        </div>
      </div>

      <div style={{ display: "flex", padding: "12px 20px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        {[["new", "New Game"], ["players", "Players"], ["history", "History"], ["stats", "Stats"]].map(([key, label]) => (
          <button key={key} className={`tab-btn ${tab === key ? "tab-active" : ""}`} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>

      <div style={{ padding: 20 }}>

        {/* NEW GAME */}
        {tab === "new" && (
          <div style={{ animation: "fadeIn 0.3s" }}>
            {step === 1 && (
              <>
                <div className="lbl">Select players (2–4)</div>
                {players.length < 2 ? (
                  <div style={{ textAlign: "center", padding: "50px 20px" }}>
                    <div style={{ fontSize: 48, marginBottom: 12 }}>🀅</div>
                    <div style={{ fontSize: 14, opacity: 0.5, marginBottom: 20 }}>Add at least 2 players first</div>
                    <button className="btn" onClick={() => setTab("players")} style={{ background: "rgba(201,168,76,0.15)", color: "#c9a84c", padding: "14px 32px", borderRadius: 12, fontSize: 15, fontWeight: 600, border: "1px solid rgba(201,168,76,0.3)" }}>Add Players</button>
                  </div>
                ) : (
                  <>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
                      {players.map(p => (
                        <div key={p.id} className={`chip ${selPlayers.includes(p.id) ? "chip-on" : "chip-off"}`} onClick={() => togglePlayer(p.id)}>
                          <span style={{ fontSize: 18 }}>{p.emoji}</span><span style={{ fontWeight: 500 }}>{p.name}</span>
                        </div>
                      ))}
                    </div>
                    <button className="btn" disabled={selPlayers.length < 2} onClick={startScoreEntry} style={{
                      width: "100%", padding: 16, borderRadius: 12, fontSize: 16, fontWeight: 600,
                      background: selPlayers.length >= 2 ? "linear-gradient(135deg, #c9a84c, #a8893a)" : "rgba(255,255,255,0.06)",
                      color: selPlayers.length >= 2 ? "#1a2e1a" : "rgba(232,220,200,0.2)",
                    }}>Enter Scores →</button>
                  </>
                )}
              </>
            )}

            {step === 2 && (
              <>
                <div className="lbl">Enter final scores (S$)</div>
                {selPlayers.map(id => (
                  <div key={id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
                      <span style={{ fontSize: 22 }}>{getEmoji(id)}</span>
                      <span style={{ fontWeight: 500, fontSize: 16 }}>{getName(id)}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <button className="btn" onClick={() => {
                        const cur = scores[id];
                        if (!cur || cur === "0" || cur === "0.00") return;
                        setScore(id, cur.startsWith("-") ? cur.slice(1) : "-" + cur);
                      }} style={{
                        background: scores[id]?.startsWith("-") ? "rgba(232,124,108,0.15)" : "rgba(125,206,130,0.15)",
                        color: scores[id]?.startsWith("-") ? "#e87c6c" : "#7dce82",
                        border: "1px solid " + (scores[id]?.startsWith("-") ? "rgba(232,124,108,0.25)" : "rgba(125,206,130,0.25)"),
                        borderRadius: 8, padding: "8px 10px", fontSize: 14, fontWeight: 700, minWidth: 36,
                      }}>±</button>
                      <input className="score-input" type="text" inputMode="decimal" placeholder="0.00" value={scores[id]} onChange={e => setScore(id, e.target.value)} />
                    </div>
                  </div>
                ))}
                <div style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderRadius: 10, margin: "12px 0 20px",
                  background: scoresValid() ? "rgba(125,206,130,0.08)" : "rgba(255,255,255,0.03)",
                  border: `1px solid ${scoresValid() ? "rgba(125,206,130,0.15)" : "rgba(255,255,255,0.06)"}`,
                }}>
                  <span style={{ fontSize: 13, opacity: 0.5 }}>Total (must be $0.00)</span>
                  <span style={{ fontFamily: "'Crimson Pro', serif", fontSize: 18, fontWeight: 700, color: Math.abs(getTotal()) < 0.01 ? "#7dce82" : "#e87c6c" }}>
                    {getTotal() >= 0 ? "+" : ""}{getTotal().toFixed(2)}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button className="btn" onClick={() => setStep(1)} style={{ padding: "14px 20px", borderRadius: 12, background: "rgba(255,255,255,0.06)", color: "rgba(232,220,200,0.6)", fontSize: 15 }}>← Back</button>
                  <button className="btn" disabled={!scoresValid()} onClick={() => setStep(3)} style={{
                    flex: 1, padding: 16, borderRadius: 12, fontSize: 16, fontWeight: 600,
                    background: scoresValid() ? "linear-gradient(135deg, #c9a84c, #a8893a)" : "rgba(255,255,255,0.06)",
                    color: scoresValid() ? "#1a2e1a" : "rgba(232,220,200,0.2)",
                  }}>Settle Up →</button>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <div className="lbl">Settlement</div>
                <div className="card" style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, opacity: 0.4, marginBottom: 10 }}>Final Scores</div>
                  {Object.entries(scores).sort((a, b) => parseFloat(b[1]) - parseFloat(a[1])).map(([id, v]) => {
                    const val = parseFloat(v);
                    return (
                      <div key={id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ fontSize: 20 }}>{getEmoji(id)}</span><span style={{ fontWeight: 500 }}>{getName(id)}</span>
                        </div>
                        <span className={val > 0.005 ? "pos" : val < -0.005 ? "neg" : "zero"}
                          style={{ fontFamily: "'Crimson Pro', serif", fontSize: 20, fontWeight: 700 }}>{val > 0 ? "+" : ""}${val.toFixed(2)}</span>
                      </div>
                    );
                  })}
                </div>
                {(() => {
                  const parsed = {}; Object.entries(scores).forEach(([id, v]) => (parsed[id] = parseFloat(v)));
                  const txns = minimizeTransactions(parsed);
                  if (!txns.length) return null;
                  return (
                    <div style={{ marginBottom: 20 }}>
                      <div className="lbl">Who pays whom</div>
                      {txns.map((t, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", marginBottom: 8, borderRadius: 12, background: "rgba(125,206,130,0.06)", border: "1px solid rgba(125,206,130,0.12)" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15 }}>
                            <span>{getEmoji(t.from)}</span><span style={{ fontWeight: 600 }}>{getName(t.from)}</span>
                            <span style={{ opacity: 0.3, fontSize: 18 }}>→</span>
                            <span>{getEmoji(t.to)}</span><span style={{ fontWeight: 600 }}>{getName(t.to)}</span>
                          </div>
                          <span style={{ color: "#7dce82", fontWeight: 700, fontFamily: "'Crimson Pro', serif", fontSize: 20 }}>${t.amount.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
                <div style={{ display: "flex", gap: 10 }}>
                  <button className="btn" onClick={() => setStep(2)} style={{ padding: "14px 20px", borderRadius: 12, background: "rgba(255,255,255,0.06)", color: "rgba(232,220,200,0.6)", fontSize: 15 }}>← Back</button>
                  <button className="btn" onClick={confirmSettle} style={{ flex: 1, padding: 16, borderRadius: 12, fontSize: 16, fontWeight: 600, background: "linear-gradient(135deg, #7dce82, #5aad5f)", color: "#1a2e1a" }}>Confirm & Save ✓</button>
                </div>
              </>
            )}
          </div>
        )}

        {/* PLAYERS */}
        {tab === "players" && (
          <div style={{ animation: "fadeIn 0.3s" }}>
            <div className="lbl">Players · {players.length}/{MAX_PLAYERS}</div>
            {players.map(p => (
              <div key={p.id} className="player-row" onClick={() => setViewPlayer(p.id)}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 24 }}>{p.emoji}</span>
                  <div>
                    <div style={{ fontWeight: 500 }}>{p.name}</div>
                    {(() => {
                      const s = lifetimeStats.find(st => st.id === p.id);
                      if (!s) return <div style={{ fontSize: 11, opacity: 0.3 }}>No games yet</div>;
                      return <div style={{ fontSize: 11, opacity: 0.4 }}>{s.games} games · {s.total > 0 ? "+" : ""}${s.total.toFixed(2)}</div>;
                    })()}
                  </div>
                </div>
                <span style={{ opacity: 0.3, fontSize: 18 }}>›</span>
              </div>
            ))}
            {players.length < MAX_PLAYERS && (
              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === "Enter" && addPlayer()}
                  placeholder="Player name"
                  style={{ flex: 1, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "14px", color: "#e8dcc8", fontSize: 15, outline: "none" }} />
                <button className="btn" onClick={addPlayer} style={{ background: "linear-gradient(135deg, #c9a84c, #a8893a)", color: "#1a2e1a", padding: "14px 22px", borderRadius: 10, fontWeight: 600, fontSize: 15 }}>Add</button>
              </div>
            )}
          </div>
        )}

        {/* HISTORY */}
        {tab === "history" && (
          <div style={{ animation: "fadeIn 0.3s" }}>
            <div className="lbl">Past Sessions · {history.length}</div>
            {!history.length ? (
              <div style={{ textAlign: "center", padding: "50px 20px", opacity: 0.4 }}>No sessions yet</div>
            ) : history.map(h => {
              if (!h.scores) return null;
              const sorted = Object.entries(h.scores).sort((a, b) => b[1] - a[1]);
              return (
                <div key={h.id} className="card" style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <span style={{ fontWeight: 600, color: "#c9a84c" }}>
                      {new Date(h.date).toLocaleDateString("en-SG", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                    </span>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="btn" onClick={() => editSession(h)} style={{ background: "rgba(255,255,255,0.08)", borderRadius: 6, padding: "4px 10px", color: "rgba(232,220,200,0.5)", fontSize: 11 }}>Edit</button>
                      <button className="btn" onClick={() => deleteSession(h.id)} style={{ background: "rgba(232,124,108,0.1)", borderRadius: 6, padding: "4px 10px", color: "rgba(232,124,108,0.5)", fontSize: 11 }}>✕</button>
                    </div>
                  </div>
                  {sorted.map(([id, val]) => (
                    <div key={id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span>{getEmoji(id)}</span><span>{getName(id)}</span></div>
                      <span className={val > 0.005 ? "pos" : val < -0.005 ? "neg" : "zero"}
                        style={{ fontFamily: "'Crimson Pro', serif", fontWeight: 700, fontSize: 16 }}>{val > 0 ? "+" : ""}${val.toFixed(2)}</span>
                    </div>
                  ))}
                  {h.transactions?.length > 0 && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                      <div style={{ fontSize: 11, opacity: 0.3, marginBottom: 6 }}>PAYMENTS</div>
                      {h.transactions.map((t, i) => (
                        <div key={i} style={{ fontSize: 13, opacity: 0.6, padding: "2px 0" }}>
                          {getName(t.from)} → {getName(t.to)}: <span style={{ color: "#7dce82" }}>${t.amount.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* STATS */}
        {tab === "stats" && (
          <div style={{ animation: "fadeIn 0.3s" }}>
            {cumulativeData.length > 1 && chartPlayers.length > 0 && (
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="lbl">Cumulative Scores</div>
                <div style={{ width: "100%", height: 220 }}>
                  <ResponsiveContainer>
                    <LineChart data={cumulativeData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                      <CartesianGrid stroke="rgba(255,255,255,0.04)" />
                      <XAxis dataKey="name" tick={{ fill: "rgba(232,220,200,0.3)", fontSize: 10 }} />
                      <YAxis tick={{ fill: "rgba(232,220,200,0.3)", fontSize: 10 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" />
                      {chartPlayers.map(p => (
                        <Line key={p.id} type="monotone" dataKey={p.id} name={p.name} stroke={getColor(p.id)} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 10, justifyContent: "center" }}>
                  {chartPlayers.map(p => (
                    <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}>
                      <div style={{ width: 10, height: 10, borderRadius: 5, background: getColor(p.id) }} />
                      <span style={{ opacity: 0.6 }}>{p.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="lbl">Lifetime Leaderboard</div>
            {!lifetimeStats.length ? (
              <div style={{ textAlign: "center", padding: "50px 20px", opacity: 0.4 }}>Play some games first!</div>
            ) : lifetimeStats.map((s, i) => {
              const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null;
              return (
                <div key={s.id} onClick={() => setViewPlayer(s.id)} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", marginBottom: 8, borderRadius: 12, cursor: "pointer",
                  background: i === 0 ? "rgba(201,168,76,0.08)" : "rgba(255,255,255,0.03)",
                  border: `1px solid ${i === 0 ? "rgba(201,168,76,0.15)" : "rgba(255,255,255,0.05)"}`,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 20, width: 28, textAlign: "center" }}>
                      {medal || <span style={{ opacity: 0.3, fontSize: 14 }}>#{i + 1}</span>}
                    </span>
                    <span style={{ fontSize: 18 }}>{getEmoji(s.id)}</span>
                    <div>
                      <div style={{ fontWeight: 600 }}>{getName(s.id)}</div>
                      <div style={{ fontSize: 12, opacity: 0.4 }}>{s.games} session{s.games > 1 ? "s" : ""} · {s.wins}W {s.losses}L</div>
                    </div>
                  </div>
                  <span className={s.total > 0.005 ? "pos" : s.total < -0.005 ? "neg" : "zero"}
                    style={{ fontFamily: "'Crimson Pro', serif", fontSize: 22, fontWeight: 700 }}>{s.total > 0 ? "+" : ""}${s.total.toFixed(2)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

