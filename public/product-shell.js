"use strict";
(function (root) {
  const config = root.AriadneProductConfig;
  if (!config || !["web", "skill"].includes(config.kind)) throw Error("PRODUCT_CONFIG_REQUIRED");
  root.AriadneProduct = Object.freeze({
    ...config,
    runtime(stored) {
      if (config.kind === "skill") return stored?.mode === "model" && stored.provider === config.runtime.provider && stored.model
        ? stored : { ...config.runtime };
      if (stored?.mode === "local" || !stored) return { mode: "local" };
      return config.providers.includes(stored.provider) ? stored : { mode: "local" };
    },
  });
  document.documentElement.dataset.ariadneProduct = config.kind;
  document.addEventListener("DOMContentLoaded", () => {
    if (config.kind !== "skill") return;
    for (const link of document.querySelectorAll('nav a[href="/index.html"]')) link.hidden = true;
    if (!config.agent_ready) {
      const notice = document.createElement("p");
      notice.className = "v1-status"; notice.setAttribute("role", "status");
      notice.textContent = "Codex 暂不可用，已保存资料仍可查看。请回到 Agent 运行 Ariadne doctor，检查登录和依赖后重新打开。";
      document.querySelector("main")?.prepend(notice);
    }
  });
}(globalThis));
