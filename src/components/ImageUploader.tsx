import { useCallback, useState } from 'react';
import { Trash2 } from 'lucide-react';

type ImageAlignment = 'left' | 'center' | 'right';
type ImageSize = '0.1' | '0.2' | '0.3' | '0.4' | '0.5' | '0.6' | '0.7' | '0.8' | '0.9' | '1.0';

interface ImageUploaderProps {
  images: Record<string, string>;
  onUpload: (name: string, dataUrl: string) => void;
  onRemove: (name: string) => void;
  onRemoveInserted: (name: string) => void;
  onInsert: (name: string, align: ImageAlignment, size: ImageSize) => void;
}

export default function ImageUploader({ images, onUpload, onRemove, onRemoveInserted, onInsert }: ImageUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [alignments, setAlignments] = useState<Record<string, ImageAlignment>>({});
  const [sizes, setSizes] = useState<Record<string, ImageSize>>({});

  const handleFiles = useCallback((files: FileList) => {
    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = () => {
        onUpload(file.name, reader.result as string);
      };
      reader.readAsDataURL(file);
    });
  }, [onUpload]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const imageNames = Object.keys(images);

  return (
    <div className="p-3">
      <div
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer ${
          isDragging ? 'border-primary bg-primary/10' : 'border-border hover:border-muted-foreground'
        }`}
        onClick={() => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = 'image/*';
          input.multiple = true;
          input.onchange = () => input.files && handleFiles(input.files);
          input.click();
        }}
      >
        <div className="text-2xl mb-1">Image</div>
        <p className="text-sm text-muted-foreground">Drop images here or click to upload</p>
      </div>

      {imageNames.length > 0 && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Uploaded Images</p>
          {imageNames.map(name => (
            <div key={name} className="flex items-center gap-2 bg-secondary/30 rounded-lg p-2">
              <img src={images[name]} alt={name} className="w-10 h-10 rounded object-cover" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-foreground truncate font-mono">{name}</p>
              </div>
              <label className="flex items-center gap-1 text-xs text-muted-foreground">
                image size:
                <select
                  value={sizes[name] || '0.6'}
                  onChange={event => setSizes(prev => ({ ...prev, [name]: event.target.value as ImageSize }))}
                  className="px-2 py-1 text-xs rounded bg-editor-bg border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  aria-label={`Image size for ${name}`}
                >
                  {(['0.1', '0.2', '0.3', '0.4', '0.5', '0.6', '0.7', '0.8', '0.9', '1.0'] as ImageSize[]).map(size => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
              </label>
              <select
                value={alignments[name] || 'center'}
                onChange={event => setAlignments(prev => ({ ...prev, [name]: event.target.value as ImageAlignment }))}
                className="px-2 py-1 text-xs rounded bg-editor-bg border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                aria-label={`Alignment for ${name}`}
              >
                <option value="center">Center</option>
                <option value="left">Left</option>
                <option value="right">Right</option>
              </select>
              <button
                onClick={() => onInsert(name, alignments[name] || 'center', sizes[name] || '0.6')}
                className="text-xs px-2 py-1 rounded bg-primary/20 text-primary hover:bg-primary/30 transition-colors"
                title="Insert into editor"
              >
                Insert
              </button>
              <button
                onClick={() => onRemoveInserted(name)}
                className="text-xs px-2 py-1 rounded bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
                title="Remove latest inserted instance from editor"
              >
                Remove
              </button>
              <button
                onClick={() => onRemove(name)}
                className="h-7 w-7 rounded bg-destructive/20 text-destructive hover:bg-destructive/30 transition-colors inline-flex items-center justify-center"
                title="Delete uploaded image"
                aria-label={`Delete uploaded image ${name}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
