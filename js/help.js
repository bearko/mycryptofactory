/**
 * ヘルプオーバーレイ（複数ページ）
 */
const HELP_PAGES = ["goal", "controls", "params", "battle"];

export function initHelp() {
  const overlay = document.getElementById("helpOverlay");
  const openBtn = document.getElementById("btnHelpOpen");
  const closeBtn = document.getElementById("btnHelpClose");
  if (!overlay || !openBtn || !closeBtn) return;

  function showPage(slug) {
    overlay.querySelectorAll("[data-help-page]").forEach((el) => {
      el.classList.toggle("help-page--active", el.getAttribute("data-help-page") === slug);
    });
    overlay.querySelectorAll("[data-help-nav]").forEach((btn) => {
      const on = btn.getAttribute("data-help-nav") === slug;
      btn.classList.toggle("help-nav-btn--active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
  }

  function openHelp() {
    overlay.classList.remove("hidden");
    overlay.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    showPage(HELP_PAGES[0]);
    closeBtn.focus();
  }

  function closeHelp() {
    overlay.classList.add("hidden");
    overlay.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    openBtn.focus();
  }

  openBtn.addEventListener("click", openHelp);
  closeBtn.addEventListener("click", closeHelp);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeHelp();
  });
  overlay.querySelectorAll("[data-help-nav]").forEach((btn) => {
    btn.addEventListener("click", () => {
      showPage(btn.getAttribute("data-help-nav"));
    });
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !overlay.classList.contains("hidden")) {
      closeHelp();
    }
  });
}
