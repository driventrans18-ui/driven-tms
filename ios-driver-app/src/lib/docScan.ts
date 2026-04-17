import { registerPlugin, Capacitor } from '@capacitor/core'

interface DocScanPlugin {
  scan(): Promise<{ images: string[] }>
}

// Registers the native iOS VNDocumentCameraViewController plugin.
// The underlying Swift/ObjC sources live in ios-driver-app/ios-plugins/DocScan/
// and must be added to the Xcode project (see ios-driver-app/README.md).
const DocScan = registerPlugin<DocScanPlugin>('DocScan')

export function isDocScanAvailable(): boolean {
  return Capacitor.getPlatform() === 'ios'
}

export async function scanDocument(): Promise<string[]> {
  const { images } = await DocScan.scan()
  return images
}
