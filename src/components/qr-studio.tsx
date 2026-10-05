import { useEffect, useId, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  ExternalLink,
  ImageDown,
  ImagePlus,
  RotateCcw,
  X,
} from "lucide-react";
import * as Slider from "@radix-ui/react-slider";
import * as RadioGroup from "@radix-ui/react-radio-group";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  contrastRatio,
  contrastWarning,
  DEFAULT_BG,
  DEFAULT_FG,
  DEFAULT_SIZE,
  copyPngDataUrl,
  copyText,
  downloadDataUrl,
  ECC_COPY,
  ECC_LEVELS,
  extractHttpUrl,
  IMAGE_ACCEPT,
  imageFileError,
  loadImageFile,
  LOGO_DEFAULT,
  LOGO_MAX,
  LOGO_MIN,
  LOGO_STEP,
  normalizeHex,
  renderQrPng,
  SIZE_MAX,
  SIZE_MIN,
  SIZE_STEP,
  type CompositeMode,
  type EccLevel,
} from "@/lib/qr";

const SAMPLE = "https://example.com";
const STORAGE_KEY = "moma-qr-settings";

type Settings = {
  text: string;
  fg: string;
  bg: string;
  size: number;
  level: EccLevel;
};

const INITIAL: Settings = {
  text: "",
  fg: DEFAULT_FG,
  bg: DEFAULT_BG,
  size: DEFAULT_SIZE,
  level: "M",
};

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return INITIAL;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const fg = normalizeHex(parsed.fg ?? "") ?? DEFAULT_FG;
    const bg = normalizeHex(parsed.bg ?? "") ?? DEFAULT_BG;
    const size =
      typeof parsed.size === "number"
        ? Math.min(SIZE_MAX, Math.max(SIZE_MIN, parsed.size))
        : DEFAULT_SIZE;
    const level = ECC_LEVELS.includes(parsed.level as EccLevel)
      ? (parsed.level as EccLevel)
      : "M";
    return {
      text: typeof parsed.text === "string" ? parsed.text : "",
      fg,
      bg,
      size,
      level,
    };
  } catch {
    return INITIAL;
  }
}

function CropMarks({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn("pointer-events-none absolute inset-0", className)}>
      <span className="absolute top-0 left-0 h-4 w-4 border-t border-l border-fg/35" />
      <span className="absolute top-0 right-0 h-4 w-4 border-t border-r border-fg/35" />
      <span className="absolute bottom-0 left-0 h-4 w-4 border-b border-l border-fg/35" />
      <span className="absolute right-0 bottom-0 h-4 w-4 border-b border-r border-fg/35" />
    </div>
  );
}

function ColorField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const hintId = `${id}-hint`;

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const invalid = normalizeHex(draft) === null;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <div className="relative size-11 shrink-0 overflow-hidden rounded-md border border-border bg-surface shadow-(--shadow-border) focus-within:ring-2 focus-within:ring-ring/30">
          <span
            className="absolute inset-0"
            style={{ backgroundColor: value }}
            aria-hidden="true"
          />
          <input
            type="color"
            value={value}
            onChange={(event) => onChange(event.target.value.toLowerCase())}
            aria-label={`${label}色板`}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
          />
        </div>
        <input
          id={id}
          type="text"
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          value={draft}
          aria-invalid={invalid}
          aria-describedby={hintId}
          onChange={(event) => {
            const next = event.target.value;
            setDraft(next);
            const normalized = normalizeHex(next);
            if (normalized) onChange(normalized);
          }}
          onBlur={() => setDraft(value)}
          className={cn(
            "h-11 min-w-0 flex-1 rounded-md border border-border bg-paper px-3 font-mono text-base text-fg outline-none transition-[box-shadow,border-color] duration-150",
            "focus-visible:ring-2 focus-visible:ring-ring/30",
            invalid && "border-danger text-danger",
          )}
        />
      </div>
      <p id={hintId} className="text-xs text-muted">
        十六进制颜色，例如 {value}
      </p>
    </div>
  );
}

