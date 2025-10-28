// Global type definitions for Cloudinary
export interface CloudinaryWidget {
  open: () => void
  close: () => void
  destroy: () => void
}

declare global {
  interface Window {
    cloudinary?: {
      createUploadWidget: (config: any, callback: (error: any, result: any) => void) => CloudinaryWidget
    }
  }
}
