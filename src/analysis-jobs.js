const { analyzeText } = require("./services/analysis-service");

const jobs = new Map();
const MAX_JOBS = 100;
const STALL_TIMEOUT_MS = 8000;

function createAnalysisJob(input) {
  const job = {
    id: createId(),
    status: "queued",
    stage: "queued",
    progress: 2,
    message: "任务已创建，等待开始。",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    partial: null,
    result: null,
    error: null,
  };

  jobs.set(job.id, job);
  trimJobs();
  runJob(job.id, input);
  return snapshot(job);
}

function getJob(jobId) {
  const job = jobs.get(jobId);
  return job ? snapshot(job) : null;
}

async function runJob(jobId, input) {
  const job = jobs.get(jobId);
  if (!job) return;

  await new Promise((resolve) => setImmediate(resolve));

  try {
    updateJob(job, {
      status: "running",
      stage: "classifying",
      progress: 8,
      message: "正在识别语言、文本场景和行业。",
    });
    armStallTimer(job);

    const payload = await analyzeText({
      ...input,
      onProgress(progressPatch) {
        updateJob(job, {
          status: progressPatch.stage === "completed" ? "completed" : "running",
          ...progressPatch,
        });
        armStallTimer(job);
      },
    });

    clearStallTimer(job);
    updateJob(job, {
      status: "completed",
      stage: "completed",
      progress: 100,
      message: "分析完成。",
      result: payload,
    });
  } catch (error) {
    clearStallTimer(job);
    updateJob(job, {
      status: "failed",
      stage: "failed",
      progress: job.progress || 0,
      message: error.message || "分析失败。",
      error: error.message || "分析失败。",
    });
  }
}

function updateJob(job, patch) {
  Object.assign(job, patch, {
    updatedAt: new Date().toISOString(),
  });
}

function armStallTimer(job) {
  clearStallTimer(job);
  job.stallTimer = setTimeout(() => {
    if (job.status === "running") {
      updateJob(job, {
        status: "stalled",
        message: "当前任务耗时偏长，可能正在等待外部模型或磁盘写入。",
      });
    }
  }, STALL_TIMEOUT_MS);

  if (typeof job.stallTimer.unref === "function") {
    job.stallTimer.unref();
  }
}

function clearStallTimer(job) {
  if (!job.stallTimer) return;
  clearTimeout(job.stallTimer);
  job.stallTimer = null;
}

function snapshot(job) {
  const now = Date.now();
  const createdAt = new Date(job.createdAt).getTime();
  const updatedAt = new Date(job.updatedAt).getTime();
  const idleMs = now - updatedAt;

  return {
    id: job.id,
    status: job.status,
    stage: job.stage,
    progress: job.progress,
    message: job.message,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    partial: job.partial,
    result: job.result,
    error: job.error,
    elapsedMs: createdAt ? now - createdAt : 0,
    idleMs,
    stalled: job.status === "stalled" || (idleMs > STALL_TIMEOUT_MS && job.status === "running"),
  };
}

function trimJobs() {
  if (jobs.size <= MAX_JOBS) return;
  const entries = [...jobs.values()].sort(
    (a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime(),
  );

  while (jobs.size > MAX_JOBS && entries.length) {
    const oldest = entries.shift();
    jobs.delete(oldest.id);
  }
}

function createId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

module.exports = {
  createAnalysisJob,
  getJob,
};
