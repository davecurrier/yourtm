#!/usr/bin/env swift
//
// Generates the YourTM app icon as a full .iconset.
//
// Design notes:
//  - macOS Big Sur+ icon grammar: superellipse ("squircle") body inset from the
//    canvas, with a soft contact shadow. Body is 824/1024 of the canvas.
//  - Brand gradient from the YourTM design system: purple #a855f7 -> pink #ec4899.
//  - Glyph is a hand-drawn tag with a lightning bolt cut out of it as negative
//    space: "tag manager" + "fast". Drawn, not SF Symbols — Apple's license
//    prohibits using SF Symbols in app icons.
//  - Everything is proportional to `size` so 16px and 1024px stay consistent.
//
import AppKit
import CoreGraphics
import Foundation

// MARK: - Geometry helpers

/// Superellipse approximating Apple's continuous-corner squircle.
func squirclePath(in rect: CGRect, n: CGFloat = 5.0, steps: Int = 720) -> CGPath {
    let path = CGMutablePath()
    let a = rect.width / 2, b = rect.height / 2
    let cx = rect.midX, cy = rect.midY
    for i in 0...steps {
        let t = (CGFloat(i) / CGFloat(steps)) * 2 * .pi
        let ct = cos(t), st = sin(t)
        // |x/a|^n + |y/b|^n = 1
        let x = cx + a * CGFloat(sign(ct)) * pow(abs(ct), 2.0 / n)
        let y = cy + b * CGFloat(sign(st)) * pow(abs(st), 2.0 / n)
        if i == 0 { path.move(to: CGPoint(x: x, y: y)) } else { path.addLine(to: CGPoint(x: x, y: y)) }
    }
    path.closeSubpath()
    return path
}

func sign(_ v: CGFloat) -> CGFloat { v < 0 ? -1 : 1 }

/// Rounded polygon: walks the corners applying a per-corner radius.
/// More predictable than chaining arcs by hand — every corner gets exactly the
/// radius asked for, and the tip can stay sharp while the body stays soft.
func roundedPolygon(_ pts: [CGPoint], radii: [CGFloat]) -> CGPath {
    let p = CGMutablePath()
    let n = pts.count
    // start at the midpoint of the last edge so the first arc has a run-up
    let start = CGPoint(x: (pts[n - 1].x + pts[0].x) / 2, y: (pts[n - 1].y + pts[0].y) / 2)
    p.move(to: start)
    for i in 0..<n {
        let corner = pts[i]
        let next = pts[(i + 1) % n]
        p.addArc(tangent1End: corner, tangent2End: next, radius: radii[i])
    }
    p.closeSubpath()
    return p
}

/// Classic tag silhouette: 45° point on the left, soft body on the right.
func tagPath(width w: CGFloat, height h: CGFloat, radius r: CGFloat) -> CGPath {
    let tipInset = h * 0.52                  // where the point meets the body
    return roundedPolygon([
        CGPoint(x: 0, y: h / 2),             // tip
        CGPoint(x: tipInset, y: h),          // top shoulder
        CGPoint(x: w, y: h),                 // top-right
        CGPoint(x: w, y: 0),                 // bottom-right
        CGPoint(x: tipInset, y: 0),          // bottom shoulder
    ], radii: [r * 0.42, r * 0.75, r, r, r * 0.75])
}

/// Lightning bolt, drawn in a unit box (0..1 x 0..1), scaled by caller.
func boltPath(in rect: CGRect) -> CGPath {
    // Normalized bolt vertices, y-up.
    let pts: [(CGFloat, CGFloat)] = [
        (0.62, 1.00), (0.10, 0.52), (0.40, 0.52),
        (0.34, 0.00), (0.90, 0.50), (0.58, 0.50),
    ]
    let p = CGMutablePath()
    for (i, pt) in pts.enumerated() {
        let x = rect.minX + pt.0 * rect.width
        let y = rect.minY + pt.1 * rect.height
        if i == 0 { p.move(to: CGPoint(x: x, y: y)) } else { p.addLine(to: CGPoint(x: x, y: y)) }
    }
    p.closeSubpath()
    return p
}

// MARK: - Renderer

