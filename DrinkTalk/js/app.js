/**
 * DrinkTalk - Interactive Party Game Engine
 * Features:
 * - 3D Card Flip Animation (0.6s smooth cubic-bezier)
 * - Synthesized Audio Engine (Web Audio API - 100% offline & zero lag)
 * - Dynamic Player Roulette / Randomizer with Light-Cycle effect
 * - Confetti particle bursts for special cards & deep questions
 * - Category filters: ทั่วไป, Deep Talk, Dirty Talk, Mix (รวมฮิต)
 * - LocalStorage state preservation
 */

// -------------------------------------------------------------
// 1. SOUND SYNTHESIS ENGINE (Web Audio API)
// -------------------------------------------------------------
class SoundEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playFlip() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(260, now);
      osc.frequency.exponentialRampToValueAtTime(70, now + 0.18);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(800, now);
      filter.frequency.linearRampToValueAtTime(150, now + 0.18);

      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.18);
    } catch (e) {
      console.warn('Audio error:', e);
    }
  }

  playTick() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(400, now + 0.04);

      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.04);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.04);
    } catch (e) {}
  }

  playWin() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    try {
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
      notes.forEach((freq, idx) => {
        const now = this.ctx.currentTime + idx * 0.08;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.4);
      });
    } catch (e) {}
  }

  playCheers() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    try {
      // Bell-like glass resonance
      const now = this.ctx.currentTime;
      const freqs = [1800, 2200, 3200];
      freqs.forEach(f => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, now);

        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.6);
      });
    } catch (e) {}
  }

  playClick() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1000, now);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.03);
    } catch (e) {}
  }
}

// -------------------------------------------------------------
// 2. MAIN APPLICATION CONTROLLER
// -------------------------------------------------------------
class DrinkTalkApp {
  constructor() {
    this.sound = new SoundEngine();

    // Default Configuration & State
    this.state = {
      view: 'mode-selection', // 'mode-selection' or 'game-room'
      currentCategory: 'Mix',
      includeSpecialCards: true,
      autoRandomTarget: false,
      players: this.loadPlayers(),
      currentTarget: null,
      deck: [],
      drawnHistory: [],
      currentCard: null,
      isFlipped: false,
      isAnimating: false,
      soundEnabled: true
    };

    // Fallback pool when no custom players exist
    this.fallbackTargets = [
      'คนทางซ้ายของคนจั่ว',
      'คนทางขวาของคนจั่ว',
      'คนตรงข้ามคนจั่ว',
      'คนจั่วเอง!',
      'คนที่แก้วเหล้าเต็มที่สุด',
      'คนที่แก้วเหล้าพร่องที่สุด',
      'คนที่เสื้อสีเข้มที่สุด',
      'คนที่หน้าตาดีที่สุดในโต๊ะ',
      'คนที่พูดเก่งที่สุดในค่ำคืนนี้'
    ];

    this.initDOM();
    this.bindEvents();
    this.renderPlayersList();
  }

