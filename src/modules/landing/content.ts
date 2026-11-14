export type Locale = "en" | "th";
export type Category = "massage" | "rituals" | "experiences";

// Sample marketing menu. The public booking page owns actual prices and availability.
export const spa = {
  name: "Banyan Spa",
  city: "Bangkok",
  bookingUrl: "/book" as string | null,
};

export const treatments: {
  id: string;
  category: Category;
  minutes: number;
  price: number;
  name: Record<Locale, string>;
  description: Record<Locale, string>;
}[] = [
  {
    id: "signature",
    category: "massage",
    minutes: 90,
    price: 2900,
    name: { en: "The Banyan Signature", th: "บันยัน ซิกเนเจอร์" },
    description: {
      en: "Our unhurried full-body ritual. Flowing movements and your choice of pressure, with a warm oil blend to settle into the moment.",
      th: "สัมผัสแห่งการพักผ่อนทั่วเรือนร่าง ด้วยจังหวะนวดที่นุ่มนวล น้ำมันอุ่น และระดับแรงกดที่คุณเลือกได้",
    },
  },
  {
    id: "deep",
    category: "massage",
    minutes: 60,
    price: 2400,
    name: { en: "Deep Release", th: "ดีพ รีลีส" },
    description: {
      en: "A focused, firmer massage, thoughtfully paced around the areas that need your attention. Pressure is always guided by you.",
      th: "การนวดด้วยแรงกดที่หนักแน่นขึ้น เน้นบริเวณที่คุณต้องการดูแลเป็นพิเศษ และปรับระดับแรงกดตามความสบายของคุณ",
    },
  },
  {
    id: "aroma",
    category: "massage",
    minutes: 90,
    price: 2700,
    name: { en: "Aromatic Stillness", th: "อะโรมาติก สติลเนส" },
    description: {
      en: "Gentle, rhythmic massage with a softly scented oil. A little space to breathe, disconnect, and simply be.",
      th: "การนวดจังหวะเนิบช้า พร้อมน้ำมันหอมละมุน ให้คุณมีพื้นที่พักใจ หายใจลึก ๆ และปล่อยวางจากวันอันวุ่นวาย",
    },
  },
  {
    id: "body",
    category: "rituals",
    minutes: 60,
    price: 2200,
    name: { en: "Botanical Body Ritual", th: "โบทานิคัล บอดี้ ริชวล" },
    description: {
      en: "A finely textured body polish followed by a warm, nourishing oil application. An indulgence for the senses.",
      th: "ขัดผิวอย่างอ่อนโยนด้วยเนื้อสครับละเอียด ตามด้วยการบำรุงด้วยน้ำมันอุ่น เพื่อช่วงเวลาแห่งการปรนเปรอผิวและสัมผัส",
    },
  },
  {
    id: "stone",
    category: "rituals",
    minutes: 90,
    price: 3200,
    name: { en: "Warm Stone Ritual", th: "วอร์ม สโตน ริชวล" },
    description: {
      en: "Smooth, warmed stones meet slow massage movements in a deeply comforting full-body experience.",
      th: "ความอุ่นจากหินเนื้อเรียบ ผสานจังหวะนวดช้า ๆ เพื่อความรู้สึกสบายทั่วเรือนร่าง",
    },
  },
  {
    id: "escape",
    category: "experiences",
    minutes: 150,
    price: 4900,
    name: { en: "The Banyan Escape", th: "เดอะ บันยัน เอสเคป" },
    description: {
      en: "Make an afternoon of it. A botanical body polish, our signature massage, and a quiet moment with tea to finish.",
      th: "มอบช่วงบ่ายให้ตัวเอง ด้วยการขัดผิว นวดบันยันซิกเนเจอร์ และปิดท้ายด้วยช่วงเวลาสงบพร้อมชาหนึ่งถ้วย",
    },
  },
  {
    id: "reset",
    category: "experiences",
    minutes: 120,
    price: 3900,
    name: { en: "A Moment of Renewal", th: "ช่วงเวลาแห่งการเริ่มใหม่" },
    description: {
      en: "A warm stone ritual paired with a gentle scalp massage. Time reserved entirely for yourself.",
      th: "ริชวลหินอุ่น ผสานการนวดศีรษะอย่างอ่อนโยน ช่วงเวลาที่คุณมอบให้ตัวเองอย่างเต็มที่",
    },
  },
];

