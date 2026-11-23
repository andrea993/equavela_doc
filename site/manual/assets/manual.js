// Equavela manual: search as you type over window.MANUAL_INDEX, and the contents menu on
// narrow screens. Plain script, so the pages also work from the file system.
(function () {
  "use strict";
  var root = window.MANUAL_ROOT || "";
  var index = window.MANUAL_INDEX || [];
  var input = document.getElementById("search");
  var list = document.getElementById("results");
  var selected = -1;

  function normalize(text) {
    return String(text).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
  }
  index.forEach(function (item) {
    item.tn = normalize(item.t);
    item.xn = normalize(item.x);
  });

  function score(item, words, whole) {
    if (item.tn === whole) return 0;
    if (item.tn.indexOf(whole) === 0) return 1;
    var total = 2;
    for (var i = 0; i < words.length; i++) {
      if (item.tn.indexOf(words[i]) >= 0) continue;
      if (item.xn.indexOf(words[i]) >= 0) { total += 1; continue; }
      return -1;
    }
    return total;
  }

  function render(query) {
    var whole = normalize(query.trim());
    list.innerHTML = "";
    selected = -1;
    if (!whole) { list.hidden = true; return; }
    var words = whole.split(/\s+/);
    var hits = [];
    index.forEach(function (item) {
      var s = score(item, words, whole);
      if (s >= 0) hits.push({ item: item, s: s });
    });
    hits.sort(function (a, b) { return a.s - b.s || a.item.t.length - b.item.t.length; });
    hits.slice(0, 30).forEach(function (hit) {
      var li = document.createElement("li");
      var a = document.createElement("a");
      a.href = root + hit.item.u;
      a.textContent = hit.item.t;
      var kind = document.createElement("span");
      kind.className = "kind";
      kind.textContent = hit.item.k;
      a.appendChild(kind);
      li.appendChild(a);
      list.appendChild(li);
    });
    if (!hits.length) {
      var none = document.createElement("li");
      none.className = "empty";
      none.textContent = "Nothing found.";
      list.appendChild(none);
    }
    list.hidden = false;
  }

  function move(step) {
    var links = list.querySelectorAll("a");
    if (!links.length) return;
    if (selected >= 0) links[selected].removeAttribute("aria-selected");
    selected = (selected + step + links.length) % links.length;
    links[selected].setAttribute("aria-selected", "true");
    links[selected].scrollIntoView({ block: "nearest" });
  }

  if (input && list) {
    input.addEventListener("input", function () { render(input.value); });
    input.addEventListener("keydown", function (event) {
      if (event.key === "ArrowDown") { move(1); event.preventDefault(); }
      else if (event.key === "ArrowUp") { move(-1); event.preventDefault(); }
      else if (event.key === "Enter") {
        var links = list.querySelectorAll("a");
        var target = links[selected >= 0 ? selected : 0];
        if (target) window.location.href = target.href;
      } else if (event.key === "Escape") { input.value = ""; render(""); }
    });
    document.addEventListener("click", function (event) {
      if (!event.target.closest(".search")) list.hidden = true;
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "/" && document.activeElement !== input) { input.focus(); event.preventDefault(); }
    });
    var asked = new URLSearchParams(window.location.search).get("q");
    if (asked) { input.value = asked; render(asked); }
  }

  var menu = document.querySelector(".menu");
  var nav = document.getElementById("nav");
  if (menu && nav) menu.addEventListener("click", function () { nav.classList.toggle("open"); });
})();
