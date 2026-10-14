/*
 * Mikee video motion. Builds one paused GSAP timeline from the composition's markup, so the same file drives
 * the HyperFrames render (which seeks the timeline frame by frame) and the in-app preview (which plays it).
 *   .scene[data-start][data-duration]      a scene, shown for its window
 *   [data-anim="rise|fade|pop|wipe|line"]  an entrance, data-at seconds after the scene starts
 *   [data-kb]                              a slow push-in on a photo for the whole scene
 */
(function () {
  var root = document.getElementById("root");
  var tl = gsap.timeline({ paused: true });
  var scenes = Array.prototype.slice.call(root.querySelectorAll(".scene"));
  var total = Number(root.getAttribute("data-duration"));
  var EASE = "power3.out";

  scenes.forEach(function (scene, i) {
    var start = Number(scene.getAttribute("data-start"));
    var dur = Number(scene.getAttribute("data-duration"));
    var last = i === scenes.length - 1;
    tl.set(scene, { autoAlpha: 1 }, start);

    scene.querySelectorAll("[data-kb]").forEach(function (el) {
      tl.fromTo(el, { scale: 1.12 }, { scale: 1, duration: dur, ease: "none" }, start);
    });

    scene.querySelectorAll("[data-anim]").forEach(function (el) {
      var at = start + Number(el.getAttribute("data-at") || 0);
      switch (el.getAttribute("data-anim")) {
        case "rise":
          tl.fromTo(el, { autoAlpha: 0, y: 70 }, { autoAlpha: 1, y: 0, duration: 0.8, ease: EASE }, at);
          break;
        case "pop":
          tl.fromTo(el, { autoAlpha: 0, scale: 0.86 }, { autoAlpha: 1, scale: 1, duration: 0.6, ease: "back.out(1.6)" }, at);
          break;
        case "wipe":
          tl.fromTo(el, { clipPath: "inset(0% 0% 0% 100%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.9, ease: "power3.inOut" }, at);
          break;
        case "line":
          tl.fromTo(el, { scaleX: 0 }, { scaleX: 1, duration: 0.7, ease: "power3.inOut" }, at);
          break;
        default:
          tl.fromTo(el, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.7, ease: "power1.out" }, at);
      }
    });

    if (!last) {
      tl.to(scene, { autoAlpha: 0, duration: 0.35, ease: "power1.in" }, start + dur - 0.35);
      tl.set(scene, { autoAlpha: 0 }, start + dur);
    }
  });
  tl.set({}, {}, total);

  window.__timelines = window.__timelines || {};
  window.__timelines.root = tl;

  // In the app's preview there is no renderer: fit the frame to the window and play it on a loop.
  if (document.documentElement.hasAttribute("data-preview")) {
    var fit = function () {
      var w = Number(root.getAttribute("data-width"));
      var h = Number(root.getAttribute("data-height"));
      var s = Math.min(window.innerWidth / w, window.innerHeight / h);
      root.style.transform = "scale(" + s + ")";
    };
    fit();
    window.addEventListener("resize", fit);
    tl.repeat(-1).repeatDelay(0.6);
    var go = function () { tl.play(0); };
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(go); else go();
  }
})();
