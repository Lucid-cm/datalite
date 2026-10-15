async function request(path, signal) {
  let res;
  try {
    res = await fetch(path, { signal });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new Error('Could not reach DataLite. Check your connection and try again.');
  }
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON error page */
  }
  if (!res.ok) throw new Error(body?.error?.message || `Something went wrong (${res.status}).`);
  return body;
}

export const fetchLite = (url, signal) => request(`/api/lite?url=${encodeURIComponent(url)}`, signal);
export const fetchWeigh = (id, signal) => request(`/api/weigh?id=${encodeURIComponent(id)}`, signal);
