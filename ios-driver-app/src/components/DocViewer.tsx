// Full-screen in-app viewer for load documents. Renders images directly
// and PDFs in an iframe (iOS WebView supports inline PDFs). Avoids the
// context switch of opening Safari.

export function DocViewer({ url, mimeType, fileName, onClose }: {
  url: string
  mimeType: string | null
  fileName: string
  onClose: () => void
}) {
  const isPdf = (mimeType ?? '').includes('pdf') || fileName.toLowerCase().endsWith('.pdf')

  return (
    <div className="fixed inset-0 z-[70] bg-black flex flex-col"
      style={{ paddingTop: 'env(safe-area-inset-top, 0)' }}>
      <header className="flex items-center justify-between px-4 py-3 text-white">
        <span className="text-sm font-medium truncate max-w-[70%]">{fileName}</span>
        <button onClick={onClose} className="text-base font-semibold cursor-pointer">Done</button>
      </header>
      <div className="flex-1 bg-black overflow-hidden">
        {isPdf ? (
          <iframe src={url} className="w-full h-full bg-white" title={fileName} />
        ) : (
          <div className="w-full h-full flex items-center justify-center overflow-auto">
            <img src={url} alt={fileName} className="max-w-full max-h-full object-contain" />
          </div>
        )}
      </div>
    </div>
  )
}
