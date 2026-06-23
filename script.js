// ==========================================
// 初期設定・定数
// ==========================================
const DEFAULT_LIFE = 3;
const TIME_PER_WORD = 5;
const SPEECH_RATE = 0.8;

// 状態管理変数
let allParsedQuestions = []; // 読み込んだCSVの全データ
let currentQuestions = [];   // 出題する問題リスト
let currentQuestionIndex = 0;
let targetWords = []; 
let currentWordIndex = 0; 
let life = DEFAULT_LIFE;
let timer = null;
let timeLeft = 0;
let scores = { excellent: 0, good: 0, miss: 0 };
let currentMistakes = 0;

// ==========================================
// DOM要素の取得
// ==========================================
const titleScreen = document.getElementById('title-screen');
const gameScreen = document.getElementById('game-screen');
const resultScreen = document.getElementById('result-screen');

const radioStandard = document.querySelector('input[value="standard"]');
const radioUser = document.querySelector('input[value="user"]');
const fileSelect = document.getElementById('file-select');
const userFileInput = document.getElementById('user-file-input');
const sectionSelect = document.getElementById('section-select');
const audioToggle = document.getElementById('audio-toggle');
const startBtn = document.getElementById('start-btn');

const lifeDisplay = document.querySelector('.life-display');
const timeDisplay = document.querySelector('.time-display');
const jpTextDisplay = document.querySelector('.japanese-text');
const answerArea = document.querySelector('.answer-area');
const wordButtonsArea = document.querySelector('.word-buttons');

const scoreExcellent = document.getElementById('score-excellent');
const scoreGood = document.getElementById('score-good');
const scoreMiss = document.getElementById('score-miss');
const backTitleBtn = document.getElementById('back-title-btn');
const resultTitle = document.getElementById('result-title');
const messageDisplay = document.getElementById('message-display');

// ==========================================
// 初期化・イベントリスナー
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  // 1. 標準問題のファイルリスト (standard_files.csv) を読み込む
  loadStandardFileList();

  // ラジオボタンの切り替え
  radioStandard.addEventListener('change', toggleProblemType);
  radioUser.addEventListener('change', toggleProblemType);
  
  // ファイルが選択された時の処理
  fileSelect.addEventListener('change', handleStandardFileSelect);
  userFileInput.addEventListener('change', handleUserFileSelect);

  startBtn.addEventListener('click', startGame);
  backTitleBtn.addEventListener('click', resetToTitle);
  
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !resultScreen.classList.contains('hidden')) {
      resetToTitle();
    }
  });
});

function toggleProblemType() {
  // 画面切り替え時にセクションリストをリセット
  sectionSelect.innerHTML = '<option value="">--セクションを選択--</option>';
  allParsedQuestions = [];

  if (radioStandard.checked) {
    fileSelect.classList.remove('hidden');
    userFileInput.classList.add('hidden');
    fileSelect.value = ""; // プルダウンを初期状態に
  } else {
    fileSelect.classList.add('hidden');
    userFileInput.classList.remove('hidden');
    userFileInput.value = ""; // ファイル選択を初期状態に
  }
}

// ==========================================
// CSV読み込み処理
// ==========================================

// 標準問題ファイルリストの取得
function loadStandardFileList() {
  fetch('standard_files.csv')
    .then(response => {
      if (!response.ok) throw new Error('Network response was not ok');
      return response.text();
    })
    .then(text => {
      const files = text.split('\n').map(line => line.trim()).filter(line => line !== '');
      fileSelect.innerHTML = '<option value="">--問題を選択--</option>';
      
      files.forEach(fileName => {
        // 拡張子を除いたものを表示名にする
        const displayName = fileName.replace(/\.[^/.]+$/, ""); 
        const option = document.createElement('option');
        option.value = fileName; // 読み込み用に実際のファイル名はvalueに保持
        option.textContent = displayName;
        fileSelect.appendChild(option);
      });
    })
    .catch(err => {
      console.error('標準問題リストの読み込みエラー:', err);
      fileSelect.innerHTML = '<option value="">--読込失敗--</option>';
    });
}

// 標準問題がプルダウンで選択された時
function handleStandardFileSelect(e) {
  const fileName = e.target.value;
  if (!fileName) {
    sectionSelect.innerHTML = '<option value="">--セクションを選択--</option>';
    return;
  }

  fetch(fileName)
    .then(response => {
      if (!response.ok) throw new Error('File not found');
      return response.text();
    })
    .then(text => parseCSVAndPopulateSections(text))
    .catch(err => {
      console.error('問題ファイルの読み込みエラー:', err);
      alert('問題ファイルの読み込みに失敗しました。');
    });
}

