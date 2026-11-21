(() => {
  const stage = document.getElementById("stage");
  for (const link of document.querySelectorAll("[data-demo]")) {
    link.addEventListener("click", event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      let app = stage.querySelector("iframe");
      if (!app) {
        app = document.createElement("iframe");
        app.src = link.href;
        app.title = "YESTER browser demo";
        app.allow = "autoplay; fullscreen; gamepad; clipboard-write; web-share";
        app.allowFullscreen = true;
        stage.replaceChildren(app);
        document.querySelector(".arrow").hidden = true;
        document.querySelector(".full").hidden = false;
      }
      app.scrollIntoView({block:"nearest"});
      app.focus({preventScroll:true});
    });
  }
})();
