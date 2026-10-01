export default {
  fetch(request, env) {
    // Preserve the public URL, Origin, cookies, body, and response headers.
    // The app Worker still enforces authentication and same-origin mutations.
    return env.BOOK_APP.fetch(request);
  },
};
