/**
 * Batch Execution Helper
 *
 * Detects batch mode (textItems from array nodes) and loops through items,
 * executing the appropriate node executor for each. Shared by executeWorkflow,
 * regenerateNode, and executeSelectedNodes.
 */

import { logger } from "@/utils/logger";
import type {
  CarouselImageItem,
  NanoBananaNodeData,
  OutputGalleryNodeData,
  WorkflowNodeData,
} from "@/types";
import type { NodeExecutionContext } from "./types";
import { executeNanoBanana } from "./nanoBananaExecutor";
import { executeGenerateVideo } from "./generateVideoExecutor";
import { executeGenerate3D } from "./generate3dExecutor";
import { executeGenerateAudio } from "./generateAudioExecutor";
import { executeLlmGenerate } from "./llmGenerateExecutor";

const TEXT_BATCH_NODE_TYPES = new Set(["nanoBanana", "generateVideo", "generateAudio", "llmGenerate"]);
const IMAGE_BATCH_NODE_TYPES = new Set(["nanoBanana", "generateVideo", "generate3d", "llmGenerate"]);
const BATCH_NODE_TYPES = new Set([...TEXT_BATCH_NODE_TYPES, ...IMAGE_BATCH_NODE_TYPES]);

type BatchOptions = { useStoredFallback?: boolean };
type GalleryBatchOutput = { index: number; image: string };
type NodeBatchOutput = { index: number; image: string; historyItem: CarouselImageItem };
type DynamicInputs = Record<string, string | string[]>;
type BatchInputSchema = {
  name: string;
  type: string;
  isArray?: boolean;
};

function getImageBatchConcurrency(value: number | undefined): number {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) ? Math.max(1, parsed) : 1;
}

