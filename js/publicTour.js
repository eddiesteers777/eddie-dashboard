/* ==========================================
   Southbound — home page app tour

   Seven short videos of the app (videos/tour/<id>.mp4 + a poster
   .webp), shown in one phone with a tab per video. They play on their
   own while the phone is on screen, one after another, until a visitor
   picks a tab (then that one loops). People who ask for less motion
   get the still poster and a play button instead.
========================================== */

const CLIPS = {
    checkin: "Thirty seconds on how you feel becomes a readiness score, and your coach sees it too.",
    wins: "Finish a workout or tick off a habit and the app marks the moment.",
    plans: "Strength, running and race plans, built by your coach and always up to date.",
    live: "Log sets, run the rest timer and watch a demo of every exercise as you train.",
    soccer: "Book a session, read the report afterwards, then practice with the video your coach picked.",
    fuel: "A fueling plan for your run: carbs, fluid and sodium, and when to take them. Free for everyone.",
    pace: "Pace, race splits and training zones from one real result. Free for everyone."
};

const video = document.getElementById("tourVideo");
const playBtn = document.getElementById("tourPlay");
const blurb = document.getElementById("tourBlurb");
const tabs = [...document.querySelectorAll(".pub-tour-tab")];

if (video && playBtn && tabs.length) {
    // iPhones only autoplay a video that is muted and inline; set both as properties as well as attributes.
    video.defaultMuted = true;
    video.muted = true;
    video.playsInline = true;
    const ids = tabs.map(t => t.dataset.clip);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let current = ids[0], visible = false, auto = !reduce, userPaused = false;

    const setPlayUi = () => {
        const playing = !video.paused && !video.ended;
        playBtn.hidden = playing;
        playBtn.setAttribute("aria-label", "Play the video");
    };
    const play = () => { if (userPaused && auto) return; video.play().then(setPlayUi).catch(setPlayUi); };

    function select(id, { manual = false } = {}) {
        if (!CLIPS[id]) return;
        current = id;
        tabs.forEach(t => { const on = t.dataset.clip === id; t.setAttribute("aria-selected", String(on)); t.tabIndex = on ? 0 : -1; });
        blurb.textContent = CLIPS[id];
        if (manual) { auto = false; userPaused = false; }
        video.loop = !auto;
        video.poster = `videos/tour/${id}.webp`;
        video.src = `videos/tour/${id}.mp4`;
        video.load();
        if (manual || (auto && visible)) video.play().then(setPlayUi).catch(setPlayUi);
        setPlayUi();
    }

    tabs.forEach(tab => {
        tab.addEventListener("click", () => select(tab.dataset.clip, { manual: true }));
        tab.addEventListener("keydown", e => {
            const i = ids.indexOf(tab.dataset.clip);
            const next = e.key === "ArrowRight" ? (i + 1) % ids.length : e.key === "ArrowLeft" ? (i + ids.length - 1) % ids.length : -1;
            if (next < 0) return;
            e.preventDefault();
            tabs[next].focus();
            select(ids[next], { manual: true });
        });
    });

    playBtn.addEventListener("click", () => { userPaused = false; video.play().then(setPlayUi).catch(setPlayUi); });
    video.addEventListener("click", () => { if (video.paused) { video.play().then(setPlayUi); } else { video.pause(); userPaused = true; setPlayUi(); playBtn.setAttribute("aria-label", "Play the video"); } });
    video.addEventListener("ended", () => { if (auto) select(ids[(ids.indexOf(current) + 1) % ids.length]); });
    // A clip that finished loading after it scrolled into view starts then.
    video.addEventListener("canplay", () => { if (auto && visible && video.paused && !userPaused) play(); });
    // Low Power Mode and some browsers refuse autoplay until the visitor touches the page once; the first touch starts it.
    const firstTouch = () => { if (auto && visible && video.paused && !userPaused) play(); };
    document.addEventListener("touchend", firstTouch, { passive: true, once: true });
    document.addEventListener("pointerup", firstTouch, { passive: true, once: true });
    video.addEventListener("play", setPlayUi);
    video.addEventListener("pause", setPlayUi);

    select(ids[0]);
    if ("IntersectionObserver" in window) {
        new IntersectionObserver(entries => {
            visible = entries.some(e => e.isIntersecting);
            if (visible) { if (auto && !userPaused) play(); else setPlayUi(); } else video.pause();
        }, { threshold: 0.4 }).observe(video);
    }
}
