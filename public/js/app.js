(() => {
  "use strict";

  const HISTORY_KEY = "armoprox_history_v1";

  // ---------- Element refs ----------
  const form = document.getElementById("generatorForm");
  const subUrlInput = document.getElementById("subUrl");
  const pinInput = document.getElementById("pinCode");
  const labelInput = document.getElementById("labelInput");
  const generateBtn = document.getElementById("generateBtn");

  const loadingState = document.getElementById("loadingState");
  const errorState = document.getElementById("errorState");
  const resultState = document.getElementById("resultState");
  const resultBadges = document.getElementById("resultBadges");
  const qrCanvas = document.getElementById("qrCanvas");
  const newLinkInput = document.getElementById("newLinkInput");
  const copyBtn = document.getElementById("copyBtn");
  const downloadQrBtn = document.getElementById("downloadQrBtn");

  const historyList = document.getElementById("historyList");
  const historyEmpty = document.getElementById("historyEmpty");

  const pinModal = document.getElementById("pinModal");
  const pinModalInput = document.getElementById("pinModalInput");
  const pinModalError = document.getElementById("pinModalError");
  const pinConfirmBtn = document.getElementById("pinConfirmBtn");
  const pinCancelBtn = document.getElementById("pinCancelBtn");

  const toastEl = document.getElementById("toast");

  let pendingHistoryEntry = null; // entry awaiting PIN confirmation

  // ---------- Utilities ----------
  function showToast(message) {
    toastEl.textContent = message;
    toastEl.classList.remove("hidden");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toastEl.classList.add("hidden"), 2400);
  }

  async function sha256Hex(text) {
    const data = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  function isSixDigitPin(value) {
    return /^\d{6}$/.test(value);
  }

  function loadHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveHistory(list) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
  }

  function formatDate(iso) {
    try {
      return new Intl.DateTimeFormat("fa-IR", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  }

  const PROTOCOL_LABELS = {
    vmess: "VMess",
    vless: "VLESS",
    trojan: "Trojan",
    ss: "Shadowsocks",
  };

  // ---------- Result rendering ----------
  async function renderQr(canvas, text) {
    return new Promise((resolve, reject) => {
      QRCode.toCanvas(
        canvas,
        text,
        {
          width: 220,
          margin: 1,
          color: { dark: "#0a0d18", light: "#ffffff" },
        },
        (err) => (err ? reject(err) : resolve())
      );
    });
  }

  function renderBadges(count, counts) {
    resultBadges.innerHTML = "";
    const totalBadge = document.createElement("span");
    totalBadge.className = "badge";
    totalBadge.textContent = `${toPersianDigits(count)} کانفیگ`;
    resultBadges.appendChild(totalBadge);

    Object.entries(counts || {}).forEach(([proto, n]) => {
      const b = document.createElement("span");
      b.className = "badge";
      b.textContent = `${PROTOCOL_LABELS[proto] || proto}: ${toPersianDigits(n)}`;
      resultBadges.appendChild(b);
    });
  }

  function toPersianDigits(n) {
    const map = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
    return String(n).replace(/[0-9]/g, (d) => map[d]);
  }

  async function showResult(subUrl, count, counts) {
    newLinkInput.value = subUrl;
    renderBadges(count, counts);
    await renderQr(qrCanvas, subUrl);
    resultState.classList.remove("hidden");
  }

  // ---------- History rendering ----------
  function renderHistory() {
    const items = loadHistory();
    historyList.innerHTML = "";

    if (items.length === 0) {
      historyEmpty.classList.remove("hidden");
      return;
    }
    historyEmpty.classList.add("hidden");

    items
      .slice()
      .reverse()
      .forEach((item) => {
        const el = document.createElement("div");
        el.className = "history-item";
        el.innerHTML = `
          <div class="history-item-title">${escapeHtml(item.label || "بدون عنوان")}</div>
          <div class="history-item-meta">${formatDate(item.createdAt)} · ${toPersianDigits(item.count)} کانفیگ</div>
          <div class="history-item-actions">
            <button type="button" data-action="view" data-id="${item.id}">مشاهده</button>
            <button type="button" data-action="delete" data-id="${item.id}" class="danger">حذف</button>
          </div>
        `;
        historyList.appendChild(el);
      });
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  historyList.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const id = btn.dataset.id;
    const items = loadHistory();
    const entry = items.find((it) => it.id === id);
    if (!entry) return;

    if (btn.dataset.action === "delete") {
      const filtered = items.filter((it) => it.id !== id);
      saveHistory(filtered);
      renderHistory();
      showToast("از تاریخچه حذف شد.");
      return;
    }

    if (btn.dataset.action === "view") {
      openPinModal(entry);
    }
  });

  // ---------- PIN modal ----------
  function openPinModal(entry) {
    pendingHistoryEntry = entry;
    pinModalInput.value = "";
    pinModalError.classList.add("hidden");
    pinModal.classList.remove("hidden");
    setTimeout(() => pinModalInput.focus(), 50);
  }

  function closePinModal() {
    pinModal.classList.add("hidden");
    pendingHistoryEntry = null;
  }

  pinCancelBtn.addEventListener("click", closePinModal);
  pinModal.addEventListener("click", (e) => {
    if (e.target === pinModal) closePinModal();
  });

  pinConfirmBtn.addEventListener("click", async () => {
    if (!pendingHistoryEntry) return;
    const value = pinModalInput.value.trim();
    if (!isSixDigitPin(value)) {
      pinModalError.textContent = "پین باید دقیقاً ۶ رقم باشد.";
      pinModalError.classList.remove("hidden");
      return;
    }
    const hash = await sha256Hex(value);
    if (hash !== pendingHistoryEntry.pinHash) {
      pinModalError.textContent = "پین درست نیست. دوباره امتحان کن.";
      pinModalError.classList.remove("hidden");
      return;
    }
    const entry = pendingHistoryEntry;
    closePinModal();
    errorState.classList.add("hidden");
    await showResult(entry.subUrl, entry.count, entry.counts);
    resultState.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  pinModalInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") pinConfirmBtn.click();
  });

  // ---------- Generate flow ----------
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorState.classList.add("hidden");
    resultState.classList.add("hidden");

    const url = subUrlInput.value.trim();
    const pin = pinInput.value.trim();
    const label = labelInput.value.trim();

    if (!url) {
      return showError("آدرس ساب‌لینک رو وارد کن.");
    }
    if (!isSixDigitPin(pin)) {
      return showError("کد پین باید دقیقاً ۶ رقم باشد.");
    }

    generateBtn.disabled = true;
    loadingState.classList.remove("hidden");

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "خطایی در پردازش لینک رخ داد.");
      }

      await showResult(data.subUrl, data.count, data.counts);

      const pinHash = await sha256Hex(pin);
      const items = loadHistory();
      items.push({
        id: data.id,
        label: label || null,
        subUrl: data.subUrl,
        count: data.count,
        counts: data.counts,
        pinHash,
        createdAt: new Date().toISOString(),
      });
      saveHistory(items);
      renderHistory();

      form.reset();
    } catch (err) {
      showError(err.message || "اتصال به سرور برقرار نشد. دوباره امتحان کن.");
    } finally {
      loadingState.classList.add("hidden");
      generateBtn.disabled = false;
    }
  });

  function showError(message) {
    errorState.textContent = message;
    errorState.classList.remove("hidden");
    loadingState.classList.add("hidden");
    generateBtn.disabled = false;
  }

  // Restrict PIN fields to digits only
  [pinInput, pinModalInput].forEach((el) => {
    el.addEventListener("input", () => {
      el.value = el.value.replace(/\D/g, "").slice(0, 6);
    });
  });

  // ---------- Copy & download ----------
  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(newLinkInput.value);
      showToast("لینک کپی شد.");
    } catch {
      newLinkInput.select();
      document.execCommand("copy");
      showToast("لینک کپی شد.");
    }
  });

  downloadQrBtn.addEventListener("click", () => {
    const link = document.createElement("a");
    link.download = "armoprox-qrcode.png";
    link.href = qrCanvas.toDataURL("image/png");
    link.click();
  });

  // ---------- Init ----------
  renderHistory();
})();
