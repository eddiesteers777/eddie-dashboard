/* Old-print sepia look for the public pages: a fixed background layer with a drawing of its own per page,
   and a glass sheen on photos. Decorative only. The home page has its own version (js/homeSky.js). */
const MOTIF = {
  about: `<div class="pr" style="left:4%;top:12%;rotate:-6deg"></div><div class="pr" style="right:5%;top:46%;rotate:5deg;width:200px;height:240px"></div><div class="pr" style="left:9%;top:72%;rotate:3deg;width:170px;height:210px"></div><svg class="mk-svg" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M10 15 C 40 30, 20 55, 85 52 S 30 90, 14 78" fill="none" stroke="rgba(242,226,196,.22)" stroke-width=".25" stroke-dasharray="1 1.2"/></svg>`,
  coaching: `<svg class="mk-svg" viewBox="0 0 100 100" preserveAspectRatio="none"><path id="rt" d="M0 80 L8 74 L16 78 L24 62 L32 66 L40 48 L48 54 L56 36 L64 44 L72 28 L80 34 L88 18 L100 22" fill="none" stroke="rgba(242,226,196,.5)" stroke-width=".35" vector-effect="non-scaling-stroke" pathLength="1" stroke-dasharray="1" stroke-dashoffset=".55"/><g stroke="rgba(242,226,196,.14)" stroke-width=".15">${[10,20,30,40,50,60,70,80,90].map(x=>`<line x1="${x}" y1="0" x2="${x}" y2="100"/>`).join('')}</g></svg><div class="tick" style="left:16%">WK 1</div><div class="tick" style="left:48%">WK 6</div><div class="tick" style="left:80%">WK 12</div>`,
  soccer: `<svg class="mk-svg" viewBox="0 0 160 100" preserveAspectRatio="xMidYMid slice"><g fill="none" stroke="rgba(242,226,196,.3)" stroke-width=".35"><rect x="6" y="6" width="148" height="88"/><line x1="80" y1="6" x2="80" y2="94"/><circle cx="80" cy="50" r="12"/><rect x="6" y="28" width="18" height="44"/><rect x="136" y="28" width="18" height="44"/></g><path d="M30 60 Q55 20 90 44 T136 50" fill="none" stroke="rgba(214,185,142,.55)" stroke-width=".5" stroke-dasharray="1.5 1.5"/><circle cx="136" cy="50" r="1.6" fill="#F2EDE1"/></svg>`,
  packages: `<div class="ledger"></div><div class="num" style="left:5%;top:30%">01</div><div class="num" style="left:38%;top:55%">02</div><div class="num" style="right:5%;top:30%">03</div>`,
  apply: `<div class="lamp"></div><svg class="mk-svg" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M10 92 Q 30 86 50 92 T 90 90" fill="none" stroke="rgba(242,226,196,.3)" stroke-width=".4"/></svg>`,
  contact: `<svg class="mk-svg" viewBox="0 0 200 100" preserveAspectRatio="xMaxYMin meet"><g transform="translate(150 28) rotate(-12)" fill="none" stroke="rgba(242,226,196,.28)" stroke-width=".7"><circle r="14"/><circle r="10.5" stroke-width=".3"/><text y="1.5" text-anchor="middle" fill="rgba(242,226,196,.28)" stroke="none" font-size="4" font-family="monospace" letter-spacing=".4">SOUTHBOUND</text><path d="M-32 -6 q4 -4 8 0 t8 0 t8 0 t8 0 t8 0 M-32 0 q4 -4 8 0 t8 0 t8 0 t8 0 t8 0 M-32 6 q4 -4 8 0 t8 0 t8 0 t8 0 t8 0" transform="translate(-26 0)"/></g></svg>`,
  install: `<div class="drop" style="left:62%;top:20%;width:90px;height:100px"></div><div class="drop" style="left:72%;top:46%;width:60px;height:68px"></div><div class="drop" style="left:56%;top:62%;width:44px;height:50px"></div>`,
  tools: `<div class="graph"></div><svg class="mk-svg" viewBox="0 0 100 100" preserveAspectRatio="xMaxYMin meet"><g transform="translate(80 30)" fill="none" stroke="rgba(242,226,196,.3)" stroke-width=".5"><path d="M-14 8 A 17 17 0 1 1 14 8"/>${Array.from({length:11},(_,i)=>{const a=(-210+i*24)*Math.PI/180;return `<line x1="${(15*Math.cos(a)).toFixed(1)}" y1="${(15*Math.sin(a)).toFixed(1)}" x2="${(18*Math.cos(a)).toFixed(1)}" y2="${(18*Math.sin(a)).toFixed(1)}"/>`}).join('')}<line x1="0" y1="0" x2="9" y2="-9" stroke="#D6B98E" stroke-width=".8"/></g></svg>`,
};
const page = (location.pathname.split("/").pop() || "home.html").replace(/\.html$/, "");
if (MOTIF[page]) {
    const root = document.documentElement;
    root.classList.add("pl-on"); root.dataset.pl = page;
    const bg = document.createElement("div");
    bg.className = "pl-bg"; bg.setAttribute("aria-hidden", "true"); bg.innerHTML = MOTIF[page];
    document.body.prepend(bg);
    // A glass sheen over photos in the page content (not the logo, nav or footer).
    const glaze = () => document.querySelectorAll("main img, .pub-hero img").forEach((img) => {
        if (img.closest(".pub-footer, .pub-navbar") || img.classList.contains("brand-mark") || !/\/?images\//.test(img.getAttribute("src") || "")) return;
        img.parentElement?.classList.add("pl-glass");
    });
    glaze(); addEventListener("load", glaze);
}
