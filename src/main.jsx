import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import hsk1 from "./data/hsk1.json";
import hsk2 from "./data/hsk2.json";
import hsk3 from "./data/hsk3.json";
import {
  LayoutDashboard, BookOpen, Gamepad2, PenLine, ClipboardCheck,
  BarChart3, Settings, Flame, Search, Volume2, Star, ChevronRight,
  Trophy, Target, Headphones, Languages, Puzzle, CheckCircle2,
  UserCheck, RefreshCw, CreditCard, ShieldCheck
} from "lucide-react";
import "./styles.css";
import { supabase } from "./lib/supabaseClient.js";

const words = [
  ...hsk1.map((w) => ({
    chinese: w.word,
    pinyin: w.pinyin,
    meaning: w.meaning,
    example: "",
    level: "HSK 1"
  })),
  ...hsk2.map((w) => ({
    chinese: w.word,
    pinyin: w.pinyin,
    meaning: w.meaning,
    example: "",
    level: "HSK 2"
  })),
  ...hsk3.map((w) => ({
    chinese: w.word,
    pinyin: w.pinyin,
    meaning: w.meaning,
    example: "",
    level: "HSK 3"
  }))
];
   


const LEARNING_PROGRESS_KEY = "hsk-learning-progress-v1";
const MASTERY_CORRECT_ANSWERS = 3;
const DEFAULT_DAILY_GOAL = 30;
const XP_CORRECT = 10;
const XP_PRACTICE = 2;
const XP_EXAM_BONUS = 20;

function emptyLearningProgress() {
  return {
    practiced: {},
    correctCounts: {},
    examHistory: [],
    activityDays: {},
    reviewSchedule: {},
    xp: 0,
    dailyGoal: DEFAULT_DAILY_GOAL
  };
}

function readLearningProgress() {
  if (typeof window === "undefined") return emptyLearningProgress();

  try {
    const raw = window.localStorage.getItem(LEARNING_PROGRESS_KEY);
    if (!raw) return emptyLearningProgress();

    const parsed = JSON.parse(raw);
    return {
      practiced: parsed.practiced || {},
      correctCounts: parsed.correctCounts || {},
      examHistory: Array.isArray(parsed.examHistory) ? parsed.examHistory : [],
      activityDays: parsed.activityDays || {},
      reviewSchedule: parsed.reviewSchedule || {},
      xp: Number(parsed.xp || 0),
      dailyGoal: Number(parsed.dailyGoal || DEFAULT_DAILY_GOAL)
    };
  } catch {
    return emptyLearningProgress();
  }
}

function notifyProgressChange() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("learning-progress-updated"));
  }
}

function saveLearningProgress(data) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LEARNING_PROGRESS_KEY, JSON.stringify(data));
    notifyProgressChange();
  } catch {}
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function progressWordKey(word) {
  return `${word.level}|${word.chinese}`;
}

function markActiveDay(data, wordKey = null) {
  const dayKey = localDateKey();
  if (!data.activityDays[dayKey]) {
    data.activityDays[dayKey] = { words: {}, exams: 0 };
  }
  if (!data.activityDays[dayKey].words) data.activityDays[dayKey].words = {};
  if (wordKey) data.activityDays[dayKey].words[wordKey] = true;
  return data.activityDays[dayKey];
}

function calculateReviewDate(correctCount, isCorrect, rating) {
  const now = new Date();

  if (rating === "again" || (!isCorrect && !rating)) {
    return new Date(now.getTime() + 10 * 60 * 1000);
  }
  if (rating === "hard") return addDays(now, 1);

  if (rating === "easy") {
    const days = correctCount <= 1 ? 3 : correctCount === 2 ? 7 : correctCount === 3 ? 14 : 30;
    return addDays(now, days);
  }

  const days = correctCount <= 1 ? 1 : correctCount === 2 ? 3 : correctCount === 3 ? 7 : correctCount === 4 ? 14 : 30;
  return addDays(now, days);
}

function recordWordActivity(word, isCorrect = false, rating = null) {
  if (!word) return;

  const data = readLearningProgress();
  const key = progressWordKey(word);
  const now = new Date();

  data.practiced[key] = {
    level: word.level,
    chinese: word.chinese,
    lastPracticedAt: now.toISOString()
  };

  if (isCorrect) {
    data.correctCounts[key] = (data.correctCounts[key] || 0) + 1;
  }

  data.xp += isCorrect ? XP_CORRECT : XP_PRACTICE;
  markActiveDay(data, key);

  const correctCount = data.correctCounts[key] || 0;
  const nextReview = calculateReviewDate(correctCount, isCorrect, rating);
  data.reviewSchedule[key] = {
    level: word.level,
    chinese: word.chinese,
    lastReviewedAt: now.toISOString(),
    nextReviewAt: nextReview.toISOString(),
    lastResult: rating || (isCorrect ? "correct" : "again")
  };

  saveLearningProgress(data);
}

function recordExamCompletion(level, percent) {
  const data = readLearningProgress();
  const today = markActiveDay(data);
  today.exams = Number(today.exams || 0) + 1;
  data.xp += XP_EXAM_BONUS;
  data.examHistory.push({
    level,
    percent,
    completedAt: new Date().toISOString()
  });
  saveLearningProgress(data);
}

function setDailyGoalValue(value) {
  const data = readLearningProgress();
  data.dailyGoal = Number(value) || DEFAULT_DAILY_GOAL;
  saveLearningProgress(data);
}

