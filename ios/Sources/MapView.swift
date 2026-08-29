import SwiftUI
import MapKit

/*
 Where the days happened.

 §4. The brief's requirement is that this must not read as a map SDK dropped
 into the product, and the temptation it names — giant pins, coloured cluster
 badges, a stack of controls in the corner — is not decoration that can be
 removed afterwards. It is what a map framework gives you if you accept its
 defaults, and every one of those defaults exists to serve navigation. This
 map is not for finding anywhere. Nobody opens it to get somewhere; they open
 it to see where a life has been.

 So three departures, in order of how much they matter.

 The points are photographs. Not a marker that stands for a photograph — the
 photograph itself, small and square and ringed, sitting on the spot. At the
 sizes involved a thumbnail is a smudge of colour, and a smudge of the right
 colour in the right place is more informative than any symbol: a coastline
 of blue-grey days reads as a coastline.

 Clusters are photographs too. The default is a circle with a number in it,
 which tells you how many things you cannot see. This one shows the most
 recent photograph of the group with the others stacked fractionally behind
 it, and the count set beside it in the archive's own type. What you get is
 still one picture per place, which is what a map of a life should look like
 from a distance.

 And the map itself recedes. MapKit's ordinary palette is built for contrast
 between road classes; against the paper ground it is a bright rectangle with
 none of the product's colours in it. Muted leaves the geography and takes the
 insistence out of it, which makes the photographs the only saturated thing on
 the screen — the whole hierarchy this page needs, and nothing drawn to get
 it.
 */

struct MapView: View {
    let days: [PlacedDay]
    let room: Room
    let onOpen: (CalendarDate) -> Void
    let onClose: () -> Void

    @State private var camera: MapCameraPosition = .automatic
    @State private var span: MKCoordinateSpan?
    @State private var chosen: Cluster?

    var body: some View {
        ZStack(alignment: .top) {
            map
            heading

            if let chosen {
                surfaced(chosen)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .frame(maxHeight: .infinity, alignment: .bottom)
            }
        }
        .background(room.ground)
        .animation(Tempo.out, value: chosen)
        .onAppear {
            guard let frame = Self.enclosing(days) else { return }
            camera = .region(frame)

            #if DEBUG
            /* The harness cannot tap. Everything on this screen that only
               appears once something has been selected would otherwise be
               unreachable from a screenshot, which is the same blind spot
               that hid the launch crash and the illegible rail. */
            if CommandLine.arguments.contains("-chosen") {
                chosen = clusters.first
            }
            #endif
        }
    }

    // MARK: The map

    private var map: some View {
        Map(position: $camera, interactionModes: [.pan, .zoom]) {
            ForEach(clusters) { cluster in
                Annotation("", coordinate: cluster.centre, anchor: .center) {
                    Point(cluster: cluster, room: room, chosen: chosen == cluster)
                        .onTapGesture {
                            chosen = chosen == cluster ? nil : cluster
                        }
                }
                /* The label is empty and hidden rather than styled. A place
                   name from MapKit is set in the system face and appears
                   under every point at once; the names on this screen belong
                   to the selected day and are set in the archive's type. */
                .annotationTitles(.hidden)
            }
        }
        /* Muted is MapKit's own answer to this and it is the right one. The
           first attempt drained the map with a saturation filter and then
           tried to give the photographs their colour back by inverting the
           filter on each point — which works only because annotations are
           children of the map, is off by however much the two roundings
           disagree, and washes the pictures the moment anything is layered
           over the whole view. Muted asks the renderer for the same thing
           before the tiles are drawn: roads and labels recede, coast and
           green and the shape of a city stay, and the photographs are then
           the only saturated colour on the screen without anything being
           done to them at all.

           Flat because terrain shading is depth this screen has no use for,
           and no points of interest because a restaurant's name is not part
           of this record. No compass, no scale, no locate button: on a map
           nobody is navigating with, the honest number of controls is none. */
        .mapStyle(
            .standard(
                elevation: .flat,
                emphasis: .muted,
                pointsOfInterest: .excludingAll
            )
        )
        .mapControlVisibility(.hidden)
        .onMapCameraChange(frequency: .continuous) { context in
            span = context.region.span
        }
        /* Muted alone was not enough — it leaves the sea at full blue and the
           country names in magenta, which is most of what makes a map look
           like somebody else's software. So the whole thing is drained a
           further step and washed toward paper.

           That filter falls on the photographs too, because annotations are
           children of the map and there is no layer between the tiles and
           them. The first version tried to invert it exactly on each point;
           it very nearly works and fails on precisely the photographs worth
           having, since a saturation above one clamps and a vivid picture
           comes back with its brightest colour shifted. A partial lift is
           the honest trade: the geography lands near a third of its colour,
           the photographs near four fifths of theirs, nothing clips, and the
           pictures are still the only real colour on the screen. */
        .saturation(0.42)
        .overlay(room.ground.opacity(0.13).allowsHitTesting(false))
    }

