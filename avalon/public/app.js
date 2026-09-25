const socket = (typeof io !== 'undefined') ? io() : {
    on: () => {},
    emit: () => {}
};

// Screen IDs
const ALL_SCREENS = [
    'screen-home',
    'screen-role-select',
    'screen-mod-lobby',
    'screen-mod-game',
    'screen-player-join',
    'screen-player-waiting',
    'screen-player-game'
];

let currentScreen = 'screen-home';

function showScreen(screenId) {
    ALL_SCREENS.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });

    const target = document.getElementById(screenId);
    if (target) target.classList.remove('hidden');
    currentScreen = screenId;

    // Update Header Status & Back Button
    const statusEl = document.getElementById('game-status');
    const backBtn = document.getElementById('header-back-btn');

    if (screenId === 'screen-home') {
        if (statusEl) statusEl.innerText = 'ยินดีต้อนรับเข้าสู่ Game Avalon';
        if (backBtn) backBtn.classList.add('hidden');
    } else if (screenId === 'screen-role-select') {
        if (statusEl) statusEl.innerText = 'เลือกบทบาท & คำนวณความสมดุล';
        if (backBtn) backBtn.classList.remove('hidden');
    } else if (screenId === 'screen-mod-lobby') {
        if (statusEl) statusEl.innerText = 'ห้องรอ: สแกน QR Code เพื่อรับบทบาท';
        if (backBtn) backBtn.classList.remove('hidden');
    } else if (screenId === 'screen-mod-game') {
        if (statusEl) statusEl.innerText = 'กระดานภารกิจ: Avalon Quest Board';
        if (backBtn) backBtn.classList.add('hidden');
    } else if (screenId === 'screen-player-join') {
        if (statusEl) statusEl.innerText = 'กรอกชื่อเข้าร่วมห้อง Avalon';
        if (backBtn) backBtn.classList.remove('hidden');
    } else if (screenId === 'screen-player-waiting') {
        if (statusEl) statusEl.innerText = 'กำลังรอแจกบทบาท...';
        if (backBtn) backBtn.classList.add('hidden');
    } else if (screenId === 'screen-player-game') {
        if (statusEl) statusEl.innerText = 'บทบาทของคุณ';
        if (backBtn) backBtn.classList.add('hidden');
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function handleHeaderBack() {
    if (currentScreen === 'screen-role-select' || currentScreen === 'screen-player-join') {
        showScreen('screen-home');
    } else if (currentScreen === 'screen-mod-lobby') {
        cancelRoomAndBack();
    }
}

function cancelRoomAndBack() {
    if (confirm('คุณต้องการยกเลิกห้องและกลับสู่หน้าหลักใช่หรือไม่?')) {
        window.location.href = window.location.origin + window.location.pathname;
    }
}

// Global Game State
let myRoom = '';
let myName = '';
let myRole = '';
let allPlayers = [];
let amLeader = false;
let selectedTeam = [];
let activeRoomCode = '';

// --- Role Selection State & Config ---
let expectedPlayers = 5;
const playerBalances = {
    5: { good: 3, evil: 2 },
    6: { good: 4, evil: 2 },
    7: { good: 4, evil: 2 },
    8: { good: 5, evil: 3 },
    9: { good: 6, evil: 3 },
    10: { good: 6, evil: 4 }
};

const rolesConfig = [
    { id: 'Merlin', name: 'Merlin', team: 'good', default: true },
    { id: 'Percival', name: 'Percival', team: 'good', default: false },
    { id: 'Loyal Servant 1', name: 'Loyal Servant 1', team: 'good', default: true },
    { id: 'Loyal Servant 2', name: 'Loyal Servant 2', team: 'good', default: true },
    { id: 'Loyal Servant 3', name: 'Loyal Servant 3', team: 'good', default: false },
    { id: 'Loyal Servant 4', name: 'Loyal Servant 4', team: 'good', default: false },
    { id: 'Mordred', name: 'Mordred', team: 'evil', default: false },
    { id: 'Morgana', name: 'Morgana', team: 'evil', default: false },
    { id: 'Assassin', name: 'Assassin', team: 'evil', default: true },
    { id: 'Oberon', name: 'Oberon', team: 'evil', default: false },
    { id: 'Other Evil 1', name: 'Other Evil 1', team: 'evil', default: true },
    { id: 'Other Evil 2', name: 'Other Evil 2', team: 'evil', default: false }
];

let selectedRoles = {};
rolesConfig.forEach(r => selectedRoles[r.id] = r.default);

function updateRoleUI() {
    const countDisplay = document.getElementById('player-count-display');
    if (countDisplay) countDisplay.innerText = expectedPlayers;
    
    const balance = playerBalances[expectedPlayers];
    if (document.getElementById('good-required-desc')) document.getElementById('good-required-desc').innerText = balance.good;
    if (document.getElementById('evil-required-desc')) document.getElementById('evil-required-desc').innerText = balance.evil;
    if (document.getElementById('good-required-count')) document.getElementById('good-required-count').innerText = balance.good;
    if (document.getElementById('evil-required-count')) document.getElementById('evil-required-count').innerText = balance.evil;
    
    let goodSelected = 0;
    let evilSelected = 0;
    rolesConfig.forEach(r => {
        if (selectedRoles[r.id]) {
            if (r.team === 'good') goodSelected++;
            else evilSelected++;
        }
    });
    
    if (document.getElementById('good-selected-count')) document.getElementById('good-selected-count').innerText = goodSelected;
    if (document.getElementById('evil-selected-count')) document.getElementById('evil-selected-count').innerText = evilSelected;
    
    const btnConfirm = document.getElementById('btn-confirm-roles');
    if (btnConfirm) {
        if (goodSelected === balance.good && evilSelected === balance.evil) {
            btnConfirm.classList.remove('opacity-50', 'cursor-not-allowed');
            btnConfirm.disabled = false;
        } else {
            btnConfirm.classList.add('opacity-50', 'cursor-not-allowed');
            btnConfirm.disabled = true;
        }
    }
}

function renderRoleSwitches() {
    const container = document.getElementById('roles-container');
    if (!container) return;
    container.innerHTML = '';
    rolesConfig.forEach(r => {
        const div = document.createElement('div');
        div.className = 'w-full bg-slate-950/70 border border-slate-800 rounded-xl p-2.5 sm:p-3 flex items-center justify-between shadow-sm';
        
        let roleIconHTML = '';
        if (r.id === 'Merlin') {
            roleIconHTML = `<img src="./pics/iconmerlin.png" alt="Merlin" class="w-8 h-8 rounded-lg object-cover border border-amber-500/50 shadow shrink-0">`;
        } else if (r.team === 'good') {
            const sym = r.id === 'Percival' ? '🛡️' : '⚔️';
            roleIconHTML = `<div class="w-8 h-8 rounded-lg bg-blue-950/60 border border-blue-800/80 flex items-center justify-center text-sm shadow shrink-0">${sym}</div>`;
        } else {
            const sym = r.id === 'Assassin' ? '🗡️' : (r.id === 'Morgana' ? '🔮' : (r.id === 'Mordred' ? '👑' : (r.id === 'Oberon' ? '👁️' : '🦹')));
            roleIconHTML = `<div class="w-8 h-8 rounded-lg bg-rose-950/60 border border-rose-800/80 flex items-center justify-center text-sm shadow shrink-0">${sym}</div>`;
        }

        div.innerHTML = `
            <div class="flex items-center gap-2.5">
                ${roleIconHTML}
                <div class="flex flex-col">
                    <span class="text-slate-200 font-semibold text-sm">${r.name}</span>
                    <span class="text-[10px] ${r.team === 'good' ? 'text-blue-400' : 'text-rose-400'} uppercase font-bold tracking-wider">${r.team}</span>
                </div>
            </div>
            <label class="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" class="sr-only peer" ${selectedRoles[r.id] ? 'checked' : ''} onchange="toggleRole('${r.id}')">
              <div class="w-10 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
            </label>
        `;
        container.appendChild(div);
    });
}

window.toggleRole = function(id) {
    selectedRoles[id] = !selectedRoles[id];
    updateRoleUI();
};

document.getElementById('btn-decrease-players')?.addEventListener('click', () => {
    if (expectedPlayers > 5) { expectedPlayers--; updateRoleUI(); }
});
document.getElementById('btn-increase-players')?.addEventListener('click', () => {
    if (expectedPlayers < 10) { expectedPlayers++; updateRoleUI(); }
});

// --- Home Screen Events ---
document.getElementById('btn-create-room')?.addEventListener('click', () => {
    showScreen('screen-role-select');
    updateRoleUI();
    renderRoleSwitches();
});

document.getElementById('btn-confirm-roles')?.addEventListener('click', () => {
    const balance = playerBalances[expectedPlayers];
    let goodSelected = 0, evilSelected = 0;
    const finalRoles = [];
    rolesConfig.forEach(r => {
        if (selectedRoles[r.id]) {
            finalRoles.push(r.name);
            if (r.team === 'good') goodSelected++;
            else evilSelected++;
        }
    });
    
    if (goodSelected === balance.good && evilSelected === balance.evil) {
        socket.emit('createRoom', { expectedPlayers, roles: finalRoles });
    }
});

// --- Mod Lobby Events ---
function copyJoinLink() {
    const url = document.getElementById('qr-target-url-display')?.innerText;
    if (url) {
        navigator.clipboard.writeText(url).then(() => {
            const btnText = document.getElementById('btn-copy-link-text');
            if (btnText) {
                const old = btnText.innerText;
                btnText.innerText = 'คัดลอกสำเร็จ! ✓';
                setTimeout(() => { btnText.innerText = old; }, 2000);
            }
        });
    }
}
window.copyJoinLink = copyJoinLink;

function simulatePlayerBot() {
    if (myRoom) {
        socket.emit('simulateBot', myRoom);
    }
}
window.simulatePlayerBot = simulatePlayerBot;

// --- Manual Join from Home ---
document.getElementById('btn-join-submit')?.addEventListener('click', () => {
    const code = document.getElementById('input-room-code')?.value.trim();
    const name = document.getElementById('input-player-name')?.value.trim();
    if (code && name) {
        socket.emit('joinRoom', { roomCode: code, playerName: name });
    } else {
        alert('กรุณากรอกทั้งชื่อและรหัสห้อง');
    }
});

// --- Direct Join from QR Scan URL ---
function submitDirectPlayerJoin() {
    const name = document.getElementById('player-direct-name')?.value.trim();
    if (!name) {
        alert('กรุณากรอกชื่อของคุณ');
        return;
    }
    if (activeRoomCode) {
        socket.emit('joinRoom', { roomCode: activeRoomCode, playerName: name });
    }
}
window.submitDirectPlayerJoin = submitDirectPlayerJoin;

// --- Socket Listeners (Common) ---
socket.on('error', (msg) => alert(msg));

// --- Socket Listeners (Mod Room Created -> Load New QR Screen!) ---
socket.on('roomCreated', (roomCode) => {
    myRoom = roomCode;
    
    // Update Mod Lobby Info
    const codeDisplay = document.getElementById('mod-room-code-display');
    if (codeDisplay) codeDisplay.innerText = roomCode;
    
    const targetCount = document.getElementById('mod-target-count');
    if (targetCount) targetCount.innerText = expectedPlayers;
    
    const joinedCount = document.getElementById('mod-joined-count');
    if (joinedCount) joinedCount.innerText = '0';
    
    const progress = document.getElementById('mod-lobby-progress');
    if (progress) progress.style.width = '0%';
    
    const playersList = document.getElementById('mod-players-list');
    if (playersList) playersList.innerHTML = '';
    
    const joinUrl = window.location.origin + '?room=' + roomCode;
    const urlDisplay = document.getElementById('qr-target-url-display');
    if (urlDisplay) urlDisplay.innerText = joinUrl;
    
    // Generate QR Code into container
    const qrContainer = document.getElementById('qrcode-container');
    if (qrContainer) {
        qrContainer.innerHTML = '';
        new QRCode(qrContainer, {
            text: joinUrl,
            width: 190,
            height: 190,
            colorDark: "#020617",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.M
        });
    }

    const btnStart = document.getElementById('btn-start-game');
    if (btnStart) {
        btnStart.classList.add('opacity-50', 'cursor-not-allowed');
        btnStart.disabled = true;
    }
    
    // LOAD DEDICATED QR SCREEN
    showScreen('screen-mod-lobby');
});

// Mod Player Joined Broadcast
socket.on('playerJoined', (players) => {
    const joinedCount = document.getElementById('mod-joined-count');
    if (joinedCount) joinedCount.innerText = players.length;
    
    const pct = Math.min(100, Math.round((players.length / expectedPlayers) * 100));
    const progress = document.getElementById('mod-lobby-progress');
    if (progress) progress.style.width = pct + '%';
    
    const list = document.getElementById('mod-players-list');
    if (list) {
        list.innerHTML = '';
        players.forEach(p => {
            const div = document.createElement('div');
            div.className = 'flex items-center justify-between bg-slate-950/70 border border-slate-800 px-3 py-2 rounded-xl';
            div.innerHTML = `
                <div class="flex items-center gap-2">
                    <span class="text-xs">👤</span>
                    <span class="text-xs font-semibold text-slate-200">${p.name}</span>
                </div>
                <span class="text-[10px] text-emerald-400 font-mono">พร้อมแล้ว</span>
            `;
            list.appendChild(div);
        });
    }
    
    const btnStart = document.getElementById('btn-start-game');
    const waitingText = document.getElementById('mod-waiting-text');
    
    if (players.length >= expectedPlayers) {
        if (btnStart) {
            btnStart.classList.remove('opacity-50', 'cursor-not-allowed');
            btnStart.disabled = false;
        }
        if (waitingText) {
            waitingText.innerText = 'ผู้เล่นครบแล้ว! กด Start Game เพื่อเริ่มเกมได้เลย';
            waitingText.className = 'text-xs text-emerald-400 text-center font-bold pt-1';
        }
    } else {
        if (btnStart) {
            btnStart.classList.add('opacity-50', 'cursor-not-allowed');
            btnStart.disabled = true;
        }
        if (waitingText) {
            waitingText.innerText = 'กำลังรอให้ผู้เล่นสแกนเข้าร่วมห้อง...';
            waitingText.className = 'text-xs text-slate-500 text-center italic pt-1';
        }
    }
});

// Mod Clicks Start Game
document.getElementById('btn-start-game')?.addEventListener('click', (e) => {
    if (e.currentTarget.disabled || e.currentTarget.classList.contains('opacity-50')) return;
    socket.emit('startGame', myRoom);
    
    // Transition to Quest Board Screen
    showScreen('screen-mod-game');
    const boardCode = document.getElementById('game-board-room-code');
    if (boardCode) boardCode.innerText = myRoom;
    renderQuestTracker([]);
});

// --- Player Socket Listeners ---
socket.on('joined', ({ roomCode, playerName }) => {
    myRoom = roomCode;
    myName = playerName;
    
    const waitingTag = document.getElementById('waiting-room-tag');
    if (waitingTag) waitingTag.innerText = roomCode;
    
    const nameDisplay = document.getElementById('player-my-name-display');
    if (nameDisplay) nameDisplay.innerText = playerName;
    
    showScreen('screen-player-waiting');
});

const ROLES_DETAILS = {
    'Merlin': {
        name: 'Merlin',
        thai: 'เมอร์ลิน (ผู้วิเศษ)',
        icon: '<img src="./pics/iconmerlin.png" alt="Merlin" class="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover border-2 border-amber-400/80 shadow-[0_0_15px_rgba(245,158,11,0.6)] mx-auto">',
        desc: 'รู้ว่าใครเป็นฝ่ายร้าย (ยกเว้น Mordred) แต่ต้องระวังไม่ให้ Assassin สังหารตอนจบเกม',
        team: 'good'
    },
    'Percival': {
        name: 'Percival',
        thai: 'เพอร์ซิวัล (อัศวินผู้ภักดี)',
        icon: '🛡️',
        desc: 'มองเห็น Merlin และ Morgana แต่ไม่รู้ว่าใครคือตัวจริง ต้องคอยปกป้องเมอร์ลินตัวจริง',
        team: 'good'
    },
    'Loyal Servant 1': {
        name: 'Loyal Servant',
        thai: 'อัศวินผู้ภักดีของอาเธอร์',
        icon: '⚔️',
        desc: 'ผู้รับใช้ที่ซื่อสัตย์ของกษัตริย์อาเธอร์ ทำภารกิจให้สำเร็จและช่วยปกป้องความลับของเมอร์ลิน',
        team: 'good'
    },
    'Loyal Servant 2': {
        name: 'Loyal Servant',
        thai: 'อัศวินผู้ภักดีของอาเธอร์',
        icon: '⚔️',
        desc: 'ผู้รับใช้ที่ซื่อสัตย์ของกษัตริย์อาเธอร์ ทำภารกิจให้สำเร็จและช่วยปกป้องความลับของเมอร์ลิน',
        team: 'good'
    },
    'Loyal Servant 3': {
        name: 'Loyal Servant',
        thai: 'อัศวินผู้ภักดีของอาเธอร์',
        icon: '⚔️',
        desc: 'ผู้รับใช้ที่ซื่อสัตย์ของกษัตริย์อาเธอร์ ทำภารกิจให้สำเร็จและช่วยปกป้องความลับของเมอร์ลิน',
        team: 'good'
    },
    'Loyal Servant 4': {
        name: 'Loyal Servant',
        thai: 'อัศวินผู้ภักดีของอาเธอร์',
        icon: '⚔️',
        desc: 'ผู้รับใช้ที่ซื่อสัตย์ของกษัตริย์อาเธอร์ ทำภารกิจให้สำเร็จและช่วยปกป้องความลับของเมอร์ลิน',
        team: 'good'
    },
    'Mordred': {
        name: 'Mordred',
        thai: 'มอร์เดรด (ผู้นำฝ่ายร้าย)',
        icon: '👑😈',
        desc: 'ผู้นำฝ่ายร้ายที่ไม่ปรากฏในสายตาของเมอร์ลิน (เมอร์ลินมองไม่เห็นว่าเป็นฝ่ายร้าย)',
        team: 'evil'
    },
    'Morgana': {
        name: 'Morgana',
        thai: 'มอร์กานา (แม่มดมนต์ดำ)',
        icon: '🔮',
        desc: 'ปลอมตัวเป็นเมอร์ลิน เพื่อหลอกลวงเพอร์ซิวัลให้เข้าใจผิดและสนับสนุนฝ่ายร้าย',
        team: 'evil'
    },
    'Assassin': {
        name: 'Assassin',
        thai: 'แอสซาซิน (มือสังหาร)',
        icon: '🗡️',
        desc: 'มือสังหารฝ่ายร้าย หากฝ่ายคนดีชนะภารกิจ คุณมีสิทธิ์ชี้ตัวสังหารเมอร์ลินเพื่อพลิกชนะ',
        team: 'evil'
    },
    'Oberon': {
        name: 'Oberon',
        thai: 'โอเบรอน (สมุนปริศนา)',
        icon: '👁️',
        desc: 'ฝ่ายร้ายที่ไม่รู้จักฝ่ายร้ายคนอื่น และฝ่ายร้ายคนอื่นก็ไม่รู้จักเขาเช่นกัน',
        team: 'evil'
    },
    'Other Evil 1': {
        name: 'Minion of Mordred',
        thai: 'สมุนฝ่ายมอร์เดรด',
        icon: '🦹',
        desc: 'สมุนฝ่ายร้าย รู้ว่าใครคือฝ่ายร้ายด้วยกัน ร่วมมือกันขัดขวางภารกิจให้ล้มเหลว',
        team: 'evil'
    },
    'Other Evil 2': {
        name: 'Minion of Mordred',
        thai: 'สมุนฝ่ายมอร์เดรด',
        icon: '🦹',
        desc: 'สมุนฝ่ายร้าย รู้ว่าใครคือฝ่ายร้ายด้วยกัน ร่วมมือกันขัดขวางภารกิจให้ล้มเหลว',
        team: 'evil'
    }
};

function toggleCardFlipPrivacy() {
    const cardInner = document.getElementById('player-card-inner');
    const btnText = document.getElementById('btn-toggle-privacy-text');
    if (!cardInner) return;
    
    const isFlipped = cardInner.classList.contains('flipped');
    if (isFlipped) {
        cardInner.classList.remove('flipped');
        if (btnText) btnText.innerText = 'แตะเพื่อเปิดดูบทบาทอีกครั้ง 👁️';
    } else {
        cardInner.classList.add('flipped');
        if (btnText) btnText.innerText = 'แตะเพื่อซ่อนการ์ด (ป้องกันคนข้างๆ แอบดู)';
    }
}
window.toggleCardFlipPrivacy = toggleCardFlipPrivacy;

socket.on('roleAssigned', (role) => {
    myRole = role;
    
    // Reset flip state to face-down initially
    const cardInner = document.getElementById('player-card-inner');
    if (cardInner) cardInner.classList.remove('flipped');
    const btnText = document.getElementById('btn-toggle-privacy-text');
    if (btnText) btnText.innerText = 'แตะเพื่อดูบทบาทลับ';

    const isEvil = ['Mordred', 'Morgana', 'Assassin', 'Oberon', 'Other Evil 1', 'Other Evil 2', 'Minion'].some(r => role.includes(r));
    const info = ROLES_DETAILS[role] || {
        name: role,
        thai: isEvil ? 'ฝ่ายมอร์เดรด' : 'อัศวินของอาเธอร์',
        icon: isEvil ? '🦹' : '⚔️',
        desc: isEvil ? 'ร่วมมือกับฝ่ายร้าย ขัดขวางภารกิจ' : 'ทำภารกิจให้สำเร็จและช่วยฝ่ายคนดีชนะ',
        team: isEvil ? 'evil' : 'good'
    };

    const roleText = document.getElementById('player-role-text');
    if (roleText) roleText.innerText = info.name;

    const roleThai = document.getElementById('card-role-thai');
    if (roleThai) roleThai.innerText = info.thai;

    const roleIcon = document.getElementById('card-role-icon');
    if (roleIcon) {
        if (info.icon && info.icon.includes('<img')) {
            roleIcon.innerHTML = info.icon;
            roleIcon.className = 'my-1 flex items-center justify-center transform hover:scale-105 transition-transform';
        } else {
            roleIcon.innerText = info.icon;
            roleIcon.className = 'text-5xl sm:text-6xl drop-shadow-[0_0_16px_rgba(245,158,11,0.5)] transform hover:scale-105 transition-transform';
        }
    }

    const roleDesc = document.getElementById('card-role-desc');
    if (roleDesc) roleDesc.innerText = info.desc;

    const nameTag = document.getElementById('card-player-name-tag');
    if (nameTag) nameTag.innerText = myName || 'ผู้เล่น';

    const teamBadge = document.getElementById('player-team-text');
    const glow = document.getElementById('role-bg-glow');

    if (teamBadge) {
        if (isEvil) {
            teamBadge.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-950 text-rose-400 border border-rose-800 shadow';
            teamBadge.innerText = '🔴 ฝ่ายร้าย (Evil)';
        } else {
            teamBadge.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-950 text-blue-400 border border-blue-800 shadow';
            teamBadge.innerText = '🔵 ฝ่ายคนดี (Good)';
        }
    }

    if (glow) {
        glow.className = isEvil 
            ? 'absolute -top-16 -left-16 w-52 h-52 rounded-full blur-3xl opacity-35 bg-rose-600 pointer-events-none'
            : 'absolute -top-16 -left-16 w-52 h-52 rounded-full blur-3xl opacity-35 bg-blue-600 pointer-events-none';
    }

    showScreen('screen-player-game');
});

// Avalon Quest Matrix: Required team size per Quest for 5-10 players
const QUEST_REQUIREMENTS = {
    5:  [2, 3, 2, 3, 3],
    6:  [2, 3, 4, 3, 4],
    7:  [2, 3, 3, 4, 4],
    8:  [3, 4, 4, 5, 5],
    9:  [3, 4, 4, 5, 5],
    10: [3, 4, 4, 5, 5]
};

let currentQuest = 1;
let requiredTeamSize = 2;
let questRequirements = [2, 3, 2, 3, 3];
let currentQuestResults = [];

// --- Game FSM Handlers ---
socket.on('gameStateChanged', (data) => {
    const { 
        state, 
        leader, 
        leaderId, 
        players, 
        currentQuest: qNum, 
        requiredTeamSize: reqSize, 
        questRequirements: qReqs,
        rejectedVoteCount,
        questResults,
        proposedTeam
    } = data;

    if (qNum !== undefined) currentQuest = qNum;
    if (reqSize !== undefined) requiredTeamSize = reqSize;
    if (qReqs) questRequirements = qReqs;
    if (questResults) currentQuestResults = questResults;

    // Update Mod Board Status & Quest Tracker
    const modStatus = document.getElementById('mod-status');
    if (modStatus) {
        if (state === 'TEAM_BUILDING') {
            modStatus.innerText = `ภารกิจที่ ${currentQuest} (ต้องการ ${requiredTeamSize} คน) | ผู้นำ: ${leader}`;
        } else if (state === 'TEAM_VOTING') {
            modStatus.innerText = `กำลังโหวตรับรองทีม: ${proposedTeam ? proposedTeam.join(', ') : ''}`;
        } else if (state === 'QUEST_EXECUTION') {
            modStatus.innerText = `กำลังดำเนินภารกิจที่ ${currentQuest}...`;
        } else if (state === 'GAME_OVER') {
            modStatus.innerText = `🏆 จบเกม!`;
        }
    }

    renderQuestTracker(currentQuestResults, currentQuest, questRequirements);
    
    // Update Vote Track
    if (rejectedVoteCount !== undefined) {
        updateVoteTrack(rejectedVoteCount);
    }
    
    // Update Live Players on Mod Board
    if (players) {
        allPlayers = players;
        const gamePlayersList = document.getElementById('game-players-list');
        if (gamePlayersList) {
            gamePlayersList.innerHTML = '';
            players.forEach(p => {
                const isLeader = (p.id === leaderId || p.name === leader);
                const div = document.createElement('div');
                div.className = `p-2 rounded-xl border text-center transition ${isLeader ? 'border-amber-500 bg-amber-950/40 text-amber-300 font-bold shadow-sm' : 'border-slate-800 bg-slate-950/70 text-slate-300'}`;
                div.innerHTML = `${isLeader ? '👑 ' : ''}${p.name}`;
                gamePlayersList.appendChild(div);
            });
        }
    }

    // Player View Actions
    const playerBanner = document.getElementById('player-status-banner');
    const actionPanel = document.getElementById('action-panel');
    const teamSelection = document.getElementById('team-selection');
    const votingPanel = document.getElementById('voting-panel');
    const questPanel = document.getElementById('quest-panel');

    if (actionPanel) actionPanel.classList.remove('hidden');
    if (teamSelection) teamSelection.classList.add('hidden');
    if (votingPanel) votingPanel.classList.add('hidden');
    if (questPanel) questPanel.classList.add('hidden');

    if (state === 'TEAM_BUILDING') {
        amLeader = (leaderId === socket.id || leader === myName);
        if (playerBanner) {
            playerBanner.innerText = amLeader 
                ? `👑 คุณเป็นผู้นำ! เลือกสมาชิก ${requiredTeamSize} คนสำหรับภารกิจที่ ${currentQuest}` 
                : `รอ ${leader} เลือกสมาชิก ${requiredTeamSize} คน...`;
        }
        
        if (amLeader) {
            if (teamSelection) teamSelection.classList.remove('hidden');
            renderPlayerGrid(allPlayers);
        }
    } else if (state === 'TEAM_VOTING') {
        if (playerBanner) playerBanner.innerText = `ร่วมลงคะแนนโหวตรับรองทีม (${proposedTeam ? proposedTeam.join(', ') : ''})`;
        if (votingPanel) votingPanel.classList.remove('hidden');
    } else if (state === 'QUEST_EXECUTION') {
        if (playerBanner) playerBanner.innerText = `กำลังดำเนินภารกิจที่ ${currentQuest}...`;
    } else if (state === 'GAME_OVER') {
        if (playerBanner) playerBanner.innerText = "เกมจบลงแล้ว!";
        if (modStatus) modStatus.innerText = "🏆 จบเกม!";
    }
});

function renderPlayerGrid(players) {
    const grid = document.getElementById('player-grid');
    if (!grid) return;
    grid.innerHTML = '';
    selectedTeam = [];
    
    updateTeamSelectionUI();

    players.forEach(p => {
        const btn = document.createElement('button');
        btn.className = 'p-3 bg-slate-950 border border-slate-700 rounded-xl text-xs font-semibold text-slate-200 transition flex items-center justify-between active:scale-95';
        btn.innerHTML = `<span>${p.name}</span><span class="check-icon text-xs text-slate-500">⚪</span>`;
        
        btn.addEventListener('click', () => {
            if (selectedTeam.includes(p.id)) {
                selectedTeam = selectedTeam.filter(id => id !== p.id);
                btn.className = 'p-3 bg-slate-950 border border-slate-700 rounded-xl text-xs font-semibold text-slate-200 transition flex items-center justify-between active:scale-95';
                const icon = btn.querySelector('.check-icon');
                if (icon) {
                    icon.innerText = '⚪';
                    icon.className = 'check-icon text-xs text-slate-500';
                }
            } else {
                if (selectedTeam.length >= requiredTeamSize) {
                    alert(`สามารถเลือกได้สูงสุด ${requiredTeamSize} คนสำหรับ Quest นี้`);
                    return;
                }
                selectedTeam.push(p.id);
                btn.className = 'p-3 bg-amber-500/20 border-2 border-amber-500 rounded-xl text-xs font-bold text-amber-300 transition flex items-center justify-between active:scale-95';
                const icon = btn.querySelector('.check-icon');
                if (icon) {
                    icon.innerText = '✓';
                    icon.className = 'check-icon text-xs text-amber-400 font-bold';
                }
            }
            updateTeamSelectionUI();
        });
        grid.appendChild(btn);
    });
}

function updateTeamSelectionUI() {
    const countEl = document.getElementById('team-select-count');
    const reqEl = document.getElementById('team-select-required');
    const hintEl = document.getElementById('team-select-hint');
    const proposeBtn = document.getElementById('btn-propose-team');
    const questLabel = document.getElementById('current-quest-num-label');

    if (questLabel) questLabel.innerText = currentQuest;
    if (countEl) countEl.innerText = selectedTeam.length;
    if (reqEl) reqEl.innerText = requiredTeamSize;

    if (proposeBtn) {
        if (selectedTeam.length === requiredTeamSize) {
            proposeBtn.classList.remove('hidden');
            if (hintEl) {
                hintEl.innerText = `✓ เลือกครบ ${requiredTeamSize} คนแล้ว! กดปุ่มด้านล่างเพื่อเสนอทีม`;
                hintEl.className = 'text-[11px] text-emerald-400 font-bold text-center';
            }
        } else {
            proposeBtn.classList.add('hidden');
            const diff = requiredTeamSize - selectedTeam.length;
            if (hintEl) {
                hintEl.innerText = `กรุณาเลือกอีก ${diff} คน (ต้องการทั้งหมด ${requiredTeamSize} คน)`;
                hintEl.className = 'text-[11px] text-slate-400 text-center';
            }
        }
    }
}

document.getElementById('btn-propose-team')?.addEventListener('click', () => {
    if (selectedTeam.length !== requiredTeamSize) {
        alert(`ต้องเลือกสมาชิกให้ครบ ${requiredTeamSize} คน`);
        return;
    }
    socket.emit('proposeTeam', { roomCode: myRoom, team: selectedTeam });
});

socket.on('voteTeam', (team) => {
    const proposed = team.map(id => {
        const p = allPlayers.find(pl => pl.id === id);
        return p ? p.name : 'Unknown';
    }).join(', ');
    const namesEl = document.getElementById('proposed-team-names');
    if (namesEl) namesEl.innerText = proposed;
});

document.querySelectorAll('.vote-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const vote = e.currentTarget.getAttribute('data-vote');
        socket.emit('voteTeamSubmit', { roomCode: myRoom, vote });
        const votingPanel = document.getElementById('voting-panel');
        if (votingPanel) votingPanel.classList.add('hidden');
        const playerBanner = document.getElementById('player-status-banner');
        if (playerBanner) playerBanner.innerText = "ส่งผลโหวตแล้ว รอผู้เล่นคนอื่น...";
    });
});

