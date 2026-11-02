
/* ======================================================
  LAB 6 — script.js starter

  COMPLETE THESE TASKS:
  - Task A: Form Validation
      * Complete validateStartForm() TODO
  - Task B: Save/Load Best Score
      * Complete loadProgress() TODO - localStorage
      * Complete saveProgress(obj) TODO - localStorage
  - Task C: API Integration
      * Complete getToken() TODO - fetch + async/await)
      * Complete fetchQuestions(cfg) TODO - fetch + response_code handling
  - Task D: Difficulty selection
      * The Difficulty dropdown (id="mode") gives "easy", "medium", or "hard".
      * You must set ROUND.difficulty based on that selection before fetching questions.
  - Task E: Show Answer Review at the end
      * Save the user's chosen answer for each question.
      * On the Result screen, list each question with:
          - Your answer
          - Correct answer
          - A mark ✓ or ✗
 
  NOTES:
  - Use const by default for values that do not get reassigned
    (e.g., DOM element references, configuration objects, fixed arrays).
  - Use let only for variables that need to change during execution
    (e.g., loop counters, accumulating totals, values updated inside functions).
  - Use textContent when showing user data.
====================================================== */

(function () {
    "use strict";

    // ------------------------------------------------------
    // Round configuration
    // ------------------------------------------------------
    var ROUND = { difficulty: "easy", amount: 10 };

    // Save best score in this browser (localStorage)
    var STORAGE_KEY = "lab6_trivia_best";

    // Open Trivia DB endpoints (no API key required)
    var API = {
        token: "https://opentdb.com/api_token.php?command=request",
        questionsUrl: function (amount, difficulty, category, token) {
            var p = new URLSearchParams();
            p.set("amount", String(amount));
            p.set("difficulty", difficulty);
            p.set("type", "multiple");
            if (category) { p.set("category", category); }
            if (token) { p.set("token", token); }
            return "https://opentdb.com/api.php?" + p.toString();
        }
    };

    function $(id) { return document.getElementById(id); }

    // Screens
    var screenStart = $("screenStart");
    var screenQuiz = $("screenQuiz");
    var screenResult = $("screenResult");

    // Inputs
    var nameInput = $("name");
    var emailInput = $("email");
    var categorySelect = $("category");
    var modeSelect = $("mode");   // Difficulty dropdown: easy/medium/hard

    // Errors
    var errName = $("errName");
    var errEmail = $("errEmail");

    // Buttons
    var btnStart = $("btnStart");
    var btnReset = $("btnReset");
    var btnQuit = $("btnQuit");
    var btnPlayAgain = $("btnPlayAgain");
    var btnHome = $("btnHome");

    // Progress UI
    var progressBox = $("progressBox");

    // Quiz UI
    var quizTitle = $("quizTitle");
    var scoreEl = $("score");
    var qNumEl = $("qNum");
    var qTotalEl = $("qTotal");
    var questionText = $("questionText");
    var choicesBox = $("choices");

    // Loading + errors
    var loadingBox = $("loadingBox");
    var apiErrorBox = $("apiErrorBox");

    // Result UI
    var resultTitle = $("resultTitle");
    var resultText = $("resultText");
    var reviewBox = $("reviewBox");

    // Runtime state
    var state = {
        player: { name: "", email: "", category: "", mode: "easy" },
        token: null,
        questions: [],
        idx: 0,
        score: 0
    };

    // Screen helpers
    function show(el) { el.classList.remove("hidden"); }
    function hide(el) { el.classList.add("hidden"); }

    function showOnly(which) {
        hide(screenStart);
        hide(screenQuiz);
        hide(screenResult);
        show(which);
    }

    function setLoading(on) {
        if (on) { show(loadingBox); }
        else { hide(loadingBox); }
    }

    function setApiError(msg) {
        if (!msg) {
            apiErrorBox.textContent = "";
            hide(apiErrorBox);
            return;
        }
        apiErrorBox.textContent = msg;
        show(apiErrorBox);
    }

    function decodeHTMLEntities(s) {
        var t = document.createElement("textarea");
        t.innerHTML = s;
        return t.value;
    }

    function shuffle(arr) {
        var a = arr.slice();
        var i, j, tmp;
        for (i = a.length - 1; i > 0; i--) {
            j = Math.floor(Math.random() * (i + 1));
            tmp = a[i];
            a[i] = a[j];
            a[j] = tmp;
        }
        return a;
    }

    // ======================================================
    // TASK A: Form validation
    // ======================================================
    function validateStartForm() {
        errName.textContent = "";
        errEmail.textContent = "";

        let isValid = true;

        const nameValue = nameInput.value.trim();
        const emailValue = emailInput.value.trim();

        // Name: 2–30 characters after trim()
        if (nameValue.length < 2 || nameValue.length > 30) {
            errName.textContent = "Name must be between 2 and 30 characters.";
            isValid = false;
        }

        // Validate email
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailPattern.test(emailValue)) {
            errEmail.textContent = "Please enter a valid email address (e.g., a@b.com).";
            isValid = false;
        }

        return isValid;
    }

    // ======================================================
    // TASK B: Load best score from localStorage
    // ======================================================
    function loadProgress() {
        const fallback = { bestScore: 0, bestTotal: 0, attempts: 0 };
        const raw = localStorage.getItem(STORAGE_KEY);

        if (!raw) {
            return fallback;
        }

        try {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === "object") {
                return parsed;
            }
            return fallback;
        } catch (e) {
            return fallback;
        }
    }

    // ======================================================
    // TASK B: Save best score to localStorage
    // ======================================================
    function saveProgress(obj) {
        const jsonString = JSON.stringify(obj);
        localStorage.setItem(STORAGE_KEY, jsonString);
    }

    // ======================================================
    // TASK C: Request a token from OpenTDB
    // ======================================================
    async function getToken() {
        const res = await fetch(API.token);
        if (!res.ok) {
            throw new Error("Failed to fetch session token (HTTP " + res.status + ")");
        }

        const data = await res.json();
        if (!data || !data.token) {
            throw new Error("No token returned by the API");
        }

        return data.token;
    }

    // ======================================================
    // TASK C: Fetch questions for the round
    // ======================================================
    async function fetchQuestions(cfg) {
        const url = API.questionsUrl(cfg.amount, cfg.difficulty, state.player.category, state.token);
        const res = await fetch(url);

        if (!res.ok) {
            throw new Error("Network request failed (HTTP " + res.status + ")");
        }

        const data = await res.json();

        if (data.response_code === 0) {
            return data.results;
        } else if (data.response_code === 5) {
            throw new Error("Rate limit exceeded. Please wait a few seconds and try again.");
        } else {
            throw new Error("Failed to fetch questions. API response code: " + data.response_code);
        }
    }

    // Display best score summary on Start screen
    function renderBest() {
        var p = loadProgress();
        var bestScore = (p && typeof p.bestScore === "number") ? p.bestScore : 0;
        var bestTotal = (p && typeof p.bestTotal === "number") ? p.bestTotal : 0;
        var attempts = (p && typeof p.attempts === "number") ? p.attempts : 0;

        if (bestTotal > 0) {
            progressBox.textContent = "Best score: " + bestScore + "/" + bestTotal + " • Attempts: " + attempts;
        } else {
            progressBox.textContent = "Best score: none yet • Attempts: " + attempts;
        }
    }

    // Copy inputs into state.player
    function startFromForm() {
        state.player.name = nameInput.value.trim();
        state.player.email = emailInput.value.trim();
        state.player.category = categorySelect.value;
        state.player.mode = modeSelect.value; // stores easy/medium/hard
    }

    function beginRound() {
        state.questions = [];
        state.idx = 0;
        state.score = 0;

        scoreEl.textContent = "0";
        qNumEl.textContent = "1";
        qTotalEl.textContent = String(ROUND.amount);
        setApiError(null);
    }

    function renderQuestion() {
        var q = state.questions[state.idx];

        // Show current difficulty in the title
        quizTitle.textContent = "Trivia Round (" + ROUND.difficulty + ")";

        qTotalEl.textContent = String(ROUND.amount);
        qNumEl.textContent = String(state.idx + 1);

        questionText.textContent = q.question;
        choicesBox.innerHTML = "";

        var i;
        for (i = 0; i < q.choices.length; i++) {
            (function (choiceText) {
                var btn = document.createElement("button");
                btn.className = "choiceBtn";
                btn.textContent = choiceText;

                btn.addEventListener("click", function () {
                    handleAnswer(choiceText);
                });

                choicesBox.appendChild(btn);
            })(q.choices[i]);
        }
    }

    function handleAnswer(choiceText) {
        var q = state.questions[state.idx];

        // --------------------------------------------
        // Task E (Answer Review) — PARTIAL PROVIDED
        // --------------------------------------------
        q.userChoice = choiceText;

        if (choiceText === q.correct) {
            state.score = state.score + 1;
            scoreEl.textContent = String(state.score);
        }

        state.idx = state.idx + 1;

        if (state.idx >= ROUND.amount) {
            finishRound();
        } else {
            renderQuestion();
        }
    }

    function finishRound() {
        showOnly(screenResult);

        resultTitle.textContent = "Result";
        resultText.textContent = state.player.name + ", your score is " + state.score + "/" + ROUND.amount + ".";

        // --------------------------------------------
        // Task E (Answer Review) — PARTIAL PROVIDED
        // --------------------------------------------
        // We will build a multi-line string and show it in reviewBox.
        // TODO: Finish the lines that show:
        // - Your answer (qq.userChoice)
        // - Correct answer (qq.correct)
        // - A mark ✓ or ✗ depending on whether they match
        var lines = [];
        lines.push("Answer Review (Your answer vs Correct answer):");
        lines.push("");

        var i;
        for (i = 0; i < state.questions.length; i++) {
            var qq = state.questions[i];
            lines.push((i + 1) + ") " + qq.question);

            // TODO: Add these lines and any ✓/✗ marking you want.
            // HINT:
            //  yourAns = qq.userChoice
            //  ok = (yourAns === qq.correct)
            //  use lines.push to show ✓ or ✗

        var yourAns = qq.userChoice;
        var ok = (yourAns === qq.correct);
        var mark = ok ? "✓" : "✗";

        lines.push("   " + mark + " Your answer: " + yourAns);
        lines.push("   Correct answer: " + qq.correct);

        lines.push("");
        }

        // Show the review text on the page
        reviewBox.textContent = lines.join("\n");

        // Update best score in localStorage
        var p = loadProgress();
        var attempts = (p && typeof p.attempts === "number") ? p.attempts : 0;
        attempts = attempts + 1;

        var bestScore = (p && typeof p.bestScore === "number") ? p.bestScore : 0;
        var bestTotal = (p && typeof p.bestTotal === "number") ? p.bestTotal : 0;

        if (bestTotal === 0 || state.score > bestScore) {
            saveProgress({ bestScore: state.score, bestTotal: ROUND.amount, attempts: attempts });
        } else {
            saveProgress({ bestScore: bestScore, bestTotal: bestTotal, attempts: attempts });
        }

        renderBest();
    }


    async function runRoundFlow() {
        if (!validateStartForm()) { return; }

        startFromForm();

        // --------------------------------------------------
        // Task D (Difficulty selection) 
        // --------------------------------------------------
        ROUND.difficulty = state.player.mode;


        beginRound();
        showOnly(screenQuiz);

        try {
            setLoading(true);

            if (!state.token) {
                state.token = await getToken();
            }

            var raw = await fetchQuestions(ROUND);

            // Normalize API data into internal format
            state.questions = [];
            var i;
            for (i = 0; i < raw.length; i++) {
                var item = raw[i];

                var correct = decodeHTMLEntities(item.correct_answer);

                var incorrect = [];
                var k;
                for (k = 0; k < item.incorrect_answers.length; k++) {
                    incorrect.push(decodeHTMLEntities(item.incorrect_answers[k]));
                }

                var choices = shuffle([correct].concat(incorrect));

                state.questions.push({
                    question: decodeHTMLEntities(item.question),
                    correct: correct,
                    choices: choices
                });
            }

            setLoading(false);
            renderQuestion();

        } catch (e) {
            setLoading(false);
            setApiError(e.message || "Network / API error.");
        }
    }

    // Event listeners
    btnStart.addEventListener("click", function () {
        runRoundFlow();
    });

    btnReset.addEventListener("click", function () {
        localStorage.removeItem(STORAGE_KEY);
        renderBest();
        alert("Best score reset.");
    });

    btnQuit.addEventListener("click", function () {
        showOnly(screenStart);
    });

    btnPlayAgain.addEventListener("click", function () {
        runRoundFlow();
    });

    btnHome.addEventListener("click", function () {
        showOnly(screenStart);
    });

    // Boot
    renderBest();
    showOnly(screenStart);

})();