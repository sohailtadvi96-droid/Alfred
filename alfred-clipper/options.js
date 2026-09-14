// Alfred Clipper — options page.

const $ = (id) => document.getElementById(id);
const status = (msg) => ($("status").textContent = msg);

(async function init() {
  const saved = await chrome.storage.local.get(["url", "anonKey", "boardId", "session"]);
  $("url").value = saved.url || "";
  $("anonKey").value = saved.anonKey || "";

  if (saved.session) {
    $("signin").hidden = true;
    $("signout").hidden = false;
    status("Signed in.");
    loadBoards(saved.boardId);
  }
})();

$("signin").addEventListener("click", async () => {
  const url = $("url").value.trim().replace(/\/$/, "");
  const anonKey = $("anonKey").value.trim();
  if (!url || !anonKey) return status("Add the Supabase URL and anon key first.");

  await chrome.storage.local.set({ url, anonKey });
  status("Signing in…");

  try {
    const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: anonKey },
      body: JSON.stringify({
        email: $("email").value.trim(),
        password: $("password").value,
      }),
    });
    if (!res.ok) throw new Error((await res.json()).error_description || "Sign-in failed");

    const session = await res.json();
    await chrome.storage.local.set({ session });
    $("password").value = "";
    $("signin").hidden = true;
    $("signout").hidden = false;
    status("Signed in.");
    loadBoards();
  } catch (err) {
    status(String(err.message || err));
  }
});

$("signout").addEventListener("click", async () => {
  await chrome.storage.local.remove("session");
  $("signin").hidden = false;
  $("signout").hidden = true;
  $("board").innerHTML = '<option value="">— none (inbox) —</option>';
  status("Signed out.");
});

$("save").addEventListener("click", async () => {
  await chrome.storage.local.set({
    url: $("url").value.trim().replace(/\/$/, ""),
    anonKey: $("anonKey").value.trim(),
    boardId: $("board").value || null,
  });
  status("Saved.");
});

async function loadBoards(selected) {
  const { url, anonKey, session } = await chrome.storage.local.get([
    "url",
    "anonKey",
    "session",
  ]);
  if (!session) return;

  try {
    const res = await fetch(
      `${url}/rest/v1/design_boards?select=id,name&order=name.asc`,
      {
        headers: { apikey: anonKey, Authorization: `Bearer ${session.access_token}` },
      }
    );
    if (!res.ok) throw new Error(`Couldn't load boards (HTTP ${res.status})`);

    const boards = await res.json();
    const select = $("board");
    select.innerHTML = '<option value="">— none (inbox) —</option>';
    for (const b of boards) {
      const opt = document.createElement("option");
      opt.value = b.id;
      opt.textContent = b.name;
      if (b.id === selected) opt.selected = true;
      select.appendChild(opt);
    }
  } catch (err) {
    status(String(err.message || err));
  }
}

// --- diagnostics ------------------------------------------------------------

$("test").addEventListener("click", async () => {
  status("Running a test save…");
  chrome.runtime.sendMessage({ type: "alfred-test" }, () => showLast());
});

async function showLast() {
  const { lastResult } = await chrome.storage.local.get("lastResult");
  const box = $("last");
  if (!lastResult) {
    box.textContent = "";
    box.className = "";
    return;
  }
  const when = new Date(lastResult.at).toLocaleString();
  box.className = lastResult.ok ? "ok" : "bad";
  box.textContent =
    (lastResult.ok ? "Last save succeeded" : "Last save failed") +
    ` — ${when} (${lastResult.ms}ms)\n\n` +
    lastResult.detail;
  status("");
}

chrome.storage.onChanged.addListener((changes) => {
  if (changes.lastResult) showLast();
});

showLast();
