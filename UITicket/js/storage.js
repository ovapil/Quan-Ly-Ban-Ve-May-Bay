const Storage = {
  getJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
    catch { return fallback; }
  },
  setJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  },
  getSession() {
    const a = localStorage.getItem("uiticket_session");
    const b = sessionStorage.getItem("uiticket_session");
    try { return JSON.parse(a || b || "null"); } catch { return null; }
  },
  setSession(session, remember) {
    if (remember) {
      localStorage.setItem("uiticket_session", JSON.stringify(session));
      sessionStorage.removeItem("uiticket_session");
    } else {
      sessionStorage.setItem("uiticket_session", JSON.stringify(session));
      localStorage.removeItem("uiticket_session");
    }
  },
  clearSession() {
    localStorage.removeItem("uiticket_session");
    sessionStorage.removeItem("uiticket_session");
  }
};

const UI = {
  toast(message, type = "success") {
    const toast = document.getElementById("toast");
    if (!toast) return;

    toast.textContent = message;
    toast.style.background = type === "success" ? "#4caf50" : "#f59e0b";
    toast.style.display = "block";

    setTimeout(() => { toast.style.display = "none"; }, 1600);
  }
};
