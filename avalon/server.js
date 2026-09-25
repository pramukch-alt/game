const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

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

// Game State Storage
const rooms = {};

// Helper: Generate Random Room Code (e.g. AV-4814)
function generateRoomCode() {
    return 'AV-' + Math.floor(1000 + Math.random() * 9000).toString();
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

// Game FSM States: LOBBY, ROLE_ASSIGNMENT, TEAM_BUILDING, TEAM_VOTING, QUEST_EXECUTION, GAME_OVER

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Create Room (Mod)
    socket.on('createRoom', (config) => {
        const roomCode = generateRoomCode();
        rooms[roomCode] = {
            modId: socket.id,
            players: [], // { id, name, role }
            state: 'LOBBY',
            config: config || { expectedPlayers: 5, roles: ['Merlin', 'Assassin', 'Loyal Servant 1', 'Loyal Servant 2', 'Other Evil 1'] },
            questResults: [], // true for success, false for fail
            currentQuest: 1,
            leaderIndex: 0,
            currentTeam: [],
            votes: {}, // socketId -> 'approve' | 'reject'
            questVotes: {}, // socketId -> 'success' | 'fail'
            rejectedVoteCount: 0 // track consecutive rejected teams
        };
        socket.join(roomCode);
        console.log('Room created successfully:', roomCode, 'Expected players:', config?.expectedPlayers);
        socket.emit('roomCreated', roomCode);
    });

    // Join Room (Player)
    socket.on('joinRoom', ({ roomCode, playerName }) => {
        let code = (roomCode || '').trim().toUpperCase();
        if (!code.startsWith('AV-') && rooms['AV-' + code]) {
            code = 'AV-' + code;
        }
        const room = rooms[code];
        if (room && room.state === 'LOBBY') {
            socket.join(code);
            room.players.push({ id: socket.id, name: playerName, role: null });
            
            // Notify Mod & Player
            io.to(room.modId).emit('playerJoined', room.players);
            socket.emit('joined', { roomCode: code, playerName });
        } else {
            socket.emit('error', 'ไม่พบห้องนี้ หรือเกมได้เริ่มขึ้นแล้ว');
        }
    });

    // Simulate Bot (Test Bot for Mod testing)
    socket.on('simulateBot', (roomCode) => {
        const room = rooms[roomCode];
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
        const room = rooms[roomCode];
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
            while (roles.length < playerCount) { roles.push('Loyal Servant'); }
            
            room.players.forEach((player, index) => {
                player.role = roles[index];
                io.to(player.id).emit('roleAssigned', player.role);
            });
            
            // Move to team building
            room.state = 'TEAM_BUILDING';
            io.to(roomCode).emit('gameStateChanged', { 
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

            handleBotLeaderTurn(room, roomCode);
        }
    });

    // Handle Team Selection
    socket.on('proposeTeam', ({ roomCode, team }) => {
        const room = rooms[roomCode];
        if (room && room.state === 'TEAM_BUILDING' && room.players[room.leaderIndex].id === socket.id) {
            const playerCount = room.players.length;
            const questList = QUEST_REQUIREMENTS[playerCount] || QUEST_REQUIREMENTS[5];
            const requiredSize = getRequiredTeamSize(playerCount, room.currentQuest);
            
            if (!team || team.length !== requiredSize) {
                socket.emit('error', `จำนวนผู้เล่นไม่ตรงตามเงื่อนไข (ต้องเลือก ${requiredSize} คนสำหรับ Quest ${room.currentQuest})`);
                return;
            }

            room.currentTeam = team;
            room.state = 'TEAM_VOTING';
            room.votes = {};

            const proposedNames = room.players.filter(p => team.includes(p.id)).map(p => p.name);
            
            io.to(roomCode).emit('gameStateChanged', {
                state: room.state,
                proposedTeam: proposedNames,
                proposedTeamIds: team,
                leader: room.players[room.leaderIndex].name,
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
            checkAndResolveTeamVote(room, roomCode);
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
        if (Object.keys(room.votes).length === room.players.length) {
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
        const room = rooms[roomCode];
        if (room && room.state === 'TEAM_VOTE_REVEAL') {
            const approves = Object.values(room.votes).filter(v => v === 'approve').length;
            const isApproved = approves > room.players.length / 2;
            proceedAfterVoteReveal(room, roomCode, isApproved);
        }
    });

    // Handle Team Voting (Support both voteTeam and voteTeamSubmit)
    const handleVoteTeam = ({ roomCode, vote }) => {
        const room = rooms[roomCode];
        if (room && room.state === 'TEAM_VOTING') {
            room.votes[socket.id] = vote;
            checkAndResolveTeamVote(room, roomCode);
        }
    };
    socket.on('voteTeam', handleVoteTeam);
    socket.on('voteTeamSubmit', handleVoteTeam);

    function checkAndResolveQuest(room, roomCode) {
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

            if (goodWins || evilWins || room.currentQuest > 5) {
                room.state = 'GAME_OVER';
            } else {
                room.state = 'TEAM_BUILDING';
            }

            const nextLeader = (room.state === 'GAME_OVER' || room.players.length === 0) ? null : room.players[room.leaderIndex].name;
            const nextLeaderId = (room.state === 'GAME_OVER' || room.players.length === 0) ? null : room.players[room.leaderIndex].id;
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

            io.to(roomCode).emit('gameStateChanged', {
                state: room.state,
                leader: nextLeader,
                leaderId: nextLeaderId,
                questResults: room.questResults,
                lastQuestSuccess: isSuccess,
                currentQuest: room.currentQuest,
                requiredTeamSize: requiredSize,
                questRequirements: questList,
                rejectedVoteCount: room.rejectedVoteCount
            });

            if (room.state === 'GAME_OVER') {
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

    // Handle Quest Execution (Support both voteQuest and questVoteSubmit)
    const handleVoteQuest = ({ roomCode, vote }) => {
        const room = rooms[roomCode];
        if (room && room.state === 'QUEST_EXECUTION' && room.currentTeam.includes(socket.id)) {
            room.questVotes[socket.id] = vote;
            checkAndResolveQuest(room, roomCode);
        }
    };
    socket.on('voteQuest', handleVoteQuest);
    socket.on('questVoteSubmit', handleVoteQuest);

    // Reset Room & Return all players to Home Screen
    socket.on('resetRoom', (roomCode) => {
        if (roomCode && rooms[roomCode]) {
            console.log(`Resetting room: ${roomCode}`);
            io.to(roomCode).emit('roomReset');
            delete rooms[roomCode];
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        // Handle reconnects/disconnects logic later
    });
});

server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
