import { ModelInput, ModelParameter, ProviderModel } from "@/lib/providers/types";

interface ProviderSchema {
  parameters: ModelParameter[];
  inputs: ModelInput[];
}

interface PoyoModelConfig {
  model: ProviderModel;
  defaults?: Record<string, unknown>;
  imageInputKey?: string;
  schema?: ProviderSchema;
}

const defaultImageAspectRatios = ["1:1", "4:3", "3:4", "16:9", "9:16"];
const flexibleImageAspectRatios = ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3"];
const documentedGrokImageAspectRatios = ["2:3", "3:2", "1:1", "9:16", "16:9"];
const documentedNanoBananaSizes = ["16:9"];
const documentedNanoBanana2NewAspectRatios = ["1:1", "16:9", "9:16", "4:3", "3:4", "1:4", "4:1", "1:8", "8:1"];
const defaultVideoAspectRatios = ["16:9", "9:16", "1:1"];
const flexibleVideoAspectRatios = ["16:9", "9:16", "1:1", "3:2", "2:3"];
const documentedGrokVideoAspectRatios = ["1:1", "2:3", "3:2"];
const soraStyleOptions = ["comic", "selfie", "thanksgiving", "nostalgic", "anime", "news"];

function createImageAspectRatioParam(values?: string[]): ModelParameter {
  if (!values || values.length === 0) {
    return {
      name: "size",
      type: "string",
      label: "Aspect ratio / size",
      description: "Freeform size/aspect ratio value documented by Poyo.",
      placeholder: "16:9",
      helperText: "Use WIDTH:HEIGHT like 16:9, 9:16, or 1:1.",
      validationType: "aspect-ratio",
      validationMessage: "Use WIDTH:HEIGHT like 16:9 or 9:16.",
    };
  }

  return {
    name: "size",
    type: "string",
    description: "Output aspect ratio",
    enum: values,
    default: values[0] ?? "1:1",
  };
}

function createVideoAspectRatioParam(values = defaultVideoAspectRatios): ModelParameter {
  return {
    name: "aspect_ratio",
    type: "string",
    description: "Output aspect ratio",
    enum: values,
    default: values[0] ?? "16:9",
  };
}

function createDurationParam(defaultValue: number, values?: number[]): ModelParameter {
  return {
    name: "duration",
    type: "integer",
    description: "Video duration in seconds",
    ...(values ? { enum: values } : {}),
    default: defaultValue,
  };
}

function createResolutionParam(values: string[], defaultValue: string): ModelParameter {
  return {
    name: "resolution",
    type: "string",
    description: "Output resolution",
    enum: values,
    default: defaultValue,
  };
}

function createCountParam(defaultValue = 1): ModelParameter {
  return {
    name: "n",
    type: "integer",
    description: "Number of outputs to generate",
    default: defaultValue,
    minimum: 1,
  };
}

function createBooleanParam(name: string, description: string, defaultValue: boolean): ModelParameter {
  return {
    name,
    type: "boolean",
    description,
    default: defaultValue,
  };
}

function createEnumParam(
  name: string,
  description: string,
  values: string[],
  defaultValue: string
): ModelParameter {
  return {
    name,
    type: "string",
    description,
    enum: values,
    default: defaultValue,
  };
}

function createImageConfig(options: {
  id: string;
  name: string;
  description: string;
  pageUrl: string;
  vendor: string;
  imageOptional?: boolean;
  imageRequired?: boolean;
  aspectRatios?: string[];
  freeformSize?: boolean;
  extraParameters?: ModelParameter[];
}): PoyoModelConfig {
  const imageOptional = options.imageOptional ?? false;
  const imageRequired = options.imageRequired ?? false;
  const sizeValues = options.freeformSize ? undefined : options.aspectRatios ?? defaultImageAspectRatios;

  return {
    model: {
      id: options.id,
      name: options.name,
      description: options.description,
      provider: "poyo",
      capabilities: imageRequired
        ? ["image-to-image"]
        : imageOptional
        ? ["text-to-image", "image-to-image"]
        : ["text-to-image"],
      pageUrl: options.pageUrl,
      vendor: options.vendor,
    },
    defaults: sizeValues ? { size: sizeValues[0] ?? "1:1" } : undefined,
    imageInputKey: imageOptional || imageRequired ? "image_urls" : undefined,
    schema: {
      parameters: [
        createImageAspectRatioParam(sizeValues),
        ...(options.extraParameters ?? []),
      ],
      inputs: [
        {
          name: "prompt",
          type: "text",
          required: !imageRequired,
          label: "Prompt",
        },
        ...(imageOptional || imageRequired
          ? [
              {
                name: "image_urls",
                type: "image",
                required: imageRequired,
                label: "Image",
                isArray: true,
              } satisfies ModelInput,
            ]
          : []),
      ],
    },
  };
}

