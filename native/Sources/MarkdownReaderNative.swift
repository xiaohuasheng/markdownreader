import Cocoa
import UniformTypeIdentifiers
import WebKit

private let markdownExtensions: Set<String> = ["md", "markdown"]

private final class FileNode: NSObject {
    let url: URL
    let name: String
    let isDirectory: Bool
    var children: [FileNode]

    init(url: URL, isDirectory: Bool, children: [FileNode] = []) {
        self.url = url
        self.name = url.lastPathComponent
        self.isDirectory = isDirectory
        self.children = children
    }
}

private enum ViewMode: Int {
    case preview = 0
    case edit = 1
}

@main
final class AppDelegate: NSObject, NSApplicationDelegate, NSOutlineViewDataSource, NSOutlineViewDelegate {
    private var window: NSWindow!
    private var outlineView: NSOutlineView!
    private var sidebarHeader: NSTextField!
    private var editorScrollView: NSScrollView!
    private var editor: NSTextView!
    private var preview: WKWebView!
    private var titleLabel: NSTextField!
    private var pathLabel: NSTextField!
    private var modeControl: NSSegmentedControl!
    private var statusLabel: NSTextField!

    private var rootNodes: [FileNode] = []
    private var currentFileURL: URL?
    private var currentFolderURL: URL?
    private var currentMode: ViewMode = .preview

