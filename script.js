const STORAGE_KEY = "ding-baotang-card-theme";
const INTRO_STORAGE_KEY = "ding-baotang-card-intro";
const themes = new Set(["minimal", "space", "survey", "map"]);

const buttons = Array.from(document.querySelectorAll(".theme-button"));
const intro = document.querySelector(".intro");

function applyTheme(theme) {
  const nextTheme = themes.has(theme) ? theme : "minimal";
  document.body.dataset.theme = nextTheme;

  buttons.forEach((button) => {
    const isActive = button.dataset.themeValue === nextTheme;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  localStorage.setItem(STORAGE_KEY, nextTheme);
}

const savedTheme = localStorage.getItem(STORAGE_KEY);
applyTheme(savedTheme || "minimal");

buttons.forEach((button) => {
  button.addEventListener("click", () => {
    applyTheme(button.dataset.themeValue);
  });
});

if (intro) {
  const savedIntro = localStorage.getItem(INTRO_STORAGE_KEY);

  if (savedIntro !== null) {
    intro.textContent = savedIntro;
  }

  intro.addEventListener("input", () => {
    localStorage.setItem(INTRO_STORAGE_KEY, intro.textContent.trim());
  });

  intro.addEventListener("paste", (event) => {
    event.preventDefault();
    const text = event.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
  });
}
