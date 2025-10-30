'use client'

import { useState } from 'react'
import Image from 'next/image'
import { FaTimes, FaEye, FaTrash } from 'react-icons/fa'

interface ImageThumbnailGridProps {
  images: string[]
  onRemove: (index: number) => void
  onReorder?: (fromIndex: number, toIndex: number) => void
  onSetCover?: (index: number) => void
  maxImages?: number
  className?: string
}

export default function ImageThumbnailGrid({ 
  images, 
  onRemove, 
  onReorder,
  onSetCover,
  maxImages = 10,
  className = '' 
}: ImageThumbnailGridProps) {
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault()
    
    if (draggedIndex !== null && draggedIndex !== dropIndex && onReorder) {
      onReorder(draggedIndex, dropIndex)
    }
    
    setDraggedIndex(null)
  }

  const handleDragEnd = () => {
    setDraggedIndex(null)
  }

  if (images.length === 0) {
    return (
      <div className={`text-center py-8 text-gray-500 ${className}`}>
        <div className="text-4xl mb-2">📷</div>
        <p>No images uploaded yet</p>
        <p className="text-sm">Upload images to see them here</p>
      </div>
    )
  }

  return (
    <>
      <div className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 ${className}`}>
        {images.map((imageUrl, index) => (
          <div
            key={`${imageUrl}-${index}`}
            draggable={!!onReorder}
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, index)}
            onDragEnd={handleDragEnd}
            className={`relative group bg-gray-100 rounded-lg overflow-hidden aspect-square cursor-pointer transition-all ${
              draggedIndex === index ? 'opacity-50 scale-95' : 'hover:scale-105'
            }`}
          >
            <Image
              src={imageUrl}
              alt={`Upload ${index + 1}`}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 20vw"
            />
            
            {/* Overlay with actions */}
            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-all duration-200 flex items-center justify-center">
              <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex space-x-2">
                <button
                  onClick={() => setPreviewImage(imageUrl)}
                  className="p-2 bg-white bg-opacity-90 rounded-full hover:bg-opacity-100 transition-colors"
                  title="Preview image"
                >
                  <FaEye className="h-4 w-4 text-gray-700" />
                </button>
                {onSetCover && (
                  <button
                    onClick={() => onSetCover(index)}
                    className="p-2 bg-amber-500 bg-opacity-90 rounded-full hover:bg-opacity-100 transition-colors"
                    title="Set as cover"
                  >
                    {/* Star glyph */}
                    <svg className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .587l3.668 7.431 8.2 1.193-5.934 5.787 1.401 8.168L12 18.897l-7.335 3.869 1.401-8.168L.132 9.211l8.2-1.193z"/></svg>
                  </button>
                )}
                <button
                  onClick={() => onRemove(index)}
                  className="p-2 bg-red-500 bg-opacity-90 rounded-full hover:bg-opacity-100 transition-colors"
                  title="Remove image"
                >
                  <FaTrash className="h-4 w-4 text-white" />
                </button>
              </div>
            </div>

            {/* Image number badge */}
            <div className="absolute top-2 left-2 bg-black bg-opacity-70 text-white text-xs px-2 py-1 rounded">
              {index + 1}
            </div>

            {/* Primary image indicator */}
            {index === 0 && (
              <div className="absolute top-2 right-2 bg-blue-500 text-white text-xs px-2 py-1 rounded">
                Cover
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Image limit indicator */}
      {images.length >= maxImages && (
        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-yellow-800 text-sm">
            <strong>Maximum reached:</strong> You've uploaded {maxImages} images. 
            Remove some images to upload more.
          </p>
        </div>
      )}

      {/* Preview Modal */}
      {previewImage && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] p-4">
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute top-4 right-4 text-white hover:text-gray-300 transition-colors z-10"
            >
              <FaTimes className="h-6 w-6" />
            </button>
            <Image
              src={previewImage}
              alt="Preview"
              width={800}
              height={600}
              className="max-w-full max-h-full object-contain rounded-lg"
            />
          </div>
        </div>
      )}
    </>
  )
}
