import AVFoundation
let url = URL(fileURLWithPath: CommandLine.arguments[1])
let asset = AVURLAsset(url: url)
let sem = DispatchSemaphore(value: 0)
Task {
  let tracks = try await asset.loadTracks(withMediaType: .video)
  let t = tracks[0]
  let size = try await t.load(.naturalSize)
  let fps = try await t.load(.nominalFrameRate)
  let dur = try await asset.load(.duration)
  let tr = try await t.load(.preferredTransform)
  let minDur = try await t.load(.minFrameDuration)
  print("size \(size.width)x\(size.height) fps \(fps) duration \(dur.seconds) minFrameDur \(minDur.seconds) transform \(tr)")
  sem.signal()
}
sem.wait()
