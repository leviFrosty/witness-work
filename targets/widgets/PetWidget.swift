import SwiftUI
import UIKit
import WidgetKit

// MARK: - Pet Companion widget
//
// The app renders the pet as PNGs, one set per future state (every hearts,
// lamp, sign and window time change over the next ~48 hours, then each day
// the hearts change until the pet would die), writes them into
// the App Group's `pet/` folder, and lists them in `snapshot.pet.entries`. This
// widget turns those entries into its timeline and draws the hearts and text
// itself, so they stay crisp and follow Dynamic Type.
//
//   Small  → the pet, full bleed, with its name and hearts over the top.
//   Medium → the pet as a square on the leading side; name, hearts, lamp
//            days and the wall sign's value beside it.
//   Large  → the room across the top, with a slim row of name and hearts,
//            and lamp days, under it.

// MARK: - Snapshot slice

/// Only what this widget reads, so a problem in another widget's slice
/// doesn't blank the pet.
private struct PetSnapshot: Decodable {
  struct Strings: Decodable {
    let petPlaceholderLabel: String?
  }

  let version: Int
  let rtl: Bool?
  let numberLocale: String?
  let strings: Strings?
  /// Lenient, so a malformed slice shows the placeholder, not a blank widget.
  let pet: WidgetSnapshot.LenientPet?

  var appLanguage: AppLanguage { AppLanguage(rtl: rtl, numberLocale: numberLocale) }
}

// MARK: - Images

private enum PetImages {
  /// The folder `WidgetBridge.writeFile` writes to.
  private static let folderName = "pet"
  /// Same pattern `WidgetBridge.writeFile` enforces, so a name can't leave
  /// the folder.
  private static let fileNamePattern = "^[a-z0-9-]+\\.png$"

  static func load(_ name: String) -> UIImage? {
    guard name.range(of: fileNamePattern, options: .regularExpression) != nil,
          let group = AppGroup.identifier,
          let container = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: group
          )
    else { return nil }
    let url = container
      .appendingPathComponent(folderName, isDirectory: true)
      .appendingPathComponent(name)
    return UIImage(contentsOfFile: url.path)
  }
}

// MARK: - Timeline

private struct PetTimelineEntry: TimelineEntry {
  let date: Date
  /// `nil` before the app's first snapshot or while there's no pet.
  let pet: WidgetSnapshot.Pet?
  /// The state shown from `date` on. `nil` when the snapshot lists none; the
  /// pet's current hearts show, without an image.
  let state: WidgetSnapshot.PetEntry?
  let language: AppLanguage?
  let placeholderLabel: String?
}

private struct PetProvider: TimelineProvider {
  func placeholder(in context: Context) -> PetTimelineEntry {
    PetTimelineEntry(date: Date(), pet: nil, state: nil, language: nil, placeholderLabel: nil)
  }

  func getSnapshot(in context: Context, completion: @escaping (PetTimelineEntry) -> Void) {
    completion(Self.entries(now: Date()).first ?? placeholder(in: context))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<PetTimelineEntry>) -> Void) {
    let entries = Self.entries(now: Date())
    // The app lists the states ahead (the next 48 hours, then each day the
    // hearts change until the pet would die), so reload once they've all
    // started. Past the last one the widget can't work out a newer state
    // itself; the app reloads it with a fresh snapshot when it next runs, so
    // asking WidgetKit sooner would only spend the daily budget.
    let policy: TimelineReloadPolicy = entries.count > 1 ? .atEnd : .never
    completion(Timeline(entries: entries, policy: policy))
  }

  /// The latest state that has started, shown now, then each later one at
  /// its own time.
  static func entries(now: Date) -> [PetTimelineEntry] {
    let snapshot = SnapshotLoader.load(PetSnapshot.self, version: \.version)
    let language = snapshot?.appLanguage
    let placeholderLabel = snapshot?.strings?.petPlaceholderLabel
    guard let pet = snapshot?.pet?.value else {
      return [
        PetTimelineEntry(
          date: now, pet: nil, state: nil, language: language,
          placeholderLabel: placeholderLabel
        ),
      ]
    }

    let states = pet.entries.sorted { $0.date < $1.date }
    let upcoming = states.filter { $0.dateAsDate > now }
    // Before the first state starts (a clock set back), show that one early.
    let current = states.last { $0.dateAsDate <= now } ?? upcoming.first

    func entry(_ date: Date, _ state: WidgetSnapshot.PetEntry?) -> PetTimelineEntry {
      PetTimelineEntry(
        date: date, pet: pet, state: state, language: language,
        placeholderLabel: placeholderLabel
      )
    }
    return [entry(now, current)]
      + upcoming
      .filter { $0.date != current?.date }
      .map { entry($0.dateAsDate, $0) }
  }
}

