import WidgetKit
import SwiftUI

// MARK: - Model

struct VortoWord: Codable {
    let id: String?   // optional: tolerates older payloads that lacked an id
    let word: String
    let ipa: String
    let pos: String
    let def: String
    var ex: String? = nil   // example/context line (optional; default lets FALLBACK omit it)
}

// Fallback set bundled with the widget. In production the RN app writes the
// user's curated, field-specific queue into the shared App Group (see WIDGET.md)
// and this reads from there; if empty, we fall back to these.
// A LARGE, varied fallback so that even if the App Group queue is unavailable, the
// widget still rotates through many different words (never the same handful).
let FALLBACK: [VortoWord] = [
    .init(id: "gen:petrichor", word: "petrichor", ipa: "ˈpɛtrɪkɔː", pos: "n", def: "The earthy scent of rain on dry ground."),
    .init(id: "gen:sedulous", word: "sedulous", ipa: "ˈsɛdjʊləs", pos: "adj", def: "Diligent; showing dedicated, persistent effort."),
    .init(id: "gen:ineffable", word: "ineffable", ipa: "ɪnˈɛfəbl̩", pos: "adj", def: "Too great to be expressed in words."),
    .init(id: "gen:perspicacious", word: "perspicacious", ipa: "ˌpɜːspɪˈkeɪʃəs", pos: "adj", def: "Having keen insight; quick to understand."),
    .init(id: "gen:mellifluous", word: "mellifluous", ipa: "mɛˈlɪflʊəs", pos: "adj", def: "Pleasingly smooth and musical to hear."),
    .init(id: "gen:equanimity", word: "equanimity", ipa: "ˌɛkwəˈnɪmɪti", pos: "n", def: "Calmness and composure under strain."),
    .init(id: "gen:susurrus", word: "susurrus", ipa: "sʊˈsʌrəs", pos: "n", def: "A soft whispering or rustling sound."),
    .init(id: "gen:quixotic", word: "quixotic", ipa: "kwɪkˈsɒtɪk", pos: "adj", def: "Extravagantly idealistic and impractical."),
    .init(id: "gen:sonder", word: "sonder", ipa: "ˈsɒndə", pos: "n", def: "The awareness that every stranger has a life as vivid as your own."),
    .init(id: "gen:limerence", word: "limerence", ipa: "ˈlɪmərəns", pos: "n", def: "The involuntary, intense longing of early infatuation."),
    .init(id: "gen:sagacious", word: "sagacious", ipa: "səˈɡeɪʃəs", pos: "adj", def: "Having or showing keen practical judgement."),
    .init(id: "gen:ephemeral", word: "ephemeral", ipa: "ɪˈfɛm(ə)rəl", pos: "adj", def: "Lasting for a very short time."),
    .init(id: "gen:laconic", word: "laconic", ipa: "ləˈkɒnɪk", pos: "adj", def: "Using very few words; terse to the point of seeming rude."),
    .init(id: "gen:halcyon", word: "halcyon", ipa: "ˈhalsɪən", pos: "adj", def: "Denoting a past time that was idyllically happy and peaceful."),
    .init(id: "gen:nascent", word: "nascent", ipa: "ˈnas(ə)nt", pos: "adj", def: "Just coming into existence and beginning to show promise."),
    .init(id: "gen:obfuscate", word: "obfuscate", ipa: "ˈɒbfəskeɪt", pos: "v", def: "To deliberately make something unclear or hard to understand."),
    .init(id: "gen:pellucid", word: "pellucid", ipa: "pɛˈl(j)uːsɪd", pos: "adj", def: "Translucently clear, in substance or expression."),
    .init(id: "gen:quiescent", word: "quiescent", ipa: "kwɪˈɛs(ə)nt", pos: "adj", def: "In a state of inactivity or dormancy."),
    .init(id: "gen:redolent", word: "redolent", ipa: "ˈrɛd(ə)l(ə)nt", pos: "adj", def: "Strongly reminiscent or suggestive of something."),
    .init(id: "gen:sanguine", word: "sanguine", ipa: "ˈsaŋɡwɪn", pos: "adj", def: "Optimistic or positive, especially in a difficult situation."),
    .init(id: "gen:taciturn", word: "taciturn", ipa: "ˈtasɪtəːn", pos: "adj", def: "Reserved or uncommunicative in speech; saying little."),
    .init(id: "gen:ubiquitous", word: "ubiquitous", ipa: "juːˈbɪkwɪtəs", pos: "adj", def: "Present, appearing, or found everywhere."),
    .init(id: "gen:vicarious", word: "vicarious", ipa: "vɪˈkɛːrɪəs", pos: "adj", def: "Experienced through the feelings or actions of another."),
    .init(id: "gen:winsome", word: "winsome", ipa: "ˈwɪns(ə)m", pos: "adj", def: "Attractive or appealing in a fresh, innocent way."),
    .init(id: "gen:zephyr", word: "zephyr", ipa: "ˈzɛfə", pos: "n", def: "A soft, gentle breeze."),
    .init(id: "gen:aplomb", word: "aplomb", ipa: "əˈplɒm", pos: "n", def: "Self-confidence or assurance, especially under pressure."),
    .init(id: "gen:cogent", word: "cogent", ipa: "ˈkəʊdʒ(ə)nt", pos: "adj", def: "Clear, logical, and convincing."),
    .init(id: "gen:diaphanous", word: "diaphanous", ipa: "dʌɪˈafən(ə)s", pos: "adj", def: "Light, delicate, and translucent."),
    .init(id: "gen:effulgent", word: "effulgent", ipa: "ɪˈfʌldʒ(ə)nt", pos: "adj", def: "Shining brightly; radiant."),
    .init(id: "gen:fastidious", word: "fastidious", ipa: "faˈstɪdɪəs", pos: "adj", def: "Very attentive to accuracy and detail."),
    .init(id: "gen:gregarious", word: "gregarious", ipa: "ɡrɪˈɡɛːrɪəs", pos: "adj", def: "Fond of company; sociable."),
    .init(id: "gen:iridescent", word: "iridescent", ipa: "ˌɪrɪˈdɛs(ə)nt", pos: "adj", def: "Showing luminous colours that seem to shift in the light."),
    .init(id: "gen:juxtapose", word: "juxtapose", ipa: "ˈdʒʌkstəpəʊz", pos: "v", def: "To place close together for contrasting effect."),
    .init(id: "gen:kismet", word: "kismet", ipa: "ˈkɪzmɛt", pos: "n", def: "Destiny or fate."),
    .init(id: "gen:luminous", word: "luminous", ipa: "ˈluːmɪnəs", pos: "adj", def: "Full of or shedding light; radiant."),
    .init(id: "gen:magnanimous", word: "magnanimous", ipa: "maɡˈnanɪməs", pos: "adj", def: "Generous or forgiving, especially towards a rival."),
    .init(id: "gen:nebulous", word: "nebulous", ipa: "ˈnɛbjʊləs", pos: "adj", def: "Vague, ill-defined, or hazy."),
    .init(id: "gen:ostensible", word: "ostensible", ipa: "ɒˈstɛnsɪbl", pos: "adj", def: "Stated or appearing to be true, but not necessarily so."),
    .init(id: "gen:panacea", word: "panacea", ipa: "ˌpanəˈsɪə", pos: "n", def: "A supposed cure-all for every problem."),
    .init(id: "gen:reticent", word: "reticent", ipa: "ˈrɛtɪs(ə)nt", pos: "adj", def: "Reluctant to reveal one's thoughts or feelings."),
    .init(id: "gen:serendipity", word: "serendipity", ipa: "ˌsɛr(ə)nˈdɪpɪti", pos: "n", def: "The occurrence of happy events by chance."),
    .init(id: "gen:trenchant", word: "trenchant", ipa: "ˈtrɛn(t)ʃ(ə)nt", pos: "adj", def: "Vigorous, incisive, and sharply expressed."),
]