function createVideoConfig(options: {
  id: string;
  name: string;
  description: string;
  pageUrl: string;
  vendor: string;
  imageOptional?: boolean;
  imageRequired?: boolean;
  aspectRatios?: string[];
  durationDefault?: number;
  durationOptions?: number[];
  extraParameters?: ModelParameter[];
}): PoyoModelConfig {
  const imageOptional = options.imageOptional ?? false;
  const imageRequired = options.imageRequired ?? false;
  const durationDefault = options.durationDefault ?? 8;

  return {
    model: {
      id: options.id,
      name: options.name,
      description: options.description,
      provider: "poyo",
      capabilities: imageRequired
        ? ["image-to-video"]
        : imageOptional
        ? ["text-to-video", "image-to-video"]
        : ["text-to-video"],
      pageUrl: options.pageUrl,
      vendor: options.vendor,
    },
    defaults: {
      aspect_ratio: (options.aspectRatios ?? defaultVideoAspectRatios)[0] ?? "16:9",
      duration: durationDefault,
    },
    imageInputKey: imageOptional || imageRequired ? "image_urls" : undefined,
    schema: {
      parameters: [
        createVideoAspectRatioParam(options.aspectRatios),
        createDurationParam(durationDefault, options.durationOptions),
        ...(options.extraParameters ?? []),
      ],
      inputs: [
        {
          name: "prompt",
          type: "text",
          required: !imageRequired,
          label: "Prompt",
        },
        ...(imageOptional || imageRequired
          ? [
              {
                name: "image_urls",
                type: "image",
                required: imageRequired,
                label: "Image",
                isArray: true,
              } satisfies ModelInput,
            ]
          : []),
      ],
    },
  };
}

