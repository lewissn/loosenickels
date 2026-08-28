import SwiftUI

/*
 The room, lit by the photograph.

 The website's environmental idea, on a phone: a photograph does not sit on
 an interface, the interface takes its light from the photograph. A dark
 picture darkens the ground around it and turns the writing pale; a bright
 one does the opposite. The measurements come from the pipeline — Rec. 709
 luma and one restrained colour — so both clients agree about what a given
 photograph does, rather than each guessing.

 The tone is pulled well toward neutral before it ever reaches here. A ground
 carrying a photograph's full average colour reads as a coloured wash behind
 it and competes with it; carrying a third of it reads as the light in the
 room, which is the whole point.
 */

/* Named `Room`, not `Environment`, which is what it was called for about
   four minutes: SwiftUI has an `@Environment` property wrapper, and a type of
   that name shadows it across the whole module — every `@Environment(\.dismiss)`
   in the app stopped compiling at once. `Room` is the better name anyway,
   being the word the design already uses. */
struct Room: Equatable {
    var ground: Color
    var ink: Color
    var inkMuted: Color
    var inkFaint: Color
    /// True when the photograph is dark enough that the writing goes pale.
    var isNight: Bool

    /// The archive's own colours, for a day with no photograph to take them
    /// from — an empty archive, or one still being resized.
    static let unlit = Room(
        ground: Tone.ground,
        ink: Tone.ink,
        inkMuted: Tone.inkMuted,
        inkFaint: Tone.inkFaint,
        isNight: false
    )

    /**
     What a photograph makes of the room.

     The threshold is 0.42 rather than 0.5 because the eye is not linear and
     a picture has to be quite dark before pale writing beats dark writing
     over it. Set at the midpoint, photographs that are merely moody flip the
     whole interface, which reads as a fault rather than as an atmosphere.
     */
    static func lit(by photo: ResolvedPhoto) -> Room {
        guard let lightness = photo.lightness else { return .unlit }

        let base = photo.tone.flatMap(Color.init(hex:)) ?? Tone.ground
        let night = lightness < 0.42

        /* The ground is the photograph's tone, taken most of the way toward
           the archive's own — the interface stays recognisably itself, in a
           light the picture has cast. */
        let ground = base.mixed(with: night ? Tone.groundDeep : Tone.ground, amount: 0.72)

        return Room(
            ground: ground,
            ink: night ? Tone.inkNight : Tone.ink,
            inkMuted: night ? Tone.inkMutedNight : Tone.inkMuted,
            inkFaint: night ? Tone.inkFaintNight : Tone.inkFaint,
            isNight: night
        )
    }
}

extension Color {
    /// `#rrggbb`, as the pipeline writes it.
    init?(hex: String) {
        var value = hex
        if value.hasPrefix("#") { value.removeFirst() }
        guard value.count == 6, let n = UInt32(value, radix: 16) else { return nil }
        self.init(
            .sRGB,
            red: Double((n >> 16) & 0xff) / 255,
            green: Double((n >> 8) & 0xff) / 255,
            blue: Double(n & 0xff) / 255
        )
    }

    /// Interpolated in sRGB. Good enough for a wash and cheap; a perceptual
    /// space would be more correct and is not worth the arithmetic for a
    /// colour nobody looks at directly.
    func mixed(with other: Color, amount: Double) -> Color {
        let a = UIColor(self)
        let b = UIColor(other)
        var (r1, g1, b1, a1): (CGFloat, CGFloat, CGFloat, CGFloat) = (0, 0, 0, 0)
        var (r2, g2, b2, a2): (CGFloat, CGFloat, CGFloat, CGFloat) = (0, 0, 0, 0)
        a.getRed(&r1, green: &g1, blue: &b1, alpha: &a1)
        b.getRed(&r2, green: &g2, blue: &b2, alpha: &a2)

        let t = max(0, min(1, amount))
        return Color(
            .sRGB,
            red: Double(r1 + (r2 - r1) * t),
            green: Double(g1 + (g2 - g1) * t),
            blue: Double(b1 + (b2 - b1) * t)
        )
    }
}
