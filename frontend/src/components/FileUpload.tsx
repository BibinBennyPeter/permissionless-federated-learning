import { useState, useRef } from 'react';
import { Upload, FileUp } from 'lucide-react';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
}

export default function FileUpload({ onFileSelect }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragging(true);
    } else if (e.type === 'dragleave') {
      setIsDragging(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files[0]) {
      handleFile(files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = (file: File) => {
    if (file.name.endsWith('.npz')) {
      setSelectedFile(file);
      onFileSelect(file);
    } else {
      alert('Please upload a .npz file');
    }
  };

  return (
    <div
      className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
        isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-gray-50'
      }`}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".npz"
        onChange={handleFileInput}
        className="hidden"
      />
      <div className="flex flex-col items-center gap-3">
        <FileUp size={40} className="text-gray-400" />
        <div>
          <p className="text-gray-900 font-medium">
            {selectedFile ? selectedFile.name : 'Drag and drop your .npz delta file'}
          </p>
          <p className="text-sm text-gray-500 mt-1">or click to upload</p>
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="mt-2 px-6 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
        >
          Upload File
        </button>
      </div>
    </div>
  );
}