const poyoConfigs: Record<string, PoyoModelConfig> = {
  "gpt-4o-image": createImageConfig({
    id: "gpt-4o-image",
    name: "GPT-4o Image",
    description: "OpenAI image generation through Poyo.ai.",
    pageUrl: "https://docs.poyo.ai/api-manual/image-series/gpt-4o-image",
    vendor: "OpenAI",
    imageOptional: true,
    extraParameters: [createCountParam()],
  }),
  "gpt-4o-image-edit": createImageConfig({
    id: "gpt-4o-image-edit",
    name: "GPT-4o Image Edit",
    description: "OpenAI image editing through Poyo.ai.",
    pageUrl: "https://docs.poyo.ai/api-manual/image-series/gpt-4o-image",
    vendor: "OpenAI",
    imageRequired: true,
    extraParameters: [createCountParam()],
  }),
  "seedream-4.5": createImageConfig({
    id: "seedream-4.5",
    name: "Seedream 4.5",
    description: "ByteDance image generation through Poyo.ai.",
    pageUrl: "https://docs.poyo.ai/api-manual/image-series/seedream-4-5",
    vendor: "ByteDance",
    imageOptional: true,
    extraParameters: [createCountParam()],
  }),
  "seedream-4.5-edit": createImageConfig({
    id: "seedream-4.5-edit",
    name: "Seedream 4.5 Edit",
    description: "ByteDance image editing through Poyo.ai.",
    pageUrl: "https://docs.poyo.ai/api-manual/image-series/seedream-4-5",
    vendor: "ByteDance",
    imageRequired: true,
    extraParameters: [createCountParam()],
  }),
  "seedream-5.0-lite": createImageConfig({
    id: "seedream-5.0-lite",
    name: "Seedream 5.0 Lite",
    description: "ByteDance image generation through Poyo.ai.",
    pageUrl: "https://docs.poyo.ai/api-manual/image-series/seedream-5-0-lite",
    vendor: "ByteDance",
    imageOptional: true,
    aspectRatios: documentedNanoBananaSizes,
    extraParameters: [
      createResolutionParam(["2K", "3K"], "2K"),
      createCountParam(),
    ],
  }),
  "seedream-5.0-lite-edit": createImageConfig({
    id: "seedream-5.0-lite-edit",
    name: "Seedream 5.0 Lite Edit",
    description: "ByteDance image editing through Poyo.ai.",
    pageUrl: "https://docs.poyo.ai/api-manual/image-series/seedream-5-0-lite",
    vendor: "ByteDance",
    imageRequired: true,
    aspectRatios: documentedNanoBananaSizes,
    extraParameters: [
      createResolutionParam(["2K", "3K"], "2K"),
      createCountParam(),
    ],
  }),
  "nano-banana": createImageConfig({
    id: "nano-banana",
    name: "Nano Banana",
    description: "Gemini 2.5 Flash image generation through Poyo.ai.",
    pageUrl: "https://docs.poyo.ai/api-manual/image-series/nano-banana",
    vendor: "Google",
    imageOptional: true,
    aspectRatios: documentedNanoBananaSizes,
    extraParameters: [createCountParam()],
  }),
  "nano-banana-edit": createImageConfig({
    id: "nano-banana-edit",
    name: "Nano Banana Edit",
    description: "Gemini 2.5 Flash image editing through Poyo.ai.",
    pageUrl: "https://docs.poyo.ai/api-manual/image-series/nano-banana",
    vendor: "Google",
    imageRequired: true,
    aspectRatios: documentedNanoBananaSizes,
    extraParameters: [createCountParam()],
  }),
  "nano-banana-2": createImageConfig({
    id: "nano-banana-2",
    name: "Nano Banana 2",
    description: "Gemini 3 Pro image generation through Poyo.ai.",
    pageUrl: "https://docs.poyo.ai/api-manual/image-series/nano-banana-2",
    vendor: "Google",
    imageOptional: true,
    aspectRatios: documentedNanoBananaSizes,
    extraParameters: [createResolutionParam(["1K", "2K", "4K"], "2K"), createCountParam()],
  }),
  "nano-banana-2-edit": createImageConfig({
    id: "nano-banana-2-edit",
    name: "Nano Banana 2 Edit",
    description: "Gemini 3 Pro image editing through Poyo.ai.",
    pageUrl: "https://docs.poyo.ai/api-manual/image-series/nano-banana-2",
    vendor: "Google",
    imageRequired: true,
    aspectRatios: documentedNanoBananaSizes,
    extraParameters: [createResolutionParam(["1K", "2K", "4K"], "2K"), createCountParam()],
  }),
  "nano-banana-2-new": createImageConfig({
    id: "nano-banana-2-new",
    name: "Nano Banana 2 New",
    description: "Gemini 3.1 Flash Image Preview generation through Poyo.ai.",
    pageUrl: "https://docs.poyo.ai/api-manual/image-series/nano-banana-2-new",
    vendor: "Google",
    imageOptional: true,
    aspectRatios: documentedNanoBanana2NewAspectRatios,
    extraParameters: [createResolutionParam(["1K", "2K", "4K"], "2K")],
  }),
  "nano-banana-2-new-edit": createImageConfig({
    id: "nano-banana-2-new-edit",
    name: "Nano Banana 2 New Edit",
    description: "Gemini 3.1 Flash Image Preview editing through Poyo.ai.",
    pageUrl: "https://docs.poyo.ai/api-manual/image-series/nano-banana-2-new",
    vendor: "Google",
    imageRequired: true,
    aspectRatios: documentedNanoBanana2NewAspectRatios,
    extraParameters: [createResolutionParam(["1K", "2K", "4K"], "2K")],
  }),
  "grok-imagine-image": createImageConfig({
    id: "grok-imagine-image",
    name: "Grok Imagine Image",
    description: "Grok image generation through Poyo.ai.",
    pageUrl: "https://docs.poyo.ai/api-manual/image-series/grok-imagine-image",
    vendor: "xAI",
    imageOptional: true,
    aspectRatios: documentedGrokImageAspectRatios,
  }),
  "z-image": createImageConfig({
    id: "z-image",
    name: "Z-Image",
    description: "Z-Image text-to-image generation through Poyo.ai.",
    pageUrl: "https://docs.poyo.ai/api-manual/image-series/z-image",
    vendor: "Z.ai",
  }),
  "veo3.1-fast": createVideoConfig({
    id: "veo3.1-fast",
    name: "Veo 3.1 Fast",
    description: "Fast Veo 3.1 video generation through Poyo.ai.",
    pageUrl: "https://docs.poyo.ai/api-manual/video-series/veo-3-1",
    vendor: "Google",
    imageOptional: true,
    durationDefault: 8,
    durationOptions: [8],
    extraParameters: [
      createResolutionParam(["720p", "1080p", "4k"], "720p"),
      createEnumParam("generation_type", "How to use the supplied images", ["frame", "reference"], "frame"),
    ],
  }),
  "veo3.1-quality": createVideoConfig({
    id: "veo3.1-quality",
    name: "Veo 3.1 Quality",
    description: "High-quality Veo 3.1 video generation through Poyo.ai.",
    pageUrl: "https://docs.poyo.ai/api-manual/video-series/veo-3-1",
    vendor: "Google",
    imageOptional: true,
    durationDefault: 8,
    durationOptions: [8],
    extraParameters: [
      createResolutionParam(["720p", "1080p", "4k"], "720p"),
      createEnumParam("generation_type", "How to use the supplied images", ["frame", "reference"], "frame"),
    ],
  }),
  "wan2.6-text-to-video": createVideoConfig({
    id: "wan2.6-text-to-video",
    name: "Wan 2.6",
    description: "Wan 2.6 text-to-video generation through Poyo.ai.",
    pageUrl: "https://docs.poyo.ai/api-manual/video-series/wan-2-6",
    vendor: "Alibaba",
    durationDefault: 5,
    durationOptions: [5, 10, 15],
    extraParameters: [
      createResolutionParam(["720p", "1080p"], "1080p"),
      createBooleanParam("multi_shots", "Enable multi-shot composition for cinematic transitions", false),
    ],
  }),
  "wan2.6-image-to-video": createVideoConfig({
    id: "wan2.6-image-to-video",
    name: "Wan 2.6 I2V",
    description: "Wan 2.6 image-to-video generation through Poyo.ai.",
    pageUrl: "https://docs.poyo.ai/api-manual/video-series/wan-2-6",
    vendor: "Alibaba",
    imageRequired: true,
    durationDefault: 5,
    durationOptions: [5, 10, 15],
    extraParameters: [
      createResolutionParam(["720p", "1080p"], "1080p"),
      createBooleanParam("multi_shots", "Enable multi-shot composition for cinematic transitions", false),
    ],
  }),
  "kling-2.6": createVideoConfig({
    id: "kling-2.6",
    name: "Kling 2.6",
    description: "Kling 2.6 video generation through Poyo.ai.",
    pageUrl: "https://docs.poyo.ai/api-manual/video-series/kling-2-6",
    vendor: "Kuaishou",
    imageOptional: true,
    durationDefault: 5,
    durationOptions: [5, 10],
    extraParameters: [
      createBooleanParam("sound", "Generate native audio with the video", true),
    ],
  }),
  "grok-imagine": createVideoConfig({
    id: "grok-imagine",
    name: "Grok Imagine",
    description: "Grok video generation through Poyo.ai.",
    pageUrl: "https://docs.poyo.ai/api-manual/video-series/grok-imagine",
    vendor: "xAI",
    imageOptional: true,
    aspectRatios: documentedGrokVideoAspectRatios,
    durationDefault: 6,
    extraParameters: [
      createEnumParam("mode", "Generation style", ["fun", "normal", "spicy"], "normal"),
    ],
  }),
  "hailuo-02": createVideoConfig({
    id: "hailuo-02",
    name: "Hailuo 02",
    description: "Hailuo 02 video generation through Poyo.ai.",
    pageUrl: "https://docs.poyo.ai/api-manual/video-series/hailuo-02",
    vendor: "MiniMax",
    imageOptional: true,
    durationDefault: 6,
    durationOptions: [6, 10],
    extraParameters: [
      createBooleanParam("prompt_optimizer", "Let Poyo refine the prompt before generation", true),
    ],
  }),
  "hailuo-02-pro": createVideoConfig({
    id: "hailuo-02-pro",
    name: "Hailuo 02 Pro",
    description: "Hailuo 02 Pro video generation through Poyo.ai.",
    pageUrl: "https://docs.poyo.ai/api-manual/video-series/hailuo-02",
    vendor: "MiniMax",
    imageOptional: true,
    durationDefault: 6,
    durationOptions: [6],
    extraParameters: [
      createBooleanParam("prompt_optimizer", "Let Poyo refine the prompt before generation", true),
    ],
  }),
  "seedance-1.0-pro": createVideoConfig({
    id: "seedance-1.0-pro",
    name: "Seedance 1.0 Pro",
    description: "Seedance 1.0 Pro image-to-video generation through Poyo.ai.",
    pageUrl: "https://docs.poyo.ai/api-manual/video-series/seedance-1-0-pro",
    vendor: "ByteDance",
    imageRequired: true,
    durationDefault: 5,
    durationOptions: [5, 10],
    extraParameters: [createResolutionParam(["720p", "1080p"], "720p")],
  }),
  "seedance-1.5-pro": createVideoConfig({
    id: "seedance-1.5-pro",
    name: "Seedance 1.5 Pro",
    description: "Seedance 1.5 Pro image-to-video generation through Poyo.ai.",
    pageUrl: "https://docs.poyo.ai/api-manual/video-series/seedance-1-5-pro",
    vendor: "ByteDance",
    imageRequired: true,
    durationDefault: 5,
    extraParameters: [
      createResolutionParam(["480p", "720p", "1080p"], "720p"),
      createBooleanParam("generate_audio", "Generate audio with the video", true),
      createBooleanParam("fixed_lens", "Keep a more stable camera movement", false),
    ],
  }),
  "sora-2": createVideoConfig({
    id: "sora-2",
    name: "Sora 2",
    description: "Sora 2 video generation through Poyo.ai.",
    pageUrl: "https://docs.poyo.ai/api-manual/video-series/sora-2",
    vendor: "OpenAI",
    imageOptional: true,
    durationDefault: 10,
    durationOptions: [10, 15],
    extraParameters: [
      createEnumParam("style", "Visual style", soraStyleOptions, "comic"),
      createBooleanParam("storyboard", "Use storyboard-style prompting", false),
    ],
  }),
  "sora-2-private": createVideoConfig({
    id: "sora-2-private",
    name: "Sora 2 Private",
    description: "Private Sora 2 video generation through Poyo.ai.",
    pageUrl: "https://docs.poyo.ai/api-manual/video-series/sora-2",
    vendor: "OpenAI",
    imageOptional: true,
    durationDefault: 10,
    durationOptions: [10, 15],
    extraParameters: [
      createEnumParam("style", "Visual style", soraStyleOptions, "comic"),
      createBooleanParam("storyboard", "Use storyboard-style prompting", false),
    ],
  }),
  "sora-2-pro": createVideoConfig({
    id: "sora-2-pro",
    name: "Sora 2 Pro",
    description: "Sora 2 Pro video generation through Poyo.ai.",
    pageUrl: "https://docs.poyo.ai/api-manual/video-series/sora-2-pro",
    vendor: "OpenAI",
    imageOptional: true,
    durationDefault: 15,
    durationOptions: [15, 25],
    extraParameters: [
      createEnumParam("style", "Visual style", soraStyleOptions, "comic"),
      createBooleanParam("storyboard", "Use storyboard-style prompting", false),
    ],
  }),
  "sora-2-pro-private": createVideoConfig({
    id: "sora-2-pro-private",
    name: "Sora 2 Pro Private",
    description: "Private Sora 2 Pro video generation through Poyo.ai.",
    pageUrl: "https://docs.poyo.ai/api-manual/video-series/sora-2-pro",
    vendor: "OpenAI",
    imageOptional: true,
    durationDefault: 15,
    durationOptions: [15, 25],
    extraParameters: [
      createEnumParam("style", "Visual style", soraStyleOptions, "comic"),
      createBooleanParam("storyboard", "Use storyboard-style prompting", false),
    ],
  }),
};

export const POYO_MODELS: ProviderModel[] = Object.values(poyoConfigs).map(
  (config) => config.model
);

export function getPoyoModelConfig(modelId: string): PoyoModelConfig | null {
  return poyoConfigs[modelId] ?? null;
}

export function getPoyoSchema(modelId: string): ProviderSchema {
  return poyoConfigs[modelId]?.schema ?? { parameters: [], inputs: [] };
}