import Foundation
import Capacitor
import UIKit
import UniformTypeIdentifiers
import Security

/// A folder in the Files app (iCloud Drive, or any file provider) for the family folder (folder.js, provider "icloud"):
/// the user picks a folder, or chooses where one is made; the app keeps a bookmark to it and lists, reads and writes it with file
/// coordination, so iCloud downloads what is asked for; sharing is the Files app's own (the share sheet's Collaborate). The person's id
/// is a random id kept in the iCloud Keychain, so it is the same on all of one person's devices. No iCloud entitlement is needed:
/// the folder is reached through the picker, not through an app container.
/// Written without Xcode at hand: build and try it on a device (MOBILE.md).
@objc(FolderPlugin)
public class FolderPlugin: CAPPlugin, CAPBridgedPlugin, UIDocumentPickerDelegate {
    public let identifier = "FolderPlugin"
    public let jsName = "Folder"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "account", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pick", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "create", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "list", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "read", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "write", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "share", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "forget", returnType: CAPPluginReturnPromise),
    ]
    private var picking: CAPPluginCall?
    private var pickFor: String?   // "pick": hand the folder back; "create:<name>": make <name> inside it
    private let defaults = UserDefaults.standard
    private let bookmarksKey = "ll.folder.bookmarks"
    private let io = DispatchQueue(label: "app.littlelog.folder", qos: .userInitiated)

    // ---- the person: an id kept in the iCloud Keychain, the same on every device of theirs ----
    @objc func account(_ call: CAPPluginCall) {
        let service = "app.littlelog.person", acct = "person"
        var query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: acct,
                                    kSecAttrSynchronizable as String: kCFBooleanTrue!, kSecReturnData as String: kCFBooleanTrue!, kSecMatchLimit as String: kSecMatchLimitOne]
        var item: CFTypeRef?
        var id = ""
        if SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess, let d = item as? Data, let s = String(data: d, encoding: .utf8) { id = s }
        if id.isEmpty {
            id = UUID().uuidString.lowercased()
            query.removeValue(forKey: kSecReturnData as String); query.removeValue(forKey: kSecMatchLimit as String)
            query[kSecValueData as String] = id.data(using: .utf8)!
            query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
            SecItemAdd(query as CFDictionary, nil)
        }
        call.resolve(["id": id, "name": ""])   // (the name is typed in the app: the device's name says nothing about the person since iOS 16)
    }

    // ---- bookmarks: the folders this app may reach, by an id of its own ----
    private func bookmarks() -> [String: Data] { (defaults.dictionary(forKey: bookmarksKey) as? [String: Data]) ?? [:] }
    private func keep(_ url: URL) throws -> String {
        let data = try url.bookmarkData(options: [], includingResourceValuesForKeys: nil, relativeTo: nil)
        var all = bookmarks(); let id = "f" + UUID().uuidString.lowercased().replacingOccurrences(of: "-", with: "").prefix(16)
        all[String(id)] = data; defaults.set(all, forKey: bookmarksKey)
        return String(id)
    }
    /// The folder's URL, with security-scoped access started: callers stop it when done.
    private func folder(_ id: String) throws -> URL {
        guard let data = bookmarks()[id] else { throw NSError(domain: "Folder", code: 404, userInfo: [NSLocalizedDescriptionKey: "missing: no such folder"]) }
        var stale = false
        let url = try URL(resolvingBookmarkData: data, options: [], relativeTo: nil, bookmarkDataIsStale: &stale)
        if stale, let fresh = try? url.bookmarkData(options: [], includingResourceValuesForKeys: nil, relativeTo: nil) { var all = bookmarks(); all[id] = fresh; defaults.set(all, forKey: bookmarksKey) }
        guard url.startAccessingSecurityScopedResource() else { throw NSError(domain: "Folder", code: 403, userInfo: [NSLocalizedDescriptionKey: "denied: the folder is not shared with you any more"]) }
        return url
    }

    // ---- picking a folder, or where to make one ----
    @objc func pick(_ call: CAPPluginCall) { present(call, mode: "pick") }
    @objc func create(_ call: CAPPluginCall) { present(call, mode: "create:" + (call.getString("name") ?? "Little Log")) }
    private func present(_ call: CAPPluginCall, mode: String) {
        DispatchQueue.main.async {
            guard let host = self.bridge?.viewController else { call.reject("No screen"); return }
            let vc = UIDocumentPickerViewController(forOpeningContentTypes: [UTType.folder], asCopy: false)
            vc.delegate = self; vc.allowsMultipleSelection = false
            vc.directoryURL = FileManager.default.url(forUbiquityContainerIdentifier: nil)   // (opens in iCloud Drive when there is one; the user may go anywhere)
            self.picking = call; self.pickFor = mode
            host.present(vc, animated: true)
        }
    }
    public func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let call = picking, let url = urls.first else { picking?.resolve([:]); picking = nil; return }
        picking = nil
        let mode = pickFor ?? "pick"
        io.async {
            do {
                guard url.startAccessingSecurityScopedResource() else { throw NSError(domain: "Folder", code: 403, userInfo: [NSLocalizedDescriptionKey: "denied: no access to that folder"]) }
                defer { url.stopAccessingSecurityScopedResource() }
                if mode == "pick" { let id = try self.keep(url); call.resolve(["id": id, "name": url.lastPathComponent]); return }
                let base = String(mode.dropFirst("create:".count)); var name = base, n = 1
                var dir = url.appendingPathComponent(name, isDirectory: true)
                while FileManager.default.fileExists(atPath: dir.path) { n += 1; name = "\(base) \(n)"; dir = url.appendingPathComponent(name, isDirectory: true) }
                var err: NSError?
                NSFileCoordinator().coordinate(writingItemAt: dir, options: [], error: &err) { u in try? FileManager.default.createDirectory(at: u, withIntermediateDirectories: true) }
                if let e = err { throw e }
                let id = try self.keep(dir); call.resolve(["id": id, "name": name])
            } catch { call.reject(error.localizedDescription) }
        }
    }
    public func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) { picking?.resolve([:]); picking = nil }

    // ---- the files ----
    private func rev(_ url: URL) -> String {
        let v = try? url.resourceValues(forKeys: [.contentModificationDateKey, .fileSizeKey])
        return "\(Int((v?.contentModificationDate ?? Date(timeIntervalSince1970: 0)).timeIntervalSince1970 * 1000)):\(v?.fileSize ?? 0)"
    }
    @objc func list(_ call: CAPPluginCall) {
        io.async {
            do {
                let root = try self.folder(call.getString("id") ?? ""); defer { root.stopAccessingSecurityScopedResource() }
                var entries: [[String: Any]] = []
                let keys: [URLResourceKey] = [.isDirectoryKey, .contentModificationDateKey, .fileSizeKey, .nameKey]
                var err: NSError?
                NSFileCoordinator().coordinate(readingItemAt: root, options: [], error: &err) { u in
                    guard let en = FileManager.default.enumerator(at: u, includingPropertiesForKeys: keys, options: [.skipsHiddenFiles]) else { return }
                    let base = u.standardizedFileURL.path
                    for case let f as URL in en {
                        let v = try? f.resourceValues(forKeys: Set(keys))
                        var p = f.standardizedFileURL.path; if p.hasPrefix(base) { p = String(p.dropFirst(base.count)) }
                        p = p.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
                        if p.isEmpty { continue }
                        if p.hasSuffix(".icloud") && p.contains("/.") { continue }   // (a placeholder's hidden name: the item is listed under its own)
                        let dir = v?.isDirectory ?? false
                        entries.append(["path": p, "rev": dir ? "" : self.rev(f), "folder": dir])
                    }
                }
                if let e = err { throw e }
                call.resolve(["entries": entries])
            } catch { call.reject(error.localizedDescription) }
        }
    }
    @objc func read(_ call: CAPPluginCall) {
        io.async {
            do {
                let root = try self.folder(call.getString("id") ?? ""); defer { root.stopAccessingSecurityScopedResource() }
                let url = root.appendingPathComponent(call.getString("path") ?? "")
                var err: NSError?; var data: Data?
                NSFileCoordinator().coordinate(readingItemAt: url, options: [], error: &err) { u in data = try? Data(contentsOf: u) }   // (coordinating a read downloads an iCloud item that is not on the device yet)
                if let e = err, (e as NSError).code != NSFileReadNoSuchFileError { throw e }
                call.resolve(["data": data?.base64EncodedString() ?? NSNull()])
            } catch { call.reject(error.localizedDescription) }
        }
    }
    @objc func write(_ call: CAPPluginCall) {
        io.async {
            do {
                let root = try self.folder(call.getString("id") ?? ""); defer { root.stopAccessingSecurityScopedResource() }
                let url = root.appendingPathComponent(call.getString("path") ?? ""), mode = call.getString("mode") ?? "overwrite"
                guard let data = Data(base64Encoded: call.getString("data") ?? "") else { throw NSError(domain: "Folder", code: 400, userInfo: [NSLocalizedDescriptionKey: "bad data"]) }
                let exists = FileManager.default.fileExists(atPath: url.path)
                if mode == "add" && exists { throw NSError(domain: "Folder", code: 409, userInfo: [NSLocalizedDescriptionKey: "conflict: the file exists"]) }
                if mode == "update" && (!exists || self.rev(url) != (call.getString("rev") ?? "")) { throw NSError(domain: "Folder", code: 409, userInfo: [NSLocalizedDescriptionKey: "conflict: the file changed"]) }
                try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
                var err: NSError?; var werr: Error?
                NSFileCoordinator().coordinate(writingItemAt: url, options: [.forReplacing], error: &err) { u in do { try data.write(to: u, options: [.atomic]) } catch { werr = error } }
                if let e = err { throw e }; if let e = werr { throw e }
                call.resolve(["rev": self.rev(url)])
            } catch { call.reject(error.localizedDescription) }
        }
    }
    @objc func remove(_ call: CAPPluginCall) {
        io.async {
            do {
                let root = try self.folder(call.getString("id") ?? ""); defer { root.stopAccessingSecurityScopedResource() }
                let url = root.appendingPathComponent(call.getString("path") ?? "")
                guard FileManager.default.fileExists(atPath: url.path) else { call.resolve([:]); return }
                var err: NSError?
                NSFileCoordinator().coordinate(writingItemAt: url, options: [.forDeleting], error: &err) { u in try? FileManager.default.removeItem(at: u) }
                if let e = err { throw e }
                call.resolve([:])
            } catch { call.reject(error.localizedDescription) }
        }
    }
    /// The Files app's own sharing of the folder: the share sheet offers Collaborate for an iCloud Drive item, where people are added by Apple ID.
    @objc func share(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            do {
                let url = try self.folder(call.getString("id") ?? "")
                guard let host = self.bridge?.viewController else { url.stopAccessingSecurityScopedResource(); call.reject("No screen"); return }
                let vc = UIActivityViewController(activityItems: [url], applicationActivities: nil)
                vc.completionWithItemsHandler = { _, _, _, _ in url.stopAccessingSecurityScopedResource(); call.resolve([:]) }
                if let pop = vc.popoverPresentationController { pop.sourceView = host.view; pop.sourceRect = CGRect(x: host.view.bounds.midX, y: host.view.bounds.midY, width: 1, height: 1) }
                host.present(vc, animated: true)
            } catch { call.reject(error.localizedDescription) }
        }
    }
    @objc func forget(_ call: CAPPluginCall) {
        var all = bookmarks(); all.removeValue(forKey: call.getString("id") ?? ""); defaults.set(all, forKey: bookmarksKey)
        call.resolve([:])
    }
}
