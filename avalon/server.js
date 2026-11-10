const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// Helper: Get Primary Local Network IPv4 Address
function getLocalIpAddress() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

// API: Server Network Info
app.get('/api/server-info', (req, res) => {
    res.json({
        ip: getLocalIpAddress(),
        port: PORT
    });
});

// Game State Storage
const rooms = {};

// Helper: Generate Random Room Code (e.g. AV-4814)
function generateRoomCode() {
    return 'AV-' + Math.floor(1000 + Math.random() * 9000).toString();
}

// Helper: Robust room resolution by code, socket room, or socket connection
function findRoom(roomCode, socket) {
    let code = (roomCode && typeof roomCode === 'string') ? roomCode.trim().toUpperCase() : '';
    if (code) {
        if (!code.startsWith('AV-') && rooms['AV-' + code]) {
            code = 'AV-' + code;
        }
        if (rooms[code]) {
            return { room: rooms[code], code };
        }
    }
    if (socket) {
        if (socket.rooms) {
            for (const r of socket.rooms) {
                if (rooms[r]) return { room: rooms[r], code: r };
            }
        }
        for (const [rCode, rObj] of Object.entries(rooms)) {
            if (rObj.modId === socket.id || (rObj.players && rObj.players.some(p => p.id === socket.id))) {
                return { room: rObj, code: rCode };
            }
        }
    }
    return { room: null, code };
}

// Helper: Shuffle Array
function shuffle(array) {
    let currentIndex = array.length, randomIndex;
    while (currentIndex !== 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
    }
    return array;
}

function isGoodRole(role) {
    if (!role) return true;
    const evilList = ['Mordred', 'Morgana', 'Assassin', 'Oberon', 'Minion', 'Other Evil'];
    return !evilList.some(evil => role.includes(evil));
}