// --- Team Vote Results Announcement Modal ---
window.voteResultInterval = null;

socket.on('teamVoteResult', (data) => {
    const { approved, approvesCount, rejectsCount, voteDetails, nextLeader, rejectedVoteCount, proposedTeam, revealDuration } = data;
    
    // Proposed Team
    const teamEl = document.getElementById('vote-result-team-names');
    if (teamEl) teamEl.innerText = proposedTeam ? proposedTeam.join(', ') : '';

    // Status Badge
    const badge = document.getElementById('vote-result-status-badge');
    if (badge) {
        if (approved) {
            badge.className = 'px-3.5 py-1.5 rounded-full text-xs font-bold inline-block mt-1 bg-emerald-950 text-emerald-300 border border-emerald-700 shadow-sm';
            badge.innerText = '🟢 ผ่านการรับรอง (> 50%) — เตรียมลง Quest!';
        } else {
            badge.className = 'px-3.5 py-1.5 rounded-full text-xs font-bold inline-block mt-1 bg-rose-950 text-rose-300 border border-rose-700 shadow-sm';
            badge.innerText = '🔴 ไม่ผ่านการรับรอง (≤ 50%) — เปลี่ยนผู้นำคนถัดไป!';
        }
    }

    // Numbers
    if (document.getElementById('vote-result-approve-count')) document.getElementById('vote-result-approve-count').innerText = approvesCount;
    if (document.getElementById('vote-result-reject-count')) document.getElementById('vote-result-reject-count').innerText = rejectsCount;

    // Breakdown List
    const list = document.getElementById('vote-result-players-list');
    if (list && voteDetails) {
        list.innerHTML = '';
        voteDetails.forEach(item => {
            const isApprove = (item.vote === 'approve');
            const div = document.createElement('div');
            div.className = 'flex items-center justify-between p-2 rounded-xl bg-slate-950 border border-slate-800 text-xs';
            div.innerHTML = `
                <span class="font-medium text-slate-200">👤 ${item.name}</span>
                ${isApprove 
                  ? '<span class="text-xs font-bold text-emerald-400 bg-emerald-950/70 border border-emerald-800/80 px-2 py-0.5 rounded-lg flex items-center gap-1">🟢 เห็นชอบ (Approve)</span>'
                  : '<span class="text-xs font-bold text-rose-400 bg-rose-950/70 border border-rose-800/80 px-2 py-0.5 rounded-lg flex items-center gap-1">🔴 คัดค้าน (Reject)</span>'}
            `;
            list.appendChild(div);
        });
    }

    // Next Leader Box
    const nextBox = document.getElementById('vote-result-next-leader-box');
    const nextName = document.getElementById('vote-result-next-leader-name');
    if (nextBox && nextName) {
        if (!approved && nextLeader) {
            nextBox.classList.remove('hidden');
            nextName.innerText = nextLeader;
        } else {
            nextBox.classList.add('hidden');
        }
    }

    // Countdown Timer
    let countdownSec = revealDuration || 4;
    const timerHint = document.getElementById('vote-result-timer-hint');
    if (timerHint) {
        timerHint.innerText = `กำลังเข้าสู่ขั้นตอนถัดไปใน ${countdownSec} วินาที...`;
    }

    if (window.voteResultInterval) clearInterval(window.voteResultInterval);
    window.voteResultInterval = setInterval(() => {
        countdownSec--;
        if (countdownSec > 0) {
            if (timerHint) timerHint.innerText = `กำลังเข้าสู่ขั้นตอนถัดไปใน ${countdownSec} วินาที...`;
        } else {
            clearInterval(window.voteResultInterval);
            window.voteResultInterval = null;
        }
    }, 1000);

    // Show Vote Result Modal
    const modal = document.getElementById('vote-result-modal');
    if (modal) modal.classList.remove('hidden');
});