// MARK: - Pixel hearts
//
// The 5×4 heart of `src/lib/pixelArt/stamp.ts` plus one highlight pixel,
// drawn as squares so it stays sharp at any size:
//
//   . r . r .
//   r h r r r      h = highlight
//   . r r r .
//   . . r . .
//
// A half heart fills the columns up to and including the middle one. It's
// mirrored right to left, where the row fills from the trailing side.

private enum HeartFill {
  case full, half, empty

  init(hearts: Double, index: Int) {
    let left = hearts - Double(index)
    if left >= 1 { self = .full } else if left >= 0.5 { self = .half } else { self = .empty }
  }
}

private enum PixelHeartShape {
  static let rows = [".r.r.", "rhrrr", ".rrr.", "..r.."]
  static let width = 5
  static let height = 4
  /// The last column a half heart fills.
  static let halfColumns = 2

  enum Tone { case fill, highlight, empty }

  /// Every pixel of the heart with the tone it gets for `fill`.
  static func pixels(_ fill: HeartFill) -> [(x: Int, y: Int, tone: Tone)] {
    var pixels: [(x: Int, y: Int, tone: Tone)] = []
    for (y, row) in rows.enumerated() {
      for (x, character) in row.enumerated() where character != "." {
        let filled: Bool
        switch fill {
        case .full: filled = true
        case .half: filled = x <= halfColumns
        case .empty: filled = false
        }
        let tone: Tone = !filled ? .empty : character == "h" ? .highlight : .fill
        pixels.append((x, y, tone))
      }
    }
    return pixels
  }
}

/// Squares of one tone, on a grid of `PixelHeartShape.width × height`.
private struct PixelMask: Shape {
  let pixels: [(x: Int, y: Int)]

  func path(in rect: CGRect) -> Path {
    let w = rect.width / CGFloat(PixelHeartShape.width)
    let h = rect.height / CGFloat(PixelHeartShape.height)
    var path = Path()
    for pixel in pixels {
      path.addRect(CGRect(
        x: rect.minX + CGFloat(pixel.x) * w,
        y: rect.minY + CGFloat(pixel.y) * h,
        width: w,
        height: h
      ))
    }
    return path
  }
}

private struct PixelHeart: View {
  let fill: HeartFill
  let gold: Bool
  let pixel: CGFloat

  var body: some View {
    let pixels = PixelHeartShape.pixels(fill)
    let mask = { (tone: PixelHeartShape.Tone) in
      PixelMask(pixels: pixels.filter { $0.tone == tone }.map { (x: $0.x, y: $0.y) })
    }
    ZStack {
      mask(.empty).fill(WidgetColor.petHeartEmpty)
      mask(.fill).fill(gold ? WidgetColor.petHeartGold : WidgetColor.petHeart)
      mask(.highlight).fill(gold ? WidgetColor.petHeartGoldHighlight : WidgetColor.petHeartHighlight)
    }
    .frame(
      width: pixel * CGFloat(PixelHeartShape.width),
      height: pixel * CGFloat(PixelHeartShape.height)
    )
    .flipsForRightToLeftLayoutDirection(true)
  }
}

/// Five hearts, 0 to 5 in halves. A pet that died shows them all empty.
private struct PixelHearts: View {
  let hearts: Double
  let dead: Bool
  let gold: Bool
  /// Size of one heart pixel at the default text size.
  private static let basePixel: CGFloat = 2
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize

  var body: some View {
    let pixel = Self.pixel(Self.basePixel, dynamicTypeSize)
    HStack(spacing: pixel) {
      ForEach(0..<5, id: \.self) { index in
        PixelHeart(
          fill: dead ? .empty : HeartFill(hearts: hearts, index: index),
          gold: gold && !dead,
          pixel: pixel
        )
      }
    }
    .accessibilityHidden(true)
  }