let APP_GROUP = "group.com.gpeysack.lexfall"

func loadQueue() -> [VortoWord] {
    guard let defaults = UserDefaults(suiteName: APP_GROUP),
          let raw = defaults.string(forKey: "wordQueue"),
          let data = raw.data(using: .utf8),
          let words = try? JSONDecoder().decode([VortoWord].self, from: data),
          !words.isEmpty
    else { return FALLBACK }
    return words
}

// Hours within which words refresh (user setting; defaults 9–22).
func activeHours() -> (Int, Int) {
    let d = UserDefaults(suiteName: APP_GROUP)
    let from = d?.integer(forKey: "activeFrom") ?? 0
    let to = d?.integer(forKey: "activeTo") ?? 0
    return (from == 0 ? 9 : from, to == 0 ? 22 : to)
}

// Hours between word changes. The app publishes this (24h / words-per-day) so the
// widget and notifications advance the shared stream at the same rate; fall back
// to a sane default if it isn't set yet.
func intervalHours() -> Int {
    let d = UserDefaults(suiteName: APP_GROUP)
    let published = d?.integer(forKey: "widgetIntervalHours") ?? 0
    if published > 0 { return published }
    let perDay = d?.integer(forKey: "wordsPerDay") ?? 0
    let n = perDay == 0 ? 10 : perDay
    return max(1, Int((24.0 / Double(n)).rounded()))
}