function proceedFromVoteModal() {
    if (window.voteResultInterval) {
        clearInterval(window.voteResultInterval);
        window.voteResultInterval = null;
    }
    closeVoteResultModal();
    socket.emit('skipVoteReveal', myRoom);
}
window.proceedFromVoteModal = proceedFromVoteModal;

function closeVoteResultModal() {
    const modal = document.getElementById('vote-result-modal');
    if (modal) modal.classList.add('hidden');
}
window.closeVoteResultModal = closeVoteResultModal;

// --- Quest Execution Popup Modal ---
socket.on('startQuest', (data) => {
    const team = data.team || data;
    const qNum = data.currentQuest || currentQuest;
    
    // Close team vote result modal if still open
    closeVoteResultModal();

    if (team.includes(socket.id)) {
        const modal = document.getElementById('quest-action-modal');
        const numLabel = document.getElementById('quest-modal-num');
        if (numLabel) numLabel.innerText = qNum;
        if (modal) modal.classList.remove('hidden');
    } else {
        const playerBanner = document.getElementById('player-status-banner');
        if (playerBanner) playerBanner.innerText = `สมาชิกในทีมกำลังดำเนินภารกิจที่ ${qNum}...`;
    }
});

function submitQuestVote(vote) {
    const isEvil = ['Mordred', 'Morgana', 'Assassin', 'Oberon', 'Other Evil 1', 'Other Evil 2', 'Minion'].some(r => myRole.includes(r));
    
    if (!isEvil && vote === 'fail') {
        alert('คุณเป็นฝ่ายคนดี (Good) ตามกติกาคุณต้องลงผลสำเร็จ (SUCCESS) เท่านั้น!');
        return;
    }

    socket.emit('questVoteSubmit', { roomCode: myRoom, vote });
    socket.emit('voteQuest', { roomCode: myRoom, vote });
    
    // Close modal
    const modal = document.getElementById('quest-action-modal');
    if (modal) modal.classList.add('hidden');

    const playerBanner = document.getElementById('player-status-banner');
    if (playerBanner) playerBanner.innerText = "ส่งการกระทำในภารกิจอย่างลับ ๆ แล้ว... รอสรุปผล";
}
window.submitQuestVote = submitQuestVote;