export const copy = {
  en: {
    nav: ["Our philosophy", "Treatments", "The experience", "Your visit"],
    book: "Book a visit",
    menu: "Open navigation",
    close: "Close",
    location: "A private retreat for men in Bangkok",
    hero: ["The art of", "slowing down."],
    intro:
      "A quieter space. A considered touch. Time that belongs entirely to you. Discover a different pace at Banyan Spa.",
    explore: "Explore our treatments",
    scroll: "Take a moment. Stay a little.",
    concept: "Concept imagery",
    philosophy: "Luxury, in its quietest form.",
    philosophyBody:
      "We believe the most meaningful luxury is how you feel. Inspired by the shelter of the banyan tree, we are creating a place for men to step away, find stillness, and feel cared for.",
    values: [
      [
        "Space to yourself",
        "Privacy, comfort, and the freedom to fully switch off.",
      ],
      [
        "Care, considered",
        "An experience shaped around your preferences and pace.",
      ],
      [
        "Rooted in calm",
        "Natural textures, gentle rhythms, and room to breathe.",
      ],
    ],
    treatmentHeading: "Find your moment.",
    treatmentIntro:
      "A considered collection of massages and body rituals. Choose what feels right for you.",
    tabs: ["Massage", "Body rituals", "Longer escapes"],
    sample: "Sample menu · treatments, durations, and prices are for preview.",
    minutes: "min",
    details: "Discover treatment",
    choose: "Choose this treatment",
    experienceHeading: ["A world away.", "Still in Bangkok."],
    experienceBody:
      "Leave the city at the door. Our vision brings together tactile materials, soft light, and the stillness of nature. Every detail invites you to settle in.",
    experienceLink: "Plan your time with us",
    experienceNote: "An interior concept for Banyan Spa.",
    faqHeading: "A little, before you arrive.",
    faqs: [
      [
        "Is Banyan Spa a men’s spa?",
        "Yes. Banyan Spa is a luxury spa created for men, with an emphasis on privacy, personal comfort, and thoughtful care.",
      ],
      [
        "Which treatment should I choose?",
        "Explore the sample menu to find a style and duration you like. The Banyan Signature is our suggested starting point; the final menu will be confirmed before opening.",
      ],
      [
        "Can I adjust the massage pressure?",
        "Your comfort comes first. Tell your therapist your preferred pressure before the treatment, and speak up whenever you would like an adjustment.",
      ],
      [
        "How do I book a visit?",
        "Use “Book a visit” to explore our booking page and available treatments. The menu here is a sample; current prices and availability are shown in the booking flow when online reservations are open.",
      ],
    ],
    visitHeading: ["Make room", "for yourself."],
    visitBody:
      "A pause from the everyday. An invitation to feel more like you.",
    address: "Bangkok, Thailand",
    addressNote: "Address and opening hours to be announced.",
    footerLine: "A quieter kind of luxury.",
    rights: "All rights reserved.",
    staff: "Staff access",
    preview: "Website preview · sample menu & concept imagery",
    bookingTitle: "Your time, thoughtfully planned.",
    bookingIntro:
      "Explore a sample visit. This preview does not send a request or reserve an appointment.",
    treatmentLabel: "Your treatment",
    dateLabel: "Preferred date",
    timeLabel: "Preferred time of day",
    periods: ["Morning", "Afternoon", "Evening"],
    review: "Review your visit",
    summaryTitle: "Your visit preview",
    summaryNote:
      "This appointment has not been sent or confirmed. Booking and opening details will be available before launch.",
    edit: "Edit preferences",
    copy: "Copy visit details",
    copied: "Details copied",
    copyFailed: "Please select and copy the details below.",
  },
  th: {
    nav: ["แนวคิดของเรา", "ทรีตเมนต์", "ประสบการณ์", "วางแผนการมาเยือน"],
    book: "จองช่วงเวลาของคุณ",
    menu: "เปิดเมนู",
    close: "ปิด",
    location: "พื้นที่พักผ่อนส่วนตัวสำหรับผู้ชายในกรุงเทพฯ",
    hero: ["ศิลปะแห่ง", "การใช้ชีวิตให้ช้าลง"],
    intro:
      "พื้นที่สงบ สัมผัสที่ใส่ใจ และเวลาที่เป็นของคุณอย่างแท้จริง ค้นพบจังหวะใหม่แห่งการพักผ่อนที่ Banyan Spa",
    explore: "ค้นพบทรีตเมนต์ของเรา",
    scroll: "ค่อย ๆ พัก แล้วอยู่ต่ออีกสักนิด",
    concept: "ภาพแนวคิด",
    philosophy: "ความหรูหรา ในความสงบเรียบง่าย",
    philosophyBody:
      "เราเชื่อว่าความหรูหราที่มีความหมาย คือความรู้สึกดีที่คุณได้รับ ด้วยแรงบันดาลใจจากร่มเงาของต้นไทร เรากำลังสร้างพื้นที่ให้ผู้ชายได้พักจากความวุ่นวาย พบความสงบ และสัมผัสการดูแลอย่างใส่ใจ",
    values: [
      ["พื้นที่ที่เป็นของคุณ", "ความเป็นส่วนตัว ความสบาย และอิสระในการพักผ่อนอย่างเต็มที่"],
      ["ใส่ใจในทุกรายละเอียด", "ประสบการณ์ที่ออกแบบตามความชอบและจังหวะของคุณ"],
      ["หยั่งรากในความสงบ", "สัมผัสจากธรรมชาติ จังหวะที่อ่อนโยน และพื้นที่ให้คุณหายใจ"],
    ],
    treatmentHeading: "ค้นพบช่วงเวลาของคุณ",
    treatmentIntro:
      "คอลเลกชันการนวดและริชวลดูแลผิวกายที่คัดสรรอย่างใส่ใจ เลือกสิ่งที่เหมาะกับคุณ",
    tabs: ["การนวด", "ริชวลดูแลผิวกาย", "ช่วงพักผ่อนที่ยาวนานขึ้น"],
    sample: "เมนูตัวอย่าง · ทรีตเมนต์ ระยะเวลา และราคา สำหรับชมแนวคิดเท่านั้น",
    minutes: "นาที",
    details: "รายละเอียดทรีตเมนต์",
    choose: "เลือกทรีตเมนต์นี้",
    experienceHeading: ["ห่างจากความวุ่นวาย", "ในใจกลางกรุงเทพฯ"],
    experienceBody:
      "พักเรื่องราวของเมืองไว้ข้างนอก แนวคิดของเราผสานสัมผัสจากวัสดุธรรมชาติ แสงที่นุ่มนวล และความสงบจากต้นไม้ ทุกรายละเอียดเชื้อเชิญให้คุณผ่อนคลาย",
    experienceLink: "วางแผนช่วงเวลาของคุณ",
    experienceNote: "ภาพแนวคิดการตกแต่งภายในสำหรับ Banyan Spa",
    faqHeading: "เรื่องเล็กน้อย ก่อนมาเยือน",
    faqs: [
      [
        "Banyan Spa เป็นสปาสำหรับผู้ชายใช่ไหม?",
        "ใช่ Banyan Spa เป็นสปาระดับหรูที่สร้างสรรค์สำหรับผู้ชาย โดยให้ความสำคัญกับความเป็นส่วนตัว ความสบาย และการดูแลอย่างใส่ใจ",
      ],
      [
        "ควรเลือกทรีตเมนต์ไหนดี?",
        "ชมเมนูตัวอย่างเพื่อเลือกรูปแบบและระยะเวลาที่คุณชอบ บันยัน ซิกเนเจอร์ เป็นตัวเลือกเริ่มต้นที่เราแนะนำ โดยจะยืนยันเมนูจริงก่อนเปิดให้บริการ",
      ],
      [
        "ปรับระดับแรงกดในการนวดได้ไหม?",
        "ความสบายของคุณสำคัญที่สุด แจ้งระดับแรงกดที่ชอบก่อนเริ่มทรีตเมนต์ และบอกผู้ดูแลได้ทุกครั้งที่ต้องการปรับเปลี่ยน",
      ],
      [
        "จองช่วงเวลาพักผ่อนได้อย่างไร?",
        "เลือก “จองช่วงเวลาของคุณ” เพื่อไปยังหน้าจองและดูทรีตเมนต์ที่พร้อมให้บริการ เมนูในหน้านี้เป็นตัวอย่าง โดยจะแสดงราคาและเวลาว่างจริงในหน้าจองเมื่อเปิดรับจองออนไลน์",
      ],
    ],
    visitHeading: ["ให้เวลาดี ๆ", "เป็นของคุณ"],
    visitBody: "เว้นวรรคจากทุกวัน แล้วกลับมารู้สึกเป็นตัวเองอีกครั้ง",
    address: "กรุงเทพฯ ประเทศไทย",
    addressNote: "จะแจ้งที่อยู่และเวลาเปิดให้บริการเร็ว ๆ นี้",
    footerLine: "ความหรูหรา ในความสงบเรียบง่าย",
    rights: "สงวนลิขสิทธิ์",
    staff: "สำหรับพนักงาน",
    preview: "ตัวอย่างเว็บไซต์ · เมนูตัวอย่างและภาพแนวคิด",
    bookingTitle: "ช่วงเวลาที่ตั้งใจ มอบให้คุณ",
    bookingIntro: "ลองวางแผนการมาเยือนของคุณ ตัวอย่างนี้ยังไม่ส่งคำขอหรือยืนยันการจอง",
    treatmentLabel: "ทรีตเมนต์ของคุณ",
    dateLabel: "วันที่ต้องการ",
    timeLabel: "ช่วงเวลาที่ต้องการ",
    periods: ["ช่วงเช้า", "ช่วงบ่าย", "ช่วงเย็น"],
    review: "ตรวจสอบรายละเอียด",
    summaryTitle: "ตัวอย่างการมาเยือนของคุณ",
    summaryNote:
      "ยังไม่มีการส่งคำขอหรือยืนยันนัดหมาย จะแจ้งช่องทางจองและรายละเอียดการเปิดให้บริการก่อนเปิดตัว",
    edit: "แก้ไขรายละเอียด",
    copy: "คัดลอกรายละเอียด",
    copied: "คัดลอกแล้ว",
    copyFailed: "กรุณาเลือกและคัดลอกข้อความด้านล่าง",
  },
};
