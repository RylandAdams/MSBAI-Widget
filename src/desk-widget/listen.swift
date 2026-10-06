// listen.swift — the widget's microphone. Built once into "MSBAI Listen.app" by voice.sh, so macOS
// asks for microphone and speech recognition permission for this little app (Übersicht itself
// cannot hold those permissions).
//
// It listens on the default input device, transcribes with Apple's speech recognizer (on device
// when the Mac supports it), writes the words so far to <dir>/partial as they come, and stops on
// whichever comes first: 1.6 s of silence after speech, a "stop" file appearing in <dir>, or 30 s.
// The final text goes to <dir>/final (empty when nothing was heard); errors go to <dir>/error.
//
//   open -n "MSBAI Listen.app" --args <dir>

import AVFoundation
import Foundation
import Speech

let dir = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : NSTemporaryDirectory()
func write(_ name: String, _ text: String) {
    try? text.write(toFile: (dir as NSString).appendingPathComponent(name), atomically: true, encoding: .utf8)
}
func finish(_ text: String, error: String? = nil) {
    if let e = error { write("error", e) }
    write("final", text)
    exit(0)
}

let engine = AVAudioEngine()
let request = SFSpeechAudioBufferRecognitionRequest()
request.shouldReportPartialResults = true
var best = ""
var lastChange = Date()
var heard = false
var stopping = false
let started = Date()

func begin() {
    guard let rec = SFSpeechRecognizer(locale: Locale(identifier: "en-US")), rec.isAvailable else {
        finish("", error: "speech recognition is not available"); return
    }
    // Apple picks on device or server; forcing on device fails outright when its model is missing.
    let input = engine.inputNode
    let format = input.outputFormat(forBus: 0)
    if format.sampleRate == 0 || format.channelCount == 0 {
        finish("", error: "no microphone input: check System Settings > Sound > Input"); return
    }
    input.installTap(onBus: 0, bufferSize: 1024, format: format) { buf, _ in request.append(buf) }
    engine.prepare()
    do { try engine.start() } catch { finish("", error: "the microphone did not start: \(error.localizedDescription)"); return }
    write("listening", "1")
    rec.recognitionTask(with: request) { result, err in
        if let r = result {
            let t = r.bestTranscription.formattedString
            if t != best { best = t; lastChange = Date(); heard = true; write("partial", t) }
            if r.isFinal { finish(best) }
        } else if let e = err, !heard {
            finish("", error: "speech recognition stopped: \(e.localizedDescription)")
        }
    }
    Timer.scheduledTimer(withTimeInterval: 0.2, repeats: true) { _ in
        let stopFile = (dir as NSString).appendingPathComponent("stop")
        let quiet = heard && Date().timeIntervalSince(lastChange) > 1.6
        if !stopping && (quiet || FileManager.default.fileExists(atPath: stopFile) || Date().timeIntervalSince(started) > 30) {
            stopping = true
            engine.stop(); engine.inputNode.removeTap(onBus: 0); request.endAudio()
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { finish(best) }
        }
    }
}

SFSpeechRecognizer.requestAuthorization { status in
    DispatchQueue.main.async {
        guard status == .authorized else { finish("", error: "speech recognition permission is off: System Settings > Privacy & Security > Speech Recognition"); return }
        AVCaptureDevice.requestAccess(for: .audio) { ok in
            DispatchQueue.main.async {
                if ok { begin() } else { finish("", error: "microphone permission is off: System Settings > Privacy & Security > Microphone") }
            }
        }
    }
}
RunLoop.main.run()
