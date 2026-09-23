# 🎲 Web Board Game & Party Game Collection

Repository นี้เป็นศูนย์รวม Web Applications, Modulators และ Utility Tools สำหรับช่วยดำเนินเกมบอร์ดเกม ปาร์ตี้เกม และกิจกรรมกลุ่ม เพื่อให้ Game Master (GM) หรือผู้เล่นสามารถใช้งานได้อย่างสะดวก รวดเร็ว และเล่นได้ผ่านเว็บเบราว์เซอร์ทุกอุปกรณ์

---

## 🎮 รายชื่อเกมทั้งหมด (Available Games)

| ไอคอน | ชื่อเกม / เครื่องมือ | รายละเอียด | สถานะ | ลิงก์เล่นเกม |
| :---: | :--- | :--- | :---: | :---: |
| 🐺 | **Werewolf Modulator** | เครื่องมือช่วย GM จดบันทึกสถานะ, จัดการ Role ผู้เล่น และคำนวณผลแอ็กชันช่วงกลางคืน | 🟢 พร้อมใช้งาน | [เปิดเล่นเกม](./werewolf-modulator/) |
| 🕵️ | *[Secret Hitler / Avalon]* | *เครื่องมือช่วยสุ่มบทบาทและบันทึกคะแนน* | 🟡 แผนในอนาคต | - |
| 🎯 | *[Game อื่น ๆ]* | *รอการพัฒนา* | ⚪ เร็ว ๆ นี้ | - |

---

## 📂 โครงสร้าง Repository (Project Structure)

โปรเจกต์นี้ใช้โครงสร้างแบบแยกโฟลเดอร์ตามแต่ละเกมอย่างเป็นอิสระ (Modular / Monorepo pattern) ทำให้สามารถพัฒนาแต่ละเกมแยกกันได้ง่าย ไม่กระทบต่อกัน:

```text
game/
├── .gitignore                   # ตัวกรองไฟล์ขยะและไฟล์ชั่วคราว
├── README.md                    # เอกสารหลักของโปรเจกต์
├── index.html                   # หน้า Game Portal รวมเกมทั้งหมด (สำหรับเปิดเล่นผ่าน GitHub Pages)
├── shared/                      # (ตัวเลือกเสริมในอนาคต) CSS/JS/Assets ที่ใช้ร่วมกัน
└── werewolf-modulator/          # โฟลเดอร์เกม Werewolf Modulator
    ├── index.html               # หน้าเว็บหลักของเกม
    ├── README.md                # เอกสารแนะนำการใช้งานเฉพาะเกม Werewolf
    └── docs/                    # ไฟล์เอกสารและกติกา (เช่น Werewolf.docx)
```

---

## ➕ วิธีการเพิ่มเกมใหม่ (How to Add a New Game)

เมื่อต้องการเพิ่มเกมใหม่เข้ามาใน Repository นี้:

1. **สร้างโฟลเดอร์ใหม่**:
   - ตั้งชื่อโฟลเดอร์ด้วยรูปแบบ `kebab-case` (ตัวพิมพ์เล็กคั่นด้วยขีดกลาง) เช่น `avalon-helper/`, `spyfall-web/`, `uno-score/`
2. **สร้างไฟล์หลักของเกม**:
   - ให้ตั้งชื่อไฟล์หลักเป็น `index.html` เสมอ เพื่อให้สามารถเข้าถึงผ่าน URL โฟลเดอร์ได้โดยตรงบน GitHub Pages
3. **จัดเก็บ Assets เฉพาะของเกม**:
   - หากมีไฟล์ภาพ, เสียง หรือเอกสาร ให้เก็บไว้ในโฟลเดอร์ของเกมนั้น ๆ (เช่น `avalon-helper/assets/`, `avalon-helper/docs/`)
4. **อัปเดตหน้า Portal และ README**:
   - เพิ่มรายการเกมลงในตารางของไฟล์ [README.md](./README.md)
   - เพิ่มการ์ดเกมลงในหน้า [index.html](./index.html) (Game Portal) เพื่อให้ผู้เล่นเข้าถึงได้จากหน้าหลัก

---

## 🌐 การเปิดใช้งาน GitHub Pages (เล่นเกมออนไลน์)

หากต้องการเปิดให้คนอื่นสามารถเข้าเล่นผ่านเว็บได้ฟรีผ่าน GitHub Pages:

1. เข้าไปที่ Repository ของคุณบน GitHub
2. ไปที่แท็บ **Settings** > เมนูด้านซ้ายเลือก **Pages**
3. ในส่วน **Build and deployment**:
   - **Source**: `Deploy from a branch`
   - **Branch**: เลือก `main` และโฟลเดอร์ `/ (root)`
4. กด **Save** แล้วรอระบบประมวลผล 1-2 นาที
5. คุณจะได้ URL เช่น: `https://<YOUR-USERNAME>.github.io/game/`
   - หน้าหลักรวมเกม: `https://<YOUR-USERNAME>.github.io/game/`
   - หน้า Werewolf: `https://<YOUR-USERNAME>.github.io/game/werewolf-modulator/`

---

## 📄 License
This project is open-source and free for non-commercial personal/community use.
