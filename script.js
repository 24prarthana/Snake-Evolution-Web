const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const GRID = 20;
const COLS = canvas.width / GRID;
const ROWS = canvas.height / GRID;

const $ = id => document.getElementById(id);

let snake, food, bonusFood, powerUp;
let direction, nextDirection;
let score = 0, level = 1, best = Number(localStorage.getItem("snakeBest")) || 0;
let running = false, paused = false, gameOver = false;
let shield = false, speedUntil = 0;
let foodCount = 0, bonusCount = 0, powerupCount = 0;
let bonusAt = 0, powerAt = 0, bonusExpiry = 0, powerExpiry = 0;
let lastMove = 0, animation = null;
let sound = true;

const speeds = { easy: 180, normal: 130, hard: 95 };

const achievements = [
    ["first", "First Bite", "Collect your first food"],
    ["century", "Century Club", "Reach 100 points"],
    ["master", "Snake Master", "Reach 500 points"],
    ["hunter", "Food Hunter", "Collect 10 normal foods"],
    ["gold", "Golden Hunter", "Collect 5 bonus foods"],
    ["collector", "Power Collector", "Collect 5 power-ups"],
    ["evolution", "Evolution Expert", "Reach level 5"]
];

let unlocked = JSON.parse(localStorage.getItem("snakeAchievements") || "[]");

function playerName() {
    return $("playerInput").value.trim() || "Player";
}

function playSound(frequency = 500) {
    if (!sound) return;
    try {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (!Audio) return;
        const audio = new Audio();
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        oscillator.frequency.value = frequency;
        gain.gain.value = 0.04;
        oscillator.connect(gain);
        gain.connect(audio.destination);
        oscillator.start();
        oscillator.stop(audio.currentTime + 0.08);
        oscillator.onended = () => audio.close();
    } catch (_) {}
}

function randomPosition() {
    let p;
    do {
        p = {
            x: Math.floor(Math.random() * COLS),
            y: Math.floor(Math.random() * ROWS)
        };
    } while (
        snake.some(s => s.x === p.x && s.y === p.y) ||
        (powerUp && powerUp.x === p.x && powerUp.y === p.y) ||
        (bonusFood && bonusFood.x === p.x && bonusFood.y === p.y)
    );
    return p;
}

function resetGame() {
    snake = [
        {x: 8, y: 10},
        {x: 7, y: 10},
        {x: 6, y: 10}
    ];

    direction = "right";
    nextDirection = "right";
    food = randomPosition();
    bonusFood = null;
    powerUp = null;

    score = 0;
    level = 1;
    foodCount = 0;
    bonusCount = 0;
    powerupCount = 0;

    shield = false;
    speedUntil = 0;

    const now = Date.now();
    bonusAt = now + 8000;
    powerAt = now + 12000;
    bonusExpiry = 0;
    powerExpiry = 0;

    running = true;
    paused = false;
    gameOver = false;
    lastMove = 0;

    updateUI();
    updateStatus("Collect food to evolve!");
    $("overlay").classList.add("hidden");

    if (animation) cancelAnimationFrame(animation);
    animation = requestAnimationFrame(gameLoop);
}

function startGame() {
    if (running && paused) {
        paused = false;
        lastMove = performance.now();
        $("overlay").classList.add("hidden");
        updateStatus("Game resumed!");
        return;
    }
    resetGame();
}

function getSpeed() {
    const difficulty = $("difficulty").value;
    let speed = speeds[difficulty] - (level - 1) * 7;
    if (Date.now() < speedUntil) speed *= 0.6;
    return Math.max(45, speed);
}

function drawBoard() {
    ctx.fillStyle = "#101a28";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = "rgba(75,100,125,0.13)";
    for (let x = 0; x <= canvas.width; x += GRID) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }
    for (let y = 0; y <= canvas.height; y += GRID) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
}

function drawFood(position, color, label = "") {
    if (!position) return;
    const x = position.x * GRID + GRID / 2;
    const y = position.y * GRID + GRID / 2;

    ctx.shadowColor = color;
    ctx.shadowBlur = 13;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    if (label) {
        ctx.fillStyle = "#fff";
        ctx.font = "13px Arial";
        ctx.textAlign = "center";
        ctx.fillText(label, x, y + 4);
    }
}

function drawSnake() {
    snake.forEach((part, i) => {
        ctx.fillStyle = i === 0 ? "#76ffae" : "#36c978";
        ctx.shadowColor = "#36e68b";
        ctx.shadowBlur = i === 0 ? 12 : 4;
        ctx.beginPath();
        ctx.roundRect(
            part.x * GRID + 2,
            part.y * GRID + 2,
            GRID - 4,
            GRID - 4,
            5
        );
        ctx.fill();
    });
    ctx.shadowBlur = 0;
}

