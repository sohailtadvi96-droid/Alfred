// Alfred Clipper — background service worker.
//
// Two ways to save:
//   • right-click an image  -> we have the direct image URL, no unfurl needed
//   • right-click the page  -> we send the page URL and let design-ingest unfurl it
//
// Every outcome is written to chrome.storage.local so the options page can show
// what happened without opening DevTools.

const MEDIUMS = [
  ["identity", "Identity"],
  ["packaging", "Packaging"],
  ["editorial", "Editorial"],
  ["motion", "Motion"],
  ["type", "Type"],
  ["web", "Web"],
  ["illustration", "Illustration"],
  ["other", "Other"],
];

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "alfred-save-image",
      title: "Save image to Alfred",
      contexts: ["image"],
    });
    chrome.contextMenus.create({
      id: "alfred-save-page",
      title: "Save page to Alfred",
      contexts: ["page", "link", "video"],
    });
    chrome.contextMenus.create({
      id: "alfred-medium-parent",
      title: "Save to Alfred as…",
      contexts: ["image", "page", "link", "video"],
    });
    for (const [slug, label] of MEDIUMS) {
      chrome.contextMenus.create({
        id: `alfred-medium-${slug}`,
        parentId: "alfred-medium-parent",
        title: label,
        contexts: ["image", "page", "link", "video"],
      });
    }
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  let medium = null;
  if (info.menuItemId.startsWith("alfred-medium-")) {
    medium = info.menuItemId.replace("alfred-medium-", "");
  } else if (
    info.menuItemId !== "alfred-save-image" &&
    info.menuItemId !== "alfred-save-page"
  ) {
    return;
  }

  await capture({
    page_url: info.pageUrl || tab?.url || null,
    image_url: info.srcUrl && info.mediaType === "image" ? info.srcUrl : null,
    link_url: info.linkUrl || null,
    title: tab?.title || null,
    medium,
  });
});

// Lets the options page run a test save.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "alfred-test") {
    capture({
      // A real, stable, publicly-hosted image — not example.com, which
      // 404s and only proves design-capture's insert works, not the
      // design-ingest fetch/thumbnail/upload path behind it.
      page_url: "https://picsum.photos/id/1015",
      image_url: "https://picsum.photos/id/1015/800",
      title: "Alfred Clipper test",
      medium: null,
    }).then((result) => sendResponse(result));
    return true; // keep the message channel open for the async reply
  }
});

async function capture(payload) {
  badge("…", "#8a8a8a");
  const started = Date.now();
  try {
    const cfg = await config();
    if (!cfg.url) throw new Error("No Supabase URL saved — fill in the options above.");
    if (!cfg.anonKey) throw new Error("No anon key saved — fill in the options above.");

    const session = await validSession(cfg);
    if (!session) {
      throw new Error("Not signed in, or the saved session expired. Sign in again above.");
    }

    const res = await fetch(`${cfg.url}/functions/v1/design-capture`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: cfg.anonKey,
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ ...payload, board_id: cfg.boardId || null }),
    });

    const bodyText = await res.text();

    if (!res.ok) {
      throw new Error(
        `The function returned ${res.status}. ${explain(res.status)}\n\n${bodyText.slice(0, 300)}`
      );
    }

    await chrome.storage.local.set({
      lastResult: {
        ok: true,
        at: new Date().toISOString(),
        ms: Date.now() - started,
        detail: bodyText.slice(0, 300),
        url: payload.image_url || payload.page_url,
      },
    });

    badge("✓", "#2f7d4f");
    setTimeout(() => badge("", "#000000"), 2000);
    return { ok: true, detail: bodyText };
  } catch (err) {
    const message = String(err?.message || err);
    await chrome.storage.local.set({
      lastResult: {
        ok: false,
        at: new Date().toISOString(),
        ms: Date.now() - started,
        detail: message,
        url: payload.image_url || payload.page_url,
      },
    });

    badge("!", "#b3261e");
    notify("Couldn't save to Alfred", message.split("\n")[0].slice(0, 180));
    return { ok: false, detail: message };
  }
}

// Turns a bare status code into something actionable.
function explain(status) {
  if (status === 401) return "Your session is invalid — sign in again on the options page.";
  if (status === 403) return "Forbidden — usually a CORS or RLS problem on the function.";
  if (status === 404) return "design-capture isn't deployed at that URL. Check the Supabase URL.";
  if (status === 400) return "The function rejected the request body.";
  if (status >= 500) return "The function errored. Check its logs in the Supabase dashboard.";
  return "";
}

// --- auth -------------------------------------------------------------------

async function config() {
  const { url, anonKey, boardId } = await chrome.storage.local.get([
    "url",
    "anonKey",
    "boardId",
  ]);
  return { url, anonKey, boardId };
}

// Returns a session with a non-expired access token, refreshing if needed.
async function validSession(cfg) {
  const { session } = await chrome.storage.local.get("session");
  if (!session) return null;

  const stillGood = session.expires_at && session.expires_at * 1000 > Date.now() + 60_000;
  if (stillGood) return session;

  const res = await fetch(`${cfg.url}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: cfg.anonKey },
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  });
  if (!res.ok) {
    await chrome.storage.local.remove("session");
    return null;
  }
  const next = await res.json();
  await chrome.storage.local.set({ session: next });
  return next;
}

// --- feedback ---------------------------------------------------------------

function badge(text, color) {
  chrome.action.setBadgeText({ text });
  if (color) chrome.action.setBadgeBackgroundColor({ color });
}

function notify(title, message) {
  chrome.notifications.create({
    type: "basic",
    iconUrl:
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
    title,
    message,
  });
}