  loadPlayers() {
    try {
      const stored = localStorage.getItem('drinktalk_players');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return ['ผู้เล่น 1', 'ผู้เล่น 2', 'ผู้เล่น 3'];
  }

  savePlayers() {
    try {
      localStorage.setItem('drinktalk_players', JSON.stringify(this.state.players));
    } catch (e) {}
  }

  initDOM() {
    // Views
    this.modeSelectionView = document.getElementById('modeSelectionView');
    this.gameRoomView = document.getElementById('gameRoomView');

    // 3D Card
    this.cardContainer = document.getElementById('cardContainer');
    this.cardFront = document.getElementById('cardFront');
    this.cardCategoryBadge = document.getElementById('cardCategoryBadge');
    this.cardNumberBadge = document.getElementById('cardNumberBadge');
    this.cardQuestionText = document.getElementById('cardQuestionText');
    this.cardActionHint = document.getElementById('cardActionHint');
    this.cardSpecialIcon = document.getElementById('cardSpecialIcon');
    this.cardTargetBox = document.getElementById('cardTargetBox');
    this.cardTargetName = document.getElementById('cardTargetName');

    // Header & Info
    this.gameCategoryTitle = document.getElementById('gameCategoryTitle');
    this.deckCounterBadge = document.getElementById('deckCounterBadge');
    this.targetBanner = document.getElementById('targetBanner');
    this.targetBannerName = document.getElementById('targetBannerName');

    // Buttons
    this.btnDrawNext = document.getElementById('btnDrawNext');
    this.btnRandomTarget = document.getElementById('btnRandomTarget');
    this.btnFlipCard = document.getElementById('btnFlipCard');
    this.btnBackToMenu = document.getElementById('btnBackToMenu');
    this.btnReshuffle = document.getElementById('btnReshuffle');
    this.btnSoundToggle = document.getElementById('btnSoundToggle');
    this.btnFullscreenToggle = document.getElementById('btnFullscreenToggle');
    this.btnManagePlayers = document.getElementById('btnManagePlayers');
    this.btnHistory = document.getElementById('btnHistory');

    // Modals
    this.playersModal = document.getElementById('playersModal');
    this.historyModal = document.getElementById('historyModal');
    this.rouletteOverlay = document.getElementById('rouletteOverlay');
    this.rouletteNameDisplay = document.getElementById('rouletteNameDisplay');
    this.rulesModal = document.getElementById('rulesModal');

    // Form inputs
    this.playerInput = document.getElementById('playerInput');
    this.btnAddPlayer = document.getElementById('btnAddPlayer');
    this.playersListContainer = document.getElementById('playersListContainer');
    this.modalPlayerInput = document.getElementById('modalPlayerInput');
    this.btnModalAddPlayer = document.getElementById('btnModalAddPlayer');
    this.modalPlayersListContainer = document.getElementById('modalPlayersListContainer');
    this.btnModalQuickPresets = document.getElementById('btnModalQuickPresets');
    this.specialCardsToggle = document.getElementById('specialCardsToggle');
    this.autoTargetToggle = document.getElementById('autoTargetToggle');
  }

  bindEvents() {
    // Category Selection Cards
    document.querySelectorAll('.btn-category-select').forEach(card => {
      card.addEventListener('click', (e) => {
        const cat = card.getAttribute('data-category');
        this.selectCategoryAndStart(cat);
      });
    });

    // Special Cards & Auto Target Toggles
    if (this.specialCardsToggle) {
      this.specialCardsToggle.addEventListener('change', (e) => {
        this.state.includeSpecialCards = e.target.checked;
      });
    }
    if (this.autoTargetToggle) {
      this.autoTargetToggle.addEventListener('change', (e) => {
        this.state.autoRandomTarget = e.target.checked;
      });
    }

    // Card Interaction (Touch Swipe & Click for Mobile & iPad)
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;

    this.cardContainer.addEventListener('touchstart', (e) => {
      if (e.touches && e.touches.length > 0) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touchStartTime = Date.now();
      }
    }, { passive: true });

    this.cardContainer.addEventListener('touchend', (e) => {
      if (!touchStartX) return;
      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;
      const diffX = touchEndX - touchStartX;
      const diffY = touchEndY - touchStartY;
      const elapsed = Date.now() - touchStartTime;

      // Swipe detected (horizontal swipe > 45px or upward swipe < -45px)
      if (elapsed < 600 && (Math.abs(diffX) > 45 || diffY < -45)) {
        this.triggerHaptic(35);
        this.drawNextCard();
      } else if (Math.abs(diffX) < 15 && Math.abs(diffY) < 15) {
        // Clean tap
        this.handleCardClick();
      }
      touchStartX = 0;
    }, { passive: true });

    this.cardContainer.addEventListener('click', () => {
      // Desktop / mouse click fallback
      if (window.matchMedia('(pointer: fine)').matches) {
        this.handleCardClick();
      }
    });

    // Action Controls
    this.btnDrawNext.addEventListener('click', () => {
      this.triggerHaptic(25);
      this.drawNextCard();
    });

    this.btnRandomTarget.addEventListener('click', () => {
      this.triggerHaptic(30);
      this.runExcitingRoulette();
    });

    this.btnFlipCard.addEventListener('click', () => {
      this.triggerHaptic(20);
      this.toggleFlip();
    });

    this.btnBackToMenu.addEventListener('click', () => {
      this.showModeSelection();
    });

    this.btnReshuffle.addEventListener('click', () => {
      this.reshuffleCurrentDeck();
    });

    this.btnSoundToggle.addEventListener('click', () => {
      this.toggleSound();
    });

    if (this.btnFullscreenToggle) {
      this.btnFullscreenToggle.addEventListener('click', () => {
        this.toggleFullscreen();
      });
    }

    // Player Modal
    this.btnManagePlayers.addEventListener('click', () => {
      this.openPlayersModal();
    });

    document.getElementById('btnClosePlayersModal').addEventListener('click', () => {
      this.closePlayersModal();
    });

    this.btnAddPlayer.addEventListener('click', () => {
      this.addNewPlayer();
    });

    this.playerInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.addNewPlayer();
      }
    });

    document.getElementById('btnClearAllPlayers').addEventListener('click', () => {
      this.clearAllPlayers();
    });

    document.getElementById('btnQuickAddPresets').addEventListener('click', () => {
      this.quickAddPresets();
    });

    if (this.btnModalAddPlayer) {
      this.btnModalAddPlayer.addEventListener('click', () => {
        this.addNewPlayerFromModal();
      });
    }

    if (this.modalPlayerInput) {
      this.modalPlayerInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          this.addNewPlayerFromModal();
        }
      });
    }

    if (this.btnModalQuickPresets) {
      this.btnModalQuickPresets.addEventListener('click', () => {
        this.quickAddPresets();
      });
    }

    // History Modal
    this.btnHistory.addEventListener('click', () => {
      this.openHistoryModal();
    });
    document.getElementById('btnCloseHistoryModal').addEventListener('click', () => {
      this.historyModal.classList.add('hidden');
    });

    // Rules Modal
    document.getElementById('btnOpenRules').addEventListener('click', () => {
      this.rulesModal.classList.remove('hidden');
    });
    document.getElementById('btnCloseRules').addEventListener('click', () => {
      this.rulesModal.classList.add('hidden');
    });

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      if (this.state.view !== 'game-room') return;
      if (e.code === 'Space' || e.code === 'ArrowRight') {
        e.preventDefault();
        this.drawNextCard();
      } else if (e.key.toLowerCase() === 'r') {
        e.preventDefault();
        this.runExcitingRoulette();
      } else if (e.key.toLowerCase() === 'f') {
        e.preventDefault();
        this.toggleFlip();
      }
    });
  }

  // -------------------------------------------------------------
  // DECK MANAGEMENT & INITIALIZATION
  // -------------------------------------------------------------
  selectCategoryAndStart(category) {
    this.sound.playClick();
    this.state.currentCategory = category;
    this.buildDeck(category);
    this.showGameRoom();
    // Auto-draw the first card for immediate excitement
    setTimeout(() => {
      this.drawNextCard();
    }, 400);
  }

  buildDeck(category) {
    const rawData = window.DRINKTALK_QUESTIONS || {};
    let cards = [];

    if (category === 'Mix') {
      // Combine all 3 main categories
      const gen = rawData['ทั่วไป'] || [];
      const deep = rawData['Deep Talk'] || [];
      const dirty = rawData['Dirty Talk'] || [];
      cards = [...gen, ...deep, ...dirty];

      // Include Special Cards if enabled
      if (this.state.includeSpecialCards && rawData['Special Cards']) {
        cards = [...cards, ...rawData['Special Cards']];
      }
    } else {
      cards = [...(rawData[category] || [])];
      // In single category mode, if user explicitly requested special cards
      if (this.state.includeSpecialCards && rawData['Special Cards']) {
        // Add 5 special cards randomly into the single mode deck
        const shuffledSpecial = [...rawData['Special Cards']].sort(() => Math.random() - 0.5).slice(0, 5);
        cards = [...cards, ...shuffledSpecial];
      }
    }

    // Fisher-Yates Shuffle
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }

    this.state.deck = cards;
    this.state.drawnHistory = [];
    this.state.currentCard = null;
    this.state.isFlipped = false;
    this.cardContainer.classList.remove('is-flipped');
  }

  reshuffleCurrentDeck() {
    this.sound.playFlip();
    this.buildDeck(this.state.currentCategory);
    this.updateDeckCounter();
    this.cardContainer.classList.remove('is-flipped');
    this.state.isFlipped = false;
    this.resetTargetDisplay();
    this.showToast('สับกองไพ่ใหม่เรียบร้อยแล้ว! 🎲');
  }

  // -------------------------------------------------------------
  // CARD DRAW & 3D FLIP MECHANISM
  // -------------------------------------------------------------
  handleCardClick() {
    if (this.state.isAnimating) return;
    if (!this.state.isFlipped) {
      if (!this.state.currentCard) {
        this.drawNextCard();
      } else {
        this.flipToFront();
      }
    } else {
      this.toggleFlip();
    }
  }

  toggleFlip() {
    if (this.state.isAnimating) return;
    this.sound.playFlip();
    if (this.state.isFlipped) {
      this.cardContainer.classList.remove('is-flipped');
      this.state.isFlipped = false;
    } else {
      this.cardContainer.classList.add('is-flipped');
      this.state.isFlipped = true;
    }
  }

  flipToFront() {
    this.sound.playFlip();
    this.cardContainer.classList.add('is-flipped');
    this.state.isFlipped = true;
  }

  drawNextCard() {
    if (this.state.isAnimating) return;

    if (this.state.deck.length === 0) {
      this.handleEmptyDeck();
      return;
    }

    this.state.isAnimating = true;

    // If card is already flipped forward, flip back first then flip to new card
    if (this.state.isFlipped) {
      this.sound.playFlip();
      this.cardContainer.classList.remove('is-flipped');
      this.state.isFlipped = false;

      setTimeout(() => {
        this.pickAndRenderNextCard();
        setTimeout(() => {
          this.flipToFront();
          this.checkCardTriggers();
          this.state.isAnimating = false;
        }, 150);
      }, 300);
    } else {
      this.pickAndRenderNextCard();
      setTimeout(() => {
        this.flipToFront();
        this.checkCardTriggers();
        this.state.isAnimating = false;
      }, 100);
    }
  }

  pickAndRenderNextCard() {
    const card = this.state.deck.pop();
    this.state.currentCard = card;
    this.state.drawnHistory.unshift(card);

    // Reset target if auto-pick is not on
    if (this.state.autoRandomTarget) {
      this.pickImmediateTarget();
    } else {
      this.resetTargetDisplay();
    }

    this.renderCardFront(card);
    this.updateDeckCounter();
  }

  renderCardFront(card) {
    // Reset category theme classes
    this.cardFront.className = 'card-face card-front';

    const category = card.category;
    let themeClass = 'theme-general';
    let badgeBg = 'bg-cyan-500/20 text-cyan-300 border-cyan-400/40';
    let badgeText = category;

    if (card.isSpecial) {
      themeClass = 'theme-special';
      badgeBg = 'bg-amber-500/20 text-amber-300 border-amber-400/40';
      badgeText = card.badge || 'การ์ดพิเศษ';
    } else if (category === 'Deep Talk') {
      themeClass = 'theme-deep';
      badgeBg = 'bg-purple-500/20 text-purple-300 border-purple-400/40';
    } else if (category === 'Dirty Talk') {
      themeClass = 'theme-dirty';
      badgeBg = 'bg-pink-500/20 text-pink-300 border-pink-400/40';
    }

    this.cardFront.classList.add(themeClass);

    // Badge & Number
    this.cardCategoryBadge.className = `px-3 py-1 rounded-full text-xs font-semibold border backdrop-blur-md ${badgeBg}`;
    this.cardCategoryBadge.textContent = badgeText;
    this.cardNumberBadge.textContent = `#${card.id}`;

    // Special Icon
    if (card.isSpecial) {
      this.cardSpecialIcon.classList.remove('hidden');
      this.cardSpecialIcon.textContent = card.icon || '⚡';
      if (card.type === 'drink') {
        this.cardActionHint.innerHTML = `<span class="text-cyan-400 font-bold">🍺 กติกาดริ๊งก์:</span> ยกแก้วตามคำสั่ง แล้วส่งต่อ!`;
      } else if (card.type === 'minigame') {
        this.cardActionHint.innerHTML = `<span class="text-amber-400 font-bold">🎯 มินิเกมปาร์ตี้:</span> ทำโจทย์ทันที ใครแพ้ดื่ม!`;
      } else {
        this.cardActionHint.innerHTML = `<span class="text-purple-400 font-bold">🔄 คำสั่งพลิกเกม:</span> บังคับใช้ทันที!`;
      }
    } else {
      this.cardSpecialIcon.classList.add('hidden');
      if (category === 'Deep Talk') {
        this.cardActionHint.innerHTML = `🌙 <span class="text-purple-300 font-medium">เปิดใจเล่าอย่างจริงใจ หรือเลือกดื่ม 1 อึก!</span>`;
      } else if (category === 'Dirty Talk') {
        this.cardActionHint.innerHTML = `💋 <span class="text-pink-300 font-medium">ตอบให้สุด ชวนเขิน หรือโดนดื่ม 2 อึก!</span>`;
      } else {
        this.cardActionHint.innerHTML = `🍸 <span class="text-cyan-300 font-medium">ใครตอบไม่ได้ หรือไม่อยากตอบ ดื่ม 1 Drink!</span>`;
      }
    }

    // Main Question / Prompt
    this.cardQuestionText.textContent = card.text;
  }

  checkCardTriggers() {
    const card = this.state.currentCard;
    if (!card) return;

    if (card.isSpecial) {
      if (card.type === 'drink') {
        this.sound.playCheers();
      } else {
        this.sound.playWin();
      }
      this.triggerConfetti('burst');
    } else if (card.category === 'Deep Talk' && Math.random() > 0.6) {
      this.triggerConfetti('subtle');
    }
  }

  handleEmptyDeck() {
    this.showToast('ไพ่ในหมวดนี้หมดแล้ว! กำลังสับไพ่ทั้งหมดใหม่อัตโนมัติ... 🔄');
    setTimeout(() => {
      this.reshuffleCurrentDeck();
      this.drawNextCard();
    }, 1200);
  }

  updateDeckCounter() {
    const remaining = this.state.deck.length;
    const drawn = this.state.drawnHistory.length;
    const total = remaining + drawn;
    this.deckCounterBadge.textContent = `จั่วแล้ว ${drawn} / ${total} ใบ (เหลือ ${remaining})`;
  }

  // -------------------------------------------------------------
  // EXCITING TARGET RANDOMIZER / ROULETTE
  // -------------------------------------------------------------
  pickImmediateTarget() {
    const pool = this.state.players.length > 0 ? this.state.players : this.fallbackTargets;
    const selected = pool[Math.floor(Math.random() * pool.length)];
    this.setTarget(selected);
  }

  runExcitingRoulette() {
    if (this.state.isAnimating) return;

    const pool = this.state.players.length > 0 ? this.state.players : this.fallbackTargets;
    if (pool.length === 0) return;

    this.state.isAnimating = true;
    this.rouletteOverlay.classList.remove('hidden');

    let speed = 50;
    let step = 0;
    const totalSteps = 28 + Math.floor(Math.random() * 8);

    const runStep = () => {
      step++;
      const randomName = pool[step % pool.length];
      this.rouletteNameDisplay.textContent = randomName;
      this.sound.playTick();
      this.triggerHaptic(12);

      if (step < totalSteps) {
        if (step > totalSteps - 10) {
          speed += 25; // Gradual slow down near the end
        } else if (step > totalSteps - 5) {
          speed += 50;
        }
        setTimeout(runStep, speed);
      } else {
        // Final winner
        const finalWinner = pool[Math.floor(Math.random() * pool.length)];
        this.rouletteNameDisplay.textContent = finalWinner;
        this.rouletteNameDisplay.classList.add('scale-125', 'text-pink-400');

        this.sound.playWin();
        this.triggerHaptic([40, 60, 100]);
        this.triggerConfetti('celebration');

        setTimeout(() => {
          this.setTarget(finalWinner);
          this.rouletteOverlay.classList.add('hidden');
          this.rouletteNameDisplay.classList.remove('scale-125', 'text-pink-400');
          this.state.isAnimating = false;
        }, 1200);
      }
    };

    runStep();
  }

  setTarget(name) {
    this.state.currentTarget = name;
    this.targetBanner.classList.remove('opacity-60');
    this.targetBanner.classList.add('glow-pink');
    this.targetBannerName.innerHTML = `🎯 ผู้รับคำถามข้อนี้: <span class="text-pink-400 font-extrabold text-base underline decoration-pink-500">${name}</span>`;

    // Also update on-card target display
    if (this.cardTargetBox && this.cardTargetName) {
      this.cardTargetBox.classList.remove('hidden');
      this.cardTargetName.textContent = name;
    }
  }

  resetTargetDisplay() {
    this.state.currentTarget = null;
    this.targetBanner.classList.remove('glow-pink');
    this.targetBanner.classList.add('opacity-80');
    this.targetBannerName.innerHTML = `👥 ใครตอบก็ได้ หรือกดปุ่ม <strong>"สุ่มคนในวง"</strong> ด้านล่าง`;

    if (this.cardTargetBox) {
      this.cardTargetBox.classList.add('hidden');
    }
  }

  // -------------------------------------------------------------
  // CONFETTI EFFECTS
  // -------------------------------------------------------------
  triggerConfetti(mode = 'burst') {
    if (typeof confetti !== 'function') return;

    if (mode === 'celebration') {
      confetti({
        particleCount: 80,
        spread: 100,
        origin: { y: 0.6 },
        colors: ['#FF2E93', '#7928CA', '#00F0FF', '#FFB800', '#FFFFFF']
      });
    } else if (mode === 'burst') {
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.7 },
        colors: ['#00F0FF', '#FF2E93', '#FFB800']
      });
    } else {
      // Subtle floaters
      confetti({
        particleCount: 20,
        spread: 45,
        startVelocity: 15,
        origin: { y: 0.8 },
        colors: ['#7928CA', '#FF2E93']
      });
    }
  }

  // -------------------------------------------------------------
  // PLAYER ROSTER MANAGEMENT
  // -------------------------------------------------------------
  renderPlayersList() {
    const containers = [this.playersListContainer, this.modalPlayersListContainer].filter(Boolean);

    containers.forEach(container => {
      container.innerHTML = '';
      if (this.state.players.length === 0) {
        container.innerHTML = `
          <div class="text-xs text-slate-400 text-center py-4">
            ยังไม่มีชื่อเพื่อนในวง (ระบบจะใช้การสุ่มตำแหน่ง เช่น คนซ้าย/ขวา/ตรงข้าม แทน)
          </div>
        `;
        return;
      }

      this.state.players.forEach((p, idx) => {
        const chip = document.createElement('div');
        chip.className = 'flex items-center justify-between px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700/60 text-sm text-slate-200';
        chip.innerHTML = `
          <span class="truncate mr-2 font-medium">👤 ${p}</span>
          <button class="text-slate-400 hover:text-pink-400 p-1 transition-colors" data-index="${idx}" title="ลบชื่อ">
            ✕
          </button>
        `;
        chip.querySelector('button').addEventListener('click', (e) => {
          const i = parseInt(e.currentTarget.getAttribute('data-index'), 10);
          this.removePlayer(i);
        });
        container.appendChild(chip);
      });
    });
  }

  addNewPlayer() {
    const val = this.playerInput.value.trim();
    if (!val) return;
    this.state.players.push(val);
    this.savePlayers();
    this.playerInput.value = '';
    this.renderPlayersList();
    this.sound.playClick();
  }

  addNewPlayerFromModal() {
    if (!this.modalPlayerInput) return;
    const val = this.modalPlayerInput.value.trim();
    if (!val) return;
    this.state.players.push(val);
    this.savePlayers();
    this.modalPlayerInput.value = '';
    this.renderPlayersList();
    this.sound.playClick();
  }

  removePlayer(index) {
    this.state.players.splice(index, 1);
    this.savePlayers();
    this.renderPlayersList();
    this.sound.playClick();
  }

  clearAllPlayers() {
    if (confirm('คุณต้องการลบรายชื่อผู้เล่นทั้งหมดหรือไม่?')) {
      this.state.players = [];
      this.savePlayers();
      this.renderPlayersList();
      this.sound.playClick();
    }
  }

  quickAddPresets() {
    const defaults = ['บอส', 'มายด์', 'เบียร์', 'เก้า', 'แพรว', 'เต้'];
    this.state.players = defaults;
    this.savePlayers();
    this.renderPlayersList();
    this.sound.playWin();
    this.showToast('เพิ่มรายชื่อตัวอย่าง 6 คนเรียบร้อยแล้ว!');
  }

  openPlayersModal() {
    this.sound.playClick();
    this.renderPlayersList();
    this.playersModal.classList.remove('hidden');
  }

  closePlayersModal() {
    this.playersModal.classList.add('hidden');
  }

  // -------------------------------------------------------------
  // HISTORY MODAL
  // -------------------------------------------------------------
  openHistoryModal() {
    this.sound.playClick();
    const container = document.getElementById('historyListContainer');
    container.innerHTML = '';

    if (this.state.drawnHistory.length === 0) {
      container.innerHTML = `<p class="text-xs text-slate-400 text-center py-6">ยังไม่มีไพ่ที่ถูกจั่วในรอบนี้</p>`;
    } else {
      this.state.drawnHistory.forEach((c, idx) => {
        const item = document.createElement('div');
        item.className = 'p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-start gap-3';
        item.innerHTML = `
          <div class="px-2 py-0.5 rounded text-[11px] font-bold ${c.isSpecial ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-slate-800 text-slate-300'}">
            #${c.id}
          </div>
          <div class="flex-1">
            <span class="text-[11px] font-medium text-pink-400 block mb-0.5">${c.category}</span>
            <p class="text-xs text-white leading-relaxed">${c.text}</p>
          </div>
        `;
        container.appendChild(item);
      });
    }

    this.historyModal.classList.remove('hidden');
  }

  // -------------------------------------------------------------
  // VIEW SWITCHING & TOASTS
  // -------------------------------------------------------------
  showModeSelection() {
    this.sound.playClick();
    this.state.view = 'mode-selection';
    this.gameRoomView.classList.add('hidden');
    this.modeSelectionView.classList.remove('hidden');
  }

  showGameRoom() {
    this.state.view = 'game-room';
    this.modeSelectionView.classList.add('hidden');
    this.gameRoomView.classList.remove('hidden');

    // Update Header Category title
    const categoryLabels = {
      'ทั่วไป': '🍸 หมวดทั่วไป (General)',
      'Deep Talk': '🌙 หมวด Deep Talk (เปิดใจ)',
      'Dirty Talk': '💋 หมวด Dirty Talk (แซ่บๆ)',
      'Mix': '🎲 หมวด Mix (รวมฮิต & พิเศษ)'
    };
    this.gameCategoryTitle.textContent = categoryLabels[this.state.currentCategory] || this.state.currentCategory;
  }

  toggleSound() {
    this.sound.enabled = !this.sound.enabled;
    this.state.soundEnabled = this.sound.enabled;
    const icon = document.getElementById('soundIcon');
    if (this.sound.enabled) {
      icon.textContent = '🔊';
      this.sound.playClick();
      this.showToast('เปิดเสียงเอฟเฟกต์แล้ว');
    } else {
      icon.textContent = '🔇';
      this.showToast('ปิดเสียงเอฟเฟกต์แล้ว');
    }
  }

  showToast(msg) {
    let toast = document.getElementById('gameToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'gameToast';
      toast.className = 'fixed bottom-20 left-1/2 transform -translate-x-1/2 bg-slate-900/90 text-white border border-pink-500/40 px-4 py-2 rounded-xl text-xs shadow-2xl backdrop-blur-md z-50 transition-opacity duration-300 pointer-events-none opacity-0';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.remove('opacity-0');
    toast.classList.add('opacity-100');

    clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      toast.classList.remove('opacity-100');
      toast.classList.add('opacity-0');
    }, 2200);
  }

  // -------------------------------------------------------------
  // MOBILE & IPAD UTILITIES (Haptics & Fullscreen)
  // -------------------------------------------------------------
  triggerHaptic(pattern = 25) {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(pattern);
      } catch (e) {}
    }
  }

  toggleFullscreen() {
    this.sound.playClick();
    this.triggerHaptic(20);
    const doc = document;
    const docEl = doc.documentElement;
    const requestFs = docEl.requestFullscreen || docEl.webkitRequestFullscreen || docEl.msRequestFullscreen;
    const exitFs = doc.exitFullscreen || doc.webkitExitFullscreen || doc.msExitFullscreen;
    const isFs = doc.fullscreenElement || doc.webkitFullscreenElement;

    if (!isFs) {
      if (requestFs) {
        requestFs.call(docEl).then(() => {
          this.showToast('เปิดโหมดเต็มจอแล้ว ⛶');
        }).catch(() => {});
      }
    } else {
      if (exitFs) {
        exitFs.call(doc).then(() => {
          this.showToast('ออกจากโหมดเต็มจอ');
        }).catch(() => {});
      }
    }
  }
}

// -------------------------------------------------------------
// BOOTSTRAP APPLICATION
// -------------------------------------------------------------
window.addEventListener('DOMContentLoaded', () => {
  window.app = new DrinkTalkApp();
});