// --- Quest Result Announcement on Mod Board ---
socket.on('questResult', ({ questNumber, success, allSuccess, fails, history, rejectedVoteCount, nextLeader }) => {
    if (history) currentQuestResults = history;
    renderQuestTracker(currentQuestResults, currentQuest, questRequirements);
    updateVoteTrack(rejectedVoteCount || 0);
    
    const modStatus = document.getElementById('mod-status');
    const resultMsg = (allSuccess || fails === 0) 
        ? `ภารกิจที่ ${questNumber}: 🔵 สำเร็จ (All Success!)` 
        : `ภารกิจที่ ${questNumber}: 🔴 ล้มเหลว (มีคนลง Fail ${fails} ใบ)`;
    
    const nextMsg = nextLeader ? ` | 👑 ผู้นำคนถัดไป: ${nextLeader}` : '';
    
    if (modStatus) {
        modStatus.innerText = resultMsg + nextMsg;
    }

    const playerBanner = document.getElementById('player-status-banner');
    if (playerBanner) {
        playerBanner.innerText = resultMsg + nextMsg;
    }
});

socket.on('gameOver', ({ winner, reason, questHistory, rejectedVoteCount }) => {
    if (questHistory) {
        currentQuestResults = questHistory;
        renderQuestTracker(currentQuestResults, currentQuest, questRequirements);
    }
    if (rejectedVoteCount !== undefined) updateVoteTrack(rejectedVoteCount);
    
    const modStatus = document.getElementById('mod-status');
    const isGood = (winner === 'GOOD');
    const winnerText = isGood ? '🔵 ฝ่ายคนดี (Good) ชนะ!' : '🔴 ฝ่ายร้าย (Evil) ชนะ!';
    if (modStatus) {
        modStatus.innerText = `🏆 จบเกม! ${winnerText}`;
    }

    const playerBanner = document.getElementById('player-status-banner');
    if (playerBanner) {
        playerBanner.innerText = `🏆 จบเกม! ${winnerText}`;
    }

    // Delay 1.2s so Modulator and Players can clearly see the 3rd Success Card light up on the board first!
    setTimeout(() => {
        showGameOverModal(winner, reason, currentQuestResults);
    }, 1200);
});