    // MARK: What is showing

    private var heading: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: Space.s1) {
                Text("Map")
                    .font(.system(size: 34, design: .serif))
                    .foregroundStyle(room.ink)

                Signage(
                    text: days.count == 1 ? "1 day placed" : "\(days.count) days placed",
                    tone: room.inkFaint
                )
            }

            Spacer()

            Button(action: onClose) {
                Signage(text: "Close", tone: room.inkFaint)
            }
        }
        .padding(.horizontal, Space.margin)
        .padding(.top, Space.s5)
        .padding(.bottom, Space.s4)
        /* The heading sits on the map, so it needs its own ground to stay
           legible over whatever is beneath — the same problem the day viewer
           has with its rail, and the same answer. */
        .background {
            LinearGradient(
                colors: [room.ground, room.ground.opacity(0.92), room.ground.opacity(0)],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea(edges: .top)
            .allowsHitTesting(false)
        }
    }

    /// The selected place, raised. One photograph, its date, and where it
    /// was — and a whole tap target, because a card you can only open by
    /// finding the picture in it is a card with a hidden button.
    private func surfaced(_ cluster: Cluster) -> some View {
        let day = cluster.days[0]

        return Button { onOpen(day.date) } label: {
            HStack(alignment: .top, spacing: Space.s4) {
                Tile(day: day, room: room, side: 86)

                VStack(alignment: .leading, spacing: Space.s2) {
                    Text(day.date.spelled(in: .gmt))
                        .font(.system(size: Size.lede, design: .serif))
                        .foregroundStyle(room.ink)
                        .multilineTextAlignment(.leading)

                    if let name = day.name {
                        Text(name)
                            .font(Face.grotesk(Size.fine, weight: .regular))
                            .foregroundStyle(room.inkMuted)
                    }

                    if cluster.days.count > 1 {
                        Signage(
                            text: "\(cluster.days.count) days here",
                            tone: room.inkFaint
                        )
                    }
                }

                Spacer(minLength: 0)
            }
            .padding(Space.s4)
            .padding(.bottom, Space.s5)
            .background(room.ground)
            .overlay(alignment: .top) { Rectangle().fill(Tone.ruleFaint).frame(height: 1) }
        }
        .buttonStyle(.plain)
    }

    // MARK: Gathering

    /**
     Points near each other on screen, gathered into one.

     Clustering by distance on the ground would be wrong: two days a mile
     apart are one point on a map of Europe and two on a map of a town, and
     what governs is how far apart they are *now*. So the grid is a fraction
     of whatever the camera is currently showing, and the same photographs
     separate as the map is opened up — which is the behaviour that makes
     zooming feel like looking closer rather than loading more.
     */
    private var clusters: [Cluster] {
        let span = span ?? Self.enclosing(days)?.span
            ?? MKCoordinateSpan(latitudeDelta: 60, longitudeDelta: 60)

        /* Roughly a dozen cells across the screen. Fewer and distinct places
           merge; more and a city becomes a pile of overlapping thumbnails,
           which is the failure the default clusterer exists to prevent. */
        let cell = max(span.latitudeDelta, span.longitudeDelta) / 12
        guard cell > 0 else { return [] }

        var gathered: [String: [PlacedDay]] = [:]
        for day in days {
            let row = (day.coordinates.lat / cell).rounded(.down)
            let column = (day.coordinates.lon / cell).rounded(.down)
            gathered["\(row),\(column)", default: []].append(day)
        }

        return gathered.values.map { group in
            /* Newest first inside a cluster, so the photograph a place shows
               is the last time you were there. */
            let sorted = group.sorted { $0.date > $1.date }
            return Cluster(
                id: sorted[0].id,
                days: sorted,
                centre: CLLocationCoordinate2D(
                    latitude: sorted.map(\.coordinates.lat).reduce(0, +) / Double(sorted.count),
                    longitude: sorted.map(\.coordinates.lon).reduce(0, +) / Double(sorted.count)
                )
            )
        }
        .sorted { $0.id < $1.id }
    }

    /// A region holding every day, with room around it. `.automatic` frames
    /// the annotations and does it tightly enough that the outermost sit
    /// under the heading.
    private static func enclosing(_ days: [PlacedDay]) -> MKCoordinateRegion? {
        guard !days.isEmpty else { return nil }

        let lats = days.map(\.coordinates.lat)
        let lons = days.map(\.coordinates.lon)
        let low = CLLocationCoordinate2D(latitude: lats.min()!, longitude: lons.min()!)
        let high = CLLocationCoordinate2D(latitude: lats.max()!, longitude: lons.max()!)

        return MKCoordinateRegion(
            center: CLLocationCoordinate2D(
                latitude: (low.latitude + high.latitude) / 2,
                longitude: (low.longitude + high.longitude) / 2
            ),
            span: MKCoordinateSpan(
                /* A floor as well as a margin: one day, or a week in one
                   town, would otherwise open at street level, and a map of a
                   life should not begin on a pavement. */
                latitudeDelta: max(0.6, (high.latitude - low.latitude) * 1.5),
                longitudeDelta: max(0.6, (high.longitude - low.longitude) * 1.5)
            )
        )
    }

    struct Cluster: Identifiable, Equatable {
        let id: String
        let days: [PlacedDay]
        let centre: CLLocationCoordinate2D

        static func == (a: Cluster, b: Cluster) -> Bool {
            a.id == b.id && a.days.count == b.days.count
        }
    }
}