// The app publishes this timestamp (ms) whenever it refreshes the queue. The
// word index is measured from here, so successive timeline refreshes CONTINUE
// the sequence instead of restarting at 0 — that's what stops the widget from
// repeating words. The app drops already-shown words from the queue on each open.
func widgetAnchor() -> Date {
    let ms = UserDefaults(suiteName: APP_GROUP)?.double(forKey: "widgetAnchor") ?? 0
    // If the app hasn't written an anchor yet, use a FIXED past reference (not
    // Date()). With Date(), every timeline rebuild reset the index to 0 and pinned
    // the widget on the first word (petrichor) forever. A fixed epoch makes the
    // index grow with time so even the FALLBACK rotates.
    return ms > 0 ? Date(timeIntervalSince1970: ms / 1000.0) : Date(timeIntervalSince1970: 1_700_000_000)
}

// MARK: - Timeline

struct VortoEntry: TimelineEntry {
    let date: Date
    let item: VortoWord
}

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> VortoEntry { VortoEntry(date: Date(), item: FALLBACK[0]) }
    func getSnapshot(in context: Context, completion: @escaping (VortoEntry) -> Void) {
        completion(VortoEntry(date: Date(), item: loadQueue()[0]))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<VortoEntry>) -> Void) {
        let words = loadQueue()
        let step = intervalHours()
        let anchor = widgetAnchor()
        let stepSecs = Double(step) * 3600.0
        let cal = Calendar.current
        // PER-INSTANCE VARIETY (owner 2026-09-26: several placed widgets all showed the
        // SAME word). WidgetKit builds a separate timeline for every placed widget, but a
        // StaticConfiguration gives instances no identity, so identical inputs produced
        // identical timelines. Two offsets fix that:
        //  - a per-family stride, so the small square and the rectangular/medium widget
        //    never mirror each other; and
        //  - a random per-timeline salt, so even two widgets of the SAME family draw
        //    different entries from the published queue (each instance gets its own
        //    getTimeline call, hence its own roll).
        // The salt re-rolls when a timeline is rebuilt (app open / .atEnd), which trades
        // the old exact phase-lock with notifications for variety — with 2+ widgets a
        // single shared phase was impossible anyway. Within one timeline the salt is
        // FIXED, so a lone widget still advances one word per step (never stuck).
        let familyOffset: Int
        switch context.family {
        case .systemSmall: familyOffset = 0
        case .systemMedium: familyOffset = 7
        case .accessoryRectangular: familyOffset = 13
        case .accessoryInline: familyOffset = 19
        default: familyOffset = 23
        }
        let instanceSalt = words.count > 1 ? Int.random(in: 0..<words.count) : 0
        var entries: [VortoEntry] = []
        var cursor = Date()
        // Advance one word per step, indexed from the app's anchor so refreshes
        // CONTINUE the shared stream (never restart, never repeat within a horizon).
        // Generate a LONG horizon of entries (each a distinct word, advancing one per
        // step) so that even if iOS starves the timeline reload budget, the widget keeps
        // rotating for days instead of freezing on the last entry. 48 × step = ~4+ days.
        var produced = 0
        while produced < 48 {
            let base = max(0, Int(cursor.timeIntervalSince(anchor) / stepSecs))
            entries.append(VortoEntry(date: cursor, item: words[(base + familyOffset + instanceSalt) % words.count]))
            produced += 1
            cursor = cal.date(byAdding: .hour, value: step, to: cursor)!
        }
        completion(Timeline(entries: entries, policy: .atEnd))
    }
}