function showGameOverModal(winner, reason, questHistory) {
    const modal = document.getElementById('game-over-modal');
    if (!modal) return;

    const isGood = (winner === 'GOOD');
    const history = questHistory || currentQuestResults || [];
    const successCount = history.filter(v => v === true).length;
    const failCount = history.filter(v => v === false).length;

    const iconEl = document.getElementById('game-over-icon');
    const titleEl = document.getElementById('game-over-title');
    const subtitleEl = document.getElementById('game-over-subtitle');
    const successCountEl = document.getElementById('game-over-success-count');
    const failCountEl = document.getElementById('game-over-fail-count');
    const questListEl = document.getElementById('game-over-quest-list');

    if (iconEl) iconEl.innerText = isGood ? '🏆' : '💀';
    
    if (titleEl) {
        titleEl.innerHTML = isGood 
            ? '<span class="text-blue-400 drop-shadow-[0_0_12px_rgba(59,130,246,0.6)]">🔵 ฝ่ายคนดี (Good) ชนะ!</span>' 
            : '<span class="text-rose-400 drop-shadow-[0_0_12px_rgba(244,63,94,0.6)]">🔴 ฝ่ายร้าย (Evil) ชนะ!</span>';
    }

    if (subtitleEl) {
        if (isGood) {
            subtitleEl.innerText = `ภารกิจสำเร็จ 3 ใน 5 ครั้ง (Success 3/5)`;
        } else if (reason === 'VOTES_REJECTED_5') {
            subtitleEl.innerText = `ฝ่ายคนดีไม่สามารถเลือกทีมได้ (โหวตคัดค้านครบ 5 ครั้ง)`;
        } else {
            subtitleEl.innerText = `ภารกิจล้มเหลว 3 ครั้ง (Fail ${failCount}/5)`;
        }
    }

    if (successCountEl) successCountEl.innerText = successCount;
    if (failCountEl) failCountEl.innerText = failCount;

    if (questListEl) {
        questListEl.innerHTML = '';
        for (let i = 0; i < 5; i++) {
            const res = history[i];
            const chip = document.createElement('div');
            let chipClass = 'bg-slate-800 border-slate-700 text-slate-500';
            let label = `Q${i+1}`;
            let mark = '-';

            if (res === true) {
                chipClass = 'bg-blue-600 border-blue-400 text-white font-black shadow-md shadow-blue-500/30';
                mark = '✓';
            } else if (res === false) {
                chipClass = 'bg-rose-600 border-rose-400 text-white font-black shadow-md shadow-rose-500/30';
                mark = '✗';
            }

            chip.className = `w-11 h-14 rounded-xl border flex flex-col items-center justify-between p-1.5 text-xs ${chipClass}`;
            chip.innerHTML = `
                <span class="text-[9px] font-mono opacity-80">${label}</span>
                <span class="text-base font-black">${mark}</span>
            `;
            questListEl.appendChild(chip);
        }
    }

    modal.classList.remove('hidden');
}

