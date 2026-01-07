// Disable console noise
if (import.meta.env.DEV) {
  const { ReactiveElement } = await import("@lit/reactive-element");
  ReactiveElement.disableWarning?.("change-in-update");
}

await import("./main.js");