// MARK: - Views

extension Color {
    init(_ hex: UInt) {
        self.init(.sRGB,
                  red: Double((hex >> 16) & 0xff) / 255,
                  green: Double((hex >> 8) & 0xff) / 255,
                  blue: Double(hex & 0xff) / 255,
                  opacity: 1)
    }
}

struct VortoWidgetEntryView: View {
    var entry: Provider.Entry
    @Environment(\.widgetFamily) var family

    var body: some View {
        // Tapping the widget opens the For-You FEED scrolled to the exact word shown
        // (vorto://feed/<id> → app/feed/[id].tsx hands off to the scrollable feed), so
        // you land on that word and can keep scrolling — not the static detail screen.
        content.widgetURL(entry.item.id.flatMap { URL(string: "vorto://feed/\($0)") })
    }

    @ViewBuilder var content: some View {
        switch family {
        case .accessoryRectangular:
            VStack(alignment: .center, spacing: 3) {
                Text(entry.item.word)
                    .font(.system(.headline, design: .serif))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Text(entry.item.def)
                    .font(.system(size: 14, weight: .medium))
                    .lineLimit(3)
                    .minimumScaleFactor(0.7)   // floor raised 0.4→0.7: a 0.4 floor let long meanings shrink to hairline; better to clip than be unreadable
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity, alignment: .center)
        case .accessoryInline:
            Text("\(entry.item.word) — \(entry.item.def)")
        default:
            // Just the word and its definition, centered - no brand label, no IPA.
            // Sizing/contrast tuned to match the reference app: a heavy word and a
            // LARGE, high-contrast definition that fills the tile (the old size-15
            // muted-tan def read tiny and faint next to competitors).
            // Owner 2026-09-25: the small box was UNREADABLE and the medium truncated. Root cause:
            // minimumScaleFactor(0.5) let long definitions shrink to ~7-9px in a small tile. Fix:
            // a smaller headword to free vertical room + a READABILITY FLOOR (minScale 0.75) so text
            // never drops below legible — a very long meaning clips gracefully rather than going
            // microscopic. Medium's example trimmed to one line so it stops stealing the def's space.
            VStack(spacing: family == .systemSmall ? 6 : 9) {
                Text(entry.item.word)
                    .font(.system(family == .systemSmall ? .title3 : .title, design: .serif).weight(.semibold))
                    .foregroundColor(Color(0xF3ECDE))
                    .minimumScaleFactor(0.6).lineLimit(1)
                // Owner 2026-09-26: the definition still read thin/faint on device. It must
                // NEVER render hairline: semibold weight, full-contrast bone (the same
                // 0xF3ECDE the headword uses — no washed-out secondary tint), and a high
                // scale floor so shrink-to-fit can't thin it back down (worst case
                // 15 × 0.85 ≈ 12.75pt on the small square).
                Text("(\(entry.item.pos)) \(entry.item.def)")
                    .font(.system(size: family == .systemSmall ? 15 : 18, weight: .semibold))
                    .foregroundColor(Color(0xF3ECDE))   // full contrast, matches the headword
                    // Owner 2026-09-30: the definition was STILL clipping with "…" on device (e.g.
                    // "démarche — A formal diplomatic representation of one governmen…"). The old
                    // 4-line + 0.85 floor couldn't fit a long meaning, so it truncated. Priority is
                    // now COMPLETENESS over the high floor: more lines + a lower floor so the whole
                    // definition renders (slightly smaller when long) instead of being cut off.
                    .lineLimit(family == .systemSmall ? 7 : 6)
                    .minimumScaleFactor(family == .systemSmall ? 0.55 : 0.65)
                // Context/example line — a SMALLER italic serif so it reads as a quote
                // distinct from the definition (feedback #13). Medium/large only, one line.
                if family != .systemSmall, let ex = entry.item.ex, !ex.isEmpty {
                    Text("“\(ex)”")
                        .font(.system(size: 12, design: .serif).italic())
                        .foregroundColor(Color(0xB4AB97))
                        .lineLimit(1)
                        .minimumScaleFactor(0.9)
                }
            }
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
            .padding(family == .systemSmall ? 10 : 16)
            .containerBackground(for: .widget) { Color(0x100E0B) }
        }
    }
}

