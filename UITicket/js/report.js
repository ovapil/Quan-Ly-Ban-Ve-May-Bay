// report.js - minimal wiring for the Report UI (currently in sell.html)

document.addEventListener("DOMContentLoaded", () => {
  const go = (href) => (window.location.href = href);

  const tabHome = document.getElementById("tabHome");
  const tabAccount = document.getElementById("tabAccount");
  const tabSettings = document.getElementById("tabSettings");

  if (tabHome) tabHome.addEventListener("click", () => go("dashboard.html"));
  if (tabAccount) tabAccount.addEventListener("click", () => go("account.html"));
  if (tabSettings) tabSettings.addEventListener("click", () => go("settings.html"));

  const btnBackTop = document.getElementById("btnBackTop");
  if (btnBackTop) btnBackTop.addEventListener("click", () => go("dashboard.html"));
});
