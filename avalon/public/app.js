// =========================================================================
// ULTRA-FAST WEBRTC REAL-TIME ENGINE (PEERJS + BROADCASTCHANNEL + SOCKET.IO)
// Direct peer-to-peer data channels over standard HTTPS/WSS (Port 443)
// Works reliably on 100% of mobile networks, 4G/5G, iOS Safari, Android, and Wi-Fi!
// (Identical architectural pattern to Werewolf Modulator)
// =========================================================================

// Persistent unique device identifier per tab/session for reliable multi-tab and multi-device tracking
let myDeviceId = sessionStorage.getItem('av_device_id');
if (!myDeviceId) {
    myDeviceId = 'dev_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
    try {
        sessionStorage.setItem('av_device_id', myDeviceId);
    } catch(e) {}
}

const PEER_SERVER_CONFIG = {
    debug: 1,
    config: {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun.cloudflare.com:3478' },
            { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
            { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
            { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
        ]
    }
};

let peerInstance = null;
let localChannel = null;
let connectedPeers = {}; // { peerId: conn } (Mod mode)
let playerModConn = null; // conn to Mod (Player mode)
let currentModPeerId = null;
let isMod = false;
let syncHeartbeatInterval = null;
let serverLanIp = '';

// Avalon Quest Matrix: Required team size per Quest for 5-10 players
const QUEST_REQUIREMENTS = {
    5:  [2, 3, 2, 3, 3],
    6:  [2, 3, 4, 3, 4],
    7:  [2, 3, 3, 4, 4],
    8:  [3, 4, 4, 5, 5],
    9:  [3, 4, 4, 5, 5],
    10: [3, 4, 4, 5, 5]
};

function getRequiredTeamSize(playerCount, questNumber) {
    const list = QUEST_REQUIREMENTS[playerCount] || QUEST_REQUIREMENTS[5];
    return list[Math.min(Math.max((questNumber || 1) - 1, 0), 4)];
}

function shuffle(array) {
    let currentIndex = array.length, randomIndex;
    while (currentIndex !== 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
    }
    return array;
}

function getModPeerId(roomCode) {
    const clean = (roomCode || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return 'avmod_' + clean;
}

function updateConnectionBadge(isConnected, message) {
    const modBadge = document.getElementById('mod-conn-status');
    const playerBadge = document.getElementById('player-join-conn-status');

    if (modBadge) {
        if (isConnected) {
            modBadge.className = 'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800 mt-1';
            modBadge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span><span>🟢 ${message || 'สัญญาณออนไลน์ (4G/5G & Wi-Fi พร้อมรับผู้เล่น)'}</span>`;
        } else {
            modBadge.className = 'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-950 text-amber-300 border border-amber-800 mt-1';
            modBadge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span><span>🟡 ${message || 'กำลังเชื่อมต่อเครือข่าย...'}</span>`;
        }
    }

    if (playerBadge) {
        if (isConnected) {
            playerBadge.className = 'px-2.5 py-1 rounded-full text-[11px] bg-emerald-950 text-emerald-400 border border-emerald-800 flex items-center gap-1.5 inline-flex';
            playerBadge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span><span>🟢 ${message || 'เชื่อมต่อห้องสำเร็จ (4G/5G & Wi-Fi) พร้อมเข้าร่วม'}</span>`;
        } else {
            playerBadge.className = 'px-2.5 py-1 rounded-full text-[11px] bg-amber-950 text-amber-300 border border-amber-800 flex items-center gap-1.5 inline-flex';
            playerBadge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span><span>🟡 ${message || 'กำลังเชื่อมต่อห้อง (4G/5G & Wi-Fi)...'}</span>`;
        }
    }
}

// Universal Realtime Bus
class UniversalRealtimeBus {
    constructor() {
        this.id = myDeviceId;
        this.connected = true;
        this._listeners = {};
        this._realIo = null;
    }

    on(event, callback) {
        if (!this._listeners[event]) this._listeners[event] = [];
        this._listeners[event].push(callback);
    }

    off(event, callback) {
        if (!this._listeners[event]) return;
        if (!callback) {
            delete this._listeners[event];
        } else {
            this._listeners[event] = this._listeners[event].filter(cb => cb !== callback);
        }
    }

    trigger(event, data) {
        const cbs = this._listeners[event];
        if (cbs && cbs.length > 0) {
            cbs.forEach(cb => {
                try { cb(data); } catch(e) { console.error(`Error in listener for ${event}:`, e); }
            });
        }
    }

    emit(event, data) {
        console.log(`[UniversalBus] Emit: ${event}`, data);

        // 1. If local Socket.IO connected to node server, mirror emit
        if (this._realIo && this._realIo.connected) {
            try { this._realIo.emit(event, data); } catch(e){}
        }

        // 2. PeerJS / WebRTC & Local Channel Engine
        if (isMod) {
            handleModHostAction(event, data, myDeviceId);
        } else {
            broadcastMessageToMod({
                type: event,
                data: data,
                senderId: myDeviceId,
                playerName: myName || sessionStorage.getItem('av_player_name') || '',
                room: activeRoomCode
            });
        }
    }
}

const socket = new UniversalRealtimeBus();

// Optional Socket.IO bridge (for local node server support)
if (typeof io !== 'undefined') {
    try {
        const socketOptions = {
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
            timeout: 5000
        };
        const realIo = (window.location.protocol === 'file:' || (window.location.port !== '3000' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')))
            ? io('http://localhost:3000', socketOptions)
            : io(socketOptions);
        
        socket._realIo = realIo;
        realIo.on('connect', () => {
            console.log('Socket.IO local backend connected:', realIo.id);
            updateConnectionBadge(true);
        });
    } catch(e) {}
}

// Fetch network IP info from server if possible
if (window.location.protocol.startsWith('http')) {
    fetch('/api/server-info')
        .then(res => res.json())
        .then(data => {
            if (data && data.ip) {
                serverLanIp = data.ip;
                console.log('Server LAN IP detected:', serverLanIp);
            }
        })
        .catch(() => {});
}

// --- Mod Host Game Engine (Autonomous In-Browser Server for WebRTC / 4G / 5G) ---
let hostRoom = null;
let voteRevealTimer = null;

function broadcastToAllPlayers(type, data) {
    const packet = { type, data, room: activeRoomCode, timestamp: Date.now() };
    if (localChannel) {
        try { localChannel.postMessage(packet); } catch(e){}
    }
    Object.values(connectedPeers).forEach(conn => {
        if (conn && conn.open) {
            try { conn.send(packet); } catch(e){}
        }
    });
}

function sendToPeer(targetId, type, data, targetName) {
    if (targetId === myDeviceId) {
        socket.trigger(type, data);
        return;
    }
    const currentRoom = (activeRoomCode || myRoom || sessionStorage.getItem('av_room_code') || '').trim().toUpperCase();
    const packet = { type, data, targetId, targetName, room: currentRoom, timestamp: Date.now() };
    if (localChannel) {
        try { localChannel.postMessage(packet); } catch(e){}
    }
    Object.values(connectedPeers).forEach(conn => {
        if (conn && conn.open) {
            try { conn.send(packet); } catch(e){}
        }
    });
}

function broadcastMessageToMod(msg) {
    if (!msg.room) msg.room = (activeRoomCode || myRoom || sessionStorage.getItem('av_room_code') || '').trim().toUpperCase();
    if (localChannel) {
        try { localChannel.postMessage(msg); } catch(e){}
    }
    if (playerModConn && playerModConn.open) {
        try { playerModConn.send(msg); } catch(e){}
    }
}

function sendRoomStateToConn(conn, peerId) {
    if (!hostRoom) return;
    const currentRoom = (activeRoomCode || myRoom || sessionStorage.getItem('av_room_code') || '').trim().toUpperCase();
    
    // 1. Send playerJoined
    try {
        conn.send({
            type: 'playerJoined',
            data: hostRoom.players.map(p => ({ id: p.id, name: p.name })),
            room: currentRoom
        });
    } catch(e){}

    // 2. If role assigned, send secret role
    const playerObj = hostRoom.players.find(p => p.id === peerId || p.peerId === peerId);
    if (playerObj && playerObj.role) {
        try {
            conn.send({
                type: 'roleAssigned',
                data: playerObj.role,
                targetId: playerObj.id,
                targetName: playerObj.name,
                room: currentRoom
            });
        } catch(e){}
    }

    // 3. If game in progress, send current gameStateChanged
    if (hostRoom.state && hostRoom.state !== 'LOBBY') {
        const playerCount = hostRoom.players.length;
        const reqSize = getRequiredTeamSize(playerCount, hostRoom.currentQuest);
        const questList = QUEST_REQUIREMENTS[playerCount] || QUEST_REQUIREMENTS[5];
        try {
            conn.send({
                type: 'gameStateChanged',
                data: {
                    state: hostRoom.state,
                    leader: hostRoom.players[hostRoom.leaderIndex]?.name || '',
                    leaderId: hostRoom.players[hostRoom.leaderIndex]?.id || null,
                    players: hostRoom.players.map(p => ({ id: p.id, name: p.name })),
                    rejectedVoteCount: hostRoom.rejectedVoteCount,
                    currentQuest: hostRoom.currentQuest,
                    requiredTeamSize: reqSize,
                    questRequirements: questList,
                    questResults: hostRoom.questResults,
                    proposedTeam: hostRoom.players.filter(p => hostRoom.currentTeam.includes(p.id)).map(p => p.name),
                    proposedTeamIds: hostRoom.currentTeam,
                    currentTeam: hostRoom.currentTeam
                },
                room: activeRoomCode
            });
        } catch(e){}
    }
}

function isGoodRole(role) {
    if (!role) return true;
    const evilList = ['Mordred', 'Morgana', 'Assassin', 'Oberon', 'Minion', 'Other Evil'];
    return !evilList.some(evil => role.includes(evil));
}
window.isGoodRole = isGoodRole;

function handleModHostAction(event, data, senderId) {
    console.log(`[ModHost] Processing ${event} from ${senderId}:`, data);

    if (event === 'createRoom') {
        hostRoom = {
            roomCode: activeRoomCode,
            config: data || { expectedPlayers: expectedPlayers || 5, roles: ['Merlin', 'Assassin', 'Loyal Servant of Arthur', 'Loyal Servant of Arthur', 'Minion of Mordred'] },
            players: [],
            state: 'LOBBY',
            questResults: [],
            currentQuest: 1,
            leaderIndex: 0,
            currentTeam: [],
            votes: {},
            questVotes: {},
            rejectedVoteCount: 0,
            assignments: {}
        };
        socket.trigger('roomCreated', { roomCode: activeRoomCode, lanIp: serverLanIp, port: 3000 });
        return;
    }

    if (!hostRoom) {
        hostRoom = {
            roomCode: activeRoomCode,
            config: { expectedPlayers: expectedPlayers || 5, roles: [] },
            players: [],
            state: 'LOBBY',
            questResults: [],
            currentQuest: 1,
            leaderIndex: 0,
            currentTeam: [],
            votes: {},
            questVotes: {},
            rejectedVoteCount: 0,
            assignments: {}
        };
    }

    if (event === 'joinRoom' || event === 'PLAYER_JOIN') {
        const pName = (data.playerName || data.name || '').trim();
        const pId = data.playerId || senderId || ('p_' + Math.random().toString(36).substr(2, 6));
        if (pName) {
            let existing = hostRoom.players.find(p => p.id === pId || p.name.toLowerCase() === pName.toLowerCase());
            if (existing) {
                existing.id = pId;
                existing.name = pName;
                if (data.peerId) existing.peerId = data.peerId;
            } else {
                hostRoom.players.push({ id: pId, name: pName, role: null, peerId: data.peerId });
            }
            sendToPeer(pId, 'joined', { roomCode: hostRoom.roomCode, playerName: pName }, pName);
            socket.trigger('playerJoined', hostRoom.players);
            broadcastToAllPlayers('playerJoined', hostRoom.players);
        }
        return;
    }

    if (event === 'simulateBot') {
        if (hostRoom.state === 'LOBBY') {
            const expected = (hostRoom.config && hostRoom.config.expectedPlayers) || expectedPlayers || 5;
            if (hostRoom.players.length < expected) {
                const botNum = hostRoom.players.length + 1;
                const botNames = ['อาเธอร์', 'แลนสล็อต', 'เกเวน', 'เพอร์ซิวัล', 'ไตรสตัน', 'กาลาฮัด', 'บอร์ส', 'เคย์', 'เบดิเวียร์', 'โมเดร็ด'];
                const randomName = botNames[(botNum - 1) % botNames.length] + ' #' + botNum;
                const botId = 'bot_' + Math.random().toString(36).substr(2, 6);
                hostRoom.players.push({ id: botId, name: randomName, role: null });
                socket.trigger('playerJoined', hostRoom.players);
                broadcastToAllPlayers('playerJoined', hostRoom.players);
            }
        }
        return;
    }

    if (event === 'startGame') {
        const playerCount = hostRoom.players.length;
        if (playerCount === 0) return;

        hostRoom.state = 'ROLE_ASSIGNMENT';
        hostRoom.currentQuest = 1;
        hostRoom.questResults = [];
        hostRoom.rejectedVoteCount = 0;
        hostRoom.leaderIndex = 0;

        const questList = QUEST_REQUIREMENTS[playerCount] || QUEST_REQUIREMENTS[5];
        const requiredSize = questList[0];

        let rolesPool = shuffle([...(hostRoom.config.roles || [])].slice(0, playerCount));
        while (rolesPool.length < playerCount) {
            rolesPool.push('Loyal Servant of Arthur');
        }

        hostRoom.players.forEach((player, index) => {
            player.role = rolesPool[index];
            hostRoom.assignments[player.id] = rolesPool[index];
            sendToPeer(player.id, 'roleAssigned', player.role, player.name);
        });

        hostRoom.state = 'TEAM_BUILDING';

        const stateData = {
            state: hostRoom.state,
            leader: hostRoom.players[0]?.name || 'None',
            leaderId: hostRoom.players[0]?.id || null,
            players: hostRoom.players.map(p => ({ id: p.id, name: p.name })),
            rejectedVoteCount: 0,
            currentQuest: 1,
            requiredTeamSize: requiredSize,
            questRequirements: questList,
            questResults: []
        };

        socket.trigger('gameStateChanged', stateData);
        broadcastToAllPlayers('gameStateChanged', stateData);

        handleBotLeaderTurn(hostRoom);
        return;
    }

    if (event === 'proposeTeam') {
        const team = data.team;
        const currentLeader = hostRoom.players[hostRoom.leaderIndex];
        const isLeader = currentLeader && (
            currentLeader.id === senderId ||
            (data.playerId && currentLeader.id === data.playerId) ||
            (data.playerName && currentLeader.name === data.playerName)
        );
        if (hostRoom.state === 'TEAM_BUILDING' && isLeader) {
            const playerCount = hostRoom.players.length;
            const questList = QUEST_REQUIREMENTS[playerCount] || QUEST_REQUIREMENTS[5];
            const reqSize = getRequiredTeamSize(playerCount, hostRoom.currentQuest);

            hostRoom.currentTeam = team;
            hostRoom.state = 'TEAM_VOTING';
            hostRoom.votes = {};

            const proposedNames = hostRoom.players.filter(p => team.includes(p.id)).map(p => p.name);

            const stateData = {
                state: hostRoom.state,
                proposedTeam: proposedNames,
                proposedTeamIds: team,
                leader: hostRoom.players[hostRoom.leaderIndex].name,
                leaderId: hostRoom.players[hostRoom.leaderIndex].id,
                currentQuest: hostRoom.currentQuest,
                requiredTeamSize: reqSize,
                questRequirements: questList,
                rejectedVoteCount: hostRoom.rejectedVoteCount,
                players: hostRoom.players.map(p => ({ id: p.id, name: p.name }))
            };

            socket.trigger('gameStateChanged', stateData);
            broadcastToAllPlayers('gameStateChanged', stateData);

            hostRoom.players.forEach(p => {
                if (p.id.startsWith('bot_')) {
                    hostRoom.votes[p.id] = 'approve';
                }
            });

            checkAndResolveTeamVote(hostRoom);
        }
        return;
    }

    if (event === 'voteTeam' || event === 'voteTeamSubmit') {
        if (hostRoom.state === 'TEAM_VOTING') {
            const voter = hostRoom.players.find(p => 
                p.id === senderId || 
                (data.playerId && p.id === data.playerId) || 
                (data.playerName && p.name === data.playerName)
            );
            const voterKey = voter ? voter.id : senderId;
            hostRoom.votes[voterKey] = data.vote;
            console.log(`[HostEngine] Team vote received: ${voter ? voter.name : voterKey} = ${data.vote} (${Object.keys(hostRoom.votes).length}/${hostRoom.players.length})`);
            checkAndResolveTeamVote(hostRoom);
        }
        return;
    }

    if (event === 'skipVoteReveal') {
        if (hostRoom.state === 'TEAM_VOTE_REVEAL') {
            const approves = Object.values(hostRoom.votes).filter(v => v === 'approve').length;
            const isApproved = approves > (hostRoom.players.length / 2);
            proceedAfterVoteReveal(hostRoom, isApproved);
        }
        return;
    }

    if (event === 'voteQuest' || event === 'questVoteSubmit') {
        if (hostRoom.state === 'QUEST_EXECUTION' && hostRoom.currentTeam.includes(senderId)) {
            hostRoom.questVotes[senderId] = data.vote;
            checkAndResolveQuest(hostRoom);
        }
        return;
    }

    if (event === 'assassinateTarget') {
        if (hostRoom && hostRoom.state === 'ASSASSINATION') {
            const assassin = hostRoom.players.find(p => p.role && p.role.includes('Assassin'));
            if (assassin && assassin.id === senderId) {
                resolveAssassination(hostRoom, data.targetId);
            }
        }
        return;
    }

    if (event === 'resetRoom') {
        socket.trigger('roomReset');
        broadcastToAllPlayers('roomReset', {});
        hostRoom = null;
        return;
    }
}

function checkAndResolveTeamVote(room) {
    if (!room || room.state !== 'TEAM_VOTING') return;
    if (Object.keys(room.votes).length >= room.players.length) {
        const approves = Object.values(room.votes).filter(v => v === 'approve').length;
        const isApproved = approves > (room.players.length / 2);

        const voteDetails = room.players.map(p => ({
            id: p.id,
            name: p.name,
            vote: room.votes[p.id] || 'approve'
        }));

        const proposedNames = room.players.filter(p => room.currentTeam.includes(p.id)).map(p => p.name);

        let potentialNextLeaderIndex = room.leaderIndex;
        let potentialRejectedCount = room.rejectedVoteCount;
        if (!isApproved) {
            potentialRejectedCount++;
            potentialNextLeaderIndex = (room.leaderIndex + 1) % room.players.length;
        }
        const nextLeaderName = room.players[potentialNextLeaderIndex]?.name || null;

        room.state = 'TEAM_VOTE_REVEAL';

        const revealPayload = {
            approved: isApproved,
            approvesCount: approves,
            rejectsCount: room.players.length - approves,
            voteDetails,
            proposedTeam: proposedNames,
            nextLeader: nextLeaderName,
            rejectedVoteCount: potentialRejectedCount,
            currentQuest: room.currentQuest,
            revealDuration: 4
        };

        socket.trigger('teamVoteResult', revealPayload);
        broadcastToAllPlayers('teamVoteResult', revealPayload);

        if (voteRevealTimer) clearTimeout(voteRevealTimer);
        voteRevealTimer = setTimeout(() => {
            proceedAfterVoteReveal(room, isApproved);
        }, 4500);
    }
}

function proceedAfterVoteReveal(room, isApproved) {
    if (!room || room.state !== 'TEAM_VOTE_REVEAL') return;
    if (voteRevealTimer) {
        clearTimeout(voteRevealTimer);
        voteRevealTimer = null;
    }

    const playerCount = room.players.length;
    const questList = QUEST_REQUIREMENTS[playerCount] || QUEST_REQUIREMENTS[5];

    if (isApproved) {
        room.state = 'QUEST_EXECUTION';
        room.questVotes = {};
        room.rejectedVoteCount = 0;

        const requiredSize = getRequiredTeamSize(playerCount, room.currentQuest);

        const stateData = {
            state: room.state,
            leader: room.players[room.leaderIndex].name,
            leaderId: room.players[room.leaderIndex].id,
            currentTeam: room.currentTeam,
            proposedTeam: room.players.filter(p => room.currentTeam.includes(p.id)).map(p => p.name),
            proposedTeamIds: room.currentTeam,
            currentQuest: room.currentQuest,
            requiredTeamSize: requiredSize,
            questRequirements: questList,
            rejectedVoteCount: room.rejectedVoteCount,
            questResults: room.questResults
        };

        socket.trigger('gameStateChanged', stateData);
        broadcastToAllPlayers('gameStateChanged', stateData);

        const startQuestData = {
            team: room.currentTeam,
            currentQuest: room.currentQuest
        };

        socket.trigger('startQuest', startQuestData);
        broadcastToAllPlayers('startQuest', startQuestData);

        // Auto-vote for bot players on quest team
        setTimeout(() => {
            if (room.state !== 'QUEST_EXECUTION') return;
            room.currentTeam.forEach(memberId => {
                if (memberId.startsWith('bot_') && !room.questVotes[memberId]) {
                    const botPlayer = room.players.find(p => p.id === memberId);
                    const isEvil = botPlayer && ['Mordred', 'Morgana', 'Assassin', 'Oberon', 'Other Evil 1', 'Other Evil 2', 'Minion'].some(r => (botPlayer.role || '').includes(r));
                    room.questVotes[memberId] = (isEvil && Math.random() < 0.5) ? 'fail' : 'success';
                }
            });
            checkAndResolveQuest(room);
        }, 2000);

    } else {
        room.rejectedVoteCount++;
        if (room.rejectedVoteCount >= 5) {
            room.state = 'GAME_OVER';
            const gameOverData = {
                winner: 'EVIL',
                reason: 'VOTES_REJECTED_5',
                questHistory: room.questResults,
                rejectedVoteCount: room.rejectedVoteCount
            };
            socket.trigger('gameOver', gameOverData);
            broadcastToAllPlayers('gameOver', gameOverData);
        } else {
            room.leaderIndex = (room.leaderIndex + 1) % room.players.length;
            room.state = 'TEAM_BUILDING';
        }

        const nextLeader = (room.state === 'GAME_OVER' || room.players.length === 0) ? null : room.players[room.leaderIndex].name;
        const nextLeaderId = (room.state === 'GAME_OVER' || room.players.length === 0) ? null : room.players[room.leaderIndex].id;
        const requiredSize = getRequiredTeamSize(playerCount, room.currentQuest);

        const stateData = {
            state: room.state,
            leader: nextLeader,
            leaderId: nextLeaderId,
            currentTeam: [],
            currentQuest: room.currentQuest,
            requiredTeamSize: requiredSize,
            questRequirements: questList,
            rejectedVoteCount: room.rejectedVoteCount,
            questResults: room.questResults
        };

        socket.trigger('gameStateChanged', stateData);
        broadcastToAllPlayers('gameStateChanged', stateData);

        if (room.state === 'TEAM_BUILDING') {
            handleBotLeaderTurn(room);
        }
    }
}

function checkAndResolveQuest(room) {
    if (!room || room.state !== 'QUEST_EXECUTION') return;
    if (Object.keys(room.questVotes).length === room.currentTeam.length) {
        const fails = Object.values(room.questVotes).filter(v => v === 'fail').length;
        const isTwoFailRequired = (room.players.length >= 7 && room.currentQuest === 4);
        const isSuccess = isTwoFailRequired ? (fails < 2) : (fails === 0);
        
        room.questResults.push(isSuccess);
        
        const finishedQuest = room.currentQuest;
        room.currentQuest++;
        room.leaderIndex = (room.leaderIndex + 1) % room.players.length;

        const goodWins = room.questResults.filter(v => v === true).length >= 3;
        const evilWins = room.questResults.filter(v => v === false).length >= 3;

        const assassinPlayer = room.players.find(p => p.role && p.role.includes('Assassin'));

        if (goodWins && assassinPlayer) {
            room.state = 'ASSASSINATION';
        } else if (goodWins || evilWins || room.currentQuest > 5) {
            room.state = 'GAME_OVER';
        } else {
            room.state = 'TEAM_BUILDING';
        }

        const nextLeader = (room.state === 'GAME_OVER' || room.state === 'ASSASSINATION' || room.players.length === 0) ? null : room.players[room.leaderIndex].name;
        const nextLeaderId = (room.state === 'GAME_OVER' || room.state === 'ASSASSINATION' || room.players.length === 0) ? null : room.players[room.leaderIndex].id;
        const playerCount = room.players.length;
        const questList = QUEST_REQUIREMENTS[playerCount] || QUEST_REQUIREMENTS[5];
        const requiredSize = getRequiredTeamSize(playerCount, room.currentQuest);

        const questResultData = {
            questNumber: finishedQuest,
            success: isSuccess,
            allSuccess: fails === 0,
            fails,
            history: room.questResults,
            rejectedVoteCount: room.rejectedVoteCount,
            nextLeader
        };

        socket.trigger('questResult', questResultData);
        broadcastToAllPlayers('questResult', questResultData);

        const goodPlayers = room.players
            .filter(p => isGoodRole(p.role))
            .map(p => ({ id: p.id, name: p.name }));

        const stateData = {
            state: room.state,
            leader: nextLeader,
            leaderId: nextLeaderId,
            questResults: room.questResults,
            lastQuestSuccess: isSuccess,
            currentQuest: room.currentQuest,
            requiredTeamSize: requiredSize,
            questRequirements: questList,
            rejectedVoteCount: room.rejectedVoteCount,
            assassinName: assassinPlayer ? assassinPlayer.name : null,
            assassinId: assassinPlayer ? assassinPlayer.id : null,
            goodPlayers: (room.state === 'ASSASSINATION') ? goodPlayers : []
        };

        socket.trigger('gameStateChanged', stateData);
        broadcastToAllPlayers('gameStateChanged', stateData);

        if (room.state === 'ASSASSINATION') {
            const assassinPayload = {
                goodPlayers,
                assassinName: assassinPlayer.name
            };
            if (assassinPlayer.id === socket.id) {
                socket.trigger('assassinationPhase', assassinPayload);
            } else {
                sendToPeer(assassinPlayer.id, 'assassinationPhase', assassinPayload);
            }

            if (assassinPlayer.id.startsWith('bot_')) {
                setTimeout(() => {
                    if (room.state !== 'ASSASSINATION') return;
                    const randomTarget = goodPlayers[Math.floor(Math.random() * goodPlayers.length)];
                    if (randomTarget) {
                        resolveAssassination(room, randomTarget.id);
                    }
                }, 2500);
            }
        } else if (room.state === 'GAME_OVER') {
            const winner = goodWins ? 'GOOD' : 'EVIL';
            const reason = goodWins 
                ? 'QUESTS_SUCCESS_3' 
                : (evilWins ? 'QUESTS_FAIL_3' : (room.rejectedVoteCount >= 5 ? 'VOTES_REJECTED_5' : 'GAME_OVER'));
            const gameOverData = {
                winner,
                reason,
                questHistory: room.questResults,
                rejectedVoteCount: room.rejectedVoteCount
            };
            socket.trigger('gameOver', gameOverData);
            broadcastToAllPlayers('gameOver', gameOverData);
        } else if (room.state === 'TEAM_BUILDING') {
            handleBotLeaderTurn(room);
        }
    }
}

function resolveAssassination(room, targetId) {
    if (!room || room.state !== 'ASSASSINATION') return;

    const target = room.players.find(p => p.id === targetId);
    const merlin = room.players.find(p => p.role && p.role.includes('Merlin'));
    const assassin = room.players.find(p => p.role && p.role.includes('Assassin'));

    const isMerlinHit = !!(target && target.role && target.role.includes('Merlin'));
    room.state = 'GAME_OVER';

    const winner = isMerlinHit ? 'EVIL' : 'GOOD';
    const reason = isMerlinHit ? 'MERLIN_ASSASSINATED' : 'MERLIN_SURVIVED';

    const gameOverPayload = {
        winner,
        reason,
        isMerlinHit,
        targetName: target ? target.name : 'Unknown',
        targetRole: target ? target.role : 'Unknown',
        merlinName: merlin ? merlin.name : 'Unknown',
        assassinName: assassin ? assassin.name : 'Assassin',
        questHistory: room.questResults,
        rejectedVoteCount: room.rejectedVoteCount
    };

    const stateData = {
        state: 'GAME_OVER',
        leader: null,
        questResults: room.questResults,
        rejectedVoteCount: room.rejectedVoteCount
    };

    socket.trigger('gameStateChanged', stateData);
    broadcastToAllPlayers('gameStateChanged', stateData);

    socket.trigger('gameOver', gameOverPayload);
    broadcastToAllPlayers('gameOver', gameOverPayload);
}

function handleBotLeaderTurn(room) {
    if (!room || room.state !== 'TEAM_BUILDING' || room.players.length === 0) return;
    const currentLeader = room.players[room.leaderIndex];
    if (currentLeader && currentLeader.id.startsWith('bot_')) {
        setTimeout(() => {
            if (!room || room.state !== 'TEAM_BUILDING') return;
            const playerCount = room.players.length;
            const reqSize = getRequiredTeamSize(playerCount, room.currentQuest);
            
            let team = [currentLeader.id];
            const others = room.players.filter(p => p.id !== currentLeader.id);
            const shuffled = shuffle([...others]);
            for (let i = 0; i < reqSize - 1 && i < shuffled.length; i++) {
                team.push(shuffled[i].id);
            }

            room.currentTeam = team;
            room.state = 'TEAM_VOTING';
            room.votes = {};

            const proposedNames = room.players.filter(p => team.includes(p.id)).map(p => p.name);
            const questList = QUEST_REQUIREMENTS[playerCount] || QUEST_REQUIREMENTS[5];

            const stateData = {
                state: room.state,
                proposedTeam: proposedNames,
                proposedTeamIds: team,
                leader: currentLeader.name,
                leaderId: currentLeader.id,
                currentQuest: room.currentQuest,
                requiredTeamSize: reqSize,
                questRequirements: questList,
                rejectedVoteCount: room.rejectedVoteCount,
                players: room.players.map(p => ({ id: p.id, name: p.name }))
            };

            socket.trigger('gameStateChanged', stateData);
            broadcastToAllPlayers('gameStateChanged', stateData);

            room.players.forEach(p => {
                if (p.id.startsWith('bot_')) {
                    room.votes[p.id] = 'approve';
                }
            });

            checkAndResolveTeamVote(room);
        }, 1800);
    }
}

function handleIncomingMessage(msg, conn) {
    if (!msg || !msg.room || msg.room !== activeRoomCode) return;

    if (isMod) {
        const actionType = msg.type;
        const actionData = msg.data !== undefined ? msg.data : msg;
        const senderId = msg.senderId || (conn ? conn.peer : null);

        if (actionType === 'PLAYER_JOIN' || actionType === 'joinRoom') {
            handleModHostAction('joinRoom', {
                playerName: msg.name || actionData.playerName || msg.playerName,
                playerId: senderId
            }, senderId);
        } else {
            handleModHostAction(actionType, actionData, senderId);
        }
    } else {
        const isTargetedToMe = !msg.targetId || 
            msg.targetId === myDeviceId || 
            (peerInstance && msg.targetId === peerInstance.id) ||
            (msg.targetName && myName && msg.targetName === myName);
        if (!isTargetedToMe) return;

        const eventType = msg.type;
        const payload = msg.data !== undefined ? msg.data : msg;

        if (eventType === 'roleAssigned') {
            try {
                sessionStorage.setItem('av_assigned_role', payload);
                sessionStorage.setItem('av_room_code', activeRoomCode || myRoom);
            } catch(e){}
        } else if (eventType === 'joined') {
            try {
                sessionStorage.setItem('av_player_name', payload.playerName || myName);
                sessionStorage.setItem('av_room_code', activeRoomCode || myRoom);
                sessionStorage.setItem('av_joined_room', 'true');
            } catch(e){}
        }

        socket.trigger(eventType, payload);
    }
}

function setupRealtimeListener(roomCode, asMod, targetModId) {
    isMod = asMod;
    activeRoomCode = roomCode;

    // 1. BroadcastChannel for local tabs on same device/browser (0ms latency)
    try {
        if (localChannel) localChannel.close();
        localChannel = new BroadcastChannel('avalon_chan_' + roomCode);
        localChannel.onmessage = (event) => handleIncomingMessage(event.data);
    } catch(e){}

    // Cleanup previous peer
    if (peerInstance) {
        try { peerInstance.destroy(); } catch(e){}
        peerInstance = null;
    }
    connectedPeers = {};
    playerModConn = null;

    if (typeof Peer === 'undefined') {
        console.warn('PeerJS library not loaded yet, retrying in 500ms...');
        setTimeout(() => {
            if (activeRoomCode === roomCode) setupRealtimeListener(roomCode, asMod, targetModId);
        }, 500);
        return;
    }

    if (asMod) {
        // MOD INITIALIZATION
        updateConnectionBadge(false, '🟡 กำลังเปิดห้อง & เชื่อมต่อสัญญาณ 4G/5G...');
        const baseModId = getModPeerId(roomCode);

        const attemptConnectModPeer = (targetId) => {
            if (peerInstance) {
                try { peerInstance.destroy(); } catch(e){}
                peerInstance = null;
            }
            try {
                peerInstance = new Peer(targetId, PEER_SERVER_CONFIG);
            } catch(e) {
                console.error('Failed to create Mod Peer:', e);
                return;
            }

            peerInstance.on('open', (id) => {
                console.log('Mod Peer opened successfully with ID:', id);
                currentModPeerId = id;
                updateConnectionBadge(true, '🟢 สัญญาณออนไลน์ (4G/5G & Wi-Fi พร้อมรับผู้เล่น)');
                
                const lobbyScreen = document.getElementById('screen-mod-lobby');
                if (lobbyScreen && !lobbyScreen.classList.contains('hidden')) {
                    const joinUrl = getJoinUrl(roomCode);
                    generateLobbyQRCode(joinUrl);
                    const urlDisplay = document.getElementById('qr-target-url-display');
                    if (urlDisplay) urlDisplay.innerText = joinUrl;
                }
            });

            peerInstance.on('connection', (conn) => {
                console.log('Player connection initiated:', conn.peer);
                connectedPeers[conn.peer] = conn;

                conn.on('open', () => {
                    console.log('Player DataChannel open:', conn.peer);
                    sendRoomStateToConn(conn, conn.peer);
                    setTimeout(() => sendRoomStateToConn(conn, conn.peer), 400);
                    setTimeout(() => sendRoomStateToConn(conn, conn.peer), 1200);
                });

                conn.on('data', (data) => {
                    console.log('Mod received data:', data);
                    handleIncomingMessage(data, conn);
                });

                conn.on('close', () => {
                    console.log('Player disconnected:', conn.peer);
                    delete connectedPeers[conn.peer];
                });

                conn.on('error', (err) => {
                    console.warn('Player connection error:', err);
                    delete connectedPeers[conn.peer];
                });
            });

            peerInstance.on('error', (err) => {
                console.error('Mod Peer error:', err);
                if (err.type === 'unavailable-id') {
                    const fallbackId = baseModId + '_' + Math.random().toString(36).substr(2, 4);
                    console.log('Mod ID in use, retrying with fallback ID:', fallbackId);
                    setTimeout(() => {
                        if (isMod && activeRoomCode === roomCode) {
                            attemptConnectModPeer(fallbackId);
                        }
                    }, 500);
                } else {
                    updateConnectionBadge(false, '🟡 กำลังเชื่อมต่อสัญญาณใหม่...');
                }
            });
        };

        attemptConnectModPeer(baseModId);

    } else {
        // PLAYER INITIALIZATION
        updateConnectionBadge(false, '🟡 กำลังเชื่อมต่อห้อง (4G/5G & Wi-Fi)...');

        const createPlayerPeer = () => {
            if (peerInstance) {
                try { peerInstance.destroy(); } catch(e){}
                peerInstance = null;
            }
            try {
                peerInstance = new Peer(null, PEER_SERVER_CONFIG);
            } catch(e) {
                console.error('Failed to create Player Peer:', e);
                return;
            }

            peerInstance.on('open', (id) => {
                console.log('Player Peer opened with ID:', id);
                connectPlayerToMod(roomCode, targetModId);
            });

            setTimeout(() => {
                if (!isMod && activeRoomCode === roomCode && (!playerModConn || !playerModConn.open)) {
                    connectPlayerToMod(roomCode, targetModId);
                }
            }, 500);

            peerInstance.on('error', (err) => {
                console.warn('Player Peer error:', err);
                updateConnectionBadge(false, '🟡 สัญญาณขัดข้อง กำลังลองใหม่...');
                setTimeout(() => {
                    if (!isMod && activeRoomCode === roomCode && (!playerModConn || !playerModConn.open)) {
                        connectPlayerToMod(roomCode, targetModId);
                    }
                }, 1500);
            });
        };

        createPlayerPeer();
    }

    startSyncHeartbeat();
}

function connectPlayerToMod(roomCode, targetId) {
    if (!peerInstance || peerInstance.destroyed) return;
    const params = new URLSearchParams(window.location.search);
    const midParam = params.get('mid');
    const targetModId = targetId || midParam || currentModPeerId || getModPeerId(roomCode);

    console.log('Player connecting to Mod ID:', targetModId);
    updateConnectionBadge(false, '🟡 กำลังจับคู่กับ Game Master...');

    try {
        if (playerModConn) {
            try { playerModConn.close(); } catch(e){}
        }
        playerModConn = peerInstance.connect(targetModId, { serialization: 'json' });

        playerModConn.on('open', () => {
            console.log('Player successfully connected to Mod!');
            updateConnectionBadge(true, '🟢 เชื่อมต่อห้องสำเร็จ (4G/5G & Wi-Fi)');

            const savedName = myName || sessionStorage.getItem('av_player_name');
            if (savedName) {
                sendPlayerJoinMessage(savedName);
            }
        });

        playerModConn.on('data', (data) => {
            console.log('Player received data from Mod:', data);
            handleIncomingMessage(data);
        });

        playerModConn.on('close', () => {
            console.warn('DataChannel to Mod closed, auto-reconnecting in 2s...');
            updateConnectionBadge(false, '🟡 สัญญาณหลุด กำลังเชื่อมต่อใหม่...');
            setTimeout(() => {
                if (!isMod && activeRoomCode === roomCode) {
                    connectPlayerToMod(roomCode, targetModId);
                }
            }, 2000);
        });

        playerModConn.on('error', (err) => {
            console.warn('DataChannel error:', err);
            updateConnectionBadge(false, '🟡 กำลังเชื่อมต่อใหม่...');
            setTimeout(() => {
                if (!isMod && activeRoomCode === roomCode) {
                    connectPlayerToMod(roomCode, targetModId);
                }
            }, 2000);
        });
    } catch(e) {
        console.error('Error connecting to Mod:', e);
    }
}

function sendPlayerJoinMessage(name) {
    const pName = name || myName || sessionStorage.getItem('av_player_name');
    if (!pName || !activeRoomCode) return;
    const msg = {
        type: 'joinRoom',
        room: activeRoomCode,
        playerId: myDeviceId,
        senderId: myDeviceId,
        playerName: pName,
        name: pName
    };
    broadcastMessageToMod(msg);
}

// iOS & Mobile screen wake-up triggers
const triggerPlayerReconnect = () => {
    if (!isMod && activeRoomCode) {
        const savedName = myName || sessionStorage.getItem('av_player_name');
        if (!playerModConn || !playerModConn.open) {
            connectPlayerToMod(activeRoomCode);
        } else if (savedName) {
            sendPlayerJoinMessage(savedName);
        }
    }
};
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') triggerPlayerReconnect();
});
window.addEventListener('focus', triggerPlayerReconnect);
window.addEventListener('pageshow', triggerPlayerReconnect);

function startSyncHeartbeat() {
    if (syncHeartbeatInterval) clearInterval(syncHeartbeatInterval);
    syncHeartbeatInterval = setInterval(() => {
        if (!activeRoomCode) return;
        if (!isMod) {
            const savedName = myName || sessionStorage.getItem('av_player_name');
            if (savedName && (!playerModConn || !playerModConn.open)) {
                connectPlayerToMod(activeRoomCode);
            }
        }
    }, 2500);
}

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
    const hubBtn = document.getElementById('header-hub-btn');

    if (screenId === 'screen-home') {
        if (statusEl) statusEl.innerText = 'ยินดีต้อนรับเข้าสู่ Game Avalon';
        if (backBtn) backBtn.classList.add('hidden');
        if (hubBtn) hubBtn.classList.remove('hidden');
    } else {
        if (hubBtn) hubBtn.classList.add('hidden');
        if (screenId === 'screen-role-select') {
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
    }

    // Manage Desktop Expanded View state when switching screens
    if (screenId === 'screen-mod-game') {
        if (localStorage.getItem('avalon_desktop_expanded') === 'true') {
            document.body.classList.add('desktop-board-expanded');
            updateDesktopButtonUI(true);
        } else {
            document.body.classList.remove('desktop-board-expanded');
            updateDesktopButtonUI(false);
        }
    } else {
        document.body.classList.remove('desktop-board-expanded');
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// --- Desktop Expanded Board Controls ---
function toggleDesktopBoardView() {
    const isExpanded = document.body.classList.toggle('desktop-board-expanded');
    localStorage.setItem('avalon_desktop_expanded', isExpanded ? 'true' : 'false');
    updateDesktopButtonUI(isExpanded);
}

function updateDesktopButtonUI(isExpanded) {
    const btn = document.getElementById('btn-toggle-desktop');
    const icon = document.getElementById('btn-desktop-icon');
    const text = document.getElementById('btn-desktop-text');
    if (!btn) return;

    if (isExpanded) {
        btn.classList.add('bg-amber-500', 'text-slate-950', 'font-bold');
        btn.classList.remove('bg-slate-800', 'text-amber-300');
        if (icon) icon.innerText = '📱';
        if (text) text.innerText = 'โหมดปกติ';
        btn.title = 'สลับกลับเป็นขนาดมือถือ (Mobile View)';
    } else {
        btn.classList.remove('bg-amber-500', 'text-slate-950', 'font-bold');
        btn.classList.add('bg-slate-800', 'text-amber-300');
        if (icon) icon.innerText = '🖥️';
        if (text) text.innerText = 'โหมด Desktop';
        btn.title = 'ขยายเต็มหน้าจอ Desktop / TV';
    }
}

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(err => {
                console.warn('Fullscreen request failed:', err);
            });
        }
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen().catch(err => {
                console.warn('Exit fullscreen failed:', err);
            });
        }
    }
}

document.addEventListener('fullscreenchange', () => {
    const icon = document.getElementById('btn-fullscreen-icon');
    if (icon) {
        icon.innerText = document.fullscreenElement ? '🗗' : '⛶';
    }
});

window.toggleDesktopBoardView = toggleDesktopBoardView;
window.toggleFullscreen = toggleFullscreen;
window.updateDesktopButtonUI = updateDesktopButtonUI;

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

function getEffectiveRoomCode() {
    let code = (myRoom || activeRoomCode || sessionStorage.getItem('av_room_code') || '').trim().toUpperCase();
    if (!code || code === 'AV-XXXX') {
        try {
            const params = new URLSearchParams(window.location.search);
            const pRoom = (params.get('room') || '').trim().toUpperCase();
            if (pRoom) code = pRoom;
        } catch(e){}
    }
    if (code && code !== 'AV-XXXX') {
        myRoom = code;
        activeRoomCode = code;
        try { sessionStorage.setItem('av_room_code', code); } catch(e){}
    }
    return code;
}
window.getEffectiveRoomCode = getEffectiveRoomCode;

// --- Role Selection State & Config ---
let expectedPlayers = 5;
const playerBalances = {
    5: { good: 3, evil: 2 },
    6: { good: 4, evil: 2 },
    7: { good: 4, evil: 3 },
    8: { good: 5, evil: 3 },
    9: { good: 6, evil: 3 },
    10: { good: 6, evil: 4 }
};

const rolesConfig = [
    { id: 'Merlin', name: 'Merlin', team: 'good', default: true },
    { id: 'Percival', name: 'Percival', team: 'good', default: false },
    { id: 'Loyal Servant of Arthur 1', name: 'Loyal Servant of Arthur', team: 'good', default: true },
    { id: 'Loyal Servant of Arthur 2', name: 'Loyal Servant of Arthur', team: 'good', default: true },
    { id: 'Loyal Servant of Arthur 3', name: 'Loyal Servant of Arthur', team: 'good', default: false },
    { id: 'Loyal Servant of Arthur 4', name: 'Loyal Servant of Arthur', team: 'good', default: false },
    { id: 'Mordred', name: 'Mordred', team: 'evil', default: false },
    { id: 'Morgana', name: 'Morgana', team: 'evil', default: false },
    { id: 'Assassin', name: 'Assassin', team: 'evil', default: true },
    { id: 'Oberon', name: 'Oberon', team: 'evil', default: false },
    { id: 'Minion of Mordred 1', name: 'Minion of Mordred', team: 'evil', default: true },
    { id: 'Minion of Mordred 2', name: 'Minion of Mordred', team: 'evil', default: false }
];

let selectedRoles = {};
rolesConfig.forEach(r => selectedRoles[r.id] = r.default);

function updateRoleUI() {
    let goodSelected = 0;
    let evilSelected = 0;
    rolesConfig.forEach(r => {
        if (selectedRoles[r.id]) {
            if (r.team === 'good') goodSelected++;
            else evilSelected++;
        }
    });
    
    // Automatically count total roles selected -> expectedPlayers
    const totalSelected = goodSelected + evilSelected;
    expectedPlayers = totalSelected;
    
    const countDisplay = document.getElementById('player-count-display');
    if (countDisplay) countDisplay.innerText = totalSelected;
    
    // Target balance based on total players (Avalon standard 5 - 10)
    const balance = playerBalances[totalSelected] || (totalSelected < 5 ? playerBalances[5] : playerBalances[10]);
    if (document.getElementById('good-required-desc')) document.getElementById('good-required-desc').innerText = balance.good;
    if (document.getElementById('evil-required-desc')) document.getElementById('evil-required-desc').innerText = balance.evil;
    if (document.getElementById('good-required-count')) document.getElementById('good-required-count').innerText = balance.good;
    if (document.getElementById('evil-required-count')) document.getElementById('evil-required-count').innerText = balance.evil;
    
    if (document.getElementById('good-selected-count')) document.getElementById('good-selected-count').innerText = goodSelected;
    if (document.getElementById('evil-selected-count')) document.getElementById('evil-selected-count').innerText = evilSelected;
    
    const badge = document.getElementById('role-balance-badge');
    const badgeText = document.getElementById('role-balance-badge-text');
    const badgeDot = document.getElementById('role-balance-badge-dot');
    const btnConfirm = document.getElementById('btn-confirm-roles');
    
    let isValid = false;
    let badgeMsg = '';
    let badgeClass = '';
    let dotColor = 'bg-emerald-400';
    
    if (totalSelected < 5) {
        isValid = false;
        badgeMsg = `🟡 ขั้นต่ำ 5 คน (เลือกแล้ว ${totalSelected} บทบาท)`;
        badgeClass = 'bg-amber-950/80 text-amber-300 border-amber-800';
        dotColor = 'bg-amber-400';
    } else if (totalSelected > 10) {
        isValid = false;
        badgeMsg = `🟡 สูงสุด 10 คน (เลือกแล้ว ${totalSelected} บทบาท)`;
        badgeClass = 'bg-amber-950/80 text-amber-300 border-amber-800';
        dotColor = 'bg-amber-400';
    } else {
        const isBalanced = (goodSelected === balance.good && evilSelected === balance.evil);
        if (isBalanced) {
            isValid = true;
            badgeMsg = `🟢 สมดุลตามกติกา (${totalSelected} คน)`;
            badgeClass = 'bg-emerald-950/80 text-emerald-400 border-emerald-800';
            dotColor = 'bg-emerald-400';
        } else {
            isValid = false;
            badgeMsg = `🔴 ปรับเป็น Good ${balance.good} / Evil ${balance.evil}`;
            badgeClass = 'bg-rose-950/80 text-rose-400 border-rose-800';
            dotColor = 'bg-rose-400';
        }
    }
    
    if (badge) {
        badge.className = `px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 shadow-sm transition-all duration-200 ${badgeClass}`;
    }
    if (badgeText) {
        badgeText.innerText = badgeMsg;
    }
    if (badgeDot) {
        badgeDot.className = `w-2 h-2 rounded-full ${dotColor} animate-pulse`;
    }
    
    if (btnConfirm) {
        if (isValid) {
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

// --- Home Screen Events ---
function startCreateRoom() {
    showScreen('screen-role-select');
    updateRoleUI();
    renderRoleSwitches();
}
window.startCreateRoom = startCreateRoom;

document.getElementById('btn-create-room')?.addEventListener('click', startCreateRoom);

function getJoinUrl(roomCode) {
    let base = window.location.href.split('?')[0];
    if (base.endsWith('index.html')) {
        base = base.substring(0, base.lastIndexOf('index.html'));
    }
    if (!base.endsWith('/')) {
        base += '/';
    }

    // If running on local computer (file:/// or localhost/127.0.0.1), point QR Code to GitHub Pages production URL
    // so mobile devices scanning the QR on 4G/5G or separate networks can open the page via HTTPS
    if (window.location.protocol === 'file:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        base = 'https://pramukch-alt.github.io/game/avalon/public/';
    }

    let url = base + '?room=' + encodeURIComponent(roomCode);
    const modId = currentModPeerId || getModPeerId(roomCode);
    if (modId) {
        url += '&mid=' + encodeURIComponent(modId);
    }
    return url;
}

function generateLobbyQRCode(joinUrl) {
    const qrContainer = document.getElementById('qrcode-container');
    if (!qrContainer) return;
    qrContainer.innerHTML = '';

    try {
        if (typeof QRCode !== 'undefined') {
            new QRCode(qrContainer, {
                text: joinUrl,
                width: 190,
                height: 190,
                colorDark: "#020617",
                colorLight: "#ffffff",
                correctLevel: (typeof QRCode.CorrectLevel !== 'undefined' ? QRCode.CorrectLevel.M : 1)
            });
            return;
        }
    } catch (e) {
        console.warn('QRCode JS error, using fallback API image:', e);
    }

    // Fallback to QR API image if library fails or is unavailable
    qrContainer.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=190x190&data=${encodeURIComponent(joinUrl)}" class="w-full h-full rounded-xl" alt="QR Code">`;
}

function setupModLobby(roomCode, targetPlayers) {
    myRoom = roomCode;
    activeRoomCode = roomCode;
    
    // Update Mod Lobby Info
    const codeDisplay = document.getElementById('mod-room-code-display');
    if (codeDisplay) codeDisplay.innerText = roomCode;
    
    const targetCount = document.getElementById('mod-target-count');
    if (targetCount) targetCount.innerText = targetPlayers || expectedPlayers;
    
    const joinedCount = document.getElementById('mod-joined-count');
    if (joinedCount) joinedCount.innerText = (allPlayers && allPlayers.length) ? allPlayers.length : '0';
    
    const progress = document.getElementById('mod-lobby-progress');
    if (progress) progress.style.width = '0%';
    
    const playersList = document.getElementById('mod-players-list');
    if (playersList) playersList.innerHTML = '';
    
    const joinUrl = getJoinUrl(roomCode);
    const urlDisplay = document.getElementById('qr-target-url-display');
    if (urlDisplay) urlDisplay.innerText = joinUrl;

    const btnStart = document.getElementById('btn-start-game');
    if (btnStart) {
        btnStart.classList.add('opacity-50', 'cursor-not-allowed');
        btnStart.disabled = true;
    }

    // Switch to Lobby Screen FIRST so screen ALWAYS transitions!
    showScreen('screen-mod-lobby');

    // Reset button text
    const btnConfirm = document.getElementById('btn-confirm-roles');
    if (btnConfirm) {
        btnConfirm.innerHTML = `<span>ตกลง & รับ QR Code</span> <span>➡️</span>`;
    }

    // Generate QR Code with try-catch and API image fallback
    generateLobbyQRCode(joinUrl);
}

function confirmRolesAndCreateRoom() {
    let goodSelected = 0, evilSelected = 0;
    const finalRoles = [];
    rolesConfig.forEach(r => {
        if (selectedRoles[r.id]) {
            finalRoles.push(r.name);
            if (r.team === 'good') goodSelected++;
            else evilSelected++;
        }
    });
    
    const totalSelected = goodSelected + evilSelected;
    expectedPlayers = totalSelected;
    
    if (totalSelected < 5 || totalSelected > 10) {
        alert(`เกม Avalon รองรับผู้เล่น 5 - 10 คนเท่านั้น (ปัจจุบันเลือกไว้ ${totalSelected} บทบาท)`);
        return;
    }
    
    const balance = playerBalances[totalSelected];
    if (goodSelected !== balance.good || evilSelected !== balance.evil) {
        alert(`กรุณาเลือกบทบาทให้สมดุลตามกติกาสำหรับผู้เล่น ${totalSelected} คน:\n- ฝ่ายคนดีต้องการ ${balance.good} คน (เลือกแล้ว ${goodSelected})\n- ฝ่ายร้ายต้องการ ${balance.evil} คน (เลือกแล้ว ${evilSelected})`);
        return;
    }
    
    // Provide visual feedback on button
    const btnConfirm = document.getElementById('btn-confirm-roles');
    if (btnConfirm) {
        btnConfirm.innerHTML = `<span>กำลังสร้างห้อง QR...</span> <span class="animate-spin">⏳</span>`;
    }

    const localCode = 'AV-' + Math.floor(1000 + Math.random() * 9000).toString();
    isMod = true;
    activeRoomCode = localCode;
    myRoom = localCode;

    // Initialize in-browser Mod Host State Machine
    handleModHostAction('createRoom', { expectedPlayers, roles: finalRoles }, myDeviceId);
    // Setup PeerJS & BroadcastChannel as Mod
    setupRealtimeListener(localCode, true);
    // Setup Mod Lobby Screen
    setupModLobby(localCode, expectedPlayers);

    // Also mirror to Socket.IO backend if connected
    if (socket._realIo && socket._realIo.connected) {
        try { socket._realIo.emit('createRoom', { expectedPlayers, roles: finalRoles }); } catch(e){}
    }
}
window.confirmRolesAndCreateRoom = confirmRolesAndCreateRoom;

document.getElementById('btn-confirm-roles')?.addEventListener('click', confirmRolesAndCreateRoom);

// --- Mod Lobby Events ---
function copyJoinLink() {
    const url = document.getElementById('qr-target-url-display')?.innerText || getJoinUrl(myRoom || activeRoomCode);
    if (url) {
        navigator.clipboard.writeText(url).then(() => {
            const btnText = document.getElementById('btn-copy-link-text');
            if (btnText) {
                const old = btnText.innerText;
                btnText.innerText = 'คัดลอกสำเร็จ! ✓';
                setTimeout(() => { btnText.innerText = old; }, 2000);
            }
        }).catch(() => {
            prompt('คัดลอกลิงก์นี้เพื่อส่งให้เพื่อน:', url);
        });
    }
}
window.copyJoinLink = copyJoinLink;

function renderModLobbyPlayers(players) {
    allPlayers = players;
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
                <span class="text-[10px] text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded-full border border-emerald-800 font-mono">พร้อม</span>
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
}

function simulatePlayerBot() {
    const room = myRoom || activeRoomCode;
    if (room) {
        socket.emit('simulateBot', room);
    }
}
window.simulatePlayerBot = simulatePlayerBot;

// --- Manual Join from Home ---
document.getElementById('btn-join-submit')?.addEventListener('click', () => {
    const code = document.getElementById('input-room-code')?.value.trim().toUpperCase();
    const name = document.getElementById('input-player-name')?.value.trim();
    if (!code || !name) {
        alert('กรุณากรอกทั้งชื่อและรหัสห้อง');
        return;
    }
    
    const btn = document.getElementById('btn-join-submit');
    const origText = btn ? btn.innerText : 'เข้าร่วมห้อง';
    if (btn) {
        btn.disabled = true;
        btn.innerText = 'กำลังเชื่อมต่อ...';
    }

    activeRoomCode = code;
    myName = name;
    isMod = false;

    // Connect to Mod Peer via WebRTC
    setupRealtimeListener(code, false);

    try {
        sessionStorage.setItem('av_player_name', name);
        sessionStorage.setItem('av_room_code', code);
        sessionStorage.setItem('av_joined_room', 'true');
    } catch(e){}

    setTimeout(() => {
        socket.emit('joinRoom', { roomCode: code, playerName: name, playerId: myDeviceId });
        const waitingTag = document.getElementById('waiting-room-tag');
        if (waitingTag) waitingTag.innerText = code;
        const nameDisplay = document.getElementById('player-my-name-display');
        if (nameDisplay) nameDisplay.innerText = name;
        showScreen('screen-player-waiting');
        if (btn) {
            btn.disabled = false;
            btn.innerText = origText;
        }
    }, 600);
});

// --- Direct Join from QR Scan URL ---
function submitDirectPlayerJoin() {
    const nameInput = document.getElementById('player-direct-name');
    const name = nameInput?.value.trim();
    if (!name) {
        alert('กรุณากรอกชื่อของคุณ');
        if (nameInput) nameInput.focus();
        return;
    }

    // Resolve room code safely from state, URL, or view elements
    let room = (activeRoomCode || '').trim().toUpperCase();
    if (!room || room === 'AV-XXXX') {
        const params = new URLSearchParams(window.location.search);
        room = (params.get('room') || document.getElementById('player-view-room-code')?.innerText || document.getElementById('input-room-code')?.value || '').trim().toUpperCase();
    }
    if (!room || room === 'AV-XXXX') {
        alert('ไม่พบรหัสห้อง กรุณาสแกน QR Code ใหม่อีกครั้ง หรือกลับไปที่หน้าแรก');
        return;
    }
    activeRoomCode = room;
    myRoom = room;
    myName = name;

    try {
        sessionStorage.setItem('av_player_name', name);
        sessionStorage.setItem('av_room_code', room);
        sessionStorage.setItem('av_joined_room', 'true');
    } catch(e) {}

    const btn = document.getElementById('btn-direct-join') || document.querySelector('#screen-player-join button');
    const originalHTML = btn ? btn.innerHTML : '<span>เข้าร่วมห้อง & รอรับการ์ด</span> <span>🃏</span>';
    
    if (btn) {
        btn.disabled = true;
        btn.classList.add('opacity-75', 'cursor-wait');
        btn.innerHTML = `<span>กำลังเข้าสู่ห้อง...</span> <span class="animate-spin inline-block ml-1">⏳</span>`;
    }

    // Send join request through Universal Realtime Bus
    socket.emit('joinRoom', { roomCode: room, playerName: name, playerId: myDeviceId });

    // Transition to waiting screen
    setTimeout(() => {
        if (currentScreen === 'screen-player-join') {
            const waitingTag = document.getElementById('waiting-room-tag');
            if (waitingTag) waitingTag.innerText = room;
            const nameDisplay = document.getElementById('player-my-name-display');
            if (nameDisplay) nameDisplay.innerText = name;
            showScreen('screen-player-waiting');
            if (btn) {
                btn.disabled = false;
                btn.classList.remove('opacity-75', 'cursor-wait');
                btn.innerHTML = originalHTML;
            }
        }
    }, 600);
}
window.submitDirectPlayerJoin = submitDirectPlayerJoin;

// --- Socket Listeners (Common) ---
socket.on('error', (msg) => {
    const btn = document.getElementById('btn-direct-join') || document.querySelector('#screen-player-join button');
    if (btn) {
        btn.disabled = false;
        btn.classList.remove('opacity-75', 'cursor-wait');
        btn.innerHTML = `<span>เข้าร่วมห้อง & รอรับการ์ด</span> <span>🃏</span>`;
    }
    const btnHome = document.getElementById('btn-join-submit');
    if (btnHome) {
        btnHome.disabled = false;
        btnHome.innerText = 'เข้าร่วมห้อง';
    }
    alert(msg);
});

// --- Socket Listeners (Mod Room Created -> Load New QR Screen!) ---
socket.on('roomCreated', (data) => {
    const roomCode = (typeof data === 'object' && data.roomCode) ? data.roomCode : data;
    if (typeof data === 'object' && data.lanIp) {
        serverLanIp = data.lanIp;
        console.log('Server LAN IP updated via roomCreated:', serverLanIp);
    }
    setupModLobby(roomCode, expectedPlayers);
});

// Mod Player Joined Broadcast
socket.on('playerJoined', (players) => {
    renderModLobbyPlayers(players);
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
    
    const btn = document.getElementById('btn-direct-join') || document.querySelector('#screen-player-join button');
    if (btn) {
        btn.disabled = false;
        btn.classList.remove('opacity-75', 'cursor-wait');
        btn.innerHTML = `<span>เข้าร่วมห้อง & รอรับการ์ด</span> <span>🃏</span>`;
    }

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
    'Loyal Servant of Arthur': {
        name: 'Loyal Servant of Arthur',
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
    'Minion of Mordred': {
        name: 'Minion of Mordred',
        thai: 'สมุนฝ่ายมอร์เดรด',
        icon: '🦹',
        desc: 'สมุนฝ่ายร้าย รู้ว่าใครคือฝ่ายร้ายด้วยกัน ร่วมมือกันขัดขวางภารกิจให้ล้มเหลว',
        team: 'evil'
    }
};

// Compatibility aliases
ROLES_DETAILS['Loyal Servant 1'] = ROLES_DETAILS['Loyal Servant of Arthur'];
ROLES_DETAILS['Loyal Servant 2'] = ROLES_DETAILS['Loyal Servant of Arthur'];
ROLES_DETAILS['Loyal Servant 3'] = ROLES_DETAILS['Loyal Servant of Arthur'];
ROLES_DETAILS['Loyal Servant 4'] = ROLES_DETAILS['Loyal Servant of Arthur'];
ROLES_DETAILS['Loyal Servant'] = ROLES_DETAILS['Loyal Servant of Arthur'];
ROLES_DETAILS['Other Evil 1'] = ROLES_DETAILS['Minion of Mordred'];
ROLES_DETAILS['Other Evil 2'] = ROLES_DETAILS['Minion of Mordred'];
ROLES_DETAILS['Other Evil'] = ROLES_DETAILS['Minion of Mordred'];

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

function renderPlayerCard(role) {
    myRole = role;
    try {
        sessionStorage.setItem('av_assigned_role', role);
        sessionStorage.setItem('av_room_code', activeRoomCode || myRoom);
    } catch(e){}
    
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
    if (nameTag) nameTag.innerText = myName || sessionStorage.getItem('av_player_name') || 'ผู้เล่น';

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
}
window.renderPlayerCard = renderPlayerCard;

socket.on('roleAssigned', (role) => {
    renderPlayerCard(role);
});

let currentQuest = 1;
let requiredTeamSize = 2;
let questRequirements = [2, 3, 2, 3, 3];
let currentQuestResults = [];
let currentLeaderId = null;
let currentLeaderName = '';
let currentProposedTeam = [];
let currentProposedTeamIds = [];
let selectedAssassinTargetId = null;
let selectedAssassinTargetName = '';

function renderUserTags(items, containerEl, options = {}) {
    if (!containerEl) return;
    containerEl.innerHTML = '';
    if (!items || items.length === 0) return;

    const leaderName = typeof options === 'string' ? options : (options.leaderName || currentLeaderName || '');
    const customIcon = (typeof options === 'object' && options.icon) ? options.icon : '⚔️';

    items.forEach(item => {
        let name = '';
        let id = '';
        if (typeof item === 'string') {
            name = item;
            const found = allPlayers.find(p => p.name === item || p.id === item);
            if (found) {
                name = found.name;
                id = found.id;
            }
        } else if (item && typeof item === 'object') {
            name = item.name || item.id || '';
            id = item.id || '';
        }
        if (!name) return;

        const isLdr = (name === leaderName || (id && id === currentLeaderId));
        const tag = document.createElement('span');
        tag.className = 'quest-user-tag inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500/25 via-amber-500/15 to-amber-600/25 text-amber-300 font-bold text-xs sm:text-sm border border-amber-500/60 shadow-md shadow-amber-500/15 backdrop-blur-sm transition-transform hover:scale-105';
        
        tag.innerHTML = `
            <span class="tag-avatar w-5 h-5 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center text-[10px] sm:text-xs font-black shadow-inner">
                ${isLdr ? '👑' : customIcon}
            </span>
            <span class="tracking-wide">${name}</span>
            ${isLdr ? '<span class="text-[9px] px-1.5 py-0.2 rounded bg-amber-400/30 text-amber-200 border border-amber-400/40 font-normal">ผู้นำ</span>' : ''}
        `;
        containerEl.appendChild(tag);
    });
}
window.renderUserTags = renderUserTags;

// --- Game FSM Handlers ---
socket.on('gameStateChanged', (data) => {
    if (!data) return;
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
        proposedTeam,
        proposedTeamIds,
        currentTeam
    } = data;

    getEffectiveRoomCode();

    // Ensure player is switched to screen-player-game when game is in progress
    if (!isMod && state !== 'LOBBY' && state !== 'ROLE_ASSIGNMENT') {
        const savedRole = sessionStorage.getItem('av_assigned_role') || myRole;
        if (savedRole && !myRole) {
            renderPlayerCard(savedRole);
        }
        if (currentScreen !== 'screen-player-game') {
            showScreen('screen-player-game');
        }
    }

    if (leader) currentLeaderName = leader;
    if (leaderId) currentLeaderId = leaderId;
    if (qNum !== undefined) currentQuest = qNum;
    if (reqSize !== undefined) requiredTeamSize = reqSize;
    if (qReqs) questRequirements = qReqs;
    if (questResults) currentQuestResults = questResults;
    if (players) allPlayers = players;

    // Track active team for quest
    if (proposedTeam && proposedTeam.length > 0) {
        currentProposedTeam = proposedTeam;
    }
    if (proposedTeamIds && proposedTeamIds.length > 0) {
        currentProposedTeamIds = proposedTeamIds;
    } else if (currentTeam && currentTeam.length > 0) {
        currentProposedTeamIds = currentTeam;
        currentProposedTeam = currentTeam.map(id => {
            const p = allPlayers.find(pl => pl.id === id);
            return p ? p.name : id;
        });
    }

    if (state === 'TEAM_BUILDING') {
        currentProposedTeam = [];
        currentProposedTeamIds = [];
    }

    // Determine active team names for display
    let activeTeamNames = [];
    if (currentProposedTeam && currentProposedTeam.length > 0) {
        activeTeamNames = currentProposedTeam.map(item => {
            if (typeof item === 'string') {
                const p = allPlayers.find(pl => pl.id === item);
                return p ? p.name : item;
            }
            return item.name || item;
        });
    }

    // Update Mod Board Status & Quest Tracker
    const modStatus = document.getElementById('mod-status');
    const modQuestTeamContainer = document.getElementById('mod-quest-team-container');
    const modQuestTeamTitle = document.getElementById('mod-quest-team-title');
    const modQuestTeamBadge = document.getElementById('mod-quest-team-count-badge');
    const modQuestTeamTags = document.getElementById('mod-quest-team-tags');
    const playersCardHint = document.getElementById('players-card-team-hint');

    if (modStatus) {
        if (state === 'TEAM_BUILDING') {
            modStatus.innerText = `ภารกิจที่ ${currentQuest} (ต้องการ ${requiredTeamSize} คน) | ผู้นำ: ${leader}`;
        } else if (state === 'TEAM_VOTING') {
            modStatus.innerText = `กำลังโหวตรับรองทีม: ${activeTeamNames.length > 0 ? activeTeamNames.join(', ') : (proposedTeam ? proposedTeam.join(', ') : '')}`;
        } else if (state === 'QUEST_EXECUTION') {
            modStatus.innerText = `กำลังดำเนินภารกิจที่ ${currentQuest}...`;
        } else if (state === 'ASSASSINATION') {
            modStatus.innerHTML = `🗡️ <span class="text-rose-400 font-bold">ฝ่ายคนดีสำเร็จ 3 เควสต์!</span> รอ Assassin (${data.assassinName || 'มือสังหาร'}) เลือกลอบสังหาร Merlin...`;
        } else if (state === 'GAME_OVER') {
            modStatus.innerText = `🏆 จบเกม!`;
        }
    }

    // Update Mod Quest Team Card (Prominent User Tags)
    if (modQuestTeamContainer) {
        if (state === 'TEAM_VOTING' && activeTeamNames.length > 0) {
            modQuestTeamContainer.classList.remove('hidden');
            if (modQuestTeamTitle) modQuestTeamTitle.innerText = 'ทีมที่เสนอไปทำ Quest (รอการโหวต)';
            if (modQuestTeamBadge) modQuestTeamBadge.innerText = `${activeTeamNames.length} คน`;
            if (modQuestTeamTags) renderUserTags(activeTeamNames, modQuestTeamTags, { leaderName: leader });
            if (playersCardHint) playersCardHint.classList.remove('hidden');
        } else if (state === 'QUEST_EXECUTION' && activeTeamNames.length > 0) {
            modQuestTeamContainer.classList.remove('hidden');
            if (modQuestTeamTitle) modQuestTeamTitle.innerText = 'ทีมที่กำลังดำเนินภารกิจ (Quest Team)!';
            if (modQuestTeamBadge) modQuestTeamBadge.innerText = `${activeTeamNames.length} คน`;
            if (modQuestTeamTags) renderUserTags(activeTeamNames, modQuestTeamTags, { leaderName: leader });
            if (playersCardHint) playersCardHint.classList.remove('hidden');
        } else {
            modQuestTeamContainer.classList.add('hidden');
            if (playersCardHint) playersCardHint.classList.add('hidden');
        }
    }

    renderQuestTracker(currentQuestResults, currentQuest, questRequirements);
    
    // Update Vote Track
    if (rejectedVoteCount !== undefined) {
        updateVoteTrack(rejectedVoteCount);
    }
    
    // Update Live Players on Mod Board
    const gamePlayersList = document.getElementById('game-players-list');
    if (gamePlayersList && allPlayers && allPlayers.length > 0) {
        gamePlayersList.innerHTML = '';
        allPlayers.forEach(p => {
            const isLeader = (p.id === leaderId || p.name === leader);
            const isAssassinPlayer = (state === 'ASSASSINATION') && (p.name === data.assassinName || p.id === data.assassinId);
            const isInActiveTeam = (state === 'TEAM_VOTING' || state === 'QUEST_EXECUTION') && (
                activeTeamNames.includes(p.name) || 
                (currentProposedTeamIds && currentProposedTeamIds.includes(p.id))
            );

            const div = document.createElement('div');
            if (isAssassinPlayer) {
                div.className = `p-2.5 rounded-xl border-2 border-rose-500 bg-gradient-to-r from-rose-950/90 via-slate-900 to-rose-950/90 text-rose-200 font-bold ring-2 ring-rose-500/50 shadow-lg shadow-rose-900/40 text-center flex flex-col items-center justify-center gap-1 transition-all transform scale-[1.02]`;
                div.innerHTML = `
                    <div class="flex items-center gap-1.5 justify-center">
                        <span class="text-rose-100 font-extrabold tracking-wide">${p.name}</span>
                    </div>
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-500 text-slate-950 shadow-sm animate-pulse">
                        <span>🗡️</span>
                        <span>กำลังเลือกสังหาร Merlin...</span>
                    </span>
                `;
            } else if (isInActiveTeam) {
                div.className = `p-2.5 rounded-xl border-2 border-amber-400 bg-gradient-to-r from-amber-950/90 via-slate-900 to-amber-950/90 text-amber-200 font-bold ring-2 ring-amber-500/50 shadow-lg shadow-amber-500/20 text-center flex flex-col items-center justify-center gap-1 transition-all transform scale-[1.02]`;
                div.innerHTML = `
                    <div class="flex items-center gap-1.5 justify-center">
                        ${isLeader ? '<span>👑</span>' : ''}
                        <span class="text-amber-100 font-extrabold tracking-wide">${p.name}</span>
                    </div>
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-400 text-slate-950 shadow-sm animate-pulse">
                        <span>⚔️</span>
                        <span>ในทีมเควสต์</span>
                    </span>
                `;
            } else {
                div.className = `p-2 rounded-xl border text-center transition ${isLeader ? 'border-amber-500 bg-amber-950/40 text-amber-300 font-bold shadow-sm' : 'border-slate-800 bg-slate-950/70 text-slate-300'}`;
                div.innerHTML = `${isLeader ? '👑 ' : ''}${p.name}`;
            }
            gamePlayersList.appendChild(div);
        });
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
        amLeader = (leaderId === socket.id || leader === myName || (leaderId && leaderId === myDeviceId));
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
        if (!isMod && currentScreen !== 'screen-player-game') {
            showScreen('screen-player-game');
        }
        if (playerBanner) playerBanner.innerText = `ร่วมลงคะแนนโหวตรับรองทีม (${activeTeamNames.length > 0 ? activeTeamNames.join(', ') : (proposedTeam ? proposedTeam.join(', ') : '')})`;
        if (actionPanel) actionPanel.classList.remove('hidden');
        if (votingPanel) {
            votingPanel.classList.remove('hidden');
            votingPanel.querySelectorAll('.vote-btn').forEach(btn => {
                btn.disabled = false;
                btn.classList.remove('opacity-50', 'pointer-events-none');
            });
        }
        renderUserTags(activeTeamNames.length > 0 ? activeTeamNames : proposedTeam, document.getElementById('proposed-team-names'), { leaderName: leader });
    } else if (state === 'QUEST_EXECUTION') {
        if (playerBanner) playerBanner.innerText = `กำลังดำเนินภารกิจที่ ${currentQuest}...`;
        renderUserTags(activeTeamNames, document.getElementById('quest-panel-team-tags'), { leaderName: leader });
    } else if (state === 'ASSASSINATION') {
        const isAssassin = (myRole && myRole.includes('Assassin'));
        if (playerBanner) {
            playerBanner.innerText = isAssassin 
                ? "🗡️ คุณคือ Assassin! โปรดเลือกผู้เล่นคนดีที่คิดว่าเป็น Merlin ในหน้าต่างป๊อปอัป" 
                : `🗡️ ฝ่ายคนดีสำเร็จ 3 เควสต์! รอ Assassin (${data.assassinName || 'มือสังหาร'}) เลือกลอบสังหาร Merlin...`;
        }
        if (isAssassin && data.goodPlayers && data.goodPlayers.length > 0) {
            renderAssassinTargetChoices(data.goodPlayers);
        }
    } else if (state === 'GAME_OVER') {
        const assassinModal = document.getElementById('assassin-modal');
        if (assassinModal) assassinModal.classList.add('hidden');
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
    const leaderTagsBox = document.getElementById('leader-selected-team-box');
    const leaderTagsContainer = document.getElementById('leader-selected-team-tags');

    if (questLabel) questLabel.innerText = currentQuest;
    if (countEl) countEl.innerText = selectedTeam.length;
    if (reqEl) reqEl.innerText = requiredTeamSize;

    // Live Tags Preview for Leader
    if (leaderTagsBox && leaderTagsContainer) {
        if (selectedTeam.length > 0) {
            leaderTagsBox.classList.remove('hidden');
            const selectedNames = selectedTeam.map(id => {
                const p = allPlayers.find(pl => pl.id === id);
                return p ? p.name : id;
            });
            renderUserTags(selectedNames, leaderTagsContainer, { leaderName: myName });
        } else {
            leaderTagsBox.classList.add('hidden');
            leaderTagsContainer.innerHTML = '';
        }
    }

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
    const room = getEffectiveRoomCode();
    const payload = { 
        roomCode: room, 
        team: selectedTeam,
        playerName: myName,
        playerId: myDeviceId
    };
    socket.emit('proposeTeam', payload);
});

socket.on('voteTeam', (team) => {
    let proposedNames = [];
    if (Array.isArray(team)) {
        proposedNames = team.map(id => {
            const p = allPlayers.find(pl => pl.id === id);
            return p ? p.name : id;
        });
    }
    const namesEl = document.getElementById('proposed-team-names');
    if (namesEl) {
        renderUserTags(proposedNames, namesEl, { leaderName: currentLeaderName });
    }
});

document.querySelectorAll('.vote-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const vote = e.currentTarget.getAttribute('data-vote');
        const room = getEffectiveRoomCode();
        const payload = { 
            roomCode: room, 
            vote,
            playerName: myName,
            playerId: myDeviceId 
        };
        socket.emit('voteTeamSubmit', payload);
        socket.emit('voteTeam', payload);
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
    
    // Proposed Team User Tags
    const teamEl = document.getElementById('vote-result-team-names');
    if (teamEl) {
        renderUserTags(proposedTeam, teamEl, { leaderName: currentLeaderName });
    }

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
    socket.emit('skipVoteReveal', getEffectiveRoomCode());
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

    const memberNames = (Array.isArray(team) ? team : []).map(id => {
        const p = allPlayers.find(pl => pl.id === id);
        return p ? p.name : id;
    });

    const modalTags = document.getElementById('quest-modal-team-tags');
    if (modalTags) {
        renderUserTags(memberNames, modalTags, { leaderName: currentLeaderName });
    }

    const panelTags = document.getElementById('quest-panel-team-tags');
    if (panelTags) {
        renderUserTags(memberNames, panelTags, { leaderName: currentLeaderName });
    }

    const myPlayer = allPlayers.find(p => p.name === myName || p.id === socket.id || p.id === myDeviceId);
    const isMember = (team && Array.isArray(team)) && team.some(id => 
        id === socket.id || 
        id === myDeviceId || 
        (myPlayer && id === myPlayer.id) ||
        allPlayers.find(p => p.id === id)?.name === myName
    );

    if (isMember) {
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
    const isEvil = ['Mordred', 'Morgana', 'Assassin', 'Oberon', 'Other Evil 1', 'Other Evil 2', 'Minion'].some(r => (myRole || '').includes(r));
    
    if (!isEvil && vote === 'fail') {
        alert('คุณเป็นฝ่ายคนดี (Good) ตามกติกาคุณต้องลงผลสำเร็จ (SUCCESS) เท่านั้น!');
        return;
    }

    const room = getEffectiveRoomCode();
    const payload = { roomCode: room, vote, playerName: myName, playerId: myDeviceId };
    socket.emit('questVoteSubmit', payload);
    socket.emit('voteQuest', payload);
    
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

socket.on('gameOver', (data) => {
    const { winner, reason, questHistory, rejectedVoteCount } = data;
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
        showGameOverModal(winner, reason, currentQuestResults, data);
    }, 1200);
});

function showGameOverModal(winner, reason, questHistory, details = {}) {
    const modal = document.getElementById('game-over-modal');
    if (!modal) return;

    // Close Assassin Modal if open
    const assassinModal = document.getElementById('assassin-modal');
    if (assassinModal) assassinModal.classList.add('hidden');

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

    const { targetName, targetRole, merlinName } = details;

    if (subtitleEl) {
        if (reason === 'MERLIN_ASSASSINATED') {
            subtitleEl.innerHTML = `🗡️ <span class="text-rose-300 font-bold">Assassin สังหาร Merlin (${merlinName || ''}) สำเร็จ!</span> ฝ่ายร้ายพลิกกลับมาชนะ`;
        } else if (reason === 'MERLIN_SURVIVED') {
            subtitleEl.innerHTML = `✨ <span class="text-emerald-300 font-bold">Assassin สังหารผิดคน!</span> (${targetName || ''} ไม่ใช่ Merlin) ฝ่ายคนดีชนะสมบูรณ์`;
        } else if (isGood) {
            subtitleEl.innerText = `ภารกิจสำเร็จ 3 ใน 5 ครั้ง (Success 3/5)`;
        } else if (reason === 'VOTES_REJECTED_5') {
            subtitleEl.innerText = `ฝ่ายคนดีไม่สามารถเลือกทีมได้ (โหวตคัดค้านครบ 5 ครั้ง)`;
        } else {
            subtitleEl.innerText = `ภารกิจล้มเหลว 3 ครั้ง (Fail ${failCount}/5)`;
        }
    }

    if (successCountEl) successCountEl.innerText = successCount;
    if (failCountEl) failCountEl.innerText = failCount;

    // Assassination result box
    const assassinBox = document.getElementById('game-over-assassin-box');
    const assassinRes = document.getElementById('game-over-assassin-result');
    const targetNameEl = document.getElementById('game-over-target-name');
    const merlinNameEl = document.getElementById('game-over-merlin-name');

    if (assassinBox) {
        if (reason === 'MERLIN_ASSASSINATED' || reason === 'MERLIN_SURVIVED') {
            assassinBox.classList.remove('hidden');
            if (reason === 'MERLIN_ASSASSINATED') {
                if (assassinRes) {
                    assassinRes.className = 'text-xs font-bold text-rose-300 bg-rose-950/80 border border-rose-800 p-2 rounded-xl';
                    assassinRes.innerHTML = '💀 ลอบสังหาร Merlin สำเร็จ! (Merlin Assassinated)';
                }
            } else {
                if (assassinRes) {
                    assassinRes.className = 'text-xs font-bold text-emerald-300 bg-emerald-950/80 border border-emerald-800 p-2 rounded-xl';
                    assassinRes.innerHTML = '🛡️ ลอบสังหารไม่สำเร็จ! Merlin รอดชีวิต (Merlin Survived)';
                }
            }
            if (targetNameEl) targetNameEl.innerText = `${targetName || '-'} (${targetRole || '-'})`;
            if (merlinNameEl) merlinNameEl.innerText = merlinName || '-';
        } else {
            assassinBox.classList.add('hidden');
        }
    }

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

            chip.className = `w-11 h-14 rounded-xl border flex flex-col items-center justify-between p-1.5 text-xs relative overflow-hidden ${chipClass}`;
            chip.innerHTML = `
                <img src="./pics/Avalon.png" alt="Avalon" class="absolute inset-0 w-full h-full object-cover opacity-20 pointer-events-none">
                <span class="text-[9px] font-mono opacity-80 relative z-10">${label}</span>
                <span class="text-base font-black relative z-10">${mark}</span>
            `;
            questListEl.appendChild(chip);
        }
    }

    modal.classList.remove('hidden');
}

// --- Assassin Phase Handlers ---
socket.on('assassinationPhase', (data) => {
    const isAssassin = (myRole && myRole.includes('Assassin'));
    if (isAssassin && data && data.goodPlayers) {
        renderAssassinTargetChoices(data.goodPlayers);
    }
});

function renderAssassinTargetChoices(goodPlayers) {
    const listEl = document.getElementById('assassin-target-list');
    const countEl = document.getElementById('assassin-good-count-badge');
    const confirmBtn = document.getElementById('btn-confirm-assassinate');
    const noticeEl = document.getElementById('assassin-selected-notice');
    const nameEl = document.getElementById('assassin-selected-name');

    selectedAssassinTargetId = null;
    selectedAssassinTargetName = '';

    if (countEl) countEl.innerText = `${(goodPlayers || []).length} คน`;
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = `<span>🗡️ สังหารเป้าหมายทันที!</span>`;
    }
    if (noticeEl) noticeEl.classList.add('hidden');

    if (!listEl) return;
    listEl.innerHTML = '';

    if (!goodPlayers || goodPlayers.length === 0) {
        listEl.innerHTML = '<p class="text-xs text-slate-500 text-center py-2">ไม่พบรายชื่อผู้เล่นฝ่ายคนดี</p>';
        return;
    }

    goodPlayers.forEach(p => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'assassin-target-btn w-full p-3 rounded-2xl bg-slate-950/80 border border-slate-800 hover:border-rose-500/80 hover:bg-rose-950/30 text-slate-200 transition-all flex items-center justify-between shadow active:scale-95';
        btn.innerHTML = `
            <div class="flex items-center gap-2.5">
                <span class="w-7 h-7 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center text-xs font-bold border border-slate-700 target-avatar">👤</span>
                <span class="text-sm font-bold tracking-wide">${p.name}</span>
            </div>
            <span class="target-badge text-[11px] font-semibold text-slate-500 px-2.5 py-1 rounded-lg border border-slate-800">แตะเพื่อเลือก</span>
        `;

        btn.addEventListener('click', () => {
            // Deselect all
            document.querySelectorAll('.assassin-target-btn').forEach(b => {
                b.className = 'assassin-target-btn w-full p-3 rounded-2xl bg-slate-950/80 border border-slate-800 hover:border-rose-500/80 hover:bg-rose-950/30 text-slate-200 transition-all flex items-center justify-between shadow active:scale-95';
                const av = b.querySelector('.target-avatar');
                if (av) av.className = 'w-7 h-7 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center text-xs font-bold border border-slate-700 target-avatar';
                const bd = b.querySelector('.target-badge');
                if (bd) {
                    bd.innerText = 'แตะเพื่อเลือก';
                    bd.className = 'target-badge text-[11px] font-semibold text-slate-500 px-2.5 py-1 rounded-lg border border-slate-800';
                }
            });

            // Select this
            selectedAssassinTargetId = p.id;
            selectedAssassinTargetName = p.name;
            btn.className = 'assassin-target-btn w-full p-3 rounded-2xl bg-rose-950/60 border-2 border-rose-500 text-rose-100 font-bold transition-all flex items-center justify-between shadow-lg shadow-rose-900/30 ring-2 ring-rose-500/30';
            const av = btn.querySelector('.target-avatar');
            if (av) av.className = 'w-7 h-7 rounded-full bg-rose-500 text-slate-950 flex items-center justify-center text-xs font-black target-avatar';
            const bd = btn.querySelector('.target-badge');
            if (bd) {
                bd.innerText = '✓ เลือกแล้ว';
                bd.className = 'target-badge text-[11px] font-bold text-rose-200 bg-rose-900/80 px-2.5 py-1 rounded-lg border border-rose-600';
            }

            if (noticeEl) noticeEl.classList.remove('hidden');
            if (nameEl) nameEl.innerText = p.name;
            if (confirmBtn) {
                confirmBtn.disabled = false;
                confirmBtn.innerHTML = `<span>🗡️ ยืนยันสังหาร ${p.name}!</span>`;
            }
        });

        listEl.appendChild(btn);
    });

    const modal = document.getElementById('assassin-modal');
    if (modal) modal.classList.remove('hidden');
}
window.renderAssassinTargetChoices = renderAssassinTargetChoices;

function confirmAssassination() {
    if (!selectedAssassinTargetId) {
        alert('กรุณาเลือกเป้าหมายฝ่ายคนดี 1 คน');
        return;
    }
    if (!confirm(`คุณต้องการยืนยันการลอบสังหาร "${selectedAssassinTargetName}" ใช่หรือไม่?`)) {
        return;
    }

    const modal = document.getElementById('assassin-modal');
    if (modal) modal.classList.add('hidden');

    const room = getEffectiveRoomCode();
    socket.emit('assassinateTarget', {
        roomCode: room,
        targetId: selectedAssassinTargetId,
        targetName: selectedAssassinTargetName,
        playerName: myName,
        playerId: myDeviceId
    });

    const playerBanner = document.getElementById('player-status-banner');
    if (playerBanner) playerBanner.innerText = "ส่งเป้าหมายสังหารแล้ว... กำลังรอสรุปผล";
}
window.confirmAssassination = confirmAssassination;

function confirmGameOverAndReturnHome() {
    const modal = document.getElementById('game-over-modal');
    if (modal) modal.classList.add('hidden');
    
    const room = getEffectiveRoomCode();
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

        let borderClass = 'border-slate-800 bg-slate-900/90 text-slate-300';
        let imgOpacity = 'opacity-30';
        let badge = `<span class="quest-req-badge text-[10px] text-slate-300 font-mono font-bold bg-slate-950/80 px-1 rounded border border-slate-700/60 shadow">${reqCount} คน</span>`;
        let icon = `<span class="quest-icon text-[11px] font-bold text-slate-300 drop-shadow">Quest ${qNum}</span>`;

        if (status === true) {
            // สีน้ำเงิน = All Success (ตามที่ระบุ)
            borderClass = 'border-blue-400 bg-blue-600/90 text-white font-black shadow-lg shadow-blue-500/50';
            imgOpacity = 'opacity-25';
            icon = '<span class="quest-icon text-base drop-shadow">✓</span>';
            badge = '<span class="quest-req-badge text-[9px] uppercase font-bold tracking-tight bg-blue-950/80 px-1 rounded border border-blue-400/60">All Success</span>';
        } else if (status === false) {
            // สีแดง = มีคนลง Fail ตามเงื่อนไข (ตามที่ระบุ)
            borderClass = 'border-rose-400 bg-rose-600/90 text-white font-black shadow-lg shadow-rose-500/50';
            imgOpacity = 'opacity-25';
            icon = '<span class="quest-icon text-base drop-shadow">✗</span>';
            badge = '<span class="quest-req-badge text-[9px] uppercase font-bold tracking-tight bg-rose-950/80 px-1 rounded border border-rose-400/60">Fail</span>';
        } else if (isCurrent) {
            borderClass = 'border-amber-400 bg-amber-950/80 text-amber-300 font-bold shadow-[0_0_15px_rgba(245,158,11,0.6)] animate-pulse';
            imgOpacity = 'opacity-45';
            badge = `<span class="quest-req-badge text-[10px] text-amber-300 font-black bg-amber-950/90 px-1.5 py-0.5 rounded border border-amber-800">${reqCount} คน</span>`;
            icon = `<span class="quest-icon text-[11px] font-black text-amber-400 drop-shadow">Quest ${qNum}*</span>`;
        }

        card.className = `quest-card-item w-14 h-20 sm:w-16 sm:h-22 border-2 rounded-2xl flex flex-col items-center justify-between p-2 transition-all duration-300 backdrop-blur-sm relative overflow-hidden ${borderClass}`;
        card.innerHTML = `
            <img src="./pics/Avalon.png" alt="Avalon Quest Card" class="absolute inset-0 w-full h-full object-cover ${imgOpacity} pointer-events-none">
            <div class="relative z-10 w-full flex flex-col items-center justify-between h-full">
                ${icon}
                ${badge}
                ${isTwoFail && status === undefined ? '<span class="quest-two-fail text-[8px] text-rose-400 font-mono font-bold bg-rose-950/90 px-1 rounded border border-rose-800/80">*2 fails</span>' : '<span class="h-1"></span>'}
            </div>
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

// --- Direct Room Join via URL Parsing (?room=AV-XXXX&mid=avmod_xxxx) ---
function initDirectJoin() {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    const midParam = params.get('mid');

    if (roomParam) {
        activeRoomCode = roomParam.trim().toUpperCase();
        myRoom = activeRoomCode;
        isMod = false;

        // Connect directly to Mod Peer via WebRTC (Works on 4G/5G and Wi-Fi alike)
        setupRealtimeListener(activeRoomCode, false, midParam);

        const viewCode = document.getElementById('player-view-room-code');
        if (viewCode) viewCode.innerText = activeRoomCode;
        
        const inputCode = document.getElementById('input-room-code');
        if (inputCode) inputCode.value = activeRoomCode;

        // Check if player has active role or joined state saved in sessionStorage
        const savedRoom = sessionStorage.getItem('av_room_code');
        const savedName = sessionStorage.getItem('av_player_name');
        const savedRole = sessionStorage.getItem('av_assigned_role');
        const savedJoined = sessionStorage.getItem('av_joined_room');

        if (savedRoom === activeRoomCode && savedRole) {
            try {
                myRoom = activeRoomCode;
                myRole = savedRole;
                myName = savedName || '';
                renderPlayerCard(myRole);
                showScreen('screen-player-game');
                return;
            } catch(e){}
        }

        if (savedRoom === activeRoomCode && savedJoined === 'true' && savedName) {
            myRoom = activeRoomCode;
            myName = savedName;
            const waitingTag = document.getElementById('waiting-room-tag');
            if (waitingTag) waitingTag.innerText = activeRoomCode;
            const nameDisplay = document.getElementById('player-my-name-display');
            if (nameDisplay) nameDisplay.innerText = myName;
            showScreen('screen-player-waiting');
            return;
        }

        const nameInput = document.getElementById('player-direct-name');
        if (nameInput && savedName) {
            nameInput.value = savedName;
        }

        showScreen('screen-player-join');
    } else {
        showScreen('screen-home');
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDirectJoin);
} else {
    initDirectJoin();
}

// Support Enter key on name input in player join screen
document.getElementById('player-direct-name')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        submitDirectPlayerJoin();
    }
});
