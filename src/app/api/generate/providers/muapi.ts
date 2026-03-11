import { GenerationInput, GenerationOutput } from "@/lib/providers/types";
import { getMuapiModelConfig } from "@/lib/providers/muapiCatalog";
import { validateMediaUrl } from "@/utils/urlValidation";

const MUAPI_API_BASE = "https://api.muapi.ai/api/v1";
const MAX_MEDIA_SIZE = 500 * 1024 * 1024;

interface MuapiSubmitResponse {
  id?: string;
  request_id?: string;
  task_id?: string;
  status?: string;
  urls?: {
    get?: string;
  };
  data?: {
    id?: string;
    request_id?: string;
    task_id?: string;
    status?: string;
    urls?: {
      get?: string;
    };
  };
  error?: string;
  message?: string;
}

interface MuapiResultResponse {
  id?: string;
  status?: string;
  error?: string;
  output?: string | string[] | Record<string, unknown>;
  data?: {
    id?: string;
    status?: string;
    error?: string;
    output?: string | string[] | Record<string, unknown>;
  };
}

function isRemoteUrl(value: string): boolean {
  return value.startsWith("http://") || value.startsWith("https://");
}

async function uploadImageToMuapi(apiKey: string, image: string): Promise<string> {
  if (isRemoteUrl(image)) {
    return image;
  }

  const match = image.match(/^data:(.+);base64,(.+)$/);
  if (!match) {
    throw new Error("MuAPI image input must be an http(s) URL or a data URL");
  }

  const [, mimeType, base64Data] = match;
  const bytes = Buffer.from(base64Data, "base64");
  const extension = mimeType.split("/")[1] || "png";

  const formData = new FormData();
  formData.append("file", new Blob([bytes], { type: mimeType }), `upload.${extension}`);

  const response = await fetch(`${MUAPI_API_BASE}/upload_file`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
    },
    body: formData,
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error || result.message || `MuAPI upload failed: ${response.status}`);
  }

  const uploadedUrl = result.url || result.file_url || result.data?.url || result.data?.file_url;
  if (typeof uploadedUrl !== "string") {
    throw new Error("MuAPI upload did not return a file URL");
  }

  return uploadedUrl;
}

function extractMuapiOutputUrl(result: MuapiResultResponse): string | null {
  const payload = result.data || result;
  const output = payload.output;

  if (typeof output === "string") return output;
  if (Array.isArray(output) && output.length > 0 && typeof output[0] === "string") {
    return output[0];
  }

  if (output && typeof output === "object") {
    const objectOutput = output as Record<string, unknown>;
    const directUrl = objectOutput.url || objectOutput.file_url || objectOutput.video_url || objectOutput.image_url;
    if (typeof directUrl === "string") return directUrl;

    const urls = objectOutput.urls;
    if (Array.isArray(urls) && urls.length > 0 && typeof urls[0] === "string") {
      return urls[0];
    }

    const videos = objectOutput.videos;
    if (Array.isArray(videos) && videos.length > 0 && typeof videos[0] === "string") {
      return videos[0];
    }

    const images = objectOutput.images;
    if (Array.isArray(images) && images.length > 0 && typeof images[0] === "string") {
      return images[0];
    }
  }

  return null;
}

async function fetchMuapiOutput(outputUrl: string, outputType: "image" | "video"): Promise<GenerationOutput> {
  const outputUrlCheck = validateMediaUrl(outputUrl);
  if (!outputUrlCheck.valid) {
    return { success: false, error: `Invalid output URL: ${outputUrlCheck.error}` };
  }

  const outputResponse = await fetch(outputUrl);
  if (!outputResponse.ok) {
    return { success: false, error: `Failed to fetch output: ${outputResponse.status}` };
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

  const outputBase64 = Buffer.from(outputArrayBuffer).toString("base64");
  return {
    success: true,
    outputs: [{ type: outputType, data: `data:${contentType};base64,${outputBase64}`, url: outputUrl }],
  };
}

async function pollMuapiTask(requestId: string, apiKey: string, pollUrl: string): Promise<MuapiResultResponse> {
  const maxWaitTime = 10 * 60 * 1000;
  const pollInterval = 2000;
  const startTime = Date.now();
  let lastStatus = "";

  while (true) {
    if (Date.now() - startTime > maxWaitTime) {
      return { status: "failed", error: "Generation timed out after 10 minutes" };
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));

    const response = await fetch(pollUrl, {
      headers: {
        "x-api-key": apiKey,
      },
    });

    const result: MuapiResultResponse = await response.json();
    const payload = result.data || result;
    const status = payload.status || "unknown";

    if (status !== lastStatus) {
      console.log(`[API:${requestId}] MuAPI task status: ${status}`);
      lastStatus = status;
    }

    if (["completed", "succeeded", "success", "failed", "error"].includes(status)) {
      return result;
    }
  }
}

export async function generateWithMuapi(
  requestId: string,
  apiKey: string,
  input: GenerationInput
): Promise<GenerationOutput> {
  const config = getMuapiModelConfig(input.model.id);
  if (!config) {
    return { success: false, error: `Unsupported MuAPI model: ${input.model.id}` };
  }

  const payload: Record<string, unknown> = {
    ...(config.defaults || {}),
    ...(input.parameters || {}),
  };

  if (input.prompt) {
    payload.prompt = input.prompt;
  }

  if (input.dynamicInputs) {
    for (const [key, value] of Object.entries(input.dynamicInputs)) {
      if (value !== null && value !== undefined && value !== "") {
        payload[key] = value;
      }
    }
  }

  const imageKey = config.imageInputKey;
  if (imageKey && input.images && input.images.length > 0 && payload[imageKey] === undefined) {
    const uploadedImages: string[] = [];
    for (const image of input.images) {
      uploadedImages.push(await uploadImageToMuapi(apiKey, image));
    }
    payload[imageKey] = imageKey.endsWith("s") ? uploadedImages : uploadedImages[0];
  }

  const submitResponse = await fetch(`${MUAPI_API_BASE}/${config.endpoint}`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const submitResult: MuapiSubmitResponse = await submitResponse.json().catch(() => ({}));
  if (!submitResponse.ok) {
    return {
      success: false,
      error: `${input.model.name}: ${submitResult.error || submitResult.message || `MuAPI error: ${submitResponse.status}`}`,
    };
  }

  const submitPayload = submitResult.data || submitResult;
  const predictionId = submitPayload.id || submitPayload.request_id || submitPayload.task_id;
  const pollUrl = submitPayload.urls?.get || `${MUAPI_API_BASE}/predictions/${encodeURIComponent(predictionId || "")}/result`;

  if (!predictionId && !submitPayload.urls?.get) {
    return { success: false, error: `${input.model.name}: MuAPI did not return a request id` };
  }

  const finalResult = await pollMuapiTask(requestId, apiKey, pollUrl);
  const finalPayload = finalResult.data || finalResult;
  const finalStatus = finalPayload.status || "unknown";
  if (["failed", "error"].includes(finalStatus)) {
    return { success: false, error: `${input.model.name}: ${finalPayload.error || "Generation failed"}` };
  }

  const outputUrl = extractMuapiOutputUrl(finalResult);
  if (!outputUrl) {
    return { success: false, error: `${input.model.name}: No output URL returned` };
  }

  const isVideoModel = input.model.capabilities.some((capability) => capability.includes("video"));
  return fetchMuapiOutput(outputUrl, isVideoModel ? "video" : "image");
}
