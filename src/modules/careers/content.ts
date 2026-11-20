export type Locale = "en" | "th";

type Pair = Record<Locale, string>;

const p = (en: string, th: string): Pair => ({ en, th });

export const careers = {
  nav: { back: p("Back to Banyan Spa", "กลับไปหน้าแรก") },
  eyebrow: p("Careers", "ร่วมงานกับเรา"),
  title: p("Hiring male therapists", "รับสมัคร เทอราปิสชาย"),
  intro: p(
    "Full-time works 5 days a week. Part-time, come in whenever suits you. Any experience level.",
    "เต็มเวลา ทำงาน 5 วันต่อสัปดาห์ · พาร์ทไทม์ เข้างานเวลาไหนก็ได้ · ไม่จำกัดประสบการณ์",
  ),
  apply: p("Apply now", "สมัครเลย"),
  imageAlt: p(
    "Concept of a private treatment suite opening onto a lush banyan courtyard",
    "ภาพแนวคิดห้องทรีตเมนต์ส่วนตัว พร้อมเตียงนวดและสวนต้นไทร",
  ),
  concept: p("Concept image", "ภาพประกอบแนวคิด"),
  facts: [
    { value: p("5", "5"), label: p("days a week for full-time", "วันต่อสัปดาห์ สำหรับพนักงานเต็มเวลา") },
    { value: p("Flexible", "ยืดหยุ่น"), label: p("part-time, any hours", "พาร์ทไทม์ เข้างานเวลาไหนก็ได้") },
    { value: p("0", "0"), label: p("years of experience required", "ปีประสบการณ์ที่ต้องมี") },
  ],
  requirementsTitle: p("Requirements", "คุณสมบัติ"),
  requirements: [
    p("Male, 20 years or older", "เพศชาย อายุ 20 ปีขึ้นไป"),
    p("No experience limit: beginners are welcome", "ไม่จำกัดประสบการณ์ ผู้เริ่มต้นสมัครได้"),
    p(
      "No massage certificate required, but having one is considered favorably",
      "ไม่จำเป็นต้องมีใบรับรองการนวด แต่ถ้ามีจะพิจารณาเป็นพิเศษ",
    ),
    p("Clean, professional and respectful with every guest", "บุคลิกสะอาด เป็นมืออาชีพ และสุภาพกับแขกทุกคน"),
    p("Reliable on shifts and on time", "ตรงต่อเวลาและรับผิดชอบกะงาน"),
  ],
  offerTitle: p("What we offer", "สิ่งที่คุณจะได้รับ"),
  offers: [
    p("Full-time staff: salary with a guaranteed minimum income", "พนักงานประจำ: เงินเดือน พร้อมประกันมือขั้นต่ำ"),
    p(
      "Commission per treatment plus tips, paid on fixed dates",
      "ค่าคอมมิชชันต่อการนวดหนึ่งครั้ง บวกทิป จ่ายตรงวันที่กำหนด",
    ),
    p(
      "Training if you have no experience, and senior therapists to guide you in your first week",
      "มีการอบรมหากไม่มีประสบการณ์ และมีรุ่นพี่คอยแนะนำในช่วงสัปดาห์แรก",
    ),
    p(
      "Clean rooms, laundered uniforms, drinking water and a rest area",
      "ห้องสะอาด ซักชุดยูนิฟอร์มให้ มีน้ำดื่ม และพื้นที่พัก",
    ),
  ],
  offerNote: p(
    "Commission rate, social security and leave terms are confirmed at your interview.",
    "อัตราคอมมิชชัน ประกันสังคม และวันลา จะแจ้งให้ทราบในวันสัมภาษณ์",
  ),
  applyTitle: p("Apply", "สมัครงาน"),
  applyIntro: p(
    "Fill in the form, then copy your summary and send it to us on LINE.",
    "กรอกแบบฟอร์ม แล้วคัดลอกสรุปใบสมัครส่งให้เราทาง LINE",
  ),
  contactNote: p("LINE ID and phone number to be announced.", "LINE ID และเบอร์โทรจะแจ้งให้ทราบ"),
  form: {
    name: p("Full name", "ชื่อ-นามสกุล"),
    age: p("Age", "อายุ"),
    contact: p("Phone or LINE ID", "เบอร์โทรหรือ LINE ID"),
    experience: p("Experience", "ประสบการณ์"),
    certificate: p("Massage certificate", "ใบรับรองการนวด"),
    work: p("Preferred work", "รูปแบบงานที่ต้องการ"),
    skills: p("Massage styles and languages (optional)", "สายนวดและภาษาที่ใช้ได้ (ถ้ามี)"),
    submit: p("Review application", "ตรวจสอบใบสมัคร"),
    edit: p("Edit", "แก้ไข"),
    copy: p("Copy summary", "คัดลอกสรุป"),
    copied: p("Copied. Send it to us on LINE.", "คัดลอกแล้ว ส่งให้เราทาง LINE ได้เลย"),
    copyFailed: p("Could not copy. Select the text and copy it yourself.", "คัดลอกไม่สำเร็จ กรุณาเลือกข้อความแล้วคัดลอกเอง"),
    summaryTitle: p("Therapist application", "ใบสมัครเทอราปิสชาย"),
    lines: {
      name: p("Name", "ชื่อ"),
      age: p("Age", "อายุ"),
      contact: p("Contact", "ติดต่อ"),
      experience: p("Experience", "ประสบการณ์"),
      certificate: p("Certificate", "ใบรับรอง"),
      work: p("Work type", "รูปแบบงาน"),
      skills: p("Styles/languages", "สายนวด/ภาษา"),
    },
  },
  experienceOptions: [
    p("No experience", "ไม่มีประสบการณ์"),
    p("Under 1 year", "น้อยกว่า 1 ปี"),
    p("1–3 years", "1–3 ปี"),
    p("3–5 years", "3–5 ปี"),
    p("5+ years", "5 ปีขึ้นไป"),
  ],
  certificateOptions: [p("No", "ไม่มี"), p("Yes", "มี")],
  workOptions: [
    p("Full-time (5 days a week)", "เต็มเวลา (5 วันต่อสัปดาห์)"),
    p("Part-time (any hours)", "พาร์ทไทม์ (เข้างานเวลาไหนก็ได้)"),
  ],
  footerLine: p("A quieter kind of luxury.", "ความหรูหรา ในความสงบเรียบง่าย"),
  rights: p("All rights reserved.", "สงวนลิขสิทธิ์"),
} as const;