struct VortoWidget: Widget {
    let kind = "VortoWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            VortoWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Lexfall — word of the moment")
        .description("A fresh advanced word through your day.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryInline])
    }
}

// MARK: - Streak widgets (daily-test launcher, week strip, month calendar)
// These render the APP-OPEN streak the app publishes to the App Group (streakCount + streakLastDate
// + streakDays), the ONE user-facing streak — consecutive calendar days the app was opened — so the
// widget flame matches the in-app number (feed pop-up / Progress). The week strip + month calendar
// mark done-days from `streakDays` (the real opened-days ISO set), so they light exactly the days
// that were opened rather than back-deriving from count+lastDate (which can't honour a real gap).
// `dailyDoneToday` is a SEPARATE signal: whether today's DAILY TEST is done (the launcher's tap
// target), NOT app-open (which is always true while the app runs).

// ISO yyyy-MM-dd formatter, matching lib/streak.ts's day keys (local time zone).
let ISO_DAY_FMT: DateFormatter = {
    let f = DateFormatter()
    f.dateFormat = "yyyy-MM-dd"
    f.timeZone = TimeZone.current
    return f
}()

func streakInfo() -> (count: Int, lastDate: Date?, doneToday: Bool, days: Set<String>) {
    let d = UserDefaults(suiteName: APP_GROUP)
    let count = d?.integer(forKey: "streakCount") ?? 0
    let doneToday = (d?.integer(forKey: "dailyDoneToday") ?? 0) == 1
    var last: Date? = nil
    if let s = d?.string(forKey: "streakLastDate"), !s.isEmpty {
        last = ISO_DAY_FMT.date(from: s)
    }
    // The truthful opened-days set (ISO yyyy-mm-dd strings). Empty when the app hasn't published it
    // yet (older binaries) — the views fall back to the count+lastDate derivation in that case.
    var days: Set<String> = []
    if let raw = d?.string(forKey: "streakDays"),
       let data = raw.data(using: .utf8),
       let arr = try? JSONDecoder().decode([String].self, from: data) {
        days = Set(arr)
    }
    return (count, last, doneToday, days)
}

// Whether a given calendar day should render as "done". Prefers the real opened-days set; falls back
// to the count+lastDate window only when the set is unavailable (older payloads with no streakDays).
func isDoneDay(_ day: Date, days: Set<String>, count: Int, lastDate: Date?) -> Bool {
    if !days.isEmpty { return days.contains(ISO_DAY_FMT.string(from: day)) }
    return isStreakDay(day, count: count, lastDate: lastDate)
}

