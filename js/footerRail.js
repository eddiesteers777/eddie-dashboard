/* ==========================================
   Southbound — footer photo rail

   A row of glass photo cards at the top of the public footer: soccer,
   strength and running. Swipe on a phone, arrows on a computer; every
   card is a link. The footer is copied into each public page, so the
   rail is added here once instead of being pasted into all of them.
   Photos are listed by filename: replace a file (and run
   scripts/build-images.py) and the card shows the new picture.
========================================== */

export const RAIL_CARDS = [
    { photo: "offer-soccer-1on1", widths: [480, 800], tag: "Soccer", title: "1-on-1", href: "soccer.html",
      alt: "Training balls and tackling dummies on a turf pitch at night", pos: "50% 55%" },
    { photo: "footer-lift", widths: [480, 800], tag: "Strength", title: "Lifting", href: "coaching.html",
      alt: "An athlete setting up a barbell lift", pos: "50% 50%" },
    { photo: "gallery-1", widths: [500, 1000], tag: "Soccer", title: "Small group", href: "soccer.html",
      alt: "A ball in the back of a goal net", pos: "50% 30%" },
    { photo: "eddie-hero", widths: [560, 840], tag: "Running", title: "Training", href: "coaching.html",
      alt: "A runner on a track at sunrise", pos: "60% 50%" },
    { photo: "offer-soccer-group", widths: [480, 800], tag: "Soccer", title: "Team sessions", href: "soccer.html",
      alt: "A floodlit soccer pitch from above", pos: "50% 50%" },
    { photo: "footer-barbell", widths: [480, 800], tag: "Strength", title: "Built in", href: "coaching.html",
      alt: "A loaded barbell on a gym floor", pos: "50% 60%" },
];

/* Pages that keep their own footer-free look: the apply flow, the Playbook tools, the 75 tracker, the bare pace page. */
const SKIP = /^(apply|75|pace)\.html$|^playbook/;

export function railHtml(cards = RAIL_CARDS) {
    const card = c => {
        const [small, large] = c.widths;
        return `<a class="pub-rail-card" href="${c.href}" role="listitem">` +
            `<img src="images/${c.photo}-${large}.webp" srcset="images/${c.photo}-${small}.webp ${small}w, images/${c.photo}-${large}.webp ${large}w" ` +
            `sizes="(max-width: 760px) 72vw, 340px" width="${large}" height="${Math.round(large * 0.625)}" loading="lazy" decoding="async" ` +
            `alt="${c.alt}" style="object-position:${c.pos}" onerror="this.remove()">` +
            `<span class="pub-rail-glass"><span><i>${c.tag}</i><b>${c.title}</b></span><em aria-hidden="true">&rarr;</em></span></a>`;
    };
    return `<div class="pub-rail-head"><h2>What I coach</h2>` +
        `<div class="pub-rail-nav"><button type="button" class="pub-rail-prev" aria-label="Scroll photos left">&larr;</button>` +
        `<button type="button" class="pub-rail-next" aria-label="Scroll photos right">&rarr;</button></div></div>` +
        `<div class="pub-rail-track" role="list" tabindex="0" aria-label="Soccer, strength and running">${cards.map(card).join("")}</div>`;
}

export function mountRail(doc = document, path = location.pathname) {
    const page = path.split("/").pop() || "home.html";
    if (SKIP.test(page)) return;
    const footer = doc.querySelector(".pub-footer");
    if (!footer || footer.querySelector(".pub-rail")) return;
    const rail = doc.createElement("section");
    rail.className = "pub-rail";
    rail.setAttribute("aria-label", "Soccer, strength and running");
    rail.innerHTML = railHtml();
    footer.prepend(rail);
    const track = rail.querySelector(".pub-rail-track");
    const step = dir => track.scrollBy({ left: dir * track.clientWidth * 0.8, behavior: "smooth" });
    rail.querySelector(".pub-rail-prev").addEventListener("click", () => step(-1));
    rail.querySelector(".pub-rail-next").addEventListener("click", () => step(1));
}

if (typeof document !== "undefined") mountRail();