// MARK: - The point itself

/// A photograph on the map, with the rest of its group behind it.
private struct Point: View {
    let cluster: MapView.Cluster
    let room: Room
    let chosen: Bool

    private var side: CGFloat { chosen ? 62 : 46 }

    var body: some View {
        ZStack {
            /* The others, as edges rather than as pictures. Two is enough to
               say "more than one" and reads as a stack of prints; a badge
               with a number reads as a database. */
            ForEach(0..<min(2, max(0, cluster.days.count - 1)), id: \.self) { i in
                Rectangle()
                    .fill(room.ground)
                    .overlay(Rectangle().stroke(Tone.ruleFaint, lineWidth: 1))
                    .frame(width: side, height: side)
                    .offset(x: CGFloat(i + 1) * 3, y: CGFloat(i + 1) * -3)
            }

            Tile(day: cluster.days[0], room: room, side: side)
                .overlay(
                    Rectangle().stroke(
                        chosen ? Tone.oxide : room.ground.opacity(0.9),
                        lineWidth: chosen ? 2 : 1.5
                    )
                )
                .shadow(color: .black.opacity(0.22), radius: 6, y: 2)
        }
        /* Lifted back most of the way, not all of it. See the note on the
           map's own filter for why exactness is the wrong target here. */
        .saturation(1.9)
        .animation(Tempo.out, value: chosen)
    }
}

/// A square thumbnail, held by asset id like every other image in the app so
/// a photograph shown on the map and then in the viewer is fetched once.
/// Not `Plate` — that is the day viewer's full-bleed photograph, and this is
/// a forty-six point square.
private struct Tile: View {
    let day: PlacedDay
    let room: Room
    let side: CGFloat

    @State private var image: UIImage?

    var body: some View {
        ZStack {
            room.ink.opacity(0.10)

            if let image {
                Image(uiImage: image)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .transition(.opacity)
            }
        }
        .frame(width: side, height: side)
        .clipped()
        .animation(Tempo.out, value: image != nil)
        .task(id: day.id) {
            guard let url = day.thumbnailUrl else { return }
            if let held = await Photographs.shared.cached(day.id) {
                image = held
                return
            }
            image = await Photographs.shared.image(for: day.id, at: url)
        }
    }
}