func renderIcon(size: CGFloat) -> CGImage {
    let cs = CGColorSpaceCreateDeviceRGB()
    let ctx = CGContext(data: nil, width: Int(size), height: Int(size),
                        bitsPerComponent: 8, bytesPerRow: 0, space: cs,
                        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    ctx.setAllowsAntialiasing(true)
    ctx.interpolationQuality = .high

    let s = size / 1024.0                     // scale factor from the 1024 design grid
    let bodySide = 824.0 * s
    let body = CGRect(x: (size - bodySide) / 2, y: (size - bodySide) / 2,
                      width: bodySide, height: bodySide)
    let squircle = squirclePath(in: body)

    // ---- contact shadow under the squircle
    ctx.saveGState()
    ctx.setShadow(offset: CGSize(width: 0, height: -10 * s),
                  blur: 24 * s,
                  color: NSColor.black.withAlphaComponent(0.28).cgColor)
    ctx.addPath(squircle)
    ctx.setFillColor(NSColor.black.cgColor)
    ctx.fillPath()
    ctx.restoreGState()

    // ---- brand gradient body (purple -> pink, top-left to bottom-right)
    ctx.saveGState()
    ctx.addPath(squircle)
    ctx.clip()
    let grad = CGGradient(colorsSpace: cs, colors: [
        NSColor(srgbRed: 0.72, green: 0.36, blue: 0.98, alpha: 1).cgColor,  // #b85cfa
        NSColor(srgbRed: 0.66, green: 0.33, blue: 0.97, alpha: 1).cgColor,  // #a855f7
        NSColor(srgbRed: 0.93, green: 0.28, blue: 0.60, alpha: 1).cgColor,  // #ec4899
    ] as CFArray, locations: [0.0, 0.45, 1.0])!
    ctx.drawLinearGradient(grad,
                           start: CGPoint(x: body.minX, y: body.maxY),
                           end: CGPoint(x: body.maxX, y: body.minY),
                           options: [])

    // ---- top sheen: subtle light falloff so it doesn't read flat
    let sheen = CGGradient(colorsSpace: cs, colors: [
        NSColor.white.withAlphaComponent(0.22).cgColor,
        NSColor.white.withAlphaComponent(0.0).cgColor,
    ] as CFArray, locations: [0.0, 1.0])!
    ctx.drawLinearGradient(sheen,
                           start: CGPoint(x: body.midX, y: body.maxY),
                           end: CGPoint(x: body.midX, y: body.midY),
                           options: [])
    ctx.restoreGState()

    // ---- inner hairline for edge definition
    ctx.saveGState()
    ctx.addPath(squircle)
    ctx.setStrokeColor(NSColor.white.withAlphaComponent(0.30).cgColor)
    ctx.setLineWidth(2.5 * s)
    ctx.strokePath()
    ctx.restoreGState()

    // ---- tag glyph, rotated slightly for energy
    //
    // Size-adaptive detail: below 64px the bolt's strokes land on ~1px and turn
    // to mush, so small variants drop it and lean on the tag+grommet silhouette
    // (which stays legible at 16px). Same trick Apple uses across icon sizes.
    let showBolt = size >= 64
    let tagW = (showBolt ? 500.0 : 545.0) * s
    let tagH = (showBolt ? 362.0 : 395.0) * s
    let tagR = 56.0 * s

    ctx.saveGState()
    ctx.translateBy(x: size / 2, y: size / 2)
    ctx.rotate(by: -20 * .pi / 180)
    ctx.translateBy(x: -tagW / 2 - 18 * s, y: -tagH / 2)

    // One compound path: tag outline + hole + bolt, filled even-odd so the
    // inner subpaths punch through. (Blend-mode erasing is fragile here —
    // even-odd is deterministic and keeps the shadow correct.)
    let glyph = CGMutablePath()
    glyph.addPath(tagPath(width: tagW, height: tagH, radius: tagR))

    // grommet hole, sitting in the triangular point
    let holeR = (showBolt ? 0.098 : 0.115) * tagH
    glyph.addPath(CGPath(ellipseIn: CGRect(x: tagH * 0.30 - holeR,
                                           y: tagH / 2 - holeR,
                                           width: holeR * 2, height: holeR * 2),
                         transform: nil))

    // bolt knocked out of the body — the "fast" half of the identity
    if showBolt {
        glyph.addPath(boltPath(in: CGRect(x: tagW * 0.44, y: tagH * 0.13,
                                          width: tagW * 0.40, height: tagH * 0.74)))
    }

    ctx.saveGState()
    ctx.setShadow(offset: CGSize(width: 0, height: -6 * s), blur: 18 * s,
                  color: NSColor.black.withAlphaComponent(0.22).cgColor)
    ctx.addPath(glyph)
    ctx.setFillColor(NSColor.white.cgColor)
    ctx.fillPath(using: .evenOdd)
    ctx.restoreGState()

    ctx.restoreGState()

    return ctx.makeImage()!
}

// MARK: - Write the iconset

let outDir = CommandLine.arguments.count > 1
    ? CommandLine.arguments[1]
    : FileManager.default.currentDirectoryPath + "/YourTM.iconset"

try? FileManager.default.createDirectory(atPath: outDir, withIntermediateDirectories: true)

let variants: [(name: String, px: CGFloat)] = [
    ("icon_16x16", 16), ("icon_16x16@2x", 32),
    ("icon_32x32", 32), ("icon_32x32@2x", 64),
    ("icon_128x128", 128), ("icon_128x128@2x", 256),
    ("icon_256x256", 256), ("icon_256x256@2x", 512),
    ("icon_512x512", 512), ("icon_512x512@2x", 1024),
]

for v in variants {
    let img = renderIcon(size: v.px)
    let url = URL(fileURLWithPath: "\(outDir)/\(v.name).png")
    guard let dest = CGImageDestinationCreateWithURL(url as CFURL, "public.png" as CFString, 1, nil) else {
        fatalError("Could not create \(url.path)")
    }
    CGImageDestinationAddImage(dest, img, nil)
    CGImageDestinationFinalize(dest)
    print("  \(v.name).png  (\(Int(v.px))px)")
}
print("iconset written to \(outDir)")
