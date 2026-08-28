import SwiftUI

/*
 The pieces every screen is built from.

 These are the phone's equivalent of the website's primitives: a rule, a
 standing label, an accession number, a readout, a field. Views compose
 these rather than reaching for a font or a colour directly, which is what
 keeps the two surfaces looking like one institution.
 */

// MARK: - Marks

/// A hairline. The institution rules its pages.
struct Rule: View {
    var tone: Color = Tone.rule

    var body: some View {
        Rectangle()
            .fill(tone)
            .frame(height: Space.hair)
    }
}

/// A standing label: navigation, column headings, department names.
struct Signage: View {
    let text: String
    var size: CGFloat = Size.micro
    var tone: Color = Tone.inkFaint
    var weight: Font.Weight = .medium

    var body: some View {
        Text(text.uppercased())
            .font(Face.grotesk(size, weight: weight))
            .tracking(size * Track.signage)
            .foregroundStyle(tone)
    }
}

/// An accession number, in the register's own hand. Hyphens in storage,
/// en-dashes in display — the same rule `format()` applies on the website.
struct AccessionNumber: View {
    let id: String
    var size: CGFloat = Size.micro
    var tone: Color = Tone.inkFaint

    var body: some View {
        Text(Accession.display(id))
            .font(Face.mono(size))
            .tracking(size * Track.accession)
            .foregroundStyle(tone)
    }
}

// MARK: - Readouts

/// A measured line: what it is on the left, what it reads on the right.
struct Readout: View {
    let key: String
    let value: String
    var tone: Color = Tone.ink

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: Space.s3) {
            Signage(text: key, size: Size.micro, tone: Tone.inkFaint)
            Spacer(minLength: Space.s2)
            Text(value)
                .font(Face.mono(Size.fine))
                .foregroundStyle(tone)
                .multilineTextAlignment(.trailing)
        }
        .padding(.vertical, Space.s1)
    }
}

/// A block of the page, headed and ruled.
struct Panel<Content: View>: View {
    let title: String
    var note: String?
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: Space.s3) {
            Signage(text: title, tone: Tone.ink)
            Rule(tone: Tone.ruleStrong)

            content

            if let note {
                Text(note)
                    .font(Face.editorial(Size.small, italic: true))
                    .foregroundStyle(Tone.inkMuted)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, Space.s1)
            }
        }
        .padding(.vertical, Space.s5)
    }
}

// MARK: - Writing

/// A field to write in. Labelled above, ruled beneath, no box — the
/// institution's forms are ledgers rather than dialogs.
struct WritingField: View {
    let label: String
    var placeholder: String = ""
    @Binding var text: String
    var lines: ClosedRange<Int> = 1...1
    var face: Font
    var autocapitalisation: TextInputAutocapitalization = .sentences

    init(
        _ label: String,
        placeholder: String = "",
        text: Binding<String>,
        lines: ClosedRange<Int> = 1...1,
        face: Font? = nil,
        autocapitalisation: TextInputAutocapitalization = .sentences
    ) {
        self.label = label
        self.placeholder = placeholder
        self._text = text
        self.lines = lines
        self.face = face ?? Face.editorial(Size.body)
        self.autocapitalisation = autocapitalisation
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Space.s2) {
            Signage(text: label)

            TextField(placeholder, text: $text, axis: .vertical)
                .font(face)
                .foregroundStyle(Tone.ink)
                .lineLimit(lines)
                .textInputAutocapitalization(autocapitalisation)
                .tint(Tone.oxide)

            Rule()
        }
        .padding(.vertical, Space.s2)
    }
}

/// A closed set of options, set as signage. One is underlined in oxide.
struct ChoiceRow<Option: Identifiable & Hashable>: View {
    let label: String
    let options: [Option]
    @Binding var selection: Option
    let name: (Option) -> String

    var body: some View {
        VStack(alignment: .leading, spacing: Space.s2) {
            Signage(text: label)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: Space.s4) {
                    ForEach(options) { option in
                        Button {
                            withAnimation(Tempo.inOut) { selection = option }
                        } label: {
                            VStack(spacing: Space.s2) {
                                Signage(
                                    text: name(option),
                                    tone: option == selection ? Tone.ink : Tone.inkGhost,
                                    weight: option == selection ? .semibold : .regular
                                )
                                Rectangle()
                                    .fill(option == selection ? Tone.oxide : Color.clear)
                                    .frame(height: 1.5)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.vertical, Space.s1)
            }
        }
        .padding(.vertical, Space.s2)
    }
}

// MARK: - Buttons

/// The one button on a screen that does the thing the screen is for.
struct StampButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(Face.grotesk(Size.small, weight: .semibold))
            .tracking(Size.small * Track.signage)
            .textCase(.uppercase)
            .foregroundStyle(isEnabled ? Tone.oxide : Tone.inkGhost)
            .frame(maxWidth: .infinity)
            .padding(.vertical, Space.s4)
            .background(isEnabled ? Tone.oxideSoft : Tone.wash)
            .overlay {
                Rectangle()
                    .stroke(isEnabled ? Tone.oxide : Tone.rule, lineWidth: 1)
            }
            .opacity(configuration.isPressed ? 0.6 : 1)
            .animation(.easeOut(duration: Tempo.instant), value: configuration.isPressed)
    }
}

/// Everything else. A ruled line of signage that happens to be tappable.
struct QuietButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(Face.grotesk(Size.micro, weight: .medium))
            .tracking(Size.micro * Track.signage)
            .textCase(.uppercase)
            .foregroundStyle(isEnabled ? Tone.ink : Tone.inkGhost)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, Space.s3)
            .contentShape(Rectangle())
            .opacity(configuration.isPressed ? 0.5 : 1)
    }
}

// MARK: - States

/// What the screen says when it has nothing to show. Written straight.
struct Notice: View {
    let standing: String
    let text: String
    var standingTone: Color = Tone.inkFaint
    var tone: Color = Tone.inkMuted

    var body: some View {
        VStack(alignment: .leading, spacing: Space.s3) {
            Signage(text: standing, tone: standingTone)
            Text(text)
                .font(Face.editorial(Size.body))
                .foregroundStyle(tone)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, Space.s6)
    }
}
