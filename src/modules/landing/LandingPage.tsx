"use client";

import { useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { copy, spa, treatments, type Category, type Locale } from "./content";
import styles from "./landing.module.css";

function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
      <path
        d={diagonal ? "M6 18 18 6M6 6h12v12" : "M4 12h15m-6-6 6 6-6 6"}
        stroke="currentColor"
        strokeWidth="1.3"
      />
    </svg>
  );
}

function BanyanMark({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      aria-hidden="true"
      viewBox="0 0 64 64"
      fill="none"
    >
      <path
        d="M32 58V28m0 15L20 31m12 5 12-12M21 49h22M14 27c-7 0-8-11-1-14 1-9 13-11 19-5 7-6 19-4 20 5 8 3 6 14-1 14H14Z"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19 27v10m26-10v10M25 9v9m14-9v9"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ValueIcon({ index }: { index: number }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" aria-hidden="true">
      {index === 0 ? (
        <>
          <path d="M10 32V10l20-4v26M6 33h28M24 20v3" />
          <path d="M14 11v22" />
        </>
      ) : index === 1 ? (
        <>
          <path d="m9 25 7 7h11l7-13c1-3-2-5-4-2l-6 8h-7l-4-4c-3-3-7 0-4 4Z" />
          <path d="M21 16s-9-5-7-9c2-3 6-2 7 1 1-3 5-4 7-1 2 4-7 9-7 9Z" />
        </>
      ) : (
        <>
          <path d="M11 30C5 13 18 5 31 7c3 16-6 23-20 23ZM10 33 26 13M15 24l-1-8m6 3 7 1" />
        </>
      )}
    </svg>
  );
}

const anchors = ["philosophy", "treatments", "experience", "visit"];
const categories: Category[] = ["massage", "rituals", "experiences"];