// ユーザー問題がローカルから選択された時
function handleUserFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    const text = event.target.result;
    parseCSVAndPopulateSections(text);
  };
  reader.readAsText(file);
}

// CSVを解析し、セクションのプルダウンを生成する
function parseCSVAndPopulateSections(csvText) {
  allParsedQuestions = [];
  sectionSelect.innerHTML = '<option value="">--セクションを選択--</option>';
  
  const lines = csvText.split('\n').map(line => line.trim()).filter(line => line !== '');
  let lastSection = null;

  lines.forEach(line => {
    const cols = line.split(',');
    if (cols.length < 3) return; // セクション, 日本文, 英文 が最低限必要

    const section = cols[0];
    const jp = cols[1];
    const en = cols[2];
    const distractors = cols.slice(3).filter(d => d !== ''); // 不要語（空文字は除外）

    allParsedQuestions.push({ section, jp, en, distractors });

    // 連続するセクションは重複表示しない仕様の実装
    if (section !== lastSection) {
      const option = document.createElement('option');
      option.value = section;
      option.textContent = section;
      sectionSelect.appendChild(option);
      lastSection = section;
    }
  });
}

// ==========================================
// ゲームループ・ロジック
// ==========================================
function startGame() {
  const selectedSection = sectionSelect.value;
  
  if (!selectedSection || allParsedQuestions.length === 0) {
    alert('問題ファイルとセクションを正しく選択してください。');
    return;
  }

  // 選択されたセクションの問題のみを抽出
  currentQuestions = allParsedQuestions.filter(q => q.section === selectedSection);

  // ランダム順に出題するためのシャッフル
  currentQuestions.sort(() => Math.random() - 0.5);

  life = DEFAULT_LIFE;
  scores = { excellent: 0, good: 0, miss: 0 };
  currentQuestionIndex = 0;
  
  titleScreen.classList.add('hidden');
  resultScreen.classList.add('hidden');
  gameScreen.classList.remove('hidden');

  loadQuestion();
}

// ※これ以降の loadQuestion, renderAnswerBoxes, checkAnswer 等は前回作成したものをそのまま使用してください。

function loadQuestion() {
  if (currentQuestionIndex >= currentQuestions.length) {
    showResult();
    return;
  }

  if (life <= 0) {
    showResult();
    return;
  }

  // 【追加】前の問題のメッセージを隠す
  messageDisplay.className = 'message-text hidden';
  messageDisplay.textContent = '';

  const q = currentQuestions[currentQuestionIndex];
  targetWords = q.en.split(' ');
  currentWordIndex = 0;
  currentMistakes = 0;
  
  // タイマー設定 (単語数 × 3秒)
  timeLeft = targetWords.length * TIME_PER_WORD;
  updateDisplays();
  startTimer();

  // 画面描画
  jpTextDisplay.textContent = q.jp;
  renderAnswerBoxes(targetWords);
  renderWordButtons(targetWords, q.distractors);
}

// ボックスの描画
function renderAnswerBoxes(words) {
  answerArea.innerHTML = '';
  words.forEach(word => {
    const box = document.createElement('div');
    box.className = `answer-box ${getBoxSizeClass(word)}`;
    answerArea.appendChild(box);
  });
}

// 単語の文字数でボックスサイズを判定
function getBoxSizeClass(word) {
  // 記号（ピリオドなど）を除外して文字数をカウント
  const cleanWord = word.replace(/[^a-zA-Z]/g, '');
  if (cleanWord.length <= 5) return 'size-s';
  if (cleanWord.length <= 8) return 'size-m';
  return 'size-l';
}

// 選択ボタンの描画
function renderWordButtons(correctWords, distractors) {
  wordButtonsArea.innerHTML = '';
  const allWords = [...correctWords, ...distractors];
  
  // シャッフル
  allWords.sort(() => Math.random() - 0.5);

  allWords.forEach(word => {
    const btn = document.createElement('button');
    btn.className = 'word-btn';
    btn.textContent = word;
    btn.addEventListener('click', () => checkAnswer(word, btn));
    wordButtonsArea.appendChild(btn);
  });
}

