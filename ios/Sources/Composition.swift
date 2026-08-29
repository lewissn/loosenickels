import SwiftUI

/*
 How a photograph is presented, decided from the photograph.

 The brief's central principle is that the picture should not sit inside an
 interface but become one. In practice that is a small number of decisions,
 all of them made here so that no view invents its own answer:

   how much of the screen the picture takes
   whether the writing lies over it or beside it
   which end of it the writing goes
   what colour that writing is

 Four modes rather than a continuum, because a photograph's shape is not a
 gradient in practice — it is portrait, landscape, roughly square, or a
 panorama, and each wants a different composition rather than the same one
 stretched. §6 of the brief is explicit that a landscape photograph must look
 deliberately composed rather than like an image that failed to fit.
 */

struct Composition {
    enum Shape {
        /// Taller than 4:5. Fills the screen; the writing lies over it.
        case portrait
        /// Wider than 5:4. A band across the middle; the writing sits beside.
        case landscape
        /// Between the two. Large, off-centre, writing below.
        case square
        /// Wider than 2:1. A cinematic strip in deliberate emptiness.
        case panorama
    }

    /// Where the writing goes, and how it relates to the picture.
    enum Placement {
        /// Over the photograph, at the bottom. The default for portrait.
        case overlaidLow
        /// Over the photograph, at the top — chosen when the lower half is
        /// busy and the upper half is not.
        case overlaidHigh
        /// Beneath the photograph, on the ground. Landscape and square.
        case below
        /// Above the photograph. Panoramas, where the strip sits low.
        case above
    }

    var shape: Shape
    var placement: Placement
    /// Fraction of the screen's height the photograph occupies. Portraits
    /// take all of it.
    var heightFraction: Double
    /// True when the writing is over the picture and needs its own contrast.
    var isOverlaid: Bool { placement == .overlaidLow || placement == .overlaidHigh }

    /**
     Decide, from the shape of the photograph and the map of its contents.

     `regions` is absent for anything resized before that existed, so every
     branch below has to work without it — which it does by falling back to
     the placement the shape alone suggests.
     */
    static func of(_ photo: ResolvedPhoto) -> Composition {
        let aspect = photo.aspect

        if aspect >= 2.0 {
            /* A panorama's shape is the point. Given a slab of empty screen
               above it, an unusual ratio reads as deliberate; stretched to
               fill, it reads as a mistake. */
            return Composition(shape: .panorama, placement: .above, heightFraction: 0.34)
        }

        if aspect > 1.25 {
            return Composition(shape: .landscape, placement: .below, heightFraction: 0.52)
        }

        if aspect > 0.8 {
            return Composition(shape: .square, placement: .below, heightFraction: 0.58)
        }

        /* Portrait. The one shape that can fill a phone without being
           cropped into a different photograph, so it does — and the writing
           goes wherever the picture is quietest. */
        return Composition(
            shape: .portrait,
            placement: quietEnd(of: photo),
            heightFraction: 1.0
        )
    }

    /**
     Which end of a portrait photograph will hold text.

     Bottom by default, because that is where a photograph usually puts its
     ground and where a reader expects a caption. Top only when the bottom is
     meaningfully busier — a low threshold would flip the layout between
     adjacent days for no visible reason, which reads as instability rather
     than as art direction.
     */
    private static func quietEnd(of photo: ResolvedPhoto) -> Placement {
        guard let regions = photo.regions, regions.count == 24 else {
            return .overlaidLow
        }

        /* Rows 0–1 and 4–5 of six: the top third and the bottom third. The
           middle is where the subject usually is and is never offered. */
        let top = regions.prefix(8)
        let bottom = regions.suffix(8)

        let busyness = { (cells: ArraySlice<Region>) in
            cells.reduce(0.0) { $0 + $1.v } / Double(cells.count)
        }

        return busyness(bottom) > busyness(top) + 0.12 ? .overlaidHigh : .overlaidLow
    }
}

extension ResolvedPhoto {
    /**
     How bright the part of the photograph the writing will sit on is.

     Averaged over the third the writing occupies rather than over the whole
     picture: a photograph can be dark overall and have a bright sky exactly
     where the date goes, and taking the whole-image lightness would put pale
     text on it.
     */
    func lightnessBehind(_ placement: Composition.Placement) -> Double {
        guard let regions, regions.count == 24 else { return lightness ?? 0.5 }

        let cells: ArraySlice<Region>
        switch placement {
        case .overlaidHigh, .above: cells = regions.prefix(8)
        case .overlaidLow, .below: cells = regions.suffix(8)
        }

        return cells.reduce(0.0) { $0 + $1.l } / Double(cells.count)
    }
}
