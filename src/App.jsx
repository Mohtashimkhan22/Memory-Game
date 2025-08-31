import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * Memory Match – Single-file React component
 * Tech: React + Tailwind + Framer Motion
 * Features: difficulty, pause/resume, timer, moves, win state, localStorage best score (per difficulty),
 * subtle sounds, responsive layout, mock leaderboard, polished UI.
 *
 * Drop this file into a Vite React project and render <App /> in App.jsx.
 */

// Emoji palette (safe, high-contrast)
const SYMBOLS = [
  "🍎","🍌","🍇","🍊","🍓","🍒","🍋","🥝","🍑","🍍","🥥","🍈",
  "🥑","🥕","🌽","🥦","🫐","🍉","🍔","🍕","🍪","🍩","🍰","🧁",
];

// Mock leaderboard data (stub)
const MOCK_LEADERBOARD = [
  { name: "Champion", moves: 12, time: "00:45" },
  { name: "Pro Gamer", moves: 14, time: "00:52" },
  { name: "Memory Master", moves: 16, time: "01:05" },
  { name: "Quick Thinker", moves: 18, time: "01:12" },
  { name: "New Player", moves: 20, time: "01:30" },
];

const DIFFICULTIES = [
  { id: "easy", label: "Easy (4×4)", cols: 4, rows: 4 }, // 8 pairs
  { id: "medium", label: "Medium (6×4)", cols: 6, rows: 4 }, // 12 pairs
  { id: "hard", label: "Hard (6×6)", cols: 6, rows: 6 }, // 18 pairs
];

const gradientBg = "bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500";

function useBeeps() {
  const ctxRef = useRef(null);
  const ensureCtx = () => {
    if (!ctxRef.current) ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    return ctxRef.current;
  };
  const beep = (freq = 600, dur = 0.06, type = "sine", vol = 0.05) => {
    const ctx = ensureCtx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.value = vol; o.connect(g); g.connect(ctx.destination);
    o.start(); setTimeout(() => o.stop(), dur * 1000);
  };
  return {
    flip: () => beep(660, 0.05, "triangle", 0.035),
    match: () => { beep(880, 0.06, "square", 0.045); setTimeout(() => beep(1046, 0.06, "square", 0.045), 70); },
    win: () => { [880, 987, 1175].forEach((f, i) => setTimeout(() => beep(f, 0.08, "sine", 0.06), i * 110)); },
    click: () => beep(520, 0.04, "sine", 0.03),
  };
}

function useTimer(isRunning) {
  const [seconds, setSeconds] = useState(0);
  const ref = useRef(null);
  useEffect(() => {
    if (isRunning) {
      ref.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    }
    return () => { if (ref.current) clearInterval(ref.current); };
  }, [isRunning]);
  const reset = () => setSeconds(0);
  return { seconds, reset };
}