export function LandingPage({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const [menuOpen, setMenuOpen] = useState(false);
  const [category, setCategory] = useState<Category>("massage");
  const [selected, setSelected] = useState("signature");
  const [date, setDate] = useState("");
  const [period, setPeriod] = useState("1");
  const [review, setReview] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const treatment = treatments.find((item) => item.id === selected)!;
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const currency = (price: number) =>
    new Intl.NumberFormat(locale === "th" ? "th-TH" : "en-US", {
      style: "currency",
      currency: "THB",
      maximumFractionDigits: 0,
    }).format(price);

  function openBooking(id?: string) {
    if (id) setSelected(id);
    setReview(false);
    setCopyStatus("");
    setMenuOpen(false);
    dialog.current?.showModal();
  }

  function bookingButton(className: string, label = t.book, id?: string) {
    return spa.bookingUrl && !id ? (
      <Link
        className={className}
        prefetch={false}
        href={spa.bookingUrl.startsWith('/') ? `/${locale}${spa.bookingUrl}` : spa.bookingUrl}
      >
        {label}
        <Arrow diagonal />
      </Link>
    ) : (
      <button className={className} onClick={() => openBooking(id)}>
        {label}
        <Arrow diagonal />
      </button>
    );
  }

  function reviewVisit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setReview(true);
    setCopyStatus("");
  }

  async function copyVisit() {
    const details = `${spa.name} — ${t.summaryTitle}\n${treatment.name[locale]} · ${treatment.minutes} ${t.minutes} · ${currency(treatment.price)}\n${date} · ${t.periods[Number(period)]}\n${t.summaryNote}`;
    try {
      await navigator.clipboard.writeText(details);
      setCopyStatus(t.copied);
    } catch {
      setCopyStatus(t.copyFailed);
    }
  }

  return (
    <div className={`${styles.site} ${locale === "th" ? styles.thai : ""}`}>
      <a className={styles.skip} href="#main">
        {locale === "th" ? "ข้ามไปยังเนื้อหา" : "Skip to content"}
      </a>
      <header className={styles.header}>
        <a className={styles.logo} href={`/${locale}`} aria-label="Banyan Spa">
          <BanyanMark />
          <span>
            BANYAN<span className={styles.spaWord}>SPA</span>
          </span>
        </a>
        <nav
          className={`${styles.nav} ${menuOpen ? styles.navOpen : ""}`}
          aria-label={locale === "th" ? "เมนูหลัก" : "Main navigation"}
          id="main-nav"
        >
          {t.nav.map((label, index) => (
            <a
              key={label}
              href={`#${anchors[index]}`}
              onClick={() => setMenuOpen(false)}
            >
              {label}
            </a>
          ))}
        </nav>
        <div className={styles.headerActions}>
          <div className={styles.languages} aria-label="Language">
            <Link
              href="/en"
              prefetch={false}
              lang="en"
              aria-current={locale === "en" ? "page" : undefined}
            >
              EN
            </Link>
            <span>/</span>
            <Link
              href="/th"
              prefetch={false}
              lang="th"
              aria-current={locale === "th" ? "page" : undefined}
            >
              ไทย
            </Link>
          </div>
          {bookingButton(styles.headerBook)}
          <button
            className={styles.menuButton}
            aria-label={menuOpen ? t.close : t.menu}
            aria-expanded={menuOpen}
            aria-controls="main-nav"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <span />
            <span />
          </button>
        </div>
      </header>

      <main id="main">
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.heroCopy}>
            <span className={styles.location}>
              <span />
              {t.location}
            </span>
            <h1 id="hero-title">
              {t.hero[0]}
              <br />
              {t.hero[1]}
            </h1>
            <p>{t.intro}</p>
            <div className={styles.heroActions}>
              {bookingButton(styles.primary)}
              <a className={styles.textLink} href="#treatments">
                {t.explore}
                <Arrow />
              </a>
            </div>
            <div className={styles.heroFoot}>
              <span className={styles.downArrow}>↓</span>
              {t.scroll}
              <span className={styles.heroFootLine} />
            </div>
          </div>
          <figure className={styles.heroImage}>
            <Image
              src="/images/banyan/banyan-suite.webp"
              alt={
                locale === "th"
                  ? "ภาพแนวคิดห้องทรีตเมนต์ส่วนตัว พร้อมเตียงนวดและสวนต้นไทร"
                  : "Concept of a private treatment suite opening onto a lush banyan courtyard"
              }
              fill
              priority
              sizes="(max-width: 760px) 100vw, 58vw"
            />
            <figcaption>
              <span>Banyan Spa</span>
              <span>{t.concept}</span>
            </figcaption>
            <span className={styles.imageSeal}>
              <BanyanMark />
            </span>
          </figure>
        </section>

        <section
          id="philosophy"
          className={styles.philosophy}
          aria-labelledby="philosophy-title"
        >
          <div className={styles.sectionIntro}>
            <h2 id="philosophy-title">{t.philosophy}</h2>
            <p>{t.philosophyBody}</p>
          </div>
          <div className={styles.values}>
            {t.values.map(([title, body], index) => (
              <article key={title}>
                <ValueIcon index={index} />
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section
          id="treatments"
          className={styles.treatments}
          aria-labelledby="treatment-title"
        >
          <div className={styles.treatmentTop}>
            <h2 id="treatment-title">{t.treatmentHeading}</h2>
            <p>{t.treatmentIntro}</p>
          </div>
          <div className={styles.treatmentLayout}>
            <div className={styles.treatmentAside}>
              <BanyanMark />
              <div
                role="tablist"
                aria-label={
                  locale === "th" ? "ประเภททรีตเมนต์" : "Treatment category"
                }
                className={styles.tabs}
              >
                {categories.map((item, index) => (
                  <button
                    key={item}
                    id={`tab-${item}`}
                    role="tab"
                    aria-selected={category === item}
                    aria-controls="treatment-panel"
                    tabIndex={category === item ? 0 : -1}
                    onClick={() => setCategory(item)}
                    onKeyDown={(event) => {
                      if (
                        ![
                          "ArrowRight",
                          "ArrowLeft",
                          "ArrowDown",
                          "ArrowUp",
                          "Home",
                          "End",
                        ].includes(event.key)
                      )
                        return;
                      event.preventDefault();
                      const next =
                        event.key === "Home"
                          ? 0
                          : event.key === "End"
                            ? 2
                            : (index +
                                (["ArrowRight", "ArrowDown"].includes(event.key)
                                  ? 1
                                  : 2)) %
                              3;
                      setCategory(categories[next]);
                      document
                        .getElementById(`tab-${categories[next]}`)
                        ?.focus();
                    }}
                  >
                    {t.tabs[index]}
                    <span aria-hidden="true">↗</span>
                  </button>
                ))}
              </div>
              <p className={styles.sample}>{t.sample}</p>
            </div>
            <div
              id="treatment-panel"
              role="tabpanel"
              aria-labelledby={`tab-${category}`}
              tabIndex={0}
              className={styles.treatmentList}
              key={category}
            >
              {treatments
                .filter((item) => item.category === category)
                .map((item) => (
                  <details key={item.id} className={styles.treatment}>
                    <summary>
                      <div>
                        <h3>{item.name[locale]}</h3>
                        <span>
                          {item.minutes} {t.minutes}
                          <span className={styles.metaDot}>·</span>
                          {currency(item.price)}
                        </span>
                      </div>
                      <span className={styles.treatmentPlus} aria-hidden="true">
                        +
                      </span>
                      <span className={styles.srOnly}>{t.details}</span>
                    </summary>
                    <div className={styles.treatmentDetail}>
                      <p>{item.description[locale]}</p>
                      {bookingButton(styles.textLink, t.choose, item.id)}
                    </div>
                  </details>
                ))}
            </div>
          </div>
        </section>

        <section
          id="experience"
          className={styles.experience}
          aria-labelledby="experience-title"
        >
          <figure>
            <Image
              src="/images/banyan/banyan-suite.webp"
              alt={
                locale === "th"
                  ? "แนวคิดสวนต้นไทรร่มรื่นและวัสดุธรรมชาติ"
                  : "Concept of a sheltered banyan garden, natural stone, and warm timber"
              }
              fill
              sizes="(max-width: 760px) 100vw, 50vw"
            />
            <figcaption>{t.experienceNote}</figcaption>
          </figure>
          <div className={styles.experienceCopy}>
            <BanyanMark />
            <h2 id="experience-title">
              {t.experienceHeading[0]}
              <br />
              {t.experienceHeading[1]}
            </h2>
            <p>{t.experienceBody}</p>
            {bookingButton(styles.lightLink, t.experienceLink)}
          </div>
        </section>

        <section className={styles.faq} aria-labelledby="faq-title">
          <h2 id="faq-title">{t.faqHeading}</h2>
          <div>
            {t.faqs.map(([question, answer]) => (
              <details key={question}>
                <summary>
                  {question}
                  <span aria-hidden="true">+</span>
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section
          id="visit"
          className={styles.visit}
          aria-labelledby="visit-title"
        >
          <div>
            <span className={styles.location}>
              <span />
              {t.address}
            </span>
            <h2 id="visit-title">
              {t.visitHeading[0]}
              <br />
              {t.visitHeading[1]}
            </h2>
            <p>{t.visitBody}</p>
            {bookingButton(styles.primary)}
            <p className={styles.addressNote}>{t.addressNote}</p>
          </div>
          <BanyanMark className={styles.visitTree} />
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerTop}>
          <a href={`/${locale}`} className={styles.footerLogo}>
            BANYAN<span>SPA</span>
          </a>
          <p>{t.footerLine}</p>
          <a
            className={styles.backTop}
            href="#main"
            aria-label={locale === "th" ? "กลับด้านบน" : "Back to top"}
          >
            ↑
          </a>
        </div>
        <div className={styles.footerBottom}>
          <span>
            © {new Date().getFullYear()} Banyan Spa. {t.rights}
          </span>
          <span>{t.preview}</span>
          <a href={`/${locale}/login`}>{t.staff}</a>
        </div>
      </footer>

      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-labelledby="booking-title"
        onClick={(event) => {
          if (event.target === dialog.current) dialog.current.close();
        }}
      >
        <div className={styles.dialogInner}>
          <button
            className={styles.dialogClose}
            onClick={() => dialog.current?.close()}
            aria-label={t.close}
          >
            ×
          </button>
          <BanyanMark />
          <h2 id="booking-title">{review ? t.summaryTitle : t.bookingTitle}</h2>
          {!review ? (
            <>
              <p>{t.bookingIntro}</p>
              <form onSubmit={reviewVisit}>
                <label>
                  {t.treatmentLabel}
                  <select
                    value={selected}
                    onChange={(event) => setSelected(event.target.value)}
                  >
                    {treatments.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name[locale]} — {item.minutes} {t.minutes} —{" "}
                        {currency(item.price)}
                      </option>
                    ))}
                  </select>
                </label>
                <div className={styles.formRow}>
                  <label>
                    {t.dateLabel}
                    <input
                      type="date"
                      min={today}
                      required
                      value={date}
                      onChange={(event) => setDate(event.target.value)}
                    />
                  </label>
                  <label>
                    {t.timeLabel}
                    <select
                      value={period}
                      onChange={(event) => setPeriod(event.target.value)}
                    >
                      {t.periods.map((item, index) => (
                        <option key={item} value={index}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <button type="submit" className={styles.primary}>
                  {t.review}
                  <Arrow />
                </button>
              </form>
            </>
          ) : (
            <div className={styles.summary}>
              <div>
                <h3>{treatment.name[locale]}</h3>
                <p>
                  {treatment.minutes} {t.minutes} · {currency(treatment.price)}
                </p>
                <p>
                  {date} · {t.periods[Number(period)]}
                </p>
              </div>
              <p>{t.summaryNote}</p>
              <button className={styles.primary} onClick={copyVisit}>
                {t.copy}
                <Arrow />
              </button>
              <p role="status" className={styles.copyStatus}>
                {copyStatus}
              </p>
              <button
                className={styles.textLink}
                onClick={() => setReview(false)}
              >
                {t.edit}
              </button>
            </div>
          )}
        </div>
      </dialog>
    </div>
  );
}