func isStreakDay(_ day: Date, count: Int, lastDate: Date?) -> Bool {
    guard let last = lastDate, count > 0 else { return false }
    let cal = Calendar.current
    let d0 = cal.startOfDay(for: day)
    let l0 = cal.startOfDay(for: last)
    guard let diff = cal.dateComponents([.day], from: d0, to: l0).day else { return false }
    return diff >= 0 && diff < count
}

func dayLetter(_ d: Date) -> String { let f = DateFormatter(); f.dateFormat = "EEEEE"; return f.string(from: d) }
func monthName() -> String { let f = DateFormatter(); f.dateFormat = "MMMM"; return f.string(from: Date()) }

struct StreakEntry: TimelineEntry {
    let date: Date
    let count: Int
    let lastDate: Date?
    let doneToday: Bool
    let days: Set<String>   // real opened-days ISO set (empty on older payloads)
}

struct StreakProvider: TimelineProvider {
    func placeholder(in context: Context) -> StreakEntry { StreakEntry(date: Date(), count: 0, lastDate: nil, doneToday: false, days: []) }
    func getSnapshot(in context: Context, completion: @escaping (StreakEntry) -> Void) {
        let s = streakInfo()
        completion(StreakEntry(date: Date(), count: s.count, lastDate: s.lastDate, doneToday: s.doneToday, days: s.days))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<StreakEntry>) -> Void) {
        let s = streakInfo()
        let entry = StreakEntry(date: Date(), count: s.count, lastDate: s.lastDate, doneToday: s.doneToday, days: s.days)
        let cal = Calendar.current
        let next = cal.nextDate(after: Date(), matching: DateComponents(hour: 0, minute: 1), matchingPolicy: .nextTime) ?? Date().addingTimeInterval(3600)
        completion(Timeline(entries: [entry], policy: .after(next)))
    }
}