// Game FSM States: LOBBY, ROLE_ASSIGNMENT, TEAM_BUILDING, TEAM_VOTING, QUEST_EXECUTION, ASSASSINATION, GAME_OVER

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Create Room (Mod)
    socket.on('createRoom', (config) => {
        const roomCode = generateRoomCode();
        rooms[roomCode] = {
            modId: socket.id,
            players: [], // { id, name, role }
            state: 'LOBBY',
            config: config || { expectedPlayers: 5, roles: ['Merlin', 'Assassin', 'Loyal Servant of Arthur', 'Loyal Servant of Arthur', 'Minion of Mordred'] },
            questResults: [], // true for success, false for fail
            currentQuest: 1,
            leaderIndex: 0,
            currentTeam: [],
            votes: {}, // socketId -> 'approve' | 'reject'
            questVotes: {}, // socketId -> 'success' | 'fail'
            rejectedVoteCount: 0 // track consecutive rejected teams
        };
        socket.join(roomCode);
        const lanIp = getLocalIpAddress();
        console.log('Room created successfully:', roomCode, 'Expected players:', config?.expectedPlayers, 'LAN IP:', lanIp);
        socket.emit('roomCreated', { roomCode, lanIp, port: PORT });
    });

    // Join Room (Player)
    socket.on('joinRoom', (payload) => {
        const data = (typeof payload === 'object' && payload !== null) ? payload : {};
        const playerName = (data.playerName || data.name || '').trim();
        const playerId = data.playerId;
        const { room, code } = findRoom(data.roomCode, socket);

        if (room) {
            socket.join(code);
            let existing = room.players.find(p => 
                (p.name && playerName && p.name.toLowerCase() === playerName.toLowerCase()) || 
                p.id === socket.id || 
                (playerId && p.id === playerId)
            );
            if (existing) {
                existing.id = socket.id;
                existing.name = playerName || existing.name;
                socket.emit('joined', { roomCode: code, playerName: existing.name });
                if (room.state !== 'LOBBY') {
                    if (existing.role) socket.emit('roleAssigned', existing.role);
                    const questList = QUEST_REQUIREMENTS[room.players.length] || QUEST_REQUIREMENTS[5];
                    socket.emit('gameStateChanged', {
                        state: room.state,
                        leader: room.players.length > 0 ? room.players[room.leaderIndex].name : 'None',
                        leaderId: room.players.length > 0 ? room.players[room.leaderIndex].id : null,
                        players: room.players.map(p => ({ id: p.id, name: p.name })),
                        rejectedVoteCount: room.rejectedVoteCount,
                        currentQuest: room.currentQuest,
                        requiredTeamSize: getRequiredTeamSize(room.players.length, room.currentQuest),
                        questRequirements: questList,
                        questResults: room.questResults,
                        proposedTeam: room.currentTeam ? room.players.filter(p => room.currentTeam.includes(p.id)).map(p => p.name) : [],
                        proposedTeamIds: room.currentTeam || []
                    });
                }
            } else if (room.state === 'LOBBY') {
                room.players.push({ id: socket.id, name: playerName, role: null });
                io.to(room.modId).emit('playerJoined', room.players);
                socket.emit('joined', { roomCode: code, playerName });
            } else {
                socket.emit('error', 'เกมได้เริ่มขึ้นแล้ว และไม่พบชื่อผู้เล่นในห้องนี้');
            }
        } else {
            socket.emit('error', 'ไม่พบห้องนี้ กรุณาตรวจสอบรหัสห้อง');
        }
    });

    // Simulate Bot (Test Bot for Mod testing)
    socket.on('simulateBot', (roomCode) => {
        const { room, code } = findRoom(roomCode, socket);
        if (room && socket.id === room.modId && room.state === 'LOBBY') {
            const expected = (room.config && room.config.expectedPlayers) || 5;
            if (room.players.length < expected) {
                const botNum = room.players.length + 1;
                const botNames = ['อาเธอร์', 'แลนสล็อต', 'เกเวน', 'เพอร์ซิวัล', 'ไตรสตัน', 'กาลาฮัด', 'บอร์ส', 'เคย์', 'เบดิเวียร์', 'โมเดร็ด'];
                const randomName = botNames[(botNum - 1) % botNames.length] + ' #' + botNum;
                const botId = 'bot_' + Math.random().toString(36).substr(2, 6);
                room.players.push({ id: botId, name: randomName, role: null });
                io.to(room.modId).emit('playerJoined', room.players);
            }
        }
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

function getRequiredTeamSize(playerCount, questNumber) {
    const list = QUEST_REQUIREMENTS[playerCount] || QUEST_REQUIREMENTS[5];
    return list[Math.min(questNumber - 1, 4)];
}

    // Start Game & Role Assignment
    socket.on('startGame', (roomCode) => {
        const { room, code } = findRoom(roomCode, socket);
        if (room && socket.id === room.modId && room.state === 'LOBBY') {
            room.state = 'ROLE_ASSIGNMENT';
            room.currentQuest = 1;
            room.questResults = [];
            room.rejectedVoteCount = 0;
            room.leaderIndex = 0;
            
            const playerCount = room.players.length;
            const questList = QUEST_REQUIREMENTS[playerCount] || QUEST_REQUIREMENTS[5];
            const requiredSize = questList[0];
            
            // Use configured roles, slice to player count if needed
            let roles = shuffle([...room.config.roles].slice(0, playerCount));
            while (roles.length < playerCount) { roles.push('Loyal Servant of Arthur'); }
            
            room.players.forEach((player, index) => {
                player.role = roles[index];
                io.to(player.id).emit('roleAssigned', player.role);
            });
            
            // Move to team building
            room.state = 'TEAM_BUILDING';
            io.to(code).emit('gameStateChanged', { 
                state: room.state, 
                leader: room.players.length > 0 ? room.players[room.leaderIndex].name : 'None',
                leaderId: room.players.length > 0 ? room.players[room.leaderIndex].id : null,
                players: room.players.map(p => ({ id: p.id, name: p.name })),
                rejectedVoteCount: room.rejectedVoteCount,
                currentQuest: room.currentQuest,
                requiredTeamSize: requiredSize,
                questRequirements: questList,
                questResults: room.questResults
            });

            handleBotLeaderTurn(room, code);
        }
    });

    // Handle Team Selection
    socket.on('proposeTeam', (payload) => {
        const data = (typeof payload === 'object' && payload !== null) ? payload : {};
        const { room, code } = findRoom(data.roomCode, socket);
        const team = data.team;
        if (!room || room.state !== 'TEAM_BUILDING' || !Array.isArray(team)) return;

        const currentLeader = room.players[room.leaderIndex];
        const isLeader = currentLeader && (
            currentLeader.id === socket.id ||
            (data.playerId && currentLeader.id === data.playerId) ||
            (data.playerName && currentLeader.name === data.playerName)
        );

        if (isLeader) {
            const playerCount = room.players.length;
            const questList = QUEST_REQUIREMENTS[playerCount] || QUEST_REQUIREMENTS[5];
            const requiredSize = getRequiredTeamSize(playerCount, room.currentQuest);
            
            if (team.length !== requiredSize) {
                socket.emit('error', `จำนวนผู้เล่นไม่ตรงตามเงื่อนไข (ต้องเลือก ${requiredSize} คนสำหรับ Quest ${room.currentQuest})`);
                return;
            }

            room.currentTeam = team;
            room.state = 'TEAM_VOTING';
            room.votes = {};

            const proposedNames = room.players.filter(p => team.includes(p.id)).map(p => p.name);
            
            io.to(code).emit('gameStateChanged', {
                state: room.state,
                proposedTeam: proposedNames,
                proposedTeamIds: team,
                leader: room.players[room.leaderIndex].name,
                leaderId: room.players[room.leaderIndex].id,
                currentQuest: room.currentQuest,
                requiredTeamSize: requiredSize,
                questRequirements: questList,
                rejectedVoteCount: room.rejectedVoteCount,
                players: room.players.map(p => ({ id: p.id, name: p.name }))
            });

            // Auto-vote for simulated bot players
            room.players.forEach(p => {
                if (p.id.startsWith('bot_')) {
                    room.votes[p.id] = 'approve';
                }
            });
            checkAndResolveTeamVote(room, code);
        }
    });

    // Autonomous Bot AI Handler for Solo Testing
    function handleBotLeaderTurn(room, roomCode) {
        if (!room || room.state !== 'TEAM_BUILDING' || room.players.length === 0) return;
        const currentLeader = room.players[room.leaderIndex];
        if (currentLeader && currentLeader.id.startsWith('bot_')) {
            setTimeout(() => {
                if (!room || room.state !== 'TEAM_BUILDING') return;
                const playerCount = room.players.length;
                const reqSize = getRequiredTeamSize(playerCount, room.currentQuest);
                
                // Bot Leader picks themselves + random players
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

                io.to(roomCode).emit('gameStateChanged', {
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
                });

                // Bots auto-vote Approve for team proposal
                room.players.forEach(p => {
                    if (p.id.startsWith('bot_')) {
                        room.votes[p.id] = 'approve';
                    }
                });

                checkAndResolveTeamVote(room, roomCode);
            }, 1800);
        }
    }

    function checkAndResolveTeamVote(room, roomCode) {
        if (Object.keys(room.votes).length >= room.players.length) {
            const approves = Object.values(room.votes).filter(v => v === 'approve').length;
            const isApproved = approves > room.players.length / 2;

            const voteDetails = room.players.map(p => ({
                id: p.id,
                name: p.name,
                vote: room.votes[p.id] || 'approve' // 'approve' or 'reject'
            }));

            const proposedNames = room.players.filter(p => room.currentTeam.includes(p.id)).map(p => p.name);

            // Determine next leader if rejected
            let potentialNextLeaderIndex = room.leaderIndex;
            let potentialRejectedCount = room.rejectedVoteCount;
            if (!isApproved) {
                potentialRejectedCount++;
                potentialNextLeaderIndex = (room.leaderIndex + 1) % room.players.length;
            }
            const nextLeaderName = room.players[potentialNextLeaderIndex]?.name || null;

            // Enter reveal state: Show who voted approve/reject FIRST!
            room.state = 'TEAM_VOTE_REVEAL';

            // Broadcast Vote Results breakdown to everyone
            io.to(roomCode).emit('teamVoteResult', {
                approved: isApproved,
                approvesCount: approves,
                rejectsCount: room.players.length - approves,
                voteDetails,
                proposedTeam: proposedNames,
                nextLeader: nextLeaderName,
                rejectedVoteCount: potentialRejectedCount,
                currentQuest: room.currentQuest,
                revealDuration: 4
            });

            // Hold on screen for 4.5 seconds so everyone can see the result popup, then proceed!
            if (room.voteRevealTimer) clearTimeout(room.voteRevealTimer);
            room.voteRevealTimer = setTimeout(() => {
                proceedAfterVoteReveal(room, roomCode, isApproved);
            }, 4500);
        }
    }

    function proceedAfterVoteReveal(room, roomCode, isApproved) {
        if (!room || room.state !== 'TEAM_VOTE_REVEAL') return;
        if (room.voteRevealTimer) {
            clearTimeout(room.voteRevealTimer);
            room.voteRevealTimer = null;
        }

        const playerCount = room.players.length;
        const questList = QUEST_REQUIREMENTS[playerCount] || QUEST_REQUIREMENTS[5];

        if (isApproved) {
            room.state = 'QUEST_EXECUTION';
            room.questVotes = {};
            room.rejectedVoteCount = 0;

            const requiredSize = getRequiredTeamSize(playerCount, room.currentQuest);

            io.to(roomCode).emit('gameStateChanged', {
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
            });

            // Notify quest members to popup action modal
            io.to(roomCode).emit('startQuest', { 
                team: room.currentTeam, 
                currentQuest: room.currentQuest 
            });

            // Auto-vote for bot players on the quest team
            setTimeout(() => {
                if (room.state !== 'QUEST_EXECUTION') return;
                room.currentTeam.forEach(memberId => {
                    if (memberId.startsWith('bot_') && !room.questVotes[memberId]) {
                        const botPlayer = room.players.find(p => p.id === memberId);
                        const isEvil = botPlayer && ['Mordred', 'Morgana', 'Assassin', 'Oberon', 'Other Evil 1', 'Other Evil 2', 'Minion'].some(r => (botPlayer.role || '').includes(r));
                        room.questVotes[memberId] = (isEvil && Math.random() < 0.5) ? 'fail' : 'success';
                    }
                });
                checkAndResolveQuest(room, roomCode);
            }, 2000);

        } else {
            room.rejectedVoteCount++;
            if (room.rejectedVoteCount >= 5) {
                room.state = 'GAME_OVER';
                io.to(roomCode).emit('gameOver', {
                    winner: 'EVIL',
                    reason: 'VOTES_REJECTED_5',
                    questHistory: room.questResults,
                    rejectedVoteCount: room.rejectedVoteCount
                });
            } else {
                room.leaderIndex = (room.leaderIndex + 1) % room.players.length;
                room.state = 'TEAM_BUILDING';
            }

            const nextLeader = (room.state === 'GAME_OVER' || room.players.length === 0) ? null : room.players[room.leaderIndex].name;
            const nextLeaderId = (room.state === 'GAME_OVER' || room.players.length === 0) ? null : room.players[room.leaderIndex].id;
            const requiredSize = getRequiredTeamSize(playerCount, room.currentQuest);

            io.to(roomCode).emit('gameStateChanged', {
                state: room.state,
                leader: nextLeader,
                leaderId: nextLeaderId,
                currentTeam: [],
                currentQuest: room.currentQuest,
                requiredTeamSize: requiredSize,
                questRequirements: questList,
                rejectedVoteCount: room.rejectedVoteCount,
                questResults: room.questResults
            });

            if (room.state === 'TEAM_BUILDING') {
                handleBotLeaderTurn(room, roomCode);
            }
        }
    }

    // Client can skip the 4s reveal timer if ready
    socket.on('skipVoteReveal', (roomCode) => {
        const { room, code } = findRoom(roomCode, socket);
        if (room && room.state === 'TEAM_VOTE_REVEAL') {
            const approves = Object.values(room.votes).filter(v => v === 'approve').length;
            const isApproved = approves > room.players.length / 2;
            proceedAfterVoteReveal(room, code, isApproved);
        }
    });

    // Handle Team Voting (Support both voteTeam and voteTeamSubmit)
    const handleVoteTeam = (payload) => {
        const data = (typeof payload === 'object' && payload !== null) ? payload : { vote: payload };
        const { room, code } = findRoom(data.roomCode, socket);
        if (room && room.state === 'TEAM_VOTING') {
            const voter = room.players.find(p => 
                p.id === socket.id || 
                (data.playerId && p.id === data.playerId) || 
                (data.playerName && p.name === data.playerName)
            );
            const voterId = voter ? voter.id : socket.id;
            room.votes[voterId] = data.vote;
            console.log(`[VoteTeam] Room ${code}: vote from ${voter ? voter.name : voterId} = ${data.vote} (${Object.keys(room.votes).length}/${room.players.length})`);
            checkAndResolveTeamVote(room, code);
        }
    };
    socket.on('voteTeam', handleVoteTeam);
    socket.on('voteTeamSubmit', handleVoteTeam);

    function checkAndResolveQuest(room, roomCode) {
        if (Object.keys(room.questVotes).length >= room.currentTeam.length) {
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

            // Broadcast quest result: Blue (All Success) vs Red (Has Fail)
            io.to(roomCode).emit('questResult', {
                questNumber: finishedQuest,
                success: isSuccess,
                allSuccess: fails === 0,
                fails,
                history: room.questResults,
                rejectedVoteCount: room.rejectedVoteCount,
                nextLeader
            });

            const goodPlayers = room.players
                .filter(p => isGoodRole(p.role))
                .map(p => ({ id: p.id, name: p.name }));

            io.to(roomCode).emit('gameStateChanged', {
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
            });

            if (room.state === 'ASSASSINATION') {
                // Send assassination phase to Assassin
                io.to(assassinPlayer.id).emit('assassinationPhase', {
                    goodPlayers,
                    assassinName: assassinPlayer.name
                });

                // Auto-resolve if Assassin is a bot
                if (assassinPlayer.id.startsWith('bot_')) {
                    setTimeout(() => {
                        if (room.state !== 'ASSASSINATION') return;
                        const randomTarget = goodPlayers[Math.floor(Math.random() * goodPlayers.length)];
                        if (randomTarget) {
                            resolveAssassination(room, roomCode, randomTarget.id);
                        }
                    }, 2500);
                }
            } else if (room.state === 'GAME_OVER') {
                const winner = goodWins ? 'GOOD' : 'EVIL';
                const reason = goodWins 
                    ? 'QUESTS_SUCCESS_3' 
                    : (evilWins ? 'QUESTS_FAIL_3' : (room.rejectedVoteCount >= 5 ? 'VOTES_REJECTED_5' : 'GAME_OVER'));
                io.to(roomCode).emit('gameOver', {
                    winner,
                    reason,
                    questHistory: room.questResults,
                    rejectedVoteCount: room.rejectedVoteCount
                });
            } else if (room.state === 'TEAM_BUILDING') {
                handleBotLeaderTurn(room, roomCode);
            }
        }
    }

    function resolveAssassination(room, roomCode, targetId) {
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

        io.to(roomCode).emit('gameStateChanged', {
            state: 'GAME_OVER',
            leader: null,
            questResults: room.questResults,
            rejectedVoteCount: room.rejectedVoteCount
        });

        io.to(roomCode).emit('gameOver', gameOverPayload);
    }

    // Handle Assassin Target Selection
    socket.on('assassinateTarget', (payload) => {
        const data = (typeof payload === 'object' && payload !== null) ? payload : {};
        const { room, code } = findRoom(data.roomCode, socket);
        if (room && room.state === 'ASSASSINATION') {
            const assassin = room.players.find(p => p.role && p.role.includes('Assassin'));
            const isAssassin = assassin && (
                assassin.id === socket.id || 
                (data.playerId && assassin.id === data.playerId) || 
                (data.playerName && assassin.name === data.playerName)
            );
            if (isAssassin) {
                resolveAssassination(room, code, data.targetId);
            }
        }
    });

    // Handle Quest Execution (Support both voteQuest and questVoteSubmit)
    const handleVoteQuest = (payload) => {
        const data = (typeof payload === 'object' && payload !== null) ? payload : { vote: payload };
        const { room, code } = findRoom(data.roomCode, socket);
        if (!room || room.state !== 'QUEST_EXECUTION') return;

        const voter = room.players.find(p => 
            p.id === socket.id || 
            (data.playerId && p.id === data.playerId) || 
            (data.playerName && p.name === data.playerName)
        );
        const voterId = voter ? voter.id : socket.id;

        const isInTeam = room.currentTeam.some(id => 
            id === voterId || 
            id === socket.id || 
            (data.playerId && id === data.playerId) ||
            (voter && id === voter.id)
        );

        if (isInTeam) {
            room.questVotes[voterId] = data.vote;
            console.log(`[QuestVote] Room ${code}: vote from ${voter ? voter.name : voterId} = ${data.vote} (${Object.keys(room.questVotes).length}/${room.currentTeam.length})`);
            checkAndResolveQuest(room, code);
        }
    };
    socket.on('voteQuest', handleVoteQuest);
    socket.on('questVoteSubmit', handleVoteQuest);

    // Reset Room & Return all players to Home Screen
    socket.on('resetRoom', (roomCode) => {
        const { room, code } = findRoom(roomCode, socket);
        if (room) {
            console.log(`Resetting room: ${code}`);
            io.to(code).emit('roomReset');
            delete rooms[code];
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        // Handle reconnects/disconnects logic later
    });
});

server.listen(PORT, '0.0.0.0', () => {
    const localIp = getLocalIpAddress();
    console.log(`Server listening on port ${PORT}`);
    console.log(`Local Access URL:   http://localhost:${PORT}`);
    console.log(`Network Access URL: http://${localIp}:${PORT}`);
});
