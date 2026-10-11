// Decode every frame of an MP4 to lossless PNG (AVAssetReader, sequential, no re-timing): vextract <in.mp4> <outdir>
import AVFoundation
import CoreImage
import ImageIO
import UniformTypeIdentifiers
let url = URL(fileURLWithPath: CommandLine.arguments[1]); let out = CommandLine.arguments[2]
try? FileManager.default.createDirectory(atPath: out, withIntermediateDirectories: true)
let asset = AVURLAsset(url: url)
let sem = DispatchSemaphore(value: 0)
Task {
  let t = try await asset.loadTracks(withMediaType: .video)[0]
  let reader = try AVAssetReader(asset: asset)
  let o = AVAssetReaderTrackOutput(track: t, outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
  reader.add(o); reader.startReading()
  let ctx = CIContext(options: [.workingColorSpace: NSNull(), .outputColorSpace: NSNull()])
  let cs = CGColorSpace(name: CGColorSpace.sRGB)!
  var n = 0; var times: [String] = []
  while let sb = o.copyNextSampleBuffer() {
    guard let pb = CMSampleBufferGetImageBuffer(sb) else { continue }
    let ci = CIImage(cvPixelBuffer: pb)
    guard let cg = ctx.createCGImage(ci, from: ci.extent, format: .RGBA8, colorSpace: cs) else { continue }
    let p = String(format: "%@/f%04d.png", out, n)
    let d = CGImageDestinationCreateWithURL(URL(fileURLWithPath: p) as CFURL, UTType.png.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(d, cg, nil); CGImageDestinationFinalize(d)
    times.append(String(format: "%d %.5f", n, CMSampleBufferGetPresentationTimeStamp(sb).seconds)); n += 1
  }
  try times.joined(separator: "\n").write(toFile: out + "/times.txt", atomically: true, encoding: .utf8)
  print("frames", n)
  sem.signal()
}
sem.wait()