struct StreakLauncherView: View {
    var entry: StreakEntry
    var body: some View {
        VStack(spacing: 5) {
            Image(systemName: "flame.fill").font(.system(size: 22)).foregroundColor(Color(0xC6A85C))
            Text("\(entry.count)").font(.system(size: 40, design: .serif).weight(.semibold)).foregroundColor(Color(0xF3ECDE))
            Text("day streak").font(.system(size: 12, weight: .medium)).foregroundColor(Color(0xE4DBC8))
            Text(entry.doneToday ? "Done today" : "Tap to practise").font(.system(size: 11)).foregroundColor(Color(0xB4AB97))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .containerBackground(for: .widget) { Color(0x100E0B) }
        .widgetURL(URL(string: "vorto:///daily-test"))
    }
}

struct WeekStreakView: View {
    var entry: StreakEntry
    private var weekDays: [Date] {
        let cal = Calendar.current
        let today = cal.startOfDay(for: Date())
        let weekday = cal.component(.weekday, from: today)
        let start = cal.date(byAdding: .day, value: -(weekday - 1), to: today)!
        return (0..<7).map { cal.date(byAdding: .day, value: $0, to: start)! }
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Image(systemName: "flame.fill").font(.system(size: 15)).foregroundColor(Color(0xC6A85C))
                Text("\(entry.count)").font(.system(size: 20, design: .serif).weight(.semibold)).foregroundColor(Color(0xF3ECDE))
                Text("day streak").font(.system(size: 13, weight: .medium)).foregroundColor(Color(0xE4DBC8))
                Spacer()
            }
            HStack(spacing: 0) {
                ForEach(weekDays, id: \.self) { day in
                    let done = isDoneDay(day, days: entry.days, count: entry.count, lastDate: entry.lastDate)
                    let isToday = Calendar.current.isDateInToday(day)
                    VStack(spacing: 5) {
                        Text(dayLetter(day)).font(.system(size: 10, weight: .semibold)).foregroundColor(Color(0xB4AB97))
                        ZStack {
                            Circle().fill(done ? Color(0xC6A85C) : Color(0x2A2620))
                            if isToday && !done { Circle().stroke(Color(0xC6A85C), lineWidth: 1.4) }
                            if done { Image(systemName: "flame.fill").font(.system(size: 11)).foregroundColor(Color(0x100E0B)) }
                        }
                        .frame(width: 24, height: 24)
                    }
                    .frame(maxWidth: .infinity)
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .containerBackground(for: .widget) { Color(0x100E0B) }
        .widgetURL(URL(string: "vorto:///daily-test"))
    }
}

struct MonthStreakView: View {
    var entry: StreakEntry
    private var monthGrid: [Date?] {
        let cal = Calendar.current
        let comps = cal.dateComponents([.year, .month], from: Date())
        let firstOfMonth = cal.date(from: comps)!
        let range = cal.range(of: .day, in: .month, for: firstOfMonth)!
        let firstWeekday = cal.component(.weekday, from: firstOfMonth)
        var cells: [Date?] = Array(repeating: nil, count: firstWeekday - 1)
        for day in range { cells.append(cal.date(byAdding: .day, value: day - 1, to: firstOfMonth)!) }
        return cells
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: "flame.fill").font(.system(size: 14)).foregroundColor(Color(0xC6A85C))
                Text("\(entry.count)").font(.system(size: 18, design: .serif).weight(.semibold)).foregroundColor(Color(0xF3ECDE))
                Text("day streak").font(.system(size: 12, weight: .medium)).foregroundColor(Color(0xE4DBC8))
                Spacer()
                Text(monthName()).font(.system(size: 12, weight: .medium)).foregroundColor(Color(0xB4AB97))
            }
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 3), count: 7), spacing: 4) {
                ForEach(0..<monthGrid.count, id: \.self) { i in
                    if let day = monthGrid[i] {
                        let done = isDoneDay(day, days: entry.days, count: entry.count, lastDate: entry.lastDate)
                        let isToday = Calendar.current.isDateInToday(day)
                        ZStack {
                            Circle().fill(done ? Color(0xC6A85C) : Color(0x211D16))
                            if isToday && !done { Circle().stroke(Color(0xC6A85C), lineWidth: 1) }
                            Text("\(Calendar.current.component(.day, from: day))")
                                .font(.system(size: 9))
                                .foregroundColor(done ? Color(0x100E0B) : Color(0x8A8272))
                        }
                        .frame(height: 20)
                    } else {
                        Color.clear.frame(height: 20)
                    }
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .containerBackground(for: .widget) { Color(0x100E0B) }
        .widgetURL(URL(string: "vorto:///daily-test"))
    }
}

struct StreakLauncherWidget: Widget {
    let kind = "LexfallStreakLauncher"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: StreakProvider()) { entry in
            StreakLauncherView(entry: entry)
        }
        .configurationDisplayName("Lexfall — daily test")
        .description("Your streak, and a tap to start today's test.")
        .supportedFamilies([.systemSmall])
    }
}

struct WeekStreakWidget: Widget {
    let kind = "LexfallWeekStreak"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: StreakProvider()) { entry in
            WeekStreakView(entry: entry)
        }
        .configurationDisplayName("Lexfall — this week")
        .description("Your streak across the week.")
        .supportedFamilies([.systemMedium])
    }
}

struct MonthStreakWidget: Widget {
    let kind = "LexfallMonthStreak"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: StreakProvider()) { entry in
            MonthStreakView(entry: entry)
        }
        .configurationDisplayName("Lexfall — this month")
        .description("A calendar of your streak this month.")
        .supportedFamilies([.systemMedium, .systemLarge])
    }
}

@main
struct LexfallWidgetBundle: WidgetBundle {
    var body: some Widget {
        VortoWidget()
        StreakLauncherWidget()
        WeekStreakWidget()
        MonthStreakWidget()
    }
}
