import { GenerationInput, GenerationOutput } from "@/lib/providers/types";
import { getPoyoModelConfig } from "@/lib/providers/poyoCatalog";
import { validateMediaUrl } from "@/utils/urlValidation";

const POYO_API_BASE = "https://api.poyo.ai";
const MAX_MEDIA_SIZE = 500 * 1024 * 1024;
const SUCCESS_STATUSES = new Set(["finished", "completed", "succeeded", "success"]);
const FAILURE_STATUSES = new Set(["failed", "error", "cancelled", "canceled"]);

interface PoyoMediaFile {
  file_url?: string;
  file_type?: string;
  url?: string;
  output_url?: string;
  download_url?: string;
  type?: string;
  mime_type?: string;
}

interface PoyoTaskData {
  task_id?: string;
  status?: string;
  progress?: number;
  files?: PoyoMediaFile[];
  output?: unknown;
  result?: unknown;
  url?: string;
  file_url?: string;
  created_time?: string;
  error_message?: string | null;
}

interface PoyoSubmitResponse {
  code?: number;
  data?: PoyoTaskData;
  error?: {
    message?: string;
    type?: string;
  };
}

interface PoyoStatusResponse {
  code?: number;
  data?: PoyoTaskData;
  error?: {
    message?: string;
  };
}

function isRemoteUrl(value: string): boolean {
  return value.startsWith("http://") || value.startsWith("https://");
}

function normalizeStatus(status?: string): string {
  return (status || "unknown").toLowerCase();
}

function extractDirectUrl(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const url = candidate.file_url || candidate.url || candidate.output_url || candidate.download_url;
  return typeof url === "string" ? url : null;
}

function extractPoyoOutputFiles(result: PoyoStatusResponse): PoyoMediaFile[] {
  const seen = new Set<string>();
  const collected: PoyoMediaFile[] = [];

  const pushFile = (file: PoyoMediaFile) => {
    const url = file.file_url || file.url || file.output_url || file.download_url;
    if (!url || typeof url !== "string" || seen.has(url)) {
      return;
    }
    seen.add(url);
    collected.push(file);
  };

  const pushStringArray = (items: unknown, fileType?: string) => {
    if (!Array.isArray(items)) return;
    for (const item of items) {
      if (typeof item === "string") {
        pushFile({ file_url: item, file_type: fileType });
      } else if (item && typeof item === "object") {
        const url = extractDirectUrl(item);
        if (url) {
          pushFile({ ...(item as PoyoMediaFile), file_url: url, file_type: (item as PoyoMediaFile).file_type || fileType });
        }
      }
    }
  };

  const inspectContainer = (value: unknown) => {
    if (!value || typeof value !== "object") {
      return;
    }

    const container = value as Record<string, unknown>;

    if (Array.isArray(container.files)) {
      for (const file of container.files) {
        if (file && typeof file === "object") {
          pushFile(file as PoyoMediaFile);
        }
      }
    }

    if (Array.isArray(container.outputs)) {
      for (const output of container.outputs) {
        if (output && typeof output === "object") {
          const outputObject = output as Record<string, unknown>;
          if (Array.isArray(outputObject.files)) {
            for (const file of outputObject.files) {
              if (file && typeof file === "object") {
                pushFile(file as PoyoMediaFile);
              }
            }
          }
          const directUrl = extractDirectUrl(output);
          if (directUrl) {
            pushFile(output as PoyoMediaFile);
          }
        } else if (typeof output === "string") {
          pushFile({ file_url: output });
        }
      }
    }

    pushStringArray(container.images, "image");
    pushStringArray(container.videos, "video");

    const directUrl = extractDirectUrl(container);
    if (directUrl) {
      pushFile(container as PoyoMediaFile);
    }
  };

  inspectContainer(result);
  inspectContainer(result.data);
  inspectContainer(result.data?.output);
  inspectContainer(result.data?.result);

  return collected;
}

async function fetchPoyoOutput(
  requestId: string,
  outputUrl: string,
  outputType: "image" | "video"
): Promise<GenerationOutput> {
  const outputUrlCheck = validateMediaUrl(outputUrl);
  if (!outputUrlCheck.valid) {
    return { success: false, error: `Invalid output URL: ${outputUrlCheck.error}` };
  }

  try {
    const outputResponse = await fetch(outputUrl);
    if (!outputResponse.ok) {
      if (outputType === "image") {
        console.warn(`[API:${requestId}] Poyo image fetch failed, falling back to remote URL: ${outputResponse.status}`);
        return {
          success: true,
          outputs: [{ type: "image", data: outputUrl, url: outputUrl }],
        };
      }

      return {
        success: true,
        outputs: [{ type: "video", data: "", url: outputUrl }],
      };
    }

    const contentLength = parseInt(outputResponse.headers.get("content-length") || "0", 10);
    if (!Number.isNaN(contentLength) && contentLength > MAX_MEDIA_SIZE) {
      return { success: false, error: `Media too large: ${(contentLength / (1024 * 1024)).toFixed(0)}MB > 500MB limit` };
    }

    const outputArrayBuffer = await outputResponse.arrayBuffer();
    if (outputArrayBuffer.byteLength > MAX_MEDIA_SIZE) {
      return { success: false, error: `Media too large: ${(outputArrayBuffer.byteLength / (1024 * 1024)).toFixed(0)}MB > 500MB limit` };
    }

    const outputSizeMB = outputArrayBuffer.byteLength / (1024 * 1024);
    const contentType = outputResponse.headers.get("content-type") || (outputType === "video" ? "video/mp4" : "image/png");

    if (outputType === "video" && outputSizeMB > 20) {
      return {
        success: true,
        outputs: [{ type: "video", data: "", url: outputUrl }],
      };
    }

    console.log(`[API:${requestId}] Poyo output: ${contentType}, ${outputSizeMB.toFixed(2)}MB`);
    const outputBase64 = Buffer.from(outputArrayBuffer).toString("base64");
    return {
      success: true,
      outputs: [{ type: outputType, data: `data:${contentType};base64,${outputBase64}`, url: outputUrl }],
    };
  } catch (error) {
    console.warn(`[API:${requestId}] Poyo output fetch threw, using URL fallback`, error);
    if (outputType === "image") {
      return {
        success: true,
        outputs: [{ type: "image", data: outputUrl, url: outputUrl }],
      };
    }

    return {
      success: true,
      outputs: [{ type: "video", data: "", url: outputUrl }],
    };
  }
}

