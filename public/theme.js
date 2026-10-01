/* Apply the saved appearance before CSS and React load, including offline. */
(() => {
  let theme = "light";
  try {
    if (localStorage.getItem("book-highlights-theme") === "dark")
      theme = "dark";
  } catch {
    /* A temporary preference still works without browser storage. */
  }
  document.documentElement.dataset.theme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "dark" ? "#191e22" : "#fff8e8");
})();
