import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, Cell } from "recharts";
import { db } from "./firebase";
import {
  collection, doc, setDoc, deleteDoc, onSnapshot, query, orderBy, runTransaction
} from "firebase/firestore";

const MAX_PLAYERS = 20;
const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const AUTH_KEY = "mj-auth-v1";

const SINGAPORE_TIME_ZONE = "Asia/Singapore";
const singaporeDateFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: SINGAPORE_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
});

function getSingaporeDate(value = new Date()) {
  const parts = Object.fromEntries(singaporeDateFormatter.formatToParts(new Date(value)).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function formatGameDate(value, options = { weekday: "short", day: "numeric", month: "short", year: "numeric" }) {
  return new Date(value).toLocaleDateString("en-SG", { ...options, timeZone: SINGAPORE_TIME_ZONE });
}

function sessionDateISO(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const date = new Date(`${day}T20:00:00+08:00`);
  if (Number.isNaN(date.getTime()) || getSingaporeDate(date) !== day) return null;
  return date.toISOString();
}

// BEGIN TEMPORARY DUPLICATE CLEANUP: grouping helper.
// Remove this block and the two matching blocks in MahjongApp after cleanup.
function findDuplicateGroups(history) {
  const groups = new Map();
  history.forEach(session => {
    if (typeof session.date !== "string" || !session.scores || Array.isArray(session.scores)) return;
    const pairs = Object.entries(session.scores).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
    if (!pairs.length || pairs.some(([, score]) => typeof score !== "number" || !Number.isFinite(score))) return;
    const date = session.date.slice(0, 10);
    const key = JSON.stringify([date, pairs]);
    if (!groups.has(key)) groups.set(key, { key, date, pairs, sessions: [] });
    groups.get(key).sessions.push(session);
  });
  return [...groups.values()].filter(group => group.sessions.length > 1).map(group => {
    // Keep the earliest stored date/time. Equal dates use the lowest document ID.
    // genId() starts with a timestamp, but the schema has no authoritative createdAt.
    // Sort copies only; History must remain newest-first.
    const sessions = [...group.sessions].sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    return { ...group, sessions, extras: sessions.slice(1) };
  });
}
// END TEMPORARY DUPLICATE CLEANUP: grouping helper.

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
  const [editingOriginalDate, setEditingOriginalDate] = useState(null);
  const [draftId, setDraftId] = useState(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [saveError, setSaveError] = useState(null);
  const [gameDate, setGameDate] = useState(() => getSingaporeDate());
  const [historyMonth, setHistoryMonth] = useState("all");
  const [historyPlayer, setHistoryPlayer] = useState("all");
  const [deletedSessions, setDeletedSessions] = useState([]);
  const [historyError, setHistoryError] = useState(null);
  const [historyNotice, setHistoryNotice] = useState(null);
  const [sessionBusyIds, setSessionBusyIds] = useState(new Set());
  const sessionBusyRef = useRef(new Set());

  const [viewPlayer, setViewPlayer] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [editingPlayerName, setEditingPlayerName] = useState(null);
  const [editNameVal, setEditNameVal] = useState("");
  const [leaderboardFilter, setLeaderboardFilter] = useState("all");
  const [rivalryAlert, setRivalryAlert] = useState(null);

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

  // BEGIN TEMPORARY DUPLICATE CLEANUP: state and action.
  const [cleaningDuplicates, setCleaningDuplicates] = useState(false);
  const cleanupRef = useRef(false);
  const [cleanupError, setCleanupError] = useState(null);
  const duplicateGroups = useMemo(() => findDuplicateGroups(history), [history]);
  const extraCopyCount = duplicateGroups.reduce((count, group) => count + group.extras.length, 0);

  const removeDuplicateSessions = async () => {
    if (cleanupRef.current || savingRef.current || !extraCopyCount) return;
    const extras = duplicateGroups.flatMap(group => group.extras);
    if (!confirm(`Remove ${extras.length} extra ${extras.length === 1 ? "copy" : "copies"} from ${duplicateGroups.length} duplicate ${duplicateGroups.length === 1 ? "group" : "groups"}?\n\nEach group has the same date and exactly the same player scores. The earliest stored session date/time is kept; tied dates use the lowest document ID.\n\nPlease check the groups first. These deletions cannot be undone here.`)) return;

    cleanupRef.current = true;
    setCleaningDuplicates(true);
    setCleanupError(null);
    let removed = 0;
    try {
      for (const session of extras) {
        await fbDeleteSession(session.id);
        removed += 1;
      }
      // The existing Firestore listener refreshes History and all statistics.
    } catch (err) {
      console.error("Duplicate cleanup failed:", err);
      setCleanupError(`Cleanup stopped after ${removed} confirmed ${removed === 1 ? "deletion" : "deletions"}. Check your connection and permissions, then review the remaining groups and retry.`);
    } finally {
      cleanupRef.current = false;
      setCleaningDuplicates(false);
    }
  };
  // END TEMPORARY DUPLICATE CLEANUP: state and action.

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

  const lastSession = history.find(session => session.scores && Object.keys(session.scores).length >= 2);
  const lastPlayerIds = lastSession ? Object.keys(lastSession.scores).filter(id => players.some(p => p.id === id)).slice(0, 4) : [];
  const currentSingaporeDate = getSingaporeDate();

  const togglePlayer = (id) => {
    setSelPlayers(prev => prev.includes(id) ? prev.filter(p => p !== id) : prev.length < 4 ? [...prev, id] : prev);
  };

  const startScoreEntry = () => {
    if (savingRef.current || selPlayers.length < 2) return;
    // Keep the same ID when going Back or retrying an uncertain/failed save.
    if (!editingSession) setDraftId(current => current || genId());
    setSaveError(null);
    const s = {}; selPlayers.forEach(id => (s[id] = scores[id] ?? "")); setScores(s);
    if (!editingSession && !draftId) setGameDate(getSingaporeDate());
    setStep(2);
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
  const validGameDate = sessionDateISO(gameDate) !== null;

  const confirmSettle = async () => {
    if (savingRef.current) return;
    const sessionId = editingSession || draftId;
    if (!sessionId) {
      setSaveError("No active session draft. Go back to player selection and start score entry again.");
      return;
    }
    if (!scoresValid()) {
      setSaveError("Enter all scores and make sure they total $0.00 before saving.");
      return;
    }
    if (!validGameDate) {
      setSaveError("Choose a valid game date before saving.");
      return;
    }

    // A ref closes the double-tap window before React renders the disabled button.
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      const parsed = {};
      Object.entries(scores).forEach(([id, v]) => (parsed[id] = parseFloat(v)));
      // Calculate against the pre-save rankings, but show alerts only after success.
      const alerts = editingSession ? [] : detectRivalries(parsed, sessionId);
      const session = {
        id: sessionId,
        date: sessionDateISO(gameDate),
        scores: parsed,
        transactions: minimizeTransactions(parsed),
      };
      await fbSaveSession(session);
      if (alerts.length > 0) setRivalryAlert(alerts);
      setHistoryNotice(editingSession ? "Changes saved." : "Game saved.");
      setHistoryMonth("all");
      setHistoryPlayer("all");
      resetForm();
      setTab("history");
    } catch (err) {
      console.error("Session save failed:", err);
      setSaveError("Couldn't save the session. Your scores and date are still here. Check your connection and permissions, then try again.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const resetForm = () => { setSelPlayers([]); setScores({}); setStep(1); setEditingSession(null); setEditingOriginalDate(null); setDraftId(null); setSaveError(null); setGameDate(getSingaporeDate()); };

  const cancelEditing = () => {
    if (savingRef.current) return;
    resetForm();
    setTab("history");
  };

  const editSession = (session) => {
    if (savingRef.current || sessionBusyRef.current.has(session.id)) return;
    setDraftId(null);
    setSaveError(null);
    setEditingSession(session.id);
    setEditingOriginalDate(session.date);
    const ids = Object.keys(session.scores);
    setSelPlayers(ids);
    const s = {}; ids.forEach(id => (s[id] = session.scores[id].toString()));
    setScores(s); setGameDate(getSingaporeDate(session.date)); setStep(2); setTab("new");
  };

  const setSessionBusy = (id, busy) => {
    if (busy) sessionBusyRef.current.add(id);
    else sessionBusyRef.current.delete(id);
    setSessionBusyIds(new Set(sessionBusyRef.current));
  };

  const deleteSession = async (session) => {
    if (savingRef.current || sessionBusyRef.current.has(session.id)) return;
    if (!confirm(`Delete the game from ${formatGameDate(session.date)}?\n\nYou can undo this while this page stays open.`)) return;
    setSessionBusy(session.id, true);
    setHistoryError(null);
    setHistoryNotice(null);
    // End this edit now; a delayed delete response must not reset a newer draft.
    if (editingSession === session.id) resetForm();
    try {
      await fbDeleteSession(session.id);
      setDeletedSessions(prev => [session, ...prev.filter(s => s.id !== session.id)]);
    } catch (err) {
      console.error("Session deletion failed:", err);
      setHistoryError("Couldn't delete that game. Check your connection and try again.");
    } finally {
      setSessionBusy(session.id, false);
    }
  };

  const undoDelete = async (session) => {
    if (sessionBusyRef.current.has(session.id)) return;
    setSessionBusy(session.id, true);
    setHistoryError(null);
    try {
      // Restore the same ID without overwriting a copy restored/edited elsewhere.
      await runTransaction(db, async transaction => {
        const ref = doc(db, "sessions", session.id);
        const existing = await transaction.get(ref);
        if (existing.exists()) throw new Error("session-already-exists");
        transaction.set(ref, { date: session.date, scores: session.scores, transactions: session.transactions || [] });
      });
      setDeletedSessions(prev => prev.filter(s => s.id !== session.id));
      setHistoryMonth("all");
      setHistoryPlayer("all");
      setHistoryNotice("Game restored.");
    } catch (err) {
      console.error("Undo deletion failed:", err);
      setHistoryError(err.message === "session-already-exists"
        ? "This game is already in History. Its existing scores have been kept."
        : "Couldn't restore that game. Keep this page open and try Undo again.");
    } finally {
      setSessionBusy(session.id, false);
    }
  };

  const historyMonths = useMemo(() => [...new Set(history.map(h => getSingaporeDate(h.date).slice(0, 7)))].sort().reverse(), [history]);
  const historyPlayerIds = useMemo(() => [...new Set(history.flatMap(h => Object.keys(h.scores || {})))].sort((a, b) => getName(a).localeCompare(getName(b))), [history, players]);
  const filteredHistory = useMemo(() => history.filter(h =>
    (historyMonth === "all" || getSingaporeDate(h.date).startsWith(historyMonth)) &&
    (historyPlayer === "all" || Object.prototype.hasOwnProperty.call(h.scores || {}, historyPlayer))
  ), [history, historyMonth, historyPlayer]);

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
      const point = { name: formatGameDate(h.date, { day: "numeric", month: "short" }), idx: i + 1 };
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
        name: formatGameDate(h.date, { day: "numeric", month: "short" }),
        score: h.scores[playerId],
        cumulative: parseFloat(cumulative.toFixed(2)),
      };
    });
  };

  // ─── Head-to-head stats ───
  const getHeadToHead = (playerId) => {
    const h2h = {};
    history.forEach(session => {
      if (!session.scores || session.scores[playerId] === undefined) return;
      const myScore = session.scores[playerId];
      Object.entries(session.scores).forEach(([oppId, oppScore]) => {
        if (oppId === playerId) return;
        if (!h2h[oppId]) h2h[oppId] = { games: 0, wins: 0, losses: 0, draws: 0, myTotal: 0, oppTotal: 0 };
        h2h[oppId].games += 1;
        h2h[oppId].myTotal += myScore;
        h2h[oppId].oppTotal += oppScore;
        if (myScore > oppScore) h2h[oppId].wins += 1;
        else if (myScore < oppScore) h2h[oppId].losses += 1;
        else h2h[oppId].draws += 1;
      });
    });
    return Object.entries(h2h)
      .map(([id, s]) => ({ id, ...s }))
      .sort((a, b) => b.games - a.games);
  };

  // ─── Streak tracking ───
  const getPlayerStreaks = (playerId) => {
    const sorted = [...history].filter(h => h.scores && h.scores[playerId] !== undefined);
    let currentStreak = { type: null, count: 0 };
    let bestWin = 0, bestLoss = 0;
    let tempType = null, tempCount = 0;
    sorted.forEach(h => {
      const score = h.scores[playerId];
      const type = score > 0.005 ? "W" : score < -0.005 ? "L" : "D";
      if (type === tempType) { tempCount += 1; }
      else { tempType = type; tempCount = 1; }
      if (tempType === "W" && tempCount > bestWin) bestWin = tempCount;
      if (tempType === "L" && tempCount > bestLoss) bestLoss = tempCount;
    });
    // Current streak (most recent)
    if (sorted.length > 0) {
      const lastScore = sorted[0].scores[playerId];
      const lastType = lastScore > 0.005 ? "W" : lastScore < -0.005 ? "L" : "D";
      let count = 0;
      for (const h of sorted) {
        const s = h.scores[playerId];
        const t = s > 0.005 ? "W" : s < -0.005 ? "L" : "D";
        if (t === lastType) count++;
        else break;
      }
      currentStreak = { type: lastType, count };
    }
    return { currentStreak, bestWinStreak: bestWin, bestLossStreak: bestLoss };
  };

  // ─── Export CSV ───
  const exportCSV = (sessions = history) => {
    const allPlayerIds = [...new Set(sessions.flatMap(h => h.scores ? Object.keys(h.scores) : []))];
    const header = ["Date", ...allPlayerIds.map(id => getName(id))];
    const rows = sessions.map(h => {
      const date = formatGameDate(h.date, { day: "numeric", month: "short", year: "numeric" });
      const scores = allPlayerIds.map(id => h.scores?.[id] !== undefined ? h.scores[id].toFixed(2) : "");
      return [date, ...scores];
    });
    const csv = [header, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `mahjong-scores-${getSingaporeDate()}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  // ─── WhatsApp share ───
  const shareWhatsApp = () => {
    const parsed = {}; Object.entries(scores).forEach(([id, v]) => (parsed[id] = parseFloat(v)));
    const txns = minimizeTransactions(parsed);
    const dateStr = formatGameDate(gameDate, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
    let msg = `🀄 *Mahjong Settlement* — ${dateStr}\n\n`;
    msg += `*Scores:*\n`;
    Object.entries(parsed).sort((a, b) => b[1] - a[1]).forEach(([id, val]) => {
      msg += `${getEmoji(id)} ${getName(id)}: ${val > 0 ? "+" : ""}$${val.toFixed(2)}\n`;
    });
    if (txns.length) {
      msg += `\n*Payments:*\n`;
      txns.forEach(t => {
        msg += `${getName(t.from)} → ${getName(t.to)}: $${t.amount.toFixed(2)}\n`;
      });
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  };

  // ─── Filtered leaderboard ───
  const filteredStats = useMemo(() => {
    const now = currentSingaporeDate;
    const filtered = history.filter(h => {
      if (!h.scores) return false;
      if (leaderboardFilter === "all") return true;
      const day = getSingaporeDate(h.date);
      if (leaderboardFilter === "month") return day.slice(0, 7) === now.slice(0, 7);
      if (leaderboardFilter === "year") return day.slice(0, 4) === now.slice(0, 4);
      return true;
    });
    const stats = {};
    filtered.forEach(h => {
      Object.entries(h.scores).forEach(([id, score]) => {
        if (!stats[id]) stats[id] = { total: 0, games: 0, wins: 0, losses: 0 };
        stats[id].total += score; stats[id].games += 1;
        if (score > 0) stats[id].wins += 1;
        if (score < 0) stats[id].losses += 1;
      });
    });
    return Object.entries(stats).map(([id, s]) => ({ id, ...s })).sort((a, b) => b.total - a.total);
  }, [history, leaderboardFilter, currentSingaporeDate]);

  // ─── Hall of Shame ───
  const hallOfShame = useMemo(() => {
    let worst = { id: null, score: 0, date: null };
    let biggest = { id: null, score: 0, date: null };
    history.forEach(h => {
      if (!h.scores) return;
      Object.entries(h.scores).forEach(([id, score]) => {
        if (score < worst.score) worst = { id, score, date: h.date };
        if (score > biggest.score) biggest = { id, score, date: h.date };
      });
    });
    return { worst, biggest };
  }, [history]);

  // ─── Rivalry detection ───
  const detectRivalries = (newScores, sessionId) => {
    // Build old rankings from history
    const oldTotals = {};
    history.forEach(h => {
      // A previous attempt may already be visible in a local/server snapshot.
      if (!h.scores || h.id === sessionId) return;
      Object.entries(h.scores).forEach(([id, score]) => {
        oldTotals[id] = (oldTotals[id] || 0) + score;
      });
    });
    const oldRanking = Object.entries(oldTotals).sort((a, b) => b[1] - a[1]).map(([id]) => id);

    // Build new rankings including this session
    const newTotals = { ...oldTotals };
    Object.entries(newScores).forEach(([id, score]) => {
      newTotals[id] = (newTotals[id] || 0) + score;
    });
    const newRanking = Object.entries(newTotals).sort((a, b) => b[1] - a[1]).map(([id]) => id);

    // Check for overtakes
    const alerts = [];
    newRanking.forEach((id, newPos) => {
      const oldPos = oldRanking.indexOf(id);
      if (oldPos > 0 && newPos < oldPos) {
        const overtaken = oldRanking[newPos];
        if (overtaken && overtaken !== id) {
          alerts.push(`${getEmoji(id)} ${getName(id)} overtakes ${getEmoji(overtaken)} ${getName(overtaken)} to #${newPos + 1}!`);
        }
      }
    });
    return alerts;
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
    .btn:disabled, .tab-btn:disabled { cursor: default; opacity: 0.5; }
    .history-action { min-height: 44px; padding: 10px 14px; border-radius: 9px; font-size: 13px; font-weight: 500; }
    .history-filter { width: 100%; min-height: 44px; margin-top: 6px; padding: 10px; border-radius: 9px; border: 1px solid rgba(255,255,255,0.16); background: #203420; color: #e8dcc8; font: inherit; font-size: 14px; color-scheme: dark; }
    .btn:focus-visible, .tab-btn:focus-visible, .history-filter:focus-visible, summary:focus-visible { outline: 2px solid #c9a84c; outline-offset: 3px; }
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

          {/* Streaks */}
          {stats && (() => {
            const streaks = getPlayerStreaks(viewPlayer);
            return (
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="lbl">Streaks</div>
                {[
                  ["Current", streaks.currentStreak.count > 0
                    ? `${streaks.currentStreak.count}${streaks.currentStreak.type}`
                    : "—",
                    streaks.currentStreak.type === "W" ? "#7dce82" : streaks.currentStreak.type === "L" ? "#e87c6c" : "#c9a84c"
                  ],
                  ["Best win streak", streaks.bestWinStreak > 0 ? `${streaks.bestWinStreak}W` : "—", "#7dce82"],
                  ["Worst loss streak", streaks.bestLossStreak > 0 ? `${streaks.bestLossStreak}L` : "—", "#e87c6c"],
                ].map(([label, value, color], i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: i < 2 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                    <span style={{ opacity: 0.6, fontSize: 14 }}>{label}</span>
                    <span style={{ fontFamily: "'Crimson Pro', serif", fontWeight: 700, fontSize: 16, color }}>{value}</span>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Head-to-Head */}
          {stats && (() => {
            const h2h = getHeadToHead(viewPlayer);
            if (!h2h.length) return null;
            return (
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="lbl">Head-to-Head</div>
                {h2h.map((opp, i) => {
                  const oppPlayer = players.find(p => p.id === opp.id);
                  if (!oppPlayer) return null;
                  const winPct = opp.games > 0 ? (opp.wins / opp.games * 100).toFixed(0) : 0;
                  return (
                    <div key={opp.id} style={{ padding: "12px 0", borderBottom: i < h2h.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 18 }}>{oppPlayer.emoji}</span>
                          <span style={{ fontWeight: 500, fontSize: 14 }}>{oppPlayer.name}</span>
                        </div>
                        <span style={{ fontSize: 13, opacity: 0.5 }}>{opp.games} games</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
                        <div style={{ flex: 1, height: 6, borderRadius: 3, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                          <div style={{
                            height: "100%", borderRadius: 3,
                            width: `${winPct}%`,
                            background: parseInt(winPct) >= 50 ? "#7dce82" : "#e87c6c",
                            transition: "width 0.3s",
                          }} />
                        </div>
                        <span style={{
                          fontSize: 13, fontWeight: 700, fontFamily: "'Crimson Pro', serif",
                          color: opp.wins > opp.losses ? "#7dce82" : opp.wins < opp.losses ? "#e87c6c" : "#c9a84c",
                        }}>
                          {opp.wins}W {opp.losses}L{opp.draws > 0 ? ` ${opp.draws}D` : ""}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

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
        {[["new", editingSession ? "Edit Game" : "New Game"], ["players", "Players"], ["history", "History"], ["stats", "Stats"]].map(([key, label]) => (
          <button key={key} className={`tab-btn ${tab === key ? "tab-active" : ""}`} disabled={saving} onClick={() => { if (!savingRef.current) setTab(key); }}>{label}</button>
        ))}
      </div>

      <div style={{ padding: 20 }}>

        {/* NEW GAME */}
        {tab === "new" && (
          <div style={{ animation: "fadeIn 0.3s" }}>
            {editingSession && (
              <div className="card" style={{ marginBottom: 20, borderColor: "rgba(201,168,76,0.35)" }}>
                <div style={{ color: "#c9a84c", fontWeight: 600, marginBottom: 6 }}>Editing game from {formatGameDate(editingOriginalDate)}</div>
                <div style={{ fontSize: 13, lineHeight: 1.5, opacity: 0.75 }}>Review your changes before saving. Cancel keeps the original game.</div>
                <button className="btn history-action" disabled={saving} onClick={cancelEditing} style={{ marginTop: 10, background: "rgba(255,255,255,0.08)", color: "#e8dcc8" }}>Cancel editing</button>
              </div>
            )}
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
                    {!editingSession && lastSession && (
                      <div style={{ marginBottom: 18 }}>
                        <button className="btn" disabled={lastPlayerIds.length < 2} onClick={() => setSelPlayers([...lastPlayerIds])} style={{
                          width: "100%", padding: "13px 16px", minHeight: 44, borderRadius: 12, fontSize: 14, fontWeight: 600,
                          background: "rgba(201,168,76,0.12)", color: "#c9a84c", border: "1px solid rgba(201,168,76,0.3)",
                        }}>Same players as last time</button>
                        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7, lineHeight: 1.5 }}>
                          {lastPlayerIds.map(getName).join(" · ")}
                          {lastPlayerIds.length !== Object.keys(lastSession.scores).length && <div>Some players from that game are no longer in the player list. Choose your group below.</div>}
                        </div>
                      </div>
                    )}
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
                <label className="lbl" htmlFor="game-date" style={{ display: "block" }}>Game date · Singapore</label>
                <input id="game-date" type="date" required aria-invalid={!validGameDate} value={gameDate} onChange={e => setGameDate(e.target.value)}
                  style={{
                    width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 10, padding: "12px 14px", color: "#c9a84c", fontSize: 15,
                    fontFamily: "'Outfit', sans-serif", outline: "none", marginBottom: 20,
                    colorScheme: "dark",
                  }} />
                {!validGameDate && <div role="alert" style={{ color: "#e87c6c", fontSize: 13, marginBottom: 16 }}>Choose a valid game date to continue.</div>}
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
                  <button className="btn" disabled={!scoresValid() || !validGameDate} onClick={() => { if (scoresValid() && validGameDate) setStep(3); }} style={{
                    flex: 1, padding: 16, borderRadius: 12, fontSize: 16, fontWeight: 600,
                    background: scoresValid() && validGameDate ? "linear-gradient(135deg, #c9a84c, #a8893a)" : "rgba(255,255,255,0.06)",
                    color: scoresValid() && validGameDate ? "#1a2e1a" : "rgba(232,220,200,0.2)",
                  }}>{editingSession ? "Review changes →" : "Settle Up →"}</button>
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
                {saveError && (
                  <div role="alert" style={{ marginBottom: 12, color: "#e87c6c", fontSize: 13, lineHeight: 1.5 }}>{saveError}</div>
                )}
                <div style={{ display: "flex", gap: 10 }}>
                  <button className="btn" disabled={saving} onClick={() => { if (!savingRef.current) setStep(2); }} style={{ padding: "14px 20px", borderRadius: 12, background: "rgba(255,255,255,0.06)", color: "rgba(232,220,200,0.6)", fontSize: 15 }}>← Back</button>
                  <button className="btn" disabled={saving} aria-busy={saving} onClick={confirmSettle} style={{ flex: 1, padding: 16, borderRadius: 12, fontSize: 16, fontWeight: 600, background: "linear-gradient(135deg, #7dce82, #5aad5f)", color: "#1a2e1a" }}>{saving ? "Saving…" : editingSession ? "Save changes" : "Confirm & Save ✓"}</button>
                </div>
                <button className="btn" onClick={shareWhatsApp} style={{
                  width: "100%", marginTop: 10, padding: 14, borderRadius: 12, fontSize: 14, fontWeight: 600,
                  background: "rgba(37,211,102,0.12)", color: "#25d366",
                  border: "1px solid rgba(37,211,102,0.25)",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                }}>
                  📱 Share via WhatsApp
                </button>
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
            {/* BEGIN TEMPORARY DUPLICATE CLEANUP: History card. */}
            {cleanupError && (
              <div role="alert" style={{ marginBottom: 14, color: "#e87c6c", fontSize: 13, lineHeight: 1.5 }}>{cleanupError}</div>
            )}
            {duplicateGroups.length > 0 && (
              <div className="card" style={{ marginBottom: 20, borderColor: "rgba(201,168,76,0.3)" }}>
                <div style={{ color: "#c9a84c", fontWeight: 600, marginBottom: 8 }}>Possible duplicates</div>
                <div style={{ fontSize: 12, opacity: 0.6, lineHeight: 1.5, marginBottom: 12 }}>
                  These sessions have the same date and identical player scores. Review them before removing extra copies.
                </div>
                {duplicateGroups.map(group => (
                  <div key={group.key} style={{ padding: "12px 0", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 8, fontSize: 13 }}>
                      <span style={{ fontWeight: 600 }}>{group.date}</span>
                      <span style={{ color: "#c9a84c" }}>{group.sessions.length} copies</span>
                    </div>
                    {group.pairs.map(([id, score]) => (
                      <div key={id} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "3px 0", fontSize: 13 }}>
                        <span>{getEmoji(id)} {getName(id) === "Unknown" ? `Unknown (${id})` : getName(id)}</span>
                        <span className={score > 0.005 ? "pos" : score < -0.005 ? "neg" : "zero"}>{score > 0 ? "+" : ""}${score.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                ))}
                <button className="btn" disabled={cleaningDuplicates || saving} onClick={removeDuplicateSessions} style={{
                  width: "100%", marginTop: 12, padding: 14, borderRadius: 12, fontSize: 14, fontWeight: 600,
                  background: "rgba(232,124,108,0.12)", color: "#e87c6c", border: "1px solid rgba(232,124,108,0.25)",
                }}>{cleaningDuplicates ? "Removing…" : `Remove ${extraCopyCount} extra ${extraCopyCount === 1 ? "copy" : "copies"}`}</button>
              </div>
            )}
            {/* END TEMPORARY DUPLICATE CLEANUP: History card. */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div className="lbl" style={{ marginBottom: 0 }}>Past Sessions · {history.length}</div>
              {history.length > 0 && (
                <button className="btn" disabled={!filteredHistory.length} onClick={() => exportCSV(filteredHistory)} style={{
                  padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 500,
                  background: "rgba(201,168,76,0.1)", color: "#c9a84c",
                  border: "1px solid rgba(201,168,76,0.2)",
                }}>{historyMonth === "all" && historyPlayer === "all" ? "📥 Export CSV" : "📥 Export shown"}</button>
              )}
            </div>
            {historyNotice && <div role="status" style={{ color: "#7dce82", fontSize: 13, marginBottom: 14 }}>{historyNotice}</div>}
            {historyError && <div role="alert" style={{ color: "#e87c6c", fontSize: 13, lineHeight: 1.5, marginBottom: 14 }}>{historyError}</div>}
            {deletedSessions.length > 0 && (
              <div className="card" style={{ marginBottom: 16 }}>
                {deletedSessions.map(session => (
                  <div key={session.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
                    <span style={{ fontSize: 13 }}>Deleted game from {formatGameDate(session.date, { day: "numeric", month: "short", year: "numeric" })}</span>
                    <button className="btn history-action" disabled={sessionBusyIds.has(session.id)} onClick={() => undoDelete(session)} style={{ background: "rgba(201,168,76,0.15)", color: "#c9a84c", flexShrink: 0 }}>{sessionBusyIds.has(session.id) ? "Restoring…" : "Undo"}</button>
                  </div>
                ))}
                <div style={{ fontSize: 12, lineHeight: 1.5, opacity: 0.7 }}>Undo is available until you refresh or close this page.</div>
              </div>
            )}
            {(history.length > 0 || historyMonth !== "all" || historyPlayer !== "all") && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <label style={{ fontSize: 12, color: "rgba(232,220,200,0.75)", minWidth: 0 }}>Month
                    <select className="history-filter" value={historyMonth} onChange={e => setHistoryMonth(e.target.value)}>
                      <option value="all">All months</option>
                      {[...new Set([...historyMonths, ...(historyMonth !== "all" ? [historyMonth] : [])])].sort().reverse().map(month => (
                        <option key={month} value={month}>{formatGameDate(`${month}-01`, { month: "long", year: "numeric" })}</option>
                      ))}
                    </select>
                  </label>
                  <label style={{ fontSize: 12, color: "rgba(232,220,200,0.75)", minWidth: 0 }}>Player
                    <select className="history-filter" value={historyPlayer} onChange={e => setHistoryPlayer(e.target.value)}>
                      <option value="all">All players</option>
                      {[...new Set([...historyPlayerIds, ...(historyPlayer !== "all" ? [historyPlayer] : [])])].map(id => (
                        <option key={id} value={id}>{getName(id) === "Unknown" ? `Removed player (${id})` : getName(id)}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 8 }}>
                  <span style={{ fontSize: 12, opacity: 0.7 }}>Showing {filteredHistory.length} of {history.length} games</span>
                  {(historyMonth !== "all" || historyPlayer !== "all") && <button className="btn history-action" onClick={() => { setHistoryMonth("all"); setHistoryPlayer("all"); }} style={{ color: "#c9a84c", background: "transparent" }}>Clear filters</button>}
                </div>
              </div>
            )}
            {!history.length ? (
              <div style={{ textAlign: "center", padding: "50px 20px", opacity: 0.4 }}>No sessions yet</div>
            ) : !filteredHistory.length ? (
              <div style={{ textAlign: "center", padding: "40px 20px", opacity: 0.7, fontSize: 14 }}>No games match these filters. Try another month or player.</div>
            ) : filteredHistory.map(h => {
              if (!h.scores) return null;
              const sorted = Object.entries(h.scores).sort((a, b) => b[1] - a[1]);
              return (
                <div key={h.id} className="card" style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
                    <span style={{ fontWeight: 600, color: "#c9a84c" }}>
                      {formatGameDate(h.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                    </span>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="btn history-action" disabled={sessionBusyIds.has(h.id)} onClick={() => editSession(h)} style={{ background: "rgba(255,255,255,0.08)", color: "#e8dcc8" }}>Edit</button>
                      <button className="btn history-action" disabled={sessionBusyIds.has(h.id)} onClick={() => deleteSession(h)} style={{ background: "rgba(232,124,108,0.1)", color: "#e87c6c" }}>{sessionBusyIds.has(h.id) ? "Deleting…" : "Delete"}</button>
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
                    <details style={{ marginTop: 10, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                      <summary style={{ minHeight: 44, padding: "13px 0", cursor: "pointer", color: "#c9a84c", fontSize: 13 }}>Who pays whom · {h.transactions.length} {h.transactions.length === 1 ? "payment" : "payments"}</summary>
                      {h.transactions.map((t, i) => (
                        <div key={i} style={{ fontSize: 13, opacity: 0.6, padding: "2px 0" }}>
                          {getName(t.from)} → {getName(t.to)}: <span style={{ color: "#7dce82" }}>${t.amount.toFixed(2)}</span>
                        </div>
                      ))}
                    </details>
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

            {/* Hall of Fame & Shame */}
            {(hallOfShame.biggest.id || hallOfShame.worst.id) && (
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="lbl">Records</div>
                {hallOfShame.biggest.id && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: hallOfShame.worst.id ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 20 }}>🏆</span>
                      <div>
                        <div style={{ fontSize: 12, opacity: 0.4 }}>Biggest Win Ever</div>
                        <div style={{ fontWeight: 500 }}>{getEmoji(hallOfShame.biggest.id)} {getName(hallOfShame.biggest.id)}</div>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <span className="pos" style={{ fontFamily: "'Crimson Pro', serif", fontWeight: 700, fontSize: 18 }}>+${hallOfShame.biggest.score.toFixed(2)}</span>
                      <div style={{ fontSize: 10, opacity: 0.3 }}>{formatGameDate(hallOfShame.biggest.date, { day: "numeric", month: "short" })}</div>
                    </div>
                  </div>
                )}
                {hallOfShame.worst.id && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 20 }}>💀</span>
                      <div>
                        <div style={{ fontSize: 12, opacity: 0.4 }}>Hall of Shame</div>
                        <div style={{ fontWeight: 500 }}>{getEmoji(hallOfShame.worst.id)} {getName(hallOfShame.worst.id)}</div>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <span className="neg" style={{ fontFamily: "'Crimson Pro', serif", fontWeight: 700, fontSize: 18 }}>${hallOfShame.worst.score.toFixed(2)}</span>
                      <div style={{ fontSize: 10, opacity: 0.3 }}>{formatGameDate(hallOfShame.worst.date, { day: "numeric", month: "short" })}</div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Leaderboard filter tabs */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div className="lbl" style={{ marginBottom: 0 }}>Leaderboard</div>
              <div style={{ display: "flex", gap: 4 }}>
                {[["all", "All Time"], ["year", currentSingaporeDate.slice(0, 4)], ["month", formatGameDate(currentSingaporeDate, { month: "short" })]].map(([key, label]) => (
                  <button key={key} className="btn" onClick={() => setLeaderboardFilter(key)} style={{
                    padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                    background: leaderboardFilter === key ? "rgba(201,168,76,0.2)" : "rgba(255,255,255,0.04)",
                    color: leaderboardFilter === key ? "#c9a84c" : "rgba(232,220,200,0.4)",
                    border: `1px solid ${leaderboardFilter === key ? "rgba(201,168,76,0.3)" : "rgba(255,255,255,0.06)"}`,
                  }}>{label}</button>
                ))}
              </div>
            </div>
            {!filteredStats.length ? (
              <div style={{ textAlign: "center", padding: "50px 20px", opacity: 0.4 }}>No sessions in this period</div>
            ) : filteredStats.map((s, i) => {
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

      {/* Rivalry Alert Popup */}
      {rivalryAlert && (
        <div onClick={() => setRivalryAlert(null)} style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999,
          background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center",
          padding: 20, cursor: "pointer",
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: "linear-gradient(135deg, #1a2e1a, #2a3f2a)", borderRadius: 20, padding: "28px 24px",
            maxWidth: 340, width: "100%", textAlign: "center",
            border: "1px solid rgba(201,168,76,0.3)", boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
            animation: "fadeIn 0.3s",
          }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>⚔️</div>
            <div style={{ fontFamily: "'Crimson Pro', serif", fontSize: 22, fontWeight: 700, color: "#c9a84c", marginBottom: 16 }}>
              Ranking Shakeup!
            </div>
            {rivalryAlert.map((alert, i) => (
              <div key={i} style={{ fontSize: 15, marginBottom: 8, lineHeight: 1.5 }}>{alert}</div>
            ))}
            <button className="btn" onClick={() => setRivalryAlert(null)} style={{
              marginTop: 16, padding: "12px 32px", borderRadius: 12, fontSize: 15, fontWeight: 600,
              background: "rgba(201,168,76,0.2)", color: "#c9a84c", border: "1px solid rgba(201,168,76,0.3)",
            }}>Nice 🔥</button>
          </div>
        </div>
      )}
    </div>
  );
}