  /// Whole points, so neighboring squares don't leave hairline seams, grown
  /// a step for the larger text sizes.
  private static func pixel(_ base: CGFloat, _ size: DynamicTypeSize) -> CGFloat {
    let scale: CGFloat
    switch size {
    case ...DynamicTypeSize.large: scale = 1
    case ...DynamicTypeSize.xxLarge: scale = 1.25
    default: scale = 1.5
    }
    return max(1, (base * scale).rounded())
  }
}

// MARK: - Pieces

/// A pet image scaled with nearest-neighbor sampling to fill its frame.
private struct PetArt: View {
  let fileName: String?

  var body: some View {
    Color.clear.overlay {
      if let fileName, let image = PetImages.load(fileName) {
        Image(uiImage: image)
          .resizable()
          .interpolation(.none)
          .petFullColor()
          .scaledToFill()
      }
    }
    .clipped()
    .accessibilityHidden(true)
  }
}

private extension Image {
  /// Keeps the pet in its colors when the Home Screen tints widgets.
  @ViewBuilder func petFullColor() -> some View {
    if #available(iOS 18.0, *) {
      self.widgetAccentedRenderingMode(.fullColor)
    } else {
      self
    }
  }
}

private struct PetName: View {
  let name: String
  let font: Font

  var body: some View {
    Text(name)
      .font(font)
      .lineLimit(1)
      .minimumScaleFactor(0.7)
  }
}

/// The lamp's streak days, its flame brighter the higher the lamp burns.
private struct LampDaysLine: View {
  let label: String
  let level: Int

  var body: some View {
    HStack(spacing: WidgetSpacing.sm) {
      Image(systemName: "flame.fill")
        .font(.caption2)
        .foregroundStyle(WidgetColor.petLamp.opacity(0.4 + 0.12 * Double(min(max(level, 0), 5))))
        .accessibilityHidden(true)
      Text(label)
        .font(.footnote)
        .fontWeight(.medium)
        .foregroundStyle(.secondary)
        .lineLimit(1)
        .minimumScaleFactor(0.75)
    }
  }
}

// MARK: - Sizes

/// What every size reads: the entry's state over the pet's current one.
private struct PetModel {
  let pet: WidgetSnapshot.Pet
  let state: WidgetSnapshot.PetEntry?
  let language: AppLanguage

  /// The entry's own lamp and sign; `nil` from an older app.
  private var status: WidgetSnapshot.PetEntryStatus? { state?.status }

  var hearts: Double { state?.hearts ?? pet.hearts }
  var dead: Bool { state?.dead ?? pet.dead }
  var gold: Bool { state?.gold ?? pet.gold }
  var lampLevel: Int { status?.lampLevel ?? pet.lampLevel }
  var lampDays: String? {
    let label = status.map { $0.lampDaysLabel } ?? pet.lampDaysLabel
    return label.map(language.digits)
  }
  var signLine: String? {
    let line = status.map { $0.signLine } ?? pet.signLine
    return line.map(language.digits)
  }
  var accessibilityLabel: String { status?.accessibilityLabel ?? pet.accessibilityLabel }

  var heartsRow: PixelHearts { PixelHearts(hearts: hearts, dead: dead, gold: gold) }
}

private struct SmallPetView: View {
  let model: PetModel

  var body: some View {
    PetArt(fileName: model.state?.small)
      .overlay(alignment: .topLeading) {
        VStack(alignment: .leading, spacing: WidgetSpacing.sm) {
          PetName(name: model.pet.name, font: .subheadline.weight(.bold))
            .foregroundStyle(.white)
          model.heartsRow
        }
        // A hard pixel shadow plus a soft one keep white text readable on
        // any room.
        .shadow(color: .black.opacity(0.55), radius: 0, x: 1, y: 1)
        .shadow(color: .black.opacity(0.35), radius: 3)
        .padding(WidgetSpacing.xl)
      }
  }
}

private struct MediumPetView: View {
  let model: PetModel

