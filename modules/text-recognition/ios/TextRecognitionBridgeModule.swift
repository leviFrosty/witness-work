import ExpoModulesCore
import ImageIO
import UIKit
import Vision
import VisionKit

struct RecognizeOptions: Record {
  /// BCP-47 languages to favor, app language first. Unsupported ones are dropped.
  @Field var languages: [String] = []
}

/**
 * On-device text recognition for Scribe AI photo imports (ADR 0018). Vision's
 * accurate recognizer reads printed text and handwriting; the VisionKit
 * document camera finds page edges and flattens them first. Images are read in
 * memory: scans are never written to disk, and nothing is sent anywhere.
 *
 * Returns raw lines with normalized, top-left-origin boxes. JS turns them into
 * editable text (`layoutRecognizedText`), so the layout rules stay testable and
 * shared with any future Android recognizer.
 */
public class TextRecognitionBridgeModule: Module {
  private var scanner: DocumentScanner?

  public func definition() -> ModuleDefinition {
    Name("TextRecognition")

    // JS checks this so OTA updates never call into a binary without the module.
    Constant("textRecognitionVersion") {
      1
    }

    Function("isDocumentScannerSupported") {
      VNDocumentCameraViewController.isSupported
    }

    AsyncFunction("recognizeImage") {
      (uri: String, options: RecognizeOptions) async throws -> [String: Any] in
      guard let url = URL(string: uri), url.isFileURL,
        let source = CGImageSourceCreateWithURL(url as CFURL, nil),
        let image = CGImageSourceCreateImageAtIndex(source, 0, nil)
      else {
        throw Exception(
          name: "TextRecognitionUnreadable", description: "The image couldn't be read",
          code: "ERR_TEXT_RECOGNITION_UNREADABLE")
      }
      let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any]
      let orientation = (properties?[kCGImagePropertyOrientation] as? UInt32)
        .flatMap(CGImagePropertyOrientation.init(rawValue:)) ?? .up
      return try await Recognizer.recognize(image, orientation: orientation, languages: options.languages)
    }

    // Resolves recognized pages, or null when the user cancels the camera.
    AsyncFunction("scanDocument") { (options: RecognizeOptions, promise: Promise) in
      guard VNDocumentCameraViewController.isSupported,
        let presenter = self.appContext?.utilities?.currentViewController()
      else {
        promise.reject(
          Exception(
            name: "DocumentScannerUnavailable", description: "The document camera is unavailable",
            code: "ERR_DOCUMENT_SCANNER_UNAVAILABLE"))
        return
      }
      let scanner = DocumentScanner(languages: options.languages) { [weak self] result in
        self?.scanner = nil
        switch result {
        case .success(let pages?): promise.resolve(["pages": pages])
        case .success(nil): promise.resolve(nil as Any?)
        case .failure(let error): promise.reject(error)
        }
      }
      self.scanner = scanner
      scanner.present(from: presenter)
    }.runOnQueue(.main)
  }
}

enum Recognizer {
  static func recognize(
    _ image: CGImage, orientation: CGImagePropertyOrientation, languages: [String]
  ) async throws -> [String: Any] {
    try await withCheckedThrowingContinuation { continuation in
      DispatchQueue.global(qos: .userInitiated).async {
        do {
          continuation.resume(
            returning: try recognizeSync(image, orientation: orientation, languages: languages))
        } catch {
          continuation.resume(throwing: error)
        }
      }
    }
  }

  static func recognizeSync(
    _ image: CGImage, orientation: CGImagePropertyOrientation, languages: [String]
  ) throws -> [String: Any] {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    request.automaticallyDetectsLanguage = true
    if let supported = try? request.supportedRecognitionLanguages() {
      let preferred = languages.compactMap { language in
        supported.first { $0.caseInsensitiveCompare(language) == .orderedSame }
          ?? supported.first { $0.lowercased().hasPrefix(language.prefix(2).lowercased()) }
      }
      if !preferred.isEmpty { request.recognitionLanguages = preferred }
    }

    let handler = VNImageRequestHandler(cgImage: image, orientation: orientation)
    try handler.perform([request])

    let lines: [[String: Any]] = (request.results ?? []).compactMap { observation in
      guard let candidate = observation.topCandidates(1).first else { return nil }
      let box = observation.boundingBox
      return [
        "text": candidate.string,
        "confidence": candidate.confidence,
        "x": box.minX,
        // Vision's origin is bottom-left; JS expects top-left.
        "y": 1 - box.maxY,
        "width": box.width,
        "height": box.height,
      ]
    }
    return ["lines": lines]
  }
}

/// Presents the VisionKit document camera and recognizes each captured page.
private final class DocumentScanner: NSObject, VNDocumentCameraViewControllerDelegate {
  private let languages: [String]
  private let completion: (Result<[[String: Any]]?, Error>) -> Void
  private var finished = false

  init(languages: [String], completion: @escaping (Result<[[String: Any]]?, Error>) -> Void) {
    self.languages = languages
    self.completion = completion
  }

  func present(from presenter: UIViewController) {
    let camera = VNDocumentCameraViewController()
    camera.delegate = self
    presenter.present(camera, animated: true)
  }

  func documentCameraViewController(
    _ controller: VNDocumentCameraViewController, didFinishWith scan: VNDocumentCameraScan
  ) {
    let pages = (0..<scan.pageCount).compactMap { index -> (CGImage, CGImagePropertyOrientation)? in
      let image = scan.imageOfPage(at: index)
      guard let cgImage = image.cgImage else { return nil }
      return (cgImage, CGImagePropertyOrientation(image.imageOrientation))
    }
    controller.dismiss(animated: true)
    let languages = languages
    Task {
      do {
        var recognized: [[String: Any]] = []
        for (page, orientation) in pages {
          recognized.append(
            try await Recognizer.recognize(page, orientation: orientation, languages: languages))
        }
        let result = recognized
        await MainActor.run { self.finish(.success(result)) }
      } catch {
        await MainActor.run { self.finish(.failure(error)) }
      }
    }
  }

  func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) {
    controller.dismiss(animated: true)
    finish(.success(nil))
  }

  func documentCameraViewController(
    _ controller: VNDocumentCameraViewController, didFailWithError error: Error
  ) {
    controller.dismiss(animated: true)
    finish(.failure(error))
  }

  private func finish(_ result: Result<[[String: Any]]?, Error>) {
    guard !finished else { return }
    finished = true
    completion(result)
  }
}

extension CGImagePropertyOrientation {
  init(_ orientation: UIImage.Orientation) {
    switch orientation {
    case .up: self = .up
    case .upMirrored: self = .upMirrored
    case .down: self = .down
    case .downMirrored: self = .downMirrored
    case .left: self = .left
    case .leftMirrored: self = .leftMirrored
    case .right: self = .right
    case .rightMirrored: self = .rightMirrored
    @unknown default: self = .up
    }
  }
}