function confirmGameOverAndReturnHome() {
    const modal = document.getElementById('game-over-modal');
    if (modal) modal.classList.add('hidden');
    
    const room = myRoom || activeRoomCode;
    if (room) {
        socket.emit('resetRoom', room);
    }
    
    // Clear URL parameters and return to the first screen when creating the game
    window.location.href = window.location.origin + window.location.pathname;
}
window.confirmGameOverAndReturnHome = confirmGameOverAndReturnHome;

socket.on('roomReset', () => {
    window.location.href = window.location.origin + window.location.pathname;
});

function renderQuestTracker(history, currentQuestNum, questList) {
    const tracker = document.getElementById('quest-tracker');
    if (!tracker) return;
    tracker.innerHTML = '';
    
    const totalP = (allPlayers && allPlayers.length > 0) ? allPlayers.length : (expectedPlayers || 5);
    const reqs = questList || QUEST_REQUIREMENTS[totalP] || QUEST_REQUIREMENTS[5];
    const activeQ = currentQuestNum || currentQuest || 1;

    for (let i = 0; i < 5; i++) {
        const card = document.createElement('div');
        const status = history ? history[i] : undefined;
        const qNum = i + 1;
        const reqCount = reqs[i];
        const isCurrent = (qNum === activeQ && status === undefined);
        const isTwoFail = (totalP >= 7 && qNum === 4);

        let borderClass = 'border-slate-800 bg-slate-900/90 text-slate-400';
        let badge = `<span class="text-[10px] text-slate-400 font-mono font-bold">${reqCount} คน</span>`;
        let icon = `<span class="text-[11px] font-bold text-slate-400">Quest ${qNum}</span>`;

        if (status === true) {
            // สีน้ำเงิน = All Success (ตามที่ระบุ)
            borderClass = 'border-blue-400 bg-blue-600 text-white font-black shadow-lg shadow-blue-500/40';
            icon = '<span class="text-base">✓</span>';
            badge = '<span class="text-[9px] uppercase font-bold tracking-tight">All Success</span>';
        } else if (status === false) {
            // สีแดง = มีคนลง Fail ตามเงื่อนไข (ตามที่ระบุ)
            borderClass = 'border-rose-400 bg-rose-600 text-white font-black shadow-lg shadow-rose-500/40';
            icon = '<span class="text-base">✗</span>';
            badge = '<span class="text-[9px] uppercase font-bold tracking-tight">Fail</span>';
        } else if (isCurrent) {
            borderClass = 'border-amber-400 bg-amber-950/70 text-amber-300 font-bold shadow-[0_0_15px_rgba(245,158,11,0.6)] animate-pulse';
            badge = `<span class="text-[10px] text-amber-300 font-black bg-amber-950/90 px-1.5 py-0.5 rounded border border-amber-800">${reqCount} คน</span>`;
            icon = `<span class="text-[11px] font-black text-amber-400">Quest ${qNum}*</span>`;
        }

        card.className = `w-14 h-20 sm:w-16 sm:h-22 border-2 rounded-2xl flex flex-col items-center justify-between p-2 transition-all duration-300 backdrop-blur-sm ${borderClass}`;
        card.innerHTML = `
            ${icon}
            ${badge}
            ${isTwoFail && status === undefined ? '<span class="text-[8px] text-rose-400 font-mono font-bold">*2 fails</span>' : '<span class="h-1"></span>'}
        `;
        tracker.appendChild(card);
    }
}

function updateVoteTrack(failedCount) {
    const marks = document.querySelectorAll('.vote-mark');
    marks.forEach((mark, index) => {
        if (index < failedCount) {
            mark.classList.add('active');
        } else {
            mark.classList.remove('active');
        }
    });
}

// --- Direct Room Join via URL Parsing (?room=AV-XXXX) ---
window.onload = function() {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
        activeRoomCode = roomParam.trim().toUpperCase();
        const viewCode = document.getElementById('player-view-room-code');
        if (viewCode) viewCode.innerText = activeRoomCode;
        
        const inputCode = document.getElementById('input-room-code');
        if (inputCode) inputCode.value = activeRoomCode;
        
        showScreen('screen-player-join');
    } else {
        showScreen('screen-home');
    }
};
