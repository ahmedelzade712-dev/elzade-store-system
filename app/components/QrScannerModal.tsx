"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import QrScanner from "qr-scanner";

type QrScannerModalProps = {
  open: boolean;
  onClose: () => void;
  onScan: (value: string) => void;
  title?: string;
};

function cameraErrorMessage(error: unknown) {
  const name =
    typeof error === "object" && error && "name" in error
      ? String((error as { name?: unknown }).name || "")
      : "";

  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "تم رفض إذن الكاميرا. افتح إعدادات Safari واسمح للموقع باستخدام الكاميرا ثم أعد المحاولة.";
  }

  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "لم يتم العثور على كاميرا في هذا الجهاز.";
  }

  if (name === "NotReadableError" || name === "TrackStartError") {
    return "تعذر تشغيل الكاميرا. قد تكون مستخدمة في تطبيق آخر. أغلق التطبيقات الأخرى ثم أعد المحاولة.";
  }

  if (name === "OverconstrainedError") {
    return "تعذر تشغيل الكاميرا الخلفية بالإعدادات المطلوبة.";
  }

  if (name === "SecurityError") {
    return "تشغيل الكاميرا يحتاج إلى فتح النظام عبر HTTPS.";
  }

  return "تعذر تشغيل قارئ QR. تأكد من السماح بالكاميرا ثم أعد المحاولة.";
}

export default function QrScannerModal({
  open,
  onClose,
  onScan,
  title = "قراءة QR",
}: QrScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scanCompletedRef = useRef(false);

  const [starting, setStarting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [flashAvailable, setFlashAvailable] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
  const [readingImage, setReadingImage] = useState(false);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    async function startScanner() {
      const video = videoRef.current;
      if (!video) return;

      scanCompletedRef.current = false;
      setStarting(true);
      setErrorMessage("");
      setFlashAvailable(false);
      setFlashOn(false);

      const scanner = new QrScanner(
        video,
        (result) => {
          const value = result.data.trim();

          if (!value || scanCompletedRef.current) return;

          scanCompletedRef.current = true;
          scanner.stop();
          onScan(value);
        },
        {
          preferredCamera: "environment",
          maxScansPerSecond: 12,
          highlightScanRegion: true,
          highlightCodeOutline: true,
          returnDetailedScanResult: true,
          onDecodeError: () => {
            // عدم العثور على QR في إطار معيّن أمر طبيعي، لذلك لا نعرض خطأ.
          },
        }
      );

      scannerRef.current = scanner;

      try {
        const hasCamera = await QrScanner.hasCamera();

        if (!hasCamera) {
          throw new DOMException("Camera not found", "NotFoundError");
        }

        await scanner.start();

        if (cancelled) {
          scanner.stop();
          return;
        }

        const canUseFlash = await scanner.hasFlash().catch(() => false);
        setFlashAvailable(canUseFlash);
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(cameraErrorMessage(error));
        }
      } finally {
        if (!cancelled) {
          setStarting(false);
        }
      }
    }

    void startScanner();

    return () => {
      cancelled = true;

      const scanner = scannerRef.current;
      scannerRef.current = null;

      if (scanner) {
        scanner.stop();
        scanner.destroy();
      }
    };
  }, [open, onScan]);

  useEffect(() => {
    if (!open) return;

    function closeWithEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", closeWithEscape);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", closeWithEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  async function toggleFlash() {
    const scanner = scannerRef.current;
    if (!scanner || !flashAvailable) return;

    try {
      await scanner.toggleFlash();
      setFlashOn(scanner.isFlashOn());
    } catch {
      setErrorMessage("تعذر تشغيل ضوء الكاميرا على هذا الجهاز.");
    }
  }

  async function scanSelectedImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    setReadingImage(true);
    setErrorMessage("");

    try {
      const result = await QrScanner.scanImage(file, {
        returnDetailedScanResult: true,
        alsoTryWithoutScanRegion: true,
      });

      const value = result.data.trim();

      if (!value) {
        throw new Error("empty-result");
      }

      scanCompletedRef.current = true;
      scannerRef.current?.stop();
      onScan(value);
    } catch {
      setErrorMessage(
        "لم يتم العثور على QR واضح في الصورة. اختر صورة أوضح أو استخدم الكاميرا مباشرة."
      );
    } finally {
      setReadingImage(false);
    }
  }

  if (!open) return null;

  return (
    <div
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-3 sm:p-6"
    >
      <div className="flex max-h-[96dvh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-neutral-700 bg-neutral-950 text-white shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-neutral-800 p-4">
          <div>
            <h2 className="text-xl font-black">{title}</h2>
            <p className="mt-1 text-sm text-neutral-400">
              ضع رمز QR داخل المربع وسيتم البحث تلقائيًا
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-xl border border-neutral-700 px-4 py-2 font-bold"
            aria-label="إغلاق قارئ QR"
          >
            إغلاق
          </button>
        </div>

        <div className="overflow-y-auto p-4">
          <div className="relative overflow-hidden rounded-2xl border border-neutral-700 bg-black">
            <video
              ref={videoRef}
              playsInline
              muted
              className="aspect-[3/4] max-h-[62dvh] w-full object-cover sm:aspect-square"
            />

            {starting && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/70 p-6 text-center font-bold">
                جاري تشغيل الكاميرا...
              </div>
            )}

            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
            >
              <div className="h-56 w-56 max-w-[72%] rounded-3xl border-4 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.28)]" />
            </div>
          </div>

          {errorMessage && (
            <div className="mt-4 rounded-xl border border-red-700 bg-red-950/50 p-4 text-red-200">
              {errorMessage}
            </div>
          )}

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {flashAvailable && (
              <button
                type="button"
                onClick={toggleFlash}
                className="rounded-xl bg-yellow-500 px-5 py-3 font-black text-black"
              >
                {flashOn ? "إطفاء ضوء الكاميرا" : "تشغيل ضوء الكاميرا"}
              </button>
            )}

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={readingImage}
              className="rounded-xl bg-blue-600 px-5 py-3 font-bold disabled:opacity-50"
            >
              {readingImage ? "جاري قراءة الصورة..." : "اختيار صورة QR"}
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={scanSelectedImage}
            className="hidden"
          />

          <p className="mt-4 text-center text-xs leading-6 text-neutral-400">
            على iPhone يجب فتح النظام عبر HTTPS والسماح لـ Safari باستخدام
            الكاميرا. ويمكنك أيضًا اختيار صورة QR محفوظة في الهاتف.
          </p>
        </div>
      </div>
    </div>
  );
}