export function QrStudio() {
  const [hydrated, setHydrated] = useState(false);
  const [text, setText] = useState(INITIAL.text);
  const [fg, setFg] = useState(INITIAL.fg);
  const [bg, setBg] = useState(INITIAL.bg);
  const [size, setSize] = useState(INITIAL.size);
  const [level, setLevel] = useState<EccLevel>(INITIAL.level);
  const [overlay, setOverlay] = useState<HTMLImageElement | null>(null);
  const [overlayName, setOverlayName] = useState<string | null>(null);
  const [overlayError, setOverlayError] = useState<string | null>(null);
  const [mode, setMode] = useState<CompositeMode>("logo");
  const [logoRatio, setLogoRatio] = useState(LOGO_DEFAULT);
  const [status, setStatus] = useState<"empty" | "ready" | "error">("empty");
  const [error, setError] = useState<string | null>(null);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState(false);
  const [copied, setCopied] = useState<"text" | "image" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const overlayUrlRef = useRef<string | null>(null);
  const levelRef = useRef(level);
  const appliedKeyRef = useRef<string | null>(null);
  levelRef.current = level;
  const contentId = "qr-content";
  const sizeId = "qr-size-label";
  const eccId = "qr-ecc";
  const imageId = useId();
  const modeId = useId();
  const logoSizeId = useId();

  useEffect(() => {
    const saved = loadSettings();
    setText(saved.text);
    setFg(saved.fg);
    setBg(saved.bg);
    setSize(saved.size);
    setLevel(saved.level);
    setHydrated(true);
  }, []);

  useEffect(() => {
    return () => {
      if (overlayUrlRef.current) URL.revokeObjectURL(overlayUrlRef.current);
    };
  }, []);

  useEffect(() => {
    const el = fileRef.current;
    if (!el) return;
    const handler = () => {
      const file = el.files?.[0];
      if (file) void applyImage(file);
    };
    el.addEventListener("change", handler);
    el.addEventListener("input", handler);
    return () => {
      el.removeEventListener("change", handler);
      el.removeEventListener("input", handler);
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const payload: Settings = { text, fg, bg, size, level };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [hydrated, text, fg, bg, size, level]);

  useEffect(() => {
    const value = text.trim();
    if (!value) {
      setDataUrl(null);
      setStatus("empty");
      setError(null);
      setDownloaded(false);
      setCopied(null);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void renderQrPng({
        text: value,
        size,
        level,
        fg,
        bg,
        overlay,
        mode,
        logoRatio,
      })
        .then((url) => {
          if (cancelled) return;
          setDataUrl(url);
          setStatus("ready");
          setError(null);
        })
        .catch(() => {
          if (cancelled) return;
          setDataUrl(null);
          setStatus("error");
          setError("内容过长，无法编码。请缩短文本，或改用更低的纠错等级。");
        });
    }, 40);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [text, fg, bg, size, level, overlay, mode, logoRatio]);

  const ratio = contrastRatio(fg, bg);
  const contrastHint = contrastWarning(ratio);
  const canDownload = status === "ready";
  const httpUrl = extractHttpUrl(text);
  const ecc = ECC_COPY[level];

  function handleDownload() {
    if (!dataUrl || !canDownload) return;
    downloadDataUrl(dataUrl, overlay ? "qrcode-composed.png" : "qrcode.png");
    setDownloaded(true);
    window.setTimeout(() => setDownloaded(false), 2000);
  }

  async function handleCopyText() {
    const value = text.trim();
    if (!value) return;
    try {
      await copyText(value);
      setCopied("text");
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      /* clipboard may be blocked; keep silent */
    }
  }

  async function handleCopyImage() {
    if (!dataUrl || !canDownload) return;
    try {
      await copyPngDataUrl(dataUrl);
      setCopied("image");
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      handleDownload();
    }
  }

  function resetAppearance() {
    setFg(DEFAULT_FG);
    setBg(DEFAULT_BG);
    setSize(DEFAULT_SIZE);
    setLevel(overlay ? "H" : "M");
    setMode("logo");
    setLogoRatio(LOGO_DEFAULT);
  }

  async function applyImage(file: File) {
    const problem = imageFileError(file);
    if (problem) {
      setOverlayError(problem);
      return;
    }
    const key = `${file.name}:${file.size}:${file.lastModified}`;
    if (appliedKeyRef.current === key) return;
    try {
      const image = await loadImageFile(file);
      if (overlayUrlRef.current && overlayUrlRef.current !== image.src) {
        URL.revokeObjectURL(overlayUrlRef.current);
      }
      overlayUrlRef.current = image.src;
      appliedKeyRef.current = key;
      setOverlay(image);
      setOverlayName(file.name);
      setOverlayError(null);
      if (levelRef.current === "L" || levelRef.current === "M") setLevel("H");
    } catch {
      setOverlayError("无法读取这张图片，请换一张再试。");
    }
  }

  function clearImage() {
    if (overlayUrlRef.current) {
      URL.revokeObjectURL(overlayUrlRef.current);
      overlayUrlRef.current = null;
    }
    appliedKeyRef.current = null;
    setOverlay(null);
    setOverlayName(null);
    setOverlayError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="relative min-h-dvh overflow-x-hidden">
      <img
        src="/art/hero.jpg"
        alt="暮色屋顶花园里，一位年轻店主站在花灯下，双手递出一张空白宣纸。"
        width={1792}
        height={1008}
        className="pointer-events-none absolute inset-0 h-full w-full object-cover object-[center_18%] lg:object-[78%_center]"
        crossOrigin="anonymous"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-linear-to-b from-dusk/55 via-dusk/50 to-dusk/80 lg:bg-linear-to-r lg:from-dusk/80 lg:via-dusk/45 lg:to-transparent"
      />

      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
        <header className="mb-8 flex max-w-xl items-end gap-4 sm:mb-10">
          <img
            src="/art/portrait.jpg"
            alt=""
            width={1408}
            height={1408}
            className="size-16 shrink-0 rounded-full object-cover outline outline-2 outline-lantern/80 lg:hidden"
            crossOrigin="anonymous"
          />
          <div>
            <p className="mb-2 font-mono text-xs tracking-mark text-lantern uppercase">
              夜色工房
            </p>
            <h1 className="font-display text-4xl leading-tight tracking-display text-paper sm:text-5xl">
              墨码
            </h1>
            <p className="mt-2 text-base leading-relaxed text-paper/80">
              花灯下生成二维码。输入即可出图，不必另找设备。
            </p>
          </div>
        </header>

        <div className="flex max-w-xl flex-col gap-6">
        <section
          aria-labelledby="qr-content-heading"
          className="rounded-xl bg-paper/90 p-5 text-fg shadow-(--shadow-border) backdrop-blur-md sm:p-6"
        >
          <div className="flex items-center justify-between gap-3">
            <Label id="qr-content-heading" htmlFor={contentId}>
              内容
            </Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-11 px-2 text-xs"
              onClick={() => setText(SAMPLE)}
            >
              填入示例
            </Button>
          </div>
          <textarea
            id={contentId}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="粘贴链接，或输入任意文本"
            rows={5}
            aria-describedby={`${contentId}-hint ${contentId}-count`}
            className="mt-2 min-h-32 w-full resize-y rounded-md border border-border bg-paper px-3 py-3 text-base leading-relaxed text-fg outline-none transition-[box-shadow,border-color] duration-150 placeholder:text-subtle focus-visible:ring-2 focus-visible:ring-ring/30"
          />
          <div className="mt-2 flex items-start justify-between gap-3 text-xs text-muted">
            <p id={`${contentId}-hint`}>
              支持网址、纯文本，或 Wi-Fi、名片等标准编码。
            </p>
            <p
              id={`${contentId}-count`}
              className="shrink-0 font-mono tabular-nums"
            >
              {text.length} 字
            </p>
          </div>
        </section>

        <section
          aria-labelledby="qr-preview"
          className="rounded-xl bg-paper/90 p-5 text-fg shadow-(--shadow-border) backdrop-blur-md sm:p-6"
        >
          <div className="mb-5 flex items-end justify-between gap-3">
            <div>
              <h2
                id="qr-preview"
                className="font-display text-2xl tracking-display text-fg"
              >
                预览
              </h2>
              <p className="mt-1 text-sm text-muted">
                {overlay ? "已叠入图片，预览即合成结果" : "输入时即时更新"}
              </p>
            </div>
            {ratio !== null ? (
              <p className="font-mono text-xs tabular-nums text-subtle">
                对比 {ratio.toFixed(1)}:1
              </p>
            ) : null}
          </div>

          <div className="relative flex min-h-56 flex-col items-center justify-center rounded-lg bg-dusk/5 px-6 py-8 sm:min-h-72 sm:py-10">
            <CropMarks />
            {dataUrl && status === "ready" ? (
              <img
                src={dataUrl}
                alt="二维码预览"
                width={size}
                height={size}
                className="h-auto w-full max-w-xs outline outline-1 -outline-offset-1 outline-fg/10"
                style={{ imageRendering: overlay ? "auto" : "pixelated" }}
              />
            ) : (
              <p className="max-w-xs text-center text-sm leading-relaxed text-muted">
                {status === "error"
                  ? error
                  : "输入内容后，二维码会显示在这里。无需另找设备扫描。"}
              </p>
            )}
          </div>

          {contrastHint ? (
            <p
              role="alert"
              className="mt-4 flex items-start gap-2 text-sm text-warn"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{contrastHint}</span>
            </p>
          ) : null}

          {error && status === "error" ? (
            <p role="alert" className="sr-only">
              {error}
            </p>
          ) : null}

          <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={!text.trim()}
              onClick={() => void handleCopyText()}
            >
              {copied === "text" ? <Check /> : <Copy />}
              {copied === "text" ? "内容已复制" : "复制内容"}
            </Button>
            {httpUrl ? (
              <Button asChild variant="outline" className="w-full">
                <a href={httpUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink />
                  打开链接
                </a>
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={!canDownload}
                onClick={() => void handleCopyImage()}
              >
                {copied === "image" ? <Check /> : <ImageDown />}
                {copied === "image" ? "图片已复制" : "复制图片"}
              </Button>
            )}
          </div>
          <Button
            type="button"
            size="lg"
            className="mt-2 w-full"
            disabled={!canDownload}
            onClick={handleDownload}
            aria-live="polite"
          >
            {downloaded ? (
              <>
                <Check />
                已保存 PNG
              </>
            ) : (
              <>
                <Download />
                下载 PNG
              </>
            )}
          </Button>
          <p className="mt-2 text-center text-xs text-subtle">
            {canDownload
              ? httpUrl
                ? "可直接打开链接，或下载图片发给别人扫"
                : `将导出 ${size}×${size} 像素的 PNG 文件`
              : "生成后即可复制或下载，不必用另一台设备"}
          </p>
        </section>

        <section
          aria-labelledby="qr-appearance"
          className="rounded-xl bg-paper/90 p-5 text-fg shadow-(--shadow-border) backdrop-blur-md sm:p-6"
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 id="qr-appearance" className="text-sm font-medium text-fg">
              外观
            </h2>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-11 gap-1.5 px-2 text-xs"
              onClick={resetAppearance}
            >
              <RotateCcw />
              恢复默认
            </Button>
          </div>

          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <ColorField id="qr-fg" label="前景色" value={fg} onChange={setFg} />
              <ColorField id="qr-bg" label="背景色" value={bg} onChange={setBg} />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor={imageId}>合成图片</Label>
              <input
                ref={fileRef}
                id={imageId}
                type="file"
                accept={IMAGE_ACCEPT}
                className="sr-only"
                aria-describedby={`${imageId}-hint`}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void applyImage(file);
                }}
              />
              <div
                className={cn(
                  "flex min-h-20 items-center gap-3 rounded-md border border-dashed border-border bg-ink/5 px-3 py-3",
                  overlayError && "border-danger",
                )}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "copy";
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const file = event.dataTransfer.files[0];
                  if (file) void applyImage(file);
                }}
              >
                {overlay ? (
                  <>
                    <img
                      src={overlay.src}
                      alt=""
                      width={44}
                      height={44}
                      className="size-11 shrink-0 rounded-md object-cover outline outline-1 outline-fg/10"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-fg">{overlayName}</p>
                      <p className="text-xs text-muted">
                        {mode === "logo" ? "叠在码心" : "铺在底图"}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-11 shrink-0 px-2"
                      onClick={clearImage}
                    >
                      <X />
                      移除
                    </Button>
                  </>
                ) : (
                  <label
                    htmlFor={imageId}
                    className="flex min-h-11 w-full cursor-pointer items-center gap-3 text-sm text-muted"
                  >
                    <ImagePlus className="size-5 shrink-0 text-sakura" aria-hidden="true" />
                    <span>点此选择，或把图片拖进来</span>
                  </label>
                )}
              </div>
              <p id={`${imageId}-hint`} className="text-xs leading-relaxed text-muted">
                PNG / JPEG / WebP，最大 8 MB。图片只在本页合成，不会上传。
              </p>
              {overlayError ? (
                <p role="alert" className="flex items-start gap-2 text-sm text-danger">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span>{overlayError}</span>
                </p>
              ) : null}

              {overlay ? (
                <>
                  <div className="flex flex-col gap-2">
                    <Label id={modeId}>合成方式</Label>
                    <RadioGroup.Root
                      value={mode}
                      onValueChange={(value) => setMode(value as CompositeMode)}
                      aria-labelledby={modeId}
                      className="grid grid-cols-2 gap-1 rounded-md bg-ink/5 p-1"
                    >
                      <RadioGroup.Item
                        value="logo"
                        className={cn(
                          "flex h-11 items-center justify-center rounded-sm text-sm font-medium text-muted outline-none transition-[background-color,color,box-shadow] duration-150",
                          "hover:text-fg focus-visible:ring-2 focus-visible:ring-ring/30",
                          "data-[state=checked]:bg-sakura/15 data-[state=checked]:text-fg data-[state=checked]:shadow-(--shadow-border)",
                        )}
                      >
                        中心贴标
                      </RadioGroup.Item>
                      <RadioGroup.Item
                        value="backdrop"
                        className={cn(
                          "flex h-11 items-center justify-center rounded-sm text-sm font-medium text-muted outline-none transition-[background-color,color,box-shadow] duration-150",
                          "hover:text-fg focus-visible:ring-2 focus-visible:ring-ring/30",
                          "data-[state=checked]:bg-sakura/15 data-[state=checked]:text-fg data-[state=checked]:shadow-(--shadow-border)",
                        )}
                      >
                        铺在图上
                      </RadioGroup.Item>
                    </RadioGroup.Root>
                  </div>

                  {mode === "logo" ? (
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-3">
                        <Label id={logoSizeId}>贴标大小</Label>
                        <p className="font-mono text-sm tabular-nums text-fg">
                          {Math.round(logoRatio * 100)}%
                        </p>
                      </div>
                      <Slider.Root
                        min={LOGO_MIN}
                        max={LOGO_MAX}
                        step={LOGO_STEP}
                        value={[logoRatio]}
                        onValueChange={(next) => {
                          const value = next[0];
                          if (typeof value === "number") setLogoRatio(value);
                        }}
                        className="relative flex h-11 w-full touch-none items-center select-none"
                      >
                        <Slider.Track className="relative h-1.5 grow rounded-full bg-border">
                          <Slider.Range className="absolute h-full rounded-full bg-sakura" />
                        </Slider.Track>
                        <Slider.Thumb
                          className="block size-5 rounded-full bg-sakura shadow-(--shadow-border) outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                          aria-labelledby={logoSizeId}
                        />
                      </Slider.Root>
                    </div>
                  ) : (
                    <p className="text-xs leading-relaxed text-muted">
                      浅色码点会透出底图。选对比清楚的照片，并尽量用高纠错。
                    </p>
                  )}
                </>
              ) : null}
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <Label id={sizeId}>尺寸</Label>
                <p className="font-mono text-sm tabular-nums text-fg">
                  {size} px
                </p>
              </div>
              <Slider.Root
                min={SIZE_MIN}
                max={SIZE_MAX}
                step={SIZE_STEP}
                value={[size]}
                onValueChange={(next) => {
                  const value = next[0];
                  if (typeof value === "number") setSize(value);
                }}
                className="relative flex h-11 w-full touch-none items-center select-none"
              >
                <Slider.Track className="relative h-1.5 grow rounded-full bg-border">
                  <Slider.Range className="absolute h-full rounded-full bg-sakura" />
                </Slider.Track>
                <Slider.Thumb
                  className="block size-5 rounded-full bg-sakura shadow-(--shadow-border) outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  aria-label="尺寸，单位像素"
                />
              </Slider.Root>
              <p className="text-xs text-muted">
                边长 {SIZE_MIN}–{SIZE_MAX} 像素，用于下载分辨率。
              </p>
            </div>

            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium text-fg">纠错等级</legend>
              <RadioGroup.Root
                id={eccId}
                value={level}
                onValueChange={(value) => setLevel(value as EccLevel)}
                aria-label="纠错等级"
                aria-describedby={`${eccId}-hint`}
                className="grid grid-cols-4 gap-1 rounded-md bg-ink/5 p-1"
              >
                {ECC_LEVELS.map((item) => (
                  <RadioGroup.Item
                    key={item}
                    value={item}
                    className={cn(
                      "flex h-11 items-center justify-center rounded-sm text-sm font-medium text-muted outline-none transition-[background-color,color,box-shadow] duration-150",
                      "hover:text-fg focus-visible:ring-2 focus-visible:ring-ring/30",
                      "data-[state=checked]:bg-sakura/15 data-[state=checked]:text-fg data-[state=checked]:shadow-(--shadow-border)",
                    )}
                  >
                    {item}
                    <span className="sr-only">
                      {ECC_COPY[item].name}，可恢复 {ECC_COPY[item].recovery}
                    </span>
                  </RadioGroup.Item>
                ))}
              </RadioGroup.Root>
              <p id={`${eccId}-hint`} className="text-xs leading-relaxed text-muted">
                {ecc.name} · 可恢复 {ecc.recovery} 损坏。
                {overlay
                  ? " 叠图会挡住一部分码点，建议保持高纠错。"
                  : ` ${ecc.hint}`}
              </p>
            </fieldset>
          </div>
        </section>
        </div>
      </div>
    </div>
  );
}