    func applicationDidFinishLaunching(_ notification: Notification) {
        buildMenu()
        buildWindow()
        showWelcome()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    @objc private func openFileFromMenu() {
        let panel = NSOpenPanel()
        panel.title = "Open Markdown File"
        panel.allowedContentTypes = markdownExtensions.compactMap { UTType(filenameExtension: $0) }
        panel.canChooseDirectories = false
        panel.canChooseFiles = true
        panel.allowsMultipleSelection = false

        if panel.runModal() == .OK, let url = panel.url {
            currentFolderURL = nil
            rootNodes = []
            outlineView.reloadData()
            openFile(url)
        }
    }

    @objc private func openFolderFromMenu() {
        let panel = NSOpenPanel()
        panel.title = "Open Markdown Folder"
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.allowsMultipleSelection = false

        if panel.runModal() == .OK, let url = panel.url {
            openFolder(url)
        }
    }

    @objc private func saveCurrentFile() {
        guard let url = currentFileURL else {
            setStatus("No file selected.")
            return
        }

        do {
            try editor.string.write(to: url, atomically: true, encoding: .utf8)
            setStatus("Saved")
            currentMode = .preview
            modeControl.selectedSegment = ViewMode.preview.rawValue
            renderPreview(markdown: editor.string, baseURL: url.deletingLastPathComponent())
            updateModeVisibility()
        } catch {
            setStatus("Unable to save: \(error.localizedDescription)")
        }
    }

    @objc private func modeChanged() {
        currentMode = ViewMode(rawValue: modeControl.selectedSegment) ?? .preview
        if currentMode == .preview, let url = currentFileURL {
            renderPreview(markdown: editor.string, baseURL: url.deletingLastPathComponent())
        }
        updateModeVisibility()
    }

    private func buildMenu() {
        let mainMenu = NSMenu()
        let appMenuItem = NSMenuItem()
        let fileMenuItem = NSMenuItem()
        mainMenu.addItem(appMenuItem)
        mainMenu.addItem(fileMenuItem)

        let appMenu = NSMenu()
        appMenu.addItem(NSMenuItem(title: "Quit Markdown Reader Native", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))
        appMenuItem.submenu = appMenu

        let fileMenu = NSMenu(title: "File")
        fileMenu.addItem(NSMenuItem(title: "Open File", action: #selector(openFileFromMenu), keyEquivalent: "o"))
        let openFolderItem = NSMenuItem(title: "Open Folder", action: #selector(openFolderFromMenu), keyEquivalent: "O")
        openFolderItem.keyEquivalentModifierMask = [.command, .shift]
        fileMenu.addItem(openFolderItem)
        fileMenu.addItem(NSMenuItem.separator())
        fileMenu.addItem(NSMenuItem(title: "Save", action: #selector(saveCurrentFile), keyEquivalent: "s"))
        fileMenuItem.submenu = fileMenu

        NSApp.mainMenu = mainMenu
    }

    private func buildWindow() {
        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1120, height: 780),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "Markdown Reader Native"
        window.center()

        let splitView = NSSplitView()
        splitView.isVertical = true
        splitView.dividerStyle = .thin
        splitView.translatesAutoresizingMaskIntoConstraints = false

        let sidebar = buildSidebar()
        let content = buildContent()
        splitView.addArrangedSubview(sidebar)
        splitView.addArrangedSubview(content)

        window.contentView = splitView
        sidebar.widthAnchor.constraint(equalToConstant: 280).isActive = true
        window.makeKeyAndOrderFront(nil)
    }

    private func buildSidebar() -> NSView {
        let container = NSView()
        container.translatesAutoresizingMaskIntoConstraints = false

        let openFolderButton = NSButton(title: "Open Folder", target: self, action: #selector(openFolderFromMenu))
        openFolderButton.bezelStyle = .rounded
        openFolderButton.translatesAutoresizingMaskIntoConstraints = false

        let openFileButton = NSButton(title: "Open File", target: self, action: #selector(openFileFromMenu))
        openFileButton.bezelStyle = .rounded
        openFileButton.translatesAutoresizingMaskIntoConstraints = false

        sidebarHeader = NSTextField(labelWithString: "No folder open")
        sidebarHeader.font = .systemFont(ofSize: 13, weight: .semibold)
        sidebarHeader.textColor = .secondaryLabelColor
        sidebarHeader.lineBreakMode = .byTruncatingMiddle
        sidebarHeader.translatesAutoresizingMaskIntoConstraints = false

        outlineView = NSOutlineView()
        outlineView.headerView = nil
        outlineView.rowSizeStyle = .medium
        outlineView.dataSource = self
        outlineView.delegate = self
        outlineView.target = self
        outlineView.action = #selector(outlineSelectionChanged)

        let column = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("file"))
        column.title = "Files"
        outlineView.addTableColumn(column)
        outlineView.outlineTableColumn = column

        let scrollView = NSScrollView()
        scrollView.documentView = outlineView
        scrollView.hasVerticalScroller = true
        scrollView.drawsBackground = false
        scrollView.translatesAutoresizingMaskIntoConstraints = false

        container.addSubview(openFolderButton)
        container.addSubview(openFileButton)
        container.addSubview(sidebarHeader)
        container.addSubview(scrollView)

        NSLayoutConstraint.activate([
            openFolderButton.topAnchor.constraint(equalTo: container.topAnchor, constant: 14),
            openFolderButton.leadingAnchor.constraint(equalTo: container.leadingAnchor, constant: 14),

            openFileButton.centerYAnchor.constraint(equalTo: openFolderButton.centerYAnchor),
            openFileButton.leadingAnchor.constraint(equalTo: openFolderButton.trailingAnchor, constant: 8),
            openFileButton.trailingAnchor.constraint(lessThanOrEqualTo: container.trailingAnchor, constant: -14),

            sidebarHeader.topAnchor.constraint(equalTo: openFolderButton.bottomAnchor, constant: 14),
            sidebarHeader.leadingAnchor.constraint(equalTo: container.leadingAnchor, constant: 14),
            sidebarHeader.trailingAnchor.constraint(equalTo: container.trailingAnchor, constant: -14),

            scrollView.topAnchor.constraint(equalTo: sidebarHeader.bottomAnchor, constant: 10),
            scrollView.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            scrollView.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            scrollView.bottomAnchor.constraint(equalTo: container.bottomAnchor)
        ])

        return container
    }

    private func buildContent() -> NSView {
        let container = NSView()
        container.translatesAutoresizingMaskIntoConstraints = false

        pathLabel = NSTextField(labelWithString: "")
        pathLabel.font = .systemFont(ofSize: 12)
        pathLabel.textColor = .secondaryLabelColor
        pathLabel.lineBreakMode = .byTruncatingMiddle
        pathLabel.translatesAutoresizingMaskIntoConstraints = false

        titleLabel = NSTextField(labelWithString: "Markdown Reader Native")
        titleLabel.font = .systemFont(ofSize: 24, weight: .bold)
        titleLabel.translatesAutoresizingMaskIntoConstraints = false

        modeControl = NSSegmentedControl(labels: ["Preview", "Edit"], trackingMode: .selectOne, target: self, action: #selector(modeChanged))
        modeControl.selectedSegment = ViewMode.preview.rawValue
        modeControl.translatesAutoresizingMaskIntoConstraints = false

        let saveButton = NSButton(title: "Save", target: self, action: #selector(saveCurrentFile))
        saveButton.bezelStyle = .rounded
        saveButton.translatesAutoresizingMaskIntoConstraints = false

        statusLabel = NSTextField(labelWithString: "")
        statusLabel.font = .systemFont(ofSize: 12)
        statusLabel.textColor = .secondaryLabelColor
        statusLabel.translatesAutoresizingMaskIntoConstraints = false

        editor = NSTextView()
        editor.font = .monospacedSystemFont(ofSize: 15, weight: .regular)
        editor.isAutomaticQuoteSubstitutionEnabled = false
        editor.isAutomaticDashSubstitutionEnabled = false
        editor.allowsUndo = true

        editorScrollView = NSScrollView()
        editorScrollView.documentView = editor
        editorScrollView.hasVerticalScroller = true
        editorScrollView.hasHorizontalScroller = true
        editorScrollView.borderType = .bezelBorder
        editorScrollView.translatesAutoresizingMaskIntoConstraints = false

        preview = WKWebView()
        preview.translatesAutoresizingMaskIntoConstraints = false

        container.addSubview(pathLabel)
        container.addSubview(titleLabel)
        container.addSubview(modeControl)
        container.addSubview(saveButton)
        container.addSubview(statusLabel)
        container.addSubview(editorScrollView)
        container.addSubview(preview)

        NSLayoutConstraint.activate([
            pathLabel.topAnchor.constraint(equalTo: container.topAnchor, constant: 18),
            pathLabel.leadingAnchor.constraint(equalTo: container.leadingAnchor, constant: 28),
            pathLabel.trailingAnchor.constraint(equalTo: modeControl.leadingAnchor, constant: -16),

            titleLabel.topAnchor.constraint(equalTo: pathLabel.bottomAnchor, constant: 5),
            titleLabel.leadingAnchor.constraint(equalTo: pathLabel.leadingAnchor),
            titleLabel.trailingAnchor.constraint(equalTo: pathLabel.trailingAnchor),

            modeControl.topAnchor.constraint(equalTo: container.topAnchor, constant: 22),
            modeControl.trailingAnchor.constraint(equalTo: saveButton.leadingAnchor, constant: -10),
            modeControl.widthAnchor.constraint(equalToConstant: 160),

            saveButton.centerYAnchor.constraint(equalTo: modeControl.centerYAnchor),
            saveButton.trailingAnchor.constraint(equalTo: container.trailingAnchor, constant: -28),

            statusLabel.topAnchor.constraint(equalTo: titleLabel.bottomAnchor, constant: 8),
            statusLabel.leadingAnchor.constraint(equalTo: titleLabel.leadingAnchor),
            statusLabel.trailingAnchor.constraint(equalTo: container.trailingAnchor, constant: -28),

            editorScrollView.topAnchor.constraint(equalTo: statusLabel.bottomAnchor, constant: 16),
            editorScrollView.leadingAnchor.constraint(equalTo: container.leadingAnchor, constant: 28),
            editorScrollView.trailingAnchor.constraint(equalTo: container.trailingAnchor, constant: -28),
            editorScrollView.bottomAnchor.constraint(equalTo: container.bottomAnchor, constant: -24),

            preview.topAnchor.constraint(equalTo: editorScrollView.topAnchor),
            preview.leadingAnchor.constraint(equalTo: editorScrollView.leadingAnchor),
            preview.trailingAnchor.constraint(equalTo: editorScrollView.trailingAnchor),
            preview.bottomAnchor.constraint(equalTo: editorScrollView.bottomAnchor)
        ])

        updateModeVisibility()
        return container
    }

    private func showWelcome() {
        titleLabel.stringValue = "Open a Markdown file or folder"
        pathLabel.stringValue = ""
        editor.string = ""
        preview.loadHTMLString(welcomeHTML(), baseURL: nil)
        setStatus("Use Open Folder to browse Markdown files in a native, lightweight app.")
        updateModeVisibility()
    }

    private func openFolder(_ url: URL) {
        currentFolderURL = url
        rootNodes = scanFolder(url)
        sidebarHeader.stringValue = url.lastPathComponent
        outlineView.reloadData()
        expandAll(nodes: rootNodes)
        currentFileURL = nil
        titleLabel.stringValue = "Select a Markdown file"
        pathLabel.stringValue = url.path
        editor.string = ""
        preview.loadHTMLString(welcomeHTML(), baseURL: url)
        setStatus(rootNodes.isEmpty ? "No Markdown files found." : "Folder opened.")
    }

    private func openFile(_ url: URL) {
        do {
            let text = try String(contentsOf: url, encoding: .utf8)
            currentFileURL = url
            editor.string = text
            titleLabel.stringValue = url.lastPathComponent
            pathLabel.stringValue = url.path
            window.title = "\(url.lastPathComponent) - Markdown Reader Native"
            setStatus("")
            currentMode = .preview
            modeControl.selectedSegment = ViewMode.preview.rawValue
            renderPreview(markdown: text, baseURL: url.deletingLastPathComponent())
            updateModeVisibility()
        } catch {
            setStatus("Unable to open: \(error.localizedDescription)")
        }
    }

    private func scanFolder(_ url: URL) -> [FileNode] {
        let resourceKeys: [URLResourceKey] = [.isDirectoryKey, .isRegularFileKey]
        guard let enumerator = FileManager.default.enumerator(
            at: url,
            includingPropertiesForKeys: resourceKeys,
            options: [.skipsHiddenFiles, .skipsPackageDescendants]
        ) else {
            return []
        }

        var directories: [URL: FileNode] = [url: FileNode(url: url, isDirectory: true)]

        for case let itemURL as URL in enumerator {
            if itemURL.lastPathComponent == "node_modules" || itemURL.lastPathComponent == ".git" {
                enumerator.skipDescendants()
                continue
            }

            let values = try? itemURL.resourceValues(forKeys: Set(resourceKeys))
            if values?.isDirectory == true {
                directories[itemURL] = FileNode(url: itemURL, isDirectory: true)
                continue
            }

            if values?.isRegularFile == true && markdownExtensions.contains(itemURL.pathExtension.lowercased()) {
                let fileNode = FileNode(url: itemURL, isDirectory: false)
                var parentURL = itemURL.deletingLastPathComponent()
                var child: FileNode = fileNode

                while parentURL != url {
                    let directoryNode = directories[parentURL] ?? FileNode(url: parentURL, isDirectory: true)
                    directories[parentURL] = directoryNode
                    if !directoryNode.children.contains(where: { $0.url == child.url }) {
                        directoryNode.children.append(child)
                    }
                    child = directoryNode
                    parentURL.deleteLastPathComponent()
                }

                if !directories[url]!.children.contains(where: { $0.url == child.url }) {
                    directories[url]!.children.append(child)
                }
            }
        }

        // Keep the folder tree stable and native-feeling: directories first, then files,
        // with localized sorting applied recursively to every nested folder.
        sortTree(&directories[url]!.children)
        return directories[url]!.children
    }

    private func sortTree(_ nodes: inout [FileNode]) {
        nodes.sort(by: compareNodes)
        for node in nodes where node.isDirectory {
            sortTree(&node.children)
        }
    }

    private func compareNodes(_ left: FileNode, _ right: FileNode) -> Bool {
        if left.isDirectory != right.isDirectory {
            return left.isDirectory
        }
        return left.name.localizedStandardCompare(right.name) == .orderedAscending
    }

    private func expandAll(nodes: [FileNode]) {
        for node in nodes where node.isDirectory {
            outlineView.expandItem(node)
            expandAll(nodes: node.children)
        }
    }

    @objc private func outlineSelectionChanged() {
        let selectedRow = outlineView.selectedRow
        guard selectedRow >= 0, let node = outlineView.item(atRow: selectedRow) as? FileNode, !node.isDirectory else {
            return
        }
        openFile(node.url)
    }

    func outlineView(_ outlineView: NSOutlineView, numberOfChildrenOfItem item: Any?) -> Int {
        if let node = item as? FileNode {
            return node.children.count
        }
        return rootNodes.count
    }

    func outlineView(_ outlineView: NSOutlineView, child index: Int, ofItem item: Any?) -> Any {
        if let node = item as? FileNode {
            return node.children[index]
        }
        return rootNodes[index]
    }

    func outlineView(_ outlineView: NSOutlineView, isItemExpandable item: Any) -> Bool {
        (item as? FileNode)?.isDirectory == true
    }

    func outlineView(_ outlineView: NSOutlineView, viewFor tableColumn: NSTableColumn?, item: Any) -> NSView? {
        guard let node = item as? FileNode else {
            return nil
        }

        let identifier = NSUserInterfaceItemIdentifier("FileCell")
        let cell = outlineView.makeView(withIdentifier: identifier, owner: self) as? NSTableCellView ?? NSTableCellView()
        cell.identifier = identifier

        if cell.textField == nil {
            let textField = NSTextField(labelWithString: "")
            textField.translatesAutoresizingMaskIntoConstraints = false
            cell.addSubview(textField)
            cell.textField = textField
            NSLayoutConstraint.activate([
                textField.leadingAnchor.constraint(equalTo: cell.leadingAnchor, constant: 2),
                textField.trailingAnchor.constraint(equalTo: cell.trailingAnchor, constant: -2),
                textField.centerYAnchor.constraint(equalTo: cell.centerYAnchor)
            ])
        }

        cell.textField?.stringValue = node.isDirectory ? "▸ \(node.name)" : node.name
        cell.textField?.font = node.isDirectory ? .systemFont(ofSize: 13, weight: .semibold) : .systemFont(ofSize: 13)
        return cell
    }

    private func updateModeVisibility() {
        let showingEdit = currentMode == .edit
        editorScrollView.isHidden = !showingEdit
        preview.isHidden = showingEdit
    }

    private func setStatus(_ text: String) {
        statusLabel.stringValue = text
    }

    private func renderPreview(markdown: String, baseURL: URL) {
        preview.loadHTMLString(markdownHTML(markdown), baseURL: baseURL)
    }

    private func markdownHTML(_ markdown: String) -> String {
        let body = MarkdownRenderer.render(markdown)
        return """
        <!doctype html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { max-width: 860px; margin: 0 auto; padding: 34px 28px 80px; color: #292521; font: 18px/1.72 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #fbfaf8; }
            h1, h2, h3 { line-height: 1.22; color: #1f1c19; }
            h1 { font-size: 2.25rem; }
            h2 { border-bottom: 1px solid rgba(57,50,43,.14); padding-bottom: .25em; }
            code { border-radius: 5px; padding: .18em .36em; background: #efeae3; color: #5f3f2b; font-family: ui-monospace, Menlo, monospace; font-size: .9em; }
            pre { overflow: auto; border: 1px solid rgba(57,50,43,.12); border-radius: 8px; padding: 16px 18px; background: #f4f1ec; }
            pre code { padding: 0; background: transparent; color: inherit; }
            blockquote { margin-left: 0; padding-left: 1.1em; border-left: 4px solid #8aa8a0; color: #5f544c; }
            table { border-collapse: collapse; width: 100%; margin: 1.1em 0; }
            th, td { border: 1px solid rgba(57,50,43,.16); padding: 8px 11px; }
            th { background: #f1ece5; }
            a { color: #1f6e8a; }
            img { max-width: 100%; height: auto; }
            li + li { margin-top: .28em; }
          </style>
        </head>
        <body>\(body)</body>
        </html>
        """
    }

    private func welcomeHTML() -> String {
        """
        <!doctype html>
        <html><body style="font: 17px -apple-system; color: #6b5f56; background: #fbfaf8; display: grid; place-items: center; min-height: 100vh; margin: 0;">
        <div style="text-align:center;">
          <h1 style="color:#25211d;">Markdown Reader Native</h1>
          <p>Open a folder, then select a Markdown file from the sidebar.</p>
        </div>
        </body></html>
        """
    }
}

private enum MarkdownRenderer {
    static func render(_ source: String) -> String {
        let lines = source.replacingOccurrences(of: "\r\n", with: "\n").split(separator: "\n", omittingEmptySubsequences: false).map(String.init)
        var html: [String] = []
        var index = 0
        var inList = false

        func closeListIfNeeded() {
            if inList {
                html.append("</ul>")
                inList = false
            }
        }

        while index < lines.count {
            let line = lines[index]
            let trimmed = line.trimmingCharacters(in: .whitespaces)

            if trimmed.isEmpty {
                closeListIfNeeded()
                index += 1
                continue
            }

            if trimmed.hasPrefix("```") {
                closeListIfNeeded()
                var code: [String] = []
                index += 1
                while index < lines.count && !lines[index].trimmingCharacters(in: .whitespaces).hasPrefix("```") {
                    code.append(lines[index])
                    index += 1
                }
                if index < lines.count { index += 1 }
                html.append("<pre><code>\(escape(code.joined(separator: "\n")))</code></pre>")
                continue
            }

            if isTableStart(lines, index) {
                closeListIfNeeded()
                let table = parseTable(lines, &index)
                html.append(table)
                continue
            }

            if let heading = headingHTML(trimmed) {
                closeListIfNeeded()
                html.append(heading)
                index += 1
                continue
            }

            if trimmed.hasPrefix(">") {
                closeListIfNeeded()
                let quote = trimmed.dropFirst().trimmingCharacters(in: .whitespaces)
                html.append("<blockquote>\(inline(String(quote)))</blockquote>")
                index += 1
                continue
            }

            if let listItem = unorderedListItem(trimmed) {
                if !inList {
                    html.append("<ul>")
                    inList = true
                }
                html.append("<li>\(listItem)</li>")
                index += 1
                continue
            }

            closeListIfNeeded()
            var paragraph = [trimmed]
            index += 1
            while index < lines.count {
                let next = lines[index].trimmingCharacters(in: .whitespaces)
                if next.isEmpty || next.hasPrefix("#") || next.hasPrefix(">") || next.hasPrefix("- ") || next.hasPrefix("* ") || next.hasPrefix("```") || isTableStart(lines, index) {
                    break
                }
                paragraph.append(next)
                index += 1
            }
            html.append("<p>\(inline(paragraph.joined(separator: " ")))</p>")
        }

        closeListIfNeeded()
        return html.joined(separator: "\n")
    }

    private static func headingHTML(_ line: String) -> String? {
        let count = line.prefix(while: { $0 == "#" }).count
        guard count >= 1, count <= 6, line.dropFirst(count).first == " " else {
            return nil
        }
        let text = line.dropFirst(count).trimmingCharacters(in: .whitespaces)
        return "<h\(count)>\(inline(text))</h\(count)>"
    }

    private static func unorderedListItem(_ line: String) -> String? {
        guard line.hasPrefix("- ") || line.hasPrefix("* ") else {
            return nil
        }

        var text = String(line.dropFirst(2))
        if text.hasPrefix("[x] ") || text.hasPrefix("[X] ") {
            text = String(text.dropFirst(4))
            return "<input type=\"checkbox\" checked disabled> \(inline(text))"
        }
        if text.hasPrefix("[ ] ") {
            text = String(text.dropFirst(4))
            return "<input type=\"checkbox\" disabled> \(inline(text))"
        }
        return inline(text)
    }

    private static func isTableStart(_ lines: [String], _ index: Int) -> Bool {
        guard index + 1 < lines.count else { return false }
        return lines[index].contains("|") && lines[index + 1].contains("|") && lines[index + 1].contains("-")
    }

    private static func parseTable(_ lines: [String], _ index: inout Int) -> String {
        let headers = tableCells(lines[index])
        index += 2
        var rows: [[String]] = []
        while index < lines.count, lines[index].contains("|"), !lines[index].trimmingCharacters(in: .whitespaces).isEmpty {
            rows.append(tableCells(lines[index]))
            index += 1
        }

        let head = headers.map { "<th>\(inline($0))</th>" }.joined()
        let body = rows.map { row in
            "<tr>\(row.map { "<td>\(inline($0))</td>" }.joined())</tr>"
        }.joined()
        return "<table><thead><tr>\(head)</tr></thead><tbody>\(body)</tbody></table>"
    }

    private static func tableCells(_ line: String) -> [String] {
        var value = line.trimmingCharacters(in: .whitespaces)
        if value.hasPrefix("|") { value.removeFirst() }
        if value.hasSuffix("|") { value.removeLast() }
        return value.split(separator: "|", omittingEmptySubsequences: false).map { String($0).trimmingCharacters(in: .whitespaces) }
    }

    private static func inline(_ text: String) -> String {
        var output = escape(text)
        output = replaceRegex(output, pattern: "`([^`]+)`", template: "<code>$1</code>")
        output = replaceRegex(output, pattern: "\\*\\*([^*]+)\\*\\*", template: "<strong>$1</strong>")
        output = replaceRegex(output, pattern: "~~([^~]+)~~", template: "<del>$1</del>")
        output = replaceRegex(output, pattern: "\\[([^\\]]+)\\]\\(([^\\)]+)\\)", template: "<a href=\"$2\">$1</a>")
        return output
    }

    private static func replaceRegex(_ text: String, pattern: String, template: String) -> String {
        guard let regex = try? NSRegularExpression(pattern: pattern) else {
            return text
        }
        let range = NSRange(text.startIndex..<text.endIndex, in: text)
        return regex.stringByReplacingMatches(in: text, range: range, withTemplate: template)
    }

    private static func escape(_ text: String) -> String {
        text
            .replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
            .replacingOccurrences(of: "\"", with: "&quot;")
    }
}
