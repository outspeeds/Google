let games = [];
let activeId = null;
let activeApps = new Set();
let isInternalNav = false;

async function init() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    setTheme(savedTheme);
    
    // Load games from API
    try {
        const response = await fetch('/api/games');
        games = await response.json();
        console.log('Loaded games:', games);
        renderGames();
    } catch (error) {
        console.error('Failed to load games:', error);
    }
    
    window.addEventListener('hashchange', checkHash);
    checkHash();
}

function renderGames() {
    const launcher = document.getElementById('app-launcher');
    const results = document.getElementById('gameResults');
    const ifrContainer = document.getElementById('iframe-container');
    
    if (!launcher || !results || !ifrContainer) {
        console.error('Required DOM elements not found');
        return;
    }
    
    games.forEach((game, index) => {
        const app = document.createElement('div');
        app.className = 'app-card';
        app.id = `card-${game.id}`;
        app.style.order = index + 10;
        app.innerHTML = `
            <div onclick="launch('${game.id}')" style="display:flex; flex-direction:column; align-items:center; width: 100%;">
                <div class="app-icon" style="background:hsl(${Math.random()*360}, 65%, 50%)"></div>
                <span>${game.name}</span>
            </div>
            <button class="kill-btn" id="kill-card-${game.id}" onclick="killGame('${game.id}', event)">End Task</button>`;
        launcher.appendChild(app);
        
        const item = document.createElement('div');
        item.className = 'result-item';
        item.id = `result-${game.id}`;
        item.style.order = index + 10;
        item.innerHTML = `
            <span class="result-url">google.com › games › ${game.id}</span>
            <span class="result-title" onclick="launch('${game.id}')">${game.name}</span>
            <div class="result-desc">${game.desc}</div>
            <button class="kill-btn" id="kill-res-${game.id}" onclick="killGame('${game.id}', event)">End Task</button>`;
        results.appendChild(item);
        
        const ifr = document.createElement('iframe');
        ifr.id = `frame-${game.id}`;
        ifr.className = 'game-frame';
        ifr.allow = "fullscreen; gamepad; keyboard-lock";
        ifrContainer.appendChild(ifr);
    });
}

function checkHash() {
    if (isInternalNav) { 
        isInternalNav = false; 
        return; 
    }
    const hash = window.location.hash;
    if (hash.startsWith('#game/')) {
        launch(hash.split('/')[1], false);
    } else if (hash.startsWith('#search/')) {
        const query = decodeURIComponent(hash.split('/')[1]);
        document.getElementById('searchBar').value = query;
        applySearch(query);
    } else {
        goHome(false);
    }
}

function setTheme(theme) {
    document.body.setAttribute('data-theme', theme);
    const logo = document.getElementById('google-logo');
    if (logo) {
        logo.src = theme === 'dark' ? 
            "https://www.google.com/images/branding/googlelogo/2x/googlelogo_light_color_272x92dp.png" : 
            "https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_272x92dp.png";
    }
    localStorage.setItem('theme', theme);
}

function toggleDarkMode() {
    const currentTheme = document.body.getAttribute('data-theme');
    setTheme(currentTheme === 'light' ? 'dark' : 'light');
}

function toggleLauncher() {
    const l = document.getElementById('app-launcher');
    l.style.display = l.style.display === 'grid' ? 'none' : 'grid';
}

function goHome(pushHash = true) {
    document.body.classList.remove('searching');
    document.getElementById('searchBar').value = '';
    document.querySelectorAll('.game-frame').forEach(f => f.classList.remove('active'));
    document.getElementById('google-nav').style.display = 'flex';
    document.getElementById('game-controls').style.display = 'none';
    activeId = null;
    if (pushHash) { 
        isInternalNav = true; 
        window.location.hash = ""; 
    }
}

function handleSearchInput() {
    const query = document.getElementById('searchBar').value;
    if (query) {
        isInternalNav = true;
        window.location.hash = `search/${encodeURIComponent(query)}`;
        applySearch(query);
    } else {
        goHome();
    }
}

function applySearch(query) {
    const q = query.toLowerCase();
    document.body.classList.add('searching');
    document.querySelectorAll('.result-item').forEach(item => {
        item.style.display = item.innerText.toLowerCase().includes(q) ? 'block' : 'none';
    });
}

function launch(id, pushHash = true) {
    const ifr = document.getElementById(`frame-${id}`);
    if (!ifr) return;
    
    if (!ifr.src || ifr.src === "about:blank") {
        const game = games.find(g => g.id === id);
        if (game) ifr.src = game.url;
    }
    
    document.querySelectorAll('.game-frame').forEach(f => f.classList.remove('active'));
    ifr.classList.add('active');
    
    document.getElementById('google-nav').style.display = 'none';
    document.getElementById('game-controls').style.display = 'flex';
    document.getElementById('app-launcher').style.display = 'none';
    
    activeApps.add(id);
    updateOrder(id, true);
    
    const killCardBtn = document.getElementById(`kill-card-${id}`);
    const killResBtn = document.getElementById(`kill-res-${id}`);
    if (killCardBtn) killCardBtn.style.display = 'block';
    if (killResBtn) killResBtn.style.display = 'block';
    
    activeId = id;
    if (pushHash) { 
        isInternalNav = true; 
        window.location.hash = `game/${id}`; 
    }
    ifr.focus();
}

function updateOrder(id, isActive) {
    const card = document.getElementById(`card-${id}`);
    const res = document.getElementById(`result-${id}`);
    
    if (!card || !res) return;
    
    if (isActive) {
        card.classList.add('active-app'); 
        res.classList.add('active-res');
        card.style.order = "1"; 
        res.style.order = "1";
    } else {
        card.classList.remove('active-app'); 
        res.classList.remove('active-res');
        const idx = games.findIndex(g => g.id === id);
        card.style.order = idx + 10; 
        res.style.order = idx + 10;
    }
}

function killGame(id, event) {
    if (event) event.stopPropagation();
    const ifr = document.getElementById(`frame-${id}`);
    if (ifr) {
        ifr.src = "about:blank";
        ifr.classList.remove('active');
    }
    activeApps.delete(id);
    updateOrder(id, false);
    
    const killCardBtn = document.getElementById(`kill-card-${id}`);
    const killResBtn = document.getElementById(`kill-res-${id}`);
    if (killCardBtn) killCardBtn.style.display = 'none';
    if (killResBtn) killResBtn.style.display = 'none';
    
    if (activeId === id) goHome();
}

function reloadActive() {
    if (activeId) {
        const f = document.getElementById(`frame-${activeId}`);
        if (f) {
            const s = f.src; 
            f.src = 'about:blank'; 
            setTimeout(() => f.src = s, 50);
        }
    }
}

function handleEnter(e) {
    if (e.key === "Enter") {
        const visible = Array.from(document.querySelectorAll('.result-item'))
            .filter(i => i.style.display !== 'none')
            .sort((a, b) => a.style.order - b.style.order);
        if (visible.length > 0) {
            const title = visible[0].querySelector('.result-title');
            if (title) title.click();
        }
    }
}

function luckyLaunch() {
    if (games.length > 0) {
        launch(games[Math.floor(Math.random() * games.length)].id);
    }
}

init();