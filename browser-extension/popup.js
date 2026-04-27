function getActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs[0] || null);
    });
  });
}

async function startSession() {
  const tab = await getActiveTab();
  if (!tab || typeof tab.id !== "number") {
    console.warn("[LootAura] No active tab found");
    return;
  }

  chrome.tabs.sendMessage(tab.id, { type: "START_SESSION" }, () => {
    if (chrome.runtime.lastError) {
      console.warn("[LootAura] Failed to send START_SESSION:", chrome.runtime.lastError.message);
      return;
    }
    console.log("[LootAura] START_SESSION sent to tab:", tab.id);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const button = document.getElementById("start-session");
  if (!button) return;
  button.addEventListener("click", startSession);
});

