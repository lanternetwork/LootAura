function getActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs[0] || null);
    });
  });
}

function sendStartToTab(tabId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, { type: "START_SESSION" }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

function isNoReceiverError(message) {
  return (
    message.includes("Receiving end does not exist") ||
    message.includes("Could not establish connection")
  );
}

async function injectQueueScript(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content-script.js"],
  });
}

function isHttpTabUrl(url) {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

async function startSession() {
  const tab = await getActiveTab();
  if (!tab || typeof tab.id !== "number") {
    window.alert(
      "LootAura: No active tab. Open a listing site in a tab, then open this popup and click Start again."
    );
    return;
  }

  if (!isHttpTabUrl(tab.url)) {
    window.alert(
      "LootAura: Start Session needs an http(s) page. Open a supported listing site in this tab and try again."
    );
    return;
  }

  const trySend = () => sendStartToTab(tab.id);

  try {
    await trySend();
    return;
  } catch (firstErr) {
    const msg = firstErr instanceof Error ? firstErr.message : String(firstErr);
    if (isNoReceiverError(msg)) {
      try {
        await injectQueueScript(tab.id);
        await trySend();
        return;
      } catch (secondErr) {
        const msg2 = secondErr instanceof Error ? secondErr.message : String(secondErr);
        window.alert(
          "LootAura could not start after injecting into this page.\n\n" +
            "Reload the tab (F5), then try Start again.\n\n" +
            "Detail: " +
            msg2
        );
        return;
      }
    }
    window.alert(
      "LootAura could not reach this page.\n\n" +
        "Reload the tab (F5) so the extension can load, then click Start again.\n\n" +
        "Detail: " +
        msg
    );
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const button = document.getElementById("start-session");
  if (!button) return;
  button.addEventListener("click", () => {
    void startSession();
  });
});
