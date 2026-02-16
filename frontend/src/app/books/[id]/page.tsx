"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  getBook,
  createHighlight,
  scanPagePhoto,
  deleteHighlight,
  updateHighlight,
  publishHighlights,
  type Book,
} from "@/lib/api";

export default function BookPage() {
  const params = useParams();
  const router = useRouter();
  const bookId = params.id as string;

  const [book, setBook] = useState<Book | null>(null);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);

  // Add highlight form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newText, setNewText] = useState("");
  const [newNote, setNewNote] = useState("");
  const [newPage, setNewPage] = useState("");

  // Photo upload — two-step: scan then review
  const [showPhotoUpload, setShowPhotoUpload] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPage, setPhotoPage] = useState("");
  const [photoNote, setPhotoNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [scannedText, setScannedText] = useState("");
  const [scannedImage, setScannedImage] = useState("");
  const [showScanReview, setShowScanReview] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editPage, setEditPage] = useState("");

  const loadBook = useCallback(async () => {
    try {
      setBook(await getBook(bookId));
    } catch {
      setMessage({ type: "error", text: "Failed to load book" });
    }
  }, [bookId]);

  useEffect(() => {
    loadBook();
  }, [loadBook]);

  async function handleAddHighlight(e: React.FormEvent) {
    e.preventDefault();
    if (!newText.trim()) return;
    try {
      await createHighlight({
        book_id: bookId,
        text: newText.trim(),
        note: newNote.trim(),
        page_number: newPage ? parseInt(newPage) : undefined,
      });
      setNewText("");
      setNewNote("");
      setNewPage("");
      setShowAddForm(false);
      setMessage({ type: "success", text: "Highlight added" });
      loadBook();
    } catch {
      setMessage({ type: "error", text: "Failed to add highlight" });
    }
  }

  async function handleScanPhoto(e: React.FormEvent) {
    e.preventDefault();
    if (!photoFile) return;
    setUploading(true);
    try {
      const result = await scanPagePhoto(photoFile);
      setScannedText(result.text);
      setScannedImage(result.source_image);
      if (result.detected_page && !photoPage) {
        setPhotoPage(String(result.detected_page));
      }
      setShowScanReview(true);
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to process photo",
      });
    } finally {
      setUploading(false);
    }
  }

  async function handleConfirmScan() {
    if (!scannedText.trim()) return;
    try {
      await createHighlight({
        book_id: bookId,
        text: scannedText.trim(),
        note: photoNote.trim(),
        page_number: photoPage ? parseInt(photoPage) : undefined,
        source: "ocr",
        source_image: scannedImage,
      });
      setScannedText("");
      setScannedImage("");
      setShowScanReview(false);
      setPhotoFile(null);
      setPhotoPage("");
      setPhotoNote("");
      setShowPhotoUpload(false);
      setMessage({ type: "success", text: "Highlight saved" });
      loadBook();
    } catch {
      setMessage({ type: "error", text: "Failed to save highlight" });
    }
  }

  function handleDiscardScan() {
    setScannedText("");
    setScannedImage("");
    setShowScanReview(false);
  }

  async function handleDelete(highlightId: string) {
    try {
      await deleteHighlight(highlightId);
      loadBook();
    } catch {
      setMessage({ type: "error", text: "Failed to delete highlight" });
    }
  }

  async function handleSaveEdit(highlightId: string) {
    try {
      await updateHighlight(highlightId, {
        text: editText,
        note: editNote,
        page_number: editPage ? parseInt(editPage) : null,
      });
      setEditingId(null);
      loadBook();
    } catch {
      setMessage({ type: "error", text: "Failed to update highlight" });
    }
  }

  async function handlePublish(target: "ghost" | "roam") {
    try {
      const result = await publishHighlights(bookId, target);
      setMessage({
        type: "success",
        text:
          target === "ghost"
            ? `Published as draft to Ghost${result.url ? `: ${result.url}` : ""}`
            : `Published to Roam Research page: ${result.page_title}`,
      });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : `Failed to publish to ${target}`,
      });
    }
  }

  if (!book) return <div className="container">Loading...</div>;

  return (
    <>
      <Link href="/">&larr; Back to library</Link>
      <h1 style={{ marginTop: "1rem" }}>{book.title}</h1>
      {book.author && <p style={{ color: "var(--muted)", marginBottom: "1rem" }}>{book.author}</p>}

      {message && (
        <div className={`message message-${message.type}`}>
          {message.text}
          <button
            onClick={() => setMessage(null)}
            style={{ float: "right", background: "none", border: "none", cursor: "pointer" }}
          >
            &times;
          </button>
        </div>
      )}

      <div className="actions">
        <button className="btn" onClick={() => { setShowAddForm(!showAddForm); setShowPhotoUpload(false); }}>
          + Add Highlight
        </button>
        <button className="btn" onClick={() => { setShowPhotoUpload(!showPhotoUpload); setShowAddForm(false); }}>
          + Scan Page Photo
        </button>
        <button className="btn" onClick={() => handlePublish("ghost")}>
          Publish to Ghost
        </button>
        <button className="btn" onClick={() => handlePublish("roam")}>
          Publish to Roam
        </button>
      </div>

      {/* Manual highlight form */}
      {showAddForm && (
        <form onSubmit={handleAddHighlight} style={{ marginBottom: "2rem" }}>
          <div className="form-group">
            <label>Highlight text *</label>
            <textarea
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              placeholder="Type or paste the highlighted passage..."
              required
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Note (optional)</label>
              <input
                type="text"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Your thoughts on this passage"
              />
            </div>
            <div className="form-group">
              <label>Page number</label>
              <input
                type="number"
                value={newPage}
                onChange={(e) => setNewPage(e.target.value)}
                placeholder="42"
              />
            </div>
          </div>
          <button type="submit" className="btn btn-primary">
            Save Highlight
          </button>
        </form>
      )}

      {/* Photo upload form */}
      {showPhotoUpload && !showScanReview && (
        <form onSubmit={handleScanPhoto} style={{ marginBottom: "2rem" }}>
          <div className="form-group">
            <label>Photo of book page</label>
            <div
              className={`upload-area ${photoFile ? "active" : ""}`}
              onClick={() => document.getElementById("photo-input")?.click()}
            >
              {photoFile ? photoFile.name : "Click to select a photo or drag and drop"}
              <input
                id="photo-input"
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Note (optional)</label>
              <input
                type="text"
                value={photoNote}
                onChange={(e) => setPhotoNote(e.target.value)}
                placeholder="Your note about this page"
              />
            </div>
            <div className="form-group">
              <label>Page number</label>
              <input
                type="number"
                value={photoPage}
                onChange={(e) => setPhotoPage(e.target.value)}
                placeholder="42"
              />
            </div>
          </div>
          <button type="submit" className="btn btn-primary" disabled={!photoFile || uploading}>
            {uploading ? "Scanning..." : "Scan & Extract"}
          </button>
        </form>
      )}

      {/* OCR review step */}
      {showScanReview && (
        <div style={{ marginBottom: "2rem" }}>
          <div className="form-group">
            <label>Extracted text — review and edit before saving</label>
            <textarea
              value={scannedText}
              onChange={(e) => setScannedText(e.target.value)}
              rows={12}
              style={{ fontFamily: "inherit" }}
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Note (optional)</label>
              <input
                type="text"
                value={photoNote}
                onChange={(e) => setPhotoNote(e.target.value)}
                placeholder="Your note about this passage"
              />
            </div>
            <div className="form-group">
              <label>Page number{photoPage ? " (detected)" : ""}</label>
              <input
                type="number"
                value={photoPage}
                onChange={(e) => setPhotoPage(e.target.value)}
                placeholder="42"
              />
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button className="btn btn-primary" onClick={handleConfirmScan}>
              Save Highlight
            </button>
            <button className="btn" onClick={handleDiscardScan}>
              Discard
            </button>
          </div>
        </div>
      )}

      {/* Highlights list */}
      <h2>{book.highlights.length} Highlights</h2>
      {book.highlights.length === 0 ? (
        <div className="empty">
          <p>No highlights yet. Add one manually or scan a book page.</p>
        </div>
      ) : (
        book.highlights.map((h) => (
          <div key={h.id} className="highlight-card">
            {editingId === h.id ? (
              <>
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  style={{ marginBottom: "0.5rem" }}
                />
                <div className="form-row" style={{ marginBottom: "0.5rem" }}>
                  <input
                    type="text"
                    value={editNote}
                    onChange={(e) => setEditNote(e.target.value)}
                    placeholder="Note"
                  />
                  <input
                    type="number"
                    value={editPage}
                    onChange={(e) => setEditPage(e.target.value)}
                    placeholder="Page #"
                    style={{ maxWidth: "100px" }}
                  />
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button className="btn btn-primary btn-sm" onClick={() => handleSaveEdit(h.id)}>
                    Save
                  </button>
                  <button className="btn btn-sm" onClick={() => setEditingId(null)}>
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                {h.text && <div className="text">&ldquo;{h.text}&rdquo;</div>}
                {h.note && <div className="note">Note: {h.note}</div>}
                <div className="meta">
                  <span>
                    {[
                      h.page_number ? `Page ${h.page_number}` : null,
                      h.location ? `Location ${h.location}` : null,
                      h.source,
                    ]
                      .filter(Boolean)
                      .join(" \u00b7 ")}
                  </span>
                  {h.created_at && (
                    <span className="timestamp">
                      {new Date(h.created_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  )}
                </div>
                <div style={{ marginTop: "0.5rem", display: "flex", gap: "0.5rem" }}>
                  <button
                    className="btn btn-sm"
                    onClick={() => {
                      setEditingId(h.id);
                      setEditText(h.text);
                      setEditNote(h.note);
                      setEditPage(h.page_number ? String(h.page_number) : "");
                    }}
                  >
                    Edit
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDelete(h.id)}>
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        ))
      )}
    </>
  );
}