function getCurrentStreak(activityDays) {
  const hasActivity = (key) => {
    const day = activityDays[key];
    if (!day) return false;
    const wordCount = day.words ? Object.keys(day.words).length : 0;
    return wordCount > 0 || Number(day.exams || 0) > 0;
  };

  let cursor = new Date();
  if (!hasActivity(localDateKey(cursor))) {
    cursor = addDays(cursor, -1);
    if (!hasActivity(localDateKey(cursor))) return 0;
  }

  let streak = 0;
  while (hasActivity(localDateKey(cursor))) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

function getDueWords(level = null) {
  const data = readLearningProgress();
  const now = Date.now();

  return words
    .filter((word) => !level || word.level === level)
    .filter((word) => {
      const review = data.reviewSchedule[progressWordKey(word)];
      return review && new Date(review.nextReviewAt).getTime() <= now;
    })
    .sort((a, b) => {
      const aTime = new Date(data.reviewSchedule[progressWordKey(a)].nextReviewAt).getTime();
      const bTime = new Date(data.reviewSchedule[progressWordKey(b)].nextReviewAt).getTime();
      return aTime - bTime;
    });
}

function getLearningStats() {
  const data = readLearningProgress();
  const practicedKeys = Object.keys(data.practiced);
  const masteredKeys = Object.keys(data.correctCounts).filter(
    (key) => data.correctCounts[key] >= MASTERY_CORRECT_ANSWERS
  );

  const averageExamScore = data.examHistory.length
    ? Math.round(
        data.examHistory.reduce((sum, exam) => sum + Number(exam.percent || 0), 0) /
          data.examHistory.length
      )
    : null;

  const today = data.activityDays[localDateKey()] || { words: {} };
  const todayPracticed = today.words ? Object.keys(today.words).length : 0;
  const dailyGoal = Math.max(1, Number(data.dailyGoal || DEFAULT_DAILY_GOAL));
  const dailyGoalPercent = Math.min(100, Math.round((todayPracticed / dailyGoal) * 100));

  const levelStats = ["HSK 1", "HSK 2", "HSK 3"].map((level) => {
    const total = words.filter((word) => word.level === level).length;
    const mastered = masteredKeys.filter((key) => key.startsWith(`${level}|`)).length;
    const practiced = practicedKeys.filter((key) => key.startsWith(`${level}|`)).length;
    const percent = total ? Math.round((mastered / total) * 100) : 0;
    const due = getDueWords(level).length;

    return { level, total, mastered, practiced, percent, due };
  });

  return {
    practicedWords: practicedKeys.length,
    masteredWords: masteredKeys.length,
    averageExamScore,
    examCount: data.examHistory.length,
    totalXp: Number(data.xp || 0),
    streak: getCurrentStreak(data.activityDays),
    todayPracticed,
    dailyGoal,
    dailyGoalPercent,
    wordsLeftToday: Math.max(0, dailyGoal - todayPracticed),
    levelStats
  };
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning!";
  if (hour < 18) return "Good afternoon!";
  return "Good evening!";
}

const nav = [
  ["Dashboard", LayoutDashboard],
  ["Vocabulary", BookOpen],
  ["Games", Gamepad2],
  ["Practice", PenLine],
  ["Exams", ClipboardCheck],
  ["Progress", BarChart3],
  ["Settings", Settings]
];

function LearningApp({ user, profile, onSignOut }){
  const [page,setPage] = useState("Dashboard");
  const [level,setLevel] = useState("HSK 1");
  const [examLevel,setExamLevel] = useState("HSK 1");
  const [, setProgressVersion] = useState(0);

  useEffect(() => {
    const refresh = () => setProgressVersion((value) => value + 1);
    window.addEventListener("learning-progress-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("learning-progress-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const stats = getLearningStats();
  const visibleNav = profile?.role === "admin" ? [...nav, ["Admin", UserCheck]] : nav;

  return <div className="app">
    <aside className="sidebar">
      <div className="brand"><div className="logo">学</div><div><b>Learn Chinese</b><span>学中文</span></div></div>
      <nav>{visibleNav.map(([name,Icon]) =>
        <button className={page===name?"nav active":"nav"} onClick={()=>setPage(name)} key={name}>
          <Icon size={19}/><span>{name}</span>
        </button>
      )}</nav>
      <div className="side-card">
        <div className="tiny">DAILY GOAL</div>
        <strong>{stats.todayPracticed} / {stats.dailyGoal} words</strong>
        <div className="progress"><i style={{width:`${stats.dailyGoalPercent}%`}}/></div>
        <small>{stats.wordsLeftToday === 0 ? "Goal complete today ✓" : `${stats.wordsLeftToday} words left today`}</small>
      </div>
    </aside>

    <main>
      <header>
        <div className="mobile-title">学中文</div>
        <div className="search"><Search size={17}/><input placeholder="Search vocabulary..." /></div>
        <div className="header-right"><div className="streak"><Flame size={18}/> {stats.streak}</div><div className="avatar" title={user?.email || "User"}>{(user?.email || "U").charAt(0).toUpperCase()}</div><button className="header-signout" onClick={onSignOut}>Sign out</button></div>
      </header>

      {page==="Dashboard" && <Dashboard setPage={setPage} level={level} setLevel={setLevel}/>}
      {page==="Vocabulary" && <Vocabulary level={level} setLevel={setLevel} setPage={setPage}/>} 
      {page==="Review Session" && <ReviewSession level={level} setLevel={setLevel} setPage={setPage}/>} 
      {page==="Games" && <Games setPage={setPage}/>} 
      {page==="Practice" && <Practice level={level} setLevel={setLevel} setPage={setPage}/>} 
      {page==="Flash Cards" && <FlashCards level={level} setLevel={setLevel}/>} 
      {page==="Word Match" && <WordMatch level={level} setLevel={setLevel}/>} 
      {page==="Listening Challenge" && <ListeningChallenge level={level} setLevel={setLevel}/>} 
      {page==="Pinyin Challenge" && <PinyinChallenge level={level} setLevel={setLevel}/>} 
      {page==="Sentence Practice" && <SentencePractice level={level} setLevel={setLevel}/>} 
      {page==="Exams" && <Exams setPage={setPage} setLevel={setLevel} setExamLevel={setExamLevel}/>} 
      {page==="Exam Session" && <ExamSession level={examLevel} setPage={setPage}/>} 
      {page==="Progress" && <Progress/>}
      {page==="Settings" && <SettingsPage/>}
      {page==="Admin" && profile?.role === "admin" && <AdminPanel/>}
    </main>
  </div>
}

function Dashboard({setPage,level,setLevel}){
  const stats = getLearningStats();
  const selected = stats.levelStats.find((item) => item.level === level) || stats.levelStats[0];
  const status = selected.percent >= 100 ? "Completed" : selected.practiced > 0 ? "In progress" : "Not started";

  return <section className="content">
    <div className="hero"><div><div className="eyebrow">WELCOME BACK 👋</div><h1>{getGreeting()}</h1><p>Continue your Chinese learning journey.</p></div><div className="hero-character">中</div></div>
    <div className="level-row"><div><h2>Your learning path</h2><p className="muted">Choose a level to continue.</p></div><div className="tabs">{["HSK 1","HSK 2","HSK 3"].map(x=><button className={level===x?"tab selected":"tab"} onClick={()=>setLevel(x)} key={x}>{x}</button>)}</div></div>
    <div className="grid three">
      <div className="card level-card"><div className="card-head"><span className="icon-box"><BookOpen/></span><span className="pill">{status}</span></div><h3>{level}</h3><div className="big-progress"><span>{selected.percent}%</span><div className="progress"><i style={{width:`${selected.percent}%`}}/></div></div><p className="muted">{selected.practiced} practiced · {selected.mastered} mastered · {selected.total} total</p><button className="primary" onClick={()=>setPage("Vocabulary")}>Continue learning <ChevronRight size={17}/></button></div>
      <Stat icon={Flame} value={`${stats.streak} day${stats.streak === 1 ? "" : "s"}`} label="Current streak" />
      <Stat icon={Trophy} value={`${stats.totalXp.toLocaleString()} XP`} label="Total experience" />
    </div>
    <h2 className="section-title">Quick practice</h2>
    <div className="grid four">
      <Quick icon={BookOpen} title="Flash Cards" desc="Review words" setPage={setPage} target="Flash Cards"/>
      <Quick icon={Headphones} title="Listening" desc="Train your ears" setPage={setPage} target="Listening Challenge"/>
      <Quick icon={Puzzle} title="Word Match" desc="Match meanings" setPage={setPage} target="Word Match"/>
      <Quick icon={ClipboardCheck} title="Take a Test" desc="Check your level" setPage={setPage} target="Exams"/>
    </div>
  </section>
}

function Stat({icon:Icon,value,label}){return <div className="card stat"><span className="icon-box"><Icon/></span><strong>{value}</strong><p>{label}</p><div className="stat-line"/></div>}
function Quick({icon:Icon,title,desc,setPage,target="Games"}){return <button className="card quick" onClick={()=>setPage(target)}><span className="icon-box"><Icon/></span><div><b>{title}</b><small>{desc}</small></div><ChevronRight className="arrow"/></button>}

function Vocabulary({level,setLevel,setPage}){
  const stats = getLearningStats();
  const levelStat = stats.levelStats.find((item) => item.level === level);
  const dueCount = levelStat?.due || 0;

  return <section className="content"><div className="page-title"><div><div className="eyebrow">VOCABULARY</div><h1>Learn new words</h1><p className="muted">Study, listen and practice every word.</p></div><button className="primary" onClick={() => setPage("Review Session")}><Volume2 size={17}/> Review session{dueCount ? ` (${dueCount} due)` : ""}</button></div>
    <div className="tabs level-tabs">{["HSK 1","HSK 2","HSK 3"].map(x=><button className={level===x?"tab selected":"tab"} onClick={()=>setLevel(x)} key={x}>{x}</button>)}</div>
    <div className="word-grid">{words.filter(w => w.level === level).map((w,i)=><div className="card word" key={i}><div className="word-top"><span className="pill">{w.level}</span><Star size={18}/></div><div className="hanzi">{w.chinese}</div><div className="pinyin">{w.pinyin} <Volume2 size={17}/></div><div className="meaning">{w.meaning}</div><div className="example">{w.example}</div><button className="secondary" onClick={() => recordWordActivity(w, false, "again")}>Practice word</button></div>)}</div>
  </section>
}

function ReviewSession({ level, setLevel, setPage }) {
  const [queue, setQueue] = useState(() => getDueWords(level));
  const [showAnswer, setShowAnswer] = useState(false);

  useEffect(() => {
    setQueue(getDueWords(level));
    setShowAnswer(false);
  }, [level]);

  const current = queue[0];

  function rateCurrent(rating) {
    if (!current) return;
    recordWordActivity(current, rating !== "again", rating);
    setQueue((items) => items.slice(1));
    setShowAnswer(false);
  }

  function speakWord() {
    if (!current) return;
    window.speechSynthesis.cancel();
    const speech = new SpeechSynthesisUtterance(current.chinese);
    speech.lang = "zh-CN";
    speech.rate = 0.8;
    window.speechSynthesis.speak(speech);
  }

  return <section className="content">
    <div className="page-title">
      <div><div className="eyebrow">SPACED REPETITION</div><h1>Review due words</h1><p className="muted">Words return automatically when they are due for review.</p></div>
      <button className="secondary" onClick={() => setPage("Vocabulary")}>Back to vocabulary</button>
    </div>

    <div className="tabs level-tabs">{["HSK 1","HSK 2","HSK 3"].map(x=><button className={level===x?"tab selected":"tab"} onClick={()=>setLevel(x)} key={x}>{x}</button>)}</div>

    {!current ? <div className="card review-empty"><CheckCircle2 size={38}/><h2>You're caught up</h2><p className="muted">No {level} words are due right now. Practice more words and they will appear here when it is time to review them.</p><button className="primary" onClick={() => setPage("Vocabulary")}>Study vocabulary</button></div> :
    <div className="review-area">
      <div className="card review-card" onClick={() => setShowAnswer(true)}>
        <span className="pill">{level}</span>
        <div className="review-hanzi">{current.chinese}</div>
        <div className="review-pinyin">{current.pinyin}</div>
        {showAnswer ? <div className="review-meaning">{current.meaning}</div> : <div className="muted">Click the card to reveal the meaning</div>}
      </div>
      <button className="secondary speaker-btn" onClick={speakWord}><Volume2 size={18}/> Listen</button>
      {showAnswer && <div className="review-actions">
        <button className="secondary" onClick={() => rateCurrent("again")}>Again · 10 min</button>
        <button className="secondary" onClick={() => rateCurrent("hard")}>Hard · 1 day</button>
        <button className="primary" onClick={() => rateCurrent("easy")}>Easy</button>
      </div>}
      <p className="muted review-counter">{queue.length} word{queue.length === 1 ? "" : "s"} due</p>
    </div>}
  </section>;
}

function Games({ setPage }) {
  return (
    <section className="content">

      <div className="eyebrow">GAMES</div>

      <h1>Learn by playing 🎮</h1>

      <p className="muted">
        Different activities help you remember words in different ways.
      </p>

      <div className="grid two game-grid">

        {/* Flash Cards */}
        <div className="card game">

          <span className="icon-box">
            <Languages />
          </span>

          <h3>Flash Cards</h3>

          <p>
            Review Chinese words and remember their meanings.
          </p>

          <button
            className="primary"
            onClick={() => setPage("Flash Cards")}
          >
            Start game
            <ChevronRight size={17} />
          </button>

        </div>


        {/* Word Match */}
        <div className="card game">

          <span className="icon-box">
            <Puzzle />
          </span>

          <h3>Word Match</h3>

          <p>
            Connect Chinese words with their meanings.
          </p>

          <button
            className="primary"
            onClick={() => setPage("Word Match")}
          >
            Start game
            <ChevronRight size={17} />
          </button>

        </div>


        {/* Listening Challenge */}
        <div className="card game">

          <span className="icon-box">
            <Headphones />
          </span>

          <h3>Listening Challenge</h3>

          <p>
            Listen carefully and choose the correct word.
          </p>

          <button
            className="primary"
            onClick={() => setPage("Listening Challenge")}
          >
            Start game
            <ChevronRight size={17} />
          </button>

        </div>


        {/* Pinyin Challenge */}
        <div className="card game">

          <span className="icon-box">
            <PenLine />
          </span>

          <h3>Pinyin Challenge</h3>

          <p>
            Type the correct Pinyin for each word.
          </p>

          <button
            className="primary"
            onClick={() => setPage("Pinyin Challenge")}
          >
            Start game
            <ChevronRight size={17} />
          </button>

        </div>

      </div>

    </section>
  );
}

function FlashCards({ level, setLevel }) {
  const [index, setIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);

  const gameWords = words.filter((w) => w.level === level);
  const current = gameWords[index];

  function nextCard(difficulty) {
    recordWordActivity(current, difficulty === "easy", difficulty);
    setShowAnswer(false);
    setIndex((index + 1) % gameWords.length);
  }

  function speakWord() {
    window.speechSynthesis.cancel();
    const speech = new SpeechSynthesisUtterance(current.chinese);
    speech.lang = "zh-CN";
    speech.rate = 0.8;
    window.speechSynthesis.speak(speech);
  }

  return (
    <section className="content">

      {/* Page Header */}
      <div className="page-title">
        <div>
          <div className="eyebrow">FLASH CARDS</div>

          <h1>Review vocabulary</h1>

          <p className="muted">
            Click the card to reveal the meaning.
          </p>
        </div>
      </div>

      {/* HSK Level Selection */}
      <div className="tabs level-tabs">
        {["HSK 1", "HSK 2", "HSK 3"].map((x) => (
          <button
            key={x}
            className={level === x ? "tab selected" : "tab"}
            onClick={() => {
              setLevel(x);
              setIndex(0);
              setShowAnswer(false);
            }}
          >
            {x}
          </button>
        ))}
      </div>

      {/* Flash Card */}
      <div className="flash-card-area">

        <div
          className="card flash-card"
          onClick={() => setShowAnswer(!showAnswer)}
        >

          <span className="pill">
            {current.level}
          </span>

          <div className="flash-hanzi">
            {current.chinese}
          </div>

          <div className="flash-pinyin">
            {current.pinyin}
          </div>

          {showAnswer ? (
            <div className="flash-meaning">
              {current.meaning}
            </div>
          ) : (
            <div className="flash-hint">
              Click to reveal meaning
            </div>
          )}

        </div>

        {/* Pronunciation */}
        <button
          className="secondary speaker-btn"
          onClick={speakWord}
        >
          <Volume2 size={18} />
          Listen
        </button>

        {/* Difficulty Buttons */}
        <div className="flash-actions">

          <button
            className="secondary"
            onClick={() => nextCard("hard")}
          >
            Hard
          </button>

          <button
            className="secondary"
            onClick={() => nextCard("again")}
          >
            Again
          </button>

          <button
            className="primary"
            onClick={() => nextCard("easy")}
          >
            Easy
          </button>

        </div>

        {/* Card Counter */}
        <p className="muted flash-counter">
          Card {index + 1} of {gameWords.length}
        </p>

      </div>

    </section>
  );
}

function WordMatch({ level, setLevel }) {
  const [round, setRound] = useState(0);
  const [selectedWord, setSelectedWord] = useState(null);
  const [selectedMeaning, setSelectedMeaning] = useState(null);
  const [score, setScore] = useState(0);
  const [matched, setMatched] = useState([]);
  const [wrongMatch, setWrongMatch] = useState(false);

  const levelWords = words.filter((w) => w.level === level);

  const gameWords = levelWords.slice(
    round * 4,
    round * 4 + 4
  );

  const meanings = [...gameWords].sort(
    () => Math.random() - 0.5
  );

  function checkMatch(word, meaning) {
    // Select Chinese word first
    if (!word) {
      setSelectedMeaning(meaning);
      return;
    }

    // Select meaning first
    if (!meaning) {
      setSelectedWord(word);
      return;
    }

    // Show both selections
    setSelectedWord(word);
    setSelectedMeaning(meaning);

    const attemptedWord = levelWords.find((item) => item.chinese === word);

    // Correct match
    if (word === meaning) {
      recordWordActivity(attemptedWord, true);
      setScore((score) => score + 1);

      setMatched((matched) => [
        ...matched,
        word
      ]);

      setTimeout(() => {
        setSelectedWord(null);
        setSelectedMeaning(null);
      }, 500);

    } else {
      recordWordActivity(attemptedWord, false);
      // Wrong match
      setWrongMatch(true);

      setTimeout(() => {
        setSelectedWord(null);
        setSelectedMeaning(null);
        setWrongMatch(false);
      }, 800);
    }
  }

  function nextRound() {
    setSelectedWord(null);
    setSelectedMeaning(null);
    setMatched([]);
    setWrongMatch(false);

    setRound(
      (round + 1) %
      Math.max(1, Math.floor(levelWords.length / 4))
    );
  }

  return (
    <section className="content">

      {/* Header */}
      <div className="page-title">
        <div>
          <div className="eyebrow">
            WORD MATCH
          </div>

          <h1>
            Match the words
          </h1>

          <p className="muted">
            Connect each Chinese word with its correct meaning.
          </p>
        </div>

        <div className="score-box">
          Score: <strong>{score}</strong>
        </div>
      </div>


      {/* HSK Levels */}
      <div className="tabs level-tabs">
        {["HSK 1", "HSK 2", "HSK 3"].map((x) => (
          <button
            key={x}
            className={
              level === x
                ? "tab selected"
                : "tab"
            }
            onClick={() => {
              setLevel(x);
              setRound(0);
              setScore(0);
              setMatched([]);
              setSelectedWord(null);
              setSelectedMeaning(null);
              setWrongMatch(false);
            }}
          >
            {x}
          </button>
        ))}
      </div>


      {/* Match Board */}
      <div className="match-board">

        {/* Chinese Column */}
        <div className="match-column">

          <h3>
            Chinese
          </h3>

          {gameWords.map((word) => (

            <button
              key={word.chinese}

              className={
                wrongMatch &&
                (
                  selectedWord === word.chinese ||
                  selectedMeaning === word.chinese
                )
                  ? "match-item wrong"

                  : matched.includes(word.chinese)
                  ? "match-item matched"

                  : selectedWord === word.chinese
                  ? "match-item selected"

                  : "match-item"
              }

              onClick={() =>
                checkMatch(
                  word.chinese,
                  selectedMeaning
                )
              }

              disabled={
                matched.includes(word.chinese)
              }
            >

              <strong>
                {word.chinese}
              </strong>

              <small>
                {word.pinyin}
              </small>

            </button>
          ))}

        </div>


        {/* Meaning Column */}
        <div className="match-column">

          <h3>
            Meaning
          </h3>

          {meanings.map((word) => (

            <button
              key={word.chinese}

              className={
                wrongMatch &&
                (
                  selectedWord === word.chinese ||
                  selectedMeaning === word.chinese
                )
                  ? "match-item wrong"

                  : matched.includes(word.chinese)
                  ? "match-item matched"

                  : selectedMeaning === word.chinese
                  ? "match-item selected"

                  : "match-item"
              }

              onClick={() =>
                checkMatch(
                  selectedWord,
                  word.chinese
                )
              }

              disabled={
                matched.includes(word.chinese)
              }
            >

              {word.meaning}

            </button>
          ))}

        </div>

      </div>


      {/* Footer */}
      <div className="match-footer">

        <p className="muted">
          Match: {matched.length} / {gameWords.length}
        </p>

        <button
          className="primary"
          onClick={nextRound}
        >
          Next round
          <ChevronRight size={17} />
        </button>

      </div>

    </section>
  );
}

function ListeningChallenge({ level, setLevel }) {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState(null);
  const [score, setScore] = useState(0);

  const levelWords = words.filter(
    (w) => w.level === level
  );

  const current = levelWords[index];

  // Create 4 options for the current question
  const options = levelWords
    .filter(
      (w) => w.chinese !== current.chinese
    )
    .slice(0, 3);

  const allOptions = [
    current,
    ...options
  ];

  function playSound() {
    window.speechSynthesis.cancel();

    const speech =
      new SpeechSynthesisUtterance(
        current.chinese
      );

    speech.lang = "zh-CN";
    speech.rate = 0.8;

    window.speechSynthesis.speak(speech);
  }

  function selectAnswer(answer) {
    if (selected !== null) return;

    setSelected(answer);

    const isCorrect = answer === current.chinese;
    recordWordActivity(current, isCorrect);

    if (isCorrect) {
      setScore((score) => score + 1);
    }
  }

  function nextQuestion() {
    setSelected(null);

    setIndex(
      (index + 1) %
        levelWords.length
    );
  }

  function changeLevel(newLevel) {
    setLevel(newLevel);
    setIndex(0);
    setSelected(null);
    setScore(0);
  }

  return (
    <section className="content">

      {/* =========================
          PAGE HEADER
      ========================= */}

      <div className="page-title">

        <div>

          <div className="eyebrow">
            LISTENING CHALLENGE
          </div>

          <h1>
            Listen and choose
          </h1>

          <p className="muted">
            Listen carefully and select
            the word you hear.
          </p>

        </div>

        <div className="score-box">
          Score: <strong>{score}</strong>
        </div>

      </div>


      {/* =========================
          HSK LEVELS
      ========================= */}

      <div className="tabs level-tabs">

        {["HSK 1", "HSK 2", "HSK 3"].map(
          (x) => (

            <button
              key={x}
              className={
                level === x
                  ? "tab selected"
                  : "tab"
              }
              onClick={() =>
                changeLevel(x)
              }
            >
              {x}
            </button>

          )
        )}

      </div>


      {/* =========================
          LISTENING AREA
      ========================= */}

      <div className="listening-area">


        {/* Listening Card */}

        <div className="card listening-card">

          <div className="listening-icon">
            <Headphones size={42} />
          </div>

          <h2>
            What did you hear?
          </h2>

          <p className="muted">
            Press the button and listen
            carefully.
          </p>

          <button
            className="primary listen-main"
            onClick={playSound}
          >
            <Volume2 size={20} />
            Play pronunciation
          </button>

        </div>


        {/* =========================
            ANSWER OPTIONS
        ========================= */}

        <div className="listening-options">

          {allOptions.map((option) => {

            const isCorrect =
              option.chinese ===
              current.chinese;

            const isSelected =
              selected ===
              option.chinese;

            let className =
              "listening-option";


            // After user selects an answer
            if (selected !== null) {

              // Correct answer = GREEN
              if (isCorrect) {

                className +=
                  " correct";

              }

              // User selected wrong answer = RED
              else if (isSelected) {

                className +=
                  " wrong";

              }
            }


            return (

              <button
                key={option.chinese}
                className={className}
                onClick={() =>
                  selectAnswer(
                    option.chinese
                  )
                }
                disabled={
                  selected !== null
                }
              >

                <strong>
                  {option.chinese}
                </strong>

                <small>
                  {option.pinyin}
                </small>

              </button>

            );

          })}

        </div>


        {/* =========================
            NEXT QUESTION
        ========================= */}

        {selected !== null && (

          <button
            className="primary next-question"
            onClick={nextQuestion}
          >
            Next question
            <ChevronRight size={17} />
          </button>

        )}


        {/* Question Counter */}

        <p className="muted listening-counter">

          Question {index + 1} of{" "}
          {levelWords.length}

        </p>

      </div>

    </section>
  );
}

function PinyinChallenge({ level, setLevel }) {
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState(null);
  const [score, setScore] = useState(0);

  const levelWords = words.filter(
    (w) => w.level === level
  );

  const current = levelWords[index];

  function checkAnswer() {
    if (result !== null) return;

    const userAnswer = answer
      .trim()
      .toLowerCase();

    const correctAnswer =
      current.pinyin.trim().toLowerCase();

    const isCorrect = userAnswer === correctAnswer;
    recordWordActivity(current, isCorrect);

    if (isCorrect) {
      setResult("correct");
      setScore((score) => score + 1);
    } else {
      setResult("wrong");
    }
  }

  function nextQuestion() {
    setAnswer("");
    setResult(null);

    setIndex(
      (index + 1) %
        levelWords.length
    );
  }

  function changeLevel(newLevel) {
    setLevel(newLevel);
    setIndex(0);
    setAnswer("");
    setResult(null);
    setScore(0);
  }

  function playSound() {
    window.speechSynthesis.cancel();

    const speech =
      new SpeechSynthesisUtterance(
        current.chinese
      );

    speech.lang = "zh-CN";
    speech.rate = 0.8;

    window.speechSynthesis.speak(speech);
  }

  return (
    <section className="content">

      {/* Page Header */}

      <div className="page-title">

        <div>

          <div className="eyebrow">
            PINYIN CHALLENGE
          </div>

          <h1>
            Type the Pinyin
          </h1>

          <p className="muted">
            Look at the Chinese word and
            type its correct Pinyin.
          </p>

        </div>

        <div className="score-box">
          Score: <strong>{score}</strong>
        </div>

      </div>


      {/* HSK Levels */}

      <div className="tabs level-tabs">

        {["HSK 1", "HSK 2", "HSK 3"].map(
          (x) => (

            <button
              key={x}
              className={
                level === x
                  ? "tab selected"
                  : "tab"
              }
              onClick={() =>
                changeLevel(x)
              }
            >
              {x}
            </button>

          )
        )}

      </div>


      {/* Challenge Area */}

      <div className="pinyin-area">

        <div className="card pinyin-card">

          <span className="pill">
            {current.level}
          </span>

          <div className="pinyin-hanzi">
            {current.chinese}
          </div>

          <p className="muted">
            What is the Pinyin?
          </p>


          {/* Input */}

          <input
            className={
              result === "correct"
                ? "pinyin-input correct"
                : result === "wrong"
                ? "pinyin-input wrong"
                : "pinyin-input"
            }
            type="text"
            value={answer}
            onChange={(e) =>
              setAnswer(e.target.value)
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                checkAnswer();
              }
            }}
            placeholder="Type Pinyin here..."
            disabled={result !== null}
            autoComplete="off"
          />


          {/* Check Button */}

          {result === null && (

            <button
              className="primary pinyin-check"
              onClick={checkAnswer}
              disabled={
                answer.trim() === ""
              }
            >
              Check Answer
            </button>

          )}


          {/* Result */}

          {result === "correct" && (

            <div className="pinyin-result correct-result">

              ✓ Correct!

            </div>

          )}


          {result === "wrong" && (

            <div className="pinyin-result wrong-result">

              ✗ Incorrect

              <div>
                Correct Pinyin:
                <strong>
                  {" "}
                  {current.pinyin}
                </strong>
              </div>

            </div>

          )}


          {/* Next Question */}

          {result !== null && (

            <button
              className="primary pinyin-next"
              onClick={nextQuestion}
            >
              Next question
              <ChevronRight size={17} />
            </button>

          )}


          {/* Listen */}

          <button
            className="secondary pinyin-listen"
            onClick={playSound}
          >
            <Volume2 size={18} />
            Listen
          </button>

        </div>


        {/* Counter */}

        <p className="muted pinyin-counter">
          Question {index + 1} of{" "}
          {levelWords.length}
        </p>

      </div>

    </section>
  );
}

function Practice({ level, setLevel, setPage }) {
  return (
    <section className="content">

      {/* Header */}
      <div className="eyebrow">
        PRACTICE
      </div>

      <h1>
        What do you want to practice?
      </h1>

      <p className="muted">
        Choose a skill and start a focused session.
      </p>


      {/* Practice Cards */}
      <div className="practice-grid">

        {/* Vocabulary */}
        <div className="card practice-card">

          <div className="practice-icon">
            <BookOpen size={24} />
          </div>

          <div className="practice-info">
            <h3>Vocabulary</h3>

            <p>
              Learn and review Chinese words
            </p>
          </div>

          <button
            className="secondary practice-start"
            onClick={() => setPage("Vocabulary")}
          >
            Start
            <ChevronRight size={17} />
          </button>

        </div>


        {/* Listening */}
        <div className="card practice-card">

          <div className="practice-icon">
            <Headphones size={24} />
          </div>

          <div className="practice-info">
            <h3>Listening</h3>

            <p>
              Understand spoken Chinese
            </p>
          </div>

          <button
            className="secondary practice-start"
            onClick={() =>
              setPage("Listening Challenge")
            }
          >
            Start
            <ChevronRight size={17} />
          </button>

        </div>


        {/* Pinyin */}
        <div className="card practice-card">

          <div className="practice-icon">
            <Languages size={24} />
          </div>

          <div className="practice-info">
            <h3>Pinyin</h3>

            <p>
              Build pronunciation confidence
            </p>
          </div>

          <button
            className="secondary practice-start"
            onClick={() =>
              setPage("Pinyin Challenge")
            }
          >
            Start
            <ChevronRight size={17} />
          </button>

        </div>


        {/* Sentences */}
        <div className="card practice-card">

          <div className="practice-icon">
            <PenLine size={24} />
          </div>

          <div className="practice-info">
            <h3>Sentences</h3>

            <p>
              Complete useful Chinese sentences
            </p>
          </div>

          <button
            className="secondary practice-start"
            onClick={() => setPage("Sentence Practice")}
          >
            Start
            <ChevronRight size={17} />
          </button>

        </div>

      </div>

    </section>
  );
}


const sentenceQuestions = {
  "HSK 1": [
    { before: "我", after: "学生。", answer: "是", options: ["是", "有", "在", "会"] },
    { before: "我", after: "汉语。", answer: "学习", options: ["学习", "喝", "买", "看"] },
    { before: "他", after: "北京。", answer: "在", options: ["在", "叫", "吃", "写"] },
    { before: "你", after: "汉语吗？", answer: "会", options: ["会", "有", "来", "坐"] }
  ],
  "HSK 2": [
    { before: "今天的天气", after: "好。", answer: "非常", options: ["非常", "已经", "一起", "可能"] },
    { before: "我每天", after: "七点起床。", answer: "早上", options: ["早上", "晚上", "去年", "以后"] },
    { before: "他正在", after: "一本书。", answer: "看", options: ["看", "听", "开", "等"] },
    { before: "我们", after: "去学校吧。", answer: "一起", options: ["一起", "因为", "所以", "但是"] }
  ],
  "HSK 3": [
    { before: "因为下雨，", after: "我没有出去。", answer: "所以", options: ["所以", "但是", "如果", "还是"] },
    { before: "这本书", after: "很有意思。", answer: "真的", options: ["真的", "终于", "突然", "一直"] },
    { before: "我已经", after: "作业了。", answer: "完成", options: ["完成", "参加", "决定", "发现"] },
    { before: "他每天坚持", after: "汉语。", answer: "练习", options: ["练习", "准备", "了解", "选择"] }
  ]
};

function SentencePractice({ level, setLevel }) {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState(null);
  const [score, setScore] = useState(0);

  const questions = sentenceQuestions[level] || sentenceQuestions["HSK 1"];
  const current = questions[index];

  function chooseAnswer(option) {
    if (selected !== null) return;
    setSelected(option);
    const isCorrect = option === current.answer;
    const answerWord = words.find(
      (word) => word.level === level && word.chinese === current.answer
    );
    recordWordActivity(answerWord, isCorrect);

    if (isCorrect) {
      setScore((value) => value + 1);
    }
  }

  function nextQuestion() {
    setSelected(null);
    setIndex((value) => (value + 1) % questions.length);
  }

  function changeLevel(newLevel) {
    setLevel(newLevel);
    setIndex(0);
    setSelected(null);
    setScore(0);
  }

  return (
    <section className="content">
      <div className="page-title">
        <div>
          <div className="eyebrow">SENTENCE PRACTICE</div>
          <h1>Complete the sentence</h1>
          <p className="muted">Choose the word that correctly completes the Chinese sentence.</p>
        </div>
        <div className="score-box">Score: <strong>{score}</strong></div>
      </div>

      <div className="tabs level-tabs">
        {["HSK 1", "HSK 2", "HSK 3"].map((x) => (
          <button
            key={x}
            className={level === x ? "tab selected" : "tab"}
            onClick={() => changeLevel(x)}
          >
            {x}
          </button>
        ))}
      </div>

      <div className="sentence-area">
        <div className="card sentence-card">
          <span className="pill">{level}</span>

          <div className="sentence-question">
            <span>{current.before}</span>
            <span className="sentence-blank">____</span>
            <span>{current.after}</span>
          </div>

          <div className="sentence-options">
            {current.options.map((option) => {
              let className = "sentence-option";

              if (selected !== null) {
                if (option === current.answer) className += " correct";
                else if (option === selected) className += " wrong";
              }

              return (
                <button
                  key={option}
                  className={className}
                  onClick={() => chooseAnswer(option)}
                  disabled={selected !== null}
                >
                  {option}
                </button>
              );
            })}
          </div>

          {selected !== null && (
            <div className={selected === current.answer ? "sentence-feedback correct-result" : "sentence-feedback wrong-result"}>
              {selected === current.answer ? "✓ Correct!" : `✗ Correct answer: ${current.answer}`}
            </div>
          )}

          {selected !== null && (
            <button className="primary sentence-next" onClick={nextQuestion}>
              Next question <ChevronRight size={17} />
            </button>
          )}
        </div>

        <p className="muted sentence-counter">
          Question {index + 1} of {questions.length}
        </p>
      </div>
    </section>
  );
}

const examQuestionCounts = { "HSK 1": 20, "HSK 2": 30, "HSK 3": 40 };

function getBestScore(level) {
  try {
    const value = window.localStorage.getItem(`best-${level}`);
    return value === null ? null : Number(value);
  } catch {
    return null;
  }
}

function Exams({ setPage, setLevel, setExamLevel }) {
  const levels = ["HSK 1", "HSK 2", "HSK 3"];

  function startExam(level) {
    setLevel(level);
    setExamLevel(level);
    setPage("Exam Session");
  }

  return (
    <section className="content">
      <div className="eyebrow">EXAMS</div>
      <h1>Test your Chinese</h1>
      <p className="muted">Take a practice test and see where you stand.</p>

      <div className="grid three exams">
        {levels.map((x, i) => {
          const best = getBestScore(x);
          return (
            <div className="card exam" key={x}>
              <div className="exam-number">{i + 1}</div>
              <h2>{x}</h2>
              <p>{examQuestionCounts[x]} questions · Vocabulary & listening</p>
              <div className="score">
                {best === null ? "Not attempted" : `Best score ${best}%`}
              </div>
              <button className="primary" onClick={() => startExam(x)}>
                Start exam <ChevronRight size={17}/>
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ExamSession({ level, setPage }) {
  const levelWords = words.filter((w) => w.level === level);
  const totalQuestions = Math.min(examQuestionCounts[level] || 20, levelWords.length);

  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState(null);
  const [score, setScore] = useState(0);
  const [vocabularyScore, setVocabularyScore] = useState(0);
  const [listeningScore, setListeningScore] = useState(0);
  const [wrongAnswers, setWrongAnswers] = useState([]);
  const [finished, setFinished] = useState(false);

  const current = levelWords[index % levelWords.length];
  const type = index % 2 === 0 ? "meaning" : "listening";

  const vocabularyTotal = Math.ceil(totalQuestions / 2);
  const listeningTotal = Math.floor(totalQuestions / 2);

  const distractors = [1, 2, 3].map((offset) =>
    levelWords[(index + offset * 7) % levelWords.length]
  );
  const optionWords = [current, ...distractors];
  const rotation = index % optionWords.length;
  const options = [...optionWords.slice(rotation), ...optionWords.slice(0, rotation)];

  function playSound() {
    window.speechSynthesis.cancel();
    const speech = new SpeechSynthesisUtterance(current.chinese);
    speech.lang = "zh-CN";
    speech.rate = 0.8;
    window.speechSynthesis.speak(speech);
  }

  function chooseAnswer(chinese) {
    if (selected !== null || finished) return;

    setSelected(chinese);
    const isCorrect = chinese === current.chinese;
    recordWordActivity(current, isCorrect);

    if (isCorrect) {
      setScore((value) => value + 1);
      if (type === "meaning") {
        setVocabularyScore((value) => value + 1);
      } else {
        setListeningScore((value) => value + 1);
      }
    } else {
      const chosenWord = levelWords.find((word) => word.chinese === chinese);
      setWrongAnswers((items) => [
        ...items,
        {
          number: index + 1,
          type,
          chinese: current.chinese,
          pinyin: current.pinyin,
          meaning: current.meaning,
          selectedChinese: chosenWord?.chinese || chinese,
          selectedMeaning: chosenWord?.meaning || "",
        },
      ]);
    }
  }

  function saveExamResult() {
    const percent = Math.round((score / totalQuestions) * 100);
    const vocabularyPercent = vocabularyTotal
      ? Math.round((vocabularyScore / vocabularyTotal) * 100)
      : 0;
    const listeningPercent = listeningTotal
      ? Math.round((listeningScore / listeningTotal) * 100)
      : 0;

    try {
      const previous = getBestScore(level);
      if (previous === null || percent > previous) {
        window.localStorage.setItem(`best-${level}`, String(percent));
      }

      window.localStorage.setItem(
        `last-exam-${level}`,
        JSON.stringify({
          percent,
          vocabularyPercent,
          listeningPercent,
          score,
          totalQuestions,
          completedAt: new Date().toISOString(),
        })
      );

      recordExamCompletion(level, percent);
    } catch {}
  }

  function nextQuestion() {
    const nextIndex = index + 1;

    if (nextIndex >= totalQuestions) {
      saveExamResult();
      setFinished(true);
      return;
    }

    setIndex(nextIndex);
    setSelected(null);
  }

  function restartExam() {
    setIndex(0);
    setSelected(null);
    setScore(0);
    setVocabularyScore(0);
    setListeningScore(0);
    setWrongAnswers([]);
    setFinished(false);
  }

  if (finished) {
    const percent = Math.round((score / totalQuestions) * 100);
    const vocabularyPercent = vocabularyTotal
      ? Math.round((vocabularyScore / vocabularyTotal) * 100)
      : 0;
    const listeningPercent = listeningTotal
      ? Math.round((listeningScore / listeningTotal) * 100)
      : 0;

    return (
      <section className="content">
        <div className="exam-result card">
          <div className="eyebrow">{level} RESULT</div>
          <h1>Exam complete</h1>
          <div className="exam-result-score">{percent}%</div>
          <p className="muted">
            You answered {score} of {totalQuestions} questions correctly.
          </p>

          <div className="exam-breakdown">
            <div className="exam-breakdown-card">
              <span>Vocabulary</span>
              <strong>{vocabularyPercent}%</strong>
              <small>{vocabularyScore} / {vocabularyTotal} correct</small>
            </div>
            <div className="exam-breakdown-card">
              <span>Listening</span>
              <strong>{listeningPercent}%</strong>
              <small>{listeningScore} / {listeningTotal} correct</small>
            </div>
          </div>

          <div className="exam-result-actions">
            <button className="secondary" onClick={() => setPage("Exams")}>
              Back to exams
            </button>
            <button className="primary" onClick={restartExam}>
              Try again
            </button>
          </div>
        </div>

        <div className="exam-review card">
          <div className="exam-review-head">
            <div>
              <div className="eyebrow">REVIEW</div>
              <h2>Words to review</h2>
            </div>
            <span className="pill">{wrongAnswers.length} mistakes</span>
          </div>

          {wrongAnswers.length === 0 ? (
            <div className="exam-perfect">
              <CheckCircle2 size={28}/>
              <div>
                <strong>Perfect exam!</strong>
                <p className="muted">You did not miss any questions.</p>
              </div>
            </div>
          ) : (
            <div className="exam-mistake-list">
              {wrongAnswers.map((item, i) => (
                <div className="exam-mistake" key={`${item.chinese}-${item.number}-${i}`}>
                  <div className="exam-mistake-number">{item.number}</div>
                  <div className="exam-mistake-word">
                    <strong>{item.chinese}</strong>
                    <span>{item.pinyin}</span>
                  </div>
                  <div className="exam-mistake-detail">
                    <span className="exam-mistake-label">
                      {item.type === "meaning" ? "Correct meaning" : "Correct word"}
                    </span>
                    <b>{item.type === "meaning" ? item.meaning : item.chinese}</b>
                  </div>
                  <div className="exam-mistake-detail">
                    <span className="exam-mistake-label">Your answer</span>
                    <b className="exam-user-wrong">
                      {item.type === "meaning" ? item.selectedMeaning : item.selectedChinese}
                    </b>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="content">
      <div className="page-title">
        <div>
          <div className="eyebrow">{level} EXAM</div>
          <h1>{type === "meaning" ? "Choose the correct meaning" : "Listen and choose"}</h1>
          <p className="muted">Vocabulary and listening questions from your {level} word list.</p>
        </div>
        <div className="score-box">Score: <strong>{score}</strong></div>
      </div>

      <div className="exam-live-stats">
        <span>Vocabulary <b>{vocabularyScore}/{vocabularyTotal}</b></span>
        <span>Listening <b>{listeningScore}/{listeningTotal}</b></span>
      </div>

      <div className="exam-progress-row">
        <span>Question {index + 1} of {totalQuestions}</span>
        <div className="progress">
          <i style={{width: `${((index + 1) / totalQuestions) * 100}%`}}/>
        </div>
      </div>

      <div className="card exam-session-card">
        {type === "meaning" ? (
          <>
            <div className="exam-type-badge">Vocabulary</div>
            <div className="exam-word">{current.chinese}</div>
            <div className="exam-pinyin">{current.pinyin}</div>
            <p className="muted">What does this word mean?</p>
          </>
        ) : (
          <>
            <div className="exam-type-badge">Listening</div>
            <div className="listening-icon"><Headphones size={42}/></div>
            <p className="muted">Press play, then choose the word you hear.</p>
            <button className="primary exam-listen" onClick={playSound}>
              <Volume2 size={19}/> Play pronunciation
            </button>
          </>
        )}

        <div className="exam-options">
          {options.map((option) => {
            const value = option.chinese;
            let className = "exam-option";

            if (selected !== null) {
              if (value === current.chinese) className += " correct";
              else if (value === selected) className += " wrong";
            }

            return (
              <button
                key={value}
                className={className}
                onClick={() => chooseAnswer(value)}
                disabled={selected !== null}
              >
                {type === "meaning" ? option.meaning : (
                  <>
                    <strong>{option.chinese}</strong>
                    <small>{option.pinyin}</small>
                  </>
                )}
              </button>
            );
          })}
        </div>

        {selected !== null && (
          <div className="exam-answer-row">
            <div className={selected === current.chinese ? "correct-result" : "wrong-result"}>
              {selected === current.chinese
                ? "✓ Correct!"
                : `✗ Correct answer: ${type === "meaning" ? current.meaning : current.chinese}`}
            </div>
            <button className="primary" onClick={nextQuestion}>
              {index + 1 === totalQuestions ? "Finish exam" : "Next question"}
              <ChevronRight size={17}/>
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function Progress(){
  const stats = getLearningStats();

  return <section className="content">
    <div className="eyebrow">PROGRESS</div>
    <h1>Your learning progress</h1>
    <p className="muted">These numbers are calculated from your actual practice and completed exams on this browser.</p>

    <div className="grid three">
      <Stat icon={Target} value={String(stats.practicedWords)} label="Unique words practiced"/>
      <Stat icon={CheckCircle2} value={String(stats.masteredWords)} label={`Words mastered (${MASTERY_CORRECT_ANSWERS} correct answers)`}/>
      <Stat icon={Trophy} value={stats.averageExamScore === null ? "—" : `${stats.averageExamScore}%`} label={stats.examCount ? `Average of ${stats.examCount} completed exam${stats.examCount === 1 ? "" : "s"}` : "No completed exams yet"}/>
    </div>

    <div className="card chart">
      <h3>HSK mastery progress</h3>
      <p className="muted">Progress is based on mastered words, not placeholder values.</p>
      {stats.levelStats.map((item) => {
        const value = `${item.percent}%`;
        return <div className="bar-row" key={item.level}>
          <span>{item.level}</span>
          <div className="progress"><i style={{width:value}}/></div>
          <b>{value}</b>
        </div>;
      })}
    </div>

    <div className="card progress-details">
      <h3>Level details</h3>
      {stats.levelStats.map((item) => <div className="progress-detail-row" key={item.level}>
        <strong>{item.level}</strong>
        <span>{item.practiced} practiced</span>
        <span>{item.mastered} mastered</span>
        <span>{item.total} total words</span>
      </div>)}
    </div>
  </section>;
}

function SettingsPage(){
  const [dailyGoal, setDailyGoal] = useState(() => getLearningStats().dailyGoal);

  function changeGoal(event) {
    const value = Number(event.target.value);
    setDailyGoal(value);
    setDailyGoalValue(value);
  }

  return <section className="content"><div className="eyebrow">SETTINGS</div><h1>Settings</h1><p className="muted">Customize your learning experience.</p><div className="card settings"><label>Daily goal <select value={dailyGoal} onChange={changeGoal}><option value="20">20 words</option><option value="30">30 words</option><option value="50">50 words</option></select></label><label>Language <select><option>English</option><option>فارسی / دری</option></select></label><label>Sound effects <input type="checkbox" defaultChecked/></label></div></section>
}


function AuthScreen() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submitAuth(event) {
    event.preventDefault();
    setError("");
    setMessage("");

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError("Please enter your email address.");
      return;
    }
    if (password.length < 6) {
      setError("Password must contain at least 6 characters.");
      return;
    }
    if (mode === "signup" && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            emailRedirectTo: window.location.origin,
          },
        });

        if (signUpError) throw signUpError;

        if (!data.session) {
          setMessage("Account created. Check your email and click the confirmation link, then return here and sign in.");
          setMode("login");
          setPassword("");
          setConfirmPassword("");
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });
        if (signInError) throw signInError;
      }
    } catch (authError) {
      setError(authError?.message || "Authentication failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function switchMode(nextMode) {
    setMode(nextMode);
    setError("");
    setMessage("");
    setPassword("");
    setConfirmPassword("");
  }

  return (
    <div className="auth-shell">
      <div className="auth-panel">
        <div className="auth-brand">
          <div className="auth-logo">学</div>
          <div>
            <strong>Learn Chinese</strong>
            <span>HSK learning platform</span>
          </div>
        </div>

        <div className="auth-copy">
          <div className="eyebrow">WELCOME</div>
          <h1>{mode === "login" ? "Sign in to continue" : "Create your account"}</h1>
          <p>{mode === "login" ? "Enter your email and password to open your learning dashboard." : "Create an account first. After email confirmation, paid access will be approved manually."}</p>
        </div>

        <div className="auth-tabs">
          <button className={mode === "login" ? "auth-tab active" : "auth-tab"} onClick={() => switchMode("login")}>Sign in</button>
          <button className={mode === "signup" ? "auth-tab active" : "auth-tab"} onClick={() => switchMode("signup")}>Sign up</button>
        </div>

        <form className="auth-form" onSubmit={submitAuth}>
          <label>
            Email address
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" required />
          </label>

          <label>
            Password
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 6 characters" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={6} />
          </label>

          {mode === "signup" && (
            <label>
              Confirm password
              <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Type password again" autoComplete="new-password" required minLength={6} />
            </label>
          )}

          {error && <div className="auth-alert error">{error}</div>}
          {message && <div className="auth-alert success">{message}</div>}

          <button className="primary auth-submit" type="submit" disabled={loading}>
            {loading ? "Please wait..." : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>

        <p className="auth-note">Email confirmation is enabled. New users must confirm their email before signing in.</p>
      </div>

      <div className="auth-visual">
        <div className="auth-visual-card">
          <div className="auth-character">中</div>
          <h2>Learn Chinese step by step</h2>
          <p>Vocabulary, listening, pinyin, sentences, exams and real progress tracking in one place.</p>
        </div>
      </div>
    </div>
  );
}

function PaymentGate({ profile, user, onSignOut, onRefreshProfile }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const status = profile?.payment_status || "unpaid";

  async function submitPaymentClaim() {
    setSubmitting(true);
    setError("");
    setMessage("");

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ payment_status: "pending" })
      .eq("id", user.id);

    if (updateError) {
      setError(updateError.message);
      setSubmitting(false);
      return;
    }

    setMessage("Payment claim sent. The administrator will review it.");
    await onRefreshProfile();
    setSubmitting(false);
  }

  if (status === "pending") {
    return (
      <div className="access-shell payment-shell">
        <div className="card access-card payment-card pending-card">
          <div className="payment-state-icon"><RefreshCw size={30}/></div>
          <div className="eyebrow">PAYMENT REVIEW</div>
          <h1>Waiting for administrator approval</h1>
          <p className="muted">Your payment claim has been submitted. Access will open automatically after approval.</p>
          <div className="access-details">
            <div><span>Email</span><strong>{user?.email || "—"}</strong></div>
            <div><span>Status</span><strong className="status-pending">pending</strong></div>
            <div><span>Access</span><strong>Lifetime after approval</strong></div>
          </div>
          <div className="access-actions">
            <button className="primary" onClick={onRefreshProfile}>Refresh status</button>
            <button className="secondary" onClick={onSignOut}>Sign out</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="access-shell payment-shell">
      <div className="card payment-card">
        <div className="payment-header">
          <div>
            <div className="eyebrow">LIFETIME ACCESS</div>
            <h1>{status === "rejected" ? "Submit your payment again" : "Unlock the full learning platform"}</h1>
            <p className="muted">Pay once with Alipay. After the administrator confirms it, your account stays open permanently.</p>
          </div>
          <div className="payment-price"><span>¥</span><strong>20</strong><small>CNY · one time</small></div>
        </div>

        {status === "rejected" && (
          <div className="auth-alert error">Your previous payment claim was not approved. Please verify the payment and submit again.</div>
        )}

        <div className="payment-layout">
          <div className="qr-panel">
            <img src="/alipay-qr.jpg" alt="Alipay payment QR code" className="payment-qr" />
            <div className="qr-caption"><CreditCard size={18}/><span>Scan with Alipay and pay exactly 20 CNY</span></div>
          </div>

          <div className="payment-instructions">
            <div className="payment-step"><span>1</span><div><strong>Open Alipay</strong><p>Use the Scan function and scan the QR code.</p></div></div>
            <div className="payment-step"><span>2</span><div><strong>Pay 20 CNY</strong><p>Complete the payment to the displayed Alipay account.</p></div></div>
            <div className="payment-step"><span>3</span><div><strong>Submit for approval</strong><p>After payment, press the button below. The administrator will verify it manually.</p></div></div>

            <div className="payer-account"><span>Account</span><strong>{user?.email || profile?.email || "—"}</strong></div>

            {error && <div className="auth-alert error">{error}</div>}
            {message && <div className="auth-alert success">{message}</div>}

            <button className="primary payment-submit" onClick={submitPaymentClaim} disabled={submitting}>
              {submitting ? "Submitting..." : "I have paid — send for approval"}
            </button>
            <button className="secondary payment-signout" onClick={onSignOut}>Sign out</button>
            <p className="access-small">Do not press “I have paid” before completing the payment.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function AdminPanel() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState("");
  const [filter, setFilter] = useState("pending");
  const [error, setError] = useState("");

  async function loadUsers() {
    setLoading(true);
    setError("");
    const { data, error: loadError } = await supabase
      .from("profiles")
      .select("id,email,phone,role,payment_status,lifetime_access,created_at")
      .eq("role", "user")
      .order("created_at", { ascending: false });

    if (loadError) {
      setError(loadError.message);
      setUsers([]);
    } else {
      setUsers(data || []);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function reviewPayment(userId, decision) {
    setWorkingId(userId);
    setError("");
    const { error: reviewError } = await supabase.rpc("admin_review_payment", {
      target_user: userId,
      decision,
    });

    if (reviewError) {
      setError(reviewError.message);
    } else {
      await loadUsers();
    }
    setWorkingId("");
  }

  const shown = filter === "all" ? users : users.filter((item) => item.payment_status === filter);
  const pendingCount = users.filter((item) => item.payment_status === "pending").length;
  const approvedCount = users.filter((item) => item.payment_status === "approved").length;
  const rejectedCount = users.filter((item) => item.payment_status === "rejected").length;

  return (
    <section className="content">
      <div className="page-title admin-page-title">
        <div>
          <div className="eyebrow">ADMIN ONLY</div>
          <h1>Payment approvals</h1>
          <p className="muted">Review payment claims and grant or reject lifetime access.</p>
        </div>
        <button className="secondary" onClick={loadUsers}><RefreshCw size={17}/> Refresh</button>
      </div>

      <div className="grid four admin-stats">
        <div className="card admin-stat"><span>Pending</span><strong>{pendingCount}</strong></div>
        <div className="card admin-stat"><span>Approved</span><strong>{approvedCount}</strong></div>
        <div className="card admin-stat"><span>Rejected</span><strong>{rejectedCount}</strong></div>
        <div className="card admin-stat"><span>Total users</span><strong>{users.length}</strong></div>
      </div>

      <div className="admin-toolbar">
        {[
          ["pending", "Pending"],
          ["approved", "Approved"],
          ["rejected", "Rejected"],
          ["unpaid", "Unpaid"],
          ["all", "All"],
        ].map(([value, label]) => (
          <button key={value} className={filter === value ? "tab selected" : "tab"} onClick={() => setFilter(value)}>{label}</button>
        ))}
      </div>

      {error && <div className="auth-alert error admin-error">{error}</div>}

      <div className="card admin-table-card">
        {loading ? <div className="admin-empty">Loading users...</div> : shown.length === 0 ? (
          <div className="admin-empty"><ShieldCheck size={34}/><h3>No users in this list</h3><p className="muted">Nothing needs action right now.</p></div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>User</th><th>Status</th><th>Access</th><th>Created</th><th>Action</th></tr></thead>
              <tbody>
                {shown.map((item) => (
                  <tr key={item.id}>
                    <td><strong>{item.email || item.phone || "Unknown user"}</strong><small>{item.id}</small></td>
                    <td><span className={`admin-status status-${item.payment_status}`}>{item.payment_status}</span></td>
                    <td>{item.lifetime_access ? "Lifetime" : "Locked"}</td>
                    <td>{item.created_at ? new Date(item.created_at).toLocaleDateString() : "—"}</td>
                    <td>
                      <div className="admin-actions">
                        <button className="primary admin-approve" onClick={() => reviewPayment(item.id, "approved")} disabled={workingId === item.id}>Approve</button>
                        <button className="secondary admin-reject" onClick={() => reviewPayment(item.id, "rejected")} disabled={workingId === item.id}>Reject</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState("");

  async function loadProfile(activeSession) {
    if (!activeSession?.user?.id) {
      setProfile(null);
      setProfileError("");
      return;
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("id,email,phone,role,payment_status,lifetime_access")
      .eq("id", activeSession.user.id)
      .single();

    if (error) {
      setProfile(null);
      setProfileError(error.message);
      return;
    }

    setProfile(data);
    setProfileError("");
  }

  useEffect(() => {
    let mounted = true;

    async function initializeAuth() {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(currentSession);
      if (currentSession) await loadProfile(currentSession);
      if (mounted) setLoading(false);
    }

    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession) {
        setTimeout(() => loadProfile(nextSession), 0);
      } else {
        setProfile(null);
        setProfileError("");
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
  }

  if (loading) {
    return <div className="auth-loading"><div className="auth-logo">学</div><p>Loading...</p></div>;
  }

  if (!session) return <AuthScreen />;

  if (profileError) {
    return (
      <div className="access-shell">
        <div className="card access-card">
          <div className="eyebrow">ACCOUNT ERROR</div>
          <h1>We could not load your profile</h1>
          <p className="muted">{profileError}</p>
          <div className="access-actions">
            <button className="primary" onClick={() => loadProfile(session)}>Try again</button>
            <button className="secondary" onClick={signOut}>Sign out</button>
          </div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return <div className="auth-loading"><div className="auth-logo">学</div><p>Preparing your account...</p></div>;
  }

  const hasAccess = profile.role === "admin" || profile.lifetime_access === true || profile.payment_status === "approved";

  if (!hasAccess) {
    return <PaymentGate profile={profile} user={session.user} onSignOut={signOut} onRefreshProfile={() => loadProfile(session)} />;
  }

  return <LearningApp user={session.user} profile={profile} onSignOut={signOut} />;
}

createRoot(document.getElementById("root")).render(<App/>);

