# Design Document: Avalon Web App (Phygital Local Multiplayer)

## 1. System Architecture & Flow
1. **Lobby & Setup:** Mod sets player count and role configuration -> System generates Room Code & QR Code -> Players scan, enter names -> Mod sees live player list and starts game.
2. **Role Distribution:** Server randomly assigns roles based on preset config -> Pushes secret role data only to the respective player's device.
3. **Gameplay Loop (Quest Phase):**
   - **Leader Phase:** King/Leader selects team members. Player screens show selectable buttons for other players; Mod screen shows live notification of who is being chosen.
   - **Team Voting Phase:** All players vote Approve/Reject on the proposed team. Mod screen broadcasts voting results.
   - **Quest Execution Phase:** Selected quest members secretly press Fail or Success. Mod screen displays the final outcome (Blue/Red icon update on Quest Board).

## 2. UI/UX Layout Specifications

### A. Player Screen (Mobile Vertical View)
* **Top 50% (Information & Identity):**
  - Secret Role Card with a **"Flip / Tap to Hide"** toggle to prevent shoulder surfing.
  - Status banner showing current phase instructions (e.g., *"Waiting for leader to pick a team..."*).
* **Bottom 50% (Interactive Controls):**
  - **Player Selection Panel:** Grid/List of clickable buttons bearing other players' names (active during team building).
  - **Selected Quest Display:** Real-time text/chips showing who has been added to the current team.
  - **Contextual Action Buttons:** Dynamic buttons that appear only when relevant (e.g., *Approve / Reject* during voting, or *Fail / Success* during quest execution).

### B. Mod / Dashboard Screen (Game Board View)
* **Quest Board:** Visual tracker for Quests 1 through 5, displaying success (Blue) or failure (Red) icons.
* **Live Notification Popups (Toasts/Modals):**
  - *"👤 [Player Name] is currently choosing quest members..."*
  - *"🗳️ Proposed Team: [Name A, Name B, Name C]"*
  - *"📊 Vote Result: Approved (4 Yes / 1 No)"*
  - *"⚔️ Quest Result: Success / Failed"*