function drawPowerUp() {
    if (!powerUp) return;
    const x = powerUp.x * GRID + GRID / 2;
    const y = powerUp.y * GRID + GRID / 2;

    ctx.fillStyle = powerUp.type === "speed" ? "#54a9ff" : "#ba7bff";
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "12px Arial";
    ctx.textAlign = "center";
    ctx.fillText(powerUp.type === "speed" ? "⚡" : "S", x, y + 4);
}

function draw() {
    drawBoard();
    drawFood(food, "#ff6464");

    if (bonusFood) drawFood(bonusFood, "#ffd54a", "★");

    drawPowerUp();
    drawSnake();
}

function updateUI() {
    $("score").textContent = score;
    $("bestScore").textContent = best;
    $("level").textContent = level;
}

function updateStatus(message) {
    $("gameStatus").textContent = message;
}

function changeDirection(newDirection) {
    const opposite = {
        up: "down",
        down: "up",
        left: "right",
        right: "left"
    };

    if (opposite[newDirection] !== direction) {
        nextDirection = newDirection;
    }
}

function checkAchievements() {
    const conditions = {
        first: foodCount >= 1,
        century: score >= 100,
        master: score >= 500,
        hunter: foodCount >= 10,
        gold: bonusCount >= 5,
        collector: powerupCount >= 5,
        evolution: level >= 5
    };

    let changed = false;

    achievements.forEach(([id, name]) => {
        if (conditions[id] && !unlocked.includes(id)) {
            unlocked.push(id);
            updateStatus("Achievement unlocked: " + name);
            changed = true;
        }
    });

    if (changed) {
        localStorage.setItem("snakeAchievements", JSON.stringify(unlocked));
        renderAchievements();
    }
}

function renderAchievements() {
    const container = $("achievements");
    container.innerHTML = "";

    achievements.forEach(([id, name, description]) => {
        const item = document.createElement("div");
        item.className = "achievement-item " +
            (unlocked.includes(id) ? "unlocked" : "");
        item.textContent =
            (unlocked.includes(id) ? "🏆 " : "🔒 ") +
            name + " — " + description;
        container.appendChild(item);
    });
}

function renderLeaderboard() {
    const list = $("leaderboard");
    const entries = JSON.parse(localStorage.getItem("snakeLeaderboard") || "[]");
    list.innerHTML = "";

    if (!entries.length) {
        const li = document.createElement("li");
        li.textContent = "No scores yet. Be the first!";
        list.appendChild(li);
        return;
    }

    entries.forEach(entry => {
        const li = document.createElement("li");
        li.textContent = `${entry.name} — ${entry.score} points`;
        list.appendChild(li);
    });
}

function saveScore() {
    if (score > best) {
        best = score;
        localStorage.setItem("snakeBest", best);
    }

    const entries = JSON.parse(localStorage.getItem("snakeLeaderboard") || "[]");
    entries.push({
        name: playerName(),
        score: score,
        date: new Date().toLocaleDateString()
    });

    entries.sort((a, b) => b.score - a.score);
    localStorage.setItem("snakeLeaderboard", JSON.stringify(entries.slice(0, 10)));

    updateUI();
    renderLeaderboard();
}

function endGame() {
    running = false;
    gameOver = true;

    saveScore();
    playSound(140);
    updateStatus("Game over!");

    $("overlayIcon").textContent = "💀";
    $("overlayTitle").textContent = "Game Over!";
    $("overlayMessage").textContent =
        `${playerName()}, your final score is ${score}.`;
    $("startBtn").textContent = "PLAY AGAIN";
    $("overlay").classList.remove("hidden");
}

function moveSnake() {
    direction = nextDirection;

    const head = {...snake[0]};

    if (direction === "right") head.x++;
    if (direction === "left") head.x--;
    if (direction === "up") head.y--;
    if (direction === "down") head.y++;

    const eatingFood = head.x === food.x && head.y === food.y;
    const eatingBonus = bonusFood &&
        head.x === bonusFood.x && head.y === bonusFood.y;
    const eating = eatingFood || eatingBonus;

    const bodyToCheck = eating ? snake : snake.slice(0, -1);

    const hitWall =
        head.x < 0 || head.x >= COLS ||
        head.y < 0 || head.y >= ROWS;

    const hitSelf = bodyToCheck.some(
        part => part.x === head.x && part.y === head.y
    );

    if (hitWall || hitSelf) {
        if (shield) {
            shield = false;
            updateStatus("Shield saved you!");
            return;
        }
        endGame();
        return;
    }

    if (!eating) snake.pop();
    snake.unshift(head);

    if (eatingFood) {
        score += 10;
        foodCount++;
        food = randomPosition();
        playSound(600);
        updateStatus("+10 points!");
    }

    if (eatingBonus) {
        score += 30;
        bonusCount++;
        bonusFood = null;
        bonusExpiry = 0;
        playSound(950);
        updateStatus("+30 bonus points!");
    }

    if (powerUp && head.x === powerUp.x && head.y === powerUp.y) {
        powerupCount++;

        if (powerUp.type === "speed") {
            speedUntil = Date.now() + 6000;
            updateStatus("Speed boost activated!");
        } else {
            shield = true;
            updateStatus("Shield activated!");
        }

        powerUp = null;
        powerExpiry = 0;
        playSound(1000);
    }

    level = Math.floor(score / 100) + 1;

    checkAchievements();
    updateUI();
}

