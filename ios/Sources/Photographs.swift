import SwiftUI
import UIKit

/*
 Holding photographs, and fetching the next one before it is asked for.

 `AsyncImage` is the obvious thing and it is wrong here for three separate
 reasons, none of which show up until somebody actually scrolls.

 It starts downloading when the view appears. On a paging scroll that means
 the download begins at the moment the day arrives on screen, so every day
 is blank for as long as its photograph takes — which on a phone is the whole
 experience.

 It caches by URL, and these URLs are signed and expire. A fresh signature is
 minted every time the archive is read, so the same photograph has a
 different URL on every load and the HTTP cache never hits. Scrolling back to
 a day you looked at ten seconds ago downloads it again. That is the one that
 would have been invisible: it works perfectly on a fast connection and is
 miserable on a train.

 And it has no idea what a rendition is. See `forThisScreen` below.

 So: cached by asset id rather than by URL, deduplicated so two views asking
 for the same photograph make one request, and prefetched a couple of days
 ahead of wherever the reader is.
 */

actor Photographs {
    static let shared = Photographs()

    /* Bounded by cost rather than count, because a photograph is not a
       photograph — a thumbnail and a large differ by two orders of magnitude
       and counting them the same way means either holding six of the big
       ones or six thousand of the small. 96 MB is roughly forty phone-sized
       renditions and is well inside what iOS will tolerate before it starts
       asking for memory back. */
    private let cache: NSCache<NSString, UIImage> = {
        let cache = NSCache<NSString, UIImage>()
        cache.totalCostLimit = 96 * 1024 * 1024
        return cache
    }()

    /// In-flight requests, so two views arriving at the same photograph in
    /// the same frame make one request between them rather than two.
    private var loading: [String: Task<UIImage?, Never>] = [:]

    func cached(_ assetId: String) -> UIImage? {
        cache.object(forKey: assetId as NSString)
    }

    func image(for assetId: String, at url: URL) async -> UIImage? {
        if let held = cache.object(forKey: assetId as NSString) { return held }

        if let already = loading[assetId] { return await already.value }

        let task = Task<UIImage?, Never> {
            /* A file URL has no HTTP response to check, and `URLSession` is
               unreliable with them — it is a networking stack being asked to
               read a disk. Read it directly instead. The design harness
               serves its fixtures this way, and the check costs nothing. */
            if url.isFileURL {
                guard let data = try? Data(contentsOf: url) else { return nil }
                return UIImage(data: data)
            }

            guard let (data, response) = try? await URLSession.shared.data(from: url),
                  let http = response as? HTTPURLResponse,
                  (200..<300).contains(http.statusCode),
                  let image = UIImage(data: data)
            else { return nil }
            return image
        }

        loading[assetId] = task
        let image = await task.value
        loading[assetId] = nil

        if let image {
            cache.setObject(image, forKey: assetId as NSString, cost: data(of: image))
        }
        return image
    }

    /// Start fetching, and do not wait. Called for the days on either side of
    /// wherever the reader is, so the next photograph is usually already held
    /// by the time the gesture that reveals it finishes.
    func prefetch(_ wanted: [(assetId: String, url: URL)]) {
        for item in wanted where cache.object(forKey: item.assetId as NSString) == nil {
            guard loading[item.assetId] == nil else { continue }
            Task { _ = await image(for: item.assetId, at: item.url) }
        }
    }

    private func data(of image: UIImage) -> Int {
        guard let cg = image.cgImage else { return 1 }
        return cg.bytesPerRow * cg.height
    }
}

extension ResolvedPhoto {
    /**
     The rendition worth fetching on a phone.

     `medium` first, and that is the correction rather than a preference:
     `large` is 2400px on its long edge, for a desktop browser, and asking a
     phone to download it is roughly three times the bytes for pixels the
     screen cannot show. On this archive's own photographs that is 1.3 MB
     against 425 kB, per day, over mobile data.

     `large` remains the fallback for a photograph resized before `medium`
     existed, and `original` behind that for one recorded moments ago whose
     renditions do not exist yet — which is only ever the owner's own, since
     nobody else is given an original at all.
     */
    var forThisScreen: URL? {
        urls[.medium] ?? urls[.large] ?? urls[.thumbnail] ?? urls[.original]
    }
}
