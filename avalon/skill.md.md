# Skill & Tech Stack Requirements: Avalon Web App

## Frontend Development
* **Framework:** React.js / Next.js (or Vanilla JS with Tailwind CSS, depending on project preference from Werewolf).
* **Styling:** Tailwind CSS for rapid UI building, responsive layouts, and smooth animations (popup modals, role card flip effects).
* **State Management:** React Context / Zustand for managing local player state and UI triggers.
* **Storage:** LocalStorage handling for persistent session recovery (preventing data loss on accidental page refresh).

## Backend & Real-Time Communication
* **Server Runtime:** Node.js with Express.
* **Real-time Engine:** Socket.io (for low-latency room joining, broadcasting votes, and instant game state synchronization).
* **Room Management:** Dynamic room code generation (4-6 digits) + QR Code generation library (`qrcode.react` or similar).

## Game Logic & State Management
* **Finite State Machine (FSM):** Structured progression handling player registration, role distribution algorithms based on player count, team proposal, majority voting (Approve/Reject), and mission resolution (Fail/Success).
* **Role Distribution Logic:** Automated random assignment matching exact user-defined ratios (Good vs. Evil roles like Merlin, Assassin, Mordred, Loyal Servant, Minion).