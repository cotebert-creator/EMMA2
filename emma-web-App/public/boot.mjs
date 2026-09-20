try {
  await import("./app.js?v=comfort-memory-6");
} catch {
  const warning = document.getElementById("storageWarning");

  warning.textContent =
    "Emma couldn’t finish loading. Please reload this page.";

  warning.classList.remove("hidden");

  for (const id of ["sendText", "talkToggle", "talkBtn"]) {
    document.getElementById(id).disabled = true;
  }
}