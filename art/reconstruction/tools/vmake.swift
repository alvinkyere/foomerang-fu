// Encode a numbered PNG sequence to H.264 MP4: vmake <dir> <startIndex> <endIndex> <out.mp4> <fps>   (files: <dir>/s%04d.png)
import AVFoundation
import CoreGraphics
import ImageIO
let a = CommandLine.arguments
let dir = a[1], s0 = Int(a[2])!, s1 = Int(a[3])!, outPath = a[4], fps = Int32(a[5])!
func load(_ i: Int) -> CGImage? {
  let url = URL(fileURLWithPath: String(format: "%@/s%04d.png", dir, i)) as CFURL
  guard let src = CGImageSourceCreateWithURL(url, nil) else { return nil }
  return CGImageSourceCreateImageAtIndex(src, 0, nil)
}
guard let first = load(s0) else { print("no first frame"); exit(1) }
let W = first.width, H = first.height
try? FileManager.default.removeItem(atPath: outPath)
let w = try AVAssetWriter(outputURL: URL(fileURLWithPath: outPath), fileType: .mp4)
let input = AVAssetWriterInput(mediaType: .video, outputSettings: [AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: W, AVVideoHeightKey: H,
  AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 16_000_000, AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel]])
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA, kCVPixelBufferWidthKey as String: W, kCVPixelBufferHeightKey as String: H])
w.add(input); w.startWriting(); w.startSession(atSourceTime: .zero)
for i in s0...s1 {
  guard let img = load(i) else { continue }
  while !input.isReadyForMoreMediaData { Thread.sleep(forTimeInterval: 0.005) }
  var pb: CVPixelBuffer?; CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &pb)
  CVPixelBufferLockBaseAddress(pb!, [])
  let ctx = CGContext(data: CVPixelBufferGetBaseAddress(pb!), width: W, height: H, bitsPerComponent: 8, bytesPerRow: CVPixelBufferGetBytesPerRow(pb!), space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)!
  ctx.draw(img, in: CGRect(x: 0, y: 0, width: W, height: H)); CVPixelBufferUnlockBaseAddress(pb!, [])
  adaptor.append(pb!, withPresentationTime: CMTime(value: Int64(i - s0), timescale: fps))
}
input.markAsFinished(); let sem = DispatchSemaphore(value: 0); w.finishWriting { sem.signal() }; sem.wait(); print("wrote", outPath, w.status.rawValue)
