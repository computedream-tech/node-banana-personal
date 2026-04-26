"use client";

import { ChangeEvent, DragEvent, useCallback, useMemo, useRef, useState } from "react";
import { Handle, Node, NodeProps, Position } from "@xyflow/react";
import { BaseNode } from "./BaseNode";
import { HandleLabel } from "./HandleLabel";
import { useWorkflowStore } from "@/store/workflowStore";
import { ImageBatchArrayNodeData, ImageBatchArrayRow } from "@/types";

type ImageBatchArrayNodeType = Node<ImageBatchArrayNodeData, "imageBatchArray">;

const ACCEPTED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

function createRowId(): string {
  return `row-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeRows(rows: ImageBatchArrayNodeData["rows"] | undefined): ImageBatchArrayRow[] {
  return Array.isArray(rows)
    ? rows.map((row) => ({
        id: typeof row.id === "string" && row.id ? row.id : createRowId(),
        images: Array.isArray(row.images) ? row.images.filter((image): image is string => typeof image === "string") : [],
        prompt: typeof row.prompt === "string" ? row.prompt : undefined,
      }))
    : [];
}

function readImageFile(file: File): Promise<string | null> {
  if (!ACCEPTED_IMAGE_TYPES.has(file.type)) return Promise.resolve(null);

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

async function readImageFiles(files: FileList | File[]): Promise<string[]> {
  const imageFiles = Array.from(files).filter((file) => ACCEPTED_IMAGE_TYPES.has(file.type));
  const results = await Promise.all(imageFiles.map(readImageFile));
  return results.filter((image): image is string => !!image);
}

function BatchIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 7.5V6a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2h-1.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 10a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2v-8z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 16l2.1-2.1a1.2 1.2 0 011.7 0L14 16m-6-4h.01" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg className="w-11 h-11 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 16l-4-4m0 0l-4 4m4-4v9" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.4 16.6A5 5 0 0018 7.2a6.5 6.5 0 00-12.2 2.4A4.4 4.4 0 006.4 18H8" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 18h1.6" />
    </svg>
  );
}

function PlusIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m7-7H5" />
    </svg>
  );
}

function TrashIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 4h6m-8 4h10m-9 0l.6 11a1.6 1.6 0 001.6 1.5h3.6a1.6 1.6 0 001.6-1.5L16 8" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 11v5m4-5v5" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}

function LayersIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4l8 4-8 4-8-4 8-4z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 12l8 4 8-4M4 16l8 4 8-4" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg className="w-3.5 h-3.5 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0-9h.01" />
    </svg>
  );
}

interface AddImageTileProps {
  onClick: () => void;
  onDropFiles: (files: FileList) => void;
}

function AddImageTile({ onClick, onDropFiles }: AddImageTileProps) {
  const handleDrop = useCallback(
    (event: DragEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer.files.length > 0) {
        onDropFiles(event.dataTransfer.files);
      }
    },
    [onDropFiles]
  );

  return (
    <button
      type="button"
      onClick={onClick}
      onDrop={handleDrop}
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      className="nodrag nopan shrink-0 w-[60px] h-[60px] rounded-md border border-dashed border-purple-500/30 bg-[#080f20]/70 text-purple-500 hover:border-purple-400/70 hover:bg-purple-950/20 transition-colors flex flex-col items-center justify-center gap-1"
      title="Add image to this row"
    >
      <PlusIcon className="w-6 h-6" />
      <span className="text-[9px] text-neutral-400">Add image</span>
    </button>
  );
}

export function ImageBatchArrayNode({ id, data, selected }: NodeProps<ImageBatchArrayNodeType>) {
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingRowIdRef = useRef<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isHovered, setIsHovered] = useState(false);

  const rows = useMemo(() => normalizeRows(data.rows), [data.rows]);
  const requestsAtATime = Math.max(1, Number.isFinite(data.requestsAtATime) ? data.requestsAtATime : 1);
  const showOutputLabel = !!selected || isHovered;

  const getFreshRows = useCallback(() => {
    const node = useWorkflowStore.getState().nodes.find((candidate) => candidate.id === id);
    return normalizeRows((node?.data as ImageBatchArrayNodeData | undefined)?.rows);
  }, [id]);

  const updateRows = useCallback(
    (nextRows: ImageBatchArrayRow[]) => {
      updateNodeData(id, { rows: nextRows });
    },
    [id, updateNodeData]
  );

  const appendImagesAsRows = useCallback(
    (images: string[]) => {
      if (images.length === 0) return;
      const nextRows = [
        ...getFreshRows(),
        ...images.map((image) => ({
          id: createRowId(),
          images: [image],
        })),
      ];
      updateRows(nextRows);
    },
    [getFreshRows, updateRows]
  );

  const appendImagesToRow = useCallback(
    (rowId: string, images: string[]) => {
      if (images.length === 0) return;
      const nextRows = getFreshRows().map((row) =>
        row.id === rowId
          ? { ...row, images: [...row.images, ...images] }
          : row
      );
      updateRows(nextRows);
    },
    [getFreshRows, updateRows]
  );

  const handleFiles = useCallback(
    async (files: FileList | File[], rowId: string | null) => {
      const images = await readImageFiles(files);
      if (rowId) {
        appendImagesToRow(rowId, images);
      } else {
        appendImagesAsRows(images);
      }
    },
    [appendImagesAsRows, appendImagesToRow]
  );

  const openFilePicker = useCallback((rowId: string | null) => {
    pendingRowIdRef.current = rowId;
    fileInputRef.current?.click();
  }, []);

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (files && files.length > 0) {
        void handleFiles(files, pendingRowIdRef.current);
      }
      event.target.value = "";
      pendingRowIdRef.current = null;
    },
    [handleFiles]
  );

  const handleUploadDrop = useCallback(
    (event: DragEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer.files.length > 0) {
        void handleFiles(event.dataTransfer.files, null);
      }
    },
    [handleFiles]
  );

  const handleAddRow = useCallback(() => {
    updateRows([...getFreshRows(), { id: createRowId(), images: [] }]);
  }, [getFreshRows, updateRows]);

  const handleDeleteRow = useCallback(
    (rowId: string) => {
      updateRows(getFreshRows().filter((row) => row.id !== rowId));
    },
    [getFreshRows, updateRows]
  );

  const handleDeleteImage = useCallback(
    (rowId: string, imageIndex: number) => {
      const nextRows = getFreshRows().map((row) =>
        row.id === rowId
          ? { ...row, images: row.images.filter((_, index) => index !== imageIndex) }
          : row
      );
      updateRows(nextRows);
    },
    [getFreshRows, updateRows]
  );

  const handleRequestsChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const nextValue = Math.max(1, Math.floor(Number(event.target.value) || 1));
      updateNodeData(id, { requestsAtATime: nextValue });
    },
    [id, updateNodeData]
  );

  return (
    <>
      <BaseNode
        id={id}
        selected={selected}
        fullBleed
        minWidth={700}
        minHeight={460}
        className="bg-[#050b18] border-purple-900/40 shadow-[0_0_40px_rgba(88,28,135,0.18)]"
        contentClassName="relative h-full w-full overflow-visible text-neutral-100"
      >
        <div
          className="relative box-border flex h-full min-h-0 flex-col overflow-hidden rounded-lg bg-[#050b18] p-4"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            onChange={handleInputChange}
            className="hidden"
          />

          <div className="flex shrink-0 items-start justify-between gap-4 pb-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 rounded-lg bg-purple-700/30 border border-purple-500/30 text-purple-400 flex items-center justify-center shadow-[0_0_22px_rgba(147,51,234,0.25)]">
                <BatchIcon className="w-7 h-7" />
              </div>
              <div className="min-w-0">
                <div className="text-[16px] font-semibold tracking-wide text-neutral-100">
                  IMAGE BATCH ARRAY
                </div>
                <div className="text-[11px] text-neutral-400 mt-0.5">
                  Upload and manage multiple images with custom prompts.
                </div>
              </div>
            </div>

            <div className="shrink-0 px-3 py-2 rounded-lg border border-purple-800/40 bg-[#070d1d] text-purple-400 flex items-center gap-2 shadow-inner">
              <span className="text-[12px] font-medium">{rows.length} rows</span>
              <LayersIcon />
            </div>
          </div>

          <div className="grid flex-1 grid-cols-[250px_minmax(0,1fr)] gap-3 min-h-0 overflow-hidden">
            <div className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-3 overflow-hidden">
              <section className="min-h-0 overflow-hidden rounded-lg border border-slate-700/70 bg-[#071024] p-3 flex flex-col">
                <div className="shrink-0 text-[12px] font-semibold tracking-wide text-neutral-200">ADD IMAGES</div>
                <button
                  type="button"
                  onClick={() => openFilePicker(null)}
                  onDrop={handleUploadDrop}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  className="nodrag nopan mt-3 w-full min-h-[118px] flex-1 rounded-lg border border-dashed border-slate-600/70 bg-[#060d1d] hover:border-purple-500/60 hover:bg-purple-950/10 transition-colors flex flex-col items-center justify-center text-center px-4"
                >
                  <UploadIcon />
                  <span className="mt-3 text-[12px] text-neutral-300">Drag & drop images here</span>
                  <span className="mt-2 text-[12px] text-neutral-400">
                    or click to <span className="text-purple-400">browse</span>
                  </span>
                </button>
              </section>

              <section className="shrink-0 rounded-lg border border-slate-700/70 bg-[#071024] p-3">
                <div className="text-[12px] font-semibold tracking-wide text-neutral-200">BATCH SETTINGS</div>
                <label className="mt-3 flex items-center gap-1.5 text-[12px] text-neutral-300">
                  Requests at a time
                  <span title="Number of concurrent API requests to process.">
                    <InfoIcon />
                  </span>
                </label>
                <input
                  type="number"
                  min={1}
                  value={requestsAtATime}
                  onChange={handleRequestsChange}
                  className="nodrag nopan mt-2 w-full h-9 rounded-md border border-slate-700/80 bg-[#050b18] px-3 text-[13px] text-neutral-100 outline-none focus:border-purple-500/70 focus:ring-1 focus:ring-purple-500/40"
                />
                <p className="mt-2 text-[12px] leading-4 text-neutral-400">
                  Number of concurrent API requests to process.
                </p>
              </section>
            </div>

            <section className="min-w-0 min-h-0 rounded-lg border border-slate-700/70 bg-[#071024] overflow-hidden flex flex-col">
              <div className="h-16 grid grid-cols-[70px_minmax(0,1fr)_112px] items-center border-b border-slate-800/90 px-5">
                <div className="text-[12px] font-semibold text-neutral-300">#</div>
                <div className="text-[12px] font-semibold tracking-wide text-neutral-300">IMAGES</div>
                <button
                  type="button"
                  onClick={handleAddRow}
                  className="nodrag nopan justify-self-end h-9 min-w-[96px] px-4 rounded-md bg-purple-600 hover:bg-purple-500 text-white text-[12px] font-medium flex items-center justify-center gap-2 whitespace-nowrap transition-colors shadow-[0_0_18px_rgba(147,51,234,0.25)]"
                >
                  <PlusIcon className="w-4 h-4" />
                  Add row
                </button>
              </div>

              <div className="nowheel min-h-0 flex-1 overflow-y-auto [scrollbar-color:#7c3aed_#111827] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-[#0b1221] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-purple-600">
                {rows.length === 0 ? (
                  <div className="h-full min-h-[220px] flex items-center justify-center text-[12px] text-neutral-500">
                    Add rows or drop images to start a batch.
                  </div>
                ) : (
                  rows.map((row, rowIndex) => (
                    <div
                      key={row.id}
                      className="grid grid-cols-[70px_minmax(0,1fr)_56px] gap-0 border-b border-slate-800/80 px-5 py-3 min-h-[84px]"
                    >
                      <div className="text-[24px] leading-[60px] font-semibold text-purple-500">
                        {rowIndex + 1}
                      </div>
                      <div className="min-w-0 flex flex-wrap items-start gap-2 pr-3">
                        {row.images.map((image, imageIndex) => (
                          <div
                            key={`${row.id}-${imageIndex}`}
                            className="group relative w-[60px] h-[60px] shrink-0 overflow-hidden rounded-md border border-slate-700/70 bg-[#050b18]"
                          >
                            <img
                              src={image}
                              alt={`Batch row ${rowIndex + 1} image ${imageIndex + 1}`}
                              className="w-full h-full object-contain bg-[#050b18]"
                            />
                            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-black/55 flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setPreviewImage(image);
                                }}
                                className="nodrag nopan w-6 h-6 rounded bg-black/70 hover:bg-purple-700 text-white flex items-center justify-center"
                                title="Preview image"
                                aria-label="Preview image"
                              >
                                <EyeIcon />
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleDeleteImage(row.id, imageIndex);
                                }}
                                className="nodrag nopan w-6 h-6 rounded bg-black/70 hover:bg-red-600 text-white flex items-center justify-center"
                                title="Delete image"
                                aria-label="Delete image"
                              >
                                <TrashIcon className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                        <AddImageTile
                          onClick={() => openFilePicker(row.id)}
                          onDropFiles={(files) => void handleFiles(files, row.id)}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteRow(row.id)}
                        className="nodrag nopan self-center justify-self-center w-8 h-8 rounded-md text-purple-500 hover:text-purple-300 hover:bg-purple-950/30 transition-colors flex items-center justify-center"
                        title="Delete row"
                        aria-label={`Delete row ${rowIndex + 1}`}
                      >
                        <TrashIcon className="w-5 h-5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>

          {previewImage && (
            <div className="absolute inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/70 p-6 backdrop-blur-sm">
              <div className="relative flex h-full w-full items-center justify-center rounded-xl border border-purple-500/40 bg-slate-950/95 p-4 shadow-[0_0_28px_rgba(147,51,234,0.28)]">
                <img
                  src={previewImage}
                  alt="Preview"
                  className="max-w-full max-h-full object-contain rounded-lg bg-black"
                />
                <button
                  type="button"
                  onClick={() => setPreviewImage(null)}
                  className="nodrag nopan absolute top-4 right-4 w-8 h-8 rounded-md bg-black/80 hover:bg-black text-white flex items-center justify-center border border-white/10"
                  aria-label="Close preview"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          )}
        </div>

        <Handle
          type="source"
          position={Position.Right}
          id="image"
          data-handletype="image"
          data-tutorial="node-output-handle"
        />
        <HandleLabel label="Image" side="source" color="var(--handle-color-image)" visible={showOutputLabel} />
      </BaseNode>
    </>
  );
}