function appendRowPrompt(masterPrompt: string | null, rowPrompt: string | undefined): string | null {
  const trimmedRowPrompt = rowPrompt?.trim();
  if (!trimmedRowPrompt) return masterPrompt;
  return masterPrompt ? `${masterPrompt}\n\n${trimmedRowPrompt}` : trimmedRowPrompt;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getStoredFallbackInputs(executionCtx: NodeExecutionContext): {
  inputImages: string[];
  inputPrompt: string | null;
} {
  const freshNode = executionCtx.getFreshNode(executionCtx.node.id);
  const data = (freshNode?.data ?? executionCtx.node.data) as Record<string, unknown>;

  const inputImages = Array.isArray(data.inputImages)
    ? data.inputImages.filter((image): image is string => typeof image === "string" && image.length > 0)
    : [];
  const inputPrompt = typeof data.inputPrompt === "string" ? data.inputPrompt : null;

  return { inputImages, inputPrompt };
}

function getBatchInputSchema(executionCtx: NodeExecutionContext): BatchInputSchema[] {
  const freshNode = executionCtx.getFreshNode(executionCtx.node.id);
  const data = (freshNode?.data ?? executionCtx.node.data) as { inputSchema?: BatchInputSchema[] };
  return Array.isArray(data.inputSchema) ? data.inputSchema : [];
}

function isArrayImageInput(input: BatchInputSchema): boolean {
  if (input.isArray === true) return true;

  const normalizedName = input.name.toLowerCase();
  return normalizedName.endsWith("s") || normalizedName.includes("images");
}

function withBatchedImageDynamicInputs(
  dynamicInputs: DynamicInputs,
  inputSchema: BatchInputSchema[],
  normalImages: string[],
  finalImages: string[],
): DynamicInputs {
  if (finalImages.length === normalImages.length) {
    return dynamicInputs;
  }

  const imageInputs = inputSchema.filter((input) => input.type === "image" && input.name);
  const existingArrayInput = imageInputs.find((input) => Array.isArray(dynamicInputs[input.name]));
  const schemaArrayInput = imageInputs.find(isArrayImageInput);
  const inputToUpdate = existingArrayInput ?? schemaArrayInput;

  if (!inputToUpdate) {
    return dynamicInputs;
  }

  return {
    ...dynamicInputs,
    [inputToUpdate.name]: finalImages,
  };
}

async function executeBatchableNodeOnce(
  executionCtx: NodeExecutionContext,
  options?: BatchOptions,
): Promise<void> {
  switch (executionCtx.node.type) {
    case "nanoBanana":
      await executeNanoBanana(executionCtx, options);
      break;
    case "generateVideo":
      await executeGenerateVideo(executionCtx, options);
      break;
    case "generate3d":
      await executeGenerate3D(executionCtx, options);
      break;
    case "generateAudio":
      await executeGenerateAudio(executionCtx, options);
      break;
    case "llmGenerate":
      await executeLlmGenerate(executionCtx, options);
      break;
  }
}

async function runTextBatch(
  executionCtx: NodeExecutionContext,
  items: string[],
  options?: BatchOptions,
): Promise<boolean> {
  const { node } = executionCtx;
  const totalItems = items.length;

  for (let i = 0; i < totalItems; i++) {
    if (executionCtx.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    executionCtx.updateNodeData(node.id, {
      status: "loading",
      error: null,
    } as Partial<WorkflowNodeData>);

    logger.info("node.execution", `Batch ${i + 1} of ${totalItems}`, {
      nodeId: node.id,
      nodeType: node.type,
      batchIndex: i,
      batchTotal: totalItems,
    });

    // Wrap context so getConnectedInputs returns current batch item as text.
    const batchCtx: NodeExecutionContext = {
      ...executionCtx,
      getConnectedInputs: (nodeId: string) => {
        const inputs = executionCtx.getConnectedInputs(nodeId);
        return {
          ...inputs,
          text: items[i],
          textItems: [],
          imageBatchItems: [],
          imageBatchPrompts: [],
          imageBatchRequestsAtATime: 1,
          imageBatchSourceNodeId: undefined,
        };
      },
    };

    await executeBatchableNodeOnce(batchCtx, options);

    if (i < totalItems - 1) {
      executionCtx.updateNodeData(node.id, {
        status: "loading",
      } as Partial<WorkflowNodeData>);
    }
  }

  return true;
}

function flushCollectedGalleryImages(
  executionCtx: NodeExecutionContext,
  galleryOutputs: Map<string, GalleryBatchOutput[]>,
): void {
  for (const [targetId, outputs] of galleryOutputs) {
    const orderedImages = [...outputs]
      .sort((a, b) => a.index - b.index)
      .map((output) => output.image);

    if (orderedImages.length === 0) continue;

    const targetNode =
      executionCtx.getFreshNode(targetId) ??
      executionCtx.getNodes().find((node) => node.id === targetId);

    if (targetNode?.type !== "outputGallery") continue;

    const targetData = targetNode.data as OutputGalleryNodeData;
    executionCtx.updateNodeData(targetId, {
      images: [...orderedImages, ...(targetData.images || [])],
    } as Partial<WorkflowNodeData>);
  }
}

function flushNodeBatchHistory(
  executionCtx: NodeExecutionContext,
  nodeOutputs: Map<number, NodeBatchOutput>,
): void {
  const orderedOutputs = [...nodeOutputs.values()].sort((a, b) => a.index - b.index);
  if (orderedOutputs.length === 0) return;

  const currentNode =
    executionCtx.getFreshNode(executionCtx.node.id) ??
    executionCtx.getNodes().find((node) => node.id === executionCtx.node.id);

  if (currentNode?.type !== "nanoBanana") return;

  const currentData = currentNode.data as NanoBananaNodeData;
  const batchHistoryIds = new Set(orderedOutputs.map((output) => output.historyItem.id));
  const existingHistory = (currentData.imageHistory || []).filter(
    (item) => !batchHistoryIds.has(item.id)
  );

  executionCtx.updateNodeData(executionCtx.node.id, {
    outputImage: orderedOutputs[0].image,
    imageHistory: [
      ...orderedOutputs.map((output) => output.historyItem),
      ...existingHistory,
    ].slice(0, 50),
    selectedHistoryIndex: 0,
  } as Partial<WorkflowNodeData>);
}

async function runImageBatch(
  executionCtx: NodeExecutionContext,
  imageBatchItems: string[][],
  imageBatchPrompts: Array<string | undefined>,
  imageBatchRequestsAtATime: number | undefined,
  options?: BatchOptions,
  textItems?: string[],
): Promise<boolean> {
  const { node } = executionCtx;
  const totalItems = imageBatchItems.length;
  const concurrency = getImageBatchConcurrency(imageBatchRequestsAtATime);
  const storedFallbackInputs = getStoredFallbackInputs(executionCtx);
  const useTextItemsByIndex = textItems?.length === totalItems;
  const galleryOutputs = new Map<string, GalleryBatchOutput[]>();
  const nodeOutputs = new Map<number, NodeBatchOutput>();

  const runItem = async (index: number): Promise<void> => {
    if (executionCtx.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    executionCtx.updateNodeData(node.id, {
      status: "loading",
      error: null,
    } as Partial<WorkflowNodeData>);

    logger.info("node.execution", `Image batch ${index + 1} of ${totalItems}`, {
      nodeId: node.id,
      nodeType: node.type,
      batchIndex: index,
      batchTotal: totalItems,
      concurrency,
    });

    const batchCtx: NodeExecutionContext = {
      ...executionCtx,
      updateNodeData: (nodeId: string, data: Partial<WorkflowNodeData>) => {
        executionCtx.updateNodeData(nodeId, data);

        if (nodeId !== node.id) return;
        const nanoUpdate = data as Partial<NanoBananaNodeData>;
        const historyItem = nanoUpdate.imageHistory?.[0];
        if (
          nanoUpdate.status === "complete" &&
          typeof nanoUpdate.outputImage === "string" &&
          historyItem
        ) {
          nodeOutputs.set(index, {
            index,
            image: nanoUpdate.outputImage,
            historyItem,
          });
        }
      },
      getConnectedInputs: (nodeId: string) => {
        const inputs = executionCtx.getConnectedInputs(nodeId);
        const normalImages =
          inputs.images.length > 0
            ? inputs.images
            : options?.useStoredFallback
              ? storedFallbackInputs.inputImages
              : [];
        const rowImages = imageBatchItems[index] ?? [];
        const finalImages = [...normalImages, ...rowImages];
        const masterPrompt = useTextItemsByIndex
          ? textItems[index]
          : inputs.text ?? (options?.useStoredFallback ? storedFallbackInputs.inputPrompt : null);
        const dynamicInputs = withBatchedImageDynamicInputs(
          inputs.dynamicInputs,
          getBatchInputSchema(executionCtx),
          normalImages,
          finalImages,
        );

        logger.info("node.execution", "Image Batch Array row image injection", {
          nodeId,
          nodeType: node.type,
          batchIndex: index,
          normalImageCount: normalImages.length,
          rowImageCount: rowImages.length,
          finalImageCount: finalImages.length,
        });

        return {
          ...inputs,
          images: finalImages,
          text: appendRowPrompt(masterPrompt, imageBatchPrompts[index]),
          dynamicInputs,
          textItems: [],
          imageBatchItems: [],
          imageBatchPrompts: [],
          imageBatchRequestsAtATime: 1,
          imageBatchSourceNodeId: undefined,
        };
      },
      appendOutputGalleryImage: (targetId: string, image: string) => {
        const outputs = galleryOutputs.get(targetId) ?? [];
        outputs.push({ index, image });
        galleryOutputs.set(targetId, outputs);
      },
    };

    await executeBatchableNodeOnce(batchCtx, options);
  };

  try {
    for (let start = 0; start < totalItems; start += concurrency) {
      if (executionCtx.signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }

      const batchIndexes = imageBatchItems
        .slice(start, start + concurrency)
        .map((_, offset) => start + offset);

      const results = await Promise.allSettled(batchIndexes.map((index) => runItem(index)));
      const failedIndex = results.findIndex((result) => result.status === "rejected");

      if (failedIndex !== -1) {
        const failed = results[failedIndex] as PromiseRejectedResult;
        const failedRow = batchIndexes[failedIndex] + 1;
        const errorMessage = `Image batch row ${failedRow} failed: ${getErrorMessage(failed.reason)}`;
        executionCtx.updateNodeData(node.id, {
          status: "error",
          error: errorMessage,
        } as Partial<WorkflowNodeData>);
        throw new Error(errorMessage);
      }
    }
  } finally {
    flushCollectedGalleryImages(executionCtx, galleryOutputs);
    flushNodeBatchHistory(executionCtx, nodeOutputs);
  }

  return true;
}

/**
 * Attempts to run batch execution for a node.
 *
 * If the node type supports batching and has textItems from upstream array
 * nodes, iterates through each item and runs the executor individually.
 * If a supported image-consuming node has imageBatchItems from an Image Batch
 * Array node, runs once per row and appends that row's images after normal
 * upstream images.
 *
 * @returns `true` if batch execution was performed, `false` if the node
 *          should proceed with normal single-item execution.
 */
export async function runBatchIfApplicable(
  executionCtx: NodeExecutionContext,
  options?: BatchOptions,
): Promise<boolean> {
  const { node } = executionCtx;

  if (!node.type || !BATCH_NODE_TYPES.has(node.type)) {
    return false;
  }

  const connectedInputs = executionCtx.getConnectedInputs(node.id);
  const textItems = connectedInputs.textItems;
  const imageBatchItems = connectedInputs.imageBatchItems ?? [];
  const hasTextBatch = textItems.length > 0;
  const hasImageBatch = imageBatchItems.length > 0;

  if (!hasTextBatch && !hasImageBatch) {
    return false;
  }

  const canTextBatch = TEXT_BATCH_NODE_TYPES.has(node.type);
  const canImageBatch = IMAGE_BATCH_NODE_TYPES.has(node.type);

  if (hasImageBatch && canImageBatch) {
    if (hasTextBatch && textItems.length !== imageBatchItems.length) {
      // TODO: Define combined text/image batching semantics for mismatched
      // lengths. Preserve existing Array batch behavior for now.
      logger.warn("node.execution", "Image batch ignored because text batch length differs", {
        nodeId: node.id,
        nodeType: node.type,
        textBatchCount: textItems.length,
        imageBatchCount: imageBatchItems.length,
      });
      return canTextBatch ? runTextBatch(executionCtx, textItems, options) : false;
    }

    return runImageBatch(
      executionCtx,
      imageBatchItems,
      connectedInputs.imageBatchPrompts ?? [],
      connectedInputs.imageBatchRequestsAtATime,
      options,
      hasTextBatch ? textItems : undefined,
    );
  }

  if (hasTextBatch && canTextBatch) {
    return runTextBatch(executionCtx, textItems, options);
  }

  return false;
}