function formatTime(total) {
  const m = Math.floor(total / 60).toString().padStart(2, "0");
  const s = (total % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function shuffle(array) {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeDeck(pairs) {
  const pick = shuffle(SYMBOLS).slice(0, pairs);
  const deck = shuffle([...pick, ...pick]).map((symbol, i) => ({ id: i, symbol }));
  return deck;
}

function bestKey(diff) { return `mm_best_${diff.cols}x${diff.rows}`; }

function StatTile({ label, value }) {
  return (
    <div className="bg-white/20 rounded-xl p-3 sm:p-4 text-center">
      <div className="text-white/70 text-xs sm:text-sm tracking-wider">{label}</div>
      <div className="text-2xl sm:text-3xl font-bold text-white mt-1">{value}</div>
    </div>
  );
}

function Card({ symbol, flipped, matched, onClick, index }) {
  return (
    <motion.button
      type="button"
      className={`relative aspect-square rounded-2xl border-2 border-white/20 shadow-lg focus:outline-none focus:ring-2 focus:ring-white/60 ${matched ? "ring-2 ring-emerald-300" : ""}`}
      onClick={onClick}
      initial={{ scale: 0.85, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay: index * 0.02, duration: 0.2 }}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      aria-label={flipped ? symbol : "Hidden card"}
    >
      <motion.div
        className={`w-full h-full rounded-2xl ${gradientBg} flex items-center justify-center backface-hidden`}
        style={{ transformStyle: "preserve-3d" }}
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: 0.35 }}
      >
        {/* front */}
        <div className="absolute inset-0 flex items-center justify-center" style={{ backfaceVisibility: "hidden" }}>
          <span className="text-white/90 text-3xl sm:text-4xl">?</span>
        </div>
        {/* back */}
        <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-gradient-to-br from-pink-500 to-rose-500" style={{ transform: "rotateY(180deg)", backfaceVisibility: "hidden" }}>
          <span className="text-3xl sm:text-4xl">{symbol}</span>
        </div>
      </motion.div>
    </motion.button>
  );
}

export default function App() {
  const [difficulty, setDifficulty] = useState(DIFFICULTIES[0]);
  const [deck, setDeck] = useState([]);
  const [flipped, setFlipped] = useState([]); 
  const [matched, setMatched] = useState(new Set());
  const [moves, setMoves] = useState(0);
  const [status, setStatus] = useState("idle");
  const beeps = useBeeps();
  const { seconds, reset } = useTimer(status === "playing");
  const pairs = useMemo(() => (difficulty.cols * difficulty.rows) / 2, [difficulty]);
  const best = useMemo(() => Number(localStorage.getItem(bestKey(difficulty)) ?? Infinity), [difficulty]);

  const start = () => {
    setDeck(makeDeck(pairs));
    setFlipped([]);
    setMatched(new Set());
    setMoves(0);
    reset();
    setStatus("playing");
    beeps.click();
  };

  useEffect(() => { start(); }, [difficulty]);

  const canFlip = (idx) => status === "playing" && !flipped.includes(idx) && !matched.has(idx) && flipped.length < 2;

  const onCard = (idx) => {
    if (!canFlip(idx)) return;
    beeps.flip();
    const next = [...flipped, idx];
    setFlipped(next);
    if (next.length === 2) {
      setMoves((m) => m + 1);
      const [a, b] = next;
      const isMatch = deck[a].symbol === deck[b].symbol;
      setTimeout(() => {
        if (isMatch) {
          beeps.match();
          setMatched((prev) => new Set([...prev, a, b]));
        }
        setFlipped([]);
      }, isMatch ? 320 : 550);
    }
  };

  useEffect(() => {
    if (status === "playing" && matched.size === deck.length && deck.length > 0) {
      setStatus("won");
      beeps.win();
      const key = bestKey(difficulty);
      const currentBest = Number(localStorage.getItem(key) ?? Infinity);
      if (moves < currentBest) localStorage.setItem(key, String(moves));
    }
  }, [matched, deck, status, moves, difficulty]);

  const togglePause = () => {
    if (status === "playing") setStatus("paused");
    else if (status === "paused") setStatus("playing");
    beeps.click();
  };

  const gridTemplate = useMemo(() => ({ gridTemplateColumns: `repeat(${difficulty.cols}, minmax(0, 1fr))` }), [difficulty]);

  return (
    <div className={`min-h-screen ${gradientBg} relative overflow-x-hidden`}> 
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.12),transparent_40%),radial-gradient(circle_at_80%_0%,rgba(255,255,255,0.10),transparent_35%)]" />

      <div className="relative max-w-6xl mx-auto px-4 py-8 sm:py-10">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
          <div className="text-center sm:text-left">
            <h1 className="text-4xl sm:text-5xl font-extrabold text-white drop-shadow">Memory Match</h1>
            <p className="text-white/80 mt-1">Find all pairs with the fewest moves.</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              className="px-3 py-2 rounded-xl bg-white/20 text-white backdrop-blur border border-white/30 hover:bg-white/25"
              value={difficulty.id}
              onChange={(e) => setDifficulty(DIFFICULTIES.find((d) => d.id === e.target.value))}
            >
              {DIFFICULTIES.map((d) => (
                <option key={d.id} value={d.id}>{d.label}</option>
              ))}
            </select>
            <button
              onClick={start}
              className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-semibold shadow"
            >Restart</button>
            <button
              onClick={togglePause}
              className="px-4 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-semibold shadow"
            >{status === "paused" ? "Resume" : "Pause"}</button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <StatTile label="Moves" value={moves} />
          <StatTile label="Time" value={formatTime(seconds)} />
          <StatTile label="Best" value={best === Infinity ? "--" : best} />
        </div>

        {/* Board */}
        <div className="bg-white/10 backdrop-blur rounded-3xl p-4 sm:p-6 shadow-2xl border border-white/20">
          <div className="grid gap-2 sm:gap-3" style={gridTemplate}>
            {deck.map((c, i) => (
              <Card
                key={c.id}
                symbol={c.symbol}
                flipped={flipped.includes(i) || matched.has(i)}
                matched={matched.has(i)}
                onClick={() => onCard(i)}
                index={i}
              />
            ))}
          </div>

          {/* Status banners */}
          <AnimatePresence>
            {status === "paused" && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="mt-4 text-center text-white/90">
                <span className="inline-block px-3 py-1 rounded-full bg-blue-600/80">Game Paused</span>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {status === "won" && (
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ opacity: 0 }}
                className="mt-5 text-center"
              >
                <div className="inline-block px-5 py-4 rounded-2xl bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow">
                  <div className="text-2xl font-bold">🎉 You win!</div>
                  <div className="text-sm mt-1">{moves} moves • {formatTime(seconds)}</div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Leaderboard (mock) */}
        <div className="mt-6 bg-white/10 backdrop-blur rounded-2xl p-4 sm:p-6 border border-white/20">
          <h3 className="text-white text-lg font-semibold mb-3 flex items-center gap-2">
            <span>🏆 Leaderboard</span>
            <span className="text-white/60 text-xs">(local mock)</span>
          </h3>
          <div className="space-y-2">
            {MOCK_LEADERBOARD.map((p, i) => (
              <motion.div
                key={p.name + i}
                initial={{ x: -16, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center justify-between bg-white/5 rounded-xl px-3 py-2 hover:bg-white/10"
              >
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-white text-xs font-bold grid place-items-center">
                    {i + 1}
                  </div>
                  <span className="text-white font-medium">{p.name}</span>
                </div>
                <div className="text-white/80 text-sm">{p.moves} moves • {p.time}</div>
              </motion.div>
            ))}
          </div>
        </div>

        <p className="text-white/80 text-center mt-6 text-sm">Tip: change difficulty for more pairs and challenge 🔥</p>
      </div>
    </div>
  );
}
