export const ECC_LEVELS = ["L", "M", "Q", "H"] as const;
export type EccLevel = (typeof ECC_LEVELS)[number];

export const ECC_COPY: Record<
  EccLevel,
  { name: string; recovery: string; hint: string }
> = {
  L: {
    name: "低",
    recovery: "约 7%",
    hint: "码点最少，适合干净的屏幕展示。",
  },
  M: {
    name: "中",
    recovery: "约 15%",
    hint: "日常链接与打印的推荐等级。",
  },
  Q: {
    name: "较高",
    recovery: "约 25%",
    hint: "适合会缩小或略有磨损的物料。",
  },
  H: {
    name: "高",
    recovery: "约 30%",
    hint: "适合会遮挡或长期使用的印刷品。",
  },
};

export const SIZE_MIN = 128;
export const SIZE_MAX = 1024;
export const SIZE_STEP = 32;
export const DEFAULT_SIZE = 320;
export const DEFAULT_FG = "#1a1916";
export const DEFAULT_BG = "#ffffff";
export const HEX_PATTERN = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/;

export const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp";
export const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const LOGO_MIN = 0.12;
export const LOGO_MAX = 0.28;
export const LOGO_STEP = 0.01;
export const LOGO_DEFAULT = 0.18;
export type CompositeMode = "logo" | "backdrop";

export function normalizeHex(value: string): string | null {
  const trimmed = value.trim();
  if (!HEX_PATTERN.test(trimmed)) return null;
  const raw = trimmed.slice(1);
  if (raw.length === 3) {
    return `#${raw
      .split("")
      .map((ch) => ch + ch)
      .join("")
      .toLowerCase()}`;
  }
  return `#${raw.toLowerCase()}`;
}

function channelToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = normalizeHex(hex);
  if (!normalized) return null;
  const n = Number.parseInt(normalized.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function relativeLuminance(hex: string): number | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  return (
    0.2126 * channelToLinear(rgb.r) +
    0.7152 * channelToLinear(rgb.g) +
    0.0722 * channelToLinear(rgb.b)
  );
}

export function contrastRatio(a: string, b: string): number | null {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  if (l1 === null || l2 === null) return null;
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

export function contrastWarning(ratio: number | null): string | null {
  if (ratio === null) return "请输入有效的六位十六进制颜色。";
  if (ratio < 2) return "前景与背景过于接近，扫描器很可能无法识别。";
  if (ratio < 4) return "对比度偏低，打印或远距离扫描可能失败。";
  return null;
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
}

export function extractHttpUrl(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".")) return null;
    if (url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function copyText(value: string) {
  return navigator.clipboard.writeText(value);
}

export async function copyPngDataUrl(dataUrl: string) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  await navigator.clipboard.write([
    new ClipboardItem({ [blob.type || "image/png"]: blob }),
  ]);
}

export function imageFileError(file: File): string | null {
  const named = file.name.toLowerCase();
  const extOk =
    named.endsWith(".png") ||
    named.endsWith(".jpg") ||
    named.endsWith(".jpeg") ||
    named.endsWith(".webp");
  const typeOk = ["image/png", "image/jpeg", "image/webp"].includes(file.type);
  if (!typeOk && !extOk) {
    return "请选择 PNG、JPEG 或 WebP 图片。";
  }
  if (file.size > IMAGE_MAX_BYTES) {
    return "图片请小于 8 MB。";
  }
  return null;
}

export function loadImageFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("decode"));
    };
    image.src = url;
  });
}

function sourceSize(image: CanvasImageSource): { w: number; h: number } {
  if (image instanceof HTMLImageElement) {
    return { w: image.naturalWidth, h: image.naturalHeight };
  }
  if (typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap) {
    return { w: image.width, h: image.height };
  }
  return { w: 0, h: 0 };
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
) {
  const { w: iw, h: ih } = sourceSize(image);
  if (!iw || !ih) return;
  const scale = Math.max(dw / iw, dh / ih);
  const sw = dw / scale;
  const sh = dh / scale;
  const sx = (iw - sw) / 2;
  const sy = (ih - sh) / 2;
  ctx.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh);
}

function drawLogoBadge(
  ctx: CanvasRenderingContext2D,
  logo: CanvasImageSource,
  canvasSize: number,
  ratio: number,
  padColor: string,
) {
  const logoBox = canvasSize * ratio;
  const pad = Math.max(4, logoBox * 0.14);
  const box = logoBox + pad * 2;
  const x = (canvasSize - box) / 2;
  const y = (canvasSize - box) / 2;
  const radius = Math.min(box * 0.18, 18);

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, box, box, radius);
  ctx.fillStyle = padColor;
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(x + pad, y + pad, logoBox, logoBox, Math.max(radius - 4, 4));
  ctx.clip();
  drawCover(ctx, logo, x + pad, y + pad, logoBox, logoBox);
  ctx.restore();
}

export async function renderQrPng(options: {
  text: string;
  size: number;
  level: EccLevel;
  fg: string;
  bg: string;
  overlay: HTMLImageElement | null;
  mode: CompositeMode;
  logoRatio: number;
}): Promise<string> {
  const QRCode = (await import("qrcode")).default;
  const { text, size, level, fg, bg, overlay, mode, logoRatio } = options;

  if (overlay && mode === "backdrop") {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    drawCover(ctx, overlay, 0, 0, size, size);
    const qrCanvas = document.createElement("canvas");
    await QRCode.toCanvas(qrCanvas, text, {
      errorCorrectionLevel: level,
      width: size,
      margin: 2,
      color: { dark: fg, light: "#00000000" },
    });
    ctx.drawImage(qrCanvas, 0, 0);
    return canvas.toDataURL("image/png");
  }

  const canvas = document.createElement("canvas");
  await QRCode.toCanvas(canvas, text, {
    errorCorrectionLevel: level,
    width: size,
    margin: 2,
    color: { dark: fg, light: bg },
  });
  if (overlay && mode === "logo") {
    const ctx = canvas.getContext("2d");
    if (ctx) drawLogoBadge(ctx, overlay, canvas.width, logoRatio, bg);
  }
  return canvas.toDataURL("image/png");
}
