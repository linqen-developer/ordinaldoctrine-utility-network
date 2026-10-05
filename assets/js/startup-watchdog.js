(() => {
  const help = document.querySelector("#tool-startup-help");
  const reloadButton = document.querySelector("#reload-tool");
  if (!help || !reloadButton) return;

  let timer;
  const ready = () => document.documentElement.dataset.toolReady === "true";
  const cancel = () => clearTimeout(timer);

  const arm = () => {
    if (ready()) return;
    timer = setTimeout(() => {
      if (!ready()) help.hidden = false;
    }, 3000);
  };

  reloadButton.addEventListener("click", () => window.location.reload());
  window.addEventListener("ordinal-tool-ready", cancel, { once: true });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", arm, { once: true });
  } else {
    arm();
  }
})();
