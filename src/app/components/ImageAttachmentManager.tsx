'use client';

import React, { useRef, useState, useCallback } from 'react';
import { ImageIcon, Upload, X, Eye, FileImage } from 'lucide-react';
import { toast } from 'sonner';
import AppImage from '@/components/ui/AppImage';

interface ImageItem {
  id: string;
  name: string;
  url: string;
  size: number;
}

interface ImageAttachmentManagerProps {
  images: ImageItem[];
  onChange: (images: ImageItem[]) => void;
  isRunning: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export default function ImageAttachmentManager({ images, onChange, isRunning }: ImageAttachmentManagerProps) {
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<ImageItem | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const errors: string[] = [];
    const fileArray = Array.from(files).filter(file => {
      if (!allowed.includes(file.type)) { errors.push(`${file.name}: unsupported format`); return false; }
      if (file.size > 5 * 1024 * 1024) { errors.push(`${file.name}: exceeds 5MB limit`); return false; }
      return true;
    });

    if (fileArray.length === 0) {
      errors.forEach(e => toast.error(e));
      return;
    }

    // Convert each file to a base64 data URL immediately so fireCycle can use it without fetch
    const readers = fileArray.map(file => new Promise<ImageItem>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({
        id: `img-${Date.now()}-${Math.random().toString(36).slice(2)}-${file.name.replace(/\s+/g, '-')}`,
        name: file.name,
        url: reader.result as string, // base64 data URL
        size: file.size,
      });
      reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
      reader.readAsDataURL(file);
    }));

    Promise.allSettled(readers).then(results => {
      const toAdd: ImageItem[] = [];
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') toAdd.push(r.value);
        else errors.push(`${fileArray[i].name}: could not read file`);
      });
      if (toAdd.length > 0) {
        onChange([...images, ...toAdd]);
        toast.success(`Attached ${toAdd.length} image${toAdd.length !== 1 ? 's' : ''}`);
      }
      errors.forEach(e => toast.error(e));
    });
  }, [images, onChange]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleRemove = (id: string) => {
    // No blob URL to revoke — images are now stored as base64 data URLs
    onChange(images.filter(i => i.id !== id));
  };

  return (
    <>
      {/* Preview modal */}
      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}
          onClick={() => setPreview(null)}
        >
          <div className="relative max-w-2xl max-h-[80vh] rounded-lg overflow-hidden"
            onClick={e => e.stopPropagation()}>
            <AppImage
              src={preview.url}
              alt={`Preview of ${preview.name}`}
              width={800}
              height={600}
              className="object-contain max-h-[75vh]"
            />
            <button
              type="button"
              className="absolute top-2 right-2 btn-icon"
              style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
              onClick={() => setPreview(null)}
            >
              <X size={16} />
            </button>
            <div className="absolute bottom-0 left-0 right-0 px-3 py-2"
              style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
              <p className="text-xs text-foreground font-mono-data">{preview.name} · {formatBytes(preview.size)}</p>
            </div>
          </div>
        </div>
      )}

      <div className="config-card">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ImageIcon size={15} className="text-primary" />
            <span className="text-sm font-semibold text-foreground">Image Attachments</span>
            <span className="font-mono-data text-xs px-1.5 py-0.5 rounded"
              style={{ backgroundColor: 'rgba(0,212,170,0.08)', color: 'var(--primary)', border: '1px solid rgba(0,212,170,0.15)' }}>
              {images.length} image{images.length !== 1 ? 's' : ''}
            </span>
          </div>
          {!isRunning && (
            <button
              type="button"
              className="btn-secondary text-xs py-1 px-2.5 gap-1"
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={12} />
              Attach Images
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/gif,image/webp"
            className="hidden"
            onChange={e => handleFiles(e.target.files)}
          />
        </div>

        <label className="config-label">Cycle Image Attachments</label>
        <p className="text-xs text-muted-foreground mb-3">
          Add as many images as you want. The bot will randomly pick one per tweet cycle.
          Supported: JPG, PNG, GIF, WEBP · Max 5MB each.
        </p>

        {/* Drop zone */}
        <div
          className={`border-2 border-dashed rounded p-4 text-center transition-all cursor-pointer mb-3 ${dragOver ? 'drag-active' : ''}`}
          style={{ borderColor: dragOver ? 'var(--primary)' : 'var(--border)', backgroundColor: dragOver ? 'rgba(0,212,170,0.04)' : 'var(--input)' }}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => !isRunning && fileRef.current?.click()}
        >
          <FileImage size={18} className="mx-auto mb-1.5 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            {dragOver ? 'Drop images here' : 'Drop images or click to browse — bot picks one randomly per cycle'}
          </p>
        </div>

        {/* Image grid */}
        {images.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {images.map((img, idx) => (
              <div
                key={img.id}
                className="relative rounded overflow-hidden group"
                style={{ border: '1px solid var(--border)', aspectRatio: '16/9' }}
              >
                <AppImage
                  src={img.url}
                  alt={`Attachment ${idx + 1}: ${img.name}`}
                  fill
                  className="object-cover"
                  unoptimized
                />
                <div className="absolute inset-0 flex items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}>
                  <button
                    type="button"
                    className="btn-icon"
                    style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
                    onClick={() => setPreview(img)}
                    aria-label={`Preview ${img.name}`}
                  >
                    <Eye size={14} />
                  </button>
                  {!isRunning && (
                    <button
                      type="button"
                      className="btn-icon"
                      style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
                      onClick={() => handleRemove(img.id)}
                      aria-label={`Remove ${img.name}`}
                    >
                      <X size={14} className="text-red-400" />
                    </button>
                  )}
                </div>
                <div className="absolute bottom-0 left-0 right-0 px-1.5 py-1"
                  style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
                  <p className="text-xs text-foreground font-mono-data truncate">{img.name}</p>
                  <p className="text-xs text-muted-foreground font-mono-data">{formatBytes(img.size)}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {images.length === 0 && (
          <div className="flex flex-col items-center justify-center py-4 text-center">
            <ImageIcon size={18} className="text-muted-foreground mb-1.5" />
            <p className="text-xs text-muted-foreground">
              No images attached — automation will run text-only.
            </p>
          </div>
        )}
      </div>
    </>
  );
}