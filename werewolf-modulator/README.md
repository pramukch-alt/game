# 🐺 Werewolf Modulator

เว็บแอปพลิเคชันสำหรับช่วย Game Master (GM) ในการดำเนินเกมและบันทึกข้อมูลของเกม **Werewolf** (มนุษย์หมาป่า)

---

## ✨ ความสามารถหลัก (Features)

1. **Setup & Role Selection**:
   - เลือกบทบาทที่ต้องการใช้ในเกม (Werewolf, Villager, Seer, Bodyguard, Medium, Lycanthrope, Lone Wolf, Cursed, Cupids, ฯลฯ)
   - คำนวณจำนวนบทบาทอัตโนมัติ
2. **Player Management & Matching**:
   - กรอกรายชื่อผู้เล่นตามจำนวน Role
   - จัดคู่บทบาทกับชื่อผู้เล่นแบบเป็นความลับสำหรับ GM
3. **Night Phase Execution**:
   - สรุปและเรียงลำดับการตื่นของแต่ละ Role ในเวลากลางคืน
   - บันทึกการกระทำ (เช่น การส่องของ Seer, การปกป้องของ Bodyguard, การโหวตล่าของ Werewolf)
   - คำนวณผลลัพธ์การตาย/รอดชีวิตอัตโนมัติในรุ่งเช้า
4. **Day Phase & Voting**:
   - จดบันทึกการโหวตแขวนคอและสรุปผู้เสียชีวิต
5. **Mobile-Friendly UI**:
   - ออกแบบด้วย Tailwind CSS เพื่อให้ GM ถือมือถือเปิดดูและกดบันทึกได้สะดวกตลอดการดำเนินเกม

---

## 🚀 วิธีการใช้งาน

- **เล่นผ่านเครื่องคอมพิวเตอร์ / มือถือ**:
  เปิดไฟล์ `index.html` ด้วยเว็บเบราว์เซอร์ใดก็ได้ (Chrome, Safari, Edge, Firefox) โดยไม่ต้องติดตั้งโปรแกรมหรือเซิร์ฟเวอร์ใด ๆ เพิ่มเติม
- **เล่นผ่าน GitHub Pages**:
  หากอัปโหลดขึ้น GitHub แล้ว สามารถเข้าผ่าน URL:
  `https://<YOUR-USERNAME>.github.io/game/werewolf-modulator/`

---

## 📁 โฟลเดอร์ที่เกี่ยวข้อง

- `index.html`: โค้ดหลักของเว็บแอปพลิเคชัน Werewolf Modulator
- `docs/Werewolf.docx`: เอกสารกติกา รายละเอียดบทบาท และข้อกำหนดของเกม Werewolf
