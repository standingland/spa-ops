export type Locale = "en" | "th";

type Pair = Record<Locale, string>;

const p = (en: string, th: string): Pair => ({ en, th });

export const careers = {
  brand: "Banyan Spa",
  monogram: "b",
  skip: p("Skip to content", "ข้ามไปยังเนื้อหา"),
  nav: {
    details: p("Job Details", "รายละเอียดงาน"),
    apply: p("Apply", "สมัครงาน"),
  },
  hero: {
    eyebrow: p("Careers at Banyan Spa", "ร่วมงานกับ Banyan Spa"),
    titleLine1: "Join Our",
    titleLine2: "Team",
    subtitle: p("Hiring Male Therapists", "รับสมัครเทอราปิสชาย"),
    intro: p(
      "Care for one guest at a time in a private space that values craft, discretion, and genuine rest.",
      "มาร่วมดูแลลูกค้าทีละคน ในพื้นที่ที่ให้ความสำคัญกับฝีมือ ความเป็นส่วนตัว และเวลาที่ลูกค้าได้พักจริง ๆ",
    ),
    location: p("Location · Nonthaburi", "สถานที่ทำงาน · นนทบุรี"),
    primaryCta: p("Fill Application", "กรอกใบสมัคร"),
    secondaryCta: p("View Job Details", "ดูรายละเอียดงาน"),
    imageAlt: p(
      "Male spa therapist in a dark olive linen uniform neatly folding a natural cream towel on a stone table",
      "เทอราปิสชายในชุดยูนิฟอร์มสีเขียวเข้มกำลังพับผ้าลินินสีครีมบนโต๊ะอย่างประณีต",
    ),
  },
  details: {
    eyebrow: p("Job Details", "รายละเอียดงาน"),
    title: p("Male Therapist Role", "งานเทอราปิสชาย"),
    intro: p(
      "You will care for each guest from listening to their preferences before starting through the end of the session, in a private setting that gives every guest unhurried attention.",
      "คุณจะดูแลลูกค้าตั้งแต่รับฟังความต้องการก่อนเริ่ม ไปจนถึงส่งท้ายการบริการ ในบรรยากาศส่วนตัวที่ให้เวลากับลูกค้าแต่ละคน",
    ),
    responsibilitiesTitle: p("Responsibilities", "หน้าที่รับผิดชอบ"),
    responsibilities: [
      p(
        "Consult with guests on their preferences and adjust massage pressure accordingly",
        "สอบถามความต้องการและปรับแรงนวดให้เหมาะกับลูกค้า",
      ),
      p(
        "Deliver treatments to studio standards while upholding guest privacy",
        "ให้บริการนวดตามมาตรฐานของร้านและรักษาความเป็นส่วนตัวของลูกค้า",
      ),
      p(
        "Prepare and maintain cleanliness of the treatment room and equipment before and after each session",
        "เตรียมและดูแลความสะอาดของพื้นที่และอุปกรณ์ก่อนและหลังให้บริการ",
      ),
    ],
    qualificationsTitle: p("Qualifications", "คุณสมบัติ"),
    qualifications: [
      p(
        "Male therapist with massage fundamentals and a genuine interest in hospitality",
        "เป็นเทอราปิสชาย มีพื้นฐานการนวดและสนใจงานบริการ",
      ),
      p(
        "Polite communication, punctual, and attentive to personal hygiene",
        "สื่อสารสุภาพ ตรงต่อเวลา และใส่ใจสุขอนามัย",
      ),
      p(
        "Please include any massage experience or training courses in your application, if applicable",
        "แจ้งประสบการณ์หรือหลักสูตรนวดที่เคยเรียนในใบสมัคร หากมี",
      ),
    ],
  },
  working: {
    eyebrow: p("Working Together", "การทำงานร่วมกัน"),
    title: p("What You Will Gain", "สิ่งที่คุณจะได้จากงานนี้"),
    intro: p(
      "For therapists who take pride in their craft and care deeply about looking after every individual guest.",
      "สำหรับคนที่อยากใช้ฝีมือและใส่ใจกับการดูแลลูกค้าแต่ละคน",
    ),
    items: [
      {
        title: p("Dedicated One-on-One Guest Time", "เวลาดูแลลูกค้าเป็นรายบุคคล"),
        body: p(
          "Working in a private space gives you time to listen and tailor every massage to each individual guest.",
          "บริการในพื้นที่ส่วนตัว คุณจึงมีเวลารับฟังและปรับการนวดให้เหมาะกับลูกค้าแต่ละคน",
        ),
      },
      {
        title: p("Room to Practice Your Strengths", "โอกาสใช้ทักษะที่ถนัด"),
        body: p(
          "Tell us which massage styles you excel at and which skills you would like to develop further.",
          "บอกเราได้ว่าคุณถนัดการนวดแบบไหนและอยากพัฒนาทักษะด้านใด",
        ),
      },
      {
        title: p("Clear Terms Discussed Before Starting", "พูดคุยเงื่อนไขก่อนเริ่มงาน"),
        body: p(
          "Discuss work arrangements, schedules, and compensation openly during your conversation with our team.",
          "สอบถามรูปแบบงาน ตาราง และค่าตอบแทนได้ระหว่างการพูดคุยกับทีม",
        ),
      },
    ],
  },
  apply: {
    eyebrow: p("Application Form", "ใบสมัครงาน"),
    title: p("Submit Application", "ส่งใบสมัคร"),
    intro: p(
      "Share your contact details and a brief overview of your experience. Our team will review your application and contact shortlisted candidates.",
      "กรอกข้อมูลติดต่อและเล่าประสบการณ์ของคุณสั้น ๆ ทีมจะใช้ข้อมูลนี้พิจารณาใบสมัครและติดต่อผู้ที่ผ่านการคัดเลือกเบื้องต้น",
    ),
  },
  form: {
    name: p("Full Name", "ชื่อ–นามสกุล"),
    phone: p("Phone Number", "เบอร์โทรศัพท์"),
    lineId: p("LINE ID", "LINE ID"),
    optional: p("(Optional)", "(ไม่บังคับ)"),
    experience: p("Experience", "ประสบการณ์"),
    experiencePlaceholder: p("Select experience", "เลือกประสบการณ์"),
    notes: p("Additional Details", "ข้อมูลเพิ่มเติม"),
    notesPlaceholder: p(
      "e.g., preferred massage styles or earliest start date",
      "เช่น รูปแบบการนวดที่ถนัด หรือวันที่พร้อมเริ่มงาน",
    ),
    privacyNotice: p(
      "Banyan Spa uses the information in this form to evaluate applications and contact candidates regarding this position. Please omit health details and national ID numbers.",
      "Banyan Spa ใช้ข้อมูลในแบบฟอร์มเพื่อพิจารณาใบสมัครและติดต่อเรื่องตำแหน่งนี้ กรุณาเว้นข้อมูลสุขภาพและเลขบัตรประชาชน",
    ),
    consent: p(
      "I consent to the use of my information to review this application and contact me.",
      "ยินยอมให้ใช้ข้อมูลเพื่อพิจารณาใบสมัครและติดต่อกลับ",
    ),
    submit: p("Submit Application", "ส่งใบสมัคร"),
    sending: p("Submitting…", "กำลังส่ง…"),
    saved: p(
      "Thank you. We have received your application and will contact shortlisted candidates shortly.",
      "ขอบคุณครับ เราได้รับใบสมัครของคุณเรียบร้อยแล้ว ทีมงานจะพิจารณาและติดต่อกลับผู้ที่ผ่านการคัดเลือกเบื้องต้น",
    ),
    notSaved: p(
      "We could not save your application right now. You can copy your summary below and send it directly to our recruitment team.",
      "ยังไม่สามารถบันทึกใบสมัครในขณะนี้ คุณสามารถคัดลอกสรุปข้อมูลด้านล่างเพื่อส่งให้ทีมรับสมัครได้โดยตรง",
    ),
    rateLimited: p(
      "Too many applications were sent from this connection. Please try again later or copy your summary below.",
      "มีการส่งใบสมัครจากเครือข่ายนี้หลายครั้งเกินไป กรุณาลองใหม่ภายหลัง หรือคัดลอกสรุปด้านล่าง",
    ),
    summaryTitle: p("Application Summary", "สรุปข้อมูลใบสมัคร"),
    copy: p("Copy Summary", "คัดลอกสรุปใบสมัคร"),
    copied: p("Copied to clipboard.", "คัดลอกข้อมูลเรียบร้อยแล้ว"),
    copyFailed: p(
      "Could not copy automatically. Please select and copy the text above.",
      "คัดลอกไม่สำเร็จ กรุณาเลือกข้อความด้านบนแล้วคัดลอกด้วยตนเอง",
    ),
    edit: p("Edit Application", "แก้ไขข้อมูล"),
    newApplication: p("Submit Another Application", "กรอกใบสมัครใหม่"),
    lines: {
      name: p("Full Name", "ชื่อ–นามสกุล"),
      phone: p("Phone", "เบอร์โทรศัพท์"),
      lineId: p("LINE ID", "LINE ID"),
      experience: p("Experience", "ประสบการณ์"),
      notes: p("Additional Details", "ข้อมูลเพิ่มเติม"),
    },
  },
  experienceOptions: [
    { code: "none" as const, label: p("No prior experience", "ไม่มีประสบการณ์") },
    { code: "under_1" as const, label: p("Under 1 year", "น้อยกว่า 1 ปี") },
    { code: "1_3" as const, label: p("1–3 years", "1–3 ปี") },
    { code: "3_5" as const, label: p("3–5 years", "3–5 ปี") },
    { code: "5_plus" as const, label: p("5+ years", "5 ปีขึ้นไป") },
  ],
  footer: {
    department: p("Recruitment · Banyan Spa", "ฝ่ายรับสมัครงาน · Banyan Spa"),
  },
} as const;
