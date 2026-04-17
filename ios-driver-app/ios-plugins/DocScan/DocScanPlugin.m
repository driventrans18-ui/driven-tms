#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

// Registers DocScanPlugin with Capacitor so it's callable from JS
// as registerPlugin<DocScanPlugin>('DocScan').
CAP_PLUGIN(DocScanPlugin, "DocScan",
    CAP_PLUGIN_METHOD(scan, CAPPluginReturnPromise);
)
