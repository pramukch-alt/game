# 🍸 DrinkTalk - UI/UX & Game Design System

Welcome to the design specifications for **DrinkTalk**, the ultimate interactive party card game module designed for the Game Hub web application. This document outlines the visual identity, color palettes, UI components, and user experience flows to ensure a vibrant, engaging, and seamless party experience.

---

## 1. Design Philosophy & Theme Alignment

DrinkTalk inherits the core architecture and dark-mode foundation of the **Game Hub**, but injects a burst of high-energy, neon-infused party aesthetics. 

* **Vibe:** Electric, playful, social, and slightly mischievous.
* **Core Goal:** To break the ice, spark deep conversations, and liven up gatherings with smooth animations and intuitive controls that work flawlessly on mobile browsers.
* **Continuity with Game Hub:** Uses the same glassmorphism card styles, rounded UI elements (`rounded-2xl` / `rounded-3xl`), and smooth CSS transitions to maintain platform familiarity.

---

## 2. Color Palette & Typography

### Color System
To keep it bright and lively while maintaining a sleek dark-mode background suitable for night-time hangouts:
* **Background (Base):** Deep Slate / Midnight Blue (`#0F172A` to `#1E1B4B`)
* **Glass Panels:** Translucent white/dark overlays (`rgba(255, 255, 255, 0.05)` with `backdrop-blur-md`)
* **Primary Accents (Category Coding):**
  * **General (ทั่วไป):** Electric Cyan (`#06B6D4`) - Friendly & Clean
  * **Deep Talk:** Neon Purple / Violet (`#8B5CF6`) - Introspective & Warm
  * **Dirty Talk:** Hot Pink / Rose (`#F43F5E`) - Playful & Spicy
  * **Mix Mode:** Sunset Gradient (Cyan to Pink, `#06B6D4` $\rightarrow$ `#EC4899`)
* **Special Cards:** Golden Amber (`#F59E0B`) for actions (Drink, Minigames, Randomizer)

### Typography
* **Font Family:** Inter / Outfit (Google Fonts) for clean readability at a glance.
* **Scale:**
  * **Game Title:** `text-3xl` to `text-4xl`, Bold, Gradient Text.
  * **Card Question Text:** `text-xl` to `text-2xl`, Medium weight, centered for maximum legibility in the middle of a circle or room.
  * **Button / UI Text:** `text-sm` to `text-base`, Semi-bold.

---

## 3. Key UI Components

### A. Mode Selection Hub
* A grid or carousel of 4 distinct cards representing the categories: **ทั่วไป**, **Deep Talk**, **Dirty Talk**, and **Mix (สลับหมวด)**.
* Each card features subtle glowing borders corresponding to its accent color when hovered or selected.

### B. The Interactive Card Deck (Core Gameplay)
* **Back of Card:** Features the stylized **DrinkTalk** logo with a pulsing neon glow effect.
* **Card Flip Animation:** Utilizes 3D transform perspective (`transform-style: preserve-3d`) to give a realistic flipping sensation when drawn.
* **Front of Card (Content Display):**
  * Category badge at the top (color-coded).
  * Main question or penalty text clearly formatted in the center.
  * Optional target selector tag: *"เลือกคนตอบคนถัดไป!"* or *"สุ่มคนในวง!"*

### C. Action Buttons & Controls
* **"จั่วไพ่" (Draw Card):** A prominent, bouncy gradient button at the bottom center.
* **"เปลี่ยนหมวด" (Switch Mode):** Accessible via a top navigation drawer or modal to keep the game flowing without refreshing.
* **Counter / Progress:** Shows how many cards have been drawn in the current session.

---

## 4. User Experience (UX) Flow

1. **Lobby Entry:** User selects **DrinkTalk** from the Game Hub menu.
2. **Setup:** Players enter names (optional) or simply gather around the screen, then choose a game mode (e.g., *Mix*).
3. **The Draw:** Player whose turn it is taps the deck. The card flips with a smooth animation and displays the prompt.
4. **The Interaction:** 
   * If it's a question: The player answers or picks someone else in the circle to answer.
   * If it's a special card (e.g., *Drink 1 Drink* or *Category Minigame*): The room executes the fun penalty/rule immediately.
5. **Next Turn:** Tap anywhere or hit next to pass the turn to the next player.

---

## 5. Responsive Design & Mobile-First Optimization
Since party games are predominantly played around tables using smartphones:
* **Portrait Mode Priority:** Optimized for vertical phone screens with thumb-friendly button placements.
* **Touch Feedback:** Active scale-down effects (`active:scale-95`) on buttons and cards to give tactile feedback on touchscreens.