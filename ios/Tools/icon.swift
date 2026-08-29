import Foundation
import AppKit

/*
 The icon.

 The product's one idea, drawn: a photograph lighting the room it is in. A
 dark warm ground, a single pale plate, and the ground glowing faintly where
 the plate touches it. That is literally what the app does — a picture is
 measured and the interface takes its light from it — so the icon is the
 behaviour rather than a symbol standing in for it.

 No rounded corners on the plate, because nothing in this product has them.
 No letterform, because the name is a codename and will not survive. No
 camera, no aperture, no shutter: the subject is the photograph, not the
 apparatus.

 Full bleed and square. iOS applies its own mask.
 */

let size = 1024.0
let ground = NSColor(srgbRed: 0x14/255.0, green: 0x14/255.0, blue: 0x0f/255.0, alpha: 1)
let paper  = NSColor(srgbRed: 0xe3/255.0, green: 0xdf/255.0, blue: 0xd3/255.0, alpha: 1)
let warm   = NSColor(srgbRed: 0xc0/255.0, green: 0x9f/255.0, blue: 0x6f/255.0, alpha: 1)

/* An explicit 1x bitmap rather than `NSImage.lockFocus`, which renders at
   the main display's scale — on a Retina Mac that silently produces a
   2048-pixel file, and Xcode rejects an app icon whose pixels do not match
   the 1024 the catalog declares. The error it gives ("did not have any
   applicable content") does not mention size at all. */
let rep = NSBitmapImageRep(
    bitmapDataPlanes: nil,
    pixelsWide: Int(size),
    pixelsHigh: Int(size),
    bitsPerSample: 8,
    samplesPerPixel: 4,
    hasAlpha: true,
    isPlanar: false,
    colorSpaceName: .deviceRGB,
    bytesPerRow: 0,
    bitsPerPixel: 0
)!

NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
let ctx = NSGraphicsContext.current!.cgContext

ground.setFill()
ctx.fill(CGRect(x: 0, y: 0, width: size, height: size))

/* The plate. Portrait, because a photograph taken on a phone usually is,
   and off-centre upward by a hair so the mass sits where the eye expects
   rather than exactly halfway, which always reads as slightly low. */
let plateW = size * 0.58
let plateH = plateW * 1.32
let plate = CGRect(
    x: (size - plateW) / 2,
    y: (size - plateH) / 2 + size * 0.018,
    width: plateW,
    height: plateH
)

/* The room, lit. A soft warm bloom behind the plate, strongest at its edge
   and gone well before the corners — the light a bright picture throws onto
   the wall around it. */
ctx.saveGState()
let bloom = CGGradient(
    colorsSpace: CGColorSpaceCreateDeviceRGB(),
    colors: [
        warm.withAlphaComponent(0.42).cgColor,
        warm.withAlphaComponent(0.14).cgColor,
        warm.withAlphaComponent(0.0).cgColor,
    ] as CFArray,
    locations: [0, 0.45, 1]
)!
ctx.drawRadialGradient(
    bloom,
    startCenter: CGPoint(x: plate.midX, y: plate.midY),
    startRadius: plateW * 0.42,
    endCenter: CGPoint(x: plate.midX, y: plate.midY),
    endRadius: size * 0.60,
    options: []
)
ctx.restoreGState()

/* The photograph itself.

   A flat pale rectangle is a card, not a picture — at sixty pixels it is a
   white blob among other white blobs, which is precisely the problem this
   icon exists to solve. So it carries a horizon: sky above, ground below,
   the line a little under two thirds down.

   A horizon is the most legible mark there is for "this is a photograph".
   It survives being shrunk to a home-screen size, it needs no camera or
   aperture to explain itself, and it says landscape without depicting any
   particular one. */
ctx.saveGState()
ctx.clip(to: plate)

let horizon = plate.minY + plate.height * 0.36

let sky = CGGradient(
    colorsSpace: CGColorSpaceCreateDeviceRGB(),
    colors: [
        paper.blended(withFraction: 0.16, of: .white)!.cgColor,
        paper.blended(withFraction: 0.10, of: warm)!.cgColor,
    ] as CFArray,
    locations: [0, 1]
)!
ctx.saveGState()
ctx.clip(to: CGRect(x: plate.minX, y: horizon, width: plate.width, height: plate.maxY - horizon))
ctx.drawLinearGradient(
    sky,
    start: CGPoint(x: plate.midX, y: plate.maxY),
    end: CGPoint(x: plate.midX, y: horizon),
    options: []
)
ctx.restoreGState()

/* The ground: the archive's own ink, lightened enough to stay a photograph
   rather than becoming a hole cut in the plate. */
let land = CGGradient(
    colorsSpace: CGColorSpaceCreateDeviceRGB(),
    colors: [
        NSColor(srgbRed: 0x6b/255.0, green: 0x66/255.0, blue: 0x55/255.0, alpha: 1).cgColor,
        NSColor(srgbRed: 0x3a/255.0, green: 0x37/255.0, blue: 0x2c/255.0, alpha: 1).cgColor,
    ] as CFArray,
    locations: [0, 1]
)!
ctx.saveGState()
ctx.clip(to: CGRect(x: plate.minX, y: plate.minY, width: plate.width, height: horizon - plate.minY))
ctx.drawLinearGradient(
    land,
    start: CGPoint(x: plate.midX, y: horizon),
    end: CGPoint(x: plate.midX, y: plate.minY),
    options: []
)
ctx.restoreGState()

ctx.restoreGState()

NSGraphicsContext.restoreGraphicsState()

guard let png = rep.representation(using: .png, properties: [:]) else { exit(1) }
try! png.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
print("  drew \(rep.pixelsWide)×\(rep.pixelsHigh)")