function updateSpecialItems() {
    const now = Date.now();

    if (!bonusFood && now >= bonusAt) {
        bonusFood = randomPosition();
        bonusExpiry = now + 6000;
        bonusAt = now + 14000;
    }

    if (bonusFood && now >= bonusExpiry) {
        bonusFood = null;
    }

    if (!powerUp && now >= powerAt) {
        powerUp = {
            ...randomPosition(),
            type: Math.random() < 0.5 ? "speed" : "shield"
        };
        powerExpiry = now + 8000;
        powerAt = now + 17000;
    }

    if (powerUp && now >= powerExpiry) {
        powerUp = null;
    }
}

function gameLoop(timestamp) {
    if (!running) return;

    if (!paused) {
        updateSpecialItems();

        if (timestamp - lastMove >= getSpeed()) {
            moveSnake();
            lastMove = timestamp;
        }
    }

    draw();

    if (running) {
        animation = requestAnimationFrame(gameLoop);
    }
}

function pauseGame() {
    if (!running) return;

    paused = !paused;

    if (paused) {
        $("overlayIcon").textContent = "⏸️";
        $("overlayTitle").textContent = "Game Paused";
        $("overlayMessage").textContent = "Take a break!";
        $("startBtn").textContent = "RESUME";
        $("overlay").classList.remove("hidden");
        updateStatus("Game paused");
    } else {
        lastMove = performance.now();
        $("overlay").classList.add("hidden");
        updateStatus("Game resumed!");
    }
}

// Keyboard
document.addEventListener("keydown", event => {
    const key = event.key.toLowerCase();

    const map = {
        arrowup: "up", w: "up",
        arrowdown: "down", s: "down",
        arrowleft: "left", a: "left",
        arrowright: "right", d: "right"
    };

    if (map[key]) {
        event.preventDefault();
        changeDirection(map[key]);
    }

    if (key === "p" || key === " ") {
        event.preventDefault();
        pauseGame();
    }

    if (key === "r") startGame();
});

// Mobile direction buttons
document.querySelectorAll(".direction").forEach(button => {
    button.addEventListener("pointerdown", event => {
        event.preventDefault();
        changeDirection(button.dataset.direction);
    });
});

// Mobile swipe
let touchX = 0;
let touchY = 0;

canvas.addEventListener("touchstart", event => {
    touchX = event.changedTouches[0].clientX;
    touchY = event.changedTouches[0].clientY;
}, {passive: true});

canvas.addEventListener("touchend", event => {
    const dx = event.changedTouches[0].clientX - touchX;
    const dy = event.changedTouches[0].clientY - touchY;

    if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;

    if (Math.abs(dx) > Math.abs(dy)) {
        changeDirection(dx > 0 ? "right" : "left");
    } else {
        changeDirection(dy > 0 ? "down" : "up");
    }
}, {passive: true});

// Main buttons
$("startBtn").addEventListener("click", startGame);
$("pauseBtn").addEventListener("click", pauseGame);
$("restartBtn").addEventListener("click", startGame);

$("soundBtn").addEventListener("click", () => {
    sound = !sound;
    $("soundBtn").textContent = sound ? "🔊 Sound ON" : "🔇 Sound OFF";
    if (sound) playSound(600);
});

$("saveSettings").addEventListener("click", () => {
    const name = playerName();
    localStorage.setItem("snakePlayer", name);
    $("playerName").textContent = name;
    $("difficultyLabel").textContent = $("difficulty").value.toUpperCase();
    updateStatus("Settings saved!");
});

function initializeGame() {
    const savedName = localStorage.getItem("snakePlayer") || "Player";

    $("playerInput").value = savedName;
    $("playerName").textContent = savedName;
    $("bestScore").textContent = best;
    $("difficultyLabel").textContent = $("difficulty").value.toUpperCase();

    snake = [
        {x: 8, y: 10},
        {x: 7, y: 10},
        {x: 6, y: 10}
    ];

    direction = "right";
    nextDirection = "right";
    food = randomPosition();

    renderAchievements();
    renderLeaderboard();
    updateUI();
    draw();

    updateStatus("Ready to play!");

    $("overlayIcon").textContent = "🐍";
    $("overlayTitle").textContent = "Snake Evolution";
    $("overlayMessage").textContent =
        "Collect food, unlock achievements and beat your high score!";
    $("startBtn").textContent = "START GAME";
    $("overlay").classList.remove("hidden");
}

initializeGame();