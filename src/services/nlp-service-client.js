const NLP_SERVICE_URL = "http://127.0.0.1:5174";
const NLP_TIMEOUT_MS = 8000;

async function callNlpService(text, language = "auto") {
  try {
    const response = await fetchWithTimeout(`${NLP_SERVICE_URL}/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        language: language || "auto",
      }),
    });

    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

async function getNlpServiceStatus() {
  try {
    const response = await fetchWithTimeout(`${NLP_SERVICE_URL}/health`, {
      method: "GET",
    });

    if (!response.ok) {
      return { available: false, url: NLP_SERVICE_URL };
    }

    const payload = await response.json().catch(() => ({}));
    return {
      available: Boolean(payload.ok),
      url: NLP_SERVICE_URL,
    };
  } catch {
    return {
      available: false,
      url: NLP_SERVICE_URL,
    };
  }
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NLP_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  callNlpService,
  getNlpServiceStatus,
  NLP_SERVICE_URL,
};
