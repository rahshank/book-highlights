"use client";

import { useEffect, useRef, useState } from "react";

interface ISBNScannerProps {
  onDetected: (isbn: string) => void;
  onClose: () => void;
}

export default function ISBNScanner({ onDetected, onClose }: ISBNScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<import("@zxing/library").BrowserMultiFormatReader | null>(null);
  const detectedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function startScanning() {
      const { BrowserMultiFormatReader, BarcodeFormat, DecodeHintType } =
        await import("@zxing/library");

      if (cancelled) return;

      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
      ]);
      hints.set(DecodeHintType.TRY_HARDER, true);

      const reader = new BrowserMultiFormatReader(hints, 300);
      readerRef.current = reader;

      try {
        await reader.decodeFromVideoDevice(
          null, // use default camera (environment-facing on mobile)
          videoRef.current!,
          (result, err) => {
            if (cancelled || detectedRef.current) return;

            if (result) {
              const text = result.getText();
              // EAN-13 barcodes for books start with 978 or 979
              if (text.startsWith("978") || text.startsWith("979")) {
                detectedRef.current = true;
                reader.reset();
                onDetected(text);
              }
            }
            // err is expected when no barcode is in frame — ignore
            void err;
          }
        );
      } catch (err) {
        if (cancelled) return;
        if (err instanceof DOMException && err.name === "NotAllowedError") {
          setError("Camera access denied. Please allow camera access and try again.");
        } else {
          setError("Could not start camera. Make sure you're using HTTPS.");
        }
      }
    }

    startScanning();

    return () => {
      cancelled = true;
      readerRef.current?.reset();
    };
  }, [onDetected]);

  function handleClose() {
    readerRef.current?.reset();
    onClose();
  }

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={headerStyle}>
          <span style={{ fontWeight: 600 }}>Scan ISBN Barcode</span>
          <button onClick={handleClose} style={closeBtnStyle}>
            &times;
          </button>
        </div>

        {error ? (
          <div style={errorStyle}>{error}</div>
        ) : (
          <div style={viewfinderContainerStyle}>
            <video
              ref={videoRef}
              playsInline
              muted
              style={videoStyle}
            />
            <div style={guideLine} />
          </div>
        )}

        <p style={hintStyle}>
          Point your camera at the barcode on the back of a book
        </p>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.7)",
  zIndex: 1000,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "1rem",
};

const modalStyle: React.CSSProperties = {
  background: "var(--card, #fff)",
  borderRadius: "12px",
  overflow: "hidden",
  width: "100%",
  maxWidth: "480px",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "0.75rem 1rem",
  borderBottom: "1px solid var(--border, #d6d3d1)",
};

const closeBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  fontSize: "1.5rem",
  cursor: "pointer",
  lineHeight: 1,
  color: "var(--fg, #1c1917)",
};

const viewfinderContainerStyle: React.CSSProperties = {
  position: "relative",
  width: "100%",
  aspectRatio: "4/3",
  background: "#000",
  overflow: "hidden",
};

const videoStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
};

// Horizontal guide line to help aim at the barcode
const guideLine: React.CSSProperties = {
  position: "absolute",
  left: "10%",
  right: "10%",
  top: "50%",
  height: "2px",
  background: "rgba(180, 83, 9, 0.7)",
  pointerEvents: "none",
};

const errorStyle: React.CSSProperties = {
  padding: "2rem 1rem",
  textAlign: "center",
  color: "#991b1b",
};

const hintStyle: React.CSSProperties = {
  padding: "0.75rem 1rem",
  textAlign: "center",
  fontSize: "0.85rem",
  color: "var(--muted, #78716c)",
};