async function pollPoyoTask(
  requestId: string,
  apiKey: string,
  taskId: string
): Promise<PoyoStatusResponse> {
  const maxWaitTime = 10 * 60 * 1000;
  let pollInterval = 2000;
  const startTime = Date.now();
  let lastStatus = "";
  let finishedWithoutFilesCount = 0;

  while (true) {
    if (Date.now() - startTime > maxWaitTime) {
      return {
        data: {
          task_id: taskId,
          status: "failed",
          error_message: "Generation timed out after 10 minutes",
        },
      };
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));

    const response = await fetch(`${POYO_API_BASE}/api/generate/status/${encodeURIComponent(taskId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (response.status === 429 || response.status >= 500) {
      pollInterval = Math.min(pollInterval * 2, 10000);
      continue;
    }

    const result: PoyoStatusResponse = await response.json().catch(() => ({}));
    const status = normalizeStatus(result.data?.status);

    if (status !== lastStatus) {
      console.log(`[API:${requestId}] Poyo task status: ${status}`);
      lastStatus = status;
    }

    if (FAILURE_STATUSES.has(status)) {
      return result;
    }

    if (SUCCESS_STATUSES.has(status)) {
      const outputFiles = extractPoyoOutputFiles(result);
      if (outputFiles.length > 0) {
        return result;
      }

      finishedWithoutFilesCount += 1;
      if (finishedWithoutFilesCount >= 3) {
        return result;
      }
      continue;
    }

    pollInterval = 2000;
  }
}

export async function generateWithPoyo(
  requestId: string,
  apiKey: string,
  input: GenerationInput
): Promise<GenerationOutput> {
  const config = getPoyoModelConfig(input.model.id);
  if (!config) {
    return { success: false, error: `Unsupported Poyo model: ${input.model.id}` };
  }

  const payloadInput: Record<string, unknown> = {
    ...(config.defaults || {}),
    ...(input.parameters || {}),
  };

  if (input.prompt) {
    payloadInput.prompt = input.prompt;
  }

  if (input.dynamicInputs) {
    for (const [key, value] of Object.entries(input.dynamicInputs)) {
      if (value !== null && value !== undefined && value !== "") {
        payloadInput[key] = value;
      }
    }
  }

  const imageKey = config.imageInputKey;
  if (imageKey && input.images && input.images.length > 0 && payloadInput[imageKey] === undefined) {
    const remoteImages = input.images.filter((image) => isRemoteUrl(image));
    if (remoteImages.length !== input.images.length) {
      return {
        success: false,
        error: "Poyo.ai image-conditioned models currently require publicly accessible image URLs. Local/data URL inputs are not supported by the documented upload flow.",
      };
    }
    payloadInput[imageKey] = imageKey.endsWith("s") ? remoteImages : remoteImages[0];
  }

  const submitResponse = await fetch(`${POYO_API_BASE}/api/generate/submit`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.model.id,
      input: payloadInput,
    }),
  });

  const submitResult: PoyoSubmitResponse = await submitResponse.json().catch(() => ({}));
  if (!submitResponse.ok || (submitResult.code && submitResult.code >= 400)) {
    const errorMessage = submitResult.error?.message || `Poyo API error: ${submitResponse.status}`;
    return { success: false, error: `${input.model.name}: ${errorMessage}` };
  }

  const taskId = submitResult.data?.task_id;
  if (!taskId) {
    return { success: false, error: "Poyo.ai did not return a task_id" };
  }

  const finalResult = await pollPoyoTask(requestId, apiKey, taskId);
  const finalStatus = normalizeStatus(finalResult.data?.status);
  if (FAILURE_STATUSES.has(finalStatus)) {
    return {
      success: false,
      error: `${input.model.name}: ${finalResult.data?.error_message || finalResult.error?.message || "Generation failed"}`,
    };
  }

  const expectedOutputType = input.model.capabilities.some((capability) => capability.includes("video")) ? "video" : "image";
  const outputFiles = extractPoyoOutputFiles(finalResult);
  const preferredOutput =
    outputFiles.find((file) => (file.file_type || file.type || "").toLowerCase() === expectedOutputType) ||
    outputFiles[0];

  const outputUrl = preferredOutput?.file_url || preferredOutput?.url || preferredOutput?.output_url || preferredOutput?.download_url;
  if (!outputUrl) {
    return { success: false, error: `${input.model.name}: No output file returned from Poyo status response` };
  }

  const outputType = ((preferredOutput?.file_type || preferredOutput?.type || expectedOutputType).toLowerCase().includes("video")
    ? "video"
    : "image") as "image" | "video";

  return fetchPoyoOutput(requestId, outputUrl, outputType);
}