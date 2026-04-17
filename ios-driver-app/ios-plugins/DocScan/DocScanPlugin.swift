import Foundation
import Capacitor
import VisionKit
import UIKit

// Small local Capacitor plugin that wraps iOS 13+ VNDocumentCameraViewController.
// Gives the same "scan with auto edge detection" experience as the Notes app.
// Returns each scanned page as a base64-encoded JPEG.

@objc(DocScanPlugin)
public class DocScanPlugin: CAPPlugin, VNDocumentCameraViewControllerDelegate {
    private var pendingCall: CAPPluginCall?

    @objc func scan(_ call: CAPPluginCall) {
        guard VNDocumentCameraViewController.isSupported else {
            call.reject("Document scanning not supported on this device")
            return
        }
        self.pendingCall = call
        DispatchQueue.main.async {
            let controller = VNDocumentCameraViewController()
            controller.delegate = self
            controller.modalPresentationStyle = .fullScreen
            self.bridge?.viewController?.present(controller, animated: true)
        }
    }

    public func documentCameraViewController(_ controller: VNDocumentCameraViewController,
                                              didFinishWith scan: VNDocumentCameraScan) {
        var images: [String] = []
        for i in 0..<scan.pageCount {
            let page = scan.imageOfPage(at: i)
            if let data = page.jpegData(compressionQuality: 0.8) {
                images.append(data.base64EncodedString())
            }
        }
        let call = self.pendingCall
        self.pendingCall = nil
        controller.dismiss(animated: true) {
            call?.resolve(["images": images])
        }
    }

    public func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) {
        let call = self.pendingCall
        self.pendingCall = nil
        controller.dismiss(animated: true) {
            call?.reject("User cancelled")
        }
    }

    public func documentCameraViewController(_ controller: VNDocumentCameraViewController,
                                              didFailWithError error: Error) {
        let call = self.pendingCall
        self.pendingCall = nil
        controller.dismiss(animated: true) {
            call?.reject(error.localizedDescription)
        }
    }
}
