#!/usr/bin/env swift

import AppKit
import Foundation
import PDFKit
import Vision

struct PageResult: Codable {
    let page: Int
    let method: String
    let text: String
}

func emit(_ result: PageResult, encoder: JSONEncoder) {
    if let data = try? encoder.encode(result) {
        FileHandle.standardOutput.write(data)
        FileHandle.standardOutput.write(Data("\n".utf8))
    }
}

func normalized(_ text: String) -> String {
    text
        .replacingOccurrences(of: "\u{00a0}", with: " ")
        .replacingOccurrences(of: "[ \\t]+", with: " ", options: .regularExpression)
        .replacingOccurrences(of: "\\n{3,}", with: "\n\n", options: .regularExpression)
        .trimmingCharacters(in: .whitespacesAndNewlines)
}

func option(_ name: String) -> String? {
    let prefix = "--\(name)="
    return CommandLine.arguments.first(where: { $0.hasPrefix(prefix) }).map { String($0.dropFirst(prefix.count)) }
}

func recognize(_ image: NSImage) throws -> String {
    var proposed = NSRect(origin: .zero, size: image.size)
    guard let cgImage = image.cgImage(forProposedRect: &proposed, context: nil, hints: nil) else {
        return ""
    }

    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    request.recognitionLanguages = ["ko-KR", "en-US"]
    try VNImageRequestHandler(cgImage: cgImage, options: [:]).perform([request])

    let observations = (request.results ?? []).sorted {
        if abs($0.boundingBox.maxY - $1.boundingBox.maxY) > 0.012 {
            return $0.boundingBox.maxY > $1.boundingBox.maxY
        }
        return $0.boundingBox.minX < $1.boundingBox.minX
    }
    return normalized(observations.compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\n"))
}

func recognize(_ url: URL) throws -> String {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    request.recognitionLanguages = ["ko-KR", "en-US"]
    try VNImageRequestHandler(url: url, options: [:]).perform([request])
    let observations = (request.results ?? []).sorted {
        if abs($0.boundingBox.maxY - $1.boundingBox.maxY) > 0.012 {
            return $0.boundingBox.maxY > $1.boundingBox.maxY
        }
        return $0.boundingBox.minX < $1.boundingBox.minX
    }
    return normalized(observations.compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\n"))
}

guard CommandLine.arguments.count >= 2 else {
    FileHandle.standardError.write(Data("usage: ocr-pdf-macos.swift PDF [--pages=0,1] [--threshold=80]\n".utf8))
    exit(2)
}

let path = CommandLine.arguments[1]
let threshold = Int(option("threshold") ?? "80") ?? 80
let encoder = JSONEncoder()
var isDirectory: ObjCBool = false
if FileManager.default.fileExists(atPath: path, isDirectory: &isDirectory), isDirectory.boolValue {
    let urls = try FileManager.default.contentsOfDirectory(
        at: URL(fileURLWithPath: path),
        includingPropertiesForKeys: nil
    ).filter { ["png", "jpg", "jpeg", "tif", "tiff"].contains($0.pathExtension.lowercased()) }
        .sorted { $0.lastPathComponent < $1.lastPathComponent }
    for (index, url) in urls.enumerated() {
        let number = Int(url.deletingPathExtension().lastPathComponent.replacingOccurrences(of: "page-", with: "")) ?? (index + 1)
        do {
            emit(PageResult(page: number, method: "vision-ocr", text: try recognize(url)), encoder: encoder)
        } catch {
            FileHandle.standardError.write(Data("Vision OCR failed for \(url.lastPathComponent): \(error)\n".utf8))
            emit(PageResult(page: number, method: "vision-ocr", text: ""), encoder: encoder)
        }
    }
    exit(0)
}

guard let document = PDFDocument(url: URL(fileURLWithPath: path)) else {
    FileHandle.standardError.write(Data("Could not open PDF: \(path)\n".utf8))
    exit(3)
}

let requestedPages: [Int]
if let rawPages = option("pages") {
    requestedPages = rawPages.split(separator: ",").compactMap { Int($0) }.filter { $0 >= 0 && $0 < document.pageCount }
} else {
    requestedPages = Array(0..<document.pageCount)
}

for index in requestedPages {
    autoreleasepool {
        guard let page = document.page(at: index) else { return }
        let native = normalized(page.string ?? "")
        let method: String
        let text: String
        if native.count >= threshold {
            method = "native"
            text = native
        } else {
            method = "vision-ocr"
            let bounds = page.bounds(for: .cropBox)
            let width: CGFloat = 1800
            let height = max(1, width * bounds.height / max(bounds.width, 1))
            text = (try? recognize(page.thumbnail(of: NSSize(width: width, height: height), for: .cropBox))) ?? native
        }
        emit(PageResult(page: index + 1, method: method, text: text), encoder: encoder)
    }
}