// 解答の判定（リアルタイム）
function checkAnswer(selectedWord, btnElement) {
  const correctWord = targetWords[currentWordIndex];

  // 文字列として一致していれば正解（同一単語の重複を許容）
  if (selectedWord === correctWord) {
// 【追加】正しい単語が選ばれたので、それまでに赤くなっていたボタンのエラー表示をすべてリセット
    const allButtons = wordButtonsArea.querySelectorAll('.word-btn');
    allButtons.forEach(btn => btn.classList.remove('error-shake'));

    // 正解処理
    const boxes = answerArea.querySelectorAll('.answer-box');
    boxes[currentWordIndex].textContent = selectedWord;
    boxes[currentWordIndex].style.backgroundColor = '#e8f8f5'; // 少し緑色にして正解を強調
    boxes[currentWordIndex].style.borderColor = '#2ecc71';
    
// 【変更箇所】ボタンを削除(remove)するのではなく、不可視にして場所をキープする
    btnElement.style.visibility = 'hidden';
    currentWordIndex++;

    // すべて並べ終えた場合
    if (currentWordIndex >= targetWords.length) {
      clearInterval(timer);
      handleQuestionClear();
    }
  } else {
    // 不正解処理
    currentMistakes++;
    btnElement.classList.remove('error-shake');
    // アニメーションを再トリガーするためのリフロー
    void btnElement.offsetWidth;
    btnElement.classList.add('error-shake');
  }
}

function handleQuestionClear() {
  if (currentMistakes === 0) {
    scores.excellent++;
    showMessage('Excellent!', 'msg-excellent'); // ← 【追加】
  } else {
    scores.good++;
    showMessage('Good!', 'msg-good'); // ← 【追加】
  }

  const fullSentence = targetWords.join(' ');

  // 音声チェックボックスがON、かつAPIが利用可能な場合
  if (audioToggle.checked && ('speechSynthesis' in window)) {
    // コールバック関数を渡して、音声再生完了後に処理を行う
    playSpeech(fullSentence, () => {
      // 音声出力完了から1秒後に次へ
      setTimeout(() => {
        currentQuestionIndex++;
        loadQuestion();
      }, 1000);
    });
  } else {
    // 音声出力なしの場合は、解答完了（正解した瞬間）から2秒後に次へ
    setTimeout(() => {
      currentQuestionIndex++;
      loadQuestion();
    }, 2000);
  }
}

// ==========================================
// タイマーとライフ管理
// ==========================================
function startTimer() {
  clearInterval(timer);
  timer = setInterval(() => {
    timeLeft -= 0.1;
    if (timeLeft <= 0) {
      clearInterval(timer);
      timeLeft = 0;
      updateDisplays();
      handleTimeOver();
    } else {
      updateDisplays();
    }
  }, 100);
}

function handleTimeOver() {
  life--;
  scores.miss++;
  showMessage('Time Up!', 'msg-timeup'); // ← 【追加】
  
if (life <= 0) {
    // リザルト画面に遷移するまでに少しだけTime Upを見せる
    setTimeout(() => {
      showResult();
    }, 1500); 
  } else {
    // 同じ問題を最初からやり直す
    setTimeout(() => {
      loadQuestion();
    }, 1500); // タイムオーバー文字を見せてからやり直す
  }
}

function updateDisplays() {
  lifeDisplay.textContent = 'Life: ' + '❤️'.repeat(life) + '🖤'.repeat(DEFAULT_LIFE - life);
  timeDisplay.textContent = `⏱ ${timeLeft.toFixed(1)} s`;
}

// ==========================================
// 音声再生 (Web Speech API)
// ==========================================
// 第2引数(onCompleteCallback)で再生完了後の処理を受け取るように変更
function playSpeech(text, onCompleteCallback) {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = SPEECH_RATE;
  
  // 【追加】音声の再生が最後まで終わった時に発火するイベント
  utterance.onend = () => {
    if (onCompleteCallback) onCompleteCallback();
  };

  // エラーハンドリング（利用できない場合も処理が止まらないように次へ進める）
  utterance.onerror = (e) => {
    console.warn('音声の再生に失敗しました:', e);
    if (onCompleteCallback) onCompleteCallback(); 
  };

  window.speechSynthesis.speak(utterance);
}

// ==========================================
// 結果画面・リセット処理
// ==========================================
function showResult() {
  clearInterval(timer);
  gameScreen.classList.add('hidden');
  resultScreen.classList.remove('hidden');

  // ライフが0以下ならゲームオーバー、残っていればクリア
  if (life <= 0) {
    resultTitle.textContent = 'Game Over!';
    resultTitle.style.color = '#e74c3c'; // 悔しい赤色
  } else {
    resultTitle.textContent = 'Clear!';
    resultTitle.style.color = '#2ecc71'; // 嬉しいグリーン）
  }

  scoreExcellent.textContent = scores.excellent;
  scoreGood.textContent = scores.good;
  scoreMiss.textContent = scores.miss;
}

function resetToTitle() {
  resultScreen.classList.add('hidden');
  titleScreen.classList.remove('hidden');
}

// 【追加】フィードバックメッセージを表示する関数
function showMessage(text, colorClass) {
  messageDisplay.textContent = text;
  // hiddenを外し、色用のクラスを付与してアニメーションを発火
  messageDisplay.className = `message-text ${colorClass}`;
}