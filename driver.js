/* driver.js — SKN Druku 3D
   Intencje: (1) hash-per-scena + staggered reveals + spoina warstwy (is-live) + scroll-spy
   nav (aria-current) — tylko przy żywym ruchu; (2) HUD: numer sceny + droga do zapisów
   (stan, także przy reduced-motion); (3) pasek postępu + warstwy hero + wjazd kart
   (scroll+rAF, transform-only); (4) kopiuj-maila. Bez JS: statyczny dokument. */
(() => {
  "use strict";
  document.documentElement.classList.add("js");

  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const sceneInfo = {
    start: ["00", "START"], "o-kole": ["01", "O KOLE"], projekty: ["02", "PROJEKTY"],
    galeria: ["03", "GALERIA"], zarzad: ["04", "ZARZĄD"], zapisy: ["05", "ZAPISY"],
  };

  /* — HUD — */
  const hudNum = document.querySelector(".hud-num");
  const hudName = document.querySelector(".hud-name");
  const hudGoal = document.querySelector(".hud-goal");

  /* — Scroll-spy nav: id sceny → link — */
  const navLinks = {};
  document.querySelectorAll(".nav-list a[href^='#']").forEach((a) => {
    navLinks[a.getAttribute("href").slice(1)] = a;
  });
  const setCurrent = (id) => {
    for (const [sid, a] of Object.entries(navLinks)) {
      if (sid === id) {
        a.classList.add("is-current");
        a.setAttribute("aria-current", "true");
      } else {
        a.classList.remove("is-current");
        a.removeAttribute("aria-current");
      }
    }
  };

  /* — Obserwacja scen: stan (hash, HUD, nav, spoina) zawsze; reveal tylko przy ruchu — */
  {
    const scenes = Array.from(document.querySelectorAll("[data-scene]"));
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-live");
        if (!reduced) {
          entry.target.querySelectorAll(".reveal:not(.is-in)").forEach((el, i) =>
            setTimeout(() => el.classList.add("is-in"), i * 80));
        }
        const id = entry.target.id;
        if (id && location.hash !== "#" + id) history.replaceState(null, "", "#" + id);
        if (sceneInfo[id]) setCurrent(id);
        if (hudNum && sceneInfo[id]) {
          hudNum.textContent = sceneInfo[id][0];
          hudName.textContent = sceneInfo[id][1];
          requestTick(); /* pas stanu i HUD natychmiast po skoku sceny */
        }
      }
    }, { rootMargin: "-40% 0px -40% 0px" });
    scenes.forEach((s) => io.observe(s));
  }

  /* — Wspólny tick: pasek postępu, warstwy hero, wjazd kart, droga do zapisów — */
  const segs = Array.from(document.querySelectorAll(".print-progress span"));
  const heroSpans = Array.from(document.querySelectorAll(".layers span"));
  const row = document.querySelector(".cards-row");
  const track = row ? row.closest(".pin-track") : null;
  const counter = document.querySelector(".card-counter");
  const zapisy = document.getElementById("zapisy");
  const mhBox = document.querySelector(".mobile-hud");
  const mhText = document.querySelector(".mh-text");
  let mhTimer = 0;
  let ticking = false;
  /* Przesunięcie rzędu = realny koniec ostatniej karty, NIE row.scrollWidth:
     width:max-content liczy max-content z tekstów kart w jednej linii (~5087 px przy 1280),
     podczas gdy flex-basis trzyma karty na 330 px — stary wzór zostawiał ~30% pina pustą. */
  let rowShift = -1;
  const measureRow = () => {
    const last = row.lastElementChild;
    if (!last) return 0;
    const padR = parseFloat(getComputedStyle(row).paddingRight) || 0;
    /* Koniec pina ma być „flush right": translate(1) = 0.14·W − shift ⇒ prawa krawędź treści
       na krawędzi okna ⇒ shift = treść + start(0.14·W) − W. Bez składnika startowego ostatnia
       karta zostaje ucięta o 0.14·W przy p=1 (recenzja QA 2026-11-03). */
    const content = last.offsetLeft + last.offsetWidth + padR;
    const w = document.documentElement.clientWidth;
    return Math.max(content + 0.14 * w - w, 0);
  };

  const tick = () => {
    ticking = false;
    const doc = document.documentElement;
    /* Metryka „drogi do zapisów" — jedna dla paska i HUD (zero rozjazdu wskaźników) */
    let goal = 0;
    if (zapisy) {
      const zt = zapisy.getBoundingClientRect().top + scrollY;
      goal = Math.min(1, Math.max(0, scrollY / Math.max(zt - innerHeight, 1)));
    } else {
      goal = Math.min(1, scrollY / Math.max(doc.scrollHeight - innerHeight, 1));
    }
    const on = Math.round(goal * segs.length);
    segs.forEach((s, i) => s.classList.toggle("done", i < on));

    if (heroSpans.length && scrollY < innerHeight) {
      const h = Math.min(1, scrollY / (innerHeight * 0.6));
      const n = Math.min(heroSpans.length, 2 + Math.round(h * (heroSpans.length - 2)));
      heroSpans.forEach((s, i) => s.classList.toggle("done", i < n));
    }

    /* Pin od 768 px wzwyż ZAWSZE (wymóg usera: scroll pionowy jest konsumowany przez
       sekcję, karty jadą w bok) — bez trybów collapsed; niskie okna kompaktuje CSS */
    if (row && track && !reduced && matchMedia("(min-width: 768px)").matches) {
      if (rowShift < 0) rowShift = measureRow();
      const rect = track.getBoundingClientRect();
      const pinLen = Math.max(track.offsetHeight - innerHeight, 1);
      const p = Math.min(1, Math.max(0, -rect.top / pinLen));
      row.style.transform = "translateX(" + (0.14 * innerWidth - p * rowShift).toFixed(1) + "px)";
      if (counter) {
        const n = row.children.length;
        counter.textContent = String(Math.min(n, Math.round(p * (n - 1)) + 1)).padStart(2, "0") + " / " + String(n).padStart(2, "0");
      }
    } else if (row && row.style.transform) {
      row.style.transform = "";
    }

    if (hudGoal && zapisy) {
      const pc = Math.min(100, Math.floor(goal * 20) * 5); /* skokowo co 5% */
      hudGoal.textContent = pc >= 100 ? " · ZAPISY TERAZ" : " · → ZAPISY " + pc + "%";
    }

    /* Dolny pas stanu: persistent po hero (na hero zostaje sygnatura) */
    if (mhText && mhBox) {
      mhText.textContent =
        (hudNum ? hudNum.textContent : "00") + "/05 · " +
        (hudName ? hudName.textContent : "START") +
        (hudGoal ? hudGoal.textContent : "");
      mhBox.classList.toggle("is-active", scrollY > innerHeight * 0.5);
    }
  };
  const requestTick = () => { if (!ticking) { ticking = true; requestAnimationFrame(tick); } };
  addEventListener("scroll", requestTick, { passive: true });

  /* Region rzędu kart: tabindex na desktopie (≥768) — rząd jest scrollerem w trybie pina */
  const setRowRegion = () => {
    if (!row) return;
    if (matchMedia("(min-width: 768px)").matches) {
      row.setAttribute("tabindex", "0");
      row.setAttribute("aria-label", "Lista projektów — przewijaj poziomo");
    } else {
      row.removeAttribute("tabindex");
      row.setAttribute("aria-label", "Lista projektów");
    }
  };
  setRowRegion();
  addEventListener("resize", () => { setRowRegion(); rowShift = -1; requestTick(); });
  tick();

  if (heroSpans.length && !reduced) {
    heroSpans.slice(0, 2).forEach((s) => s.classList.add("done"));
  }

  /* — Udostępnij: Web Share API, fallback kopiowanie linku (bez JS przycisk schowany) — */
  document.querySelectorAll("[data-share]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const data = {
        title: document.title,
        text: "SKN Druku 3D — Politechnika Łódzka",
        url: location.origin + location.pathname,
      };
      if (navigator.share) {
        navigator.share(data).catch(() => {});
        return;
      }
      const url = data.url;
      const confirm = () => {
        const note = document.createElement("span");
        note.className = "mono copy-note";
        note.setAttribute("role", "status");
        note.textContent = "Skopiowano link";
        btn.after(note);
        setTimeout(() => note.remove(), 1800);
      };
      const copyFallback = () => {
        const ta = document.createElement("textarea");
        ta.value = url;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        confirm();
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(confirm).catch(copyFallback);
      } else {
        copyFallback();
      }
    });
  });

  /* — Kopiuj maila: aktywuje się, gdy w stopce pojawi się realny mailto (README) — */
  const mail = document.querySelector(".foot-mail a[href^='mailto:']");
  if (mail) {
    mail.addEventListener("click", (e) => {
      e.preventDefault();
      navigator.clipboard && navigator.clipboard.writeText(mail.getAttribute("href").slice(7)).then(() => {
        const note = document.createElement("span");
        note.className = "mono copy-note";
        note.setAttribute("role", "status");
        note.textContent = "Skopiowano do schowka";
        mail.after(note);
        setTimeout(() => note.remove(), 1800);
      });
    });
  }
})();
