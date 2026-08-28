import SwiftUI
import CoreImage

/*
 The token layer, ported from src/styles/tokens.css.

 Same rule as the website: nothing below is invented here, and no view
 invents a colour, a size, a tracking or a duration that is not in this
 file. If the two ever disagree, the stylesheet is the one telling the
 truth.

 Day and night are the same tokens with different values. The website
 resolves them from local time and remembers the choice; a phone already
 has that decision made for it system-wide, so these follow the system
 appearance instead. Same intent, expressed the way a phone expresses it.
 */

// MARK: - Ground and ink

enum Tone {
    static let ground        = Color(day: 0xe3dfd3, night: 0x14140f)
    static let groundDeep    = Color(day: 0xd7d2c3, night: 0x0c0c09)
    static let groundRaised  = Color(day: 0xedeae1, night: 0x1c1c15)
    static let groundVitrine = Color(day: 0xeeebe3, night: 0x1f1f18)

    /* The ink ladder has a floor. `faint` carries real text — accession
       numbers, column headings, standing labels — so it holds 4.5:1
       against the ground. `ghost` is for marks rather than words. */
    static let ink      = Color(day: 0x1a1915, night: 0xe4e0d4)
    static let inkMuted = Color(day: 0x57544a, night: 0x948f80)
    static let inkFaint = Color(day: 0x666359, night: 0x807d77)
    static let inkGhost = Color(day: 0x837f74, night: 0x64625c)

    static let rule       = Color(day: 0x1a1915, dayAlpha: 0.16,  night: 0xe4e0d4, nightAlpha: 0.17)
    static let ruleFaint  = Color(day: 0x1a1915, dayAlpha: 0.075, night: 0xe4e0d4, nightAlpha: 0.08)
    static let ruleStrong = Color(day: 0x1a1915, dayAlpha: 0.34,  night: 0xe4e0d4, nightAlpha: 0.34)

    static let wash = Color(day: 0x1a1915, dayAlpha: 0.035, night: 0xe4e0d4, nightAlpha: 0.04)

    /* Iron oxide. Accession stamps, significance marks, the active tab.
       Never decorative — its scarcity is what gives it authority. */
    static let oxide     = Color(day: 0x8e3b24, night: 0xc05f3f)
    static let oxideSoft = Color(day: 0x8e3b24, dayAlpha: 0.14, night: 0xc05f3f, nightAlpha: 0.16)

    /// The environmental tint a department carries. Never a fill at full strength.
    /* The department palette that was here is gone with the departments.
       Nothing replaces it: a day's environment comes from the photograph
       itself — the website tints the ground from the image's own lightness
       — rather than from a category the product no longer has. */
}

// MARK: - Type

/*
 Three families with three jobs, exactly as the website has them:
 editorial carries the voice, grotesk does signage, mono does
 measurement. Nothing is set in a family whose job it is not.

 The website's cuts are Newsreader, Archivo and IBM Plex Mono. None ships
 with iOS and none is bundled here yet, so each falls back to the stack
 the stylesheet already names for it. The jobs are unchanged; only the
 cuts differ, and bundling the real three later changes this file alone.
 */
enum Face {
    static func editorial(_ size: CGFloat, italic: Bool = false) -> Font {
        Font.custom(italic ? "IowanOldStyle-Italic" : "IowanOldStyle-Roman", size: size)
    }

    static func grotesk(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight)
    }

    static func mono(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight, design: .monospaced)
    }
}

/// The type scale. Fluid on the web; a phone is one width, so these are
/// the lower anchor of each clamp, which is the end that was designed for it.
enum Size {
    static let micro: CGFloat = 11    // accession numbers, standing labels
    static let fine: CGFloat = 12     // metadata
    static let small: CGFloat = 13    // captions
    static let body: CGFloat = 16
    static let lede: CGFloat = 19
    static let title: CGFloat = 27
    static let display: CGFloat = 40
}

/// Tracking, as a fraction of the size — small type open, display tight.
/// This one relationship does more for the institutional feel than any ornament.
enum Track {
    static let signage: CGFloat = 0.22
    static let label: CGFloat = 0.12
    static let accession: CGFloat = 0.04
    static let title: CGFloat = -0.012
    static let display: CGFloat = -0.028
}

// MARK: - Space

/// A 4pt base, named by intent so views read as compositions.
enum Space {
    static let hair: CGFloat = 1
    static let s1: CGFloat = 4
    static let s2: CGFloat = 8
    static let s3: CGFloat = 12
    static let s4: CGFloat = 16
    static let s5: CGFloat = 24
    static let s6: CGFloat = 32
    static let s7: CGFloat = 48
    static let s8: CGFloat = 64

    /// The page frame. The institution keeps generous margins; on a phone
    /// they tighten, but they never collapse.
    static let margin: CGFloat = 20
    static let rail: CGFloat = 44
}

// MARK: - Motion

enum Tempo {
    static let instant: Double = 0.12
    static let quick: Double = 0.24
    static let base: Double = 0.42

    /// Reveals and settling.
    static let out = Animation.timingCurve(0.16, 1, 0.3, 1, duration: base)
    /// State changes within a page.
    static let inOut = Animation.timingCurve(0.76, 0, 0.24, 1, duration: quick)
}

// MARK: - Paper

/**
 The ground, with its stock.

 A single static tone across the whole surface — not film grain, not an
 effect, and never animated. Generated once and then forgotten about,
 which is also how the website treats it.
 */
struct Paper: View {
    var body: some View {
        Tone.ground
            .overlay {
                if let grain = Grain.image {
                    grain
                        .resizable(resizingMode: .tile)
                        .opacity(0.05)
                        .blendMode(.multiply)
                        .allowsHitTesting(false)
                }
            }
            .ignoresSafeArea()
    }
}

private enum Grain {
    /// One 220pt tile of monochrome noise, matching the stylesheet's
    /// turbulence patch. Built on first use and kept.
    static let image: Image? = {
        let context = CIContext(options: [.useSoftwareRenderer: false])
        guard let noise = CIFilter(name: "CIRandomGenerator")?.outputImage else { return nil }

        let tile = noise.cropped(to: CGRect(x: 0, y: 0, width: 220, height: 220))
        guard let mono = CIFilter(
            name: "CIPhotoEffectMono",
            parameters: [kCIInputImageKey: tile]
        )?.outputImage else { return nil }

        guard let cg = context.createCGImage(mono, from: mono.extent) else { return nil }
        return Image(decorative: cg, scale: 1)
    }()
}

// MARK: - Colour plumbing

private extension Color {
    /// A colour that resolves itself against the system appearance, so a
    /// view never has to ask which one it is in.
    init(day: UInt32, dayAlpha: Double = 1, night: UInt32, nightAlpha: Double = 1) {
        self.init(uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(rgb: night, alpha: nightAlpha)
                : UIColor(rgb: day, alpha: dayAlpha)
        })
    }
}

private extension UIColor {
    convenience init(rgb: UInt32, alpha: Double) {
        self.init(
            red: Double((rgb >> 16) & 0xff) / 255,
            green: Double((rgb >> 8) & 0xff) / 255,
            blue: Double(rgb & 0xff) / 255,
            alpha: alpha
        )
    }
}