  var body: some View {
    GeometryReader { geo in
      HStack(spacing: 0) {
        PetArt(fileName: model.state?.medium)
          .frame(width: geo.size.height, height: geo.size.height)

        VStack(alignment: .leading, spacing: WidgetSpacing.md) {
          PetName(name: model.pet.name, font: .headline)
          model.heartsRow
          Spacer(minLength: 0)
          if let lampDays = model.lampDays {
            LampDaysLine(label: lampDays, level: model.lampLevel)
          }
          if let signLine = model.signLine {
            Text(signLine)
              .font(.footnote)
              .foregroundStyle(.secondary)
              .lineLimit(2)
              .minimumScaleFactor(0.75)
          }
        }
        .padding(.horizontal, WidgetSpacing.xl + WidgetSpacing.sm)
        .padding(.vertical, WidgetSpacing.xl + WidgetSpacing.sm)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
      }
    }
  }
}

private struct LargePetView: View {
  let model: PetModel
  /// The room image's width : height.
  private static let roomAspect: CGFloat = 123 / 100

  var body: some View {
    GeometryReader { geo in
      // About 78% of the widget's height on current phones; capped so the
      // row underneath keeps room for larger text.
      let roomHeight = min(geo.size.width / Self.roomAspect, geo.size.height * 0.8)
      VStack(spacing: 0) {
        PetArt(fileName: model.state?.large)
          .frame(width: geo.size.width, height: roomHeight)

        HStack(alignment: .center, spacing: WidgetSpacing.lg) {
          VStack(alignment: .leading, spacing: WidgetSpacing.sm) {
            PetName(name: model.pet.name, font: .headline)
            model.heartsRow
          }
          Spacer(minLength: 0)
          if let lampDays = model.lampDays {
            LampDaysLine(label: lampDays, level: model.lampLevel)
          }
        }
        .padding(.horizontal, WidgetSpacing.xl + WidgetSpacing.sm)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
      }
    }
  }
}

/// No snapshot yet, or no pet chosen.
private struct PetPlaceholderView: View {
  let label: String

  var body: some View {
    VStack(spacing: WidgetSpacing.lg) {
      PixelHeart(fill: .full, gold: false, pixel: 4)
        .accessibilityHidden(true)
      Text(label)
        .font(.footnote)
        .fontWeight(.semibold)
        .foregroundStyle(.secondary)
        .multilineTextAlignment(.center)
        .minimumScaleFactor(0.8)
    }
    .padding(WidgetSpacing.xl + WidgetSpacing.sm)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }
}

// MARK: - Root view

private struct PetWidgetView: View {
  let entry: PetTimelineEntry
  @Environment(\.widgetFamily) private var family

  var body: some View {
    Group {
      if let pet = entry.pet {
        let model = PetModel(
          pet: pet,
          state: entry.state,
          language: entry.language ?? AppLanguage(rtl: nil, numberLocale: nil)
        )
        Group {
          switch family {
          case .systemMedium: MediumPetView(model: model)
          case .systemLarge: LargePetView(model: model)
          default: SmallPetView(model: model)
          }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(accessibilityLabel(model)))
      } else {
        PetPlaceholderView(
          label: entry.placeholderLabel ?? L10n.t("pet.widgetPlaceholder")
        )
        .accessibilityElement(children: .combine)
      }
    }
    .appLanguage(entry.language)
    .widgetURL(WidgetURLs.home)
    .containerBackground(for: .widget) { WidgetColor.petRoom }
  }

  /// The pet's label, then the lines this size shows.
  private func accessibilityLabel(_ model: PetModel) -> String {
    var parts = [model.accessibilityLabel]
    if family == .systemMedium || family == .systemLarge, let lampDays = model.lampDays {
      parts.append(lampDays)
    }
    if family == .systemMedium, let signLine = model.signLine {
      parts.append(signLine)
    }
    return parts.joined(separator: ", ")
  }
}

// MARK: - Widget

struct PetWidget: Widget {
  let kind: String = "PetWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: PetProvider()) { entry in
      PetWidgetView(entry: entry)
    }
    .configurationDisplayName(L10n.t("pet.widgetName"))
    .description(L10n.t("pet.widgetDescription"))
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    // The pet and its room run to the widget's edges; the text pads itself.
    .contentMarginsDisabled()
  }
}
