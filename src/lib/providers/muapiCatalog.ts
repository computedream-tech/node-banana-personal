import { ModelInput, ModelParameter, ProviderModel } from "@/lib/providers/types";

interface ProviderSchema {
  parameters: ModelParameter[];
  inputs: ModelInput[];
}

interface MuapiModelConfig {
  model: ProviderModel;
  endpoint: string;
  defaults?: Record<string, unknown>;
  imageInputKey?: string;
  schema?: ProviderSchema;
}

const videoAspectRatio: ModelParameter = {
  name: "aspect_ratio",
  type: "string",
  description: "Output aspect ratio",
  enum: ["16:9", "9:16", "1:1"],
  default: "16:9",
};

const muapiConfigs: Record<string, MuapiModelConfig> = {
  "gpt4o-text-to-image": {
    model: {
      id: "gpt4o-text-to-image",
      name: "GPT-4o Text to Image",
      description: "Text-to-image generation through MuAPI.",
      provider: "muapi",
      capabilities: ["text-to-image"],
      pageUrl: "https://muapi.ai/playground/gpt4o-text-to-image",
      vendor: "OpenAI",
    },
    endpoint: "gpt4o-text-to-image",
    schema: {
      parameters: [],
      inputs: [{ name: "prompt", type: "text", required: true, label: "Prompt" }],
    },
  },
  "flux-kontext-dev-i2i": {
    model: {
      id: "flux-kontext-dev-i2i",
      name: "Flux Kontext Dev I2I",
      description: "Image editing through MuAPI.",
      provider: "muapi",
      capabilities: ["image-to-image"],
      pageUrl: "https://muapi.ai/playground/flux-kontext-dev-i2i",
      vendor: "Black Forest Labs",
    },
    endpoint: "flux-kontext-dev-i2i",
    imageInputKey: "image_url",
    schema: {
      parameters: [],
      inputs: [
        { name: "prompt", type: "text", required: false, label: "Prompt" },
        { name: "image_url", type: "image", required: true, label: "Image" },
      ],
    },
  },
  "nano-banana-edit": {
    model: {
      id: "nano-banana-edit",
      name: "Nano Banana Edit",
      description: "Gemini-powered image editing through MuAPI.",
      provider: "muapi",
      capabilities: ["image-to-image"],
      pageUrl: "https://muapi.ai/playground/nano-banana-edit",
      vendor: "Google",
    },
    endpoint: "nano-banana-edit",
    imageInputKey: "image_url",
    schema: {
      parameters: [],
      inputs: [
        { name: "prompt", type: "text", required: false, label: "Prompt" },
        { name: "image_url", type: "image", required: true, label: "Image" },
      ],
    },
  },
  "seedance-v2.0-t2v": {
    model: {
      id: "seedance-v2.0-t2v",
      name: "Seedance v2.0",
      description: "Text-to-video generation through MuAPI.",
      provider: "muapi",
      capabilities: ["text-to-video"],
      pageUrl: "https://muapi.ai/playground/seedance-v2.0-t2v",
      vendor: "ByteDance",
    },
    endpoint: "seedance-v2.0-t2v",
    defaults: { aspect_ratio: "16:9" },
    schema: {
      parameters: [videoAspectRatio],
      inputs: [{ name: "prompt", type: "text", required: true, label: "Prompt" }],
    },
  },
  "seedance-v2.0-i2v": {
    model: {
      id: "seedance-v2.0-i2v",
      name: "Seedance v2.0 I2V",
      description: "Image-to-video generation through MuAPI.",
      provider: "muapi",
      capabilities: ["image-to-video"],
      pageUrl: "https://muapi.ai/playground/seedance-v2.0-i2v",
      vendor: "ByteDance",
    },
    endpoint: "seedance-v2.0-i2v",
    defaults: { aspect_ratio: "16:9" },
    imageInputKey: "image_url",
    schema: {
      parameters: [videoAspectRatio],
      inputs: [
        { name: "prompt", type: "text", required: false, label: "Prompt" },
        { name: "image_url", type: "image", required: true, label: "Image" },
      ],
    },
  },
  "veo3.1-fast-text-to-video": {
    model: {
      id: "veo3.1-fast-text-to-video",
      name: "Veo 3.1 Fast",
      description: "Fast Veo video generation through MuAPI.",
      provider: "muapi",
      capabilities: ["text-to-video"],
      pageUrl: "https://muapi.ai/playground/veo3.1-fast-text-to-video",
      vendor: "Google",
    },
    endpoint: "veo3.1-fast-text-to-video",
    defaults: { aspect_ratio: "16:9" },
    schema: {
      parameters: [videoAspectRatio],
      inputs: [{ name: "prompt", type: "text", required: true, label: "Prompt" }],
    },
  },
  "veo3.1-fast-image-to-video": {
    model: {
      id: "veo3.1-fast-image-to-video",
      name: "Veo 3.1 Fast I2V",
      description: "Fast Veo image-to-video generation through MuAPI.",
      provider: "muapi",
      capabilities: ["image-to-video"],
      pageUrl: "https://muapi.ai/playground/veo3.1-fast-image-to-video",
      vendor: "Google",
    },
    endpoint: "veo3.1-fast-image-to-video",
    defaults: { aspect_ratio: "16:9" },
    imageInputKey: "image_url",
    schema: {
      parameters: [videoAspectRatio],
      inputs: [
        { name: "prompt", type: "text", required: false, label: "Prompt" },
        { name: "image_url", type: "image", required: true, label: "Image" },
      ],
    },
  },
};

export const MUAPI_MODELS: ProviderModel[] = Object.values(muapiConfigs).map(
  (config) => config.model
);

export function getMuapiModelConfig(modelId: string): MuapiModelConfig | null {
  return muapiConfigs[modelId] ?? null;
}

export function getMuapiSchema(modelId: string): ProviderSchema {
  return muapiConfigs[modelId]?.schema ?? { parameters: [], inputs: [] };
}
